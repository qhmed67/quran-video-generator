/**
 * Preview pointer hook for interaction (plan phase 4.2 / 4.6).
 *
 * Handles mouse/touch interaction for word selection and hover, plus
 * keyboard navigation (plan section 3.5b): arrow keys move the selection
 * word by word / ayah by ayah, Enter opens the inspector.
 *
 * Key mapping follows RTL reading order — Arabic advances leftward, so
 * ArrowLeft is "next word" and ArrowRight is "previous word".
 *
 * Manages hover state and selection model.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WordRef } from '@qvg/core';
import type { LayoutIndex } from './layoutIndex';
import {
  adjacentAyah,
  adjacentWord,
  firstWord,
  hitTest as hitTestAt,
  lastWord,
  sameWordRef,
} from './layoutIndex';
import { RANGE_HANDLE_TOUCH_TARGET, hitTestRangeHandle } from './rangeHandles';

export interface HoverState {
  word: WordRef | null;
  position: { x: number; y: number } | null;
}

export interface SelectionState {
  type: 'word' | 'range' | 'ayah';
  start: WordRef | null;
  end: WordRef | null;
  current: WordRef | null;
}

export interface PreviewPointerOptions {
  layoutIndex: LayoutIndex | null;
  onHover?: (hover: HoverState) => void;
  onSelect?: (selection: SelectionState) => void;
  /** Drag-handle extension (plan 3.5b): move one end of the active range. */
  onExtendRange?: (ref: WordRef, edge: 'from' | 'to') => void;
  onLongPress?: (position: { x: number; y: number }) => void;
  /** Enter key: open the inspector for the current selection. */
  onOpenInspector?: () => void;
}

export function usePreviewPointer(
  canvas: HTMLCanvasElement | null,
  options: PreviewPointerOptions,
) {
  const { layoutIndex, onHover, onSelect, onLongPress, onOpenInspector, onExtendRange } = options;

  // The layout index is rebuilt whenever the visible verse or the frame size
  // changes, and the callbacks are usually fresh closures each render. Binding
  // the DOM listeners to those would either re-subscribe on every rebuild (and
  // drop the hover under the pointer) or leave a stale handler attached that
  // hit-tests against a null index. Refs keep one subscription for the life of
  // the canvas while every handler still reads the current values.
  const layoutIndexRef = useRef<LayoutIndex | null>(layoutIndex);
  layoutIndexRef.current = layoutIndex;
  const callbacksRef = useRef({ onHover, onSelect, onLongPress, onOpenInspector, onExtendRange });
  callbacksRef.current = { onHover, onSelect, onLongPress, onOpenInspector, onExtendRange };

  const [hover, setHover] = useState<HoverState>({ word: null, position: null });
  const [selection, setSelection] = useState<SelectionState>({
    type: 'word',
    start: null,
    end: null,
    current: null,
  });

  // Mirror of `selection` for event handlers and the key handler, so they do
  // not have to re-bind on every change. Assigned at render time like
  // `layoutIndexRef`; `applySelection` also writes it immediately so several
  // pointer events in one frame all see the latest range.
  const selectionRef = useRef<SelectionState>(selection);
  selectionRef.current = selection;

  // One applier keeps state, mirror and `onSelect` in sync on every path: tap,
  // double tap, handle drag and keyboard. A handle drag passes `notify: false`
  // because it reports through `onExtendRange` and must not re-anchor the
  // inspector on every pointer move.
  const applySelection = useCallback((next: SelectionState, notify = true) => {
    selectionRef.current = next;
    setSelection(next);
    if (notify) callbacksRef.current.onSelect?.(next);
  }, []);

  // While set, pointer moves extend that end of the range instead of hovering.
  const handleDragRef = useRef<'from' | 'to' | null>(null);
  // Touch long-press opens a one-word range; the same finger then drags its
  // end across words. Handles take over after the finger lifts.
  const rangeDragRef = useRef(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef(0);

  // Hit-test function using the layout index
  const hitTest = useCallback(
    (x: number, y: number): WordRef | null => {
      const index = layoutIndexRef.current;
      if (!index || !canvas) return null;

      // The layout index is built in *logical frame* coordinates
      // (1080x1920), not in the preview's backing store, so using the canvas
      // pixel size here would offset every hit by the preview scale.
      const frame = framePoint(canvas, index, { x, y });
      return frame ? hitTestAt(index, frame) : null;
    },
    [canvas],
  );

  // Handle pointer move (mouse hover)
  const handlePointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      // While a handle is held, pointer moves extend that end of the range
      // instead of hovering. Touch must not scroll the page under the stage.
      const edge = handleDragRef.current;
      const index = layoutIndexRef.current;
      if (edge && index) {
        e.preventDefault();
        const frame = framePoint(canvas, index, point);
        const word = frame ? hitTestAt(index, frame) : null;
        const current = selectionRef.current;
        const previous = edge === 'from' ? current.start : current.end;
        if (word && previous && !sameWordRef(previous, word) && current.type === 'range') {
          applySelection(
            edge === 'from' ? { ...current, start: word } : { ...current, end: word },
            false,
          );
          callbacksRef.current.onExtendRange?.(word, edge);
        }
        setHover({ word: null, position: null });
        callbacksRef.current.onHover?.({ word: null, position: null });
        return;
      }

      // A long-press range follows the finger: every word it crosses becomes
      // the new end, and the page must not scroll underneath it.
      if (rangeDragRef.current && index) {
        e.preventDefault();
        const frame = framePoint(canvas, index, point);
        const word = frame ? hitTestAt(index, frame) : null;
        const current = selectionRef.current;
        if (
          word &&
          current.type === 'range' &&
          current.start &&
          current.end &&
          !sameWordRef(current.end, word)
        ) {
          applySelection({ ...current, end: word });
        }
        setHover({ word: null, position: null });
        callbacksRef.current.onHover?.({ word: null, position: null });
        return;
      }

      const word = hitTest(point.x, point.y);

      const newHover: HoverState = {
        word,
        position: point,
      };

      setHover(newHover);
      callbacksRef.current.onHover?.(newHover);
    },
    [canvas, hitTest, applySelection],
  );

  // Handle pointer down (mouse/touch start)
  const handlePointerDown = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      // A press anywhere else ends any drag that outlived its pointerup (for
      // example a mouse released outside the stage).
      handleDragRef.current = null;
      rangeDragRef.current = false;

      // Range drag handles take precedence over word selection: pressing one
      // starts an extension drag instead of resetting the range.
      const index = layoutIndexRef.current;
      if (index) {
        const frame = framePoint(canvas, index, point);
        // Keep the target 44 CSS px wide even when the preview is scaled down
        // on a phone, while the painted dot stays small.
        const rect = canvas.getBoundingClientRect();
        const hitRadius =
          rect.width > 0 ? (RANGE_HANDLE_TOUCH_TARGET / 2) * (index.width / rect.width) : undefined;
        const edge = frame
          ? hitTestRangeHandle(index, selectionRef.current, frame, hitRadius)
          : null;
        if (edge) {
          e.preventDefault();
          handleDragRef.current = edge;
          return;
        }
      }

      const word = hitTest(point.x, point.y);

      // Handle long press for touch
      if (isTouchEvent(e)) {
        // Clear any existing timeout
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
        }

        // Long press starts a one-word range (plan §3.5b); dragging the same
        // finger or a handle then extends it. A press on empty space still
        // reports the raw position to the consumer.
        longPressTimeoutRef.current = setTimeout(() => {
          callbacksRef.current.onLongPress?.(point);
          if (!word) return;
          rangeDragRef.current = true;
          applySelection({ type: 'range', start: word, end: word, current: word });
        }, 500);
      }

      // For now, just select on click/tap
      if (word) {
        const newSelection: SelectionState = {
          type: 'word',
          start: word,
          end: word,
          current: word,
        };

        applySelection(newSelection);
      }
    },
    [canvas, hitTest, applySelection],
  );

  // Handle pointer up (mouse/touch end)
  const handlePointerUp = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      // Clear long press timeout
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      // A handle drag or a long-press range drag ends here; neither counts as
      // the first tap of a double tap. Touchend has no `touches`, but
      // `changedTouches` still carries the lift point.
      const wasDragging = handleDragRef.current !== null;
      const wasRangeDragging = rangeDragRef.current;
      handleDragRef.current = null;
      rangeDragRef.current = false;
      if (wasDragging || wasRangeDragging) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      // Handle double tap for range selection
      if (isTouchEvent(e)) {
        const now = Date.now();
        const lastTap = lastTapPositionRef.current;
        const lastTapTime = lastTapTimeRef.current;

        if (lastTap && lastTapTime && now - lastTapTime < 300) {
          // Double tap detected
          const currentWord = hitTest(point.x, point.y);
          if (currentWord && lastTap) {
            const firstTapWord = hitTest(lastTap.x, lastTap.y);

            if (firstTapWord) {
              const newSelection: SelectionState = {
                type: 'range',
                start: firstTapWord,
                end: currentWord,
                current: currentWord,
              };

              applySelection(newSelection);
            }
          }
        }

        lastTapPositionRef.current = point;
        lastTapTimeRef.current = now;
      }
    },
    [canvas, hitTest, applySelection],
  );

  // Handle pointer leave / touch cancel
  const handlePointerLeave = useCallback(() => {
    handleDragRef.current = null;
    rangeDragRef.current = false;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    setHover({ word: null, position: null });
    callbacksRef.current.onHover?.({ word: null, position: null });
  }, []);

  const clearSelectionState = useCallback(() => {
    applySelection({ type: 'word', start: null, end: null, current: null });
  }, [applySelection]);

  // Keyboard navigation (plan 3.5b): arrows move the selection word by word
  // / ayah by ayah; Enter opens the inspector. RTL reading order means
  // ArrowLeft advances ("next") and ArrowRight goes back.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!layoutIndexRef.current) return;
      // Leave modifier combinations and native text editing alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const moveWord = (direction: 'next' | 'prev'): boolean => {
        const index = layoutIndexRef.current;
        if (!index) return false;
        const current = selectionRef.current.current;
        const start = current
          ? adjacentWord(index, current, direction)
          : direction === 'next'
            ? firstWord(index)
            : lastWord(index);
        if (!start) return false;
        applySelection({ type: 'word', start, end: start, current: start });
        return true;
      };

      const moveAyah = (direction: 'next' | 'prev'): boolean => {
        const index = layoutIndexRef.current;
        if (!index) return false;
        const current = selectionRef.current.current;
        const start = current
          ? adjacentAyah(index, current, direction)
          : direction === 'next'
            ? firstWord(index)
            : lastWord(index);
        if (!start) return false;
        applySelection({ type: 'word', start, end: start, current: start });
        return true;
      };

      let handled = false;
      switch (e.key) {
        case 'ArrowLeft':
          handled = moveWord('next');
          break;
        case 'ArrowRight':
          handled = moveWord('prev');
          break;
        case 'ArrowDown':
          handled = moveAyah('next');
          break;
        case 'ArrowUp':
          handled = moveAyah('prev');
          break;
        case 'Enter':
          callbacksRef.current.onOpenInspector?.();
          handled = true;
          break;
        default:
          return;
      }
      if (handled) e.preventDefault();
    },
    [applySelection],
  );

  // Setup event listeners
  useEffect(() => {
    if (!canvas) return;

    // Make the canvas focusable so it can receive key events. The canvas is
    // a plain DOM node owned by the consumer, not React-owned state, so an
    // effect-time attribute fixup is the correct place for this.
    // eslint-disable-next-line react/immutability -- DOM node, not React state
    canvas.tabIndex = 0;

    // Mouse events
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerLeave);

    // Touch events
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp);
    canvas.addEventListener('touchcancel', handlePointerLeave);

    // Keyboard navigation
    canvas.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('mousedown', handlePointerDown);
      canvas.removeEventListener('mouseup', handlePointerUp);
      canvas.removeEventListener('mouseleave', handlePointerLeave);

      canvas.removeEventListener('touchmove', handlePointerMove);
      canvas.removeEventListener('touchstart', handlePointerDown);
      canvas.removeEventListener('touchend', handlePointerUp);
      canvas.removeEventListener('touchcancel', handlePointerLeave);

      canvas.removeEventListener('keydown', handleKeyDown);

      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, [
    canvas,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerLeave,
    handleKeyDown,
  ]);

  return {
    hover,
    selection,
    clearSelection: clearSelectionState,
  };
}

// Helper functions
/**
 * Convert a client-space point into logical frame space, matching the
 * coordinate system of the layout index and the range handles.
 */
function framePoint(
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

function getPointerPosition(
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

function isTouchEvent(e: Event): e is TouchEvent {
  return 'touches' in e;
}
