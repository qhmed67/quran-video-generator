/**
 * End-to-end smoke check of the studio: loads the app, waits for a recitation,
 * then screenshots the preview stage in a few states so the render pipeline can
 * be eyeballed after a change.
 *
 *   npx vite --port 5199
 *   CHROME_PATH=... node tests/shoot.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:5199/#/studio';
const outDir = process.argv[3] ?? '/tmp/opencode/shots';
await mkdir(outDir, { recursive: true });

const executablePath = process.env.CHROME_PATH ?? undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.stage-frame canvas', { timeout: 30_000 });

const info = async () => page.evaluate(() => {
  const c = document.querySelector('.stage-frame canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { backing: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)] };
});

// Wait for a timeline to be built (the stage badge flips out of "Loading").
await page.waitForFunction(
  () => !document.querySelector('.stage-head')?.textContent?.includes('Loading recitation'),
  null,
  { timeout: 90_000 },
);
await page.waitForTimeout(1200);

await page.screenshot({ path: `${outDir}/01-idle.png` });
const stage = page.locator('.stage');
await stage.screenshot({ path: `${outDir}/02-stage-idle.png` });

// Word highlight on.
await page.locator('.switch', { hasText: /Word highlight/ }).click();
await page.waitForTimeout(400);
await stage.screenshot({ path: `${outDir}/03-stage-highlight.png` });

// Translation + backdrop.
await page.locator('.switch', { hasText: /Translation/ }).click();
await page.locator('.switch', { hasText: /Caption backdrop/ }).click();
await page.waitForTimeout(500);
await stage.screenshot({ path: `${outDir}/04-stage-translation-backdrop.png` });

// Play for two seconds so the word timing path runs, then screenshot mid-play.
await page.keyboard.press('Space');
await page.waitForTimeout(2000);
await stage.screenshot({ path: `${outDir}/05-stage-playing.png` });
await page.keyboard.press('Space');

// Words per screen = 1, and transform mode (drag handles).
await page.getByRole('button', { name: '1', exact: true }).first().click();
await page.waitForTimeout(500);
await stage.screenshot({ path: `${outDir}/06-stage-one-word.png` });

await page.locator('.switch', { hasText: /Position text/ }).click();
await page.waitForTimeout(400);
await stage.screenshot({ path: `${outDir}/07-stage-transform.png` });

// Square aspect.
await page.getByRole('button', { name: /Square 1:1/i }).click();
await page.waitForTimeout(900);
await stage.screenshot({ path: `${outDir}/08-stage-square.png` });

console.log(JSON.stringify({ outDir, canvas: await info(), errors }, null, 2));
await browser.close();
