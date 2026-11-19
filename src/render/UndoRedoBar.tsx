/**
 * Undo/redo toolbar (plan phase 4.6).
 *
 * Buttons for undo/redo built on the design system's `.btn` classes, with
 * shortcut hints in the tooltips. Pair with `useUndoShortcuts` to also bind
 * Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z globally.
 *
 * Touch targets stay 44px+ on mobile per DESIGN.md accessibility rules
 * (see `.undo-redo-bar` in index.css).
 */

import { useUndoShortcuts } from './undoShortcuts';

export interface UndoRedoBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Label of the edit undo would revert — shown in the tooltip. */
  undoDescription?: string | null;
  /** Label of the edit redo would re-apply — shown in the tooltip. */
  redoDescription?: string | null;
  /** Also bind the global Ctrl/Cmd+Z shortcuts. Default true. */
  bindShortcuts?: boolean;
  className?: string;
}

/** Platform-correct modifier symbol for tooltips. */
export function modifierKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}

export function UndoRedoBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  undoDescription,
  redoDescription,
  bindShortcuts = true,
  className = '',
}: UndoRedoBarProps) {
  useUndoShortcuts({ undo: onUndo, redo: onRedo, enabled: bindShortcuts });

  const mod = modifierKeyLabel();
  const undoTitle = undoDescription ? `Undo: ${undoDescription} (${mod}+Z)` : `Undo (${mod}+Z)`;
  const redoTitle = redoDescription
    ? `Redo: ${redoDescription} (${mod}+Shift+Z)`
    : `Redo (${mod}+Shift+Z)`;

  return (
    <div className={`undo-redo-bar ${className}`} role="group" aria-label="Undo and redo">
      <button
        type="button"
        className="btn btn--quiet"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title={undoTitle}
      >
        <span aria-hidden="true">↶</span>
        Undo
      </button>
      <button
        type="button"
        className="btn btn--quiet"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title={redoTitle}
      >
        <span aria-hidden="true">↷</span>
        Redo
      </button>
    </div>
  );
}
