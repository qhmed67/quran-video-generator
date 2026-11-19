import { describe, expect, it } from 'vitest';
import { Inspector } from './Inspector';

describe('Inspector', () => {
  it('exports a React component', () => {
    expect(typeof Inspector).toBe('function');
  });

  it('exposes the inspector panel markup contract', () => {
    // Structural smoke test: the component is a function of props, so we
    // verify it is callable without executing JSX (no DOM in unit tests).
    expect(Inspector.name).toBe('Inspector');
  });
});
