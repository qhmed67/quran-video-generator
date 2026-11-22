import { describe, expect, it } from 'vitest';
import { DEFAULT_WORD_STYLE, resolveWordStyle } from '@qvg/core';
import type { StyleRule, WordRef } from '@qvg/core';
import {
  applyStyleToTarget,
  clearRule,
  findRule,
  inheritedStyle,
  normalizeRange,
  patchRule,
  pruneRules,
  scopeToTarget,
  targetKey,
} from './styleRules';

const w = (ayah: number, word: number, surah = 36): WordRef => ({ surah, ayah, word });
const resolve = (rules: StyleRule[], ref: WordRef) => resolveWordStyle(rules, ref, 'upcoming');

describe('normalizeRange', () => {
  it('keeps an already ordered range', () => {
    const { from, to } = normalizeRange(w(1, 2), w(1, 5));
    expect(from).toEqual(w(1, 2));
    expect(to).toEqual(w(1, 5));
  });

  it('swaps a backwards drag', () => {
    const { from, to } = normalizeRange(w(2, 5), w(1, 2));
    expect(from).toEqual(w(1, 2));
    expect(to).toEqual(w(2, 5));
  });
});

describe('scopeToTarget', () => {
  it('maps global', () => {
    expect(scopeToTarget({ kind: 'global' })).toEqual({ kind: 'global' });
  });

  it('maps ayah', () => {
    expect(scopeToTarget({ kind: 'ayah', surah: 36, ayah: 3 })).toEqual({
      kind: 'ayah',
      surah: 36,
      ayah: 3,
    });
  });

  it('collapses a one-word range to a word target', () => {
    expect(scopeToTarget({ kind: 'wordRange', from: w(1, 2), to: w(1, 2) })).toEqual({
      kind: 'word',
      ref: w(1, 2),
    });
  });

  it('normalizes a multi-word range', () => {
    expect(scopeToTarget({ kind: 'wordRange', from: w(2, 1), to: w(1, 3) })).toEqual({
      kind: 'wordRange',
      from: w(1, 3),
      to: w(2, 1),
    });
  });
});

describe('targetKey', () => {
  it('is stable for the same target', () => {
    const a = scopeToTarget({ kind: 'word', ref: w(1, 2) });
    const b = scopeToTarget({ kind: 'word', ref: w(1, 2) });
    expect(targetKey(a)).toBe(targetKey(b));
  });

  it('ignores the drag direction of a range', () => {
    const forward = scopeToTarget({ kind: 'wordRange', from: w(1, 1), to: w(1, 4) });
    const backward = scopeToTarget({ kind: 'wordRange', from: w(1, 4), to: w(1, 1) });
    expect(targetKey(forward)).toBe(targetKey(backward));
  });

  it('distinguishes scopes', () => {
    expect(targetKey(scopeToTarget({ kind: 'global' }))).not.toBe(
      targetKey(scopeToTarget({ kind: 'ayah', surah: 36, ayah: 1 })),
    );
  });
});

describe('applyStyleToTarget', () => {
  const target = scopeToTarget({ kind: 'word', ref: w(1, 1) });

  it('stores only the properties that differ from the baseline', () => {
    const { rules, stored } = applyStyleToTarget({
      rules: [],
      target,
      props: { ...DEFAULT_WORD_STYLE, color: '#ff0000' },
      baseline: DEFAULT_WORD_STYLE,
    });
    expect(stored).toEqual({ color: '#ff0000' });
    expect(rules).toHaveLength(1);
    expect(rules[0].target).toEqual(target);
  });

  it('leaves the inherited properties of other words intact', () => {
    const rules: StyleRule[] = [
      { id: 'global', target: { kind: 'global' }, props: { fontScale: 1.4 } },
    ];
    const { rules: next } = applyStyleToTarget({
      rules,
      target,
      props: { ...DEFAULT_WORD_STYLE, fontScale: 1.4, color: '#00ff00' },
      baseline: resolve(rules, w(1, 1)),
    });
    // The word only records its colour; the global scale still applies.
    expect(findRule(next, target)?.props).toEqual({ color: '#00ff00' });
    expect(resolve(next, w(1, 1)).fontScale).toBe(1.4);
    expect(resolve(next, w(1, 1)).color).toBe('#00ff00');
  });

  it('updates an existing rule instead of duplicating it', () => {
    const first = applyStyleToTarget({
      rules: [],
      target,
      props: { ...DEFAULT_WORD_STYLE, color: '#ff0000' },
      baseline: DEFAULT_WORD_STYLE,
    });
    const second = applyStyleToTarget({
      rules: first.rules,
      target,
      props: { ...DEFAULT_WORD_STYLE, color: '#0000ff' },
      baseline: DEFAULT_WORD_STYLE,
    });
    expect(second.rules).toHaveLength(1);
    expect(second.rules[0].props).toEqual({ color: '#0000ff' });
  });

  it('removes the rule when the style goes back to the baseline', () => {
    const first = applyStyleToTarget({
      rules: [],
      target,
      props: { ...DEFAULT_WORD_STYLE, color: '#ff0000' },
      baseline: DEFAULT_WORD_STYLE,
    });
    const reset = applyStyleToTarget({
      rules: first.rules,
      target,
      props: { ...DEFAULT_WORD_STYLE },
      baseline: DEFAULT_WORD_STYLE,
    });
    expect(reset.rules).toHaveLength(0);
  });

  it('keeps an explicit null glow (a real value, not "unset")', () => {
    const baseline = {
      ...DEFAULT_WORD_STYLE,
      glow: { color: '#ffffff', radius: 4 },
    };
    const { stored } = applyStyleToTarget({
      rules: [],
      target,
      props: { ...baseline, glow: null },
      baseline,
    });
    expect(stored).toEqual({ glow: null });
  });

  it('does not mutate the input rules', () => {
    const rules: StyleRule[] = [];
    applyStyleToTarget({
      rules,
      target,
      props: { ...DEFAULT_WORD_STYLE, color: '#ff0000' },
      baseline: DEFAULT_WORD_STYLE,
    });
    expect(rules).toHaveLength(0);
  });
});

describe('patchRule', () => {
  const target = scopeToTarget({ kind: 'word', ref: w(2, 3) });

  it('merges successive patches into one rule', () => {
    let rules = patchRule([], target, { color: '#ff0000' });
    rules = patchRule(rules, target, { opacity: 0.5 });
    expect(rules).toHaveLength(1);
    expect(rules[0].props).toEqual({ color: '#ff0000', opacity: 0.5 });
  });

  it('keeps the existing properties when a patch is empty', () => {
    let rules = patchRule([], target, { color: '#ff0000' });
    rules = patchRule(rules, target, {});
    expect(rules).toHaveLength(1);
    expect(rules[0].props).toEqual({ color: '#ff0000' });
  });

  it('treats an explicit undefined as a removal', () => {
    let rules = patchRule([], target, { color: '#ff0000', opacity: 0.5 });
    rules = patchRule(rules, target, { color: undefined });
    expect(rules[0].props).toEqual({ opacity: 0.5 });
    rules = patchRule(rules, target, { opacity: undefined });
    expect(rules).toHaveLength(0);
  });
});

describe('clearRule', () => {
  it('removes only the matching rule', () => {
    const rules = patchRule(
      patchRule([], scopeToTarget({ kind: 'word', ref: w(1, 1) }), { color: '#ff0000' }),
      scopeToTarget({ kind: 'word', ref: w(1, 2) }),
      { color: '#00ff00' },
    );
    const next = clearRule(rules, scopeToTarget({ kind: 'word', ref: w(1, 1) }));
    expect(next).toHaveLength(1);
    expect(resolve(next, w(1, 1)).color).not.toBe('#ff0000');
    expect(resolve(next, w(1, 2)).color).toBe('#00ff00');
  });
});

describe('inheritedStyle', () => {
  it('ignores the scope being edited but keeps its parents', () => {
    const wordTarget = scopeToTarget({ kind: 'word', ref: w(1, 1) });
    const rules = patchRule(
      patchRule([], { kind: 'global' }, { fontScale: 1.6 }),
      wordTarget,
      { color: '#ff0000' },
    );
    const inherited = inheritedStyle({
      rules,
      target: wordTarget,
      ref: w(1, 1),
      resolve,
    });
    expect(inherited.color).toBe(DEFAULT_WORD_STYLE.color);
    expect(inherited.fontScale).toBe(1.6);
  });
});

describe('pruneRules', () => {
  it('drops rules with no properties', () => {
    expect(pruneRules([{ id: 'global', target: { kind: 'global' }, props: {} }])).toHaveLength(0);
  });
});
