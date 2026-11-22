/**
 * Style-rule editing — plan phase 4.3.
 *
 * The Inspector produces a whole `WordStyle`, but the renderer consumes
 * `StyleRule[]`. This module is the bridge: given a selection it writes the
 * edited properties onto the rule for that selection's scope, or removes the
 * rule when the selection goes back to inheriting.
 *
 * Pure and dependency-free so it can be unit-tested without React.
 */

import type { StyleRule, StyleTarget, WordRef, WordStyle, WordStyleOverrides } from '@qvg/core';
import { wordKey } from '@qvg/core';

/** The scopes a user can style from the inspector. */
export type SelectionScope =
  | { kind: 'word'; ref: WordRef }
  | { kind: 'wordRange'; from: WordRef; to: WordRef }
  | { kind: 'ayah'; surah: number; ayah: number }
  | { kind: 'global' };

/**
 * Stable identity for a target, used as the rule id and for lookups.
 * Two targets that resolve the same words share an id.
 */
export function targetKey(target: StyleTarget): string {
  switch (target.kind) {
    case 'global':
      return 'global';
    case 'state':
      return `state:${target.state}`;
    case 'ayah':
      return `ayah:${target.surah}:${target.ayah}`;
    case 'wordRange':
      return `wordRange:${wordKey(normalizeRange(target.from, target.to).from)}:${wordKey(
        normalizeRange(target.from, target.to).to,
      )}`;
    case 'word':
      return `word:${wordKey(target.ref)}`;
  }
}

/**
 * Order a range so `from` never sorts after `to`.
 *
 * A user drags in either direction and RTL reading order means the visual
 * start is the rightmost word, so the raw pair cannot be trusted.
 */
export function normalizeRange(from: WordRef, to: WordRef): { from: WordRef; to: WordRef } {
  const cmp = compareRefs(from, to);
  return cmp <= 0 ? { from, to } : { from: to, to: from };
}

function compareRefs(a: WordRef, b: WordRef): number {
  if (a.surah !== b.surah) return a.surah - b.surah;
  if (a.ayah !== b.ayah) return a.ayah - b.ayah;
  return a.word - b.word;
}

/** Convert a selection scope into a style target. */
export function scopeToTarget(scope: SelectionScope): StyleTarget {
  switch (scope.kind) {
    case 'global':
      return { kind: 'global' };
    case 'ayah':
      return { kind: 'ayah', surah: scope.surah, ayah: scope.ayah };
    case 'word':
      return { kind: 'word', ref: scope.ref };
    case 'wordRange': {
      const { from, to } = normalizeRange(scope.from, scope.to);
      // A "range" of one word is just a word: keep the narrower scope so the
      // rule still applies after the user later edits a neighbouring word.
      if (wordKey(from) === wordKey(to)) return { kind: 'word', ref: from };
      return { kind: 'wordRange', from, to };
    }
  }
}

/** Find the rule for a target, if the user already created one. */
export function findRule(rules: StyleRule[], target: StyleTarget): StyleRule | null {
  const key = targetKey(target);
  return rules.find((rule) => rule.id === key) ?? null;
}

/**
 * The style a selection currently resolves to, ignoring its own rule.
 *
 * This is what the inspector shows as "inherited from …": the value the word
 * would paint with if the user reset this scope.
 */
export function inheritedStyle(params: {
  rules: StyleRule[];
  target: StyleTarget;
  ref: WordRef;
  resolve: (rules: StyleRule[], ref: WordRef) => WordStyle;
}): WordStyle {
  const { rules, target, ref, resolve } = params;
  return resolve(
    rules.filter((rule) => rule.id !== targetKey(target)),
    ref,
  );
}

/**
 * Write `props` onto the rule for `target`, creating the rule when needed.
 *
 * `props` is the full edited style, but only the keys that differ from
 * `baseline` are stored — a rule records what the user changed, not a full
 * copy of the inherited style, so later changes to the parent still flow
 * through to unscoped properties.
 *
 * Returns the new rule list and the props actually stored.
 */
export function applyStyleToTarget(params: {
  rules: StyleRule[];
  target: StyleTarget;
  props: WordStyle;
  baseline: WordStyle;
}): { rules: StyleRule[]; stored: WordStyleOverrides } {
  const { rules, target, props, baseline } = params;
  const overrides: WordStyleOverrides = {};
  const patch = overrides as Record<string, unknown>;
  const propsRecord = props as unknown as Record<string, unknown>;
  const baselineRecord = baseline as unknown as Record<string, unknown>;

  for (const key of Object.keys(propsRecord) as (keyof WordStyle)[]) {
    if (!sameValue(propsRecord[key], baselineRecord[key])) {
      patch[key] = propsRecord[key];
    }
  }

  return { rules: writeRule(rules, target, overrides), stored: overrides };
}

/** Write a partial patch (used when the inspector edits a single control). */
export function patchRule(
  rules: StyleRule[],
  target: StyleTarget,
  patch: WordStyleOverrides,
): StyleRule[] {
  const key = targetKey(target);
  const existing = findRule(rules, target);
  const merged: WordStyleOverrides = { ...(existing?.props ?? {}), ...patch };
  return writeRule(rules, target, pruneNulls(merged), key);
}

/**
 * Remove the rule for `target`, so the selection inherits again.
 * Returns the new list; the input is untouched.
 */
export function clearRule(rules: StyleRule[], target: StyleTarget): StyleRule[] {
  const key = targetKey(target);
  return rules.filter((rule) => rule.id !== key);
}

/** Rules that are not empty (a rule with no props does nothing). */
export function pruneRules(rules: StyleRule[]): StyleRule[] {
  return rules.filter((rule) => Object.keys(rule.props).length > 0);
}

function writeRule(
  rules: StyleRule[],
  target: StyleTarget,
  props: WordStyleOverrides,
  key: string = targetKey(target),
): StyleRule[] {
  const next = rules.filter((rule) => rule.id !== key);
  const pruned = pruneNulls(props);
  if (Object.keys(pruned).length === 0) return next;
  next.push({ id: key, target, props: pruned });
  return next;
}

/**
 * `null` on a nullable style field means "no glow", which is a real value and
 * must survive; only `undefined` (never set) is dropped.
 */
function pruneNulls(props: WordStyleOverrides): WordStyleOverrides {
  const out: Record<string, unknown> = {};
  const source = props as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out as WordStyleOverrides;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => sameValue(aRecord[key], bRecord[key]));
}
