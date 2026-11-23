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
export { createProject, updateProject, DEFAULT_PROJECT, CURRENT_PROJECT_VERSION } from './project';
export type { BackgroundSpec, Project } from './project';
export { CURRENT_SCHEMA_VERSION, migrateProject } from './migrations';
export type { MigrationResult } from './migrations';
export { parseProject, projectSchema } from './validate';
export type { ParseResult, ValidationIssue } from './validate';
export {
  DEFAULT_HISTORY_LIMIT,
  COALESCE_WINDOW_MS,
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  redoLabel,
  resetHistory,
  undo,
  undoLabel,
} from './history';
export type { CommitMeta, History, HistoryEntry } from './history';
