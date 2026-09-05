# 🛡️ AI Security Code Reviewer & Web Scanner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub release](https://img.shields.io/badge/Release-v2.0.0-blue.svg)](https://github.com/dtc245200494-hue/Automated_Code_Reviewer/releases)
[![OWASP Top 10](https://img.shields.io/badge/OWASP-Top%2010-red.svg)](https://owasp.org/www-project-top-ten/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.x-green.svg)](https://nodejs.org/)
[![Bug Tracker](https://img.shields.io/badge/Bug_Tracker-GitHub_Issues-orange.svg)](https://github.com/dtc245200494-hue/Automated_Code_Reviewer/issues)

> **Hệ thống trợ lý AI rà soát lỗ hổng bảo mật mã nguồn tự động theo tiêu chuẩn quốc tế OWASP Top 10** — Cung cấp giao diện Web trực quan (Web Scanner) cùng khả năng tích hợp CI/CD Bot tự động trên GitHub.

---

## 📑 BẢNG THÔNG TIN SẢN PHẨM & ĐÁP ỨNG TIÊU CHÍ ĐÁNH GIÁ (PoF)

| Tiêu chí PoF | Hiện trạng dự án | Đường dẫn kiểm chứng |
| :--- | :--- | :--- |
| **1. Quản lý mã nguồn trên Internet (5đ)** | Kho mã nguồn công khai trên GitHub, có đầy đủ Web Viewer, lịch sử commit minh bạch. | [GitHub Repository](https://github.com/dtc245200494-hue/Automated_Code_Reviewer) |
| **2. Cấp phép PMMN chuẩn OSI-approved (10đ)** | Giấy phép **MIT License** (OSI-approved), có bản sao toàn văn LICENSE, có định danh SPDX trong từng file code. | [LICENSE](./LICENSE) |
| **3. Phát hành phiên bản - Release (5đ)** | Có các bản phát hành chính thức theo Semantic Versioning (2.0.0), định dạng nén chuẩn .tar.gz & .zip. | [GitHub Releases](https://github.com/dtc245200494-hue/Automated_Code_Reviewer/releases) |
| **4. Cài đặt & Dịch từ mã nguồn (10đ)** | 100% công cụ nguồn mở tiêu chuẩn (Node.js, 
pm), cấu hình qua file .env, hoạt động độc lập bất kỳ thư mục nào. | [Hướng dẫn cài đặt](#-hướng-dẫn-cài-đặt--chạy-từ-mã-nguồn-building-from-source) |
| **5. Quản lý thư viện & Gói đính kèm (10đ)** | Khai báo chuẩn qua package.json, không sửa mã nguồn thư viện thứ ba, không bundle file nhị phân độc quyền. | [package.json](./package.json) |
| **6. Tài liệu, Bug Tracker & Changelog (10đ)** | Có README.md hướng dẫn chi tiết, CHANGELOG.md theo chuẩn Keep a Changelog, quản lý lỗi qua GitHub Issues. | [CHANGELOG.md](./CHANGELOG.md) & [GitHub Issues](https://github.com/dtc245200494-hue/Automated_Code_Reviewer/issues) |

---

## 🎯 1. GIỚI THIỆU & TÍNH NGUYÊN GỐC CỦA GIẢI PHÁP (ORIGINALITY)

### 💡 Bối cảnh & Vấn đề
Trong quy trình phát triển phần mềm hiện đại (DevSecOps), việc phát hiện sớm các lỗ hổng bảo mật trước khi đưa lên môi trường Production là cực kỳ cấp thiết. Các công cụ SAST truyền thống (SonarQube, Snyk, Bandit) thường:
- Dựa trên quy tắc tĩnh cứng nhắc (Regex, AST Pattern), dẫn đến **tỷ lệ dương tính giả (False Positive) rất cao**.
- Không hiểu được ngữ cảnh kinh doanh (Business Logic Flaws) hoặc luồng dữ liệu phức tạp.
- Chỉ đưa ra cảnh báo khô khan bằng tiếng Anh, lập trình viên mới/sinh viên khó hiểu được bản chất và cách sửa.

### 🌟 Giải pháp sáng tạo của AI Security Bot
1. **Phân tích ngữ cảnh sâu bằng Large Language Model (LLM)**: Kết hợp mô hình ngôn ngữ lớn (openai/gpt-oss-120b, Groq Cloud, GitHub Models) để đọc hiểu logic mã nguồn, xác định chính xác đường đi của dữ liệu từ nguồn không tin cậy.
2. **Động cơ phân tích kép (Dual-Engine Architecture)**:
   - **AI Live Engine**: Đưa ra phân tích chuyên sâu, kịch bản tấn công (PoC) và mã vá mẫu (Remediation) hoàn toàn bằng **Tiếng Việt**.
   - **Heuristic Rule Engine**: Hoạt động dự phòng độc lập, phân tích siêu tốc mà không cần kết nối mạng hoặc API Key.
3. **Trải nghiệm lập trình viên (Developer Experience - DX) trực quan**:
   - Giao diện **Split Layout độc lập (chuẩn phong cách VS Code)**: Khung code và khung báo cáo cuộn riêng biệt, không bị che khuất.
   - **Đánh số dòng và bôi đỏ trực quan (Line-level Highlighting)**: Nút **🔍 Xem ngay dòng X ➔** giúp lập trình viên định vị và nhảy ngay tới dòng lỗi kèm hiệu ứng ánh sáng Neon.
   - Quét trực tiếp nguyên cả kho lưu trữ GitHub bất kỳ thông qua URL chỉ với 1 cú nhấp chuột.

---

## 🛡️ 2. PHẠM VI BẢO MẬT & DANH MỤC OWASP TOP 10 ĐƯỢC HỖ TRỢ

Hệ thống tập trung rà soát và khắc phục các nhóm lỗ hổng nguy hiểm nhất:
1. **A01: Broken Access Control (Kiểm soát truy cập bị phá vỡ)**: IDOR, Bypass xác thực, Path Traversal (../).
2. **A02: Cryptographic Failures (Lỗi mật mã)**: Sử dụng thuật toán băm yếu (MD5, SHA-1), mã hóa đối xứng không an toàn (DES, ECB mode).
3. **A03: Injection (Lỗ hổng chèn ép)**: SQL Injection (ghép chuỗi thô), Command Injection (exec, child_process), LDAP/NoSQL Injection.
4. **A04: Insecure Design (Thiết kế không an toàn)**: Không kiểm tra giới hạn tỉ lệ (Rate limit), luồng thanh toán thiếu xác thực.
5. **A05: Security Misconfiguration (Cấu hình sai bảo mật)**: Bật chế độ Debug ngoài Production, CORS cấu hình * cùng credentials.
6. **A06: Vulnerable and Outdated Components (Thành phần lỗi thời)**: Sử dụng phiên bản thư viện tồn tại CVE nghiêm trọng.
7. **A07: Identification and Authentication Failures (Lỗi xác thực & phiên làm việc)**: Hardcoded Secrets/API Keys/Tokens, Mật khẩu plain-text, Session Timeout không hợp lệ.
8. **A08: Software and Data Integrity Failures (Lỗi toàn vẹn dữ liệu)**: Insecure Deserialization (pickle.loads, unserialize).
9. **A09: Security Logging and Monitoring Failures (Lỗi ghi log)**: Log thông tin nhạy cảm của người dùng (PII, Password, Token).
10. **A10: Server-Side Request Forgery (SSRF)**: Gọi API tới IP nội bộ (127.0.0.1, 169.254.169.254) theo tham số người dùng.

---

## 💻 3. HƯỚNG DẪN CÀI ĐẶT & CHẠY TỪ MÃ NGUỒN (BUILDING FROM SOURCE)

Dự án sử dụng 100% các công cụ nguồn mở tiêu chuẩn, không phụ thuộc vào bất kỳ phần mềm đóng gói nguồn đóng nào.

### 3.1. Yêu cầu môi trường
- **Node.js**: Phiên bản >= 18.0.0 (LTS khuyến nghị)
- **npm**: Phiên bản >= 9.0.0
- Hệ điều hành: Windows, macOS, Ubuntu/Linux (Độc lập nền tảng - Cross-platform)

### 3.2. Quy trình cài đặt chi tiết

`ash
# 1. Tải mã nguồn từ GitHub
git clone https://github.com/dtc245200494-hue/Automated_Code_Reviewer.git
cd Automated_Code_Reviewer

# 2. Cài đặt các thư viện phụ thuộc nguồn mở
npm install

# 3. Cấu hình biến môi trường trước khi chạy (Configuration prior to building/running)
cp .env.example .env
`

Mở tệp .env để cấu hình:
`env
# Cấu hình API Key AI (Khuyên dùng Groq Cloud miễn phí, siêu tốc)
GROQ_API_KEY=gsk_your_key_here
MODEL=openai/gpt-oss-120b

# Cổng lắng nghe Web Server
WEB_PORT=3000

# Ngôn ngữ báo cáo
LANGUAGE=Tiếng Việt
`
*(Ghi chú: Nếu không điền API Key, hệ thống sẽ tự động kích hoạt **Heuristic Engine** mô phỏng sẵn để trải nghiệm đầy đủ các tính năng mà không phát sinh lỗi).*

### 3.3. Khởi động chương trình
`ash
npm start
`
Truy cập ứng dụng tại trình duyệt: **http://localhost:3000**

---

## 📦 4. DANH MỤC THƯ VIỆN & QUẢN LÝ PHỤ THUỘC (DEPENDENCY MANAGEMENT)

Dự án chỉ sử dụng các thư viện chuẩn nguồn mở được cộng đồng kiểm định, không can thiệp hay sửa đổi mã nguồn của các gói đính kèm:
- **express (v4.19.2)**: Khung ứng dụng Web HTTP tối giản, ổn định và hiệu năng cao.
- **cors (v2.8.5)**: Middleware xử lý chia sẻ tài nguyên nguồn gốc chéo an toàn.
- **dotenv (v16.4.5)**: Tải cấu hình biến môi trường an toàn từ file .env.
- **openai (v4.57.0)**: Bộ SDK chuẩn kết nối với các API LLM tương thích OpenAI (Groq, OpenAI, Azure, DeepSeek).

---

## 🤖 5. KHẢ NĂNG TÍCH HỢP AI (AI INTEGRATION)

1. **Prompt Engineering chuyên sâu**:
   - Hệ thống truyền mã nguồn được đánh chỉ số dòng cụ thể [L1] ... [L45] giúp AI định vị chuẩn xác dòng lỗi đến từng ký tự.
   - Ép buộc khuôn mẫu đầu ra JSON với schema chuẩn: is_safe, ulnerabilities (line_number, severity, 	ype, explanation, ttack_scenario, ixed_code).
2. **Hỗ trợ đa nhà cung cấp LLM**:
   - Hỗ trợ Groq Cloud API (openai/gpt-oss-120b, llama-3.3-70b-versatile) với tốc độ phản hồi cực nhanh (~1.5s/file).
   - Tương thích với OpenAI (gpt-4o, gpt-4o-mini), GitHub Models (miễn phí), và Azure OpenAI.

---

## 📁 6. CẤU TRÚC DỰ ÁN (PROJECT STRUCTURE)

`
Automated_Code_Reviewer/
├── data/
│   └── samples.js             # Thư viện mẫu lỗ hổng OWASP 1-Click
├── public/                    # Giao diện Web Dashboard (Frontend)
│   ├── app.js                 # Xử lý logic, Tree navigation, Highlight dòng lỗi
│   ├── index.html             # Cấu trúc giao diện Split Layout VS Code
│   └── style.css              # Cyber Dark theme, hiệu ứng Neon & Responsive
├── services/                  # Các dịch vụ xử lý nền tảng (Backend)
│   ├── github.js              # Tải cấu trúc cây thư mục từ GitHub API
│   └── scanner.js             # Dual-Engine: Groq AI & Heuristic Engine
├── legacy-bot-action/         # [Phụ lục] Mã nguồn cũ GitHub Action / GitHub App CI/CD
├── .env.example               # Tệp cấu hình mẫu
├── CHANGELOG.md               # Lịch sử thay đổi phiên bản theo chuẩn SemVer
├── LICENSE                    # Giấy phép bản quyền nguồn mở MIT (OSI-approved)
├── package.json               # Khai báo cấu hình dự án & thư viện
├── README.md                  # Tài liệu hướng dẫn chính thức của dự án
└── server.js                  # Điểm khởi chạy máy chủ Express
`

---

## 🤝 7. ĐÓNG GÓP & QUẢN LÝ LỖI (CONTRIBUTING & BUG TRACKER)

- **Báo cáo lỗi & Đề xuất tính năng (Bug Tracker)**: Sử dụng hệ thống [GitHub Issues](https://github.com/dtc245200494-hue/Automated_Code_Reviewer/issues) để gửi phản hồi, yêu cầu hỗ trợ hoặc báo lỗi.
- **Quy trình đóng góp (Contribution Workflow)**:
  1. Fork repository về tài khoản cá nhân.
  2. Tạo nhánh tính năng mới (git checkout -b feature/tinh-nang-moi).
  3. Commit các thay đổi (git commit -m 'feat: them tinh nang moi').
  4. Đẩy lên nhánh của bạn (git push origin feature/tinh-nang-moi).
  5. Tạo một **Pull Request** để được rà soát và hợp nhất.

---

## 📜 8. BẢN QUYỀN & GIẤY PHÉP (LICENSE)

Dự án được phân phối hoàn toàn theo các điều khoản của **[Giấy phép MIT (MIT License)](./LICENSE)** — một giấy phép phần mềm mã nguồn mở được phê duyệt bởi **Tổ chức Sáng kiến Nguồn Mở (OSI - Open Source Initiative)**.
