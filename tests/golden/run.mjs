/**
 * Golden-image runner: starts the Vite dev server, renders the fixed golden
 * shots in headless Chromium, compares them against the committed baselines and
 * writes missing baselines when run with --update.
 *
 *   npm run test:browser            # compare (fails on drift)
 *   npm run test:browser -- --update   # (re)write baselines
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const baselinesDir = path.join(root, 'tests/golden/baselines');
const update = process.argv.includes('--update');
const PORT = 5280;
const baseUrl = `http://localhost:${PORT}`;

const server = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
server.on('exit', (c, s) => console.log('SERVER EXIT', c, s));

function stopServer() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 5000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('dev server did not start');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

await waitForServer();
const browser = await chromium.launch(
  process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { executablePath: '/usr/bin/google-chrome-stable' },
);
let results;
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.addInitScript(() => {
    window.__goldenWrite = true;
  });
  page.on('pageerror', (e) => {
    console.log(`PAGEERROR: ${e.message}\n${e.stack ?? ''}`);
    throw new Error(`pageerror: ${e.message}\n${e.stack ?? ''}`);
  });
  page.on('console', (m) => {
    console.log(`CONSOLE[${m.type()}]: ${m.text()}`);
  });
  await page.goto(`${baseUrl}/tests/golden.html`, { waitUntil: 'networkidle' });
  await page.evaluate((write) => {
    window.__goldenWrite = Boolean(write);
  }, update);
  await page.waitForFunction(() => Boolean(window.__golden), null, {
    timeout: 60000,
  });
  results = await page.evaluate(() => {
    const w = window;
    return w.__golden ?? [];
  });
  await browser.close();
} finally {
  await stopServer();
}

const TOLERANCE = {
  changedFraction: 0.005,
  maxDiff: 4,
  meanDiff: 1.0,
};

let failures = 0;
for (const shot of results) {
  const { label, dataUrl, diff } = shot;
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const baselinePath = path.join(baselinesDir, `${label}.png`);
  const changedFraction = diff.changed / (diff.width * diff.height);

  if (update) {
    await mkdir(baselinesDir, { recursive: true });
    await writeFile(baselinePath, png);
    console.log(`WROTE ${baselinePath}`);
    continue;
  }

  const baseline = await readFile(baselinePath).catch(() => null);
  if (!baseline) {
    console.error(`MISSING BASELINE ${baselinePath}`);
    failures += 1;
    continue;
  }

  const passed =
    changedFraction <= TOLERANCE.changedFraction &&
    diff.maxDiff <= TOLERANCE.maxDiff &&
    diff.meanDiff <= TOLERANCE.meanDiff;
  if (!passed) {
    failures += 1;
  }
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${label} changed=${diff.changed} (${(changedFraction * 100).toFixed(3)}%) maxDiff=${diff.maxDiff} meanDiff=${diff.meanDiff.toFixed(4)}`,
  );
}

if (failures > 0) {
  console.error(`${failures} golden shot(s) failed.`);
  process.exit(1);
}
console.log(`All ${results.length} golden shots passed.`);
