import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  redoLabel,
  resetHistory,
  undo,
  undoLabel,
} from './history';

interface Doc {
  text: string;
}

const doc = (text: string): Doc => ({ text });

describe('history', () => {
  it('starts empty: nothing to undo or redo', () => {
    const h = createHistory(doc('a'));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual(doc('a'));
    expect(undoLabel(h)).toBeNull();
    expect(redoLabel(h)).toBeNull();
  });

  it('commit moves the previous state onto the past stack', () => {
    const h0 = createHistory(doc('a'));
    const h1 = commit(h0, doc('b'), { label: 'edit b' });

    expect(h1.present).toEqual(doc('b'));
    expect(h1.past).toHaveLength(1);
    expect(h1.past[0].state).toEqual(doc('a'));
    expect(h1.past[0].label).toBe('edit b');
    expect(canUndo(h1)).toBe(true);
    expect(canRedo(h1)).toBe(false);
  });

  it('undo restores the previous state and enables redo', () => {
    const h = commit(createHistory(doc('a')), doc('b'), { label: 'to b' });
    const undone = undo(h);

    expect(undone.present).toEqual(doc('a'));
    expect(undone.past).toHaveLength(0);
    expect(undone.future).toHaveLength(1);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);
    expect(redoLabel(undone)).toBe('to b');
  });

  it('redo re-applies the undone edit', () => {
    const h = commit(createHistory(doc('a')), doc('b'), { label: 'to b' });
    const redone = redo(undo(h));

    expect(redone.present).toEqual(doc('b'));
    expect(redone.past).toHaveLength(1);
    expect(redone.future).toHaveLength(0);
    expect(canRedo(redone)).toBe(false);
  });

  it('undo/redo round-trips a multi-step sequence', () => {
    let h = createHistory(doc('0'));
    h = commit(h, doc('1'), { label: 'l1' });
    h = commit(h, doc('2'), { label: 'l2' });
    h = commit(h, doc('3'), { label: 'l3' });

    h = undo(undo(h));
    expect(h.present).toEqual(doc('1'));
    expect(undoLabel(h)).toBe('l1');
    expect(redoLabel(h)).toBe('l2');

    h = redo(h);
    expect(h.present).toEqual(doc('2'));
    h = redo(h);
    expect(h.present).toEqual(doc('3'));
    h = redo(h); // no-op at the end
    expect(h.present).toEqual(doc('3'));
  });

  it('undo at the bottom and redo at the top are no-ops', () => {
    const h = createHistory(doc('a'));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('a new commit clears the redo stack', () => {
    let h = commit(createHistory(doc('a')), doc('b'), { label: 'to b' });
    h = undo(h);
    const branched = commit(h, doc('c'), { label: 'to c' });

    expect(branched.present).toEqual(doc('c'));
    expect(branched.future).toHaveLength(0);
    expect(canRedo(branched)).toBe(false);
    expect(branched.past).toHaveLength(1);
    expect(branched.past[0].state).toEqual(doc('a'));
  });

  it('caps the past stack at limit, dropping the oldest step', () => {
    let h = createHistory(doc('0'), 3);
    for (let i = 1; i <= 5; i++) {
      h = commit(h, doc(String(i)), { label: `l${i}` });
    }
    expect(h.past).toHaveLength(3);
    expect(h.past[0].state).toEqual(doc('2')); // '0' and '1' dropped
    expect(h.past[2].state).toEqual(doc('4'));

    // Undoing past the cap stops at the oldest kept state.
    h = undo(undo(undo(h)));
    expect(h.present).toEqual(doc('2'));
    expect(canUndo(h)).toBe(false);
  });

  it('coalesces same-key commits inside the window into one step', () => {
    let h = createHistory(doc('a'));
    h = commit(h, doc('b'), { label: 'fontScale', coalesceKey: 'fontScale', at: 1000 });
    h = commit(h, doc('c'), { label: 'fontScale', coalesceKey: 'fontScale', at: 1200 });
    h = commit(h, doc('d'), { label: 'fontScale', coalesceKey: 'fontScale', at: 1400 });

    expect(h.past).toHaveLength(1);
    expect(h.past[0].state).toEqual(doc('a'));

    const undone = undo(h);
    expect(undone.present).toEqual(doc('a'));
    expect(canUndo(undone)).toBe(false);
  });

  it('starts a new step when the coalescing window expires', () => {
    let h = createHistory(doc('a'));
    h = commit(h, doc('b'), { label: 'drag', coalesceKey: 'opacity', at: 1000 });
    h = commit(h, doc('c'), { label: 'drag', coalesceKey: 'opacity', at: 5000 });

    expect(h.past).toHaveLength(2);
    expect(undo(undo(h)).present).toEqual(doc('a'));
  });

  it('different keys never coalesce', () => {
    let h = createHistory(doc('a'));
    h = commit(h, doc('b'), { label: 'color', coalesceKey: 'color', at: 1000 });
    h = commit(h, doc('c'), { label: 'opacity', coalesceKey: 'opacity', at: 1100 });

    expect(h.past).toHaveLength(2);
  });

  it('an edit after undo starts a fresh step (no coalescing across undo)', () => {
    let h = commit(createHistory(doc('a')), doc('b'), { label: 'x', coalesceKey: 'k', at: 1000 });
    h = undo(h);
    h = commit(h, doc('c'), { label: 'x', coalesceKey: 'k', at: 1100 });

    expect(h.past).toHaveLength(1);
    expect(h.past[0].state).toEqual(doc('a'));
    expect(h.future).toHaveLength(0);
  });

  it('undo/redo keep labels for the UI', () => {
    let h = createHistory(doc('a'));
    h = commit(h, doc('b'), { label: 'set colour' });
    h = commit(h, doc('c'), { label: 'add annotation' });

    expect(undoLabel(h)).toBe('add annotation');
    h = undo(h);
    expect(undoLabel(h)).toBe('set colour');
    expect(redoLabel(h)).toBe('add annotation');
    h = redo(h);
    expect(redoLabel(h)).toBeNull();
  });

  it('resetHistory discards all steps', () => {
    let h = commit(createHistory(doc('a')), doc('b'), { label: 'x' });
    h = resetHistory(doc('fresh'));

    expect(h.present).toEqual(doc('fresh'));
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(canUndo(h)).toBe(false);
  });

  it('has a sane default limit', () => {
    const h = createHistory(doc('a'));
    expect(h.limit).toBe(DEFAULT_HISTORY_LIMIT);
  });
});
