/**
 * Company Hub API — lưu người dùng, phiên đăng nhập và tài liệu trong SQLite hoặc PostgreSQL.
 * Chạy: node api_server.js | Mở: http://localhost:8000
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jpeg = require('jpeg-js');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

const baseDir = __dirname;
const dataDir = path.join(baseDir, 'data');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8000);
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl);
const dbType = usePostgres ? 'PostgreSQL' : 'SQLite';

fs.mkdirSync(dataDir, { recursive: true });

let sqliteDb;
let pgPool;

if (usePostgres) {
  const pgOptions = { connectionString: databaseUrl };
  if (process.env.NODE_ENV === 'production') {
    pgOptions.ssl = { rejectUnauthorized: false };
  }
  pgPool = new Pool(pgOptions);
} else {
  sqliteDb = new DatabaseSync(path.join(dataDir, 'company_hub.db'));
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
}

function normalizeSql(sql) {
  return sql.replace(/\$[0-9]+/g, '?');
}

async function queryOne(sql, params = []) {
  if (usePostgres) {
    const result = await pgPool.query(sql, params);
    return result.rows[0];
  }
  return sqliteDb.prepare(normalizeSql(sql)).get(...params);
}

async function queryAll(sql, params = []) {
  if (usePostgres) {
    const result = await pgPool.query(sql, params);
    return result.rows;
  }
  return sqliteDb.prepare(normalizeSql(sql)).all(...params);
}

async function execute(sql, params = []) {
  if (usePostgres) {
    return pgPool.query(sql, params);
  }
  return sqliteDb.prepare(normalizeSql(sql)).run(...params);
}

async function insert(sql, params = []) {
  if (usePostgres) {
    const returningSql = sql.trim().endsWith('RETURNING id') ? sql : `${sql} RETURNING id`;
    const result = await pgPool.query(returningSql, params);
    return { lastInsertRowid: result.rows[0]?.id, rows: result.rows, rowCount: result.rowCount };
  }
  // SQLite: normalize return value to match PostgreSQL structure
  const result = sqliteDb.prepare(normalizeSql(sql)).run(...params);
  return { lastInsertRowid: result.lastInsertRowid, rows: [], rowCount: result.changes };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

async function sendRegistrationEmail(user) {
  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || 'dat104329@gmail.com';
  if (!smtpUser || !smtpPassword) {
    console.warn('Registration email skipped: GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD are not configured.');
    return false;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: smtpUser, pass: smtpPassword }
  });
  await transporter.sendMail({
    from: smtpUser,
    to: recipient,
    subject: 'Company Hub: Tài khoản mới đăng ký',
    text: `Tài khoản mới vừa đăng ký Company Hub.\n\nHọ tên: ${user.full_name}\nEmail: ${user.email}\nVai trò: Thành viên`
  });
  return true;
}

async function createSchema() {
  const sqliteSchema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        position TEXT NOT NULL DEFAULT 'Nhân viên',
        approval_status TEXT NOT NULL DEFAULT 'approved',
        approved_at TEXT,
        face_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Chung',
      status TEXT NOT NULL DEFAULT 'Đã lập chỉ mục',
      uploaded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL DEFAULT 'Hôm nay',
      status TEXT NOT NULL DEFAULT 'Đang xử lý',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      accepted_at TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      initial TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      user_id INTEGER UNIQUE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `;

  const postgresSchema = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      position TEXT NOT NULL DEFAULT 'Nhân viên',
      approval_status TEXT NOT NULL DEFAULT 'approved',
      approved_at TIMESTAMPTZ,
      face_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Chung',
      status TEXT NOT NULL DEFAULT 'Đã lập chỉ mục',
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL DEFAULT 'Hôm nay',
      status TEXT NOT NULL DEFAULT 'Đang xử lý',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      accepted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      initial TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      ,user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (usePostgres) {
    await execute(postgresSchema);
  } else {
    sqliteDb.exec(sqliteSchema);
  }

  // Ensure face_hash column exists for older DBs created before the feature
  try {
    if (usePostgres) {
      await execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS face_hash TEXT");
    } else {
      const cols = sqliteDb.prepare('PRAGMA table_info(users)').all();
      if (!cols.find(c => c.name === 'face_hash')) {
        sqliteDb.exec('ALTER TABLE users ADD COLUMN face_hash TEXT');
      }
    }
  } catch (e) {
    // non-fatal - continue
    console.warn('Migration: could not ensure face_hash column:', e.message);
  }
  try {
    if (usePostgres) await execute('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ');
    else {
      const cols = sqliteDb.prepare('PRAGMA table_info(tickets)').all();
      if (!cols.find(c => c.name === 'accepted_at')) sqliteDb.exec('ALTER TABLE tickets ADD COLUMN accepted_at TEXT');
    }
  } catch (e) {
    console.warn('Migration: could not ensure tickets.accepted_at column:', e.message);
  }
  try {
    if (usePostgres) {
      await execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'");
      await execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ');
      await execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'Nhân viên'");
    } else {
      const cols = sqliteDb.prepare('PRAGMA table_info(users)').all();
      if (!cols.find(c => c.name === 'approval_status')) sqliteDb.exec("ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'");
      if (!cols.find(c => c.name === 'approved_at')) sqliteDb.exec('ALTER TABLE users ADD COLUMN approved_at TEXT');
      if (!cols.find(c => c.name === 'position')) sqliteDb.exec("ALTER TABLE users ADD COLUMN position TEXT NOT NULL DEFAULT 'Nhân viên'");
    }
  } catch (e) {
    console.warn('Migration: could not ensure user approval columns:', e.message);
  }
  try {
    if (usePostgres) await execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE");
    else {
      const cols = sqliteDb.prepare('PRAGMA table_info(employees)').all();
      if (!cols.find(c => c.name === 'user_id')) sqliteDb.exec('ALTER TABLE employees ADD COLUMN user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE');
    }
  } catch (e) { console.warn('Migration: could not ensure employee user link:', e.message); }
}

// Compute a simple perceptual average-hash (aHash) from a base64 JPEG data URL.
function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:.*;base64,(.*)$/);
  if (!m) throw new Error('Không nhận dạng được dữ liệu ảnh.');
  return Buffer.from(m[1], 'base64');
}

function computeAHashFromBuffer(buf, size = 16) {
  const decoded = jpeg.decode(buf, { useTArray: true });
  const srcW = decoded.width;
  const srcH = decoded.height;
  const src = decoded.data; // RGBA
  // downsample with nearest-neighbor to size x size
  const pixels = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x * srcW / size);
      const sy = Math.floor(y * srcH / size);
      const idx = (sy * srcW + sx) * 4;
      const r = src[idx], g = src[idx + 1], b = src[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      pixels.push(lum);
    }
  }
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const bits = pixels.map(v => (v > avg ? '1' : '0')).join('');
  // convert bits to hex string
  let hex = '';
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.slice(i, i + 8);
    hex += Number.parseInt(byte, 2).toString(16).padStart(2, '0');
  }
  return hex; // length = size*size/8 bytes hex
}

function computeAHashFromDataUrl(dataUrl, size = 16) {
  const buf = dataUrlToBuffer(dataUrl);
  return computeAHashFromBuffer(buf, size);
}

function hammingDistanceHex(h1, h2) {
  if (!h1 || !h2) return Infinity;
  const b1 = Buffer.from(h1, 'hex');
  const b2 = Buffer.from(h2, 'hex');
  const len = Math.min(b1.length, b2.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    let x = b1[i] ^ b2[i];
    while (x) { dist += x & 1; x >>= 1; }
  }
  // if lengths differ, count remaining bits
  for (let i = len; i < b1.length; i++) { let x = b1[i]; while (x) { dist += x & 1; x >>= 1; } }
  for (let i = len; i < b2.length; i++) { let x = b2[i]; while (x) { dist += x & 1; x >>= 1; } }
  return dist;
}

async function seedDatabase() {
  const adminEmail = 'dat@fpt.vn';
  const admin = await queryOne('SELECT id FROM users WHERE email=$1', [adminEmail]);
  if (!admin) {
    await insert(
      'INSERT INTO users (full_name,email,password_hash,role) VALUES ($1,$2,$3,$4)',
      ['Đạt FPT', 'dat@fpt.vn', hashPassword('1234'), 'admin']
    );
  } else {
    await execute('UPDATE users SET role=$1 WHERE email=$2', ['admin', adminEmail]);
  }
  await execute('UPDATE users SET role=$1, approval_status=$2, approved_at=CURRENT_TIMESTAMP WHERE email=$3', ['admin', 'approved', adminEmail]);
  await execute('UPDATE users SET role=$1 WHERE email<>$2 AND role=$3', ['member', adminEmail, 'admin']);
  const documentsCount = Number((await queryOne('SELECT COUNT(*) AS total FROM documents')).total);
  if (documentsCount === 0) {
    await insert('INSERT INTO documents (name,category) VALUES ($1,$2)', ['Sổ tay nhân viên 2026', 'Nhân sự']);
    await insert('INSERT INTO documents (name,category) VALUES ($1,$2)', ['Quy định làm việc từ xa', 'Nhân sự']);
    await insert('INSERT INTO documents (name,category) VALUES ($1,$2)', ['Quy trình cấp thiết bị', 'Công nghệ']);
  }

  const ticketsCount = Number((await queryOne('SELECT COUNT(*) AS total FROM tickets')).total);
  if (ticketsCount === 0) {
    await insert('INSERT INTO tickets (title,type,priority,date,status,description) VALUES ($1,$2,$3,$4,$5,$6)', ['Cấp quyền phần mềm thiết kế', 'Hỗ trợ IT', 'Bình thường', 'Hôm nay', 'Đang xử lý', 'Cấp quyền thiết kế cho nhóm vận hành.']);
    await insert('INSERT INTO tickets (title,type,priority,date,status,description) VALUES ($1,$2,$3,$4,$5,$6)', ['Kiểm tra máy in tầng 3', 'Hỗ trợ IT', 'Cao', 'Hôm qua', 'Đang xử lý', 'Kiểm tra máy in trước buổi họp.']);
  }

  const announcementsCount = Number((await queryOne('SELECT COUNT(*) AS total FROM announcements')).total);
  if (announcementsCount === 0) {
    await insert('INSERT INTO announcements (title,body,date) VALUES ($1,$2,$3)', ['Kế hoạch nghỉ lễ Quốc khánh', 'Công ty thông báo lịch nghỉ lễ Quốc khánh. Vui lòng hoàn tất các công việc đang phụ trách trước thời gian nghỉ.', 'Hôm nay · Phòng Nhân sự']);
    await insert('INSERT INTO announcements (title,body,date) VALUES ($1,$2,$3)', ['Cập nhật quy trình bảo mật thông tin', 'Quy định bảo mật thông tin phiên bản mới đã được cập nhật trong kho tài liệu. Toàn bộ nhân viên cần đọc và xác nhận.', 'Hôm qua · Phòng Công nghệ']);
  }

  const employeesCount = Number((await queryOne('SELECT COUNT(*) AS total FROM employees')).total);
  if (employeesCount === 0) {
    await insert('INSERT INTO employees (name,role,department,initial) VALUES ($1,$2,$3,$4)', ['Nguyễn Minh Anh', 'Trưởng phòng Nhân sự', 'Nhân sự', 'MA']);
    await insert('INSERT INTO employees (name,role,department,initial) VALUES ($1,$2,$3,$4)', ['Trần Quốc Bảo', 'Kỹ sư phần mềm', 'Công nghệ', 'QB']);
    await insert('INSERT INTO employees (name,role,department,initial) VALUES ($1,$2,$3,$4)', ['Lê Thu Hà', 'Chuyên viên Marketing', 'Marketing', 'TH']);
  }
}

function publicUser(user) { return { id: user.id, name: user.full_name, email: user.email, role: user.role }; }
function publicPendingUser(user) { return { id: user.id, name: user.full_name, email: user.email, role: user.role, position: user.position || 'Nhân viên', approval_status: user.approval_status, created_at: user.created_at, approved_at: user.approved_at || null }; }
function publicTicket(row) { return { id: row.id, title: row.title, type: row.type, priority: row.priority, description: row.description || '', date: row.date, status: row.status, accepted_at: row.accepted_at || null }; }
function publicAnnouncement(row) { return { id: row.id, title: row.title, body: row.body, date: row.date }; }
function publicEmployee(row) { return { id: row.id, name: row.name, role: row.role, department: row.department, initial: row.initial }; }

async function makeToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await insert('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)', [userId, tokenHash, expires]);
  return token;
}

async function currentUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return await queryOne(
    `SELECT u.id,u.full_name,u.email,u.role,u.approval_status
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > $2`,
    [tokenHash, new Date().toISOString()]
  );
}

function answer(question) {
  const q = question.toLowerCase();
  if (q.includes('nghỉ')) return ['Nhân viên có 12 ngày nghỉ phép năm hưởng lương. Hãy gửi yêu cầu nghỉ trước ít nhất 3 ngày làm việc.', 'Sổ tay nhân viên 2026 · Trang 12'];
  if (q.includes('thiết bị')) return ['Tạo yêu cầu trên cổng nội bộ, chọn loại thiết bị và nêu rõ nhu cầu. Quản lý sẽ phê duyệt trước khi IT xử lý.', 'Quy trình cấp thiết bị · Trang 2'];
  if (q.includes('từ xa') || q.includes('remote')) return ['Bạn có thể đăng ký làm việc từ xa tối đa 2 ngày mỗi tuần, sau khi được quản lý trực tiếp phê duyệt.', 'Quy định làm việc từ xa · Trang 3'];
  return ['Tôi chưa tìm thấy thông tin phù hợp trong tài liệu hiện có. Vui lòng diễn đạt lại hoặc gửi yêu cầu hỗ trợ.', 'Không có nguồn phù hợp'];
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }); res.end(JSON.stringify(payload)); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON không hợp lệ')); } }); }); }
async function requireUser(req, res) { const user = await currentUser(req); if (!user) { json(res, 401, { error: 'Vui lòng đăng nhập.' }); return null; } if (user.approval_status !== 'approved') { json(res, 403, { error: 'Tài khoản chưa được admin cấp 1 duyệt.' }); return null; } return user; }
async function requireAdmin(req, res) { const user = await requireUser(req, res); if (!user || user.role !== 'admin') { if (user) json(res, 403, { error: 'Chỉ admin cấp 1 được phép.' }); return null; } return user; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }); return res.end(); }

  if (req.method === 'GET' && url === '/api/health') return json(res, 200, { status: 'ok', database: dbType, service: 'company-hub-api' });

  if (req.method === 'POST' && url === '/api/auth/register') {
    try {
      const { name, email, password } = await readBody(req);
      if (!name || !email || !password || password.length < 4) return json(res, 400, { error: 'Tên, email và mật khẩu từ 4 ký tự là bắt buộc.' });
      if (await queryOne('SELECT id FROM users WHERE email=$1', [String(email).trim().toLowerCase()])) return json(res, 409, { error: 'Email đã được đăng ký.' });
      const normalizedEmail = String(email).trim().toLowerCase();
      const result = await insert('INSERT INTO users (full_name,email,password_hash,role,approval_status) VALUES ($1,$2,$3,$4,$5)', [String(name).trim(), normalizedEmail, hashPassword(password), 'member', 'pending']);
      const user = await queryOne('SELECT id,full_name,email,role,approval_status FROM users WHERE id=$1', [result.lastInsertRowid]);
      const adminUser = await queryOne('SELECT id FROM users WHERE email=$1 AND role=$2', ['dat@fpt.vn', 'admin']);
      if (adminUser) {
        await insert('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [adminUser.id, 'Tài khoản mới đăng ký', `${user.full_name} (${normalizedEmail}) vừa đăng ký tài khoản thành viên.`]);
      }
      try {
        await sendRegistrationEmail(user);
      } catch (emailError) {
        console.error('Registration email failed:', emailError.message);
      }
      return json(res, 201, { user: publicUser(user), message: 'Đăng ký thành công. Tài khoản đang chờ admin cấp 1 duyệt.' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/auth/face') {
    try {
      const { email, faceImage } = await readBody(req);
      if (!email || !faceImage) return json(res, 400, { error: 'Email và dữ liệu khuôn mặt là bắt buộc.' });
      // compute a perceptual hash (aHash) of the provided image and compare with stored face_hash
      let providedHash;
      try { providedHash = computeAHashFromDataUrl(faceImage); } catch (err) { return json(res, 400, { error: 'Không thể xử lý ảnh: ' + err.message }); }
      const user = await queryOne('SELECT id,full_name,email,role,face_hash FROM users WHERE email=$1', [String(email).trim().toLowerCase()]);
      if (!user || !user.face_hash) return json(res, 401, { error: 'Xác thực khuôn mặt không thành công. Vui lòng kiểm tra email và đảm bảo đã enroll khuôn mặt.' });
      const dist = hammingDistanceHex(user.face_hash, providedHash);
      // threshold: for 16x16 aHash -> 256 bits. Use lower threshold (20) for stronger security vs 60 (too permissive at 23% difference).
      const threshold = 20;
      if (dist > threshold) return json(res, 401, { error: 'Xác thực khuôn mặt không thành công. Vui lòng kiểm tra email và đảm bảo đã enroll khuôn mặt.' });
      await execute('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1', [user.id]);
      return json(res, 200, { user: publicUser(user), token: await makeToken(user.id) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/auth/face/enroll') {
    try {
      const { email, faceImage } = await readBody(req);
      if (!email || !faceImage) return json(res, 400, { error: 'Email và dữ liệu khuôn mặt là bắt buộc.' });
      const user = await queryOne('SELECT id FROM users WHERE email=$1', [String(email).trim().toLowerCase()]);
      if (!user) return json(res, 404, { error: 'Email chưa được đăng ký.' });
      let faceHash;
      try { faceHash = computeAHashFromDataUrl(faceImage); } catch (err) { return json(res, 400, { error: 'Không thể xử lý ảnh: ' + err.message }); }
      const enrolledFaces = await queryAll('SELECT id,full_name FROM users WHERE face_hash IS NOT NULL AND id<>$1', [user.id]);
      const duplicate = enrolledFaces.find(candidate => hammingDistanceHex(candidate.face_hash, faceHash) <= 20);
      if (duplicate) {
        return json(res, 409, { error: 'Khuôn mặt này đã được đăng ký cho một tài khoản khác. Mỗi khuôn mặt chỉ được liên kết với một tài khoản.' });
      }
      await execute('UPDATE users SET face_hash=$1 WHERE id=$2', [faceHash, user.id]);
      return json(res, 200, { message: 'Đã lưu khuôn mặt thành công.' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // Diagnostic endpoint: return hamming distance between provided image and stored face_hash
  if (req.method === 'POST' && url === '/api/auth/face/diagnose') {
    try {
      const { email, faceImage } = await readBody(req);
      if (!email || !faceImage) return json(res, 400, { error: 'Email và dữ liệu khuôn mặt là bắt buộc.' });
      const user = await queryOne('SELECT id,full_name,email,role,face_hash FROM users WHERE email=$1', [String(email).trim().toLowerCase()]);
      if (!user) return json(res, 404, { error: 'Email chưa được đăng ký.' });
      if (!user.face_hash) return json(res, 404, { error: 'Người dùng chưa enroll khuôn mặt.' });
      let providedHash;
      try { providedHash = computeAHashFromDataUrl(faceImage); } catch (err) { return json(res, 400, { error: 'Không thể xử lý ảnh: ' + err.message }); }
      const dist = hammingDistanceHex(user.face_hash, providedHash);
      const threshold = 60;
      return json(res, 200, { email: user.email, distance: dist, threshold, match: dist <= threshold, storedHash: user.face_hash ? 'present' : 'missing' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/auth/login') {
    try {
      const { email, password } = await readBody(req);
      const user = await queryOne('SELECT id,full_name,email,password_hash,role,approval_status FROM users WHERE email=$1', [String(email || '').trim().toLowerCase()]);
      if (!user || !verifyPassword(String(password || ''), user.password_hash)) return json(res, 401, { error: 'Email hoặc mật khẩu chưa đúng.' });
      if (user.approval_status !== 'approved') return json(res, 403, { error: 'Tài khoản đang chờ admin cấp 1 duyệt.' });
      await execute('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1', [user.id]);
      return json(res, 200, { user: publicUser(user), token: await makeToken(user.id) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/auth/logout') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) await execute('DELETE FROM sessions WHERE token_hash=$1', [crypto.createHash('sha256').update(token).digest('hex')]);
    return json(res, 200, { message: 'Đã đăng xuất.' });
  }

  // Face status for the currently authenticated user
  if (req.method === 'GET' && url === '/api/auth/face/status') {
    const user = await requireUser(req, res);
    if (!user) return;
    const row = await queryOne('SELECT face_hash FROM users WHERE id=$1', [user.id]);
    return json(res, 200, { enrolled: Boolean(row && row.face_hash) });
  }

  // Remove enrolled face for the currently authenticated user
  if (req.method === 'POST' && url === '/api/auth/face/remove') {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      await execute('UPDATE users SET face_hash=NULL WHERE id=$1', [user.id]);
      return json(res, 200, { message: 'Đã xóa dữ liệu khuôn mặt.' });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'GET' && url === '/api/me') {
    const user = await requireUser(req, res);
    if (user) return json(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === 'GET' && url === '/api/state') {
    const user = await requireUser(req, res);
    if (!user) return;
    const documents = await queryAll('SELECT id,name,category,status,created_at FROM documents ORDER BY id DESC');
    const tickets = await queryAll('SELECT id,title,type,priority,description,date,status,accepted_at FROM tickets ORDER BY id DESC');
    const announcements = await queryAll('SELECT id,title,body,date FROM announcements ORDER BY id DESC');
    const employees = await queryAll(`SELECT id,name,role,department,initial FROM employees
      UNION ALL
      SELECT u.id,u.full_name,u.position,'Chưa phân phòng',UPPER(SUBSTR(u.full_name,1,1)) FROM users u
      WHERE u.approval_status='approved' AND u.email<>'dat@fpt.vn'
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id=u.id)
      ORDER BY id DESC`);
    const notifications = user.role === 'admin'
      ? await queryAll('SELECT id,title,body,is_read,created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC', [user.id])
      : [];
    return json(res, 200, { documents, tickets: tickets.map(publicTicket), announcements: announcements.map(publicAnnouncement), employees: employees.map(publicEmployee), notifications });
  }

  if (req.method === 'GET' && url === '/api/admin/users') {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const users = await queryAll('SELECT id,full_name,email,role,position,approval_status,created_at,approved_at FROM users ORDER BY id DESC');
    return json(res, 200, { users: users.map(publicPendingUser) });
  }

  if (req.method === 'PATCH' && url.startsWith('/api/admin/users/')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(url.split('/').pop());
    if (!Number.isInteger(userId) || userId <= 0) return json(res, 400, { error: 'ID người dùng không hợp lệ.' });
    try {
      const { role = 'member', position = 'Nhân viên', approval_status = 'approved' } = await readBody(req);
      if (!['member', 'manager'].includes(role) || !['approved', 'rejected'].includes(approval_status)) return json(res, 400, { error: 'Quyền hoặc trạng thái không hợp lệ.' });
      const target = await queryOne('SELECT id,email FROM users WHERE id=$1', [userId]);
      if (!target || target.email === 'dat@fpt.vn') return json(res, 404, { error: 'Không thể thay đổi tài khoản này.' });
      await execute('UPDATE users SET role=$1,position=$2,approval_status=$3,approved_at=CURRENT_TIMESTAMP WHERE id=$4', [role, String(position).trim() || 'Nhân viên', approval_status, userId]);
      if (approval_status === 'approved') {
        await execute(`INSERT INTO employees (name,role,department,initial,created_by,user_id)
          SELECT full_name,position,'Chưa phân phòng',UPPER(SUBSTR(full_name,1,1)), $1, id FROM users
          WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM employees WHERE user_id=$1)`, [userId]);
      }
      const updated = await queryOne('SELECT id,full_name,email,role,position,approval_status,created_at,approved_at FROM users WHERE id=$1', [userId]);
      return json(res, 200, { user: publicPendingUser(updated) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'DELETE' && url.startsWith('/api/admin/users/')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(url.split('/').pop());
    const target = await queryOne('SELECT id,email FROM users WHERE id=$1', [userId]);
    if (!target || target.email === 'dat@fpt.vn') return json(res, 404, { error: 'Không thể xóa tài khoản này.' });
    await execute('DELETE FROM users WHERE id=$1', [userId]);
    return json(res, 200, { deleted: true });
  }

  if (req.method === 'POST' && url.startsWith('/api/admin/users/') && url.endsWith('/message')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const userId = Number(url.split('/')[4]);
    const { message = '' } = await readBody(req);
    if (!Number.isInteger(userId) || !String(message).trim()) return json(res, 400, { error: 'Nội dung tin nhắn là bắt buộc.' });
    const target = await queryOne('SELECT id FROM users WHERE id=$1 AND email<>$2', [userId, 'dat@fpt.vn']);
    if (!target) return json(res, 404, { error: 'Không tìm thấy tài khoản.' });
    await insert('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, 'Tin nhắn riêng từ admin', String(message).trim()]);
    return json(res, 201, { sent: true });
  }

  if (req.method === 'GET' && url === '/api/documents') {
    const user = await requireUser(req, res);
    if (!user) return;
    const documents = await queryAll('SELECT id,name,category,status,created_at FROM documents ORDER BY id DESC');
    return json(res, 200, { documents });
  }

  if (req.method === 'POST' && url === '/api/documents') {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { name, category = 'Chung' } = await readBody(req);
      if (!name || !String(name).trim()) return json(res, 400, { error: 'Tên tài liệu là bắt buộc.' });
      const result = await insert('INSERT INTO documents (name,category,uploaded_by) VALUES ($1,$2,$3)', [String(name).trim(), String(category).trim(), user.id]);
      const document = await queryOne('SELECT id,name,category,status,created_at FROM documents WHERE id=$1', [result.lastInsertRowid]);
      return json(res, 201, { document });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'DELETE' && url.startsWith('/api/documents/')) {
    const user = await requireUser(req, res);
    if (!user) return;
    const docId = Number(url.split('/').pop());
    if (!Number.isInteger(docId) || docId <= 0) return json(res, 400, { error: 'ID tài liệu không hợp lệ.' });
    const existing = await queryOne('SELECT id FROM documents WHERE id=$1', [docId]);
    if (!existing) return json(res, 404, { error: 'Không tìm thấy tài liệu.' });
    await execute('DELETE FROM documents WHERE id=$1', [docId]);
    return json(res, 200, { deleted: true, id: docId });
  }

  if (req.method === 'PATCH' && url.startsWith('/api/tickets/')) {
    const user = await requireUser(req, res);
    if (!user) return;
    const ticketId = Number(url.split('/').pop());
    if (!Number.isInteger(ticketId) || ticketId <= 0) return json(res, 400, { error: 'ID yêu cầu không hợp lệ.' });
    try {
      const { status } = await readBody(req);
      const allowedStatuses = ['Đang xử lý', 'Đã hoàn tất'];
      if (!allowedStatuses.includes(status)) return json(res, 400, { error: 'Trạng thái không hợp lệ.' });
      const ticket = await queryOne('SELECT id FROM tickets WHERE id=$1', [ticketId]);
      if (!ticket) return json(res, 404, { error: 'Không tìm thấy yêu cầu.' });
      await execute('UPDATE tickets SET status=$1,accepted_at=COALESCE(accepted_at,$2) WHERE id=$3', [status, new Date().toISOString(), ticketId]);
      const updated = await queryOne('SELECT id,title,type,priority,description,date,status,accepted_at FROM tickets WHERE id=$1', [ticketId]);
      return json(res, 200, { ticket: publicTicket(updated) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/tickets') {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { title, type, priority, description = '', date = 'Hôm nay' } = await readBody(req);
      if (!title || !String(title).trim()) return json(res, 400, { error: 'Tiêu đề là bắt buộc.' });
      const result = await insert('INSERT INTO tickets (title,type,priority,description,date,created_by) VALUES ($1,$2,$3,$4,$5,$6)', [String(title).trim(), String(type || 'Hỗ trợ IT').trim(), String(priority || 'Bình thường').trim(), String(description).trim(), String(date).trim(), user.id]);
      const ticket = await queryOne('SELECT id,title,type,priority,description,date,status,accepted_at FROM tickets WHERE id=$1', [result.lastInsertRowid]);
      return json(res, 201, { ticket: publicTicket(ticket) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/announcements') {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { title, body = '', date = 'Hôm nay · Quản trị viên' } = await readBody(req);
      if (!title || !String(title).trim()) return json(res, 400, { error: 'Tiêu đề thông báo là bắt buộc.' });
      const result = await insert('INSERT INTO announcements (title,body,date,created_by) VALUES ($1,$2,$3,$4)', [String(title).trim(), String(body).trim(), String(date).trim(), user.id]);
      const announcement = await queryOne('SELECT id,title,body,date FROM announcements WHERE id=$1', [result.lastInsertRowid]);
      return json(res, 201, { announcement: publicAnnouncement(announcement) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/employees') {
    const user = await requireAdmin(req, res);
    if (!user) return;
    try {
      const { name, role = 'Nhân viên', department = 'Chưa xác định', initial = '' } = await readBody(req);
      if (!name || !String(name).trim()) return json(res, 400, { error: 'Tên nhân viên là bắt buộc.' });
      const preparedInitial = String(initial || name.split(' ').map(part => part[0]).slice(-2).join('').toUpperCase()).trim();
      const result = await insert('INSERT INTO employees (name,role,department,initial,created_by) VALUES ($1,$2,$3,$4,$5)', [String(name).trim(), String(role).trim(), String(department).trim(), preparedInitial, user.id]);
      const employee = await queryOne('SELECT id,name,role,department,initial FROM employees WHERE id=$1', [result.lastInsertRowid]);
      return json(res, 201, { employee: publicEmployee(employee) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'DELETE' && url.startsWith('/api/employees/')) {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const employeeId = Number(url.split('/').pop());
    if (!Number.isInteger(employeeId) || employeeId <= 0) return json(res, 400, { error: 'ID nhân sự không hợp lệ.' });
    const existing = await queryOne('SELECT id,user_id FROM employees WHERE id=$1', [employeeId]);
    if (!existing) return json(res, 404, { error: 'Không tìm thấy nhân sự.' });
    if (existing.user_id) {
      await execute('DELETE FROM users WHERE id=$1 AND email<>$2', [existing.user_id, 'dat@fpt.vn']);
    } else {
      await execute('DELETE FROM employees WHERE id=$1', [employeeId]);
    }
    return json(res, 200, { deleted: true, id: employeeId });
  }

  if (req.method === 'POST' && url === '/api/chat') {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { question = '' } = await readBody(req);
      if (!String(question).trim()) return json(res, 400, { error: 'Cần có trường question.' });
      const [text, source] = answer(String(question));
      return json(res, 200, { answer: text, source, created_at: new Date().toISOString() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (req.method === 'GET') {
    const fileName = url === '/' ? 'index.html' : url.slice(1);
    const filePath = path.resolve(baseDir, fileName);
    if (!filePath.startsWith(baseDir)) return json(res, 403, { error: 'Không được phép truy cập.' });
    return fs.readFile(filePath, (err, content) => {
      if (err) return json(res, 404, { error: 'Không tìm thấy.' });
      res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
      res.end(content);
    });
  }

  json(res, 404, { error: 'Không tìm thấy endpoint.' });
});

async function init() {
  await createSchema();
  await seedDatabase();
}

init().then(() => {
  server.listen(port, host, () => console.log(`Company Hub chạy tại http://${host}:${port} (${dbType})`));
}).catch(err => {
  console.error('Không thể khởi tạo cơ sở dữ liệu:', err);
  process.exit(1);
});
