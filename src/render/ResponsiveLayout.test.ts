import { describe, expect, it } from 'vitest';
import {
  BREAKPOINT_MOBILE,
  BREAKPOINT_TABLET,
  ResponsiveLayout,
  ResponsiveTest,
  classifyWidth,
  useResponsive,
} from './ResponsiveLayout';

describe('ResponsiveLayout', () => {
  it('exports its component and hook surface', () => {
    expect(typeof ResponsiveLayout).toBe('function');
    expect(typeof ResponsiveTest).toBe('function');
    expect(typeof useResponsive).toBe('function');
  });

  it('breakpoints match DESIGN.md: bottom sheet <720px, stacked rails <1120px', () => {
    expect(BREAKPOINT_MOBILE).toBe(720);
    expect(BREAKPOINT_TABLET).toBe(1120);
  });

  it('classifyWidth maps the plan test sizes to the right mode', () => {
    // 360×640 and 390×844 are phones → bottom sheet.
    expect(classifyWidth(360)).toBe('mobile');
    expect(classifyWidth(390)).toBe('mobile');
    expect(classifyWidth(719)).toBe('mobile');
    // 768×1024 is a tablet → stacked rails.
    expect(classifyWidth(768)).toBe('tablet');
    expect(classifyWidth(1119)).toBe('tablet');
    // Desktop keeps the three-zone grid.
    expect(classifyWidth(1120)).toBe('desktop');
    expect(classifyWidth(1440)).toBe('desktop');
  });
});
