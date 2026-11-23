/**
 * DOM/coordinate helpers for preview pointer interaction.
 *
 * Kept out of the hook so its event math stays easy to read and test.
 */

import type { WordRef } from '@qvg/core';
import type { LayoutIndex } from './layoutIndex';
import { hitTest as hitTestAt } from './layoutIndex';

/**
 * Convert a client-space point into logical frame space, matching the
 * coordinate system of the layout index and the range handles.
 */
export function framePoint(
  canvas: HTMLCanvasElement,
  index: LayoutIndex,
  point: { x: number; y: number },
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return {
    x: (point.x - rect.left) * (index.width / rect.width),
    y: (point.y - rect.top) * (index.height / rect.height),
  };
}

export function getPointerPosition(
  e: MouseEvent | TouchEvent,
  _canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  if (e instanceof MouseEvent) {
    return {
      x: e.clientX,
      y: e.clientY,
    };
  } else if (e.touches && e.touches.length > 0) {
    return {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    // touchend/touchcancel carry the lift point only in `changedTouches`.
    return {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
  }

  return null;
}

export function isTouchEvent(e: Event): e is TouchEvent {
  return 'touches' in e;
}

/**
 * Hit-test a client point against the layout index, converting to frame
 * coordinates the way the overlay and the range handles do.
 */
export function hitTestWord(
  canvas: HTMLCanvasElement | null,
  index: LayoutIndex | null,
  x: number,
  y: number,
): WordRef | null {
  if (!canvas || !index) return null;
  const frame = framePoint(canvas, index, { x, y });
  return frame ? hitTestAt(index, frame) : null;
}
