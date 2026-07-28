# Company Hub – Cổng nội bộ doanh nghiệp (Demo)

## Mở trong Visual Studio Code

1. Mở Visual Studio Code.
2. Chọn **File → Open Folder**.
3. Chọn thư mục `rag-chatbot-demo`.
4. Mở file `index.html`.
5. Cài extension **Live Server** (nếu chưa có), sau đó nhấn **Go Live** ở góc dưới bên phải.

Hoặc nháy đúp `index.html` để chạy trực tiếp bằng trình duyệt.

## Chạy API chatbot cục bộ

Mở Terminal trong VS Code tại thư mục dự án và chạy:

```powershell
node api_server.js
```

Sau đó truy cập `http://localhost:8000`. Web và API sẽ chạy cùng lúc. Bạn có thể kiểm tra API tại `http://localhost:8000/api/health`.

API có các endpoint:

- `GET /api/health` — kiểm tra API.
- `GET /api/documents` — lấy danh sách tài liệu mẫu.
- `POST /api/chat` — gửi JSON `{ "question": "Chính sách nghỉ phép?" }`.
- `POST /api/documents` — thêm tài liệu bằng JSON `{ "name": "Tên tài liệu.pdf" }`.

## Cấu trúc source

```text
rag-chatbot-demo/
├── index.html     # Giao diện trang web
├── style.css      # Toàn bộ thiết kế giao diện
├── app.js         # Logic chatbot mẫu và quản lý tài liệu
└── README.md      # Hướng dẫn chạy
```

## Chức năng hiện có

- Dashboard, thông báo nội bộ và danh bạ nhân sự.
- Chatbot tra cứu chính sách có trích dẫn nguồn mô phỏng.
- Tải, tìm kiếm, xóa và kéo-thả tài liệu.
- Gửi và theo dõi yêu cầu hỗ trợ IT/nhân sự/hành chính.
- Tạo nhân viên và thông báo mới (mô phỏng quản trị).
- Chế độ sáng/tối, cài đặt AI và lựa chọn vai trò.

Dữ liệu tạo trong demo được lưu bằng `localStorage` của trình duyệt. Đây là bản frontend; để sử dụng thực tế cần thêm backend, đăng nhập thật, cơ sở dữ liệu, phân quyền máy chủ, mã hóa và tích hợp RAG/AI.

## Lưu trữ dữ liệu chạy thật (SQLite)

API `api_server.js` hiện dùng SQLite tích hợp của Node.js để lưu tập trung người dùng, phiên đăng nhập và metadata tài liệu vào `data/company_hub.db`. File này tự được tạo khi chạy API và đã được loại khỏi Git.

Đăng nhập bằng tài khoản ban đầu: `dat@fpt.vn` / `1234`. Người dùng mới đăng ký được lưu vào SQLite; mật khẩu được băm bằng `scrypt` trước khi lưu.

Chạy dự án qua `http://localhost:8000`, không mở `index.html` trực tiếp, để xác thực và lưu tài liệu hoạt động đúng.

## Phương án MySQL mở rộng

Đã có file [database/schema.sql](database/schema.sql) tạo các bảng `users`, `roles` và `user_sessions` nếu sau này cần chuyển lên MySQL.

1. Mở MySQL Workbench hoặc phpMyAdmin.
2. Chạy toàn bộ file `database/schema.sql`.
3. Sao chép `.env.example` thành `.env` và điền cấu hình MySQL.
4. Khi làm backend thật, API đăng ký phải băm mật khẩu (bcrypt/argon2) trước khi ghi vào `users.password_hash`; không lưu mật khẩu thô.

Các truy vấn tham khảo cho đăng ký, đăng nhập và đăng xuất nằm trong [database/queries.sql](database/queries.sql).

Để chạy ngay trong MySQL Workbench, dùng file [company_hub_workbench.sql](company_hub_workbench.sql).
