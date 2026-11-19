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
