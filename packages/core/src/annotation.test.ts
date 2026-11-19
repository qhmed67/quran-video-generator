import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_STYLE, resolveTextStyle, type TextStyleOverrides } from './annotation';

describe('resolveTextStyle', () => {
  it('returns defaults when there are no overrides', () => {
    const style = resolveTextStyle({});
    expect(style).toEqual(DEFAULT_TEXT_STYLE);
  });

  it('applies overrides', () => {
    const overrides: TextStyleOverrides = {
      fontSize: 20,
      color: '#ff0000',
    };
    const style = resolveTextStyle(overrides);
    expect(style.fontSize).toBe(20);
    expect(style.color).toBe('#ff0000');
    expect(style.fontFamily).toBe('system-ui, -apple-system, sans-serif');
    expect(style.opacity).toBe(0.9);
    expect(style.align).toBe('center');
  });

  it('merges partial overrides without dropping sibling fields', () => {
    const overrides: TextStyleOverrides = {
      fontFamily: 'Arial, sans-serif',
      opacity: 1,
    };
    const style = resolveTextStyle(overrides);
    expect(style.fontFamily).toBe('Arial, sans-serif');
    expect(style.opacity).toBe(1);
    expect(style.fontSize).toBe(16);
    expect(style.color).toBe('#ffffff');
    expect(style.align).toBe('center');
  });
});
