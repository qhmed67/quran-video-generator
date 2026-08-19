import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const server = createServer((req, res) => {
  const name = (req.url ?? '/raw').slice(1).split('?')[0].replace(/\.mp3$/, '');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(readFileSync(`/tmp/opencode/${name}.mp3`));
});
await new Promise((r) => server.listen(9911, r));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const out = {};
  for (const name of ['raw-frames', 'synth-id3', 'full-id3']) {
    const r = await fetch(`http://localhost:9911/${name}.mp3`);
    const buf = new Uint8Array(await r.arrayBuffer());
    const t0 = performance.now();
    try {
      const ac = new AudioContext();
      const d = await ac.decodeAudioData(buf.buffer.slice(0));
      out[name] = `OK dur=${d.duration.toFixed(1)}s (${Math.round(performance.now() - t0)}ms)`;
      await ac.close();
    } catch (e) {
      out[name] = `${e.name}: ${e.message}`;
    }
  }
  return out;
}, null);

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();