const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_MODE = 'verify_and_fallback';
const DEFAULT_MAX_VERIFICATIONS = 2;
const DEFAULT_CONTEXT_LINES = 30;
const DEFAULT_MAX_EXCERPT_LINES = 180;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function modeAllows(mode, action) {
  const normalized = normalizeToken(mode || DEFAULT_MODE);
  if (normalized === 'off' || normalized === 'disabled') return false;
  if (normalized === 'fallback') return action === 'fallback';
  if (normalized === 'verify') return action === 'verify';
  return true;
}

function isIncomplete(result) {
  return Boolean(result?.incomplete || result?.scan_status === 'incomplete');
}

function isPriorityFinding(finding, severities) {
  const severity = normalizeToken(finding?.severity);
  const confidence = normalizeToken(finding?.confidence);
  return severities.has(severity) || confidence === 'thap' || confidence === 'low';
}

function buildExcerpt(code, finding, contextLines, maxExcerptLines) {
  const lines = String(code || '').split('\n');
  const total = lines.length;
  const findingStart = Math.max(1, Number.parseInt(finding?.start_line ?? finding?.line_number, 10) || 1);
  const findingEnd = Math.max(findingStart, Number.parseInt(finding?.end_line, 10) || findingStart);
  let start = Math.max(1, findingStart - contextLines);
  let end = Math.min(total, findingEnd + contextLines);

  if ((end - start + 1) > maxExcerptLines) {
    const center = Math.floor((findingStart + findingEnd) / 2);
    const half = Math.floor(maxExcerptLines / 2);
    start = Math.max(1, center - half);
    end = Math.min(total, start + maxExcerptLines - 1);
    start = Math.max(1, end - maxExcerptLines + 1);
  }

  return {
    code: lines.slice(start - 1, end).join('\n'),
    startLine: start,
    endLine: end
  };
}

function findingMatches(primary, candidate) {
  const primaryCwe = normalizeToken(primary?.cwe);
  const candidateCwe = normalizeToken(candidate?.cwe);
  if (primaryCwe && candidateCwe && primaryCwe !== 'cwe-other' && primaryCwe === candidateCwe) return true;

  const primaryType = normalizeToken(primary?.type);
  const candidateType = normalizeToken(candidate?.type);
  if (!primaryType || !candidateType) return false;
  return primaryType === candidateType || primaryType.includes(candidateType) || candidateType.includes(primaryType);
}

export class GeminiAssistant {
  constructor(scanFn, options = {}) {
    if (typeof scanFn !== 'function') throw new TypeError('GeminiAssistant cần scanFn hợp lệ.');
    this.scanFn = scanFn;
    this.options = options;
  }

  getConfig() {
    const apiKey = normalizeText(this.options.apiKey ?? process.env.GEMINI_API_KEY);
    const model = normalizeText(this.options.model ?? process.env.GEMINI_ASSISTANT_MODEL) || DEFAULT_MODEL;
    const mode = normalizeText(this.options.mode ?? process.env.GEMINI_ASSISTANT_MODE) || DEFAULT_MODE;
    const maxVerifications = positiveInt(
      this.options.maxVerifications ?? process.env.GEMINI_ASSISTANT_MAX_VERIFICATIONS,
      DEFAULT_MAX_VERIFICATIONS
    );
    const contextLines = positiveInt(
      this.options.contextLines ?? process.env.GEMINI_ASSISTANT_CONTEXT_LINES,
      DEFAULT_CONTEXT_LINES
    );
    const maxExcerptLines = positiveInt(
      this.options.maxExcerptLines ?? process.env.GEMINI_ASSISTANT_MAX_EXCERPT_LINES,
      DEFAULT_MAX_EXCERPT_LINES
    );
    const rawSeverities = normalizeText(
      this.options.verifySeverities ?? process.env.GEMINI_ASSISTANT_VERIFY_SEVERITIES
    ) || 'Nghiêm trọng,Cao,Critical,High';
    const severities = new Set(rawSeverities.split(',').map(normalizeToken).filter(Boolean));

    return { apiKey, model, mode, maxVerifications, contextLines, maxExcerptLines, severities };
  }

  async scanWithGemini(code, language, config) {
    return this.scanFn(code, language || 'auto', {
      apiKey: config.apiKey,
      provider: 'gemini',
      model: config.model,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }

  async enhance(primaryResult, code, language = 'auto') {
    const config = this.getConfig();
    if (!config.apiKey || normalizeToken(config.mode) === 'off') return primaryResult;

    if (isIncomplete(primaryResult) && modeAllows(config.mode, 'fallback')) {
      try {
        const fallback = await this.scanWithGemini(code, language, config);
        if (!isIncomplete(fallback)) {
          return {
            ...fallback,
            primary_engine: 'groq',
            assistant_engine: 'gemini',
            assistant_model: config.model,
            assistant_action: 'fallback',
            gemini_assistant_used: true,
            fallback_recovered: true,
            groq_summary: normalizeText(primaryResult?.overall_summary)
          };
        }

        return {
          ...primaryResult,
          assistant_engine: 'gemini',
          assistant_model: config.model,
          assistant_action: 'fallback_incomplete',
          gemini_assistant_used: true,
          gemini_fallback_summary: normalizeText(fallback?.overall_summary)
        };
      } catch (err) {
        return {
          ...primaryResult,
          assistant_engine: 'gemini',
          assistant_model: config.model,
          assistant_action: 'fallback_error',
          gemini_assistant_used: true,
          gemini_assistant_error: normalizeText(err?.message) || 'Gemini fallback thất bại.'
        };
      }
    }

    if (!modeAllows(config.mode, 'verify')) return primaryResult;
    const vulnerabilities = Array.isArray(primaryResult?.vulnerabilities)
      ? primaryResult.vulnerabilities.map(item => ({ ...item }))
      : [];
    if (vulnerabilities.length === 0) return primaryResult;

    const candidates = vulnerabilities
      .map((finding, index) => ({ finding, index }))
      .filter(({ finding }) => isPriorityFinding(finding, config.severities))
      .slice(0, config.maxVerifications);
    if (candidates.length === 0) return primaryResult;

    let confirmed = 0;
    let checked = 0;
    for (const { finding, index } of candidates) {
      const excerpt = buildExcerpt(code, finding, config.contextLines, config.maxExcerptLines);
      try {
        const verification = await this.scanWithGemini(excerpt.code, language, config);
        checked++;
        const assistantFindings = Array.isArray(verification?.vulnerabilities) ? verification.vulnerabilities : [];
        const exactMatch = assistantFindings.some(candidate => findingMatches(finding, candidate));
        const status = isIncomplete(verification)
          ? 'incomplete'
          : exactMatch
            ? 'confirmed'
            : assistantFindings.length > 0
              ? 'related_finding'
              : 'not_confirmed';
        if (status === 'confirmed') confirmed++;
        vulnerabilities[index] = {
          ...finding,
          verification: {
            engine: 'gemini',
            model: config.model,
            status,
            assistant_findings: assistantFindings.length,
            excerpt_start_line: excerpt.startLine,
            excerpt_end_line: excerpt.endLine
          }
        };
      } catch (err) {
        checked++;
        vulnerabilities[index] = {
          ...finding,
          verification: {
            engine: 'gemini',
            model: config.model,
            status: 'error',
            error: normalizeText(err?.message) || 'Gemini verification thất bại.',
            excerpt_start_line: excerpt.startLine,
            excerpt_end_line: excerpt.endLine
          }
        };
      }
    }

    return {
      ...primaryResult,
      vulnerabilities,
      primary_engine: 'groq',
      assistant_engine: 'gemini',
      assistant_model: config.model,
      assistant_action: 'verify',
      gemini_assistant_used: true,
      assistant_checked_findings: checked,
      assistant_confirmed_findings: confirmed
    };
  }
}

export const GEMINI_ASSISTANT_DEFAULT_MODEL = DEFAULT_MODEL;
