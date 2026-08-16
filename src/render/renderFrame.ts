import { compareToWindow } from '../lib/time';
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '../lib/types/timeline';
import type { FontSet } from './fonts';
import { autoFitFontSize, stripAyahOrnaments, withAyahMarker } from './layout';

export type HighlightMode = 'word' | 'verse';

export interface FrameRenderOptions {
  tSeconds: number;
  timeline: CaptionTimeline;
  captionsOn: { uthmani: boolean; translation: boolean };
  fonts: FontSet;
  drawBackground?: (ctx: CanvasRenderingContext2D, tSeconds: number) => void;
}

const INACTIVE_WORD_ALPHA = 0.55;

export function defaultBackground(ctx: CanvasRenderingContext2D, _tSeconds: number): void {
  const { width: w, height: h } = ctx.canvas;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b2e26');
  grad.addColorStop(0.55, '#14532d');
  grad.addColorStop(1, '#0a0f1e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function verseOpacity(verse: VerseTimelineEntry, t: number, fadeIn: number, fadeOut: number): number {
  if (t < verse.startSeconds || t > verse.endSeconds) return 0;
  const inEnd = verse.startSeconds + fadeIn;
  const outStart = verse.endSeconds - fadeOut;
  if (t < inEnd) return Math.max(0, (t - verse.startSeconds) / fadeIn);
  if (t > outStart) return Math.max(0, (verse.endSeconds - t) / fadeOut);
  return 1;
}

function activeWord(verse: VerseTimelineEntry, t: number): WordSegmentSeconds | null {
  if (!verse.words) return null;
  for (const w of verse.words) {
    if (compareToWindow(t, w.startSeconds, w.endSeconds) === 0) return w;
  }
  return null;
}

function drawUthmaniVerse(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: { t: number; fonts: FontSet; width: number; height: number; opacity: number },
): void {
  const { width, height, fonts } = opts;
  const marginX = Math.round(width * 0.04);
  const marginBottom = Math.round(height * 0.06);
  const rowHeight = Math.round(height * 0.09);
  const rowGap = Math.round(height * 0.01);
  const maxRows = 2;
  const initialFont = Math.round(height * 0.052);
  const highlight = activeWord(verse, opts.t);
  const startY = height - marginBottom - rowHeight;

  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = Math.round(height * 0.006);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  if (verse.words) {
    const fitted = autoFitFontSize({
      ctx,
      words: verse.words.map((w) => ({ index: w.index, text: w.text })),
      rowWidth: width,
      rowHeight,
      maxRows,
      marginX,
      startY,
      rowGap,
      initialFontSize: initialFont,
      minFontSize: Math.round(height * 0.03),
    });
    ctx.font = `600 ${fitted.fontSize}px ${fonts.uthmani}`;
    for (const row of fitted.layout.rows) {
      for (const wl of row.words) {
        if (highlight && wl.index === highlight.index) {
          ctx.globalAlpha = opts.opacity;
          const rect = {
            x: wl.x - wl.width - height * 0.004,
            y: wl.y - fitted.fontSize * 0.95,
            width: wl.width + height * 0.008,
            height: fitted.fontSize * 1.15,
          };
          ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.globalAlpha = opts.opacity * INACTIVE_WORD_ALPHA;
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(wl.text, wl.x, wl.y);
        ctx.globalAlpha = opts.opacity;
      }
    }
  } else {
    const displayText = withAyahMarker(stripAyahOrnaments(verse.uthmani), verse.ayahNumber);
    ctx.globalAlpha = opts.opacity;
    const fitted = autoFitFontSize({
      ctx,
      words: [{ index: 0, text: displayText }],
      rowWidth: width,
      rowHeight,
      maxRows,
      marginX,
      startY,
      rowGap,
      initialFontSize: initialFont,
      minFontSize: Math.round(height * 0.03),
    });
    ctx.font = `600 ${fitted.fontSize}px ${fonts.uthmani}`;
    for (const row of fitted.layout.rows) {
      for (const wl of row.words) {
        ctx.fillText(wl.text, wl.x, wl.y);
      }
    }
  }
  ctx.restore();
}

function drawTranslation(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: { fonts: FontSet; width: number; height: number; opacity: number },
): void {
  const { width, height, fonts } = opts;
  if (!verse.translation) return;
  ctx.save();
  ctx.globalAlpha = opts.opacity * 0.9;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = Math.round(height * 0.005);
  ctx.font = `500 ${Math.round(height * 0.026)}px ${fonts.translation}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const y = height - Math.round(height * 0.025);
  ctx.fillText(verse.translation, width / 2, y);
  ctx.restore();
}

export function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void {
  const { timeline, tSeconds, captionsOn } = opts;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  if (opts.drawBackground) {
    opts.drawBackground(ctx, tSeconds);
  } else {
    defaultBackground(ctx, tSeconds);
  }

  if (!captionsOn.uthmani && !captionsOn.translation) return;

  let active: VerseTimelineEntry | null = null;
  for (const v of timeline.verses) {
    if (compareToWindow(tSeconds, v.startSeconds, v.endSeconds) === 0) {
      active = v;
      break;
    }
  }
  if (!active) return;

  const opacity = verseOpacity(active, tSeconds, timeline.fade.inSeconds, timeline.fade.outSeconds);
  if (opacity <= 0) return;

  const drawOpts = { fonts: opts.fonts, width, height, opacity };
  if (captionsOn.uthmani) {
    drawUthmaniVerse(ctx, active, { ...drawOpts, t: tSeconds });
  }
  if (captionsOn.translation) {
    drawTranslation(ctx, active, drawOpts);
  }
}