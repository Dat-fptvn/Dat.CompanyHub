const jpeg = require('jpeg-js');
const fetch = globalThis.fetch || require('node-fetch');
(async () => {
  const w = 64, h = 64;
  const frameData = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      frameData[idx] = (x + y) % 256; // R
      frameData[idx + 1] = (x * 2) % 256; // G
      frameData[idx + 2] = (y * 3) % 256; // B
      frameData[idx + 3] = 0xFF; // A
    }
  }
  const rawImageData = { data: frameData, width: w, height: h };
  const jpg = jpeg.encode(rawImageData, 80);
  const dataUrl = 'data:image/jpeg;base64,' + jpg.data.toString('base64');
  try {
    // try to register the user (ignore if already exists)
    try {
      await fetch('http://127.0.0.1:8000/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test User', email: 'dat104329@gmail.com', password: 'testpass' }) });
    } catch (e) { }

    const res = await fetch('http://127.0.0.1:8000/api/auth/face/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dat104329@gmail.com', faceImage: dataUrl }) });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
