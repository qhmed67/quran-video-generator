import { chromium } from 'playwright';

const AUDIO_URL =
  '/api/proxy?url=' +
  encodeURIComponent(
    'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/2.mp3',
  );

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

const diag = await page.evaluate(async (audioUrl) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const parseMpegFrame = (bytes, offset) => {
    if (offset + 4 > bytes.byteLength) return null;
    const b0 = bytes[offset], b1 = bytes[offset + 1];
    if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    if (versionBits === 1 || layerBits === 0) return null;
    const b2 = bytes[offset + 2];
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const sampleRateIndex = (b2 >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
    const v1 = versionBits === 3, v2 = versionBits === 2;
    const l1 = layerBits === 3;
    const kbpsTable = v1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const bitrateKbps = kbpsTable[bitrateIndex];
    if (!bitrateKbps) return null;
    const sampleRate = v1
      ? [44100, 48000, 32000][sampleRateIndex]
      : v2
        ? [22050, 24000, 16000][sampleRateIndex]
        : [11025, 12000, 8000][sampleRateIndex];
    const padding = (b2 >> 1) & 0x01;
    const frameLengthBytes = l1
      ? Math.floor(((12 * bitrateKbps * 1000) / sampleRate + padding) * 4)
      : Math.floor((144 * bitrateKbps * 1000) / sampleRate + padding);
    if (frameLengthBytes < 24) return null;
    return { bitrateKbps, sampleRate, frameLengthBytes };
  };

  const findFrameSync = (bytes, from) => {
    for (let i = from; i + 4 <= bytes.byteLength; i++) {
      if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
        if (parseMpegFrame(bytes, i)) return i;
      }
    }
    return -1;
  };

  const skipId3 = (bytes) => {
    if (bytes.byteLength < 10) return 0;
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
    const size =
      ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    const hasFooter = (bytes[5] & 0x10) !== 0;
    return 10 + size + (hasFooter ? 10 : 0);
  };

  const trimToCompleteFrames = (bytes, start) => {
    let cursor = start, lastEnd = start;
    while (cursor + 4 <= bytes.byteLength) {
      const info = parseMpegFrame(bytes, cursor);
      if (!info) break;
      lastEnd = cursor + info.frameLengthBytes;
      cursor = lastEnd;
    }
    return bytes.slice(start, Math.max(lastEnd, start + 24));
  };

  const out = {};
  const headRes = await fetch(audioUrl, { headers: { Range: 'bytes=0-65535' } });
  const head = new Uint8Array(await headRes.arrayBuffer());
  out.headStatus = headRes.status;
  out.headLen = head.byteLength;
  out.contentRange = headRes.headers.get('content-range');
  out.id3Skip = skipId3(head);
  out.headSync = findFrameSync(head, skipId3(head));
  out.headFirstBytes = Array.from(head.slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  out.headFrameAt45 = parseMpegFrame(head, 45);

  const startByte = 0;
  const endByte = Math.ceil((0.6 + 80.3 + 5) * 16000);
  const sliceRes = await fetch(audioUrl, { headers: { Range: `bytes=${startByte}-${endByte}` } });
  const slice = new Uint8Array(await sliceRes.arrayBuffer());
  out.sliceStatus = sliceRes.status;
  out.sliceLen = slice.byteLength;
  out.sliceId3Skip = skipId3(slice);
  const sliceSync = findFrameSync(slice, skipId3(slice));
  out.sliceSync = sliceSync;
  out.sliceFirstBytes = Array.from(slice.slice(skipId3(slice), skipId3(slice) + 16))
    .map((b) => b.toString(16).padStart(2, '0')).join(' ');

  const trimmed = trimToCompleteFrames(slice, sliceSync);
  out.trimmedLen = trimmed.byteLength;
  out.trimmedFirstBytes = Array.from(trimmed.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0')).join(' ');

  for (const [name, data] of [['trimmed', trimmed], ['full-slice', slice]]) {
    try {
      const ac = new AudioContext();
      const t0 = performance.now();
      const buf = await ac.decodeAudioData(data.buffer.slice(0));
      out[`${name}Decode`] = `OK dur=${buf.duration.toFixed(2)}s (${Math.round(performance.now() - t0)}ms)`;
      await ac.close();
    } catch (e) {
      out[`${name}Decode`] = `${e.name}: ${e.message}`;
    }
  }

  const byte = (arr, i) => String.fromCharCode(arr[i]);
  out.sliceId3Text = byte(slice, 0) + byte(slice, 1) + byte(slice, 2);
  return out;
}, AUDIO_URL);

console.log(JSON.stringify(diag, null, 2));
await browser.close();