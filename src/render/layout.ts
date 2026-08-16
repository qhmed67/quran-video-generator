const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const AYAH_END_MARKER = '\u06DD';

export function toArabicIndicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function stripAyahOrnaments(text: string): string {
  return text.replace(/[\uFD3E\uFD3F\u06DD]/g, '');
}

export function ornateAyahMarker(ayahNumber: number): string {
  return `\u06DD${toArabicIndicDigits(ayahNumber)}`;
}

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

const WORD_GAP_RATIO = 0.5;

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
  const { ctx, words, rowWidth, rowHeight, fontSize, maxRows, marginX, startY, rowGap, align, fontFamily } = opts;
  ctx.font = `400 ${fontSize}px ${fontFamily}`;
  const gap = fontSize * WORD_GAP_RATIO;
  const avail = rowWidth - 2 * marginX;
  const widths = words.map((w) => ctx.measureText(stripAyahOrnaments(w.text)).width);

  const buckets: number[][] = [];
  let acc = 0;
  let cur: number[] = [];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (cur.length > 0 && acc + w > avail) {
      buckets.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(i);
    acc += w;
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
      right = marginX + lineWidth;
    } else if (align === 'center') {
      right = (rowWidth + lineWidth) / 2;
    } else {
      right = rowWidth - marginX;
    }
    const y = startY + r * rowHeightTotal + rowHeight;
    const laid: WordLayout[] = idxs.map((i) => {
      right -= widths[i];
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
  rowHeight: number;
  maxRows: number;
  marginX: number;
  startY: number;
  rowGap: number;
  initialFontSize: number;
  minFontSize: number;
  align: HorizontalAlign;
  fontFamily: string;
  fixedFont?: boolean;
}): TextBlockLayout {
  const avail = opts.rowWidth - 2 * opts.marginX;
  const runAt = (fontSize: number): TextBlockLayout => {
    const layout = layoutRtlRows({ ...opts, fontSize });
    const widest = opts.words.length
      ? Math.max(...opts.words.map((w) => opts.ctx.measureText(stripAyahOrnaments(w.text)).width))
      : 0;
    const fits = !layout.overflow && widest <= avail;
    const rowCount = layout.rows.length;
    const blockHeight = rowCount * opts.rowHeight + Math.max(0, rowCount - 1) * opts.rowGap;
    const visible = layout.rows.reduce((m, r) => Math.max(m, r.width), 0);
    const blockWidth = Math.max(visible, widest);
    return { fontSize, rows: layout.rows, blockWidth, blockHeight, fits };
  };
  if (opts.fixedFont) return runAt(opts.initialFontSize);
  let fontSize = opts.initialFontSize;
  for (;;) {
    const res = runAt(fontSize);
    if (res.fits) return res;
    if (fontSize > opts.minFontSize) {
      fontSize = Math.round(fontSize * 0.9);
      continue;
    }
    if (fontSize <= 4) return res;
    fontSize = Math.round(fontSize * 0.85);
  }
}