# CHANGELOG

Tất cả các thay đổi đáng chú ý của dự án **AI Security Code Reviewer & Web Scanner** được ghi lại tại đây.
Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/) và tuân thủ [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-09-05 (Bản dự thi chính thức)

### 🌟 Tính năng mới (Added)
- **Giao diện Web Dashboard trực quan (Cyber Dark Theme)**:
  - Cho phép lập trình viên dán mã nguồn trực tiếp để kiểm tra tức thì.
  - Tải lên từng tệp tin lẻ hoặc **tải nguyên cả thư mục dự án (Project Folder)** từ máy tính cá nhân.
  - **Quét trực tiếp kho lưu trữ GitHub bất kỳ (GitHub Repo Scanner)** qua URL mà không cần cài đặt ứng dụng vào repository.
- **Hệ thống điều hướng & Đánh dấu trực quan (Line-level Highlighting & Navigation)**:
  - Bố cục Split Layout độc lập (chuẩn phong cách VS Code), thanh cuộn độc lập giữa khung Code và khung Báo cáo.
  - Tự động đánh số thứ tự dòng và bôi đỏ nổi bật (Neon Alert) ngay tại dòng code bị dính lỗ hổng.
  - Nút bấm **"🔍 Xem ngay dòng X ➔"** tự động cuộn mượt và làm sáng dòng code lỗi.
- **Hệ thống quản lý Lịch sử quét thông minh (Scan History)**:
  - Lưu trữ lịch sử phân cấp theo từng Thư mục / File trên LocalStorage.
  - Hỗ trợ xem lại Báo cáo tổng thể Dashboard hoặc mở lại chi tiết từng file mã nguồn.
- **Thư viện mẫu thử nghiệm 1-Click (OWASP Top 10 Samples)**:
  - Tích hợp sẵn 6 mẫu mã nguồn thực tế: SQLi, XSS, Hardcoded Secrets, Command Injection, Path Traversal và Mã nguồn sạch.
- **Động cơ phân tích kép (Dual-Engine)**:
  - Tích hợp mô hình AI thế hệ mới qua Groq Cloud / OpenAI (openai/gpt-oss-120b).
  - Tích hợp sẵn **Heuristic Engine dự phòng cục bộ**, hoạt động ngay cả khi ngoại tuyến hoặc không có API Key.

### 🔄 Thay đổi kiến trúc (Changed)
- Chuyển giao diện Web thành ứng dụng trung tâm ở thư mục gốc để dễ dàng cài đặt và sử dụng (
pm start).
- Di chuyển toàn bộ mô-đun GitHub Action & Probot cũ vào thư mục đính kèm legacy-bot-action/.

---

## [1.0.0] - 2025-08-21 (Bản phát hành đầu tiên)

### 🎉 Tính năng ban đầu (Initial Release)
- Bot AI tự động rà soát lỗ hổng bảo mật trên Pull Request GitHub.
- Phát hiện 10 nhóm lỗ hổng bảo mật phổ biến theo chuẩn OWASP Top 10.
- Tự động bình luận trực tiếp vào dòng code bị lỗ hổng trong Pull Request.
- Đưa ra giải thích cơ chế, kịch bản tấn công (PoC) và mã vá mẫu an toàn bằng Tiếng Việt.
- Giấy phép nguồn mở MIT License (chuẩn OSI-approved).
