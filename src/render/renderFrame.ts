import { compareToWindow } from '../lib/time';
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '../lib/types/timeline';
import type { FontSet } from './fonts';
import { layoutTextBlock, ornateAyahMarker, stripAyahOrnaments } from './layout';
import type { HorizontalAlign, RowLayout, WordDef } from './layout';

export type HighlightMode = 'word' | 'verse';

export interface TextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapState {
  x: boolean;
  y: boolean;
}

export interface FrameRenderOptions {
  tSeconds: number;
  timeline: CaptionTimeline;
  captionsOn: { uthmani: boolean; translation: boolean };
  fonts: FontSet;
  textAlignX?: HorizontalAlign;
  bounds?: TextBounds;
  scrimEnabled?: boolean;
  wordHighlightEnabled?: boolean;
  drawBackground?: (ctx: CanvasRenderingContext2D, tSeconds: number) => void;
}

const INACTIVE_WORD_ALPHA = 0.55;
const MARKER_COLOR = '#ffd76b';

export function defaultBounds(width: number, height: number): TextBounds {
  return {
    x: Math.round(width * 0.05),
    y: Math.round(height * 0.22),
    width: Math.round(width * 0.9),
    height: Math.round(height * 0.56),
  };
}

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
  boxW: number,
  boxH: number,
): void {
  const pad = Math.round(boxH * 0.012);
  const x = Math.round(boxW * 0.02) - pad;
  const y = block.top - pad;
  const w = boxW - 2 * Math.round(boxW * 0.02) + 2 * pad;
  const h = block.bottom - block.top + 2 * pad;
  const r = Math.round(boxH * 0.012);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

export interface UthmaniTextMeasure {
  width: number;
  height: number;
  fits: boolean;
  fontSize: number;
}

interface UthmaniLayout extends UthmaniTextMeasure {
  rows: RowLayout[];
  blockTopRel: number;
}

function buildUthmaniLayout(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: { fonts: FontSet; boxW: number; boxH: number; align: HorizontalAlign },
): UthmaniLayout {
  const { fonts, boxW, boxH, align } = opts;
  const displayWords: WordDef[] = verse.words
    ? [
        ...verse.words
          .map((w) => ({ index: w.index, text: stripAyahOrnaments(w.text).trim() }))
          .filter((w) => w.text.length > 0),
        { index: -1, text: ornateAyahMarker(verse.ayahNumber) },
      ]
    : (() => {
        const raw = stripAyahOrnaments(verse.uthmani).trim();
        const parts = raw.length ? raw.split(/\s+/) : [];
        return [
          ...parts.map((text, i) => ({ index: i, text })),
          { index: -1, text: ornateAyahMarker(verse.ayahNumber) },
        ];
      })();

  const rowHeight = Math.round(boxH * 0.16);
  const rowGap = Math.round(boxH * 0.02);
  const maxRows = Math.max(1, Math.floor((boxH - rowGap) / (rowHeight + rowGap)));
  const marginX = Math.round(boxW * 0.02);
  const initialFont = Math.round(boxH * 0.17);
  const minFont = Math.max(8, Math.round(boxH * 0.05));

  const fitted = layoutTextBlock({
    ctx,
    words: displayWords,
    rowWidth: boxW,
    rowHeight,
    maxRows,
    marginX,
    startY: 0,
    rowGap,
    initialFontSize: initialFont,
    minFontSize: minFont,
    align,
    fontFamily: fonts.uthmani,
  });

  const rowCount = fitted.rows.length;
  const blockHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;
  const blockTopRel = (boxH - blockHeight) / 2;

  return {
    rows: fitted.rows,
    fontSize: fitted.fontSize,
    fits: fitted.fits,
    width: fitted.blockWidth,
    height: blockHeight,
    blockTopRel,
  };
}

export function layoutUthmaniText(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: { fonts: FontSet; boxW: number; boxH: number; align: HorizontalAlign },
): UthmaniTextMeasure {
  const layout = buildUthmaniLayout(ctx, verse, opts);
  return { width: layout.width, height: layout.height, fits: layout.fits, fontSize: layout.fontSize };
}

function drawUthmaniVerse(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: {
    t: number;
    fonts: FontSet;
    height: number;
    bounds: TextBounds;
    opacity: number;
    align: HorizontalAlign;
    scrimEnabled: boolean;
    wordHighlightEnabled: boolean;
  },
): UthmaniBlock {
  const { height, fonts, bounds, align, scrimEnabled, wordHighlightEnabled } = opts;
  const boxX = bounds.x;
  const boxY = bounds.y;
  const boxW = bounds.width;
  const boxH = bounds.height;
  const highlight = wordHighlightEnabled ? activeWord(verse, opts.t) : null;

  const layout = buildUthmaniLayout(ctx, verse, { fonts, boxW, boxH, align });
  const { rows, fontSize, blockTopRel } = layout;
  const rowCount = rows.length;
  const blockHeight = layout.height;

  ctx.save();
  ctx.translate(boxX, boxY);
  ctx.beginPath();
  ctx.rect(0, 0, boxW, boxH);
  ctx.clip();
  if (scrimEnabled && rowCount > 0) {
    drawScrim(ctx, { top: blockTopRel, bottom: blockTopRel + blockHeight }, boxW, boxH);
  }
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = Math.round(height * 0.008);
  ctx.shadowOffsetY = Math.round(height * 0.002);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.font = `400 ${fontSize}px ${fonts.uthmani}`;

  for (const row of rows) {
    for (const wl of row.words) {
      if (wl.index === -1) {
        ctx.globalAlpha = opts.opacity;
        ctx.fillStyle = MARKER_COLOR;
      } else if (verse.words && wordHighlightEnabled) {
        if (highlight && wl.index === highlight.index) {
          ctx.globalAlpha = opts.opacity;
          const rect = {
            x: wl.x - wl.width - height * 0.004,
            y: blockTopRel + row.y - fontSize * 0.95,
            width: wl.width + height * 0.008,
            height: fontSize * 1.15,
          };
          ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.globalAlpha = opts.opacity * INACTIVE_WORD_ALPHA;
          ctx.fillStyle = '#ffffff';
        }
      } else {
        ctx.globalAlpha = opts.opacity;
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillText(wl.text, wl.x, blockTopRel + row.y);
      ctx.globalAlpha = opts.opacity;
    }
  }
  ctx.restore();

  return {
    top: boxY + blockTopRel,
    bottom: boxY + blockTopRel + blockHeight,
  };
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
  ctx.direction = 'ltr';
  ctx.fillText(verse.translation, width / 2, Math.min(y, height - Math.round(height * 0.02)));
  ctx.restore();
}

export function drawTransformOverlay(
  ctx: CanvasRenderingContext2D,
  bounds: TextBounds,
  snap: SnapState,
): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.save();

  if (snap.x) {
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
  }
  if (snap.y) {
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

  const hr = Math.max(13, Math.round(W * 0.012));
  const corners: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ];
  ctx.lineWidth = 2;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, hr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, Math.round(hr * 0.32)), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 1)';
    ctx.fill();
  }

  const edgeHandles: [number, number][] = [
    [bounds.x + bounds.width / 2, bounds.y],
    [bounds.x + bounds.width / 2, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height / 2],
    [bounds.x + bounds.width, bounds.y + bounds.height / 2],
  ];
  const eh = Math.max(4, Math.round(hr * 0.4));
  ctx.lineWidth = 2;
  for (const [ex, ey] of edgeHandles) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
    ctx.fillRect(ex - eh, ey - eh, eh * 2, eh * 2);
    ctx.strokeRect(ex - eh, ey - eh, eh * 2, eh * 2);
  }
  ctx.restore();
}

export function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void {
  const { timeline, tSeconds, captionsOn } = opts;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const align = opts.textAlignX ?? 'center';
  const bounds = opts.bounds ?? defaultBounds(width, height);

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
      height,
      bounds,
      opacity,
      align,
      scrimEnabled: opts.scrimEnabled ?? false,
      wordHighlightEnabled: opts.wordHighlightEnabled ?? false,
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