export interface WordDef {
  index: number;
  text: string;
}

export interface WordLayout {
  index: number;
  text: string;
  x: number;
  y: number;
  width: number;
  ayahSuffix?: string;
}

export interface RowLayout {
  words: WordLayout[];
  y: number;
  width: number;
}

export interface RtlLayoutResult {
  rows: RowLayout[];
  overflow: boolean;
  neededRows: number;
}

export type HorizontalAlign = 'center' | 'right' | 'left';

const WORD_GAP_RATIO = 0.55;
const GLYPH_MARGIN_RATIO = 0.06;
const MIN_WORD_GAP = 9;
const LINE_HEIGHT_RATIO = 2.0;

function wordGapFor(fontSize: number): number {
  return Math.max(MIN_WORD_GAP, fontSize * WORD_GAP_RATIO);
}

export function rowHeightFor(fontSize: number): number {
  return Math.round(fontSize * LINE_HEIGHT_RATIO);
}

function measureWordWidth(ctx: CanvasRenderingContext2D, text: string, fontSize: number): number {
  return ctx.measureText(text).width + fontSize * GLYPH_MARGIN_RATIO;
}

export function layoutRtlRows(opts: {
  ctx: CanvasRenderingContext2D;
  words: WordDef[];
  rowWidth: number;
  rowHeight: number;
  fontSize: number;
  maxRows: number;
  marginX: number;
  startY: number;
  rowGap: number;
  align: HorizontalAlign;
  fontFamily: string;
}): RtlLayoutResult {
  const {
    ctx,
    words,
    rowWidth,
    rowHeight,
    fontSize,
    maxRows,
    marginX,
    startY,
    rowGap,
    align,
    fontFamily,
  } = opts;
  ctx.font = `400 ${fontSize}px ${fontFamily}`;
  const gap = wordGapFor(fontSize);
  const safeLeft = marginX;
  const safeRight = rowWidth - marginX;
  const avail = safeRight - safeLeft;
  const widths = words.map((w) => measureWordWidth(ctx, w.text, fontSize));

  const buckets: number[][] = [];
  let acc = 0;
  let cur: number[] = [];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const withGap = cur.length > 0 ? w + gap : w;
    if (cur.length > 0 && acc + withGap > avail) {
      buckets.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(i);
    acc += cur.length > 1 ? w + gap : w;
  }
  if (cur.length > 0) buckets.push(cur);

  const overflow = buckets.length > maxRows;
  const rowHeightTotal = rowHeight + rowGap;
  const rows: RowLayout[] = [];

  for (let r = 0; r < buckets.length; r++) {
    const idxs = buckets[r];
    const lineWidth =
      idxs.reduce((sum, i) => sum + widths[i], 0) + Math.max(0, idxs.length - 1) * gap;
    let right: number;
    if (align === 'left') {
      right = safeLeft + lineWidth;
    } else if (align === 'center') {
      right = (rowWidth + lineWidth) / 2;
    } else {
      right = safeRight;
    }
    if (right > safeRight) right = safeRight;
    const y = startY + r * rowHeightTotal + rowHeight * 0.58;
    const laid: WordLayout[] = idxs.map((i) => {
      right -= widths[i];
      if (right < safeLeft) right = safeLeft;
      const layout: WordLayout = {
        index: words[i].index,
        text: words[i].text,
        x: right + widths[i],
        y,
        width: widths[i],
      };
      right -= gap;
      return layout;
    });
    rows.push({ words: laid, y, width: lineWidth });
  }
  return { rows, overflow, neededRows: buckets.length };
}

export interface TextBlockLayout {
  fontSize: number;
  rows: RowLayout[];
  blockWidth: number;
  blockHeight: number;
  fits: boolean;
}

export function layoutTextBlock(opts: {
  ctx: CanvasRenderingContext2D;
  words: WordDef[];
  rowWidth: number;
  boxH: number;
  marginX: number;
  startY: number;
  rowGap: number;
  initialFontSize: number;
  minFontSize: number;
  align: HorizontalAlign;
  fontFamily: string;
  fixedFont?: boolean;
}): TextBlockLayout {
  const safeLeft = opts.marginX;
  const safeRight = opts.rowWidth - opts.marginX;
  const avail = safeRight - safeLeft;

  const runAt = (fontSize: number): TextBlockLayout => {
    const rowHeight = rowHeightFor(fontSize);
    const maxRows = Math.max(1, Math.floor((opts.boxH - opts.rowGap) / (rowHeight + opts.rowGap)));
    const layout = layoutRtlRows({ ...opts, fontSize, rowHeight, maxRows });
    let worstLineWidth = 0;
    for (const row of layout.rows) {
      if (row.words.length === 0) continue;
      const firstWord = row.words[0];
      const lastWord = row.words[row.words.length - 1];
      const rowLeft = lastWord.x - lastWord.width;
      const rowRight = firstWord.x;
      const effectiveWidth = rowRight - rowLeft;
      if (effectiveWidth > worstLineWidth) worstLineWidth = effectiveWidth;
    }
    const fits = !layout.overflow && worstLineWidth <= avail;
    const rowCount = layout.rows.length;
    const blockHeight = rowCount * rowHeight + Math.max(0, rowCount - 1) * opts.rowGap;
    const blockWidth = Math.min(worstLineWidth, avail);
    return { fontSize, rows: layout.rows, blockWidth, blockHeight, fits };
  };

  if (opts.fixedFont) return runAt(opts.initialFontSize);

  let fontSize = opts.initialFontSize;
  let best: TextBlockLayout | null = null;
  for (;;) {
    const res = runAt(fontSize);
    if (!best || res.fontSize > best.fontSize) best = res;
    if (res.fits) return res;
    if (fontSize <= opts.minFontSize) return best;
    const step = fontSize > opts.minFontSize * 2 ? 0.88 : 0.92;
    fontSize = Math.max(opts.minFontSize, Math.round(fontSize * step));
  }
}
