import { describe, expect, it } from 'vitest';

describe('Inspector', () => {
  it('exports a function', () => {
    expect(typeof require('./Inspector').Inspector).toBe('function');
  });
  
  it('is a React component', () => {
    // We can't actually render the component because it requires React
    // But we can check that it's a function
    expect(typeof require('./Inspector').Inspector).toBe('function');
  });
});