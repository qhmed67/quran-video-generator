import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORD_STYLE,
  type StyleRule,
  type WordRef,
  type WordStyle,
  wordKey,
  resolveWordStyle,
} from './style';

const ref = (surah: number, ayah: number, word: number): WordRef => ({ surah, ayah, word });

describe('wordKey', () => {
  it('builds a stable composite key', () => {
    expect(wordKey(ref(2, 255, 3))).toBe('2:255:3');
  });
});

describe('resolveWordStyle', () => {
  it('returns defaults when there are no rules', () => {
    const style = resolveWordStyle([], ref(1, 1, 1), 'active');
    expect(style).toEqual(DEFAULT_WORD_STYLE);
  });

  it('applies a global rule', () => {
    const style = resolveWordStyle(
      [{ id: 'g1', target: { kind: 'global' }, props: { color: '#ff0000' } }],
      ref(1, 1, 1),
      'active',
    );
    expect(style.color).toBe('#ff0000');
    expect(style.opacity).toBe(1);
  });

  it('applies a state rule only for the matching playback state', () => {
    const rules: StyleRule[] = [
      { id: 's1', target: { kind: 'state', state: 'spoken' }, props: { color: '#00ff00' } },
    ];
    expect(resolveWordStyle(rules, ref(1, 1, 1), 'spoken').color).toBe('#00ff00');
    expect(resolveWordStyle(rules, ref(1, 1, 1), 'active').color).toBe('#ffffff');
  });

  it('applies an ayah rule', () => {
    const style = resolveWordStyle(
      [{ id: 'a1', target: { kind: 'ayah', surah: 2, ayah: 255 }, props: { color: '#0000ff' } }],
      ref(2, 255, 3),
      'active',
    );
    expect(style.color).toBe('#0000ff');
  });

  it('applies an inclusive word range', () => {
    const rules: StyleRule[] = [
      {
        id: 'r1',
        target: { kind: 'wordRange', from: ref(1, 2, 1), to: ref(1, 2, 3) },
        props: { color: '#ffff00' },
      },
    ];
    expect(resolveWordStyle(rules, ref(1, 2, 1), 'active').color).toBe('#ffff00');
    expect(resolveWordStyle(rules, ref(1, 2, 3), 'active').color).toBe('#ffff00');
    expect(resolveWordStyle(rules, ref(1, 2, 4), 'active').color).toBe('#ffffff');
    expect(resolveWordStyle(rules, ref(1, 3, 1), 'active').color).toBe('#ffffff');
  });

  it('applies a word rule', () => {
    const style = resolveWordStyle(
      [{ id: 'w1', target: { kind: 'word', ref: ref(1, 2, 3) }, props: { color: '#ff00ff' } }],
      ref(1, 2, 3),
      'active',
    );
    expect(style.color).toBe('#ff00ff');
    expect(
      resolveWordStyle(
        [{ id: 'w2', target: { kind: 'word', ref: ref(1, 2, 4) }, props: { color: '#ff00ff' } }],
        ref(1, 2, 3),
        'active',
      ).color,
    ).toBe('#ffffff');
  });

  it('resolves in priority order: word > wordRange > ayah > state > global > defaults', () => {
    const rules: StyleRule[] = [
      { id: 'g1', target: { kind: 'global' }, props: { color: '#ff0000' } },
      { id: 's1', target: { kind: 'state', state: 'active' }, props: { color: '#00ff00' } },
      { id: 'a1', target: { kind: 'ayah', surah: 1, ayah: 2 }, props: { color: '#0000ff' } },
      {
        id: 'r1',
        target: { kind: 'wordRange', from: ref(1, 2, 1), to: ref(1, 2, 3) },
        props: { color: '#ffff00' },
      },
      { id: 'w1', target: { kind: 'word', ref: ref(1, 2, 3) }, props: { color: '#ff00ff' } },
    ];
    const style = resolveWordStyle(rules, ref(1, 2, 3), 'active');
    expect(style.color).toBe('#ff00ff');
  });

  it('lets a later rule win within the same level', () => {
    const rules: StyleRule[] = [
      { id: 'g1', target: { kind: 'global' }, props: { color: '#ff0000' } },
      { id: 'g2', target: { kind: 'global' }, props: { color: '#00ff00' } },
    ];
    expect(resolveWordStyle(rules, ref(1, 1, 1), 'active').color).toBe('#00ff00');
  });

  it('merges partial overrides without dropping sibling fields', () => {
    const style = resolveWordStyle(
      [{ id: 'g1', target: { kind: 'global' }, props: { color: '#ff0000' } }],
      ref(1, 1, 1),
      'active',
    );
    const merged: WordStyle = style;
    expect(merged.color).toBe('#ff0000');
    expect(merged.opacity).toBe(1);
    expect(merged.fontScale).toBe(1);
    expect(merged.glow).toBeNull();
  });
});
