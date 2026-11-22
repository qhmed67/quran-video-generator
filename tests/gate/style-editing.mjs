/**
 * Phase 4 gate (plan §4): per-word styling changes only that word, exports see
 * the same rules, and undo restores the frame.
 *
 * Hover, selection and an edit are driven through the real studio UI; the
 * worker replies with the active ayah from the real Quran Foundation shape so
 * the test needs no network. Then it reads the preview canvas back and counts
 * pixels, which is the only assertion that proves the pipeline end to end.
 *
 *   npm run test:gate
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const PORT = 5281;
const baseUrl = `http://localhost:${PORT}`;

const server = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));

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

/** Count pixels matching a predicate inside the preview canvas. */
const COUNT_PIXELS = () => {
  const canvas = document.querySelector('canvas[aria-label="Video preview"]');
  if (!canvas) return null;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0;
  let light = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // The styled word: clearly red, clearly not the green background.
    if (r > 100 && r > g + 40 && r > b + 40) red += 1;
    // Unstyled mushaf text: near-white glyphs.
    if (r > 200 && g > 200 && b > 180) light += 1;
  }
  return { red, light: light };
};

/** Read the layout index the app built, straight from its hook state. */
const READ_WORDS = () => {
  const rootEl = document.getElementById('root');
  const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer'));
  if (!key) return null;
  let found = null;
  const walk = (fiber, depth) => {
    if (!fiber || depth > 400 || found) return;
    if (fiber.type && fiber.type.name === 'App') {
      let hook = fiber.memoizedState;
      let i = 0;
      while (hook && i < 140) {
        const value = hook.memoizedState;
        if (!found && value && typeof value === 'object' && value.verses && value.bounds) {
          found = value.verses.flatMap((v) => v.words.words);
        }
        hook = hook.next;
        i += 1;
      }
    }
    walk(fiber.child, depth + 1);
    walk(fiber.sibling, depth);
  };
  walk(rootEl[key].current ?? rootEl[key], 0);
  return found;
};

await waitForServer(60000);
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

let failures = 0;
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
};

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => {
    console.log(`PAGEERROR: ${e.message}`);
    failures += 1;
  });

  // Answer the studio's three data requests from a fixture. The gate tests
  // rendering and interaction, not the Quran Foundation API, and the real
  // endpoints need a client secret the test does not have.
  await page.route('**/api/proxy**', async (route) => {
    const url = new URL(route.request().url());
    const target = url.searchParams.get('url') ?? '';
    if (target.includes('chapter_reciters')) {
      await route.fulfill({
        json: { reciters: [{ id: 6, name: 'Mahmoud Khalil Al-Husary' }] },
      });
      return;
    }
    if (target.includes('chapter_recitations/')) {
      await route.fulfill({
        json: {
          audio_file: {
            id: 1,
            chapter_id: 36,
            audio_url: '',
            timestamps: [
              {
                verse_key: '36:1',
                timestamp_from: 0,
                timestamp_to: 4000,
                // Word boundaries in ms, as QF reports them.
                segments: [
                  [0, 1200, 0],
                  [1200, 2400, 1],
                  [2400, 4000, 2],
                ],
              },
            ],
          },
        },
      });
      return;
    }
    if (target.includes('verses/uthmani')) {
      await route.fulfill({
        json: {
          verses: [
            { verse_key: '36:1', text_uthmani: 'يسٓ وَٱلْقُرْءَانِ ٱلْحَكِيمِ' },
            { verse_key: '36:2', text_uthmani: 'إِنَّكَ لَمِنَ ٱلْمُرْسَلِينَ' },
            { verse_key: '36:3', text_uthmani: 'عَلَىٰ صِرَٰطٍ مُّسْتَقِيمٍ' },
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto(`${baseUrl}/#/studio`, { waitUntil: 'domcontentloaded' });

  // The index only exists once the Uthmani face is ready; on a cold, quiet
  // page that can take a moment.
  let words = null;
  for (let i = 0; i < 40 && !words; i += 1) {
    await page.waitForTimeout(600);
    words = await page.evaluate(READ_WORDS);
  }
  check('layout index is built for the visible ayah', Array.isArray(words) && words.length > 0);
  if (!Array.isArray(words) || words.length === 0) throw new Error('no layout index');

  const target = words[0];
  const toClient = async (frameX, frameY) => {
    const box = await page.locator('canvas[aria-label="Video preview"]').boundingBox();
    return {
      x: box.x + (frameX / 1080) * box.width,
      y: box.y + (frameY / 1920) * box.height,
    };
  };

  const before = await page.evaluate(COUNT_PIXELS);
  check('baseline has no styled word', before && before.red === 0, `red=${before?.red}`);

  // Hover must not change the frame.
  const centre = await toClient(target.x + target.width / 2, target.y - target.height / 2);
  await page.mouse.move(centre.x, centre.y);
  await page.waitForTimeout(400);
  const hovered = await page.evaluate(COUNT_PIXELS);
  check(
    'hover does not change the exported frame',
    hovered && hovered.red === before.red && hovered.light === before.light,
    `before=${JSON.stringify(before)} after=${JSON.stringify(hovered)}`,
  );

  // Select the word and recolour it.
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const scope = await page.locator('.inheritance-text').textContent();
  check(
    'clicking a word selects it',
    /Inherited|Set on/.test(scope ?? ''),
    scope ?? 'no scope label',
  );

  await page.locator('.color-input').fill('#ff2200', { force: true });
  await page.waitForTimeout(900);
  check(
    'the edit is recorded on this word',
    /Set on this Word/.test((await page.locator('.inheritance-text').textContent()) ?? ''),
  );

  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const styled = await page.evaluate(COUNT_PIXELS);
  check(
    'only the selected word turns red',
    styled && styled.red > 0,
    `red=${styled?.red} (was ${before?.red})`,
  );
  check(
    'the rest of the ayah keeps its colour',
    styled && styled.light > 0,
    `remaining light glyphs=${styled?.light}`,
  );

  // Undo restores the frame. Focus the canvas first: inside a text field the
  // shortcut deliberately defers to the browser's own undo.
  await page.locator('canvas[aria-label="Video preview"]').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const restored = await page.evaluate(COUNT_PIXELS);
  check(
    'undo restores the unstyled frame',
    restored && restored.red === 0 && restored.light === before.light,
    `after undo=${JSON.stringify(restored)} baseline=${JSON.stringify(before)}`,
  );
} catch (err) {
  console.log(`FAIL gate — ${err instanceof Error ? err.message : String(err)}`);
  failures += 1;
} finally {
  await browser.close();
  await stopServer();
}

if (failures > 0) {
  console.log(`\n${failures} gate check(s) failed.`);
  process.exit(1);
}
console.log('\nPhase 4 gate passed.');
