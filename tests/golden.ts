/**
 * Golden-image characterisation for the shared renderer.
 *
 * Renders a fixed set of frames through the real `renderFrame` in headless
 * Chromium (real canvas, real KFGQPC font) and reports pixel-level statistics
 * against the committed baselines in tests/golden/baselines/.
 *
 *   npm run test:browser            # compare (fails on drift)
 *   npm run test:browser -- --update   # (re)write baselines
 */
import { renderFrame, defaultBounds } from '../src/render/renderFrame';
import type { FrameRenderOptions } from '../src/render/renderFrame';
import { buildSampleTimeline } from './sample-timeline';
import { drawBackground, GRADIENT_PRESETS } from '../src/render/background';
import type { FontSet } from '../src/render/fonts';
import type { StyleRule } from '@qvg/core';

const FONT: FontSet = {
  uthmani: "'KFGQPC HAFS Uthmanic Script', 'Noto Naskh Arabic', serif",
  translation: 'system-ui, -apple-system, sans-serif',
  uthmaniLoaded: true,
};

export interface GoldenShot {
  label: string;
  t: number;
  highlight: boolean;
  maxWords?: number;
  rules?: StyleRule[];
}

export const GOLDEN_SHOTS: GoldenShot[] = [
  { label: 'mid-word-glow', t: 7.9, highlight: true },
  { label: 'fade-in', t: 7.95, highlight: true },
  { label: 'gap-between-words', t: 8.3, highlight: true },
  {
    // Style-rule resolution through the real renderer: the global (green) rule
    // is overridden by the more specific ayah (red) rule, proving the resolver
    // precedence reaches the paint path.
    label: 'word-rule-override',
    t: 7.9,
    highlight: true,
    rules: [
      { id: 'g-global', target: { kind: 'global' }, props: { color: '#00ff00' } },
      {
        id: 'a-ayah-50-2',
        target: { kind: 'ayah', surah: 50, ayah: 2 },
        props: { color: '#ff0000' },
      },
    ],
  },
];

export const GOLDEN_FRAME_W = 1080;
export const GOLDEN_FRAME_H = 1920;

export interface GoldenResult {
  label: string;
  dataUrl: string;
  diff: { width: number; height: number; changed: number; maxDiff: number; meanDiff: number };
}

async function renderShot(
  shot: GoldenShot,
  timeline = buildSampleTimeline(),
): Promise<GoldenResult> {
  const canvas = document.getElementById('frame') as HTMLCanvasElement;
  canvas.width = GOLDEN_FRAME_W;
  canvas.height = GOLDEN_FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const opts: FrameRenderOptions = {
    tSeconds: shot.t,
    timeline,
    captionsOn: { uthmani: true, translation: false },
    fonts: FONT,
    frameWidth: GOLDEN_FRAME_W,
    frameHeight: GOLDEN_FRAME_H,
    bounds: defaultBounds(GOLDEN_FRAME_W, GOLDEN_FRAME_H),
    scrimEnabled: false,
    wordHighlightEnabled: shot.highlight,
    textColor: { h: 0, s: 0, l: 100 },
    glowColor: { h: 38, s: 100, l: 70 },
    textOpacity: 1,
    rules: shot.rules,
    drawBackground: (c) =>
      drawBackground(c, GRADIENT_PRESETS[0], null, GOLDEN_FRAME_W, GOLDEN_FRAME_H),
  };
  renderFrame(canvas, opts);
  const dataUrl = canvas.toDataURL('image/png');

  const result: GoldenResult = {
    label: shot.label,
    dataUrl,
    diff: { width: GOLDEN_FRAME_W, height: GOLDEN_FRAME_H, changed: 0, maxDiff: 0, meanDiff: 0 },
  };

  // The runner toggles `window.__goldenWrite` for `--update` so it can store the
  // frame instead of diffing against a not-yet-existing baseline.
  const w = window as unknown as { __goldenWrite?: boolean };
  if (w.__goldenWrite) {
    return result;
  }

  const baselineUrl = `/tests/golden/baselines/${shot.label}.png`;
  const baselineRes = await fetch(baselineUrl);
  if (baselineRes.ok) {
    const baselineBuf = await baselineRes.arrayBuffer();
    const baseline = await createImageBitmap(new Blob([baselineBuf], { type: 'image/png' }));
    const bctx = new OffscreenCanvas(baseline.width, baseline.height).getContext('2d')!;
    bctx.drawImage(baseline, 0, 0);
    const img = ctx.getImageData(0, 0, GOLDEN_FRAME_W, GOLDEN_FRAME_H);
    const bimg = bctx.getImageData(0, 0, baseline.width, baseline.height);
    const { width, height, data } = img;
    const bdata = bimg.data;
    let changed = 0;
    let maxDiff = 0;
    let sum = 0;
    const total = width * height;
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bdata[i]);
      const dg = Math.abs(data[i + 1] - bdata[i + 1]);
      const db = Math.abs(data[i + 2] - bdata[i + 2]);
      const d = Math.max(dr, dg, db);
      sum += d;
      if (d > 2) changed += 1;
      if (d > maxDiff) maxDiff = d;
    }
    result.diff = { width, height, changed, maxDiff, meanDiff: sum / total };
  }
  return result;
}

async function main(): Promise<void> {
  console.log('GOLDEN main: start');
  if ('fonts' in document) {
    try {
      await document.fonts.load(`400 100px 'KFGQPC HAFS Uthmanic Script'`);
      await document.fonts.ready;
      console.log('GOLDEN fonts ready');
    } catch (e) {
      console.log('GOLDEN fonts error', e);
    }
  }
  const results: GoldenResult[] = [];
  for (const shot of GOLDEN_SHOTS) {
    console.log('GOLDEN rendering', shot.label);
    results.push(await renderShot(shot));
  }
  (window as unknown as { __golden: GoldenResult[] }).__golden = results;
  console.log('GOLDEN done', results.length);
}

void main();
