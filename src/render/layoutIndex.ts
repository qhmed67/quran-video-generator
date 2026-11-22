/**
 * Layout index for hit-testing words (plan phase 4.1).
 *
 * The layout index contains word positions in canvas coordinates, allowing
 * hit-testing to determine which word is at a given point. This is a pure
 * function in `core`, unit-tested.
 */

import type { CanvasLike, WordRef } from '@qvg/core';
import type { FontSet } from '@qvg/core';
import type { HorizontalAlign } from './layout';
import type { VerseTimelineEntry } from '@qvg/core';
import { layoutVerseWordBoxes } from './renderFrame';

/** Word layout with canvas coordinates for hit-testing. */
export interface WordLayoutIndex {
  surah: number;
  ayah: number;
  words: {
    index: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

/** Complete layout index for all visible words. */
export interface LayoutIndex {
  width: number;
  height: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  verses: {
    surah: number;
    ayah: number;
    words: WordLayoutIndex;
  }[];
}

/**
 * Creates a layout index for hit-testing words.
 *
 * Uses the renderer's own layout so the boxes land exactly on the painted
 * glyphs; re-deriving fonts and vertical centring here made every hit offset
 * by the block's top padding.
 *
 * @param canvas - The canvas to measure text with
 * @param verse - The verse to lay out
 * @param opts - Layout options
 * @returns Word positions in frame coordinates, `y` being the text baseline
 */
export function createLayoutIndex(
  canvas: CanvasLike,
  verse: VerseTimelineEntry,
  opts: {
    fonts: FontSet;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    align: HorizontalAlign;
    deviceScale: number;
    /** Whether the painted verse carries its ayah number (see renderFrame). */
    showAyahNumber?: boolean;
  },
): WordLayoutIndex {
  const { fonts, bounds, align, showAyahNumber } = opts;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  const { boxes } = layoutVerseWordBoxes(ctx, verse, {
    fonts,
    bounds,
    align,
    showAyahNumber,
  });

  return {
    surah: parseInt(verse.verseKey.split(':')[0], 10),
    ayah: verse.ayahNumber,
    words: boxes,
  };
}

/**
 * Hit-tests a layout index to find the word at a given point.
 *
 * @param layoutIndex - The layout index to test
 * @param point - The point to test {x, y}
 * @returns WordRef if a word is hit, null otherwise
 */
export function hitTest(layoutIndex: LayoutIndex, point: { x: number; y: number }): WordRef | null {
  const { x, y } = point;

  // Check if point is within bounds
  const { bounds } = layoutIndex;
  if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) {
    return null;
  }

  // Check each verse
  for (const verse of layoutIndex.verses) {
    // Check each word
    for (const word of verse.words.words) {
      if (x >= word.x && x <= word.x + word.width && y >= word.y - word.height && y <= word.y) {
        return {
          surah: verse.surah,
          ayah: verse.ayah,
          word: word.index,
        };
      }
    }
  }

  return null;
}

/**
 * Flatten the index into reading order: verse order, word index ascending.
 * Rows are visual lines; the logical reading order is by word index.
 */
function flattenReadingOrder(
  layoutIndex: LayoutIndex,
): { surah: number; ayah: number; word: number }[] {
  return layoutIndex.verses.flatMap((verse) =>
    [...verse.words.words]
      .sort((a, b) => a.index - b.index)
      .map((w) => ({ surah: verse.surah, ayah: verse.ayah, word: w.index })),
  );
}

/** Whether two word references point at the same word. */
export function sameWordRef(a: WordRef, b: WordRef): boolean {
  return sameWord(a, b);
}

function sameWord(a: WordRef, b: WordRef): boolean {
  return a.surah === b.surah && a.ayah === b.ayah && a.word === b.word;
}

/**
 * Keyboard navigation (plan section 3.5b): move the selection word by word.
 *
 * 'next' follows reading order (verse order, ascending word index) — for
 * RTL Arabic the visual direction is leftward, which the key binding in
 * `usePreviewPointer` maps to ArrowLeft.
 *
 * @returns The adjacent word, or null at the ends or when `current` is unknown.
 */
export function adjacentWord(
  layoutIndex: LayoutIndex,
  current: WordRef,
  direction: 'next' | 'prev',
): WordRef | null {
  const words = flattenReadingOrder(layoutIndex);
  const at = words.findIndex((w) => sameWord(w, current));
  if (at === -1) return null;

  const target = direction === 'next' ? at + 1 : at - 1;
  if (target < 0 || target >= words.length) return null;
  return words[target];
}

/**
 * Keyboard navigation: move the selection to the first word of the previous
 * or next ayah in the index.
 *
 * @returns The target word, or null at the ends or when `current` is unknown.
 */
export function adjacentAyah(
  layoutIndex: LayoutIndex,
  current: WordRef,
  direction: 'next' | 'prev',
): WordRef | null {
  const verses = layoutIndex.verses;
  const at = verses.findIndex((v) => v.surah === current.surah && v.ayah === current.ayah);
  if (at === -1) return null;

  const target = direction === 'next' ? at + 1 : at - 1;
  if (target < 0 || target >= verses.length) return null;

  const words = [...verses[target].words.words].sort((a, b) => a.index - b.index);
  if (words.length === 0) return null;
  return { surah: verses[target].surah, ayah: verses[target].ayah, word: words[0].index };
}

/**
 * First word of the whole index — the starting point for keyboard navigation
 * when nothing is selected yet. Null when the index has no words.
 */
export function firstWord(layoutIndex: LayoutIndex): WordRef | null {
  const words = flattenReadingOrder(layoutIndex);
  return words.length > 0 ? words[0] : null;
}

/**
 * Last word of the whole index — starting point for backward navigation
 * (ArrowRight / ArrowUp) when nothing is selected yet.
 */
export function lastWord(layoutIndex: LayoutIndex): WordRef | null {
  const words = flattenReadingOrder(layoutIndex);
  return words.length > 0 ? words[words.length - 1] : null;
}
