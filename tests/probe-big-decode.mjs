import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

const proxyUrl = 'http://localhost:5173/api/proxy?url=' +
  encodeURIComponent('https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/2.mp3');

const result = await page.evaluate(async (u) => {
  const out = {};
  const t0 = performance.now();
  const r = await fetch(u);
  out.fetchStatus = r.status;
  out.fetchMs = Math.round(performance.now() - t0);
  const buf = new Uint8Array(await r.arrayBuffer());
  out.sizeMB = (buf.byteLength / 1024 / 1024).toFixed(1);
  const t1 = performance.now();
  try {
    const ac = new AudioContext();
    const decoded = await ac.decodeAudioData(buf.buffer.slice(0));
    out.decode = `OK dur=${decoded.duration.toFixed(1)}s`;
    out.decodeMs = Math.round(performance.now() - t1);
    await ac.close();
  } catch (e) {
    out.decode = `${e.name}: ${e.message}`;
    out.decodeMs = Math.round(performance.now() - t1);
  }
  return out;
}, proxyUrl);

console.log(JSON.stringify(result, null, 2));
await browser.close();