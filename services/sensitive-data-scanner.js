/**
 * Sensitive Data & Secret Scanner
 * Chuyên trách phát hiện dữ liệu nhạy cảm, credentials, token, session, cookie flags, và profile artifacts
 * trong cả mã nguồn và tệp cấu hình/dữ liệu tĩnh (JSON, YAML, ENV, Configs, Logs).
 */

// Danh sách tên cookie nhạy cảm / phiên xác thực
const SENSITIVE_COOKIE_NAMES = new Set([
  'phpsessid', 'jsessionid', 'aspsessionid', 'connect.sid', 'session_id', 'sessionid', 'sid',
  '_pat', '_prt', 'tuait4c8', 'logintoken', 'access_token', 'refresh_token', 'authtoken',
  'auth_token', 'token', 'authorization', 'aws-waf-token', 'awsalb', 'awsalbcors', 'cf_clearance'
]);

export function scanSensitiveData(code, language = 'auto') {
  if (!code || typeof code !== 'string') return [];
  const lines = code.split('\n');
  const findings = [];
  const reportedEntries = new Set();

  function addFinding(f) {
    const key = `${f.type}-${f.start_line}-${f.owasp_category}`;
    if (reportedEntries.has(key)) return;
    reportedEntries.add(key);
    findings.push(f);
  }

  // 1. Kiểm tra Credential dạng văn bản rõ (Plaintext Credentials / Passwords / Proxy Auth)
  const proxyPassRegex = /"pass"\s*:\s*"([^"]+)"/i;
  const credentialKeyRegex = /"(?:password|passwd|pass|db_pass|proxy_pass|secret|client_secret)"\s*:\s*"([^"]+)"/i;
  const assignmentSecretRegex = /\b(?:proxy[_-]?pass|db[_-]?pass|password|passwd|secret[_-]?key)\b\s*[:=]\s*["'`]([^"'`]+)["'`]/i;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    if (/(mock|example|placeholder|dummy|changeme|process\.env)/i.test(trimmed)) return;

    const passMatch = trimmed.match(proxyPassRegex) || trimmed.match(credentialKeyRegex) || trimmed.match(assignmentSecretRegex);
    if (passMatch) {
      const val = passMatch[1].trim();
      if (val.length > 0) {
        addFinding({
          type: 'Sensitive Credential Stored in Plaintext',
          severity: 'Cao',
          owasp_category: 'A07:2025 - Authentication Failures',
          cwe: 'CWE-256',
          confidence: 'Cao',
          start_line: lineNum,
          end_line: lineNum,
          line_number: lineNum,
          affected_lines: trimmed,
          explanation: 'Mật khẩu/thông tin xác thực (credential) proxy hoặc tài khoản được lưu trữ dưới dạng văn bản rõ (plaintext) trong tệp dữ liệu mà không được mã hóa.',
          attack_scenario: 'Kẻ tấn công có quyền đọc file cấu hình/profile có thể thu thập trực tiếp mật khẩu proxy hoặc dịch vụ liên quan để thực hiện truy cập trái phép.',
          remediation: 'Không lưu mật khẩu dạng plaintext. Sử dụng giải pháp quản lý bí mật (Secret Manager/Keyring) hoặc mã hóa dữ liệu nhạy cảm bằng AES-256-GCM trước khi lưu trữ.',
          fixed_code: '"pass": "[ENCRYPTED_SECRET_OR_ENV]"'
        });
      }
    }
  });

  // 2. Kiểm tra Authentication & Session Tokens (JWT, PHPSESSID, AWS Token, Long Session Keys)
  const jwtRegex = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    // A. JWT Token
    jwtRegex.lastIndex = 0;
    if (jwtRegex.test(trimmed)) {
      addFinding({
        type: 'Authentication / Session Token Exposed in Data File',
        severity: 'Cao',
        owasp_category: 'A07:2025 - Authentication Failures',
        cwe: 'CWE-522',
        confidence: 'Cao',
        start_line: lineNum,
        end_line: lineNum,
        line_number: lineNum,
        affected_lines: trimmed,
        explanation: 'Phát hiện JWT (JSON Web Token) chứa thông tin phân quyền và phiên đăng nhập được lưu trữ trực tiếp trong tệp dữ liệu.',
        attack_scenario: 'Kẻ tấn công có thể trích xuất JWT để mạo danh phiên đăng nhập của người dùng (Session Hijacking) mà không cần qua bước xác thực.',
        remediation: 'Không lưu JWT token sống trong tệp tĩnh. Thu hồi (revoke) các token đã lộ và lưu trữ token an toàn trong kho mã hóa.',
        fixed_code: '"value": "[REVOKED_AND_ROTATED_TOKEN]"'
      });
      return;
    }

    // B. Session Tokens (PHPSESSID, aws-waf-token, AWSALB, etc.)
    if (/(?:PHPSESSID|JSESSIONID|aws-waf-token|AWSALB|_pat|_prt)/i.test(trimmed)) {
      addFinding({
        type: 'Authentication / Session Token Exposed in Data File',
        severity: 'Cao',
        owasp_category: 'A07:2025 - Authentication Failures',
        cwe: 'CWE-200',
        confidence: 'Cao',
        start_line: lineNum,
        end_line: lineNum,
        line_number: lineNum,
        affected_lines: trimmed,
        explanation: 'Phát hiện mã định danh phiên xác thực nhạy cảm (Session ID / WAF Security Token) được lưu trữ trong tệp.',
        attack_scenario: 'Kẻ tấn công có thể chèn Session ID vào trình duyệt để chiếm đoạt phiên làm việc của người dùng hiện tại.',
        remediation: 'Tránh xuất phiên đăng nhập vào tệp lưu trữ hoặc vô hiệu hóa session ngay sau khi kết thúc phiên.',
        fixed_code: '"value": "[REDACTED_SESSION_TOKEN]"'
      });
    }
  });

  // 3. Kiểm tra Cờ bảo vệ Cookie (Missing Secure / HttpOnly Flags on Session Cookies)
  let currentCookie = null;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    const nameMatch = trimmed.match(/"name"\s*:\s*"([^"]+)"/i);
    if (nameMatch) {
      currentCookie = {
        name: nameMatch[1],
        nameLower: nameMatch[1].toLowerCase(),
        startLine: lineNum,
        secure: null,
        secureLine: 0,
        httpOnly: null,
        httpOnlyLine: 0
      };
    }

    if (currentCookie) {
      if (/"secure"\s*:\s*(true|false)/i.test(trimmed)) {
        currentCookie.secure = /"secure"\s*:\s*true/i.test(trimmed);
        currentCookie.secureLine = lineNum;
      }
      if (/"httpOnly"\s*:\s*(true|false)/i.test(trimmed)) {
        currentCookie.httpOnly = /"httpOnly"\s*:\s*true/i.test(trimmed);
        currentCookie.httpOnlyLine = lineNum;
      }

      // Kết thúc 1 object cookie
      if (trimmed.includes('}') || index === lines.length - 1) {
        const isSensitive = SENSITIVE_COOKIE_NAMES.has(currentCookie.nameLower) ||
          /(?:sess|token|auth|login|jwt|admin|pat|prt)/i.test(currentCookie.nameLower);

        if (isSensitive && (currentCookie.secure === false || currentCookie.httpOnly === false)) {
          const vulnLine = currentCookie.secureLine || currentCookie.httpOnlyLine || currentCookie.startLine;
          const missingFlags = [];
          if (currentCookie.secure === false) missingFlags.push('secure: false');
          if (currentCookie.httpOnly === false) missingFlags.push('httpOnly: false');

          addFinding({
            type: 'Session Cookie Missing Secure / HttpOnly Protection',
            severity: 'Cao',
            owasp_category: 'A02:2025 - Security Misconfiguration',
            cwe: currentCookie.httpOnly === false ? 'CWE-1004' : 'CWE-614',
            confidence: 'Cao',
            start_line: vulnLine,
            end_line: Math.max(vulnLine, currentCookie.httpOnlyLine || vulnLine),
            line_number: vulnLine,
            affected_lines: `Cookie "${currentCookie.name}" (${missingFlags.join(', ')})`,
            explanation: `Cookie phiên nhạy cảm "${currentCookie.name}" bị cấu hình thiếu cờ bảo vệ bắt buộc: ${missingFlags.join(', ')}.`,
            attack_scenario: 'Nếu thiếu Secure, cookie có thể bị gửi qua kênh HTTP không mã hóa dẫn đến rò rỉ. Nếu thiếu HttpOnly, mã độc XSS có thể đọc được cookie qua document.cookie.',
            remediation: 'Thiết lập đầy đủ "secure": true và "httpOnly": true cho mọi cookie xác thực và quản lý phiên người dùng.',
            fixed_code: '"secure": true,\n"httpOnly": true'
          });
        }
        currentCookie = null;
      }
    }
  });

  // 4. Kiểm tra Dữ liệu Duyệt web / Profile Nhạy cảm Lưu trữ Không Mã hóa (historyGz / geo)
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // A. Lịch sử duyệt web nén
    if (/"historyGz"\s*:\s*"([^"]{20,})"/i.test(trimmed)) {
      addFinding({
        type: 'Sensitive Browser/Profile Data Persisted',
        severity: 'Trung bình',
        owasp_category: 'A04:2025 - Cryptographic Failures',
        cwe: 'CWE-359',
        confidence: 'Cao',
        start_line: lineNum,
        end_line: lineNum,
        line_number: lineNum,
        affected_lines: trimmed.slice(0, 100) + '...',
        explanation: 'Lịch sử duyệt web (browser navigation history) được lưu trữ trực tiếp dưới dạng nén GZIP không mã hóa bảo vệ.',
        attack_scenario: 'Bất kỳ ai có quyền truy cập tệp dữ liệu đều có thể giải nén và xem lại toàn bộ URL các trang web người dùng đã truy cập.',
        remediation: 'Mã hóa tệp lưu trữ profile trình duyệt bằng thuật toán mã hóa mạnh (AES-GCM) và xóa bỏ lịch sử duyệt web khi không cần thiết.',
        fixed_code: '"historyGz": "[ENCRYPTED_DATA_PAYLOAD]"'
      });
    }

    // B. Tọa độ GPS chính xác đi kèm thiết bị
    if (/"geo"\s*:\s*\{/i.test(trimmed) || (/"lat"\s*:\s*[\d.]+/i.test(trimmed) && /"lng"\s*:\s*[\d.]+/i.test(trimmed))) {
      addFinding({
        type: 'Sensitive Browser/Profile Data Persisted',
        severity: 'Trung bình',
        owasp_category: 'A04:2025 - Cryptographic Failures',
        cwe: 'CWE-359',
        confidence: 'Trung bình',
        start_line: lineNum,
        end_line: lineNum,
        line_number: lineNum,
        affected_lines: trimmed,
        explanation: 'Tọa độ vị trí địa lý chính xác (GPS Latitude/Longitude) được lưu trữ thô kèm thông tin thiết bị.',
        attack_scenario: 'Thông tin vị trí chính xác có thể bị lợi dụng để xác định vị trí thực tế của người dùng hoặc theo dõi hành trình.',
        remediation: 'Chỉ lưu trữ vị trí ở cấp độ thành phố/vùng hoặc làm mờ tọa độ nếu không thực sự cần độ chính xác cao.',
        fixed_code: '"geo": { "lat": 0.0, "lng": 0.0 }'
      });
    }
  });

  return findings;
}
