import { compareToWindow } from '../lib/time';
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '../lib/types/timeline';
import type { FontSet } from './fonts';
import { autoFitFontSize, startYForAnchor, stripAyahOrnaments, withAyahMarker } from './layout';
import type { HorizontalAlign } from './layout';

export type HighlightMode = 'word' | 'verse';

export type VerticalAnchor = 'top' | 'center' | 'bottom';

export interface FrameRenderOptions {
  tSeconds: number;
  timeline: CaptionTimeline;
  captionsOn: { uthmani: boolean; translation: boolean };
  fonts: FontSet;
  textAnchorY?: VerticalAnchor;
  textAlignX?: HorizontalAlign;
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

interface UthmaniBlock {
  top: number;
  bottom: number;
}

function drawScrim(
  ctx: CanvasRenderingContext2D,
  block: UthmaniBlock,
  width: number,
  height: number,
): void {
  const pad = Math.round(height * 0.012);
  const x = Math.round(width * 0.02) - pad;
  const y = block.top - pad;
  const w = width - 2 * Math.round(width * 0.02) + 2 * pad;
  const h = block.bottom - block.top + 2 * pad;
  const r = Math.round(height * 0.012);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function drawUthmaniVerse(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: {
    t: number;
    fonts: FontSet;
    width: number;
    height: number;
    opacity: number;
    anchor: VerticalAnchor;
    align: HorizontalAlign;
  },
): UthmaniBlock {
  const { width, height, fonts, anchor, align } = opts;
  const marginX = Math.round(width * 0.06);
  const marginTop = Math.round(height * 0.08);
  const marginBottom = Math.round(height * 0.08);
  const rowHeight = Math.round(height * 0.09);
  const rowGap = Math.round(height * 0.012);
  const maxRows = 2;
  const initialFont = Math.round(height * 0.052);
  const highlight = activeWord(verse, opts.t);
  const displayWords = verse.words
    ? verse.words.map((w) => ({ index: w.index, text: w.text }))
    : [{ index: 0, text: withAyahMarker(stripAyahOrnaments(verse.uthmani), verse.ayahNumber) }];

  const fitted = autoFitFontSize({
    ctx,
    words: displayWords,
    rowWidth: width,
    rowHeight,
    maxRows,
    marginX,
    startY: 0,
    rowGap,
    initialFontSize: initialFont,
    minFontSize: Math.round(height * 0.03),
    align,
    fontFamily: fonts.uthmani,
  });

  const rowCount = fitted.layout.rows.length;
  const startY = startYForAnchor({
    anchor,
    rowCount,
    rowHeight,
    rowGap,
    width,
    height,
    marginTop,
    marginBottom,
  });

  const block: UthmaniBlock = {
    top: startY + fitted.layout.rows[0].y - fitted.fontSize * 0.95,
    bottom: startY + fitted.layout.rows[rowCount - 1].y + fitted.fontSize * 0.3,
  };

  if (rowCount > 0) {
    drawScrim(ctx, block, width, height);
  }

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = Math.round(height * 0.008);
  ctx.shadowOffsetY = Math.round(height * 0.002);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${fitted.fontSize}px ${fonts.uthmani}`;

  if (verse.words) {
    for (const row of fitted.layout.rows) {
      for (const wl of row.words) {
        if (highlight && wl.index === highlight.index) {
          ctx.globalAlpha = opts.opacity;
          const rect = {
            x: wl.x - wl.width - height * 0.004,
            y: startY + row.y - fitted.fontSize * 0.95,
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
        ctx.fillText(wl.text, wl.x, startY + row.y);
        ctx.globalAlpha = opts.opacity;
      }
    }
  } else {
    ctx.globalAlpha = opts.opacity;
    for (const row of fitted.layout.rows) {
      for (const wl of row.words) {
        ctx.fillText(wl.text, wl.x, startY + row.y);
      }
    }
  }
  ctx.restore();
  return block;
}

function drawTranslation(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: {
    fonts: FontSet;
    width: number;
    height: number;
    opacity: number;
    block: UthmaniBlock;
  },
): void {
  const { width, height, fonts, block } = opts;
  if (!verse.translation) return;
  const fontSize = Math.round(height * 0.026);
  const gap = Math.round(height * 0.015);
  let y = block.bottom + gap + fontSize;
  if (y > height - Math.round(height * 0.04)) {
    y = block.top - gap;
  }
  ctx.save();
  ctx.globalAlpha = opts.opacity * 0.95;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = Math.round(height * 0.005);
  ctx.font = `400 ${fontSize}px ${fonts.translation}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(verse.translation, width / 2, Math.min(y, height - Math.round(height * 0.02)));
  ctx.restore();
}

export function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void {
  const { timeline, tSeconds, captionsOn } = opts;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const anchor = opts.textAnchorY ?? 'center';
  const align = opts.textAlignX ?? 'center';

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

  let block: UthmaniBlock | null = null;
  if (captionsOn.uthmani) {
    block = drawUthmaniVerse(ctx, active, {
      t: tSeconds,
      fonts: opts.fonts,
      width,
      height,
      opacity,
      anchor,
      align,
    });
  }
  if (captionsOn.translation) {
    drawTranslation(ctx, active, {
      fonts: opts.fonts,
      width,
      height,
      opacity,
      block: block ?? { top: height - height * 0.25, bottom: height - height * 0.12 },
    });
  }
}