/**
 * Preview pointer hook for interaction (plan phase 4.2 / 4.6).
 *
 * Handles mouse/touch interaction for word selection and hover. Keyboard
 * navigation lives in `usePreviewKeyboard`; hover/selection types live in
 * `previewSelection`.
 *
 * Manages hover state and selection model.
 */

import { useState, useRef, useCallback } from 'react';
import type { WordRef } from '@qvg/core';
import type { LayoutIndex } from './layoutIndex';
import { sameWordRef } from './layoutIndex';
import { framePoint, getPointerPosition, hitTestWord, isTouchEvent } from './previewPointerHelpers';
import type { HoverState, PreviewPointerOptions, SelectionState } from './previewSelection';
import { usePreviewKeyboard } from './usePreviewKeyboard';
import { usePreviewListeners } from './usePreviewListeners';
import { RANGE_HANDLE_TOUCH_TARGET, hitTestRangeHandle } from './rangeHandles';

export type { HoverState, PreviewPointerOptions, SelectionState } from './previewSelection';

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
    (x: number, y: number): WordRef | null => hitTestWord(canvas, layoutIndexRef.current, x, y),
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
        const word = hitTestWord(canvas, index, point.x, point.y);
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
        const word = hitTestWord(canvas, index, point.x, point.y);
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

  const handleKeyDown = usePreviewKeyboard({
    layoutIndexRef,
    selectionRef,
    applySelection,
    onOpenInspector: () => callbacksRef.current.onOpenInspector?.(),
  });

  usePreviewListeners(
    canvas,
    {
      move: handlePointerMove,
      down: handlePointerDown,
      up: handlePointerUp,
      leave: handlePointerLeave,
      keyDown: handleKeyDown,
    },
    () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    },
  );

  return {
    hover,
    selection,
    clearSelection: clearSelectionState,
  };
}
