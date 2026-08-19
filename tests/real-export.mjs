import { chromium } from 'playwright';
import { mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'export-loop-results');
mkdirSync(OUT, { recursive: true });

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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const r = { consoleErrors: [], consoleWarns: [], pageErrors: [], requestFailures: [], responses: [] };
page.on('console', (m) => {
  if (m.type() === 'error') r.consoleErrors.push(m.text());
  else if (m.type() === 'warning') r.consoleWarns.push(m.text());
});
page.on('pageerror', (e) => r.pageErrors.push(e.stack ?? e.message));
page.on('requestfailed', (req) =>
  r.requestFailures.push(`${req.method()} ${req.url().slice(0, 140)} :: ${req.failure()?.errorText}`),
);
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('api/proxy')) {
    r.responses.push({ status: res.status(), url: url.slice(0, 160), ct: res.headers()['content-type'] });
  }
});

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('select')[0]?.options.length > 0, { timeout: 60000 });

await page.fill('input[type="number"] >> nth=0', process.env.SURAH ?? '1');
await page.fill('input[type="number"] >> nth=1', process.env.FROM ?? '1');
await page.fill('input[type="number"] >> nth=2', process.env.TO ?? '7');
if (process.env.RECITER) {
  await page.selectOption('select >> nth=0', { label: process.env.RECITER });
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(4000);

const state = await page.evaluate(() => ({
  timing: Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.includes('Timing:'))?.textContent ?? null,
  error: Array.from(document.querySelectorAll('div'))
    .filter((d) => d.style?.color === 'rgb(252, 165, 165)')
    .map((d) => d.textContent?.trim())
    .slice(0, 2),
}));
console.log('STATE:', JSON.stringify(state));

const started = Date.now();
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 300_000 }),
    page.click('button:has-text("Export MP4")'),
  ]);
  const path = await download.path();
  const data = readFileSync(path);
  const info = inspectMp4(data);
  const hasAudio = data.subarray(4, 8).toString('ascii') === 'ftyp';
  writeFileSync(join(OUT, 'real-export.mp4'), data);
  console.log(`EXPORT OK (${((Date.now() - started) / 1000).toFixed(1)}s) bytes=${statSync(path).size} ftyp=${hasAudio} tracks=${JSON.stringify(info)}`);
  const audioWarning = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div')).some((d) => d.textContent?.includes('Exported video has no audio')),
  );
  console.log('audio warning shown:', audioWarning);
} catch (e) {
  console.log(`EXPORT FAIL (${((Date.now() - started) / 1000).toFixed(1)}s): ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: join(OUT, 'real-api-failure.png'), fullPage: true });
}

console.log('CONSOLE ERRORS:', JSON.stringify(r.consoleErrors, null, 2));
console.log('CONSOLE WARNS:', JSON.stringify(r.consoleWarns, null, 2));
console.log('PAGE ERRORS:', JSON.stringify(r.pageErrors, null, 2));
console.log('REQUEST FAILURES:', JSON.stringify(r.requestFailures, null, 2));
console.log('PROXY RESPONSES:');
for (const x of r.responses) console.log(`  ${x.status} ${x.url} [${x.ct}]`);

await browser.close();