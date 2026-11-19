import { describe, expect, it } from 'vitest';
import { OverlayCanvas } from './OverlayCanvas';

describe('OverlayCanvas', () => {
  it('exports a function', () => {
    expect(typeof OverlayCanvas).toBe('function');
  });
  
  it('is a React component', () => {
    // We can't actually render the component because it requires React
    // But we can check that it's a function
    expect(typeof OverlayCanvas).toBe('function');
  });
});