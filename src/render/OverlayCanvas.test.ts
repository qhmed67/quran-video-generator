import { describe, expect, it } from 'vitest';
import { OverlayCanvas } from './OverlayCanvas';

describe('OverlayCanvas', () => {
  it('exports a React component', () => {
    expect(typeof OverlayCanvas).toBe('function');
  });

  it('is nameable for debugging', () => {
    expect(OverlayCanvas.name).toBe('OverlayCanvas');
  });
});
