import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'export-loop-results');
mkdirSync(OUT, { recursive: true });

const BASE_URL = process.env.EXPORT_TEST_URL ?? 'http://localhost:5173';
const ITERATIONS = Number(process.env.EXPORT_TEST_ITERATIONS ?? 5);
const PER_ITERATION_TIMEOUT_MS = Number(process.env.EXPORT_TEST_TIMEOUT_MS ?? 300_000);

function makeWav(seconds = 2, sr = 44100, freq = 440) {
  const n = sr * seconds;
  const dataSize = n * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const wstr = (o, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wstr(36, 'data');
  dv.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * 0.1;
    dv.setInt16(44 + i * 2, v * 32767, true);
  }
  return Buffer.from(buf);
}

function walkBoxes(buf, start, end, depth = 0, out = []) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = start;
  while (pos + 8 <= end) {
    const size = dv.getUint32(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (size < 8 || pos + size > end) break;
    out.push({ type, offset: pos, depth });
    walkBoxes(buf, pos + 8, pos + size, depth + 1, out);
    pos += size;
  }
  return out;
}

function inspectMp4(buf) {
  const boxes = walkBoxes(buf, 0, buf.byteLength);
  const trackCount = boxes.filter((b) => b.type === 'trak').length;
  const codecCandidates = ['avc1', 'hvc1', 'vp09', 'av01', 'mp4a', 'Opus', 'fLaC'];
  const codecs = boxes
    .filter((b) => b.type === 'stsd')
    .map((b) => buf.toString('ascii', b.offset + 20, b.offset + 24))
    .filter((c) => codecCandidates.includes(c));
  return { trackCount, codecs };
}

const MOCK_WAV = makeWav(10);

const MOCK_VERSE_TEXTS = {
  '36:1': 'يسٓ',
  '36:2': 'وَٱلْقُرْءَانِ ٱلْحَكِيمِ',
  '36:3': 'إِنَّكَ لَمِنَ ٱلْمُرْسَلِينَ',
};

async function proxyRouteHandler(route, request) {
  const u = new URL(request.url(), 'http://localhost');
  const target = u.searchParams.get('url');
  if (!target) {
    return route.fulfill({ status: 400, body: 'missing url' });
  }
  if (target.includes('resources/chapter_reciters')) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ reciters: [{ id: 7, name: 'Mock Reciter', style: { name: 'Mock' } }] }),
    });
  }
  if (target.includes('chapter_recitations/7/36')) {
    const timestamps = [
      { verse_key: '36:1', timestamp_from: 100, timestamp_to: 1500, segments: [[1, 100, 700], [2, 700, 1400]] },
      { verse_key: '36:2', timestamp_from: 1500, timestamp_to: 4200, segments: [[1, 1500, 2400], [2, 2400, 3300], [3, 3300, 4100]] },
      { verse_key: '36:3', timestamp_from: 4200, timestamp_to: 6800, segments: [[1, 4200, 5000], [2, 5000, 5900], [3, 5900, 6700]] },
    ];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ audio_file: { audio_url: 'https://download.quranicaudio.com/mock-36-1.wav', timestamps } }),
    });
  }
  if (target.includes('quran/verses/uthmani')) {
    const verses = Object.entries(MOCK_VERSE_TEXTS).map(([k, v]) => ({ verse_key: k, text_uthmani: v }));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ verses }),
    });
  }
  if (target.includes('quran/translations/131')) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ translations: [{ verse_key: '36:1', text: 'Ya Seen.' }, { verse_key: '36:2', text: 'By the wise Quran,' }, { verse_key: '36:3', text: 'indeed you, O Muhammad, are of the messengers,' }] }),
    });
  }
  if (target.includes('mock-36-1.wav')) {
    return route.fulfill({ contentType: 'audio/wav', body: MOCK_WAV });
  }
  return route.continue();
}

const results = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

for (let i = 1; i <= ITERATIONS; i++) {
  const r = {
    index: i,
    ok: false,
    error: undefined,
    durationSeconds: undefined,
    progress: undefined,
    downloadBytes: undefined,
    mp4Valid: false,
    hasAudioWarning: false,
    appError: undefined,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') r.consoleErrors.push(text);
    else if (msg.type() === 'warning') r.consoleWarnings.push(text);
  });
  page.on('pageerror', (err) => r.pageErrors.push(err.stack ?? err.message));
  page.on('requestfailed', (req) => {
    r.requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  await page.route('**/api/proxy**', proxyRouteHandler);

  const started = Date.now();
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    await page.waitForFunction(
      () => document.querySelectorAll('select')[0]?.options.length > 0,
      { timeout: 60_000 },
    );

    await page.fill('input[type="number"] >> nth=1', '1');
    await page.fill('input[type="number"] >> nth=2', '3');
    await page.waitForTimeout(1500);

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('div')).some((d) =>
          d.textContent?.includes('Duration:'),
        ),
      { timeout: 60_000 },
    );

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: PER_ITERATION_TIMEOUT_MS }),
      page.click('button:has-text("Export MP4")'),
    ]);

    const progress = await page
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('Exporting'),
        );
        return btn ? Number(btn.textContent?.match(/(\d+)%/)?.[1] ?? 0) : null;
      })
      .catch(() => null);

    const appError = await page
      .evaluate(() => {
        const errDiv = Array.from(document.querySelectorAll('div')).find((d) => {
          const t = d.textContent ?? '';
          return (
            (d.style?.color === 'rgb(252, 165, 165)' || d.style?.color === '#fca5a5') &&
            t.trim().length > 0
          );
        });
        return errDiv ? errDiv.textContent?.trim() : null;
      })
      .catch(() => null);

    const hasAudioWarning = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('div')).some((d) =>
          d.textContent?.includes('Exported video has no audio'),
        ),
      )
      .catch(() => false);

    const path = await download.path();
    const bytes = path ? statSync(path).size : 0;
    let mp4Valid = false;
    let mp4Info = { trackCount: 0, codecs: [] };
    if (path) {
      const data = readFileSync(path);
      mp4Valid = data.subarray(4, 8).toString('ascii') === 'ftyp';
      mp4Info = inspectMp4(data);
      writeFileSync(join(OUT, `iteration-${i}.mp4`), data);
    }

    r.ok = true;
    r.downloadBytes = bytes;
    r.mp4Valid = mp4Valid;
    r.mp4Info = mp4Info;
    r.progress = progress ?? 100;
    r.hasAudioWarning = hasAudioWarning;
    r.durationSeconds = (Date.now() - started) / 1000;
    if (appError) r.appError = appError;
    if (appError) r.error = appError;
  } catch (err) {
    r.ok = false;
    r.error = err.message;
    r.durationSeconds = (Date.now() - started) / 1000;
    await page
      .screenshot({ path: join(OUT, `iteration-${i}-failure.png`), fullPage: true })
      .catch(() => undefined);
  }

  results.push(r);
  const line = `#${i}: ${r.ok ? 'OK' : 'FAIL'} (${r.durationSeconds?.toFixed(1)}s)`;
  console.log(line);
  if (r.error) console.log(`  error: ${r.error}`);
  if (r.ok) {
    console.log(`  mp4: ${r.mp4Valid ? 'valid' : 'INVALID'} · ${r.downloadBytes} bytes · tracks: ${JSON.stringify(r.mp4Info)} · audio: ${r.hasAudioWarning ? 'MISSING' : 'present'}`);
  }
  for (const e of r.consoleErrors) console.log(`  console.error: ${e}`);
  for (const e of r.pageErrors) console.log(`  pageerror: ${e.split('\n')[0]}`);
  for (const e of r.requestFailures) console.log(`  requestfailed: ${e}`);
  await page.close();
}

await browser.close();

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} exports succeeded ===`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const f of failed) {
    console.log(`  #${f.index}: ${f.error}`);
    for (const e of f.pageErrors) console.log(`    pageerror: ${e.split('\n')[0]}`);
    for (const e of f.consoleErrors) console.log(`    console.error: ${e.split('\n')[0]}`);
  }
  process.exitCode = 1;
}