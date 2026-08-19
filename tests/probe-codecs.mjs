import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

const probe = await page.evaluate(async () => {
  const out = { video: {}, audio: {} };
  const videoConfigs = [
    ['avc1.640033 hw', { codec: 'avc1.640033', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30, hardwareAcceleration: 'prefer-hardware' }],
    ['avc1.640033 any', { codec: 'avc1.640033', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 }],
    ['avc1.640033 sw', { codec: 'avc1.640033', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30, hardwareAcceleration: 'prefer-software' }],
    ['avc1.42001f', { codec: 'avc1.42001f', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 }],
    ['vp09.00.10.08', { codec: 'vp09.00.10.08', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 }],
    ['av01.0.05M.08', { codec: 'av01.0.05M.08', width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 }],
  ];
  for (const [name, cfg] of videoConfigs) {
    try {
      const r = await VideoEncoder.isConfigSupported(cfg);
      out.video[name] = r.supported;
    } catch (e) {
      out.video[name] = `ERR ${e.name}: ${e.message}`;
    }
  }
  const audioConfigs = [
    ['mp4a.40.2', { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 }],
    ['mp4a.40.2 48k', { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }],
    ['opus', { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }],
  ];
  for (const [name, cfg] of audioConfigs) {
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      out.audio[name] = r.supported;
    } catch (e) {
      out.audio[name] = `ERR ${e.name}: ${e.message}`;
    }
  }
  return out;
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();