const jpeg = require('jpeg-js');
const fetch = globalThis.fetch || require('node-fetch');
(async () => {
  const w = 64, h = 64;
  const frameData = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      frameData[idx] = (x + y) % 256;
      frameData[idx + 1] = (x * 2) % 256;
      frameData[idx + 2] = (y * 3) % 256;
      frameData[idx + 3] = 0xFF;
    }
  }
  const rawImageData = { data: frameData, width: w, height: h };
  const jpg = jpeg.encode(rawImageData, 80);
  const dataUrl = 'data:image/jpeg;base64,' + jpg.data.toString('base64');
  const email = 'dat104329@gmail.com';
  try {
    const diagRes = await fetch('http://127.0.0.1:8000/api/auth/face/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, faceImage: dataUrl }) });
    console.log('DIAG STATUS', diagRes.status);
    console.log(await diagRes.text());

    const loginRes = await fetch('http://127.0.0.1:8000/api/auth/face', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, faceImage: dataUrl }) });
    console.log('LOGIN STATUS', loginRes.status);
    console.log(await loginRes.text());
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();