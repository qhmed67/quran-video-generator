/**
 * Interaction state shared by the preview pointer hook, the overlay and the
 * keyboard navigation hook. Kept in its own module so those can depend on the
 * types without importing the whole pointer hook.
 */

import type { WordRef } from '@qvg/core';
import type { LayoutIndex } from './layoutIndex';

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
