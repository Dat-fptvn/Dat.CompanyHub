-- COMPANY HUB - MYSQL WORKBENCH SETUP
-- Cách dùng: Mở file này bằng MySQL Workbench và bấm biểu tượng tia sét (Execute).
-- MySQL 8.0+ | Charset UTF-8 tiếng Việt

CREATE DATABASE IF NOT EXISTS company_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE company_hub;

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (id, code, name) VALUES
  (1, 'admin', 'Quản trị viên'),
  (2, 'manager', 'Quản lý'),
  (3, 'employee', 'Nhân viên')
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_active (is_active)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Chung',
  file_path VARCHAR(500) NULL,
  mime_type VARCHAR(100) NULL,
  file_size BIGINT UNSIGNED NULL,
  status ENUM('Đang lập chỉ mục', 'Đã lập chỉ mục', 'Lỗi') NOT NULL DEFAULT 'Đang lập chỉ mục',
  uploaded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_documents_category (category),
  INDEX idx_documents_status (status)
);

-- Tài liệu mẫu
INSERT INTO documents (name, category, status) VALUES
  ('Sổ tay nhân viên 2026', 'Nhân sự', 'Đã lập chỉ mục'),
  ('Quy định làm việc từ xa', 'Nhân sự', 'Đã lập chỉ mục'),
  ('Quy trình cấp thiết bị', 'Công nghệ', 'Đã lập chỉ mục');

-- KIỂM TRA SAU KHI CHẠY
SELECT 'Database created successfully' AS result;
SELECT * FROM roles;
SELECT id, name, category, status, created_at FROM documents;

-- LƯU Ý BẢO MẬT:
-- Không dùng lệnh INSERT để lưu mật khẩu dạng văn bản.
-- Backend phải băm mật khẩu bằng bcrypt hoặc argon2 rồi mới ghi vào users.password_hash.
