-- Các truy vấn dùng cho API (luôn truyền dữ liệu bằng parameter, không nối chuỗi SQL).

-- Đăng ký tài khoản
INSERT INTO users (full_name, email, password_hash, role_id)
VALUES (?, ?, ?, 3);

-- Tìm người dùng khi đăng nhập
SELECT u.id, u.full_name, u.email, u.password_hash, u.is_active, r.code AS role
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.email = ?
LIMIT 1;

-- Cập nhật lần đăng nhập cuối
UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?;

-- Lưu phiên đăng nhập (token_hash là SHA-256 của token thực)
INSERT INTO user_sessions (user_id, token_hash, expires_at)
VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY));

-- Đăng xuất: xóa phiên hiện tại
DELETE FROM user_sessions WHERE token_hash = ?;
