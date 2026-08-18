import { compareToWindow } from '../lib/time';
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '../lib/types/timeline';
import type { FontSet } from './fonts';
import {
  countArabicLetters,
  displayWordText,
  isStandaloneToken,
  layoutTextBlock,
  rowHeightFor,
  toArabicIndicDigits,
  stripAyahOrnaments,
  stripQuranicMarks,
} from './layout';
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

export interface HslColor {
  h: number;
  s: number;
  l: number;
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
  maxWordsPerScreen?: number;
  textColor?: HslColor;
  glowColor?: HslColor;
  textOpacity?: number;
  drawBackground?: (ctx: CanvasRenderingContext2D, tSeconds: number) => void;
}

const DEFAULT_TEXT_COLOR: HslColor = { h: 0, s: 0, l: 100 };
const DEFAULT_GLOW_COLOR: HslColor = { h: 38, s: 100, l: 70 };
const DEFAULT_TEXT_OPACITY = 1;
const AYAH_NUM_COLOR = 'rgba(255, 215, 100, 1)';
const IDLE_OPACITY = 0.35;
const GLOW_BLUR_RATIO = 0.012;
const VERTICAL_SAFETY_PAD = 12;

function hslToCSS(c: HslColor, alpha?: number): string {
  if (alpha !== undefined) return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
  return `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
}

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

interface ActiveWordGlow {
  word: WordSegmentSeconds;
  intensity: number;
  textOpacity: number;
}

function easeInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function activeWordGlow(verse: VerseTimelineEntry, t: number): ActiveWordGlow | null {
  if (!verse.words) return null;
  const ws = verse.words;
  let active = -1;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w.endSeconds > w.startSeconds && t >= w.startSeconds && t < w.endSeconds) {
      active = i;
      break;
    }
  }
  if (active === -1) return null;
  const mergedStart = ws[active].startSeconds;
  let target = active;
  while (target < ws.length - 1 && isStandaloneToken(ws[target].text)) target += 1;
  const tw = ws[target];
  if (isStandaloneToken(tw.text)) return null;
  if (!(tw.endSeconds > tw.startSeconds)) return null;
  const windowStart = Math.min(mergedStart, tw.startSeconds);
  const windowEnd = tw.endSeconds;
  if (t < windowStart || t >= windowEnd) return null;
  const dur = windowEnd - windowStart;
  if (dur <= 0) return null;

  const progress = (t - windowStart) / dur;
  let intensity: number;
  let textOpacity: number;

  if (progress < 0.2) {
    const p = easeInOut(progress / 0.2);
    intensity = p;
    textOpacity = IDLE_OPACITY + (1 - IDLE_OPACITY) * p;
  } else if (progress < 0.9) {
    intensity = 1;
    textOpacity = 1;
  } else {
    const p = easeInOut((1 - progress) / 0.1);
    intensity = p;
    textOpacity = IDLE_OPACITY + (1 - IDLE_OPACITY) * p;
  }

  if (intensity <= 0) return null;
  return { word: tw, intensity, textOpacity };
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
  opts: { fonts: FontSet; boxW: number; boxH: number; align: HorizontalAlign; atMinFont?: boolean; showAyahNumber?: boolean },
): UthmaniLayout {
  const { fonts, boxW, boxH, align, atMinFont, showAyahNumber } = opts;
  const displayWords: WordDef[] = verse.words
    ? verse.words
        .map((w) => ({ index: w.index, text: displayWordText(w.text).trim() }))
        .filter((w) => w.text.length > 0 && countArabicLetters(w.text) > 0)
    : (() => {
        const raw = stripAyahOrnaments(stripQuranicMarks(verse.uthmani)).trim();
        const parts = raw.length ? raw.split(/\s+/) : [];
        const kept: WordDef[] = [];
        for (const part of parts) {
          const text = displayWordText(part).trim();
          if (text.length > 0 && countArabicLetters(text) > 0) {
            kept.push({ index: kept.length, text });
          }
        }
        return kept;
      })();

  if (displayWords.length > 0 && showAyahNumber !== false) {
    const last = displayWords[displayWords.length - 1];
    last.text = last.text + ' ' + toArabicIndicDigits(verse.ayahNumber);
  }

  const rowGap = Math.round(boxH * 0.02);
  const marginX = Math.round(boxW * 0.04);
  const initialFont = Math.round(boxH * 0.17);
  const minFont = Math.max(8, Math.round(boxH * 0.05));

  const fitted = layoutTextBlock({
    ctx,
    words: displayWords,
    rowWidth: boxW,
    boxH,
    marginX,
    startY: 0,
    rowGap,
    initialFontSize: atMinFont ? minFont : initialFont,
    minFontSize: minFont,
    fixedFont: atMinFont ? true : undefined,
    align,
    fontFamily: fonts.uthmani,
  });

  const rowCount = fitted.rows.length;
  const fittedRowHeight = rowHeightFor(fitted.fontSize);
  const blockHeight = rowCount * fittedRowHeight + Math.max(0, rowCount - 1) * rowGap;
  const availableHeight = boxH - 2 * VERTICAL_SAFETY_PAD;
  const blockTopRel = VERTICAL_SAFETY_PAD + (availableHeight - blockHeight) / 2;

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
  opts: { fonts: FontSet; boxW: number; boxH: number; align: HorizontalAlign; atMinFont?: boolean },
): UthmaniTextMeasure {
  const layout = buildUthmaniLayout(ctx, verse, opts);
  return { width: layout.width, height: layout.height, fits: layout.fits, fontSize: layout.fontSize };
}

/**
 * Creates a scratch canvas we can render fully-opaque glyphs onto before
 * compositing the flattened result with the fade opacity. Works both on the
 * main thread (HTMLCanvasElement) and inside a Worker (OffscreenCanvas), in
 * case the export pipeline ever moves frame rendering off the main thread.
 */
function createBufferCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, ctx };
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
    textColor: HslColor;
    glowColor: HslColor;
    textOpacity: number;
    showAyahNumber?: boolean;
  },
): UthmaniBlock {
  const { height, fonts, bounds, align, scrimEnabled, wordHighlightEnabled, textColor, glowColor, textOpacity, showAyahNumber } = opts;
  const boxX = bounds.x;
  const boxY = bounds.y;
  const boxW = bounds.width;
  const boxH = bounds.height;
  const layout = buildUthmaniLayout(ctx, verse, { fonts, boxW, boxH, align, showAyahNumber });
  const { rows, fontSize, blockTopRel } = layout;
  const rowCount = rows.length;
  const blockHeight = layout.height;
  const highlight = wordHighlightEnabled ? activeWordGlow(verse, opts.t) : null;
  const baseShadowBlur = Math.round(height * 0.008);
  const maxGlowBlur = Math.round(height * GLOW_BLUR_RATIO);

  ctx.save();
  ctx.translate(boxX, boxY);
  ctx.beginPath();
  ctx.rect(0, -VERTICAL_SAFETY_PAD, boxW, boxH + 2 * VERTICAL_SAFETY_PAD);
  ctx.clip();
  if (scrimEnabled && rowCount > 0) {
    drawScrim(ctx, { top: blockTopRel - VERTICAL_SAFETY_PAD, bottom: blockTopRel + blockHeight + VERTICAL_SAFETY_PAD }, boxW, boxH);
  }

  // --- Glyph pass -----------------------------------------------------
  // Words are drawn onto per-opacity-TIER offscreen buffers, always at
  // globalAlpha = 1. "Tier" = idle/ghost words, the single actively
  // highlighted word, or (when word-highlight is off) all words together.
  // Filling at alpha 1 means overlapping glyph contours, harakat marks and
  // ligature joins within the SAME word — and any incidental overlap
  // between words in the same tier — simply stay opaque instead of being
  // composited twice. This is what removes the artifacts on the faded
  // "ghost" words, not just during the verse-level fade.
  const pad = Math.ceil(baseShadowBlur + maxGlowBlur) + 4;
  const bufW = Math.ceil(boxW + pad * 2);
  const bufH = Math.ceil(boxH + VERTICAL_SAFETY_PAD * 2 + pad * 2);

  const idleBuf = createBufferCanvas(bufW, bufH);
  const activeBuf = highlight ? createBufferCanvas(bufW, bufH) : null;
  const plainBuf = !wordHighlightEnabled ? createBufferCanvas(bufW, bufH) : null;
  let idleUsed = false;
  let activeUsed = false;
  let plainUsed = false;

  for (const buf of [idleBuf, activeBuf, plainBuf]) {
    if (!buf) continue;
    buf.ctx.translate(pad, pad + VERTICAL_SAFETY_PAD);
    buf.ctx.textAlign = 'right';
    buf.ctx.textBaseline = 'alphabetic';
    buf.ctx.direction = 'rtl';
    buf.ctx.font = `400 ${fontSize}px ${fonts.uthmani}`;
    buf.ctx.shadowOffsetY = Math.round(height * 0.002);
  }

  const lastWordIdx = rows.length > 0 && rows[rows.length - 1].words.length > 0
    ? rows[rows.length - 1].words[rows[rows.length - 1].words.length - 1].index
    : -1;

  // tierAlpha values are filled in as we discover which tiers are used.
  let idleAlpha = IDLE_OPACITY * textOpacity;
  let activeAlpha = 1;

  for (const row of rows) {
    for (const wl of row.words) {
      let bctx: CanvasRenderingContext2D;

      if (verse.words && wordHighlightEnabled) {
        const glow = highlight && wl.index === highlight.word.index ? highlight : null;
        if (glow && activeBuf) {
          bctx = activeBuf.ctx;
          activeAlpha = glow.textOpacity * textOpacity;
          activeUsed = true;
          bctx.shadowColor = hslToCSS(glowColor, 0.95);
          bctx.shadowBlur = Math.round(baseShadowBlur + (maxGlowBlur - baseShadowBlur) * glow.intensity);
          bctx.fillStyle = hslToCSS(textColor);
        } else {
          bctx = idleBuf.ctx;
          idleUsed = true;
          bctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          bctx.shadowBlur = baseShadowBlur;
          bctx.fillStyle = hslToCSS(textColor);
        }
      } else {
        bctx = plainBuf!.ctx;
        plainUsed = true;
        bctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        bctx.shadowBlur = baseShadowBlur;
        bctx.fillStyle = hslToCSS(textColor);
      }

      if (wl.index === lastWordIdx) {
        const spaceIdx = wl.text.lastIndexOf(' ');
        if (spaceIdx !== -1) {
          const wordPart = wl.text.substring(0, spaceIdx);
          const numPart = wl.text.substring(spaceIdx + 1);
          bctx.fillText(wordPart, wl.x, blockTopRel + row.y);
          const wordWidth = bctx.measureText(wordPart).width;
          const spaceWidth = bctx.measureText(' ').width;
          const prevFill = bctx.fillStyle;
          const prevShadow = bctx.shadowColor;
          const prevBlur = bctx.shadowBlur;
          bctx.fillStyle = AYAH_NUM_COLOR;
          bctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          bctx.shadowBlur = baseShadowBlur;
          bctx.fillText(numPart, wl.x - wordWidth - spaceWidth, blockTopRel + row.y);
          bctx.fillStyle = prevFill;
          bctx.shadowColor = prevShadow;
          bctx.shadowBlur = prevBlur;
        } else {
          bctx.fillText(wl.text, wl.x, blockTopRel + row.y);
        }
      } else {
        bctx.fillText(wl.text, wl.x, blockTopRel + row.y);
      }
    }
  }

  // --- Composite pass ---------------------------------------------------
  // Each tier buffer is now a single flattened raster (one alpha value per
  // pixel — no overlapping partial-alpha draws left inside it). Composite
  // each tier with exactly ONE globalAlpha on ONE drawImage call, folding
  // in the verse-level fade (opts.opacity) at the same time. There is
  // nothing left for either the fade or the highlight opacity to
  // double-blend against.
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  const drawTier = (buf: { canvas: HTMLCanvasElement | OffscreenCanvas } | null, used: boolean, alpha: number) => {
    if (!buf || !used) return;
    ctx.globalAlpha = alpha * opts.opacity;
    ctx.drawImage(buf.canvas as CanvasImageSource, -pad, -pad - VERTICAL_SAFETY_PAD);
  };
  drawTier(idleBuf, idleUsed, idleAlpha);
  drawTier(activeBuf, activeUsed, activeAlpha);
  drawTier(plainBuf, plainUsed, textOpacity);
  ctx.globalAlpha = 1;

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

function chunkVerse(verse: VerseTimelineEntry, maxWords: number, tSeconds: number): { verse: VerseTimelineEntry; isLastChunk: boolean } {
  if (!verse.words || maxWords <= 0) return { verse, isLastChunk: true };
  const words = verse.words;
  const totalWords = words.length;
  if (totalWords <= maxWords) return { verse, isLastChunk: true };

  const chunks: { start: number; end: number; isFirst: boolean; isLast: boolean }[] = [];
  for (let s = 0; s < totalWords; s += maxWords) {
    chunks.push({ start: s, end: Math.min(s + maxWords, totalWords), isFirst: s === 0, isLast: s + maxWords >= totalWords });
  }

  for (const chunk of chunks) {
    const chunkWords = words.slice(chunk.start, chunk.end);
    const firstWord = chunkWords[0];
    const lastWord = chunkWords[chunkWords.length - 1];
    if (tSeconds >= firstWord.startSeconds && tSeconds < lastWord.endSeconds) {
      return {
        verse: {
          ...verse,
          words: chunkWords.map((w, i) => ({ ...w, index: i })),
          startSeconds: firstWord.startSeconds,
          endSeconds: lastWord.endSeconds,
        },
        isLastChunk: chunk.isLast,
      };
    }
  }

  const lastChunk = chunks[chunks.length - 1];
  const lastChunkWords = words.slice(lastChunk.start, lastChunk.end);
  return {
    verse: {
      ...verse,
      words: lastChunkWords.map((w, i) => ({ ...w, index: i })),
      startSeconds: lastChunkWords[0].startSeconds,
      endSeconds: lastChunkWords[lastChunkWords.length - 1].endSeconds,
    },
    isLastChunk: true,
  };
}

export function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void {
  const { timeline, tSeconds, captionsOn } = opts;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const align = opts.textAlignX ?? 'center';
  const bounds = opts.bounds ?? defaultBounds(width, height);
  const textColor = opts.textColor ?? DEFAULT_TEXT_COLOR;
  const glowColor = opts.glowColor ?? DEFAULT_GLOW_COLOR;
  const textOpacity = opts.textOpacity ?? DEFAULT_TEXT_OPACITY;

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

  const maxWords = opts.maxWordsPerScreen ?? 0;
  let showAyahNumber = true;
  if (maxWords > 0) {
    const result = chunkVerse(active, maxWords, tSeconds);
    active = result.verse;
    showAyahNumber = result.isLastChunk;
  }

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
      textColor,
      glowColor,
      textOpacity,
      showAyahNumber,
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