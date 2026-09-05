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

## 💻 Cách khởi chạy

### Bước 1: Vào thư mục `web`
```bash
cd web
```

### Bước 2: Cài đặt thư viện (nếu chưa cài)
```bash
npm install
```

### Bước 3: Cấu hình API Key (Tùy chọn)
Nếu muốn sử dụng mô hình AI của OpenAI / Azure / GitHub Models, hãy tạo file `.env` trong thư mục `web` (hoặc ở thư mục gốc `e:\baomat\.env`):
```env
OPENAI_API_KEY=sk-proj-xxxx...
MODEL=gpt-4o-mini
```
*(Nếu chưa có API Key, hệ thống tự động chạy ở chế độ **Heuristic Mock Mode** để bạn thử nghiệm đầy đủ các mẫu).*

### Bước 4: Chạy ứng dụng
```bash
npm start
```

Mở trình duyệt và truy cập: **[http://localhost:3000](http://localhost:3000)**
