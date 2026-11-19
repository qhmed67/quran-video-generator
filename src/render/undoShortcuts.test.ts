import { describe, expect, it } from 'vitest';
import { isTextEntryTarget, matchUndoRedoShortcut, type ShortcutKey } from './undoShortcuts';

const key = (overrides: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key: 'z',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe('matchUndoRedoShortcut', () => {
  it('maps Ctrl+Z to undo', () => {
    expect(matchUndoRedoShortcut(key({ ctrlKey: true }))).toBe('undo');
  });

  it('maps Cmd+Z to undo (macOS)', () => {
    expect(matchUndoRedoShortcut(key({ metaKey: true }))).toBe('undo');
  });

  it('maps Ctrl+Shift+Z and Cmd+Shift+Z to redo', () => {
    expect(matchUndoRedoShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(matchUndoRedoShortcut(key({ metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('maps Ctrl+Y to redo', () => {
    expect(matchUndoRedoShortcut(key({ ctrlKey: true, key: 'y' }))).toBe('redo');
  });

  it('ignores plain keys, other letters and Alt combinations', () => {
    expect(matchUndoRedoShortcut(key())).toBeNull();
    expect(matchUndoRedoShortcut(key({ ctrlKey: true, key: 'a' }))).toBeNull();
    // AltGr-style events (ctrl+alt) must not trigger undo.
    expect(matchUndoRedoShortcut(key({ ctrlKey: true, altKey: true }))).toBeNull();
    expect(matchUndoRedoShortcut(key({ altKey: true, key: 'z' }))).toBeNull();
  });

  it('is case-insensitive on the key', () => {
    expect(matchUndoRedoShortcut(key({ ctrlKey: true, key: 'Z' }))).toBe('undo');
  });
});

describe('isTextEntryTarget', () => {
  const el = (tagName: string, isContentEditable = false) =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it('detects inputs, textareas, selects and contenteditable', () => {
    expect(isTextEntryTarget(el('INPUT'))).toBe(true);
    expect(isTextEntryTarget(el('TEXTAREA'))).toBe(true);
    expect(isTextEntryTarget(el('SELECT'))).toBe(true);
    expect(isTextEntryTarget(el('DIV', true))).toBe(true);
  });

  it('returns false for ordinary elements and null', () => {
    expect(isTextEntryTarget(el('BUTTON'))).toBe(false);
    expect(isTextEntryTarget(el('CANVAS'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
