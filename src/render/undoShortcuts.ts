/**
 * Undo/redo keyboard shortcuts (plan phase 4.6).
 *
 * The matcher is a pure function so it can be unit-tested without a DOM;
 * the hook wires it to `window` keydown events.
 *
 * Bindings (plan: "undo/redo UI (buttons + shortcuts)"):
 *   Ctrl/Cmd+Z          → undo
 *   Ctrl/Cmd+Shift+Z    → redo
 *   Ctrl/Cmd+Y          → redo
 *
 * When focus is inside a text field the browser's native undo wins —
 * the matcher is never consulted for those targets.
 */

import { useEffect } from 'react';

/** What a key event maps to. */
export type ShortcutAction = 'undo' | 'redo';

export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** True when focus is inside a native text-editing element. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (typeof el.isContentEditable === 'boolean' && el.isContentEditable)
  );
}

/**
 * Map a key event to an undo/redo action, or null when it is not ours.
 * Modifier-only and Alt combinations are ignored (AltGr emits ctrl+alt).
 */
export function matchUndoRedoShortcut(e: ShortcutKey): ShortcutAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return null;

  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) return 'undo';
  if (key === 'z' && e.shiftKey) return 'redo';
  if (key === 'y') return 'redo';
  return null;
}

export interface UndoShortcutsOptions {
  undo: () => void;
  redo: () => void;
  /** Disable without unmounting (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
}

/**
 * Attach global undo/redo shortcuts. Skips events that originate in text
 * fields so native undo/redo keeps working there.
 */
export function useUndoShortcuts({ undo, redo, enabled = true }: UndoShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;
      const action = matchUndoRedoShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'undo') undo();
      else redo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, enabled]);
}
