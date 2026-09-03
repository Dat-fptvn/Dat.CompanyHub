const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = { get: (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)), set: (key, value) => localStorage.setItem(key, JSON.stringify(value)) };
let currentUser = store.get('hub-current-user', null);
let registerMode = false;
let currentStream = null;
const api = async (path, options = {}) => { const token = localStorage.getItem('hub-token'); const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.'); return data; };
const defaultDocs = [{ id: 1, name: 'Sổ tay nhân viên 2026', date: '23/07/2026', status: 'Đã lập chỉ mục' }, { id: 2, name: 'Quy định làm việc từ xa', date: '21/07/2026', status: 'Đã lập chỉ mục' }, { id: 3, name: 'Quy trình cấp thiết bị', date: '18/07/2026', status: 'Đã lập chỉ mục' }];
const defaultTickets = [{ title: 'Cấp quyền phần mềm thiết kế', type: 'Hỗ trợ IT', priority: 'Bình thường', date: 'Hôm nay' }, { title: 'Kiểm tra máy in tầng 3', type: 'Hỗ trợ IT', priority: 'Cao', date: 'Hôm qua' }];
const defaultEmployees = [{ name: 'Nguyễn Minh Anh', role: 'Trưởng phòng Nhân sự', department: 'Nhân sự', initial: 'MA' }, { name: 'Trần Quốc Bảo', role: 'Kỹ sư phần mềm', department: 'Công nghệ', initial: 'QB' }, { name: 'Lê Thu Hà', role: 'Chuyên viên Marketing', department: 'Marketing', initial: 'TH' }, { name: 'Phạm Gia Huy', role: 'Kế toán viên', department: 'Tài chính', initial: 'GH' }, { name: 'Vũ Khánh Linh', role: 'Thiết kế sản phẩm', department: 'Sản phẩm', initial: 'KL' }, { name: 'Đỗ Thành Nam', role: 'Chuyên viên kinh doanh', department: 'Kinh doanh', initial: 'TN' }];
const defaultAnnouncements = [{ title: 'Kế hoạch nghỉ lễ Quốc khánh', body: 'Công ty thông báo lịch nghỉ lễ Quốc khánh. Vui lòng hoàn tất các công việc đang phụ trách trước thời gian nghỉ.', date: 'Hôm nay · Phòng Nhân sự' }, { title: 'Cập nhật quy trình bảo mật thông tin', body: 'Quy định bảo mật thông tin phiên bản mới đã được cập nhật trong kho tài liệu. Toàn bộ nhân viên cần đọc và xác nhận.', date: 'Hôm qua · Phòng Công nghệ' }];
let docs = (store.get('hub-docs', defaultDocs) || []).map((doc, index) => ({ ...doc, id: doc.id ?? index + 1 })), tickets = store.get('hub-tickets', defaultTickets), employees = store.get('hub-employees', defaultEmployees), announcements = store.get('hub-announcements', defaultAnnouncements), history = store.get('hub-history', []);
const escapeHtml = t => { const e = document.createElement('div'); e.textContent = t; return e.innerHTML };
function getAuthEmail() { return $('#authEmail')?.value.trim().toLowerCase() || '' }
function setFaceMessage(message, isError = false) {
  const el = document.getElementById('faceMessage');
  if (el) {
    el.textContent = message;
    el.style.color = isError ? '#b33' : '#666';
  }
}
async function ensureFaceCamera() {
  const sel = document.getElementById('cameraSelect');
  const deviceId = sel?.value || null;
  await startCamera(deviceId);
}
function setView(id) { $$('.view').forEach(v => v.classList.toggle('active-view', v.id === id)); $$('.nav-item').forEach(v => v.classList.toggle('active', v.dataset.view === id)); const labels = { dashboard: ['KHÔNG GIAN LÀM VIỆC', `Chào buổi sáng, ${currentUser?.name || 'Đạt FPT'}!`], chat: ['TRỢ LÝ AI', 'Tra cứu tri thức nội bộ'], documents: ['KHO TRI THỨC', 'Tài liệu nội bộ'], employees: ['DANH BẠ NHÂN SỰ', 'Nhân sự công ty'], announcements: ['TRUYỀN THÔNG NỘỘC BỘ', 'Thông báo'], ticket: ['HỖ TRỢ NỘI BỘ', 'Yêu cầu hỗ trợ'], admin: ['QUẢN TRỊ HỆ THỐNG', 'Cài đặt và phân quyền'] }; $('#sectionLabel').textContent = labels[id][0]; $('#pageTitle').textContent = labels[id][1]; window.scrollTo(0, 0) }
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
function renderDocs() {
  const search = $('#documentSearch').value.toLowerCase();
  const category = $('#documentCategory').value;
  const sort = $('#documentSort').value;
  const filtered = docs.filter(d => d.name.toLowerCase().includes(search) && (!category || d.category === category));
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (sort === 'status') filtered.sort((a, b) => a.status.localeCompare(b.status, 'vi'));
  $('#documentList').innerHTML = filtered.length ? filtered.map(d => `<tr><td><strong>${escapeHtml(d.name)}</strong></td><td><span class="doc-category">${escapeHtml(d.category || 'Chung')}</span></td><td><span class="badge ${d.status.includes('Đang') ? 'indexing' : ''}">${escapeHtml(d.status)}</span></td><td>${escapeHtml(d.date)}</td><td><button data-doc-delete="${d.id}" aria-label="Xóa tài liệu">×</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">Không tìm thấy tài liệu phù hợp.</td></tr>';
  const indexed = docs.filter(d => !d.status.includes('Đang')).length;
  $('#documentCount').textContent = docs.length; $('#statDocuments').textContent = docs.length;
  $('#documentTotal').textContent = docs.length; $('#documentIndexed').textContent = indexed; $('#documentPending').textContent = docs.length - indexed;
}
function renderEmployees() { const q = $('#employeeSearch').value.toLowerCase(); $('#employeeList').innerHTML = employees.filter(e => Object.values(e).join(' ').toLowerCase().includes(q)).map(e => `<article class="employee-card"><div class="avatar">${e.initial}</div><h3>${escapeHtml(e.name)}</h3><p>${escapeHtml(e.role)}</p><small>${escapeHtml(e.department)} · Đang hoạt động</small></article>`).join('') }
function renderAnnouncements() { const html = announcements.map(a => `<article class="announcement"><h2>${escapeHtml(a.title)}</h2><p>${escapeHtml(a.body)}</p><small>${escapeHtml(a.date)}</small></article>`).join(''); $('#announcementList').innerHTML = html; $('#dashboardAnnouncements').innerHTML = announcements.slice(0, 2).map(a => `<div class="announcement-mini"><span>◈</span><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.date)}</small></div></div>`).join(''); $('#announcementCount').textContent = announcements.length }
function renderTickets() {
  const search = ($('#ticketSearch')?.value || '').toLowerCase();
  const status = $('#ticketStatusFilter')?.value || '';
  const filtered = tickets.filter(t => {
    const ticketStatus = String(t.status || 'Đang xử lý').trim() || 'Đang xử lý';
    return (!search || `${t.title} ${t.type}`.toLowerCase().includes(search)) && (!status || ticketStatus === status);
  });
  $('#ticketList').innerHTML = filtered.length ? filtered.map(t => `<div class="ticket-item"><span class="ticket-id">#${t.id || '—'}</span><span class="priority ${t.priority === 'Cao' ? 'high' : t.priority === 'Khẩn cấp' ? 'urgent' : ''}">${escapeHtml(t.priority)}</span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.type)} · ${escapeHtml(t.date)} · <span class="ticket-status">${escapeHtml(t.status || 'Đang xử lý')}</span></small>${!t.accepted_at && (t.status || 'Đang xử lý') === 'Đang xử lý' ? `<button class="accept-ticket" data-ticket-accept="${t.id}">Chấp nhận xử lý</button>` : ''}</div>`).join('') : '<p class="empty-state">Chưa có yêu cầu phù hợp.</p>';
  const open = tickets.filter(t => (t.status || 'Đang xử lý') === 'Đang xử lý').length;
  const urgent = tickets.filter(t => t.priority === 'Cao' || t.priority === 'Khẩn cấp').length;
  $('#statTickets').textContent = open; $('#ticketOpenCount').textContent = open; $('#ticketUrgentCount').textContent = urgent;
}
function renderHistory() { $('#historyList').innerHTML = history.length ? history.map(q => `<div class="history-entry">${escapeHtml(q)}</div>`).join('') : '<p>Chưa có câu hỏi nào.</p>' }
function renderActivity() { $('#activityFeed').innerHTML = [...tickets.slice(0, 2).map(t => `<div class="activity-item"><span>☑</span><div>Bạn đã tạo yêu cầu “${escapeHtml(t.title)}”<small>${t.date}</small></div></div>`), ...docs.slice(0, 2).map(d => `<div class="activity-item"><span>▣</span><div>Tài liệu “${escapeHtml(d.name)}” sẵn sàng để tra cứu<small>${d.date}</small></div></div>`)].join('') }
function saveAll() { store.set('hub-docs', docs); store.set('hub-tickets', tickets); store.set('hub-employees', employees); store.set('hub-announcements', announcements); store.set('hub-history', history); renderDocs(); renderTickets(); renderActivity(); renderHistory(); renderAnnouncements(); renderEmployees(); }
async function reloadState() { try { const data = await api('/api/state'); docs = (data.documents || []).map(d => ({ id: d.id, name: d.name, category: d.category || 'Chung', date: new Date(d.created_at).toLocaleDateString('vi-VN'), status: d.status })); tickets = (data.tickets || []).map(t => ({ id: t.id, title: t.title, type: t.type, priority: t.priority, date: t.date, status: t.status })); announcements = (data.announcements || []).map(a => ({ id: a.id, title: a.title, body: a.body, date: a.date })); employees = (data.employees || []).map(e => ({ id: e.id, name: e.name, role: e.role, department: e.department, initial: e.initial })); saveAll(); } catch (error) { console.warn(error.message) } }
async function reloadDocuments() { try { const data = await api('/api/documents'); docs = data.documents.map(d => ({ id: d.id, name: d.name, category: d.category || 'Chung', date: new Date(d.created_at).toLocaleDateString('vi-VN'), status: d.status })); renderDocs() } catch (error) { console.warn(error.message) } }
async function addFiles(files) { for (const file of files) { try { const data = await api('/api/documents', { method: 'POST', body: JSON.stringify({ name: file.name, category: 'Chung' }) }); docs.unshift({ id: data.document.id, name: data.document.name, date: 'Hôm nay', status: data.document.status }) } catch (error) { alert(error.message) } } saveAll() }
$('#fileInput').addEventListener('change', e => addFiles(e.target.files)); $('#documentSearch').addEventListener('input', renderDocs); $('#documentCategory').addEventListener('change', renderDocs); $('#documentSort').addEventListener('change', renderDocs); $('#employeeSearch').addEventListener('input', renderEmployees); $('#ticketSearch').addEventListener('input', renderTickets); $('#ticketStatusFilter').addEventListener('change', renderTickets); $('#ticketList').addEventListener('click', async e => { const button = e.target.closest('button[data-ticket-accept]'); if (!button) return; button.disabled = true; try { const data = await api(`/api/tickets/${button.dataset.ticketAccept}`, { method: 'PATCH', body: JSON.stringify({ status: 'Đang xử lý' }) }); const index = tickets.findIndex(ticket => ticket.id === Number(button.dataset.ticketAccept)); if (index >= 0) tickets[index] = { ...tickets[index], ...data.ticket }; saveAll(); } catch (error) { button.disabled = false; alert(error.message) } }); $('#documentList').addEventListener('click', async e => { const button = e.target.closest('button[data-doc-delete]'); if (!button) return; const docId = Number(button.dataset.docDelete); if (!Number.isInteger(docId) || docId <= 0) return; try { await api(`/api/documents/${docId}`, { method: 'DELETE' }); docs = docs.filter(doc => doc.id !== docId); saveAll() } catch (error) { alert(error.message) } });
const dz = $('#dropzone');['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, x => { x.preventDefault(); dz.classList.add('dragging') }));['dragleave', 'drop'].forEach(e => dz.addEventListener(e, x => { x.preventDefault(); dz.classList.remove('dragging') })); dz.addEventListener('drop', e => addFiles(e.dataTransfer.files));
function answer(q) { q = q.toLowerCase(); if (q.includes('nghỉ')) return ['Nhân viên có 12 ngày nghỉ phép năm hưởng lương. Hãy gửi yêu cầu nghỉ trước ít nhất 3 ngày làm việc.', 'Sổ tay nhân viên 2026 · Trang 12']; if (q.includes('thiết bị')) return ['Tạo yêu cầu trên cổng nội bộ, chọn loại thiết bị và nêu rõ nhu cầu. Quản lý sẽ phê duyệt trước khi IT xử lý.', 'Quy trình cấp thiết bị · Trang 2']; if (q.includes('từ xa') || q.includes('remote')) return ['Bạn có thể đăng ký làm việc từ xa tối đa 2 ngày mỗi tuần, sau khi được quản lý trực tiếp phê duyệt.', 'Quy định làm việc từ xa · Trang 3']; return ['Tôi chưa tìm thấy thông tin phù hợp trong tài liệu hiện có. Vui lòng diễn đạt lại hoặc gửi yêu cầu hỗ trợ.', 'Không có nguồn phù hợp'] }
function addMessage(type, text, source = '') { const a = document.createElement('article'); a.className = `message ${type}`; a.innerHTML = type === 'bot' ? `<div class="bot-icon">✦</div><div><div class="bubble">${escapeHtml(text)}${source && $('#citations').checked ? `<div class="source">Nguồn: ${escapeHtml(source)}</div>` : ''}</div><div class="feedback"><button>👍</button><button>👎</button></div></div>` : `<div><div class="bubble">${escapeHtml(text)}</div></div>`; $('#messages').append(a); a.scrollIntoView({ behavior: 'smooth', block: 'end' }) }
async function ask(q) { if (!q.trim()) return; addMessage('user', q); history.unshift(q); history = history.slice(0, 10); saveAll(); $('#question').value = ''; try { const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ question: q }) }); addMessage('bot', data.answer, data.source) } catch (error) { addMessage('bot', `Không thể kết nối chatbot: ${error.message}`) } } $('#chatForm').addEventListener('submit', e => { e.preventDefault(); ask($('#question').value) }); $$('.suggestions button').forEach(b => b.addEventListener('click', () => ask(b.textContent))); $('#messages').addEventListener('click', e => { if (e.target.closest('.feedback')) e.target.closest('.feedback').innerHTML = '<small>Cảm ơn phản hồi!</small>' });
$('#ticketForm').addEventListener('submit', async e => { e.preventDefault(); const payload = { title: $('#ticketTitle').value.trim(), type: $('#ticketType').value, priority: $('#ticketPriority').value, description: $('#ticketDescription').value.trim(), date: 'Hôm nay' }; if (!payload.title) return; try { const data = await api('/api/tickets', { method: 'POST', body: JSON.stringify(payload) }); tickets.unshift({ id: data.ticket.id, title: data.ticket.title, type: data.ticket.type, priority: data.ticket.priority, date: data.ticket.date, status: data.ticket.status }); e.target.reset(); saveAll(); alert('Đã gửi yêu cầu hỗ trợ thành công.') } catch (error) { alert(error.message) } });
$('#addEmployee').addEventListener('click', async () => { const name = prompt('Họ tên nhân viên:'); if (!name) return; const department = prompt('Phòng ban:', 'Công nghệ') || 'Chưa xác định'; try { const data = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name, department, role: 'Nhân viên', initial: name.split(' ').map(x => x[0]).slice(-2).join('').toUpperCase() }) }); employees.unshift({ id: data.employee.id, name: data.employee.name, department: data.employee.department, role: data.employee.role, initial: data.employee.initial }); saveAll(); } catch (error) { alert(error.message) } });
$('#addAnnouncement').addEventListener('click', async () => { const title = prompt('Tiêu đề thông báo:'); if (!title) return; const body = prompt('Nội dung thông báo:') || ''; try { const data = await api('/api/announcements', { method: 'POST', body: JSON.stringify({ title, body, date: 'Hôm nay · Quản trị viên' }) }); announcements.unshift({ id: data.announcement.id, title: data.announcement.title, body: data.announcement.body, date: data.announcement.date }); saveAll(); } catch (error) { alert(error.message) } });
$('#themeToggle').addEventListener('click', () => document.body.classList.toggle('dark')); $('#saveSettings').addEventListener('click', () => { $('#settingsMessage').textContent = 'Đã lưu cài đặt trợ lý AI.' }); $('#saveRole').addEventListener('click', () => { $('#roleMessage').textContent = 'Đã lưu phân quyền: ' + $('#roleSelect').value });
function initials(name) { return name.split(' ').map(part => part[0]).slice(-2).join('').toUpperCase() }
function renderUser() { if (!currentUser) return; $('#profileName').textContent = currentUser.name; const profileNameLarge = $('#profileNameLarge'); if (profileNameLarge) profileNameLarge.textContent = currentUser.name; $('#profileInitial').textContent = initials(currentUser.name); setView('dashboard') }
// Profile face controls
async function refreshFaceStatus() {
  if (!localStorage.getItem('hub-token')) return;
  try {
    const status = await api('/api/auth/face/status');
    const btn = document.querySelector('#removeFaceButton');
    if (btn) btn.disabled = !status.enrolled;
  } catch (e) { }
}

async function removeFace() {
  if (!confirm('Bạn có chắc muốn xóa dữ liệu khuôn mặt?')) return;
  try {
    await api('/api/auth/face/remove', { method: 'POST' });
    alert('Đã xóa dữ liệu khuôn mặt.');
    refreshFaceStatus();
  } catch (e) { alert(e.message); }
}
async function captureFaceImage() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ camera.');
  const preview = document.getElementById('cameraPreview');
  // if preview not started, start using selected device
  if (!preview || !(preview.videoWidth > 0)) {
    const sel = document.getElementById('cameraSelect');
    const deviceId = sel?.value || null;
    await startCamera(deviceId);
  }
  const video = document.getElementById('cameraPreview');
  if (!video) throw new Error('Không tìm thấy phần xem trước camera.');
  // wait for video metadata to load (proper way vs brittle timeout)
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera metadata did not load in time')), 5000);
      const onLoadedMetadata = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        resolve();
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    });
  }
  // ensure video has valid dimensions after metadata loads
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Camera không sẵn sàng: kích thước không hợp lệ.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const sel = document.getElementById('cameraSelect');
    if (!sel) return;
    if (!cams.length) {
      sel.innerHTML = '<option value="">Không tìm thấy camera</option>';
      return;
    }
    const cur = sel.value;
    sel.innerHTML = cams.map(c => `<option value="${c.deviceId}">${c.label || 'Camera ' + (cams.indexOf(c) + 1)}</option>`).join('');
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  } catch (e) { console.warn('listCameras', e.message) }
}

async function startCamera(deviceId = null) {
  try {
    stopCamera();
    const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: 'user' } };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    const preview = document.getElementById('cameraPreview');
    if (preview) preview.srcObject = currentStream;
    // Device labels and IDs are often hidden until camera permission is granted.
    await listCameras();
    return currentStream;
  } catch (e) {
    const reason = e.name === 'NotAllowedError'
      ? 'Bạn đã chặn quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.'
      : e.name === 'NotFoundError'
        ? 'Không tìm thấy camera trên thiết bị.'
        : e.message;
    throw new Error('Không thể mở camera: ' + reason);
  }
}

function stopCamera() {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
    const preview = document.getElementById('cameraPreview');
    if (preview) preview.srcObject = null;
  } catch (e) { }
}

// update camera list on device change
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', listCameras);
}
window.addEventListener('load', () => {
  setTimeout(listCameras, 200);
  const sel = document.getElementById('cameraSelect');
  if (sel) sel.addEventListener('change', async () => { try { await startCamera(sel.value); } catch (e) { alert(e.message); } });
  const authSwitch = document.getElementById('authSwitch');
  if (authSwitch) {
    authSwitch.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') {
        registerMode = !registerMode;
        updateAuthMode();
      }
    });
  }
});
window.addEventListener('beforeunload', stopCamera);

async function faceLogin() {
  const email = getAuthEmail();
  if (!email) {
    setFaceMessage('Vui lòng nhập email công ty để đăng nhập bằng khuôn mặt.', true);
    return;
  }
  try {
    setFaceMessage('Đang chuẩn bị camera...');
    await ensureFaceCamera();
    const faceImage = await captureFaceImage();
    const data = await api('/api/auth/face', { method: 'POST', body: JSON.stringify({ email, faceImage }) });
    currentUser = data.user;
    localStorage.setItem('hub-current-user', JSON.stringify(currentUser));
    localStorage.setItem('hub-token', data.token);
    $('#authScreen').classList.add('hidden');
    renderUser();
    await reloadDocuments();
    setFaceMessage('Đăng nhập bằng khuôn mặt thành công.');
  } catch (error) {
    setFaceMessage(error.message, true);
    alert(error.message);
  } finally {
    stopCamera();
  }
}

function updateAuthMode() { $('#authTitle').textContent = registerMode ? 'Tạo tài khoản' : 'Đăng nhập'; $('#authCopy').textContent = registerMode ? 'Tạo tài khoản để bắt đầu sử dụng Company Hub.' : 'Đăng nhập để truy cập không gian làm việc của bạn.'; $('#nameField').classList.toggle('hidden', !registerMode); $('#authSubmit').textContent = registerMode ? 'Đăng ký' : 'Đăng nhập'; $('#authSwitch').innerHTML = registerMode ? 'Đã có tài khoản? <button id="showLogin">Đăng nhập</button>' : 'Chưa có tài khoản? <button id="showRegister">Đăng ký ngay</button>'; }

async function promptFaceEnrollmentIfMissing() {
  try {
    const status = await api('/api/auth/face/status');
    if (status.enrolled) return;
    const email = currentUser?.email;
    if (!email) return;
    // Ask user explicitly before enrolling face - don't auto-enroll to prevent TOFU attacks
    const userConsent = confirm('Bạn chưa đăng ký Face ID. Bạn có muốn enroll khuôn mặt ngay bây giờ để đăng nhập nhanh hơn lần sau?');
    if (!userConsent) {
      setFaceMessage('Bạn có thể enroll khuôn mặt bất cứ lúc nào trong phần cài đặt.');
      return;
    }
    setFaceMessage('Đang chuẩn bị camera để enroll khuôn mặt...');
    await ensureFaceCamera();
    const faceImage = await captureFaceImage();
    await api('/api/auth/face/enroll', { method: 'POST', body: JSON.stringify({ email, faceImage }) });
    setFaceMessage('Đã lưu khuôn mặt thành công. Bạn có thể dùng Face ID lần sau.');
    refreshFaceStatus();
  } catch (err) {
    setFaceMessage('Không thể enroll khuôn mặt: ' + err.message, true);
    console.warn('Face enrollment failed:', err.message);
  } finally {
    stopCamera();
  }
}

$('#authForm').addEventListener('submit', async e => { e.preventDefault(); const email = $('#authEmail').value.trim().toLowerCase(), password = $('#authPassword').value, name = $('#authName').value.trim(); try { const endpoint = registerMode ? '/api/auth/register' : '/api/auth/login'; const payload = registerMode ? { name, email, password } : { email, password }; const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) }); currentUser = data.user; localStorage.setItem('hub-current-user', JSON.stringify(currentUser)); localStorage.setItem('hub-token', data.token); $('#authScreen').classList.add('hidden'); renderUser(); await reloadDocuments(); await promptFaceEnrollmentIfMissing(); } catch (error) { alert(error.message) } });
$('#faceLoginButton').addEventListener('click', faceLogin);
async function faceEnroll() {
  const email = currentUser?.email || getAuthEmail();
  if (!email) {
    setFaceMessage('Vui lòng nhập email công ty để enroll khuôn mặt.', true);
    return;
  }
  try {
    setFaceMessage('Đang chuẩn bị camera...');
    await ensureFaceCamera();
    const faceImage = await captureFaceImage();
    const data = await api('/api/auth/face/enroll', { method: 'POST', body: JSON.stringify({ email, faceImage }) });
    setFaceMessage(data.message || 'Đã enroll khuôn mặt thành công.');
    refreshFaceStatus();
  } catch (error) {
    setFaceMessage(error.message, true);
    alert(error.message);
  } finally {
    stopCamera();
  }
}
$('#faceEnrollButton').addEventListener('click', faceEnroll);
$('#faceEnrollButtonProfile')?.addEventListener('click', async () => {
  try {
    await faceEnroll();
    refreshFaceStatus();
  } catch (e) { alert(e.message) }
});
$('#removeFaceButton')?.addEventListener('click', removeFace);
// update profile UI when user changes
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFaceStatus(); });
// refresh face status on load
refreshFaceStatus();
$('#logoutButton').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }) } catch (error) { } currentUser = null; localStorage.removeItem('hub-current-user'); localStorage.removeItem('hub-token'); $('#authForm').reset(); registerMode = false; updateAuthMode(); $('#authScreen').classList.remove('hidden') });
renderDocs(); renderEmployees(); renderAnnouncements(); renderTickets(); renderHistory(); renderActivity();
updateAuthMode(); if (currentUser) { $('#authScreen').classList.add('hidden'); renderUser(); reloadState() }
