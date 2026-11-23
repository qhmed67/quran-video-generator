/**
 * Keyboard navigation for the preview selection (plan section 3.5b).
 *
 * Extracted from the pointer hook so each file stays focused on one input
 * mode. The handler reads live refs, so the DOM listener survives re-renders.
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { LayoutIndex } from './layoutIndex';
import { adjacentAyah, adjacentWord, firstWord, lastWord } from './layoutIndex';
import type { SelectionState } from './previewSelection';

export interface PreviewKeyboardOptions {
  layoutIndexRef: RefObject<LayoutIndex | null>;
  selectionRef: RefObject<SelectionState>;
  applySelection: (next: SelectionState) => void;
  onOpenInspector: () => void;
}

export function usePreviewKeyboard(options: PreviewKeyboardOptions) {
  // The options object is fresh on every render; a ref keeps the callback
  // stable so the canvas listener is bound once.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Keyboard navigation (plan 3.5b): arrows move the selection word by word
  // / ayah by ayah; Enter opens the inspector. RTL reading order means
  // ArrowLeft advances ("next") and ArrowRight goes back.
  return useCallback((e: KeyboardEvent) => {
    const { layoutIndexRef, selectionRef, applySelection, onOpenInspector } = optionsRef.current;
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
        onOpenInspector();
        handled = true;
        break;
      default:
        return;
    }
    if (handled) e.preventDefault();
  }, []);
}
