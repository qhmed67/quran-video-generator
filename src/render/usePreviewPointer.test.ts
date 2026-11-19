import { describe, expect, it } from 'vitest';
import { usePreviewPointer } from './usePreviewPointer';

describe('usePreviewPointer', () => {
  it('exports a function', () => {
    expect(typeof usePreviewPointer).toBe('function');
  });
});
