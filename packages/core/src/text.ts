/**
 * Arabic text vocabulary — pure string helpers shared by the data and
 * render layers. No DOM, no canvas: everything here operates on
 * strings alone, so it lives in @qvg/core.
 */
const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const AYAH_END_MARKER = '\u06DD';

export function toArabicIndicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function stripAyahOrnaments(text: string): string {
  return text.replace(/[\uFD3E\uFD3F\u06DD]/g, '');
}

const ORNAMENT_OR_BRACKET_RE = /[\uFD3E\uFD3F\u06D6-\u06ED]/g;
const HARKAT_RE = /[\u064B-\u0655\u0670\u0640]/g;
const ARABIC_LETTER_RE =
  /[\u0621-\u063A\u0641-\u064A\u0671\u0675\u06C0-\u06D3\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDCF\uFDF0-\uFDFF\uFE70-\uFEFF]/g;

export function stripQuranicMarks(text: string): string {
  return text.replace(/[\u06D6-\u06ED]/g, '');
}

export function displayWordText(text: string): string {
  return text.replace(ORNAMENT_OR_BRACKET_RE, '');
}

export function countArabicLetters(text: string): number {
  const cleaned = text.replace(HARKAT_RE, '').replace(/[\u06D6-\u06ED]/g, '');
  const matches = cleaned.match(ARABIC_LETTER_RE);
  return matches ? matches.length : 0;
}

export function isStandaloneToken(text: string): boolean {
  return countArabicLetters(text) <= 1;
}

export function ornateAyahMarker(ayahNumber: number): string {
  return `\u06DD${toArabicIndicDigits(ayahNumber)}`;
}
