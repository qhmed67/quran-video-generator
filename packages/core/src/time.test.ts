import { describe, expect, it } from 'vitest';
import { clampSeconds, compareToWindow, msToSeconds, secondsToMs } from './time';

describe('msToSeconds', () => {
  it('converts milliseconds to seconds', () => {
    expect(msToSeconds(0)).toBe(0);
    expect(msToSeconds(6090)).toBeCloseTo(6.09, 10);
    expect(msToSeconds(3520)).toBeCloseTo(3.52, 10);
  });
});

describe('secondsToMs', () => {
  it('converts seconds back to milliseconds', () => {
    expect(secondsToMs(0)).toBe(0);
    expect(secondsToMs(3.52)).toBeCloseTo(3520, 10);
  });
});

describe('compareToWindow', () => {
  it('classifies position before, inside and after the window', () => {
    expect(compareToWindow(-0.5, 0, 1)).toBe(-1);
    expect(compareToWindow(0, 0, 1)).toBe(0);
    expect(compareToWindow(0.5, 0, 1)).toBe(0);
    expect(compareToWindow(1, 0, 1)).toBe(1);
  });
});

describe('clampSeconds', () => {
  it('clamps to zero and passes through non-negative values', () => {
    expect(clampSeconds(-3)).toBe(0);
    expect(clampSeconds(2.5)).toBe(2.5);
  });
});
