/**
 * Renders a set of preview frames into the page so the caption pipeline can be
 * checked by eye: word glow at several intensities, the mid-word fade, chunked
 * captions, the ayah marker, translation and the transform overlay.
 *
 *   npx vite --port 5199
 *   CHROME_PATH=... node tests/visual.mjs
 */
import { renderFrame, drawTransformOverlay, defaultBounds } from '../src/render/renderFrame';
import type { FrameRenderOptions } from '../src/render/renderFrame';
import { drawBackground, GRADIENT_PRESETS } from '../src/render/background';
import type { FontSet } from '../src/render/fonts';
import { buildSampleTimeline } from './sample-timeline';

const FONT: FontSet = {
  uthmani: "'KFGQPC HAFS Uthmanic Script', 'Noto Naskh Arabic', serif",
  translation: "system-ui, -apple-system, sans-serif",
  uthmaniLoaded: true,
};

interface Shot {
  label: string;
  t: number;
  highlight: boolean;
  translation?: boolean;
  scrim?: boolean;
  maxWords?: number;
  transform?: boolean;
  /** Crop to this region of the logical frame, at 2x, to inspect edges. */
  crop?: { x: number; y: number; width: number; height: number; zoom: number };
}

const SHOTS: Shot[] = [
  { label: 'highlight mid-word', t: 7.9, highlight: true },
  { label: 'highlight fade-in', t: 8.05, highlight: true },
  { label: 'highlight fade-out', t: 8.2, highlight: true },
  { label: 'highlight gap between words', t: 8.3, highlight: true },
  { label: 'highlight off', t: 7.9, highlight: false },
  { label: 'translation + scrim', t: 7.9, highlight: true, translation: true, scrim: true },
  { label: 'words per screen: 1', t: 8.1, highlight: true, maxWords: 1 },
  { label: 'words per screen: 2', t: 8.4, highlight: true, maxWords: 2 },
  { label: 'transform overlay', t: 7.9, highlight: true, transform: true },
  {
    label: 'active word, 2x',
    t: 7.9,
    highlight: true,
    crop: { x: 120, y: 560, width: 560, height: 300, zoom: 2 },
  },
  {
    label: 'same word, no highlight, 2x',
    t: 7.9,
    highlight: false,
    crop: { x: 120, y: 560, width: 560, height: 300, zoom: 2 },
  },
];

const FRAME_W = 1080;
const FRAME_H = 1920;

function render(shot: Shot, timeline = buildSampleTimeline()): HTMLCanvasElement {
  const work = document.createElement('canvas');
  work.width = FRAME_W;
  work.height = FRAME_H;
  const ctx = work.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const bounds = defaultBounds(FRAME_W, FRAME_H);
  const opts: FrameRenderOptions = {
    tSeconds: shot.t,
    timeline,
    captionsOn: { uthmani: true, translation: Boolean(shot.translation) },
    fonts: FONT,
    bounds,
    scrimEnabled: Boolean(shot.scrim),
    wordHighlightEnabled: shot.highlight,
    maxWordsPerScreen: shot.maxWords ?? 0,
    textColor: { h: 0, s: 0, l: 100 },
    glowColor: { h: 38, s: 100, l: 70 },
    textOpacity: 1,
    drawBackground: (c) => drawBackground(c, GRADIENT_PRESETS[0], null, FRAME_W, FRAME_H),
  };
  renderFrame(ctx, opts);
  if (shot.transform) drawTransformOverlay(ctx, bounds, { x: true, y: false }, { width: FRAME_W, height: FRAME_H });

  const out = document.createElement('canvas');
  if (shot.crop) {
    out.width = shot.crop.width * shot.crop.zoom;
    out.height = shot.crop.height * shot.crop.zoom;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('no 2d context');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(
      work,
      shot.crop.x,
      shot.crop.y,
      shot.crop.width,
      shot.crop.height,
      0,
      0,
      out.width,
      out.height,
    );
  } else {
    out.width = 270;
    out.height = 480;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('no 2d context');
    octx.drawImage(work, 0, 0, out.width, out.height);
  }
  return out;
}

async function main() {
  if ('fonts' in document) {
    try {
      await document.fonts.load(`400 100px 'KFGQPC HAFS Uthmanic Script'`);
      await document.fonts.ready;
    } catch {
      /* fall back to the system font */
    }
  }
  const grid = document.getElementById('grid');
  if (!grid) return;
  for (const shot of SHOTS) {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = shot.label;
    const canvas = render(shot);
    canvas.dataset.label = shot.label;
    figure.append(caption, canvas);
    grid.append(figure);
  }
  (window as unknown as { __visualReady: boolean }).__visualReady = true;
}

void main();
