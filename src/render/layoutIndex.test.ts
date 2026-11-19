import { describe, expect, it } from 'vitest';
import { createLayoutIndex, hitTest, type LayoutIndex } from './layoutIndex';
import type { FontSet } from '@qvg/core';
import type { VerseTimelineEntry } from '@qvg/core';

// Mock canvas
const createMockCanvas = (width: number, height: number) => {
  // Create a simple mock canvas for testing
  return {
    width,
    height,
    getContext: () => ({
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: () => {},
    }),
  } as any;
};

// Mock font set
const mockFonts: FontSet = {
  uthmani: 'Arial',
  uthmaniLoaded: true,
  translation: 'Arial',
};

// Mock verse
const createMockVerse = (
  surahNumber: number,
  ayahNumber: number,
  words: { index: number; text: string }[] = [],
): VerseTimelineEntry => ({
  verseKey: `${surahNumber}:${ayahNumber}`,
  ayahNumber,
  uthmani: 'بسم الله الرحمن الرحيم',
  translation: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  startSeconds: 0,
  endSeconds: 10,
  words: words.map((w, i) => ({
    ...w,
    startSeconds: i * 2,
    endSeconds: (i + 1) * 2,
  })),
});

describe('createLayoutIndex', () => {
  it('creates layout index for verse with words', () => {
    const canvas = createMockCanvas(1080, 1920);
    const verse = createMockVerse(1, 1, [
      { index: 0, text: 'بسم' },
      { index: 1, text: 'الله' },
      { index: 2, text: 'الرحمن' },
      { index: 3, text: 'الرحيم' },
    ]);

    const bounds = { x: 54, y: 422, width: 972, height: 1075 };
    const layoutIndex = createLayoutIndex(canvas, verse, {
      fonts: mockFonts,
      bounds,
      align: 'center',
      deviceScale: 1,
    });

    expect(layoutIndex.surah).toBe(1);
    expect(layoutIndex.ayah).toBe(1);
    expect(layoutIndex.words).toHaveLength(4);

    // Check first word
    expect(layoutIndex.words[0].index).toBe(0);
    expect(layoutIndex.words[0].text).toBe('بسم');
    expect(layoutIndex.words[0].x).toBeGreaterThan(bounds.x);
    expect(layoutIndex.words[0].y).toBeGreaterThan(bounds.y);

    // Check last word includes ayah number
    expect(layoutIndex.words[3].text).toContain('1'); // Regular 1 for test
  });

  it('handles verse without words', () => {
    const canvas = createMockCanvas(1080, 1920);
    const verse = createMockVerse(1, 1);

    const bounds = { x: 54, y: 422, width: 972, height: 1075 };
    const layoutIndex = createLayoutIndex(canvas, verse, {
      fonts: mockFonts,
      bounds,
      align: 'center',
      deviceScale: 1,
    });

    expect(layoutIndex.surah).toBe(1);
    expect(layoutIndex.ayah).toBe(1);
    expect(layoutIndex.words).toHaveLength(0);
  });

  it('handles empty verse text', () => {
    const canvas = createMockCanvas(1080, 1920);
    const verse = {
      ...createMockVerse(1, 1),
      uthmani: '',
    };

    const bounds = { x: 54, y: 422, width: 972, height: 1075 };
    const layoutIndex = createLayoutIndex(canvas, verse, {
      fonts: mockFonts,
      bounds,
      align: 'center',
      deviceScale: 1,
    });

    expect(layoutIndex.words).toHaveLength(0);
  });
});

describe('hitTest', () => {
  it('returns null when point is outside bounds', () => {
    const layoutIndex: LayoutIndex = {
      width: 1080,
      height: 1920,
      bounds: { x: 54, y: 422, width: 972, height: 1075 },
      verses: [
        {
          surah: 1,
          ayah: 1,
          words: {
            surah: 1,
            ayah: 1,
            words: [{ index: 0, text: 'بسم', x: 100, y: 500, width: 50, height: 40 }],
          },
        },
      ],
    };

    // Test point outside bounds
    expect(hitTest(layoutIndex, { x: 0, y: 0 })).toBeNull();
    expect(hitTest(layoutIndex, { x: 2000, y: 2000 })).toBeNull();
  });

  it('returns WordRef when point hits a word', () => {
    const layoutIndex: LayoutIndex = {
      width: 1080,
      height: 1920,
      bounds: { x: 54, y: 422, width: 972, height: 1075 },
      verses: [
        {
          surah: 1,
          ayah: 1,
          words: {
            surah: 1,
            ayah: 1,
            words: [
              { index: 0, text: 'بسم', x: 100, y: 500, width: 50, height: 40 },
              { index: 1, text: 'الله', x: 200, y: 500, width: 60, height: 40 },
            ],
          },
        },
      ],
    };

    // Test hitting first word
    const hit1 = hitTest(layoutIndex, { x: 125, y: 480 });
    expect(hit1).toEqual({ surah: 1, ayah: 1, word: 0 });

    // Test hitting second word
    const hit2 = hitTest(layoutIndex, { x: 230, y: 480 });
    expect(hit2).toEqual({ surah: 1, ayah: 1, word: 1 });

    // Test missing words
    expect(hitTest(layoutIndex, { x: 50, y: 500 })).toBeNull();
    expect(hitTest(layoutIndex, { x: 300, y: 500 })).toBeNull();
  });

  it('handles multiple verses', () => {
    const layoutIndex: LayoutIndex = {
      width: 1080,
      height: 1920,
      bounds: { x: 54, y: 422, width: 972, height: 1075 },
      verses: [
        {
          surah: 1,
          ayah: 1,
          words: {
            surah: 1,
            ayah: 1,
            words: [{ index: 0, text: 'بسم', x: 100, y: 500, width: 50, height: 40 }],
          },
        },
        {
          surah: 1,
          ayah: 2,
          words: {
            surah: 1,
            ayah: 2,
            words: [{ index: 0, text: 'الحمد', x: 100, y: 600, width: 60, height: 40 }],
          },
        },
      ],
    };

    // Test hitting first verse
    const hit1 = hitTest(layoutIndex, { x: 125, y: 480 });
    expect(hit1).toEqual({ surah: 1, ayah: 1, word: 0 });

    // Test hitting second verse
    const hit2 = hitTest(layoutIndex, { x: 130, y: 580 });
    expect(hit2).toEqual({ surah: 1, ayah: 2, word: 0 });
  });

  it('handles empty verses', () => {
    const layoutIndex: LayoutIndex = {
      width: 1080,
      height: 1920,
      bounds: { x: 54, y: 422, width: 972, height: 1075 },
      verses: [
        {
          surah: 1,
          ayah: 1,
          words: {
            surah: 1,
            ayah: 1,
            words: [],
          },
        },
      ],
    };

    expect(hitTest(layoutIndex, { x: 100, y: 500 })).toBeNull();
  });
});
