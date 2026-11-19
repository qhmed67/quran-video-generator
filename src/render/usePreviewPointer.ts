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
} from './layoutIndex';

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
  onLongPress?: (position: { x: number; y: number }) => void;
  /** Enter key: open the inspector for the current selection. */
  onOpenInspector?: () => void;
}

export function usePreviewPointer(
  canvas: HTMLCanvasElement | null,
  options: PreviewPointerOptions,
) {
  const { layoutIndex, onHover, onSelect, onLongPress, onOpenInspector } = options;

  const [hover, setHover] = useState<HoverState>({ word: null, position: null });
  const [selection, setSelection] = useState<SelectionState>({
    type: 'word',
    start: null,
    end: null,
    current: null,
  });

  const isLongPressRef = useRef(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef(0);

  // Hit-test function using the layout index
  const hitTest = useCallback(
    (x: number, y: number): WordRef | null => {
      if (!layoutIndex || !canvas) return null;

      // Convert client coordinates to canvas coordinates
      const rect = canvas.getBoundingClientRect();
      if (!rect) return null;

      const canvasX = (x - rect.left) * (canvas.width / rect.width);
      const canvasY = (y - rect.top) * (canvas.height / rect.height);

      return hitTestAt(layoutIndex, { x: canvasX, y: canvasY });
    },
    [layoutIndex, canvas],
  );

  // Handle pointer move (mouse hover)
  const handlePointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      const word = hitTest(point.x, point.y);

      const newHover: HoverState = {
        word,
        position: point,
      };

      setHover(newHover);
      onHover?.(newHover);
    },
    [canvas, hitTest, onHover],
  );

  // Handle pointer down (mouse/touch start)
  const handlePointerDown = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      const word = hitTest(point.x, point.y);

      // Handle long press for touch
      if (isTouchEvent(e)) {
        isLongPressRef.current = false;

        // Clear any existing timeout
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
        }

        // Set long press timeout (500ms)
        longPressTimeoutRef.current = setTimeout(() => {
          isLongPressRef.current = true;
          onLongPress?.(point);
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

        setSelection(newSelection);
        onSelect?.(newSelection);
      }
    },
    [canvas, hitTest, onLongPress, onSelect],
  );

  // Handle pointer up (mouse/touch end)
  const handlePointerUp = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;

      const point = getPointerPosition(e, canvas);
      if (!point) return;

      // Clear long press timeout
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

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

              setSelection(newSelection);
              onSelect?.(newSelection);
            }
          }
        }

        lastTapPositionRef.current = point;
        lastTapTimeRef.current = now;
      }
    },
    [canvas, hitTest, onSelect],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setHover({ word: null, position: null });
    onHover?.({ word: null, position: null });
  }, [onHover]);

  // Mirror of `selection` for the key handler without re-binding on every change.
  const selectionRef = useRef<SelectionState>(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Apply a selection: keep state, ref and callback in sync.
  const applySelection = useCallback(
    (next: SelectionState) => {
      selectionRef.current = next;
      setSelection(next);
      onSelect?.(next);
    },
    [onSelect],
  );

  // Keyboard navigation (plan 3.5b): arrows move the selection word by word
  // / ayah by ayah; Enter opens the inspector. RTL reading order means
  // ArrowLeft advances ("next") and ArrowRight goes back.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!layoutIndex) return;
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
        const current = selectionRef.current.current;
        const start = current
          ? adjacentWord(layoutIndex, current, direction)
          : direction === 'next'
            ? firstWord(layoutIndex)
            : lastWord(layoutIndex);
        if (!start) return false;
        applySelection({ type: 'word', start, end: start, current: start });
        return true;
      };

      const moveAyah = (direction: 'next' | 'prev'): boolean => {
        const current = selectionRef.current.current;
        const start = current
          ? adjacentAyah(layoutIndex, current, direction)
          : direction === 'next'
            ? firstWord(layoutIndex)
            : lastWord(layoutIndex);
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
          onOpenInspector?.();
          handled = true;
          break;
        default:
          return;
      }
      if (handled) e.preventDefault();
    },
    [layoutIndex, onOpenInspector, applySelection],
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
    clearSelection: () => {
      setSelection({
        type: 'word',
        start: null,
        end: null,
        current: null,
      });
      onSelect?.({
        type: 'word',
        start: null,
        end: null,
        current: null,
      });
    },
  };
}

// Helper functions
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
  }

  return null;
}

function isTouchEvent(e: Event): e is TouchEvent {
  return 'touches' in e;
}
