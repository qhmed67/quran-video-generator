/**
 * Annotation model — plan phase 3.3.
 *
 * Annotations are user-added text per ayah or per word, separate from the
 * Qur'anic text (never the mushaf font). Examples: translation line,
 * tafsir note, reciter name, custom label.
 */

import type { WordRef } from './style';

/** Anchor point: where the annotation is attached in the timeline. */
export type AnnotationAnchor =
  { kind: 'ayah'; surah: number; ayah: number } | { kind: 'word'; ref: WordRef };

/** Where the annotation appears relative to its anchor. */
export type AnnotationPlacement = 'above' | 'below' | 'inline-after';

/** Style properties for annotation text (separate from WordStyle). */
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
}

export type TextStyleOverrides = Partial<TextStyle>;

/** One annotation: user-added text tied to a point in the recitation. */
export interface Annotation {
  id: string;
  anchor: AnnotationAnchor;
  placement: AnnotationPlacement;
  text: string;
  lang: 'ar' | 'en' | string;
  style: TextStyleOverrides;
}

/** Default annotation style. */
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 16,
  color: '#ffffff',
  opacity: 0.9,
  align: 'center',
};

/**
 * Resolve annotation style from overrides (same pattern as WordStyle).
 * Returns a TextStyle with defaults filled in for missing fields.
 */
export function resolveTextStyle(overrides: TextStyleOverrides): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...overrides };
}
