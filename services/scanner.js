/**
 * AI Security Code Reviewer & Web Scanner
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 dtc245200494-hue & Contributors
 *
 * Licensed under the MIT License (OSI-approved).
 * See LICENSE file in the project root for full license information.
 */
import { OpenAI, AzureOpenAI } from 'openai';
import { scanSensitiveData } from './sensitive-data-scanner.js';

export const SINGLE_REQUEST_MAX_LINES = Number.parseInt(process.env.SCAN_SINGLE_LIMIT || '500', 10);
export const CHUNK_SIZE = Number.parseInt(process.env.SCAN_CHUNK_SIZE || '600', 10);
export const CHUNK_OVERLAP = 50;
export const LARGE_FILE_THRESHOLD = Number.parseInt(process.env.SCAN_LARGE_THRESHOLD || '3000', 10);
export const TARGETED_WINDOW_PADDING = 40;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_RETRIES = 2;

export function isFatalAiError(err) {
  if (!err) return false;
  const status = Number(err.status || err.statusCode || err.response?.status || 0);
  if (status === 401 || status === 403 || status === 429) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('permission_denied') ||
    msg.includes('tier')
  );
}

export function findSuspectLines(code) {
  if (!code || typeof code !== 'string') return [];
  const lines = code.split('\n');
  const suspectIndices = new Set();

  const patterns = [
    // SQL Injection
    /\b(select|insert|update|delete|drop|union|alter)\b.*(\+|\$\{)/i,
    /(\+|\$\{).*\b(select|from|where|into)\b/i,
    // DOM XSS
    /(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\s*=/i,
    /dangerouslySetInnerHTML/i,
    // Command Injection
    /\b(exec|execSync|spawn|spawnSync|fork|popen|system)\s*\(/i,
    // Eval / Code Execution
    /\b(eval|Function)\s*\(/i,
    // Path Traversal
    /(send_file|sendFile|readFile|createReadStream|openSync)\s*\(.*(req\.|params|query|filename|input)/i,
    /(path\.join|os\.path\.join)\s*\(.*(req\.|params|query|input)/i,
    // Hardcoded Secrets
    /\b(api[_-]?key|secret(?:[_-]?key)?|password|passwd|token|private[_-]?key)\b\s*[:=]\s*["'`]([^"'`]{8,})["'`]/i,
    // SSRF
    /\b(fetch|axios|request|http\.get|https\.get)\s*\(.*(req\.|params|query|url|target)/i,
    // Weak Crypto / Insecure Auth
    /\b(createCipher|md5|sha1|des)\b/i,
    /jwt\.decode\s*\(/i
  ];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) return;
    if (/(mock|example|placeholder|dummy|changeme)/i.test(trimmed)) return;

    for (const pat of patterns) {
      if (pat.test(trimmed)) {
        suspectIndices.add(idx + 1); // 1-indexed
        break;
      }
    }
  });

  return Array.from(suspectIndices).sort((a, b) => a - b);
}

export function buildTargetedChunks(allLines, suspectLines, windowPadding = TARGETED_WINDOW_PADDING, maxChunkSize = CHUNK_SIZE) {
  if (!suspectLines || suspectLines.length === 0) {
    const end = Math.min(allLines.length, maxChunkSize);
    return [{
      chunkLines: allLines.slice(0, end),
      startLineNumber: 1,
      endLineNumber: end
    }];
  }

  const totalLines = allLines.length;
  const windows = suspectLines.map(line => ({
    start: Math.max(1, line - windowPadding),
    end: Math.min(totalLines, line + windowPadding)
  }));

  const merged = [];
  let current = windows[0];

  for (let i = 1; i < windows.length; i++) {
    const next = windows[i];
    if (next.start <= current.end + 5) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  const chunks = [];
  for (const win of merged) {
    const span = win.end - win.start + 1;
    if (span <= maxChunkSize) {
      chunks.push({
        chunkLines: allLines.slice(win.start - 1, win.end),
        startLineNumber: win.start,
        endLineNumber: win.end
      });
    } else {
      const step = maxChunkSize - CHUNK_OVERLAP;
      for (let s = win.start; s <= win.end; s += step) {
        const e = Math.min(s + maxChunkSize - 1, win.end);
        chunks.push({
          chunkLines: allLines.slice(s - 1, e),
          startLineNumber: s,
          endLineNumber: e
        });
        if (e >= win.end) break;
      }
    }
  }

  return chunks;
}


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
  const rawStart = Number.parseInt(vuln.start_line ?? vuln.line_number, 10);
  const startLine = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 1;
  const rawEnd = Number.parseInt(vuln.end_line ?? vuln.start_line ?? vuln.line_number, 10);
  const endLine = Number.isFinite(rawEnd) && rawEnd >= startLine ? rawEnd : startLine;

  const rawStartCol = Number.parseInt(vuln.start_column, 10);
  const startCol = Number.isFinite(rawStartCol) && rawStartCol > 0 ? rawStartCol : 1;
  const rawEndCol = Number.parseInt(vuln.end_column, 10);
  const endCol = Number.isFinite(rawEndCol) && rawEndCol >= 1 ? rawEndCol : null;

  return {
    ...vuln,
    type: normalizeText(vuln.type) || 'Security finding',
    severity: normalizeText(vuln.severity) || 'Trung bình',
    owasp_category: normalizeText(vuln.owasp_category),
    cwe: normalizeText(vuln.cwe) || 'CWE-Other',
    confidence: normalizeText(vuln.confidence) || 'Cao',
    start_line: startLine,
    end_line: endLine,
    start_column: startCol,
    end_column: endCol,
    line_number: startLine,
    affected_lines: normalizeText(vuln.affected_lines),
    explanation: normalizeText(vuln.explanation),
    attack_scenario: normalizeText(vuln.attack_scenario),
    remediation: normalizeText(vuln.remediation),
    fixed_code: normalizeText(vuln.fixed_code),
    impact: normalizeText(vuln.impact)
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
      vuln.start_line,
      vuln.end_line,
      vuln.affected_lines.toLowerCase().replace(/\s+/g, ' ').slice(0, 220)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(vuln);
  }
  return out;
}

async function mapWithConcurrency(items, concurrency, worker, shouldAbort = () => false) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      if (shouldAbort()) return;
      const index = cursor++;
      if (index >= items.length) return;
      if (shouldAbort()) return;
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

// Chỉ giữ để nhận diện cấu hình LocalStorage cũ ở server.js.
// Không còn dùng key này làm key mặc định của server.
export const DEFAULT_OPENCODE_API_KEY = 'sk-PtTVvzUMtFeHt04GwX5DNH9la9Jv6j7Es6KjdadWkqTfRrA9Aho3SMHfyitBWR5O';

export class ScannerService {
  constructor() {
    const rawProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    const envKey = process.env.OPENAI_API_KEY || '';
    const cerebrasEnvKey = process.env.CEREBRAS_API_KEY || '';
    const groqEnvKey = process.env.GROQ_API_KEY || '';
    const opencodeEnvKey = process.env.OPENCODE_API_KEY || '';
    const endpoint = (process.env.OPENAI_API_ENDPOINT || '').trim();

    this.isAzure = Boolean(process.env.AZURE_API_VERSION && process.env.AZURE_DEPLOYMENT);
    this.isGithubModels = process.env.USE_GITHUB_MODELS === 'true';

    // Xác định provider rõ ràng: ưu tiên AI_PROVIDER nếu có.
    // Nếu không cấu hình provider nhưng có CEREBRAS_API_KEY thì Cerebras là mặc định.
    let chosenProvider = '';
    if (rawProvider) {
      chosenProvider = rawProvider;
    } else if (cerebrasEnvKey || endpoint.includes('cerebras.ai')) {
      chosenProvider = 'cerebras';
    } else if (opencodeEnvKey || endpoint.includes('opencode.ai')) {
      chosenProvider = 'opencode';
    } else if (groqEnvKey || envKey.startsWith('gsk_')) {
      chosenProvider = 'groq';
    } else if (this.isAzure || rawProvider === 'azure') {
      chosenProvider = 'azure';
    } else if (this.isGithubModels || rawProvider === 'github') {
      chosenProvider = 'github';
    } else if (envKey) {
      chosenProvider = 'openai';
    } else if (process.env.NO_DEFAULT_KEY !== 'true') {
      // Không nhúng secret mặc định vào source. Chờ CEREBRAS_API_KEY trong .env.
      chosenProvider = 'cerebras';
    }

    this.isCerebras = chosenProvider === 'cerebras';
    this.isOpenCode = chosenProvider === 'opencode';
    this.isGroq = chosenProvider === 'groq';
    this.isOpenAI = chosenProvider === 'openai';

    if (this.isCerebras) {
      this.apiKey = cerebrasEnvKey || envKey;
      this.model = process.env.MODEL || 'gpt-oss-120b';
      this.provider = 'Cerebras';
      this.client = this.apiKey ? new OpenAI({
        apiKey: this.apiKey,
        baseURL: endpoint || 'https://api.cerebras.ai/v1',
      }) : null;
    } else if (this.isOpenCode) {
      this.apiKey = opencodeEnvKey || envKey;
      this.model = process.env.MODEL || 'deepseek-v4-flash-free';
      this.provider = 'OpenCode.ai';
      this.client = this.apiKey ? new OpenAI({
        apiKey: this.apiKey,
        baseURL: endpoint || 'https://opencode.ai/zen/v1',
      }) : null;
    } else if (this.isGroq) {
      this.apiKey = groqEnvKey || envKey;
      this.model = process.env.MODEL || 'llama-3.3-70b-versatile';
      this.provider = 'Groq Cloud AI';
      this.client = this.apiKey ? new OpenAI({
        apiKey: this.apiKey,
        baseURL: endpoint || 'https://api.groq.com/openai/v1',
      }) : null;
    } else if (chosenProvider === 'azure') {
      this.apiKey = envKey || process.env.AZURE_OPENAI_API_KEY || '';
      this.model = process.env.MODEL || process.env.AZURE_DEPLOYMENT || 'gpt-4o-mini';
      this.provider = 'Azure OpenAI';
      this.client = this.apiKey ? new AzureOpenAI({
        apiKey: this.apiKey,
        endpoint: endpoint || '',
        apiVersion: process.env.AZURE_API_VERSION || '',
        deployment: process.env.AZURE_DEPLOYMENT || '',
      }) : null;
    } else if (chosenProvider === 'github') {
      this.apiKey = envKey || process.env.GITHUB_TOKEN || '';
      this.model = process.env.MODEL || 'openai/gpt-4o-mini';
      this.provider = 'GitHub Models';
      this.client = this.apiKey ? new OpenAI({
        apiKey: this.apiKey,
        baseURL: endpoint || 'https://models.github.ai/inference',
      }) : null;
    } else if (chosenProvider === 'openai') {
      this.apiKey = envKey;
      this.model = process.env.MODEL || 'gpt-4o-mini';
      this.provider = 'OpenAI';
      this.client = this.apiKey ? new OpenAI({
        apiKey: this.apiKey,
        baseURL: endpoint || 'https://api.openai.com/v1',
      }) : null;
    } else {
      this.apiKey = '';
      this.model = 'gpt-oss-120b';
      this.provider = 'Cerebras';
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
    if (provider === 'cerebras') return 'gpt-oss-120b';
    if (provider === 'gemini' || firstKey.startsWith('AIzaSy') || firstKey.startsWith('AQ.')) return 'gemini-2.5-flash-lite';
    if (provider === 'deepseek') return 'deepseek-chat';
    if (provider === 'openrouter') return 'meta-llama/llama-3.3-70b-instruct:free';
    if (provider === 'groq' || firstKey.startsWith('gsk_')) return 'llama-3.3-70b-versatile';
    if (provider === 'opencode') return 'deepseek-v4-flash-free';
    if (provider === 'openai') return 'gpt-4o-mini';
    return 'gpt-oss-120b';
  }

  createClient(apiKey, provider, baseURL) {
    const key = apiKey ? apiKey.trim() : '';
    if (!key) return null;

    if (provider === 'cerebras') {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://api.cerebras.ai/v1',
      });
    }

    if (provider === 'groq' || key.startsWith('gsk_')) {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://api.groq.com/openai/v1',
      });
    }

    if (provider === 'opencode') {
      return new OpenAI({
        apiKey: key,
        baseURL: baseURL || 'https://opencode.ai/zen/v1',
      });
    }

    if (provider === 'gemini' || key.startsWith('AIzaSy') || key.startsWith('AQ.')) {
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

  async testApiKey(apiKey, provider = 'cerebras', model = '') {
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

    const providerName = provider === 'cerebras'
      ? 'Cerebras'
      : provider === 'gemini' || firstKey.startsWith('AIzaSy') || firstKey.startsWith('AQ.')
        ? 'Google Gemini AI'
        : provider === 'deepseek'
          ? 'DeepSeek AI'
          : provider === 'openrouter'
            ? 'OpenRouter AI'
            : provider === 'opencode'
              ? 'OpenCode.ai'
              : provider === 'openai'
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
    return `Bạn là chuyên gia kiểm thử bảo mật mã nguồn (AppSec Expert). Hãy rà soát toàn diện đoạn mã nguồn dưới đây dựa trên bộ tiêu chuẩn OWASP Top 10:2025:

DANH MỤC TRỌNG TÂM OWASP TOP 10:2025 CẦN KIỂM TRA:
1. A01:2025 - Broken Access Control: IDOR, Path/Directory Traversal, bypass quyền hạn, CORS nguy hiểm, lộ API nhạy cảm.
2. A02:2025 - Cryptographic Failures: Hardcoded Secret/API Key/Password trong code, thuật toán mã hóa yếu (MD5, SHA1, DES), truyền dữ liệu không an toàn.
3. A03:2025 - Injection: SQL Injection, Command Injection (child_process, os.system, exec), Cross-Site Scripting (DOM/Reflected XSS), NoSQL/SSTI Injection.
4. A04:2025 - Insecure Design: Lỗ hổng kiến trúc, thiếu kiểm soát ranh giới tin cậy, luồng nghiệp vụ không an toàn.
5. A05:2025 - Security Misconfiguration: Lộ thông tin lỗi/stack trace, cấu hình mặc định không an toàn, bật chế độ debug.
6. A06:2025 - Vulnerable and Outdated Components: Phụ thuộc thư viện có lỗ hổng CVE đã công bố.
7. A07:2025 - Identification and Authentication Failures: Bypass xác thực, lộ session, JWT thiếu kiểm tra chữ ký, mật khẩu yếu.
8. A08:2025 - Software and Data Integrity Failures: Deserialization không an toàn (eval, pickle), update integrity thiếu kiểm tra.
9. A09:2025 - Security Logging and Monitoring Failures: Lộ secret trong log, thiếu log sự kiện quan trọng, log injection.
10. A10:2025 - Server-Side Request Forgery (SSRF): Backend gửi request tới endpoint người dùng cung cấp mà không validate IP/Domain.

QUY TẮC RÀ SOÁT BẢO MẬT:
- Chỉ báo lỗ hổng khi có bằng chứng rõ ràng trong mã nguồn; không suy diễn từ HTML/CSS tĩnh thuần túy.
- SQL có placeholder (?, $1, :name, %s) và được truyền tham số riêng KHÔNG PHẢI SQL Injection.
- Chỉ báo DOM XSS khi dữ liệu động không tin cậy đi vào innerHTML/outerHTML/insertAdjacentHTML/document.write mà không sanitize/escape.
- Chỉ báo Hardcoded Secret khi có credential thực được gán literal; bỏ qua biến môi trường (process.env, os.getenv), placeholder ("your-api-key"), example/mock/test value.
- RÀ SOÁT DỮ LIỆU & FILE CẤU HÌNH (JSON, YAML, ENV, PROFILE EXPORTS):
  + Bắt buộc phát hiện mật khẩu/credential lưu dạng plaintext (ví dụ: proxy "user"/"pass", db password) -> Báo "Sensitive Credential Stored in Plaintext" (Mức Cao, CWE-256).
  + Bắt buộc phát hiện token xác thực/session lưu lộ thiên (JWT eyJ..., PHPSESSID, JSESSIONID, aws-waf-token, AWSALB, _pat, _prt) -> Báo "Authentication / Session Token Exposed in Data File" (Mức Cao, CWE-522/CWE-200).
  + Bắt buộc phát hiện cookie phiên thiếu cờ bảo vệ (secure: false, httpOnly: false) -> Báo "Session Cookie Missing Secure / HttpOnly Protection" (Mức Cao, CWE-614/CWE-1004).
  + Bắt buộc phát hiện dữ liệu nhạy cảm lưu không mã hóa (historyGz, vị trí geo) -> Báo "Sensitive Browser/Profile Data Persisted" (Mức Trung bình, CWE-359).
  + KHÔNG ĐƯỢC kết luận file an toàn (is_safe: false) nếu phát hiện bất kỳ dữ liệu nhạy cảm nào ở trên.
- start_line và end_line phải đúng theo chỉ số [L...] bao trọn toàn bộ phạm vi dòng code bị ảnh hưởng.

Trả về JSON duy nhất:
{
  "is_safe": boolean,
  "overall_summary": "Tóm tắt đánh giá bảo mật tổng quan bằng tiếng Việt",
  "vulnerabilities": [{
    "type": "Tên lỗ hổng (ví dụ: SQL Injection, Hardcoded Secret, XSS...)",
    "severity": "Cao|Trung bình|Thấp|Nghiêm trọng",
    "owasp_category": "Mã OWASP Top 10:2025 (ví dụ: A03:2025 - Injection, A01:2025 - Broken Access Control)",
    "cwe": "Mã CWE (ví dụ: CWE-89, CWE-79, CWE-798...)",
    "confidence": "Cao|Trung bình|Thấp",
    "start_line": 1,
    "end_line": 1,
    "line_number": 1,
    "affected_lines": "Dòng code chứa nguy cơ",
    "explanation": "Giải thích chi tiết nguyên nhân và rủi ro",
    "attack_scenario": "Kịch bản tin tặc có thể khai thác",
    "remediation": "Cách khắc phục triệt để",
    "fixed_code": "Đoạn code đã sửa an toàn"
  }],
  "recommendations": ["Khuyến nghị bảo mật bổ sung"]
}

Nếu mã nguồn an toàn: "is_safe": true và "vulnerabilities": [].

\`\`\`${language}
${code.split('\n').map((line, i) => `[L${i + 1}] ${line}`).join('\n')}
\`\`\``;
  }

  generateChunkSecurityPrompt(chunkLines, startLineNumber, language = 'auto') {
    return `Bạn là chuyên gia kiểm thử bảo mật mã nguồn (AppSec Expert). Hãy rà soát đoạn mã từ dòng [L${startLineNumber}] đến [L${startLineNumber + chunkLines.length - 1}] theo chuẩn OWASP Top 10:2025 (Injection, Broken Access Control, Secrets, XSS, SSRF, v.v.):

QUY TẮC RÀ SOÁT:
- Chỉ báo lỗ hổng khi có bằng chứng rõ ràng trong đoạn mã.
- Không báo XSS cho HTML/CSS tĩnh.
- SQL dùng placeholder và truyền tham số tách biệt là an toàn.
- Không báo secret cho placeholder/example/mock/test hoặc biến môi trường.
- start_line và end_line phải giữ đúng chỉ số dòng [L...] của toàn file.

Trả về JSON duy nhất:
{
  "is_safe": boolean,
  "overall_summary": "Tóm tắt đánh giá bằng tiếng Việt",
  "vulnerabilities": [{
    "type": "Tên lỗ hổng",
    "severity": "Cao|Trung bình|Thấp|Nghiêm trọng",
    "owasp_category": "Mã OWASP Top 10:2025 (ví dụ: A03:2025 - Injection, A01:2025 - Broken Access Control)",
    "cwe": "Mã CWE (ví dụ: CWE-89, CWE-79)",
    "confidence": "Cao|Trung bình|Thấp",
    "start_line": ${startLineNumber},
    "end_line": ${startLineNumber},
    "line_number": ${startLineNumber},
    "affected_lines": "Dòng code chứa nguy cơ",
    "explanation": "Giải thích nguyên nhân và rủi ro",
    "attack_scenario": "Kịch bản khai thác",
    "remediation": "Cách sửa triệt để",
    "fixed_code": "Đoạn code đã sửa an toàn"
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
        if (isFatalAiError(err)) {
          throw err;
        }
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
    const provider = customConfig?.provider || (
      this.isCerebras
        ? 'cerebras'
        : this.isGroq
          ? 'groq'
          : this.isOpenCode
            ? 'opencode'
            : 'openai'
    );
    const firstKey = customKeys[0] || this.apiKey || '';
    const activeModel = customConfig?.model
      || (customConfig ? this.getDefaultModel(provider, firstKey) : this.model)
      || this.getDefaultModel(provider, firstKey);

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

    // Tier 1: File nhỏ (<= 500 dòng) -> 1 request duy nhất
    if (allLines.length <= SINGLE_REQUEST_MAX_LINES) {
      const prompt = this.generateSecurityPrompt(code, language);
      try {
        const parsed = await this.requestAi(clientPool[0], activeModel, prompt);
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
          model_used: activeModel
        };
      } catch (err) {
        console.warn('AI Scan lỗi; không kết luận an toàn:', err.message);
        return this.buildIncompleteFallback(code, language, err.message);
      }
    }

    // Tier 2 & Tier 3:
    // File > 3000 dòng: Heuristic pre-filter để lấy các phân đoạn mục tiêu
    // File 500 - 3000 dòng: Chunk 600 dòng, overlap 50 dòng
    let chunks = [];
    let isTargetedScan = false;
    let suspectLineCount = 0;

    if (allLines.length > LARGE_FILE_THRESHOLD) {
      const suspectLines = findSuspectLines(code);
      suspectLineCount = suspectLines.length;
      chunks = buildTargetedChunks(allLines, suspectLines, TARGETED_WINDOW_PADDING, CHUNK_SIZE);
      isTargetedScan = true;
    } else {
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
    }

    const envConcurrency = Number.parseInt(process.env.SCAN_MAX_CONCURRENCY || '', 10);
    const configuredConcurrency = Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : Math.min(DEFAULT_MAX_CONCURRENCY, Math.max(1, clientPool.length * 2));

    let circuitBroken = false;
    let fatalErrorReason = '';

    const chunkResults = await mapWithConcurrency(
      chunks,
      configuredConcurrency,
      async (chunk, chunkIndex) => {
        if (circuitBroken) {
          return {
            ok: false,
            aborted: true,
            error: `Đã hủy do lỗi hệ thống/hạn ngạch (${fatalErrorReason})`,
            startLineNumber: chunk.startLineNumber,
            endLineNumber: chunk.endLineNumber,
            vulnerabilities: [],
            recommendations: [],
            overall_summary: ''
          };
        }

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
          if (isFatalAiError(err)) {
            circuitBroken = true;
            fatalErrorReason = err.message;
          }
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
      },
      () => circuitBroken
    );

    const processedResults = chunkResults.filter(Boolean);
    const failedChunks = processedResults.filter(result => !result.ok);
    const sensitiveFindings = scanSensitiveData(code, language);
    const aggregatedVulns = dedupeVulnerabilities([
      ...processedResults.flatMap(result => result.vulnerabilities || []),
      ...sensitiveFindings
    ]);
    const uniqueRecs = normalizeRecommendations(
      processedResults.flatMap(result => result.recommendations || [])
    );
    const summaries = processedResults
      .filter(result => result.ok && result.overall_summary)
      .map(result => `L${result.startLineNumber}-L${result.endLineNumber}: ${result.overall_summary}`);

    const incomplete = failedChunks.length > 0 || circuitBroken;

    // Nếu tất cả phân đoạn đều lỗi do circuit broken (ví dụ 429 quota/key sai), trả về incomplete fallback có chạy qua Heuristic
    if (circuitBroken && processedResults.filter(r => r.ok).length === 0) {
      return this.buildIncompleteFallback(code, language, `Lỗi hạn ngạch hoặc hệ thống AI: ${fatalErrorReason}`);
    }

    const isSafe = !incomplete && aggregatedVulns.length === 0;

    let overallSummary;
    if (circuitBroken) {
      overallSummary = `Quét AI bị gián đoạn do lỗi hệ thống/hạn ngạch (${fatalErrorReason}). `
        + `Đã dừng sớm các phân đoạn còn lại để tránh lãng phí hạn ngạch API. `
        + `Không thể kết luận mã nguồn an toàn. Đã giữ lại ${aggregatedVulns.length} phát hiện từ các phân đoạn hoàn thành trước đó.`;
    } else if (incomplete) {
      overallSummary = `Quét chưa hoàn tất: ${failedChunks.length}/${chunks.length} phân đoạn lỗi sau khi retry. `
        + `Không thể kết luận mã nguồn an toàn. Đã giữ lại ${aggregatedVulns.length} phát hiện từ các phân đoạn thành công.`;
    } else if (isTargetedScan) {
      overallSummary = aggregatedVulns.length === 0
        ? `Đã rà soát file lớn (${allLines.length} dòng) qua ${chunks.length} phân đoạn mục tiêu (heuristic khoanh vùng ${suspectLineCount} vị trí rủi ro). Không phát hiện lỗ hổng nghiêm trọng.`
        : `Đã rà soát file lớn (${allLines.length} dòng) qua ${chunks.length} phân đoạn mục tiêu. Phát hiện ${aggregatedVulns.length} nguy cơ tiềm ẩn.\n${summaries.join('\n')}`;
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
      is_targeted: isTargetedScan,
      source: isTargetedScan ? 'ai_live_targeted_chunks' : 'ai_live_chunked_parallel',
      model_used: activeModel
    };
  }

  mockAnalysis(code, language) {
    const codeLower = code.toLowerCase();
    const lines = code.split('\n');
    const vulnerabilities = [];

    // Luôn kích hoạt kiểm tra dữ liệu nhạy cảm / Secrets / Tokens trong file
    const sensitiveFindings = scanSensitiveData(code, language);
    vulnerabilities.push(...sensitiveFindings);

    const isPureHtml = language === 'html'
      || codeLower.startsWith('<!doctype html')
      || (codeLower.includes('<html') && !/(innerhtml|outerhtml|insertadjacenthtml|document\.write)/i.test(code));

    const sqlLineIdx = lines.findIndex(line =>
      /\bselect\b/i.test(line)
      && (
        /f["'].*\{.+\}/i.test(line)
        || /\$\{.+\}/.test(line)
        || /\bselect\b.*\+/i.test(line)
        || /\+\s*.*\b(select|where|from)\b/i.test(line)
      )
    );

    if (!isPureHtml && sqlLineIdx >= 0) {
      vulnerabilities.push({
        type: 'SQL Injection',
        severity: 'Cao',
        owasp_category: 'A03:2025 - Injection',
        cwe: 'CWE-89',
        confidence: 'Cao',
        start_line: sqlLineIdx + 1,
        end_line: sqlLineIdx + 1,
        start_column: 1,
        end_column: lines[sqlLineIdx].length + 1,
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
      return /(\$\{|\+\s*\w+|\b(?:user|input|query|param|bio|name|message|content)[A-Za-z0-9_$]*\b)/i.test(line);
    });

    if (!isPureHtml && xssLineIdx >= 0) {
      vulnerabilities.push({
        type: 'Cross-Site Scripting (DOM XSS)',
        severity: 'Cao',
        owasp_category: 'A03:2025 - Injection',
        cwe: 'CWE-79',
        confidence: 'Cao',
        start_line: xssLineIdx + 1,
        end_line: xssLineIdx + 1,
        start_column: 1,
        end_column: lines[xssLineIdx].length + 1,
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
        owasp_category: 'A07:2025 - Authentication Failures',
        cwe: 'CWE-798',
        confidence: 'Cao',
        start_line: secretLineIdx + 1,
        end_line: secretLineIdx + 1,
        start_column: 1,
        end_column: lines[secretLineIdx].length + 1,
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
        owasp_category: 'A03:2025 - Injection',
        cwe: 'CWE-78',
        confidence: 'Cao',
        start_line: commandLineIdx + 1,
        end_line: commandLineIdx + 1,
        start_column: 1,
        end_column: lines[commandLineIdx].length + 1,
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
        owasp_category: 'A01:2025 - Broken Access Control',
        cwe: 'CWE-22',
        confidence: 'Cao',
        start_line: pathLineIdx + 1,
        end_line: pathLineIdx + 1,
        start_column: 1,
        end_column: lines[pathLineIdx].length + 1,
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