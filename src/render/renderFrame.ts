import { compareToWindow } from '@qvg/core';
import type {
  CaptionTimeline,
  VerseTimelineEntry,
  WordSegmentSeconds,
} from '../lib/types/timeline';
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
import type { HorizontalAlign, RowLayout, WordDef, WordLayout } from './layout';

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
  /**
   * Logical frame size, in the pixels the exported video is authored in. The
   * canvas backing store may be smaller (a preview is displayed at a fraction
   * of 1080x1920), in which case the frame is drawn through a scale transform
   * and every coordinate below stays in logical units. Omitted, the canvas
   * size is the logical size (the export path).
   */
  frameWidth?: number;
  frameHeight?: number;
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

export function defaultBackground(
  ctx: CanvasRenderingContext2D,
  _tSeconds: number,
  width = ctx.canvas.width,
  height = ctx.canvas.height,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0b2e26');
  grad.addColorStop(0.55, '#14532d');
  grad.addColorStop(1, '#0a0f1e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function verseOpacity(
  verse: VerseTimelineEntry,
  t: number,
  fadeIn: number,
  fadeOut: number,
): number {
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

/* ── Render caches ──
 *
 * The preview renders the same verse over and over: 60 times a second while the
 * recitation plays, and again on every repaint when idle. Both the text layout
 * (a font-size search that measures every word at every candidate size) and the
 * rasterised glyph tiers (expensive: large glyphs drawn with a shadow blur) are
 * pure functions of the verse, the caption box and the styling. Cache them so a
 * frame costs a background fill plus two `drawImage` calls instead of a full
 * text layout and glyph rasterisation.
 *
 * Everything is keyed by identity — the verse object for the verse, a string
 * for the styling — so a rebuilt timeline or an edited caption can never draw a
 * stale frame.
 */

interface ScratchCanvas {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D;
}

interface VerseCache {
  /** Stable id, so raster cache keys stay unique across timelines. */
  id: number;
  layouts: Map<string, UthmaniLayout>;
}

let nextVerseCacheId = 1;
const verseCaches = new WeakMap<VerseTimelineEntry, VerseCache>();

function verseCacheOf(verse: VerseTimelineEntry): VerseCache {
  let cache = verseCaches.get(verse);
  if (!cache) {
    cache = { id: nextVerseCacheId++, layouts: new Map() };
    verseCaches.set(verse, cache);
  }
  return cache;
}

const MAX_LAYOUTS_PER_VERSE = 12;

function layoutCacheKey(
  opts: {
    boxW: number;
    boxH: number;
    align: HorizontalAlign;
    atMinFont?: boolean;
    showAyahNumber?: boolean;
  },
  fonts: FontSet,
): string {
  return [
    fonts.uthmani,
    fonts.uthmaniLoaded ? 'loaded' : 'fallback',
    opts.boxW,
    opts.boxH,
    opts.align,
    opts.atMinFont ? 'min' : 'fit',
    opts.showAyahNumber === false ? 'no-number' : 'number',
  ].join('|');
}

function buildUthmaniLayout(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: {
    fonts: FontSet;
    boxW: number;
    boxH: number;
    align: HorizontalAlign;
    atMinFont?: boolean;
    showAyahNumber?: boolean;
  },
): UthmaniLayout {
  const cache = verseCacheOf(verse);
  const key = layoutCacheKey(opts, opts.fonts);
  const cached = cache.layouts.get(key);
  if (cached) return cached;

  const layout = computeUthmaniLayout(ctx, verse, opts);
  if (cache.layouts.size >= MAX_LAYOUTS_PER_VERSE) {
    const oldest = cache.layouts.keys().next();
    if (!oldest.done) cache.layouts.delete(oldest.value);
  }
  cache.layouts.set(key, layout);
  return layout;
}

function computeUthmaniLayout(
  ctx: CanvasRenderingContext2D,
  verse: VerseTimelineEntry,
  opts: {
    fonts: FontSet;
    boxW: number;
    boxH: number;
    align: HorizontalAlign;
    atMinFont?: boolean;
    showAyahNumber?: boolean;
  },
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
  return {
    width: layout.width,
    height: layout.height,
    fits: layout.fits,
    fontSize: layout.fontSize,
  };
}

/**
 * Creates a scratch canvas we can render fully-opaque glyphs onto before
 * compositing the flattened result with the fade opacity. Works both on the
 * main thread (HTMLCanvasElement) and on an OffscreenCanvas in a worker.
 */
function createBufferCanvas(width: number, height: number): ScratchCanvas {
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

/* Scratch buffers, reused between frames and between verses. A 1080-wide
 * buffer is several megabytes, so allocating one per frame (as the old code
 * did, once or twice per frame) meant the GC had to reclaim hundreds of
 * megabytes a second while playing — visible as stutter. */
const scratchBuffers = new Map<string, ScratchCanvas[]>();
const MAX_SCRATCH_SIZES = 3;

function scratchBuffer(pixelWidth: number, pixelHeight: number, slot: number): ScratchCanvas {
  const key = `${pixelWidth}x${pixelHeight}`;
  let buffers = scratchBuffers.get(key);
  if (!buffers) {
    if (scratchBuffers.size >= MAX_SCRATCH_SIZES) {
      const oldest = scratchBuffers.keys().next();
      if (!oldest.done) scratchBuffers.delete(oldest.value);
    }
    buffers = [];
    scratchBuffers.set(key, buffers);
  }
  let buffer = buffers[slot];
  if (!buffer) {
    buffer = createBufferCanvas(pixelWidth, pixelHeight);
    buffers[slot] = buffer;
  }
  return buffer;
}

/** Resets a pooled buffer so it can be painted into from a clean slate, with
 *  logical coordinates (originX, originY) landing at the buffer's top-left. */
function resetScratchAt(
  buffer: ScratchCanvas,
  deviceScale: number,
  originX: number,
  originY: number,
): CanvasRenderingContext2D {
  const { ctx } = buffer;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.translate(-originX, -originY);
  return ctx;
}

/* Rasterised glyph tiers, keyed by verse + layout + styling. Only a handful can
 * be live at once (one tier per verse is usually enough), so the cache is a
 * small LRU. */
interface TierCacheEntry {
  buffer: ScratchCanvas;
  /** False until the raster has been painted; empty tiers are not composited. */
  painted: boolean;
}

const tierRasters = new Map<string, TierCacheEntry>();
const MAX_TIER_RASTERS = 4;

function tierRaster(key: string, pixelWidth: number, pixelHeight: number): TierCacheEntry {
  const existing = tierRasters.get(key);
  if (
    existing &&
    existing.buffer.canvas.width === pixelWidth &&
    existing.buffer.canvas.height === pixelHeight
  ) {
    // Refresh recency: Map keeps insertion order.
    tierRasters.delete(key);
    tierRasters.set(key, existing);
    return existing;
  }
  const created: TierCacheEntry = {
    buffer: createBufferCanvas(pixelWidth, pixelHeight),
    painted: false,
  };
  tierRasters.delete(key);
  tierRasters.set(key, created);
  while (tierRasters.size > MAX_TIER_RASTERS) {
    const oldest = tierRasters.keys().next();
    if (oldest.done || oldest.value === key) break;
    tierRasters.delete(oldest.value);
  }
  return created;
}

/** Drops cached glyph rasters; used when a font finishes loading and the old
 * rasterised glyph outlines are no longer what the frame should show. */
export function clearRenderCaches(): void {
  tierRasters.clear();
  scratchBuffers.clear();
}

interface WordPaintStyle {
  fontSize: number;
  fontFamily: string;
  textColor: HslColor;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  baseShadowBlur: number;
  lastWordIdx: number;
}

/**
 * Paints one word, including the gold ayah number the last word carries.
 * `bctx` is already positioned so that `x, y` are the word's own coordinates.
 */
function paintWord(
  bctx: CanvasRenderingContext2D,
  word: { index: number; text: string; x: number; y: number },
  style: WordPaintStyle,
): void {
  if (word.index !== style.lastWordIdx) {
    bctx.fillText(word.text, word.x, word.y);
    return;
  }
  const spaceIdx = word.text.lastIndexOf(' ');
  if (spaceIdx === -1) {
    bctx.fillText(word.text, word.x, word.y);
    return;
  }
  const wordPart = word.text.substring(0, spaceIdx);
  const numPart = word.text.substring(spaceIdx + 1);
  bctx.fillText(wordPart, word.x, word.y);
  const wordWidth = bctx.measureText(wordPart).width;
  const spaceWidth = bctx.measureText(' ').width;
  const prevFill = bctx.fillStyle;
  const prevShadow = bctx.shadowColor;
  const prevBlur = bctx.shadowBlur;
  bctx.fillStyle = AYAH_NUM_COLOR;
  bctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  bctx.shadowBlur = style.baseShadowBlur;
  bctx.fillText(numPart, word.x - wordWidth - spaceWidth, word.y);
  bctx.fillStyle = prevFill;
  bctx.shadowColor = prevShadow;
  bctx.shadowBlur = prevBlur;
}

function findWordLayout(rows: RowLayout[], index: number): WordLayout | null {
  for (const row of rows) {
    for (const word of row.words) {
      if (word.index === index) return word;
    }
  }
  return null;
}

/** Paints the words a tier wants: all of them, or only / except one index. */
function paintTier(
  bctx: CanvasRenderingContext2D,
  rows: RowLayout[],
  blockTopRel: number,
  style: WordPaintStyle,
  filter: { only?: number; skip?: number },
): boolean {
  bctx.font = `400 ${style.fontSize}px ${style.fontFamily}`;
  bctx.textAlign = 'right';
  bctx.textBaseline = 'alphabetic';
  bctx.direction = 'rtl';
  bctx.fillStyle = hslToCSS(style.textColor);
  bctx.shadowColor = style.shadowColor;
  bctx.shadowBlur = style.shadowBlur;
  bctx.shadowOffsetY = style.shadowOffsetY;
  let painted = false;
  for (const row of rows) {
    for (const word of row.words) {
      if (filter.only !== undefined && word.index !== filter.only) continue;
      if (word.index === filter.skip) continue;
      painted = true;
      paintWord(
        bctx,
        { index: word.index, text: word.text, x: word.x, y: blockTopRel + row.y },
        style,
      );
    }
  }
  return painted;
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
    /** Canvas backing pixels per logical frame pixel. */
    deviceScale: number;
  },
): UthmaniBlock {
  const {
    height,
    fonts,
    bounds,
    align,
    scrimEnabled,
    wordHighlightEnabled,
    textColor,
    glowColor,
    textOpacity,
    showAyahNumber,
    deviceScale,
  } = opts;
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
  const shadowOffsetY = Math.round(height * 0.002);

  ctx.save();
  ctx.translate(boxX, boxY);
  ctx.beginPath();
  ctx.rect(0, -VERTICAL_SAFETY_PAD, boxW, boxH + 2 * VERTICAL_SAFETY_PAD);
  ctx.clip();
  if (scrimEnabled && rowCount > 0) {
    drawScrim(
      ctx,
      {
        top: blockTopRel - VERTICAL_SAFETY_PAD,
        bottom: blockTopRel + blockHeight + VERTICAL_SAFETY_PAD,
      },
      boxW,
      boxH,
    );
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
  //
  // The tiers that only depend on the verse and the styling (all words, and
  // the idle words of a highlighted verse) are cached as rasters, so a frame
  // during playback is a couple of drawImage calls rather than a full glyph
  // rasterisation with shadow blur.
  const pad = Math.ceil(baseShadowBlur + maxGlowBlur) + 4;
  const bufW = Math.ceil(boxW + pad * 2);
  const bufH = Math.ceil(boxH + VERTICAL_SAFETY_PAD * 2 + pad * 2);
  const bufX = -pad;
  const bufY = -pad - VERTICAL_SAFETY_PAD;
  const pixW = Math.max(1, Math.ceil(bufW * deviceScale));
  const pixH = Math.max(1, Math.ceil(bufH * deviceScale));

  const lastWordIdx =
    rows.length > 0 && rows[rows.length - 1].words.length > 0
      ? rows[rows.length - 1].words[rows[rows.length - 1].words.length - 1].index
      : -1;

  // Shadows are not affected by the canvas transform, so blur radius and
  // offset are expressed in device pixels; that keeps the caption looking the
  // same whether the frame is rasterised at 1080 wide or at preview scale.
  const style: WordPaintStyle = {
    fontSize,
    fontFamily: fonts.uthmani,
    textColor,
    shadowColor: 'rgba(0, 0, 0, 0.75)',
    shadowBlur: baseShadowBlur * deviceScale,
    shadowOffsetY: shadowOffsetY * deviceScale,
    baseShadowBlur: baseShadowBlur * deviceScale,
    lastWordIdx,
  };

  const scaleKey = `${pixW}x${pixH}`;
  const layoutKey = layoutCacheKey({ boxW, boxH, align, showAyahNumber }, fonts);
  const colorKey = `${textColor.h},${textColor.s},${textColor.l}`;
  // The glyph shadow is sized from the frame height and expressed in device
  // pixels, so it belongs in the key alongside the raster's pixel size.
  const shadowKey = `${style.shadowBlur}x${style.shadowOffsetY}`;
  const cachePrefix = `${verseCacheOf(verse).id}|${layoutKey}|${colorKey}|${scaleKey}|${shadowKey}`;
  const useWordTiers = Boolean(verse.words && wordHighlightEnabled);

  let idleUsed = false;
  let plainUsed = false;

  // tierAlpha values: the idle tier fades in step with the text opacity.
  const idleAlpha = IDLE_OPACITY * textOpacity;

  let idleTier: TierCacheEntry | null = null;
  let plainTier: TierCacheEntry | null = null;

  if (useWordTiers) {
    const activeIndex = highlight ? highlight.word.index : -1;
    idleTier = tierRaster(`${cachePrefix}|idle|${activeIndex}`, pixW, pixH);
    if (!idleTier.painted) {
      const bctx = resetScratchAt(idleTier.buffer, deviceScale, bufX, bufY);
      idleTier.painted = paintTier(bctx, rows, blockTopRel, style, { skip: activeIndex });
    }
    idleUsed = idleTier.painted;
  } else {
    plainTier = tierRaster(`${cachePrefix}|plain`, pixW, pixH);
    if (!plainTier.painted) {
      const bctx = resetScratchAt(plainTier.buffer, deviceScale, bufX, bufY);
      plainTier.painted = paintTier(bctx, rows, blockTopRel, style, {});
    }
    plainUsed = plainTier.painted;
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
  const drawTier = (buffer: ScratchCanvas | null, used: boolean, alpha: number) => {
    if (!buffer || !used) return;
    ctx.globalAlpha = alpha * opts.opacity;
    // Explicit logical size: the raster is stored at backing resolution, and
    // the main context is scaled from logical to backing pixels.
    ctx.drawImage(
      buffer.canvas as CanvasImageSource,
      0,
      0,
      buffer.canvas.width,
      buffer.canvas.height,
      bufX,
      bufY,
      bufW,
      bufH,
    );
  };
  drawTier(idleTier?.buffer ?? null, idleUsed, idleAlpha);

  // The highlighted word sits in its own tier, painted after the idle words so
  // its glow is never covered by a neighbour's shadow. It is the only tier that
  // changes frame to frame, so it is rasterised into a buffer just big enough
  // for that one word instead of the whole caption box.
  if (highlight) {
    const activeLayout = findWordLayout(rows, highlight.word.index);
    if (activeLayout) {
      // Marks can ink past the measured advance, so the word tier gets a little
      // extra horizontal room on top of the glow padding.
      const wordPad = pad + Math.round(fontSize * 0.3);
      const originX = activeLayout.x - activeLayout.width - wordPad;
      const originY = blockTopRel + activeLayout.y - fontSize * 2.2 - pad;
      const activeW = activeLayout.width + wordPad * 2;
      const activeH = fontSize * 3.2 + pad * 2;
      const activePixW = Math.max(1, Math.ceil(activeW * deviceScale));
      const activePixH = Math.max(1, Math.ceil(activeH * deviceScale));
      const buffer = scratchBuffer(activePixW, activePixH, 1);
      const bctx = resetScratchAt(buffer, deviceScale, originX, originY);
      const glowBlur = baseShadowBlur + (maxGlowBlur - baseShadowBlur) * highlight.intensity;
      const painted = paintTier(
        bctx,
        rows,
        blockTopRel,
        {
          ...style,
          shadowColor: hslToCSS(glowColor, 0.95),
          shadowBlur: glowBlur * deviceScale,
          baseShadowBlur: baseShadowBlur * deviceScale,
        },
        { only: highlight.word.index },
      );
      if (painted) {
        ctx.globalAlpha = highlight.textOpacity * textOpacity * opts.opacity;
        ctx.drawImage(
          buffer.canvas as CanvasImageSource,
          0,
          0,
          buffer.canvas.width,
          buffer.canvas.height,
          originX,
          originY,
          activeW,
          activeH,
        );
      }
    }
  }

  drawTier(plainTier?.buffer ?? null, plainUsed, textOpacity);
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
    /** Canvas backing pixels per logical frame pixel (shadows ignore transforms). */
    deviceScale: number;
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
  ctx.shadowBlur = Math.round(height * 0.005) * opts.deviceScale;
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
  frame?: { width: number; height: number },
): void {
  const W = frame?.width ?? ctx.canvas.width;
  const H = frame?.height ?? ctx.canvas.height;
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

interface VerseChunk {
  verse: VerseTimelineEntry;
  isLastChunk: boolean;
  /** Index of the first word of the chunk in the parent verse. */
  firstWord: number;
}

/* Chunking rebuilds verse objects, and a fresh object every frame would defeat
 * every cache downstream (layout, rasters). Cache the slices per verse. */
const verseChunks = new WeakMap<VerseTimelineEntry, { maxWords: number; chunks: VerseChunk[] }>();

function chunkVerse(verse: VerseTimelineEntry, maxWords: number, tSeconds: number): VerseChunk {
  if (!verse.words || maxWords <= 0) return { verse, isLastChunk: true, firstWord: 0 };
  const words = verse.words;
  const totalWords = words.length;
  if (totalWords <= maxWords) return { verse, isLastChunk: true, firstWord: 0 };

  let cached = verseChunks.get(verse);
  if (!cached || cached.maxWords !== maxWords) {
    const chunks: VerseChunk[] = [];
    for (let s = 0; s < totalWords; s += maxWords) {
      const end = Math.min(s + maxWords, totalWords);
      chunks.push({
        verse: sliceChunk(verse, words, { start: s, end }),
        isLastChunk: end >= totalWords,
        firstWord: s,
      });
    }
    cached = { maxWords, chunks };
    verseChunks.set(verse, cached);
  }

  // Show the chunk whose words are being recited; during the gap between two
  // words keep the chunk that just played, and before the first word show the
  // first chunk. Falling back to the last chunk would make the caption leap to
  // the end of the ayah on every pause between words.
  //
  // A verse can also span a stretch with no word timings at all (a lead-in
  // before its first word, or a recitation pause after its last one). Then the
  // verse window goes on after the final word, and holding the last chunk is
  // what the recitation just passed — not leaping back to the first words.
  const chunks = cached.chunks;
  if (tSeconds >= words[words.length - 1].startSeconds) return chunks[chunks.length - 1];
  let chosen = chunks[0];
  for (const chunk of chunks) {
    if (words[chunk.firstWord].startSeconds > tSeconds) break;
    chosen = chunk;
  }
  return chosen;
}

function sliceChunk(
  verse: VerseTimelineEntry,
  words: WordSegmentSeconds[],
  chunk: { start: number; end: number },
): VerseTimelineEntry {
  const chunkWords = words.slice(chunk.start, chunk.end);
  return {
    ...verse,
    words: chunkWords.map((w, i) => ({ ...w, index: i })),
    startSeconds: chunkWords[0].startSeconds,
    endSeconds: chunkWords[chunkWords.length - 1].endSeconds,
  };
}

export function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void {
  const { timeline, tSeconds, captionsOn } = opts;
  const width = opts.frameWidth ?? ctx.canvas.width;
  const height = opts.frameHeight ?? ctx.canvas.height;
  const deviceScale = width > 0 ? ctx.canvas.width / width : 1;
  const align = opts.textAlignX ?? 'center';
  const bounds = opts.bounds ?? defaultBounds(width, height);
  const textColor = opts.textColor ?? DEFAULT_TEXT_COLOR;
  const glowColor = opts.glowColor ?? DEFAULT_GLOW_COLOR;
  const textOpacity = opts.textOpacity ?? DEFAULT_TEXT_OPACITY;

  // Everything below is authored in logical frame units. When the backing store
  // is smaller (the on-screen preview) the whole frame is rasterised through
  // this transform, so layout, bounds and pointer maths stay untouched.
  ctx.save();
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.globalAlpha = 1;

  if (opts.drawBackground) {
    opts.drawBackground(ctx, tSeconds);
  } else {
    defaultBackground(ctx, tSeconds, width, height);
  }

  if (!captionsOn.uthmani && !captionsOn.translation) {
    ctx.restore();
    return;
  }

  let active: VerseTimelineEntry | null = null;
  for (const v of timeline.verses) {
    if (compareToWindow(tSeconds, v.startSeconds, v.endSeconds) === 0) {
      active = v;
      break;
    }
  }
  if (!active) {
    ctx.restore();
    return;
  }

  // Fade against the whole ayah, never against the word chunk: between two
  // chunks there is no active chunk, and a chunk-scoped fade made the caption
  // blink out mid-ayah.
  const verseWindow = active;
  const maxWords = opts.maxWordsPerScreen ?? 0;
  let showAyahNumber = true;
  if (maxWords > 0) {
    const result = chunkVerse(active, maxWords, tSeconds);
    active = result.verse;
    showAyahNumber = result.isLastChunk;
  }

  const opacity = verseOpacity(
    verseWindow,
    tSeconds,
    timeline.fade.inSeconds,
    timeline.fade.outSeconds,
  );
  if (opacity <= 0) {
    ctx.restore();
    return;
  }

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
      deviceScale,
    });
  }
  if (captionsOn.translation) {
    drawTranslation(ctx, active, {
      fonts: opts.fonts,
      width,
      height,
      opacity,
      block: block ?? { top: height - height * 0.25, bottom: height - height * 0.12 },
      deviceScale,
    });
  }

  ctx.restore();
}
