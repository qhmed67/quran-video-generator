/**
 * Numerical regression checks for the caption renderer, run in Chromium against
 * the dev server so the real canvas paths are exercised.
 *
 *   npx vite --port 5199
 *   CHROME_PATH=... node tests/verify-render.mjs
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5199/tests/visual.html';

const executablePath = process.env.CHROME_PATH ?? undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean((window).__visualReady), null, { timeout: 120_000 });

const report = await page.evaluate(async () => {
  const { renderFrame, defaultBounds } = await import('/src/render/renderFrame.ts');
  const { drawBackground, GRADIENT_PRESETS } = await import('/src/render/background.ts');
  const { countArabicLetters, isStandaloneToken } = await import('/src/render/layout.ts');
  const { buildSampleTimeline } = await import('/tests/sample-timeline.ts');

  const W = 1080;
  const H = 1920;
  const timeline = buildSampleTimeline();
  const fonts = {
    uthmani: "'KFGQPC HAFS Uthmanic Script', 'Noto Naskh Arabic', serif",
    translation: 'system-ui, sans-serif',
    uthmaniLoaded: true,
  };

  const frame = document.createElement('canvas');
  frame.width = W;
  frame.height = H;
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;

  function draw(target, opts) {
    const w = opts.frameWidth ?? target.width;
    const h = opts.frameHeight ?? target.height;
    const ctx = target.getContext('2d');
    renderFrame(ctx, {
      captionsOn: { uthmani: true, translation: Boolean(opts.translation) },
      fonts,
      bounds: defaultBounds(w, h),
      textColor: { h: 0, s: 0, l: 100 },
      glowColor: { h: 38, s: 100, l: 70 },
      textOpacity: 1,
      timeline,
      drawBackground: (c) => drawBackground(c, GRADIENT_PRESETS[0], null, w, h),
      ...opts,
    });
    return ctx;
  }

  /** Fraction of pixels that differ from the background, i.e. painted text. */
  function coverage(tSeconds) {
    draw(bg, { tSeconds, captionsOn: { uthmani: false, translation: false } });
    const bgData = bg.getContext('2d').getImageData(0, 0, W, H).data;
    const data = frame.getContext('2d').getImageData(0, 0, W, H).data;
    let painted = 0;
    let bright = 0;
    let gold = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bgData[i]);
      const dg = Math.abs(data[i + 1] - bgData[i + 1]);
      const db = Math.abs(data[i + 2] - bgData[i + 2]);
      if (dr > 10 || dg > 10 || db > 10) painted++;
      if (data[i] > 205 && data[i + 1] > 205 && data[i + 2] > 195) bright++;
      if (data[i] > 170 && data[i + 1] > 120 && data[i + 2] < 140 && dr > 20) gold++;
    }
    return { painted: painted / (W * H), bright, gold };
  }

  const problems = [];
  const times = [];
  for (let t = 0.6; t < 33; t += 0.7) times.push(+t.toFixed(2));

  let offChecked = 0;
  let onChecked = 0;
  let goldChecked = 0;
  let glowChecked = 0;

  for (const tSeconds of times) {
    const verse = timeline.verses.find((v) => tSeconds >= v.startSeconds && tSeconds < v.endSeconds);
    if (!verse) continue;

    // Caption text must appear whenever the verse is not in its fade-out tail.
    const fadeTail = verse.endSeconds - tSeconds < 0.05;
    if (!fadeTail) {
      draw(frame, { tSeconds, wordHighlightEnabled: false, maxWordsPerScreen: 0 });
      const off = coverage(tSeconds);
      offChecked++;
      if (off.painted < 0.001) problems.push({ tSeconds, kind: 'no text with highlight off', off });
      if (off.gold > 20) goldChecked++;

      draw(frame, { tSeconds, wordHighlightEnabled: true, maxWordsPerScreen: 0 });
      const on = coverage(tSeconds);
      onChecked++;
      if (on.painted < 0.001) problems.push({ tSeconds, kind: 'no text with highlight on', on });
    }

    // Chunked captions must render the selected chunk (blank only when the
    // chunk is a bare ayah marker, which carries no displayable letters).
    for (const maxWords of [1, 2, 3]) {
      const words = verse.words;
      if (!words) continue;
      let idx = 0;
      for (let i = 0; i < words.length; i++) if (words[i].startSeconds <= tSeconds) idx = i;
      const chunkStart = Math.floor(idx / maxWords) * maxWords;
      const chunk = words.slice(chunkStart, chunkStart + maxWords);
      const blankAllowed = chunk.every((w) => countArabicLetters(w.text) === 0);
      if (blankAllowed || fadeTail) continue;
      draw(frame, { tSeconds, wordHighlightEnabled: true, maxWordsPerScreen: maxWords });
      const cov = coverage(tSeconds);
      if (cov.painted < 0.0005 && cov.bright === 0) {
        problems.push({ tSeconds, kind: `no text with ${maxWords} word(s) per screen`, cov });
      }
    }
  }

  // A word at the middle of its window must be lit by the glow tier. The middle
  // is where `activeWordGlow` holds full intensity and fades are disabled, so
  // this isolates the highlight path from the verse fade in and out.
  const noFadeTimeline = { ...buildSampleTimeline(), fade: { inSeconds: 0.001, outSeconds: 0.001 } };
  for (const verse of noFadeTimeline.verses) {
    for (const word of verse.words ?? []) {
      if (countArabicLetters(word.text) < 2 || isStandaloneToken(word.text)) continue;
      const tSeconds = word.startSeconds + (word.endSeconds - word.startSeconds) / 2;
      // Only a verse that owns this instant can light its words; the sample
      // fixture has verses whose windows overlap.
      const owner = noFadeTimeline.verses.find((v) => tSeconds >= v.startSeconds && tSeconds < v.endSeconds);
      if (owner !== verse) continue;
      draw(frame, { tSeconds, wordHighlightEnabled: true, maxWordsPerScreen: 0, timeline: noFadeTimeline });
      const cov = coverage(tSeconds);
      glowChecked++;
      if (cov.bright === 0) problems.push({ tSeconds, word: word.text, kind: 'active word not lit', cov });
    }
  }

  // Scaling the backing store must reproduce the full-resolution frame.
  const half = document.createElement('canvas');
  half.width = W / 2;
  half.height = H / 2;
  const diffs = [];
  for (const tSeconds of [3.5, 7.9, 12.3, 18.6, 24.1]) {
    for (const wordHighlightEnabled of [false, true]) {
      draw(frame, { tSeconds, wordHighlightEnabled, maxWordsPerScreen: 0 });
      draw(half, { tSeconds, wordHighlightEnabled, maxWordsPerScreen: 0, frameWidth: W, frameHeight: H });
      const ref = document.createElement('canvas');
      ref.width = W / 2;
      ref.height = H / 2;
      const rctx = ref.getContext('2d');
      rctx.imageSmoothingQuality = 'high';
      rctx.drawImage(frame, 0, 0, ref.width, ref.height);
      const a = rctx.getImageData(0, 0, ref.width, ref.height).data;
      const b = half.getContext('2d').getImageData(0, 0, half.width, half.height).data;
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      }
      const meanAbsDiff = +(sum / (a.length / 4) / 3).toFixed(2);
      diffs.push({ tSeconds, wordHighlightEnabled, meanAbsDiff });
      if (meanAbsDiff > 6) problems.push({ tSeconds, kind: 'scaled frame differs', meanAbsDiff });
    }
  }

  // The cached path must be pixel-identical to a cold render.
  draw(frame, { tSeconds: 7.9, wordHighlightEnabled: true, maxWordsPerScreen: 0 });
  const warm = frame.getContext('2d').getImageData(0, 0, W, H).data;
  draw(frame, { tSeconds: 26.5, wordHighlightEnabled: true, maxWordsPerScreen: 3 });
  draw(frame, { tSeconds: 7.9, wordHighlightEnabled: true, maxWordsPerScreen: 0 });
  const again = frame.getContext('2d').getImageData(0, 0, W, H).data;
  let warmDiff = 0;
  for (let i = 0; i < warm.length; i += 4) warmDiff += Math.abs(warm[i] - again[i]);
  const repeatMeanAbsDiff = +(warmDiff / (warm.length / 4)).toFixed(4);
  if (repeatMeanAbsDiff > 0.01) problems.push({ kind: 'repeat frame differs', repeatMeanAbsDiff });

  return {
    checked: { offChecked, onChecked, goldChecked, glowChecked },
    problems,
    scaledFrameDiff: diffs,
    repeatMeanAbsDiff,
  };
});

console.log(JSON.stringify(report, null, 2));
console.log(report.problems.length === 0 ? 'PASS' : `FAIL: ${report.problems.length} problem(s)`);
await browser.close();
process.exitCode = report.problems.length === 0 ? 0 : 1;
