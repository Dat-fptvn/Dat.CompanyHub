/**
 * Company Hub API — lưu người dùng, phiên đăng nhập và tài liệu trong SQLite.
 * Chạy: node api_server.js | Mở: http://localhost:8000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const baseDir = __dirname;
const dataDir = path.join(baseDir, 'data');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8000);
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'company_hub.db'));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Chung',
    status TEXT NOT NULL DEFAULT 'Đã lập chỉ mục', uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL, priority TEXT NOT NULL,
    description TEXT, date TEXT NOT NULL DEFAULT 'Hôm nay', status TEXT NOT NULL DEFAULT 'Đang xử lý',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL,
    initial TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );
`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}
function seedDatabase() {
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get('dat@fpt.vn')) {
    db.prepare('INSERT INTO users (full_name,email,password_hash,role) VALUES (?,?,?,?)').run('Đạt FPT', 'dat@fpt.vn', hashPassword('1234'), 'admin');
  }
  if (db.prepare('SELECT COUNT(*) AS total FROM documents').get().total === 0) {
    const add = db.prepare('INSERT INTO documents (name,category) VALUES (?,?)');
    add.run('Sổ tay nhân viên 2026', 'Nhân sự'); add.run('Quy định làm việc từ xa', 'Nhân sự'); add.run('Quy trình cấp thiết bị', 'Công nghệ');
  }
  if (db.prepare('SELECT COUNT(*) AS total FROM tickets').get().total === 0) {
    const add = db.prepare('INSERT INTO tickets (title,type,priority,date,status,description) VALUES (?,?,?,?,?,?)');
    add.run('Cấp quyền phần mềm thiết kế', 'Hỗ trợ IT', 'Bình thường', 'Hôm nay', 'Đang xử lý', 'Cấp quyền thiết kế cho nhóm vận hành.');
    add.run('Kiểm tra máy in tầng 3', 'Hỗ trợ IT', 'Cao', 'Hôm qua', 'Đang xử lý', 'Kiểm tra máy in trước buổi họp.');
  }
  if (db.prepare('SELECT COUNT(*) AS total FROM announcements').get().total === 0) {
    const add = db.prepare('INSERT INTO announcements (title,body,date) VALUES (?,?,?)');
    add.run('Kế hoạch nghỉ lễ Quốc khánh', 'Công ty thông báo lịch nghỉ lễ Quốc khánh. Vui lòng hoàn tất các công việc đang phụ trách trước thời gian nghỉ.', 'Hôm nay · Phòng Nhân sự');
    add.run('Cập nhật quy trình bảo mật thông tin', 'Quy định bảo mật thông tin phiên bản mới đã được cập nhật trong kho tài liệu. Toàn bộ nhân viên cần đọc và xác nhận.', 'Hôm qua · Phòng Công nghệ');
  }
  if (db.prepare('SELECT COUNT(*) AS total FROM employees').get().total === 0) {
    const add = db.prepare('INSERT INTO employees (name,role,department,initial) VALUES (?,?,?,?)');
    add.run('Nguyễn Minh Anh', 'Trưởng phòng Nhân sự', 'Nhân sự', 'MA');
    add.run('Trần Quốc Bảo', 'Kỹ sư phần mềm', 'Công nghệ', 'QB');
    add.run('Lê Thu Hà', 'Chuyên viên Marketing', 'Marketing', 'TH');
  }
}
seedDatabase();

function publicUser(user) { return { id: user.id, name: user.full_name, email: user.email, role: user.role }; }
function publicTicket(row) { return { id: row.id, title: row.title, type: row.type, priority: row.priority, description: row.description || '', date: row.date, status: row.status }; }
function publicAnnouncement(row) { return { id: row.id, title: row.title, body: row.body, date: row.date }; }
function publicEmployee(row) { return { id: row.id, name: row.name, role: row.role, department: row.department, initial: row.initial }; }
function makeToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)').run(userId, tokenHash, expires);
  return token;
}
function currentUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return db.prepare(`SELECT u.id,u.full_name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?`).get(tokenHash, new Date().toISOString());
}
function answer(question) {
  const q = question.toLowerCase();
  if (q.includes('nghỉ')) return ['Nhân viên có 12 ngày nghỉ phép năm hưởng lương. Hãy gửi yêu cầu nghỉ trước ít nhất 3 ngày làm việc.', 'Sổ tay nhân viên 2026 · Trang 12'];
  if (q.includes('thiết bị')) return ['Tạo yêu cầu trên cổng nội bộ, chọn loại thiết bị và nêu rõ nhu cầu. Quản lý sẽ phê duyệt trước khi IT xử lý.', 'Quy trình cấp thiết bị · Trang 2'];
  if (q.includes('từ xa') || q.includes('remote')) return ['Bạn có thể đăng ký làm việc từ xa tối đa 2 ngày mỗi tuần, sau khi được quản lý trực tiếp phê duyệt.', 'Quy định làm việc từ xa · Trang 3'];
  return ['Tôi chưa tìm thấy thông tin phù hợp trong tài liệu hiện có. Vui lòng diễn đạt lại hoặc gửi yêu cầu hỗ trợ.', 'Không có nguồn phù hợp'];
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' }); res.end(JSON.stringify(payload)); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON không hợp lệ')); } }); }); }
function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: 'Vui lòng đăng nhập.' }); return null; } return user; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' }); return res.end(); }
  if (req.method === 'GET' && url === '/api/health') return json(res, 200, { status: 'ok', database: 'SQLite', service: 'company-hub-api' });
  if (req.method === 'POST' && url === '/api/auth/register') { try { const { name, email, password } = await readBody(req); if (!name || !email || !password || password.length < 4) return json(res, 400, { error: 'Tên, email và mật khẩu từ 4 ký tự là bắt buộc.' }); if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return json(res, 409, { error: 'Email đã được đăng ký.' }); const result = db.prepare('INSERT INTO users (full_name,email,password_hash) VALUES (?,?,?)').run(name.trim(), email.trim().toLowerCase(), hashPassword(password)); const user = db.prepare('SELECT id,full_name,email,role FROM users WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { user: publicUser(user), token: makeToken(user.id) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'POST' && url === '/api/auth/login') { try { const { email, password } = await readBody(req); const user = db.prepare('SELECT id,full_name,email,password_hash,role FROM users WHERE email=?').get(String(email || '').trim()); if (!user || !verifyPassword(String(password || ''), user.password_hash)) return json(res, 401, { error: 'Email hoặc mật khẩu chưa đúng.' }); db.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id); return json(res, 200, { user: publicUser(user), token: makeToken(user.id) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'POST' && url === '/api/auth/logout') { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex')); return json(res, 200, { message: 'Đã đăng xuất.' }); }
  if (req.method === 'GET' && url === '/api/me') { const user = requireUser(req, res); if (user) return json(res, 200, { user: publicUser(user) }); return; }
  if (req.method === 'GET' && url === '/api/state') { const user = requireUser(req, res); if (!user) return; const documents = db.prepare('SELECT id,name,category,status,created_at FROM documents ORDER BY id DESC').all(); const tickets = db.prepare('SELECT id,title,type,priority,description,date,status FROM tickets ORDER BY id DESC').all(); const announcements = db.prepare('SELECT id,title,body,date FROM announcements ORDER BY id DESC').all(); const employees = db.prepare('SELECT id,name,role,department,initial FROM employees ORDER BY id DESC').all(); return json(res, 200, { documents, tickets: tickets.map(publicTicket), announcements: announcements.map(publicAnnouncement), employees: employees.map(publicEmployee) }); }
  if (url === '/api/documents' && req.method === 'GET') { const user = requireUser(req, res); if (!user) return; const documents = db.prepare('SELECT id,name,category,status,created_at FROM documents ORDER BY id DESC').all(); return json(res, 200, { documents }); }
  if (url === '/api/documents' && req.method === 'POST') { const user = requireUser(req, res); if (!user) return; try { const { name, category = 'Chung' } = await readBody(req); if (!name || !String(name).trim()) return json(res, 400, { error: 'Tên tài liệu là bắt buộc.' }); const result = db.prepare('INSERT INTO documents (name,category,uploaded_by) VALUES (?,?,?)').run(String(name).trim(), String(category).trim(), user.id); const document = db.prepare('SELECT id,name,category,status,created_at FROM documents WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { document }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'DELETE' && url.startsWith('/api/documents/')) { const user = requireUser(req, res); if (!user) return; const docId = Number(url.split('/').pop()); if (!Number.isInteger(docId) || docId <= 0) return json(res, 400, { error: 'ID tài liệu không hợp lệ.' }); const existing = db.prepare('SELECT id FROM documents WHERE id=?').get(docId); if (!existing) return json(res, 404, { error: 'Không tìm thấy tài liệu.' }); db.prepare('DELETE FROM documents WHERE id=?').run(docId); return json(res, 200, { deleted: true, id: docId }); }
  if (req.method === 'POST' && url === '/api/tickets') { const user = requireUser(req, res); if (!user) return; try { const { title, type, priority, description = '', date = 'Hôm nay' } = await readBody(req); if (!title || !String(title).trim()) return json(res, 400, { error: 'Tiêu đề là bắt buộc.' }); const result = db.prepare('INSERT INTO tickets (title,type,priority,description,date,created_by) VALUES (?,?,?,?,?,?)').run(String(title).trim(), String(type || 'Hỗ trợ IT').trim(), String(priority || 'Bình thường').trim(), String(description).trim(), String(date).trim(), user.id); const ticket = db.prepare('SELECT id,title,type,priority,description,date,status FROM tickets WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { ticket: publicTicket(ticket) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'POST' && url === '/api/announcements') { const user = requireUser(req, res); if (!user) return; try { const { title, body = '', date = 'Hôm nay · Quản trị viên' } = await readBody(req); if (!title || !String(title).trim()) return json(res, 400, { error: 'Tiêu đề thông báo là bắt buộc.' }); const result = db.prepare('INSERT INTO announcements (title,body,date,created_by) VALUES (?,?,?,?)').run(String(title).trim(), String(body).trim(), String(date).trim(), user.id); const announcement = db.prepare('SELECT id,title,body,date FROM announcements WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { announcement: publicAnnouncement(announcement) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'POST' && url === '/api/employees') { const user = requireUser(req, res); if (!user) return; try { const { name, role = 'Nhân viên', department = 'Chưa xác định', initial = '' } = await readBody(req); if (!name || !String(name).trim()) return json(res, 400, { error: 'Tên nhân viên là bắt buộc.' }); const preparedInitial = String(initial || name.split(' ').map(part => part[0]).slice(-2).join('').toUpperCase()).trim(); const result = db.prepare('INSERT INTO employees (name,role,department,initial,created_by) VALUES (?,?,?,?,?)').run(String(name).trim(), String(role).trim(), String(department).trim(), preparedInitial, user.id); const employee = db.prepare('SELECT id,name,role,department,initial FROM employees WHERE id=?').get(result.lastInsertRowid); return json(res, 201, { employee: publicEmployee(employee) }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'POST' && url === '/api/chat') { const user = requireUser(req, res); if (!user) return; try { const { question = '' } = await readBody(req); if (!String(question).trim()) return json(res, 400, { error: 'Cần có trường question.' }); const [text, source] = answer(String(question)); return json(res, 200, { answer: text, source, created_at: new Date().toISOString() }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.method === 'GET') { const fileName = url === '/' ? 'index.html' : url.slice(1); const filePath = path.resolve(baseDir, fileName); if (!filePath.startsWith(baseDir)) return json(res, 403, { error: 'Không được phép truy cập.' }); return fs.readFile(filePath, (err, content) => { if (err) return json(res, 404, { error: 'Không tìm thấy.' }); res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' }); res.end(content); }); }
  json(res, 404, { error: 'Không tìm thấy endpoint.' });
});
server.listen(port, host, () => console.log(`Company Hub chạy tại http://${host}:${port} (SQLite: data/company_hub.db)`));
