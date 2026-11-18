/** Runs tests/bench.html in headless Chromium against the running dev server. */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5199/tests/bench.html';

const executablePath = process.env.CHROME_PATH ?? undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text());
});
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => (window).__bench !== undefined, null, { timeout: 120_000 });
const results = await page.evaluate(() => (window).__bench);
console.log(JSON.stringify(results, null, 2));
await browser.close();
