/**
 * Range drag-handle geometry (plan section 3.5b).
 *
 * Pure functions shared by the overlay painter and the pointer hook, so the
 * dot the user sees and the dot the hook hit-tests can never drift apart.
 */

import type { LayoutIndex } from './layoutIndex';
import type { SelectionState } from './usePreviewPointer';

/** Radius of the painted range handle dot, in logical frame pixels. */
export const RANGE_HANDLE_RADIUS = 26;

/** Minimum touch target diameter in CSS pixels (matches DESIGN.md). */
export const RANGE_HANDLE_TOUCH_TARGET = 44;

/** Which end of the selection a handle moves. */
export type RangeEdge = 'from' | 'to';

export interface RangeHandlePoint {
  x: number;
  y: number;
}

export interface RangeHandles {
  from: RangeHandlePoint;
  to: RangeHandlePoint;
}

export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Look up a word's painted box in the layout index. */
export function wordBox(
  layoutIndex: LayoutIndex,
  ref: { surah: number; ayah: number; word: number },
): WordBox | null {
  for (const verse of layoutIndex.verses) {
    if (verse.surah !== ref.surah || verse.ayah !== ref.ayah) continue;
    for (const word of verse.words.words) {
      if (word.index !== ref.word) continue;
      // Words are positioned by their baseline, so the box grows upward.
      return { x: word.x, y: word.y - word.height, width: word.width, height: word.height };
    }
  }
  return null;
}

/** Negative when `a` comes first in reading order, positive when it does not. */
function readingOrder(
  a: { surah: number; ayah: number; word: number },
  b: { surah: number; ayah: number; word: number },
): number {
  if (a.surah !== b.surah) return a.surah - b.surah;
  if (a.ayah !== b.ayah) return a.ayah - b.ayah;
  return a.word - b.word;
}

/**
 * Screen positions of the two range drag handles, or null when the selection
 * is not a range.
 *
 * Each handle sits outside the outer edge of its own word: the one that
 * opens the range (earlier in reading order) on the right in RTL, the one
 * that closes it on the left. Mapping by reading order rather than by tap
 * order keeps dragging correct when the user taps the left word first.
 */
export function rangeHandlePoints(
  layoutIndex: LayoutIndex,
  selection: SelectionState,
): RangeHandles | null {
  if (selection.type !== 'range' || !selection.start || !selection.end) return null;
  const fromBox = wordBox(layoutIndex, selection.start);
  const toBox = wordBox(layoutIndex, selection.end);
  if (!fromBox || !toBox) return null;

  // A one-word range (long-press start) still shows both handles, so the user
  // can drag either one outward without tapping another word first.
  const fromOpens = readingOrder(selection.start, selection.end) <= 0;
  return {
    from: {
      x: fromOpens
        ? fromBox.x + fromBox.width + RANGE_HANDLE_RADIUS
        : fromBox.x - RANGE_HANDLE_RADIUS,
      y: fromBox.y + fromBox.height / 2,
    },
    to: {
      x: fromOpens ? toBox.x - RANGE_HANDLE_RADIUS : toBox.x + toBox.width + RANGE_HANDLE_RADIUS,
      y: toBox.y + toBox.height / 2,
    },
  };
}

/**
 * Which handle a frame-space point hits, if any.
 *
 * `radius` is the hit radius in the same frame space. Callers on a scaled
 * preview pass a larger radius so the target stays 44 CSS px even when the
 * painted dot shrinks with the display.
 */
export function hitTestRangeHandle(
  layoutIndex: LayoutIndex,
  selection: SelectionState,
  point: { x: number; y: number },
  radius: number = RANGE_HANDLE_RADIUS,
): RangeEdge | null {
  const handles = rangeHandlePoints(layoutIndex, selection);
  if (!handles) return null;
  const r2 = radius * radius;
  for (const edge of ['from', 'to'] as const) {
    const dx = point.x - handles[edge].x;
    const dy = point.y - handles[edge].y;
    if (dx * dx + dy * dy <= r2) return edge;
  }
  return null;
}
