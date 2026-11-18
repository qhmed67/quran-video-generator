/** Screenshots each canvas produced by tests/visual.ts. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:5199/tests/visual.html';
const outDir = process.argv[3] ?? '/tmp/opencode/visual';
await mkdir(outDir, { recursive: true });

const executablePath = process.env.CHROME_PATH ?? undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean((window).__visualReady), null, { timeout: 120_000 });

const canvases = page.locator('#grid canvas');
const count = await canvases.count();
let i = 0;
for (const canvas of await canvases.all()) {
  const label = await canvas.getAttribute('data-label');
  const file = `${outDir}/${String(i++).padStart(2, '0')}-${(label ?? 'shot').replace(/[^a-z0-9]+/gi, '-')}.png`;
  await canvas.screenshot({ path: file });
  console.log(file);
}
await page.screenshot({ path: `${outDir}/grid.png`, fullPage: true });
console.log(`rendered ${count} frames`);
await browser.close();
