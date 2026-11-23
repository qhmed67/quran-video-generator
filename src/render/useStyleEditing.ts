/**
 * Word-style editing hook — plan phase 4.3 / 4.6.
 *
 * Owns the three things the inspector needs and the renderer consumes:
 *
 *   rules      the StyleRule[] the renderer resolves per word
 *   selection  the scope an edit is written to (word, range, ayah, global)
 *   history    undo/redo over the rule list
 *
 * Selection state lives in `usePreviewPointer`; this hook only holds the scope
 * *choice* on top of it, so a user can style the whole ayah of the word they
 * clicked without re-clicking.
 */

import { useCallback, useMemo, useState } from 'react';
import type { StyleRule, WordRef, WordStyle, WordStyleOverrides } from '@qvg/core';
import {
  DEFAULT_WORD_STYLE,
  createHistory,
  commit as commitHistory,
  redo as redoHistory,
  canRedo as canRedoHistory,
  canUndo as canUndoHistory,
  resolveWordStyle,
  undo as undoHistory,
  type History,
} from '@qvg/core';
import {
  clearRule,
  findRule,
  patchRule,
  scopeToTarget,
  targetKey,
  type SelectionScope,
} from './styleRules';

/** Which granularity the inspector currently edits at. */
export type EditGranularity = 'word' | 'ayah' | 'global';

export interface StyleEditingState {
  rules: StyleRule[];
  granularity: EditGranularity;
  /** The word the user is working from; drives ayah/global resolution. */
  anchor: WordRef | null;
  /** Range selection, when the user dragged or double-tapped. */
  range: { from: WordRef; to: WordRef } | null;
}

/** Resolve a scope into the renderer's playback-state-independent style. */
function resolveFor(rules: StyleRule[], ref: WordRef): WordStyle {
  return resolveWordStyle(rules, ref, 'upcoming');
}

export function useStyleEditing() {
  const [granularity, setGranularity] = useState<EditGranularity>('word');
  const [anchor, setAnchor] = useState<WordRef | null>(null);
  const [range, setRange] = useState<{ from: WordRef; to: WordRef } | null>(null);

  // Undo/redo over the rule list, using the pure history from `core`. Keeping
  // the state in one object avoids the trap of mutating stacks inside a
  // `setState` updater: React may invoke an updater twice, which popped the
  // undo stack twice and left undo silently doing nothing.
  const [history, setHistory] = useState<History<StyleRule[]>>(() => createHistory([]));

  const rules = history.present;

  const commit = useCallback((next: StyleRule[], label: string, coalesceKey?: string) => {
    setHistory((current) => commitHistory(current, next, { label, coalesceKey, at: Date.now() }));
  }, []);

  const undo = useCallback(() => setHistory((current) => undoHistory(current)), []);
  const redo = useCallback(() => setHistory((current) => redoHistory(current)), []);

  /** The scope an edit lands on, derived from granularity and selection. */
  const scope: SelectionScope | null = useMemo(() => {
    if (granularity === 'global') return { kind: 'global' };
    if (!anchor) return null;
    if (granularity === 'ayah') return { kind: 'ayah', surah: anchor.surah, ayah: anchor.ayah };
    if (
      range &&
      (range.from.surah !== range.to.surah ||
        range.from.ayah !== range.to.ayah ||
        range.from.word !== range.to.word)
    ) {
      return { kind: 'wordRange', from: range.from, to: range.to };
    }
    return { kind: 'word', ref: anchor };
  }, [granularity, anchor, range]);

  const target = useMemo(() => (scope ? scopeToTarget(scope) : null), [scope]);

  /** Effective style of the selection: this scope's rule applied over parents. */
  const currentStyle = useMemo<WordStyle>(() => {
    if (!target) return DEFAULT_WORD_STYLE;
    const ref = anchor ?? { surah: 1, ayah: 1, word: 1 };
    return resolveFor(rules, ref);
  }, [rules, target, anchor]);

  /** What the selection would resolve to if this scope's rule were removed. */
  const inherited = useMemo<WordStyle>(() => {
    if (!target || !anchor) return DEFAULT_WORD_STYLE;
    return resolveFor(clearRule(rules, target), anchor);
  }, [rules, target, anchor]);

  const hasOwnRule = useMemo(
    () => (target ? findRule(rules, target) !== null : false),
    [rules, target],
  );

  /** Apply one property to the current scope. */
  const setProperty = useCallback(
    <K extends keyof WordStyle>(key: K, value: WordStyle[K]) => {
      if (!target) return;
      const patch: WordStyleOverrides = { [key]: value } as WordStyleOverrides;
      // Coalescing keeps a slider drag to one undo step.
      commit(
        patchRule(rules, target, patch),
        `Change ${String(key)}`,
        `${targetKey(target)}:${String(key)}`,
      );
    },
    [target, rules, commit],
  );

  /** Remove the current scope's rule, so the selection inherits again. */
  const reset = useCallback(() => {
    if (!target) return;
    commit(clearRule(rules, target), 'Reset style');
  }, [target, rules, commit]);

  /** Clear every rule (used when the project is replaced). */
  const resetAll = useCallback(() => {
    commit([], 'Clear all styles');
  }, [commit]);

  const selectWord = useCallback(
    (ref: WordRef, nextRange: { from: WordRef; to: WordRef } | null = null) => {
      setAnchor(ref);
      setRange(nextRange);
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setAnchor(null);
    setRange(null);
  }, []);

  // Drag-handle extension (plan 3.5b): move one end of the current range.
  // A fresh tap sets a plain word selection again.
  const extendRange = useCallback((ref: WordRef, edge: 'from' | 'to') => {
    setRange((current) => {
      if (!current) return null;
      return edge === 'from' ? { ...current, from: ref } : { ...current, to: ref };
    });
  }, []);

  const scopeLabel =
    granularity === 'global'
      ? 'Global'
      : granularity === 'ayah'
        ? 'Ayah'
        : range
          ? 'Range'
          : 'Word';

  return {
    rules,
    target,
    targetId: target ? targetKey(target) : null,
    granularity,
    setGranularity,
    anchor,
    selectWord,
    extendRange,
    clearSelection,
    currentStyle,
    inheritedStyle: inherited,
    hasOwnRule,
    setProperty,
    reset,
    resetAll,
    scopeLabel,
    undo,
    redo,
    canUndo: canUndoHistory(history),
    canRedo: canRedoHistory(history),
  };
}

export type StyleEditing = ReturnType<typeof useStyleEditing>;

/** Whether an ayah scope is the one the anchor sits in. */
export function isSameAyah(a: WordRef | null, b: WordRef | null): boolean {
  if (!a || !b) return false;
  return a.surah === b.surah && a.ayah === b.ayah;
}
