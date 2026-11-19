/**
 * Preview render benchmark.
 *
 * Measures how long `renderFrame` takes per frame at the two resolutions the
 * studio uses: the full 1080x1920 export frame, and a smaller backing store for
 * the on-screen preview. Run with the dev server up:
 *
 *   npx vite --port 5173
 *   node tests/bench.mjs          (or open http://localhost:5173/tests/bench.html)
 *
 * The page prints its results as JSON on `window.__bench`.
 */
import { renderFrame } from '../src/render/renderFrame';
import type { FrameRenderOptions } from '../src/render/renderFrame';
import { drawBackground, GRADIENT_PRESETS } from '../src/render/background';
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '@qvg/core';
import type { FontSet } from '../src/render/fonts';

const FONT: FontSet = {
  uthmani: "'KFGQPC HAFS Uthmanic Script', 'Noto Naskh Arabic', serif",
  translation: 'system-ui, -apple-system, sans-serif',
  uthmaniLoaded: true,
};

const AYAT = [
  'ق ۝١ وَالْقُرْآنِ الْمَجِيدِ ۝٢ بَلْ عَجِبُوا أَن جَاءَهُم مُّنذِرٌ مِّنْهُمْ',
  'فَقَالَ الْكَافِرُونَ هَـٰذَا شَيْءٌ عَجِيبٌ ۝٣ أَإِذَا مِتْنَا وَكُنَّا تُرَابًا',
  'ذَٰلِكَ رَجْعٌ بَعِيدٌ ۝٤ قَدْ عَلِمْنَا مَا تَنقُصُ الْأَرْضُ مِنْهُمْ',
  'وَعِندَنَا كِتَابٌ حَفِيظٌ ۝٥ بَلْ كَذَّبُوا بِالْحَقِّ لَمَّا جَاءَهُمْ',
  'فَهُمْ فِي أَمْرٍ مَّرِيجٍ ۝٦ أَفَلَمْ يَنظُرُوا إِلَى السَّمَاءِ فَوْقَهُمْ',
];

function buildTimeline(): CaptionTimeline {
  const verses: VerseTimelineEntry[] = AYAT.map((text, i) => {
    const parts = text.split(/\s+/).filter(Boolean);
    let t = i * 7;
    const start = t;
    const words: WordSegmentSeconds[] = parts.map((w, wi) => {
      const dur = 0.42 + ((i * 13 + wi * 7) % 9) * 0.06;
      const seg = { index: wi, text: w, startSeconds: t, endSeconds: t + dur };
      t += dur;
      return seg;
    });
    return {
      verseKey: `50:${i + 1}`,
      ayahNumber: i + 1,
      startSeconds: start,
      endSeconds: words[words.length - 1].endSeconds + 0.4,
      uthmani: text,
      translation: 'This is a sample translation line used to measure the caption frame cost.',
      words,
    };
  });
  return {
    version: 1,
    units: { time: 'seconds' },
    meta: {
      granularity: 'word',
      sourceChain: ['bench'],
      reciterId: '1',
      surah: 50,
      versesFrom: 1,
      versesTo: AYAT.length,
      audioUrl: 'bench.mp3',
      clipStartOffsetSeconds: 0,
      captions: {
        uthmani: true,
        translation: { enabled: true, translationId: 131, language: 'en' },
      },
    },
    verses,
    fade: { inSeconds: 0.4, outSeconds: 0.4 },
  };
}

interface FrameOpts {
  highlight: boolean;
  translation: boolean;
  scrim: boolean;
  /** Render into a smaller backing store while keeping the logical frame size. */
  frameWidth?: number;
  frameHeight?: number;
}

function makeOptions(
  canvas: HTMLCanvasElement,
  timeline: CaptionTimeline,
  o: FrameOpts,
): FrameRenderOptions {
  const w = o.frameWidth ?? canvas.width;
  const h = o.frameHeight ?? canvas.height;
  return {
    tSeconds: 0,
    timeline,
    captionsOn: { uthmani: true, translation: o.translation },
    fonts: FONT,
    bounds: {
      x: Math.round(w * 0.05),
      y: Math.round(h * 0.22),
      width: Math.round(w * 0.9),
      height: Math.round(h * 0.56),
    },
    scrimEnabled: o.scrim,
    wordHighlightEnabled: o.highlight,
    maxWordsPerScreen: 0,
    textColor: { h: 0, s: 0, l: 100 },
    glowColor: { h: 38, s: 100, l: 70 },
    textOpacity: 1,
    drawBackground: (c) => drawBackground(c, GRADIENT_PRESETS[0], null, w, h),
  } as FrameRenderOptions;
}

function timeFrames(
  canvas: HTMLCanvasElement,
  timeline: CaptionTimeline,
  o: FrameOpts,
  frames: number,
  mode: 'walk' | 'static',
): number[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const opts = makeOptions(canvas, timeline, o);
  const times: number[] = [];
  const total = timeline.verses[timeline.verses.length - 1].endSeconds;
  for (let i = 0; i < frames; i++) {
    const t = mode === 'walk' ? (i / frames) * total : total * 0.42;
    const started = performance.now();
    renderFrame(ctx, { ...opts, tSeconds: t });
    // Force the queued canvas commands to rasterise so the sample includes
    // real paint work instead of just command recording.
    ctx.getImageData(0, 0, 1, 1);
    times.push(performance.now() - started);
  }
  return times;
}

function summarise(times: number[]): { mean: number; p50: number; p95: number; max: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +sorted[sorted.length - 1].toFixed(2),
  };
}

async function main() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  if ('fonts' in document) {
    try {
      await document.fonts.load(`400 100px 'KFGQPC HAFS Uthmanic Script'`);
      await document.fonts.ready;
    } catch {
      /* fall back to whatever the system has */
    }
  }
  const timeline = buildTimeline();
  const FRAMES = 120;

  const results: Record<string, unknown> = {};

  const scale = 0.5;
  const runs: Array<{ name: string; w: number; h: number; o: FrameOpts; mode: 'walk' | 'static' }> =
    [
      {
        name: 'full/plain',
        w: 1080,
        h: 1920,
        o: { highlight: false, translation: false, scrim: false },
        mode: 'walk',
      },
      {
        name: 'full/highlight',
        w: 1080,
        h: 1920,
        o: { highlight: true, translation: false, scrim: false },
        mode: 'walk',
      },
      {
        name: 'full/highlight+translation+scrim',
        w: 1080,
        h: 1920,
        o: { highlight: true, translation: true, scrim: true },
        mode: 'walk',
      },
      {
        name: 'full/plain/static',
        w: 1080,
        h: 1920,
        o: { highlight: false, translation: false, scrim: false },
        mode: 'static',
      },
      {
        name: 'half/plain',
        w: 540,
        h: 960,
        o: {
          highlight: false,
          translation: false,
          scrim: false,
          frameWidth: 1080,
          frameHeight: 1920,
        },
        mode: 'walk',
      },
      {
        name: 'half/highlight',
        w: 540,
        h: 960,
        o: {
          highlight: true,
          translation: false,
          scrim: false,
          frameWidth: 1080,
          frameHeight: 1920,
        },
        mode: 'walk',
      },
      {
        name: 'half/highlight+translation+scrim',
        w: 540,
        h: 960,
        o: { highlight: true, translation: true, scrim: true, frameWidth: 1080, frameHeight: 1920 },
        mode: 'walk',
      },
    ];

  for (const run of runs) {
    canvas.width = run.w;
    canvas.height = run.h;
    canvas.style.width = `${Math.round(run.w / 3)}px`;
    const hole = run.o.frameWidth ?? 0;
    if (hole === 0) delete (run.o as Partial<FrameOpts>).frameWidth;
    try {
      timeFrames(canvas, timeline, run.o, 12, run.mode); // warm up
      results[`${run.name} @${run.w}x${run.h} scale=${scale}`] = summarise(
        timeFrames(canvas, timeline, run.o, FRAMES, run.mode),
      );
    } catch (err) {
      results[`${run.name} @${run.w}x${run.h}`] = { error: (err as Error).message };
    }
  }

  const out = document.getElementById('out');
  if (out) out.textContent = JSON.stringify(results, null, 2);
  (window as unknown as { __bench: unknown }).__bench = results;
}

void main();
