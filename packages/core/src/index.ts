/**
 * Public API of @qvg/core.
 *
 * Named exports only; the package is pure TypeScript (no DOM, no fetch, no
 * platform globals) and may be imported from every other package.
 */

export type { Canvas2DContext, CanvasLike } from './canvas';
export type { FontSet } from './fonts';
export {
  clampSeconds,
  compareToWindow,
  msToSeconds,
  secondsToMs,
  type WindowCompare,
} from './time';
export type {
  CaptionTimeline,
  TimingGranularity,
  VerseTimelineEntry,
  WordSegmentSeconds,
} from './timeline';
export {
  AYAH_END_MARKER,
  countArabicLetters,
  displayWordText,
  isStandaloneToken,
  ornateAyahMarker,
  stripAyahOrnaments,
  stripQuranicMarks,
  toArabicIndicDigits,
} from './text';
export { DEFAULT_WORD_STYLE, resolveWordStyle, wordKey } from './style';
export type {
  AnimationSpec,
  GlowSpec,
  HighlightSpec,
  ShadowSpec,
  StyleRule,
  StyleState,
  StyleTarget,
  UnderlineSpec,
  WordRef,
  WordStyle,
  WordStyleOverrides,
} from './style';
export { DEFAULT_TEXT_STYLE, resolveTextStyle } from './annotation';
export type {
  Annotation,
  AnnotationAnchor,
  AnnotationPlacement,
  TextStyle,
  TextStyleOverrides,
} from './annotation';
