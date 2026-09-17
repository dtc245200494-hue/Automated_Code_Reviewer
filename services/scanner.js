/**
 * AI Security Code Reviewer & Web Scanner
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 dtc245200494-hue & Contributors
 *
 * Licensed under the MIT License (OSI-approved).
 * See LICENSE file in the project root for full license information.
 */
import { OpenAI, AzureOpenAI } from 'openai';

const CHUNK_SIZE = 250;
const CHUNK_OVERLAP = 40;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_RETRIES = 2;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecommendations(items) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      normalized.push(item.trim());
    } else if (item && typeof item === 'object') {
      const text = item.recommendation || item.title || item.desc || item.description || item.text;
      if (typeof text === 'string' && text.trim()) normalized.push(text.trim());
    }
  }
  return [...new Set(normalized)];
}

function normalizeVulnerability(vuln) {
  if (!vuln || typeof vuln !== 'object') return null;
  const line = Number.parseInt(vuln.line_number, 10);
  return {
    ...vuln,
    type: normalizeText(vuln.type) || 'Security finding',
    severity: normalizeText(vuln.severity) || 'Trung bình',
    owasp_category: normalizeText(vuln.owasp_category),
    line_number: Number.isFinite(line) && line > 0 ? line : 1,
    affected_lines: normalizeText(vuln.affected_lines),
    explanation: normalizeText(vuln.explanation),
    attack_scenario: normalizeText(vuln.attack_scenario),
    remediation: normalizeText(vuln.remediation),
    fixed_code: normalizeText(vuln.fixed_code)
  };
}

function dedupeVulnerabilities(vulns) {
  const seen = new Set();
  const out = [];
  for (const raw of vulns) {
    const vuln = normalizeVulnerability(raw);
    if (!vuln) continue;
    const key = [
      vuln.type.toLowerCase(),
      vuln.line_number,
      vuln.affected_lines.toLowerCase().replace(/\s+/g, ' ').slice(0, 220)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(vuln);
  }
  return out;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

export class ScannerService {
  constructor() {
    this.groqKey = process.env.GROQ_API_KEY || (process.env.OPENAI_API_KEY?.startsWith('gsk_') ? process.env.OPENAI_API_KEY : '');
    this.openaiKey = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('gsk_') ? process.env.OPENAI_API_KEY : '';

    this.isGroq = Boolean(this.groqKey);
    this.isAzure = Boolean(process.env.AZURE_API_VERSION && process.env.AZURE_DEPLOYMENT);
    this.isGithubModels = process.env.USE_GITHUB_MODELS === 'true';

    if (this.isGroq) {
      this.apiKey = this.groqKey;
      this.model = process.env.MODEL || 'openai/gpt-oss-120b';
      this.provider = 'Groq Cloud AI (GPT-OSS 120B)';
      this.client = new OpenAI({
        apiKey: this.groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    } else if (this.openaiKey) {
      this.apiKey = this.openaiKey;
      this.model = process.env.MODEL || (this.isGithubModels ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
      this.provider = this.isAzure ? 'Azure OpenAI' : (this.isGithubModels ? 'GitHub Models' : 'OpenAI');

      if (this.isAzure) {
        this.client = new AzureOpenAI({
          apiKey: this.openaiKey,
          endpoint: process.env.OPENAI_API_ENDPOINT || '',
          apiVersion: process.env.AZURE_API_VERSION || '',
          deployment: process.env.AZURE_DEPLOYMENT || '',
        });
      } else {
        this.client = new OpenAI({
          apiKey: this.openaiKey,
          baseURL: this.isGithubModels
            ? 'https://models.github.ai/inference'
            : (process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1'),
        });
      }
    } else {
      this.apiKey = '';
      this.model = 'gpt-4o-mini';
      this.provider = 'OpenAI';
      this.client = null;
    }
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  parseApiKeys(value) {
    return (value || '')
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(k => k.length > 5);
  }

  getDefaultModel(provider, firstKey = '') {
    if (provider === 'gemini' || firstKey.startsWith('AIzaSy')) return 'gemini-1.5-flash';
    if (provider === 'deepseek') return 'deepseek-chat';
    if (provider === 'openrouter') return 'meta-llama/llama-3.3-70b-instruct:free';
    if (provider === 'groq' || firstKey.startsWith('gsk_')) return 'openai/gpt-oss-120b';
    return 'gpt-4o-mini';
  }

  createClient(apiKey, provider, baseURL) {
    const key = apiKey ? apiKey.trim() : '';
    if (!key) return null;

    if (provider === 'groq' || key.startsWith('gsk_')) {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://api.groq.com/openai/v1',
      });
    }

    if (provider === 'gemini' || key.startsWith('AIzaSy')) {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
    }

    if (provider === 'deepseek') {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://api.deepseek.com/v1',
      });
    }

    if (provider === 'openrouter') {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://openrouter.ai/api/v1',
      });
    }

    return new OpenAI({
      apiKey: key,
      baseURL: baseURL || (this.isGithubModels ? 'https://models.github.ai/inference' : 'https://api.openai.com/v1'),
    });
  }

  async testApiKey(apiKey, provider = 'groq', model = '') {
    const rawKeys = this.parseApiKeys(apiKey);
    if (rawKeys.length === 0) {
      throw new Error('API Key không được để trống.');
    }

    const firstKey = rawKeys[0];
    const testClient = this.createClient(firstKey, provider);
    const targetModel = model || this.getDefaultModel(provider, firstKey);

    await testClient.chat.completions.create({
      model: targetModel,
      messages: [{ role: 'user', content: 'Reply OK' }],
      max_tokens: 5
    });

    const providerName = provider === 'gemini' || firstKey.startsWith('AIzaSy')
      ? 'Google Gemini AI'
      : provider === 'deepseek'
        ? 'DeepSeek AI'
        : provider === 'openrouter'
          ? 'OpenRouter AI'
          : provider === 'openai' || firstKey.startsWith('sk-')
            ? 'OpenAI'
            : 'Groq Cloud AI';

    return {
      success: true,
      message: `Kết nối thành công! Đã nhận diện ${rawKeys.length} API Key để chạy đa luồng.`,
      model: targetModel,
      provider: providerName
    };
  }

  generateSecurityPrompt(code, language = 'auto') {
    return `Bạn là chuyên gia AppSec. Hãy rà soát đoạn mã sau theo OWASP Top 10.

QUY TẮC:
- Chỉ báo lỗ hổng khi có bằng chứng rõ ràng; không suy diễn từ HTML/CSS tĩnh.
- SQL có placeholder (?, $1, :name, %s) và được truyền tham số riêng không phải SQL Injection.
- Chỉ báo DOM XSS khi dữ liệu động không tin cậy đi vào innerHTML/outerHTML/insertAdjacentHTML/document.write hoặc template HTML thực thi mà không sanitize/escape.
- Chỉ báo hardcoded secret khi có credential thực được gán literal; bỏ qua biến môi trường, placeholder, example/mock/test value.
- line_number phải đúng theo chỉ số [L...].

Trả về JSON duy nhất:
{
  "is_safe": boolean,
  "overall_summary": "Tóm tắt tiếng Việt",
  "vulnerabilities": [{
    "type": "Tên lỗ hổng",
    "severity": "Cao|Trung bình|Thấp|Nghiêm trọng",
    "owasp_category": "OWASP",
    "line_number": 1,
    "affected_lines": "Dòng code",
    "explanation": "Giải thích",
    "attack_scenario": "Kịch bản khai thác",
    "remediation": "Cách sửa",
    "fixed_code": "Code sửa"
  }],
  "recommendations": []
}

Nếu không phát hiện lỗ hổng: "is_safe": true và "vulnerabilities": [].

\`\`\`${language}
${code.split('\n').map((line, i) => `[L${i + 1}] ${line}`).join('\n')}
\`\`\``;
  }

  generateChunkSecurityPrompt(chunkLines, startLineNumber, language = 'auto') {
    return `Bạn là chuyên gia AppSec. Hãy rà soát đoạn mã từ [L${startLineNumber}] đến [L${startLineNumber + chunkLines.length - 1}].

QUY TẮC:
- Chỉ báo lỗ hổng khi có bằng chứng rõ ràng.
- Không báo XSS cho HTML/CSS tĩnh.
- SQL dùng placeholder và truyền tham số tách biệt là an toàn.
- Không báo secret cho placeholder/example/mock/test hoặc process.env.
- line_number phải giữ nguyên số [L...] toàn file.

Trả về JSON duy nhất:
{
  "is_safe": boolean,
  "overall_summary": "Tóm tắt",
  "vulnerabilities": [{
    "type": "Tên lỗ hổng",
    "severity": "Cao|Trung bình|Thấp|Nghiêm trọng",
    "owasp_category": "OWASP",
    "line_number": ${startLineNumber},
    "affected_lines": "Dòng code",
    "explanation": "Giải thích",
    "attack_scenario": "Kịch bản",
    "remediation": "Cách sửa",
    "fixed_code": "Code sửa"
  }],
  "recommendations": []
}

\`\`\`${language}
${chunkLines.map((line, i) => `[L${startLineNumber + i}] ${line}`).join('\n')}
\`\`\``;
  }

  validateAiResult(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI trả về JSON không hợp lệ.');
    }
    if (!Array.isArray(parsed.vulnerabilities)) {
      throw new Error('AI response thiếu vulnerabilities[].');
    }
    if (parsed.recommendations !== undefined && !Array.isArray(parsed.recommendations)) {
      throw new Error('AI response có recommendations không hợp lệ.');
    }
    return {
      is_safe: parsed.vulnerabilities.length === 0,
      overall_summary: normalizeText(parsed.overall_summary),
      vulnerabilities: parsed.vulnerabilities.map(normalizeVulnerability).filter(Boolean),
      recommendations: normalizeRecommendations(parsed.recommendations || [])
    };
  }

  async requestAi(client, model, prompt, retries = DEFAULT_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.0,
          response_format: { type: 'json_object' }
        });
        const raw = res.choices?.[0]?.message?.content;
        if (!raw) throw new Error('AI trả về nội dung rỗng.');
        return this.validateAiResult(JSON.parse(raw));
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await sleep(300 * (2 ** attempt));
        }
      }
    }
    throw lastError || new Error('AI scan thất bại.');
  }

  buildIncompleteFallback(code, language, errorMessage) {
    const fallback = this.mockAnalysis(code, language);
    return {
      ...fallback,
      is_safe: false,
      incomplete: true,
      scan_status: 'incomplete',
      overall_summary: fallback.vulnerabilities.length > 0
        ? `Quét AI chưa hoàn tất (${errorMessage}). Heuristic vẫn phát hiện ${fallback.vulnerabilities.length} nguy cơ; kết quả cần được xem là chưa đầy đủ.`
        : `Quét AI chưa hoàn tất (${errorMessage}). Không thể kết luận mã nguồn an toàn; vui lòng quét lại.`,
      source: 'heuristic_fallback_incomplete',
      ai_error: errorMessage
    };
  }

  async scanCode(code, language = 'auto', customConfig = null) {
    if (!code || !code.trim()) {
      throw new Error('Mã nguồn không được để trống.');
    }

    const customKeys = this.parseApiKeys(customConfig?.apiKey || '');
    const provider = customConfig?.provider || (this.isGroq ? 'groq' : 'openai');
    const firstKey = customKeys[0] || this.apiKey || '';
    const activeModel = customConfig?.model || this.getDefaultModel(provider, firstKey) || this.model;

    let clientPool = [];
    if (customKeys.length > 0) {
      clientPool = customKeys
        .map(key => this.createClient(key, provider, customConfig?.baseURL))
        .filter(Boolean);
    } else if (this.client) {
      clientPool = [this.client];
    }

    if (clientPool.length === 0) {
      return this.mockAnalysis(code, language);
    }

    const allLines = code.split('\n');

    if (allLines.length <= CHUNK_SIZE) {
      const prompt = this.generateSecurityPrompt(code, language);
      try {
        const parsed = await this.requestAi(clientPool[0], activeModel, prompt);
        return {
          ...parsed,
          incomplete: false,
          scan_status: 'complete',
          source: 'ai_live',
          model_used: activeModel
        };
      } catch (err) {
        console.warn('AI Scan lỗi; không kết luận an toàn:', err.message);
        return this.buildIncompleteFallback(code, language, err.message);
      }
    }

    const chunks = [];
    const step = CHUNK_SIZE - CHUNK_OVERLAP;
    for (let start = 0; start < allLines.length; start += step) {
      const chunkLines = allLines.slice(start, Math.min(start + CHUNK_SIZE, allLines.length));
      chunks.push({
        chunkLines,
        startLineNumber: start + 1,
        endLineNumber: start + chunkLines.length
      });
      if (start + CHUNK_SIZE >= allLines.length) break;
    }

    const envConcurrency = Number.parseInt(process.env.SCAN_MAX_CONCURRENCY || '', 10);
    const configuredConcurrency = Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : Math.min(DEFAULT_MAX_CONCURRENCY, Math.max(1, clientPool.length * 2));

    const chunkResults = await mapWithConcurrency(
      chunks,
      configuredConcurrency,
      async (chunk, chunkIndex) => {
        const assignedClient = clientPool[chunkIndex % clientPool.length];
        const prompt = this.generateChunkSecurityPrompt(chunk.chunkLines, chunk.startLineNumber, language);

        try {
          const parsed = await this.requestAi(assignedClient, activeModel, prompt);
          return {
            ok: true,
            ...parsed,
            startLineNumber: chunk.startLineNumber,
            endLineNumber: chunk.endLineNumber
          };
        } catch (err) {
          console.warn(`Lỗi khi quét đoạn L${chunk.startLineNumber}-L${chunk.endLineNumber}:`, err.message);
          return {
            ok: false,
            error: err.message,
            startLineNumber: chunk.startLineNumber,
            endLineNumber: chunk.endLineNumber,
            vulnerabilities: [],
            recommendations: [],
            overall_summary: ''
          };
        }
      }
    );

    const failedChunks = chunkResults.filter(result => !result.ok);
    const aggregatedVulns = dedupeVulnerabilities(
      chunkResults.flatMap(result => result.vulnerabilities || [])
    );
    const uniqueRecs = normalizeRecommendations(
      chunkResults.flatMap(result => result.recommendations || [])
    );
    const summaries = chunkResults
      .filter(result => result.ok && result.overall_summary)
      .map(result => `L${result.startLineNumber}-L${result.endLineNumber}: ${result.overall_summary}`);

    const incomplete = failedChunks.length > 0;
    const isSafe = !incomplete && aggregatedVulns.length === 0;

    let overallSummary;
    if (incomplete) {
      overallSummary = `Quét chưa hoàn tất: ${failedChunks.length}/${chunks.length} phân đoạn lỗi sau khi retry. `
        + `Không thể kết luận mã nguồn an toàn. Đã giữ lại ${aggregatedVulns.length} phát hiện từ các phân đoạn thành công.`;
    } else if (aggregatedVulns.length === 0) {
      overallSummary = `Đã quét đầy đủ ${allLines.length} dòng code qua ${chunks.length} phân đoạn (overlap ${CHUNK_OVERLAP} dòng). Không phát hiện lỗ hổng nghiêm trọng.`;
    } else {
      overallSummary = `Đã quét đầy đủ ${allLines.length} dòng code. Phát hiện ${aggregatedVulns.length} nguy cơ tiềm ẩn.\n${summaries.join('\n')}`;
    }

    return {
      is_safe: isSafe,
      incomplete,
      scan_status: incomplete ? 'incomplete' : 'complete',
      overall_summary: overallSummary,
      vulnerabilities: aggregatedVulns,
      recommendations: uniqueRecs,
      failed_chunks: failedChunks.map(item => ({
        start_line: item.startLineNumber,
        end_line: item.endLineNumber,
        error: item.error
      })),
      chunk_count: chunks.length,
      overlap_lines: CHUNK_OVERLAP,
      source: 'ai_live_chunked_parallel',
      model_used: activeModel
    };
  }

  mockAnalysis(code, language) {
    const codeLower = code.toLowerCase();
    const lines = code.split('\n');
    const vulnerabilities = [];

    const isPureHtml = language === 'html'
      || codeLower.startsWith('<!doctype html')
      || (codeLower.includes('<html') && !/(innerhtml|outerhtml|insertadjacenthtml|document\.write)/i.test(code));

    const sqlLineIdx = lines.findIndex(line =>
      /\bselect\b/i.test(line)
      && (
        /f["'].*\{.+\}/i.test(line)
        || /\$\{.+\}/.test(line)
        || /\bselect\b.*\+/.test(line)
        || /\+\s*.*\b(select|where|from)\b/i.test(line)
      )
    );

    if (!isPureHtml && sqlLineIdx >= 0) {
      vulnerabilities.push({
        type: 'SQL Injection',
        severity: 'Cao',
        owasp_category: 'A03:2021-Injection',
        line_number: sqlLineIdx + 1,
        affected_lines: lines[sqlLineIdx].trim(),
        explanation: 'Truy vấn SQL ghép trực tiếp dữ liệu động vào câu lệnh thay vì truyền tham số riêng.',
        attack_scenario: "Dữ liệu như ' OR '1'='1' -- có thể thay đổi logic truy vấn.",
        remediation: 'Sử dụng prepared statement/parameterized query và truyền giá trị qua tham số của database driver.',
        fixed_code: 'const row = await db.get("SELECT * FROM users WHERE username = ?", [username]);'
      });
    }

    const xssLineIdx = lines.findIndex(line => {
      if (!/(innerHTML|outerHTML|insertAdjacentHTML|document\.write)/.test(line)) return false;
      if (/DOMPurify\.sanitize|sanitizeHtml|escapeHtml/i.test(line)) return false;
      if (/(innerHTML|outerHTML)\s*=\s*["'`][^$`]*["'`]\s*;?\s*$/.test(line)) return false;
      return /(\$\{|\+\s*\w+|\b(user|input|query|param|bio|name|message|content)\b)/i.test(line);
    });

    if (!isPureHtml && xssLineIdx >= 0) {
      vulnerabilities.push({
        type: 'Cross-Site Scripting (DOM XSS)',
        severity: 'Cao',
        owasp_category: 'A03:2021-Injection',
        line_number: xssLineIdx + 1,
        affected_lines: lines[xssLineIdx].trim(),
        explanation: 'Dữ liệu động có thể đi vào HTML sink mà không được escape/sanitize.',
        attack_scenario: 'Payload HTML/JavaScript do người dùng kiểm soát có thể được trình duyệt diễn giải và thực thi.',
        remediation: 'Ưu tiên textContent cho text thuần; nếu cần HTML, sanitize bằng thư viện đáng tin cậy như DOMPurify.',
        fixed_code: 'target.innerHTML = DOMPurify.sanitize(userHtml);'
      });
    }

    const secretPattern = /\b(api[_-]?key|secret(?:[_-]?key)?|password|passwd|token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]+)["'`]/i;
    const secretLineIdx = lines.findIndex(line => {
      const match = line.match(secretPattern);
      if (!match) return false;
      const value = match[2].trim();
      if (!value || value.length < 8) return false;
      if (/(mock|example|sample|placeholder|dummy|changeme|your[_-]?|test|xxx|process\.env)/i.test(value)) return false;
      return true;
    });

    if (secretLineIdx >= 0) {
      vulnerabilities.push({
        type: 'Hardcoded Secrets & Sensitive Credentials',
        severity: 'Nghiêm trọng',
        owasp_category: 'A07:2021-Identification & Auth Failures',
        line_number: secretLineIdx + 1,
        affected_lines: lines[secretLineIdx].trim(),
        explanation: 'Credential có vẻ được ghi trực tiếp trong mã nguồn.',
        attack_scenario: 'Nếu repository/log/build artifact bị lộ, credential có thể bị tái sử dụng để truy cập dịch vụ liên quan.',
        remediation: 'Chuyển secret sang biến môi trường hoặc secret manager và rotate credential đã lộ.',
        fixed_code: 'const API_KEY = process.env.API_KEY;'
      });
    }

    const commandLineIdx = lines.findIndex(line =>
      /\b(exec|system|spawn)\s*\(/i.test(line)
      && /(\$\{|\+\s*\w+|%\s*\w+)/.test(line)
    );
    if (commandLineIdx >= 0) {
      vulnerabilities.push({
        type: 'OS Command Injection',
        severity: 'Nghiêm trọng',
        owasp_category: 'A03:2021-Injection',
        line_number: commandLineIdx + 1,
        affected_lines: lines[commandLineIdx].trim(),
        explanation: 'Dữ liệu động được ghép vào lệnh hệ điều hành.',
        attack_scenario: 'Kẻ tấn công có thể chèn toán tử shell để thực thi lệnh ngoài ý muốn.',
        remediation: 'Tránh shell; dùng API truyền argv tách biệt và whitelist input.',
        fixed_code: "execFile('ping', ['-c', '4', safeHost], callback);"
      });
    }

    const pathLineIdx = lines.findIndex(line => {
      if (!/(send_file|sendFile|readFile|createReadStream|os\.path\.join|path\.join)/i.test(line)) return false;
      if (/(basename|realpath|resolve\(|normalize\(|startsWith\(|commonpath|whitelist)/i.test(line)) return false;
      return /\b(filename|fileName|req\.|request\.|params|query|input|user)/i.test(line);
    });

    if (pathLineIdx >= 0) {
      vulnerabilities.push({
        type: 'Path Traversal / Arbitrary File Read',
        severity: 'Cao',
        owasp_category: 'A01:2021-Broken Access Control',
        line_number: pathLineIdx + 1,
        affected_lines: lines[pathLineIdx].trim(),
        explanation: 'Đường dẫn file có thể phụ thuộc vào dữ liệu bên ngoài mà chưa thấy bước chuẩn hóa/giới hạn thư mục.',
        attack_scenario: "Input dạng ../../ có thể thoát khỏi thư mục cho phép nếu ứng dụng ghép đường dẫn trực tiếp.",
        remediation: 'Resolve canonical path rồi kiểm tra nó vẫn nằm trong thư mục cho phép; hoặc dùng basename/allowlist.',
        fixed_code: 'const resolved = path.resolve(BASE_DIR, path.basename(filename));'
      });
    }

    const isSafe = vulnerabilities.length === 0;

    return {
      is_safe: isSafe,
      incomplete: false,
      scan_status: 'complete',
      overall_summary: isSafe
        ? 'Không phát hiện dấu hiệu lỗ hổng phổ biến bằng Heuristic Engine.'
        : `Heuristic Engine phát hiện ${vulnerabilities.length} nguy cơ cần kiểm tra.`,
      vulnerabilities,
      recommendations: isSafe
        ? [
            'Tiếp tục dùng parameterized query và validate input ở ranh giới tin cậy.',
            'Kết hợp quét AI/SAST trong Pull Request để tăng độ phủ.'
          ]
        : [
            'Ưu tiên xử lý các phát hiện mức Cao/Nghiêm trọng trước khi production.',
            'Xác minh từng finding trong ngữ cảnh thực tế để tránh sửa sai.'
          ],
      source: 'heuristic_engine',
      notice: 'Không có AI client khả dụng; kết quả đến từ Heuristic Engine.'
    };
  }
}
