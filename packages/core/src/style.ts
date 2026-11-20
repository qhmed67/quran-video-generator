/**
 * Word style model + pure resolver — plan phase 3.
 *
 * A word style is the per-word paint input (colour / opacity / font scale /
 * glow / shadow / highlight / underline / entrance). Users create *style rules*
 * that target a scope — global, playback state, ayah, word range or a single
 * word — and the resolver folds them into the effective `WordStyle` for one word
 * at one moment in time.
 *
 * Resolution order, lowest to highest priority:
 *   DEFAULTS < global < state < ayah < wordRange < word
 * Within the same level, a later rule wins.
 */

/** Identity of a word; 1-based, matches Quran Foundation numbering. */
export interface WordRef {
  surah: number;
  ayah: number;
  word: number;
}

/** Stable identity key for a word reference. */
export function wordKey(ref: WordRef): string {
  return `${ref.surah}:${ref.ayah}:${ref.word}`;
}

export interface GlowSpec {
  color: string;
  radius: number;
}

export interface ShadowSpec {
  color: string;
  blur: number;
}

export interface HighlightSpec {
  fill: string;
  radius: number;
}

export interface UnderlineSpec {
  color: string;
  thickness: number;
}

export interface AnimationSpec {
  kind: 'fade' | 'rise';
  start: number;
  end: number;
}

export interface WordStyle {
  color: string;
  opacity: number;
  fontScale: number;
  glow: GlowSpec | null;
  shadow: ShadowSpec | null;
  highlight: HighlightSpec | null;
  underline: UnderlineSpec | null;
  entrance: AnimationSpec | null;
}

/** A rule's props: every field optional (partial override), required in defaults. */
export type WordStyleOverrides = Partial<WordStyle>;

export type StyleState = 'upcoming' | 'active' | 'spoken';

export type StyleTarget =
  | { kind: 'global' }
  | { kind: 'state'; state: StyleState }
  | { kind: 'ayah'; surah: number; ayah: number }
  | { kind: 'wordRange'; from: WordRef; to: WordRef }
  | { kind: 'word'; ref: WordRef };

export interface StyleRule {
  id: string;
  target: StyleTarget;
  props: WordStyleOverrides;
}

export const DEFAULT_WORD_STYLE: WordStyle = {
  color: '#ffffff',
  opacity: 1,
  fontScale: 1,
  glow: null,
  shadow: null,
  highlight: null,
  underline: null,
  entrance: null,
};

const LEVEL = {
  DEFAULTS: 0,
  GLOBAL: 1,
  STATE: 2,
  AYAH: 3,
  WORD_RANGE: 4,
  WORD: 5,
} as const;

function levelOf(target: StyleTarget): number {
  switch (target.kind) {
    case 'global':
      return LEVEL.GLOBAL;
    case 'state':
      return LEVEL.STATE;
    case 'ayah':
      return LEVEL.AYAH;
    case 'wordRange':
      return LEVEL.WORD_RANGE;
    case 'word':
      return LEVEL.WORD;
  }
}

function withinRange(ref: WordRef, from: WordRef, to: WordRef): boolean {
  const a = compareRefs(ref, from);
  const b = compareRefs(ref, to);
  return a >= 0 && b <= 0;
}

function compareRefs(a: WordRef, b: WordRef): number {
  if (a.surah !== b.surah) return a.surah - b.surah;
  if (a.ayah !== b.ayah) return a.ayah - b.ayah;
  return a.word - b.word;
}

function matches(target: StyleTarget, ref: WordRef, playbackState: StyleState): boolean {
  switch (target.kind) {
    case 'global':
      return true;
    case 'state':
      return target.state === playbackState;
    case 'ayah':
      return target.surah === ref.surah && target.ayah === ref.ayah;
    case 'wordRange':
      return withinRange(ref, target.from, target.to);
    case 'word':
      return wordKey(target.ref) === wordKey(ref);
  }
}

/**
 * Fold style rules into the effective word style for one word at one playback
 * moment. Pure: same inputs, same output; later rules win within a level.
 */
export function resolveWordStyle(
  rules: StyleRule[],
  ref: WordRef,
  playbackState: StyleState,
): WordStyle {
  let merged: WordStyle = { ...DEFAULT_WORD_STYLE };
  const ordered = [...rules].sort((a, b) => levelOf(a.target) - levelOf(b.target));
  for (const rule of ordered) {
    if (!matches(rule.target, ref, playbackState)) continue;
    merged = { ...merged, ...rule.props };
  }
  return merged;
}
