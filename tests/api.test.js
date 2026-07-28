const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

function request(method, pathName, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8011,
      path: pathName,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('document create/delete API works end-to-end', async () => {
  const child = spawn(process.execPath, ['api_server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '8011', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const waitForServer = async () => {
    for (let i = 0; i < 50; i += 1) {
      if (output.includes('Company Hub chạy tại')) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not start. Output: ${output}`);
  };

  try {
    await waitForServer();

    const login = await request('POST', '/api/auth/login', { email: 'dat@fpt.vn', password: '1234' });
    assert.equal(login.status, 200);
    const token = login.body.token;

    const createDoc = await request('POST', '/api/documents', { name: 'Tài liệu kiểm thử', category: 'Chung' }, token);
    assert.equal(createDoc.status, 201);
    assert.equal(createDoc.body.document.name, 'Tài liệu kiểm thử');

    const deleteDoc = await request('DELETE', `/api/documents/${createDoc.body.document.id}`, null, token);
    assert.equal(deleteDoc.status, 200);
    assert.equal(deleteDoc.body.deleted, true);
  } finally {
    child.kill('SIGTERM');
  }
});
