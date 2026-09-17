import { ScannerService as BaseScannerService, DEFAULT_OPENCODE_API_KEY } from './scanner.js';
import { scanSensitiveData } from './sensitive-data-scanner.js';

export { DEFAULT_OPENCODE_API_KEY };

export const SINGLE_REQUEST_MAX_LINES = Number.parseInt(process.env.SCAN_SINGLE_LIMIT || '400', 10);
export const CHUNK_SIZE = Number.parseInt(process.env.SCAN_CHUNK_SIZE || '450', 10);
export const CHUNK_OVERLAP = Number.parseInt(process.env.SCAN_CHUNK_OVERLAP || '50', 10);
export const LARGE_FILE_THRESHOLD = Number.parseInt(process.env.SCAN_LARGE_THRESHOLD || '3000', 10);
export const TARGETED_WINDOW_PADDING = Number.parseInt(process.env.SCAN_TARGET_PADDING || '40', 10);
export const MAX_TARGETED_CHUNKS = Number.parseInt(process.env.SCAN_MAX_TARGETED_CHUNKS || '8', 10);
export const MAX_LARGE_FILE_CHUNKS = Number.parseInt(process.env.SCAN_MAX_LARGE_CHUNKS || '10', 10);
export const COVERAGE_SAMPLE_COUNT = Number.parseInt(process.env.SCAN_COVERAGE_SAMPLES || '3', 10);
export const COVERAGE_SAMPLE_SIZE = Number.parseInt(process.env.SCAN_COVERAGE_SAMPLE_SIZE || '300', 10);
const DEFAULT_RETRIES = 2;
const DEFAULT_MAX_CONCURRENCY = 1;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecommendations(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim());
    else if (item && typeof item === 'object') {
      const text = item.recommendation || item.title || item.desc || item.description || item.text;
      if (typeof text === 'string' && text.trim()) out.push(text.trim());
    }
  }
  return [...new Set(out)];
}

function normalizeVulnerability(vuln) {
  if (!vuln || typeof vuln !== 'object') return null;
  const rawStart = Number.parseInt(vuln.start_line ?? vuln.line_number, 10);
  const startLine = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 1;
  const rawEnd = Number.parseInt(vuln.end_line ?? vuln.start_line ?? vuln.line_number, 10);
  const endLine = Number.isFinite(rawEnd) && rawEnd >= startLine ? rawEnd : startLine;
  return {
    ...vuln,
    type: normalizeText(vuln.type || vuln.title || vuln.name) || 'Security finding',
    severity: normalizeText(vuln.severity || vuln.risk) || 'Trung bình',
    owasp_category: normalizeText(vuln.owasp_category || vuln.owasp),
    cwe: normalizeText(vuln.cwe || vuln.cwe_id) || 'CWE-Other',
    confidence: normalizeText(vuln.confidence) || 'Cao',
    start_line: startLine,
    end_line: endLine,
    line_number: startLine,
    start_column: Number.parseInt(vuln.start_column, 10) > 0 ? Number.parseInt(vuln.start_column, 10) : 1,
    end_column: Number.parseInt(vuln.end_column, 10) > 0 ? Number.parseInt(vuln.end_column, 10) : null,
    affected_lines: normalizeText(vuln.affected_lines || vuln.code || vuln.snippet),
    explanation: normalizeText(vuln.explanation || vuln.description || vuln.reason),
    attack_scenario: normalizeText(vuln.attack_scenario || vuln.exploit || vuln.scenario),
    remediation: normalizeText(vuln.remediation || vuln.fix || vuln.recommendation),
    fixed_code: normalizeText(vuln.fixed_code || vuln.safe_code),
    impact: normalizeText(vuln.impact)
  };
}

function dedupeVulnerabilities(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    const vuln = normalizeVulnerability(raw);
    if (!vuln) continue;
    const key = [
      normalizeText(vuln.file).toLowerCase(),
      vuln.type.toLowerCase(),
      vuln.start_line,
      vuln.end_line,
      vuln.affected_lines.toLowerCase().replace(/\s+/g, ' ').slice(0, 180)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(vuln);
  }
  return out.sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);
}

export function getAiErrorStatus(err) {
  const status = Number(err?.status || err?.statusCode || err?.response?.status || 0);
  if (Number.isFinite(status) && status > 0) return status;
  const msg = String(err?.message || '');
  const match = msg.match(/\b(401|403|404|429)\b/);
  return match ? Number(match[1]) : 0;
}

export function isFatalAiError(err) {
  if (!err) return false;
  const status = getAiErrorStatus(err);
  if ([401, 403, 404, 429].includes(status)) return true;
  const msg = String(err.message || '').toLowerCase();
  return /rate limit|quota|resource_exhausted|unauthorized|invalid[_ ]api[_ ]key|forbidden|permission_denied|model.*not found|endpoint.*not found/.test(msg);
}

function isRateLimitError(err) {
  const status = getAiErrorStatus(err);
  const msg = String(err?.message || '').toLowerCase();
  return status === 429 || /rate limit|quota|resource_exhausted/.test(msg);
}

function retryAfterMs(err) {
  const headers = err?.headers || err?.response?.headers;
  let value = null;
  if (headers?.get) value = headers.get('retry-after') || headers.get('Retry-After');
  else if (headers) value = headers['retry-after'] || headers['Retry-After'];
  if (Array.isArray(value)) value = value[0];
  if (value !== null && value !== undefined && value !== '') {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(250, Math.min(seconds * 1000, 30000));
    const dateMs = Date.parse(String(value));
    if (Number.isFinite(dateMs)) return Math.max(250, Math.min(dateMs - Date.now(), 30000));
  }
  return 1200;
}

const RISK_PATTERNS = [
  { risk: 100, type: 'command-injection', regex: /\b(exec|execSync|spawn|spawnSync|popen|system)\s*\(.*(req\.|params|query|input|\+|\$\{)/i },
  { risk: 95, type: 'sensitive-credential', regex: /\b(proxy[_-]?pass|db[_-]?pass|password|passwd|pass)\b\s*[:=]\s*["'`]([^"'`]+)["'`]|"pass"\s*:\s*"[^"]+"/i },
  { risk: 92, type: 'sql-injection', regex: /\b(select|insert|update|delete|drop|union|alter)\b.*(\+|\$\{)|(?:\+|\$\{).*\b(select|from|where|into)\b/i },
  { risk: 90, type: 'session-token', regex: /\b(PHPSESSID|JSESSIONID|aws-waf-token|AWSALB|_pat|_prt)\b/i },
  { risk: 88, type: 'code-execution', regex: /\b(eval|Function)\s*\(/i },
  { risk: 86, type: 'hardcoded-secret', regex: /\b(api[_-]?key|secret(?:[_-]?key)?|password|passwd|token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]{8,})["'`]/i },
  { risk: 84, type: 'jwt-token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { risk: 80, type: 'path-traversal', regex: /(send_file|sendFile|readFile|createReadStream|openSync|path\.join|os\.path\.join)\s*\(.*(req\.|params|query|filename|input)/i },
  { risk: 78, type: 'ssrf', regex: /\b(fetch|axios|request|http\.get|https\.get)\s*\(.*(req\.|params|query|url|target)/i },
  { risk: 75, type: 'sensitive-cookie-flag', regex: /"(secure|httpOnly)"\s*:\s*false/i },
  { risk: 72, type: 'dom-xss', regex: /(innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML)/i },
  { risk: 70, type: 'browser-history-data', regex: /"historyGz"\s*:\s*"[^"]{20,}"/i },
  { risk: 66, type: 'jwt-misuse', regex: /jwt\.decode\s*\(/i },
  { risk: 60, type: 'weak-crypto', regex: /\b(createCipher|md5|sha1|des)\b/i }
];

export function findSuspectRegions(code) {
  if (!code || typeof code !== 'string') return [];
  const lines = code.split('\n');
  const byLine = new Map();
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
    if (/(mock|example|placeholder|dummy|changeme)/i.test(trimmed)) return;
    for (const entry of RISK_PATTERNS) {
      entry.regex.lastIndex = 0;
      if (!entry.regex.test(trimmed)) continue;
      const lineNo = index + 1;
      const previous = byLine.get(lineNo);
      if (!previous || entry.risk > previous.risk) {
        byLine.set(lineNo, { line: lineNo, risk: entry.risk, type: entry.type });
      }
    }
  });
  return [...byLine.values()].sort((a, b) => b.risk - a.risk || a.line - b.line);
}

export function findSuspectLines(code) {
  return findSuspectRegions(code).map(item => item.line).sort((a, b) => a - b);
}

export function buildTargetedChunks(allLines, suspectRegions, windowPadding = TARGETED_WINDOW_PADDING, maxChunkSize = CHUNK_SIZE) {
  if (!Array.isArray(suspectRegions) || suspectRegions.length === 0) return [];
  const total = allLines.length;
  const windows = suspectRegions
    .map(item => typeof item === 'number' ? { line: item, risk: 50, type: 'suspect' } : item)
    .filter(item => Number.isFinite(item.line))
    .map(item => ({
      start: Math.max(1, item.line - windowPadding),
      end: Math.min(total, item.line + windowPadding),
      risk: Number(item.risk) || 50,
      types: new Set([item.type || 'suspect'])
    }))
    .sort((a, b) => a.start - b.start);
  if (!windows.length) return [];

  const merged = [];
  let current = windows[0];
  for (let i = 1; i < windows.length; i++) {
    const next = windows[i];
    if (next.start <= current.end + 5) {
      current.end = Math.max(current.end, next.end);
      current.risk = Math.max(current.risk, next.risk);
      next.types.forEach(type => current.types.add(type));
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  const chunks = [];
  for (const win of merged) {
    const step = Math.max(1, maxChunkSize - CHUNK_OVERLAP);
    for (let start = win.start; start <= win.end; start += step) {
      const end = Math.min(start + maxChunkSize - 1, win.end);
      chunks.push({
        chunkLines: allLines.slice(start - 1, end),
        startLineNumber: start,
        endLineNumber: end,
        kind: 'targeted',
        risk: win.risk,
        riskTypes: [...win.types]
      });
      if (end >= win.end) break;
    }
  }
  return chunks;
}

export function buildCoverageSampleChunks(allLines, sampleCount = COVERAGE_SAMPLE_COUNT, sampleSize = COVERAGE_SAMPLE_SIZE) {
  const total = allLines.length;
  if (!total) return [];
  const size = Math.max(1, Math.min(sampleSize, CHUNK_SIZE, total));
  const count = Math.max(1, Math.min(sampleCount, Math.ceil(total / size)));
  const maxStart = Math.max(1, total - size + 1);
  const starts = new Set();
  if (count === 1) starts.add(1);
  else {
    for (let i = 0; i < count; i++) {
      starts.add(Math.round(1 + ((maxStart - 1) * i) / (count - 1)));
    }
  }
  return [...starts].sort((a, b) => a - b).map(start => {
    const end = Math.min(total, start + size - 1);
    return {
      chunkLines: allLines.slice(start - 1, end),
      startLineNumber: start,
      endLineNumber: end,
      kind: 'sample',
      risk: 0,
      riskTypes: []
    };
  });
}

function overlapRatio(a, b) {
  const start = Math.max(a.startLineNumber, b.startLineNumber);
  const end = Math.min(a.endLineNumber, b.endLineNumber);
  if (end < start) return 0;
  const overlap = end - start + 1;
  const minSpan = Math.min(a.endLineNumber - a.startLineNumber + 1, b.endLineNumber - b.startLineNumber + 1);
  return overlap / Math.max(1, minSpan);
}

export function selectLargeFileChunks(allLines, suspectRegions) {
  const targeted = buildTargetedChunks(allLines, suspectRegions)
    .sort((a, b) => b.risk - a.risk || a.startLineNumber - b.startLineNumber)
    .slice(0, Math.max(0, MAX_TARGETED_CHUNKS));
  const samples = buildCoverageSampleChunks(allLines)
    .filter(sample => targeted.every(target => overlapRatio(sample, target) < 0.6));
  const capacity = Math.max(1, MAX_LARGE_FILE_CHUNKS);
  const selected = [...targeted];
  for (const sample of samples) {
    if (selected.length >= capacity) break;
    selected.push(sample);
  }
  if (selected.length === 0) selected.push(...buildCoverageSampleChunks(allLines, 1));
  return selected.sort((a, b) => a.startLineNumber - b.startLineNumber);
}

function buildFullChunks(allLines) {
  const chunks = [];
  const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);
  for (let start = 0; start < allLines.length; start += step) {
    const chunkLines = allLines.slice(start, Math.min(start + CHUNK_SIZE, allLines.length));
    chunks.push({
      chunkLines,
      startLineNumber: start + 1,
      endLineNumber: start + chunkLines.length,
      kind: 'full',
      risk: 0,
      riskTypes: []
    });
    if (start + CHUNK_SIZE >= allLines.length) break;
  }
  return chunks;
}

export function countCoveredLines(chunks, totalLines) {
  const intervals = (chunks || [])
    .filter(Boolean)
    .map(c => [Math.max(1, c.startLineNumber), Math.min(totalLines, c.endLineNumber)])
    .filter(([s, e]) => e >= s)
    .sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return 0;
  let covered = 0;
  let [start, end] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= end + 1) end = Math.max(end, e);
    else {
      covered += end - start + 1;
      [start, end] = [s, e];
    }
  }
  return covered + (end - start + 1);
}

function repairAiShape(parsed) {
  if (Array.isArray(parsed)) return { vulnerabilities: parsed, recommendations: [] };
  if (!parsed || typeof parsed !== 'object') return parsed;
  const candidates = [parsed.vulnerabilities, parsed.findings, parsed.issues, parsed.security_findings, parsed.results];
  const vulnerabilities = candidates.find(Array.isArray);
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
    : Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : [];
  return { ...parsed, vulnerabilities: vulnerabilities || [], recommendations };
}

function parseAiJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI trả về nội dung rỗng.');
  try { return JSON.parse(text); } catch {}
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(unfenced); } catch {}
  const firstObject = unfenced.indexOf('{');
  const lastObject = unfenced.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(unfenced.slice(firstObject, lastObject + 1));
  }
  const firstArray = unfenced.indexOf('[');
  const lastArray = unfenced.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    return JSON.parse(unfenced.slice(firstArray, lastArray + 1));
  }
  throw new Error('AI trả về JSON không thể parse/repair.');
}

async function mapSequential(items, worker, shouldAbort = () => false) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    if (shouldAbort()) break;
    results[i] = await worker(items[i], i);
  }
  return results;
}

export class ScannerService extends BaseScannerService {
  validateAiResult(parsed) {
    const repaired = repairAiShape(parsed);
    if (!repaired || typeof repaired !== 'object' || Array.isArray(repaired)) {
      throw new Error('AI trả về JSON không hợp lệ.');
    }
    if (!Array.isArray(repaired.vulnerabilities)) {
      throw new Error('AI response thiếu vulnerabilities/findings/issues[].');
    }
    const vulnerabilities = repaired.vulnerabilities.map(normalizeVulnerability).filter(Boolean);
    return {
      is_safe: vulnerabilities.length === 0,
      overall_summary: normalizeText(repaired.overall_summary || repaired.summary),
      vulnerabilities,
      recommendations: normalizeRecommendations(repaired.recommendations || [])
    };
  }

  async requestAi(client, model, prompt, retries = DEFAULT_RETRIES) {
    let normalRetries = 0;
    let rateLimitRetried = false;
    let lastError;
    while (true) {
      try {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.0,
          response_format: { type: 'json_object' }
        });
        const raw = res.choices?.[0]?.message?.content;
        return this.validateAiResult(parseAiJson(raw));
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err)) {
          if (!rateLimitRetried) {
            rateLimitRetried = true;
            await sleep(retryAfterMs(err));
            continue;
          }
          throw err;
        }
        if (isFatalAiError(err)) throw err;
        if (normalRetries >= retries) throw err;
        await sleep(300 * (2 ** normalRetries));
        normalRetries++;
      }
    }
    // istanbul ignore next
    throw lastError || new Error('AI scan thất bại.');
  }

  async scanCode(code, language = 'auto', customConfig = null) {
    if (!code || !code.trim()) throw new Error('Mã nguồn không được để trống.');

    const customKeys = this.parseApiKeys(customConfig?.apiKey || '');
    const provider = customConfig?.provider || (
      this.isCerebras ? 'cerebras' : this.isGroq ? 'groq' : this.isOpenCode ? 'opencode' : 'openai'
    );
    const firstKey = customKeys[0] || this.apiKey || '';
    const activeModel = customConfig?.model
      || (customConfig ? this.getDefaultModel(provider, firstKey) : this.model)
      || this.getDefaultModel(provider, firstKey);

    let clientPool = [];
    if (customKeys.length > 0) {
      clientPool = customKeys.map(key => this.createClient(key, provider, customConfig?.baseURL)).filter(Boolean);
    } else if (this.client) {
      clientPool = [this.client];
    }

    const allLines = code.split('\n');
    const totalLines = allLines.length;
    const heuristicRegions = findSuspectRegions(code);

    if (clientPool.length === 0) {
      const fallback = this.mockAnalysis(code, language);
      return {
        ...fallback,
        total_lines: totalLines,
        ai_covered_lines: 0,
        ai_coverage_percent: 0,
        planned_ai_coverage_percent: 0,
        heuristic_coverage_percent: 100,
        heuristic_suspect_count: heuristicRegions.length,
        coverage_complete: false,
        limited_coverage: true,
        scan_strategy: 'heuristic_only'
      };
    }

    if (totalLines <= SINGLE_REQUEST_MAX_LINES) {
      try {
        const parsed = await this.requestAi(clientPool[0], activeModel, this.generateSecurityPrompt(code, language));
        const sensitiveFindings = scanSensitiveData(code, language);
        const allVulns = dedupeVulnerabilities([...(parsed.vulnerabilities || []), ...sensitiveFindings]);
        const isSafe = allVulns.length === 0;
        return {
          ...parsed,
          is_safe: isSafe,
          vulnerabilities: allVulns,
          incomplete: false,
          scan_status: 'complete',
          source: 'ai_live',
          model_used: activeModel,
          total_lines: totalLines,
          ai_covered_lines: totalLines,
          ai_coverage_percent: 100,
          planned_ai_coverage_percent: 100,
          heuristic_coverage_percent: 100,
          heuristic_suspect_count: heuristicRegions.length,
          coverage_complete: true,
          limited_coverage: false,
          chunk_count: 1,
          targeted_chunk_count: 0,
          sample_chunk_count: 0,
          scan_strategy: 'single_request'
        };
      } catch (err) {
        const fallback = this.buildIncompleteFallback(code, language, err.message);
        return {
          ...fallback,
          total_lines: totalLines,
          ai_covered_lines: 0,
          ai_coverage_percent: 0,
          planned_ai_coverage_percent: 100,
          heuristic_coverage_percent: 100,
          heuristic_suspect_count: heuristicRegions.length,
          coverage_complete: false,
          limited_coverage: true,
          chunk_count: 1,
          targeted_chunk_count: 0,
          sample_chunk_count: 0,
          scan_strategy: 'single_request'
        };
      }
    }

    const isLarge = totalLines > LARGE_FILE_THRESHOLD;
    const chunks = isLarge ? selectLargeFileChunks(allLines, heuristicRegions) : buildFullChunks(allLines);
    const plannedCovered = countCoveredLines(chunks, totalLines);
    const envConcurrency = Number.parseInt(process.env.SCAN_MAX_CONCURRENCY || '', 10);
    const configuredConcurrency = Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : DEFAULT_MAX_CONCURRENCY;

    let circuitBroken = false;
    let fatalErrorReason = '';

    const worker = async (chunk, chunkIndex) => {
      if (circuitBroken) return null;
      const assignedClient = clientPool[chunkIndex % clientPool.length];
      try {
        const parsed = await this.requestAi(
          assignedClient,
          activeModel,
          this.generateChunkSecurityPrompt(chunk.chunkLines, chunk.startLineNumber, language)
        );
        return { ok: true, ...parsed, ...chunk };
      } catch (err) {
        if (isFatalAiError(err)) {
          circuitBroken = true;
          fatalErrorReason = err.message;
        }
        return {
          ok: false,
          error: err.message,
          vulnerabilities: [],
          recommendations: [],
          overall_summary: '',
          ...chunk
        };
      }
    };

    let chunkResults;
    if (configuredConcurrency <= 1) {
      chunkResults = await mapSequential(chunks, worker, () => circuitBroken);
    } else {
      const results = new Array(chunks.length);
      let cursor = 0;
      async function runWorker() {
        while (true) {
          if (circuitBroken) return;
          const index = cursor++;
          if (index >= chunks.length) return;
          results[index] = await worker(chunks[index], index);
        }
      }
      await Promise.all(Array.from({ length: Math.min(configuredConcurrency, chunks.length) }, () => runWorker()));
      chunkResults = results;
    }

    const processed = chunkResults.filter(Boolean);
    const successful = processed.filter(item => item.ok);
    const failed = processed.filter(item => !item.ok);
    const sensitiveFindings = scanSensitiveData(code, language);
    const aggregatedVulns = dedupeVulnerabilities([
      ...successful.flatMap(item => item.vulnerabilities || []),
      ...sensitiveFindings
    ]);
    const recommendations = normalizeRecommendations(successful.flatMap(item => item.recommendations || []));
    const incomplete = failed.length > 0 || circuitBroken || successful.length < chunks.length;
    const actualCovered = countCoveredLines(successful, totalLines);
    const aiCoveragePercent = Number(((actualCovered / totalLines) * 100).toFixed(1));
    const plannedCoveragePercent = Number(((plannedCovered / totalLines) * 100).toFixed(1));
    const coverageComplete = !incomplete && actualCovered >= totalLines;
    const limitedCoverage = !coverageComplete;

    if (circuitBroken && successful.length === 0) {
      const fallback = this.buildIncompleteFallback(code, language, `Lỗi AI: ${fatalErrorReason}`);
      return {
        ...fallback,
        total_lines: totalLines,
        ai_covered_lines: 0,
        ai_coverage_percent: 0,
        planned_ai_coverage_percent: plannedCoveragePercent,
        heuristic_coverage_percent: 100,
        heuristic_suspect_count: heuristicRegions.length,
        coverage_complete: false,
        limited_coverage: true,
        chunk_count: chunks.length,
        targeted_chunk_count: chunks.filter(c => c.kind === 'targeted').length,
        sample_chunk_count: chunks.filter(c => c.kind === 'sample').length,
        scan_strategy: isLarge ? 'targeted_plus_sampling' : 'full_chunks'
      };
    }

    const isSafe = !incomplete && aggregatedVulns.length === 0;
    let overallSummary;
    if (incomplete) {
      overallSummary = `Quét chưa hoàn tất: ${successful.length}/${chunks.length} phân đoạn thành công. AI coverage thực tế ${aiCoveragePercent}% (${actualCovered}/${totalLines} dòng); heuristic coverage 100%. Không thể kết luận mã nguồn an toàn.`;
    } else if (isLarge) {
      overallSummary = aggregatedVulns.length
        ? `File lớn ${totalLines} dòng: AI kiểm tra ${aiCoveragePercent}% mã nguồn qua ${chunks.length} vùng targeted/sampling và phát hiện ${aggregatedVulns.length} nguy cơ. Heuristic đã rà 100% file.`
        : `File lớn ${totalLines} dòng: không phát hiện finding trong ${aiCoveragePercent}% vùng được gửi AI (${actualCovered} dòng); heuristic đã rà 100% file. Đây là coverage có chọn mẫu, không đồng nghĩa AI đã đọc toàn bộ file.`;
    } else {
      overallSummary = aggregatedVulns.length
        ? `Đã quét đầy đủ ${totalLines} dòng qua ${chunks.length} chunk và phát hiện ${aggregatedVulns.length} nguy cơ.`
        : `Đã quét đầy đủ ${totalLines} dòng qua ${chunks.length} chunk (overlap ${CHUNK_OVERLAP}). Không phát hiện lỗ hổng trong lượt quét.`;
    }

    return {
      is_safe: isSafe,
      incomplete,
      scan_status: incomplete ? 'incomplete' : 'complete',
      overall_summary: overallSummary,
      vulnerabilities: aggregatedVulns,
      recommendations,
      failed_chunks: failed.map(item => ({
        start_line: item.startLineNumber,
        end_line: item.endLineNumber,
        error: item.error
      })),
      chunk_count: chunks.length,
      targeted_chunk_count: chunks.filter(c => c.kind === 'targeted').length,
      sample_chunk_count: chunks.filter(c => c.kind === 'sample').length,
      overlap_lines: CHUNK_OVERLAP,
      is_targeted: isLarge,
      total_lines: totalLines,
      ai_covered_lines: actualCovered,
      ai_coverage_percent: aiCoveragePercent,
      planned_ai_coverage_percent: plannedCoveragePercent,
      heuristic_coverage_percent: 100,
      heuristic_suspect_count: heuristicRegions.length,
      coverage_complete: coverageComplete,
      limited_coverage: limitedCoverage,
      scan_strategy: isLarge ? 'targeted_plus_sampling' : 'full_chunks',
      source: isLarge ? 'ai_live_targeted_sampling' : 'ai_live_full_chunks',
      model_used: activeModel
    };
  }
}
