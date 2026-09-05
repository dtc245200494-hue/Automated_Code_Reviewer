# 🛡️ AI Security Web Scanner

Ứng dụng Web trực quan cho dự án **AI Security Bot** — Hỗ trợ rà soát lỗ hổng bảo mật mã nguồn theo tiêu chuẩn OWASP Top 10.

---

## 🚀 Tính năng chính

1. **Trình soạn thảo mã nguồn trực tiếp**:
   - Dán code trực tiếp hoặc upload file mã nguồn (`.py`, `.js`, `.ts`, `.php`, `.java`, `.go`, `.cs`, `.sql`,...).
   - Tự động đếm dòng, ký tự và hỗ trợ chọn ngôn ngữ.

2. **Thư viện mẫu lỗ hổng (1-Click Sample)**:
   - Thử nghiệm ngay lập tức các mẫu kinh điển: **SQL Injection, Cross-Site Scripting (XSS), Hardcoded Secrets/API Keys, OS Command Injection, Path Traversal, và Code sạch (Clean Code)**.

3. **Phân tích bảo mật chuyên sâu**:
   - **Tích hợp AI**: Sử dụng OpenAI API, Azure OpenAI hoặc GitHub Models để phân tích ngữ cảnh, phát hiện logic nguy hiểm.
   - **Bộ phân tích Heuristic dự phòng**: Hoạt động mượt mà ngay cả khi chưa cấu hình API Key.
   - **Báo cáo chi tiết**:
     - Mức độ nghiêm trọng (Nghiêm trọng / Cao / Trung bình / Thấp).
     - Danh mục phân loại OWASP Top 10.
     - Vị trí dòng code nghi vấn.
     - Cơ chế hoạt động & **Kịch bản tấn công thực tế (PoC)**.
     - **Code mẫu đã vá an toàn (Remediation)**.

4. **Hướng dẫn tích hợp GitHub Actions & Webhook**: Hướng dẫn 3 bước cấu hình để Bot tự động rà soát Pull Request trên repo GitHub của bạn.

---

## 💻 Cách khởi chạy trực tiếp

### Bước 1: Cài đặt thư viện
```bash
npm install
```

### Bước 2: Cấu hình biến môi trường (Tùy chọn)
Copy file `.env.example` thành `.env`:
```bash
cp .env.example .env
```
Cấu hình API Key của Groq Cloud (miễn phí) hoặc OpenAI:
```env
GROQ_API_KEY=gsk_xxxx...
MODEL=openai/gpt-oss-120b
```
*(Nếu chưa có API Key, hệ thống tự động chạy ở chế độ **Heuristic Engine** để bạn vẫn thử nghiệm đầy đủ các tính năng).*

### Bước 3: Khởi động máy chủ Web
```bash
npm start
```
Mở trình duyệt và truy cập: **[http://localhost:3000](http://localhost:3000)**

---

## 📁 Thư mục phụ lục: `legacy-bot-action/`
Thư mục `legacy-bot-action/` chứa mã nguồn cũ của bot dưới dạng **GitHub Action / GitHub App CI/CD** (lắng nghe webhook và comment trực tiếp trên Pull Request của GitHub). Nếu bạn muốn triển khai bot CI/CD tự động trên GitHub Actions, có thể tham khảo toàn bộ code cũ tại thư mục này.
