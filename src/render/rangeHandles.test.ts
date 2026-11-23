/**
 * Range drag-handle geometry (plan 3.5b).
 *
 * Handles are pure functions of the layout index and the selection, so the
 * overlay can paint them and the pointer hook can hit-test the same points.
 */

import { describe, expect, it } from 'vitest';
import type { VerseTimelineEntry } from '@qvg/core';
import { createLayoutIndex, type LayoutIndex } from './layoutIndex';
import { hitTestRangeHandle, rangeHandlePoints } from './rangeHandles';
import type { SelectionState } from './usePreviewPointer';

function createMockCanvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: () => ({
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}

const mockFonts = { uthmani: 'serif', uthmaniLoaded: true, translation: 'sans-serif' };

function buildIndex(wordTexts: string[]): LayoutIndex {
  const verse: VerseTimelineEntry = {
    verseKey: '1:1',
    ayahNumber: 1,
    startSeconds: 0,
    endSeconds: 10,
    uthmani: wordTexts.join(' '),
    translation: '',
    words: wordTexts.map((text, index) => ({
      index,
      text,
      startSeconds: index,
      endSeconds: index + 1,
    })),
  };
  const canvas = createMockCanvas(1080, 1920);
  const bounds = { x: 54, y: 422, width: 972, height: 1075 };
  const words = createLayoutIndex(canvas, verse, {
    fonts: mockFonts,
    bounds,
    align: 'center',
    deviceScale: 1,
  });
  return {
    width: 1080,
    height: 1920,
    bounds,
    verses: [{ surah: 1, ayah: 1, words }],
  };
}

const WORDS = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

function wordRef(word: number) {
  return { surah: 1, ayah: 1, word };
}

function rangeSelection(from: number, to: number): SelectionState {
  return { type: 'range', start: wordRef(from), end: wordRef(to), current: wordRef(to) };
}

/** Midpoint of a word's painted box (baseline-based, like OverlayCanvas). */
function boxCenter(index: LayoutIndex, word: number): { x: number; y: number } {
  const w = index.verses[0].words.words.find((entry) => entry.index === word);
  if (!w) throw new Error(`word ${word} missing from index`);
  return { x: w.x + w.width / 2, y: w.y - w.height / 2 };
}

describe('rangeHandlePoints', () => {
  it('returns null for a plain word selection', () => {
    const index = buildIndex(WORDS);
    expect(
      rangeHandlePoints(index, { type: 'word', start: null, end: null, current: null }),
    ).toBeNull();
  });

  it('shows both handles on a one-word range so long-press can extend it', () => {
    const index = buildIndex(WORDS);
    const points = rangeHandlePoints(index, rangeSelection(1, 1));
    expect(points).not.toBeNull();
    expect(points!.from.x).toBeGreaterThan(boxCenter(index, 1).x);
    expect(points!.to.x).toBeLessThan(boxCenter(index, 1).x);
  });

  it('puts the opening handle at the right edge when the range starts first', () => {
    const index = buildIndex(WORDS);
    // RTL: word 0 paints right-most, so the range opens at word 0's right.
    const points = rangeHandlePoints(index, rangeSelection(0, 3));
    expect(points).not.toBeNull();
    expect(points!.from.x).toBeGreaterThan(boxCenter(index, 0).x);
    expect(points!.to.x).toBeLessThan(boxCenter(index, 3).x);
    // Handles sit vertically centred on their word's line.
    expect(points!.from.y).toBeCloseTo(boxCenter(index, 0).y, 0);
    expect(points!.to.y).toBeCloseTo(boxCenter(index, 3).y, 0);
  });

  it('keeps each handle on its own selection end when the user taps backwards', () => {
    const index = buildIndex(WORDS);
    const points = rangeHandlePoints(index, rangeSelection(3, 0));
    expect(points).not.toBeNull();
    // start (word 3) opened second, so its handle is on its outer left edge
    // and the end handle (word 0) on its outer right edge.
    expect(points!.from.x).toBeLessThan(boxCenter(index, 3).x);
    expect(points!.to.x).toBeGreaterThan(boxCenter(index, 0).x);
  });
});

describe('hitTestRangeHandle', () => {
  const index = buildIndex(WORDS);

  it('hits each handle at its centre', () => {
    const selection = rangeSelection(0, 3);
    const points = rangeHandlePoints(index, selection)!;
    expect(hitTestRangeHandle(index, selection, points.from)).toBe('from');
    expect(hitTestRangeHandle(index, selection, points.to)).toBe('to');
  });

  it('still maps to selection ends for a backwards range', () => {
    const selection = rangeSelection(3, 0);
    const points = rangeHandlePoints(index, selection)!;
    expect(hitTestRangeHandle(index, selection, points.from)).toBe('from');
    expect(hitTestRangeHandle(index, selection, points.to)).toBe('to');
  });

  it('misses far away points', () => {
    expect(hitTestRangeHandle(index, rangeSelection(0, 3), { x: 5, y: 5 })).toBeNull();
  });

  it('accepts a larger radius for a scaled-down preview', () => {
    const selection = rangeSelection(0, 3);
    const points = rangeHandlePoints(index, selection)!;
    const near = { x: points.from.x + 40, y: points.from.y };
    expect(hitTestRangeHandle(index, selection, near)).toBeNull();
    expect(hitTestRangeHandle(index, selection, near, 60)).toBe('from');
  });

  it('never hits without a multi-word range', () => {
    const single: SelectionState = {
      type: 'word',
      start: null,
      end: null,
      current: wordRef(0),
    };
    expect(hitTestRangeHandle(index, single, { x: 900, y: 500 })).toBeNull();
  });
});
