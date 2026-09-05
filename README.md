# 🔐 AI Security Bot — Trợ lý Rà soát Lỗ hổng Bảo mật Tự động

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Supported-blue)](https://github.com/features/actions)
[![OWASP Top 10](https://img.shields.io/badge/OWASP-Top%2010-red)](https://owasp.org/www-project-top-ten/)

> Bot AI tích hợp trực tiếp vào GitHub, tự động rà soát và bình luận các lỗ hổng bảo mật trong Pull Request.

---

## 🎯 Mục tiêu

Khi sinh viên/developer mở một **Pull Request**, Bot AI sẽ tự động:
1. Đọc toàn bộ code thay đổi (git diff)
2. Phân tích và phát hiện các lỗ hổng bảo mật phổ biến theo OWASP Top 10
3. **Bình luận trực tiếp vào đúng dòng code** có vấn đề trên GitHub
4. Giải thích cơ chế tấn công và đưa ra code sửa lỗi mẫu bằng **Tiếng Việt**

---

## 🛡️ Các lỗ hổng được phát hiện (OWASP Top 10)

| # | Lỗ hổng | Mô tả |
|---|---------|-------|
| 1 | **SQL Injection** | Truy vấn SQL ghép nối trực tiếp với input người dùng |
| 2 | **Cross-Site Scripting (XSS)** | Render HTML/DOM từ input không được sanitize |
| 3 | **Hardcoded Secrets** | API Key, Password, Token viết cứng trong code |
| 4 | **IDOR** | Truy cập tài nguyên qua ID mà không kiểm tra quyền |
| 5 | **CSRF** | Request thay đổi trạng thái không có CSRF token |
| 6 | **Insecure Deserialization** | Deserialize dữ liệu không tin cậy từ người dùng |
| 7 | **Path Traversal** | Đường dẫn file xây dựng từ input không validate |
| 8 | **Command Injection** | Lệnh OS xây dựng từ input người dùng |
| 9 | **Sensitive Data Exposure** | Log ra thông tin nhạy cảm (password, token, PII) |
| 10 | **Broken Authentication** | Mật khẩu plain text, hash yếu (MD5, SHA1) |

---

## 📋 Ví dụ kết quả

Khi Bot phát hiện lỗ hổng, nó sẽ bình luận trực tiếp vào dòng code:

> 🚨 **Loại lỗ hổng:** SQL Injection  
> ⚠️ **Mức độ nghiêm trọng:** Cao  
> 📖 **Giải thích:** Truy vấn SQL được ghép nối trực tiếp với biến `username` từ người dùng, không qua bất kỳ cơ chế lọc hay tham số hóa nào.  
> 💥 **Kịch bản tấn công:** Kẻ tấn công có thể nhập `' OR '1'='1` để bypass xác thực.  
> ✅ **Cách sửa:** Sử dụng Prepared Statements:
> ```python
> cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
> ```

---

## ⚡ Cài đặt

### Yêu cầu hệ thống
- Node.js >= 18.x
- npm >= 9.x
- Tài khoản GitHub

### Bước 1: Clone và Build từ mã nguồn

```bash
# Clone repo
git clone https://github.com/dtc245200494-hue/Automated_Code_Reviewer.git
cd Automated_Code_Reviewer

# Cài đặt dependencies
npm install

# Build từ mã nguồn TypeScript sang JavaScript
npm run build

# (Tuỳ chọn) Chạy tests
npm test
```

### Bước 2: Cấu hình biến môi trường

Copy file `.env.example` thành `.env` và điền thông tin:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:
```env
# GitHub App credentials (nếu chạy self-hosted)
APP_ID=your_github_app_id
PRIVATE_KEY=your_private_key_pem_content
WEBHOOK_SECRET=your_webhook_secret

# LLM API Key (chọn 1 trong các cách sau)
OPENAI_API_KEY=your_openai_api_key
# Hoặc dùng GitHub Models (miễn phí, không cần key)
USE_GITHUB_MODELS=true
```

### Bước 3: Chạy Bot & Giao diện Web Dashboard

#### Cách A: Chạy Web Dashboard trực quan (Khuyên dùng)
```bash
cd web
npm install
npm start
# Mở trình duyệt truy cập: http://localhost:3000
```
*Tính năng Web Dashboard:* Dán code quét trực tiếp, tải thư mục từ máy tính, quét nguyên repo GitHub bất kỳ, bôi đỏ dòng code lỗi theo OWASP Top 10.

#### Cách B: Chạy Bot GitHub App CI/CD
```bash
# Chạy với pm2 (production)
npm install -g pm2
pm2 start pm2.config.cjs

# Hoặc chạy trực tiếp (development)
npm run start
```

---

## 🚀 Tích hợp vào repo của bạn qua GitHub Actions (Cách nhanh nhất)

Copy file `.github/workflows/security-review.yml` vào repo của bạn. **Không cần cài đặt gì thêm nếu dùng GitHub Models (miễn phí).**

```yaml
name: 🔐 AI Security Code Review
on:
  pull_request:
    types: [opened, reopened, synchronize]
jobs:
  security-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      models: read
    steps:
      - uses: anc95/ChatGPT-CodeReview@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          USE_GITHUB_MODELS: true
          LANGUAGE: Tiếng Việt
```

---

## 🔧 Cấu hình nâng cao

| Biến môi trường | Mô tả | Mặc định |
|---|---|---|
| `USE_GITHUB_MODELS` | Dùng GitHub Models miễn phí | `true` |
| `MODEL` | Mô hình AI sử dụng | `openai/gpt-4o-mini` |
| `LANGUAGE` | Ngôn ngữ phản hồi | `Tiếng Việt` |
| `MAX_PATCH_LENGTH` | Giới hạn độ dài diff (ký tự) | `10000` |
| `IGNORE_PATTERNS` | Pattern file cần bỏ qua (glob/regex) | `*.md,*.lock,...` |
| `OPENAI_API_KEY` | API Key nếu không dùng GitHub Models | — |
| `OPENAI_API_ENDPOINT` | Custom endpoint (Gemini, DeepSeek...) | `https://api.openai.com/v1` |

---

## 📁 Cấu trúc dự án

```
Automated_Code_Reviewer/
├── src/
│   ├── bot.ts          # Logic chính: đọc PR, gọi AI, đăng comment
│   ├── chat.ts         # Kết nối LLM API + Security Prompt chuyên biệt
│   ├── index.ts        # Entry point
│   └── log.ts          # Logger
├── .github/
│   └── workflows/
│       └── security-review.yml  # GitHub Actions workflow
├── action/             # GitHub Action build output
├── action.yml          # Định nghĩa GitHub Action công khai
├── package.json        # Dependencies và scripts
├── tsconfig.json       # TypeScript configuration
├── CHANGELOG.md        # Lịch sử thay đổi
├── LICENSE             # MIT License (OSI-approved)
└── README.md           # Tài liệu này
```

---

## 🐛 Báo cáo lỗi & Đóng góp

- **Bug Tracker:** [GitHub Issues](../../issues) — Vui lòng mở issue khi gặp lỗi
- **Đóng góp:** Xem [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Changelog:** Xem [CHANGELOG.md](./CHANGELOG.md)

---

## 📄 License

[MIT](LICENSE) © 2025 dtc245200494-hue — AI Security Bot Contributors

> Dự án này được phát hành theo giấy phép MIT. Xem file [LICENSE](./LICENSE) để biết thêm chi tiết.
