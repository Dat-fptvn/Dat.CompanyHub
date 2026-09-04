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

## Lưu trữ dữ liệu chạy thật (SQLite / PostgreSQL)

API `api_server.js` hiện có thể chạy với:

- SQLite local (`data/company_hub.db`) cho phát triển nhanh.
- PostgreSQL khi `DATABASE_URL` được đặt trong môi trường.

Nếu triển khai lên Render, bạn nên dùng PostgreSQL bền vững và cấu hình `DATABASE_URL` bằng service PostgreSQL của Render hoặc một database hosted khác.

Người dùng mới đăng ký được lưu vào cơ sở dữ liệu với vai trò `member`; mật khẩu được băm bằng `scrypt` trước khi lưu.

Dự án hiện có seed một tài khoản admin nội bộ chỉ để chạy thử; thông tin đăng nhập admin không được xuất bản trong tài liệu này. Khi triển khai thật, hãy sử dụng PostgreSQL với `DATABASE_URL` và tạo tài khoản admin tùy chỉnh.

Chạy dự án qua `http://localhost:8000`, không mở `index.html` trực tiếp, để xác thực và lưu tài liệu hoạt động đúng.

## Phương án PostgreSQL bền vững

API `api_server.js` hiện hỗ trợ:

- SQLite local: dùng cho phát triển nhanh.
- PostgreSQL: dùng biến môi trường `DATABASE_URL` để kết nối.

Để chạy trên Render với lưu trữ bền vững:

1. Tạo PostgreSQL service (hoặc PostgreSQL addon) trên Render.
2. Lấy connection string và đặt vào `DATABASE_URL`.
3. Triển khai lại service để backend tự tạo schema và seed dữ liệu mẫu.

Nếu bạn vẫn muốn giữ tài liệu MySQL cũ, các file trong `database/` là schema/queries tham chiếu cho MySQL, nhưng backend hiện tại mặc định chạy với PostgreSQL hoặc SQLite.

Khi đưa lên production thật, luôn dùng `DATABASE_URL` thay vì file SQLite local, vì Render container có thể bị tái tạo và `data/company_hub.db` không đảm bảo bền lâu.

## Deploy bằng GitHub Actions lên Azure App Service

Workflow `.github/workflows/azure-app-service.yml` sẽ tự động kiểm tra mã nguồn và deploy khi push lên nhánh `master`.

Trong GitHub repository, tạo Environment `production` rồi thêm:

- Variable `AZURE_WEBAPP_NAME`: tên App Service Azure.
- Secret `AZURE_WEBAPP_PUBLISH_PROFILE`: nội dung publish profile tải từ Azure App Service.
- App Service setting `DATABASE_URL`: connection string của Azure Database for PostgreSQL.

Không commit publish profile, mật khẩu hoặc `DATABASE_URL` vào source code.
