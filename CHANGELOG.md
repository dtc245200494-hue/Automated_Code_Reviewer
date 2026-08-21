# CHANGELOG

Tất cả các thay đổi đáng chú ý của dự án này sẽ được ghi lại tại đây.

Định dạng dựa theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/),
và dự án này tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2025-08-21

### 🎉 Phát hành lần đầu (Initial Release)

#### Thêm mới (Added)
- Bot AI tự động rà soát lỗ hổng bảo mật trên Pull Request GitHub
- Phát hiện 10 loại lỗ hổng theo chuẩn OWASP Top 10:
  - SQL Injection
  - Cross-Site Scripting (XSS)
  - Hardcoded Secrets (API Key, Password, Token)
  - Insecure Direct Object Reference (IDOR)
  - Cross-Site Request Forgery (CSRF)
  - Insecure Deserialization
  - Path Traversal
  - Command Injection
  - Sensitive Data Exposure
  - Broken Authentication (hash yếu MD5/SHA1, plain text password)
- Bình luận trực tiếp vào từng dòng code có lỗ hổng trên GitHub PR
- Giải thích lỗ hổng bằng Tiếng Việt, cung cấp kịch bản tấn công và code sửa lỗi mẫu
- Hỗ trợ GitHub Models (miễn phí), OpenAI API, Azure OpenAI, DeepSeek, Gemini
- GitHub Actions workflow tự động kích hoạt khi mở hoặc cập nhật Pull Request
- Giấy phép MIT (OSI-approved)

#### Kỹ thuật (Technical)
- Ngôn ngữ: TypeScript + Node.js
- Framework: Probot (GitHub App framework)
- LLM Integration: OpenAI SDK (tương thích nhiều provider)
- CI/CD: GitHub Actions

---

## [Unreleased]

### Dự kiến trong phiên bản tiếp theo
- [ ] Dashboard web hiển thị thống kê lỗ hổng theo repo
- [ ] Hỗ trợ GitLab CI/CD
- [ ] Báo cáo PDF sau mỗi lần review
- [ ] Tích hợp SARIF output cho GitHub Security tab
