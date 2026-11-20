import { describe, expect, it } from 'vitest';
import { fetchQfUthmani } from './sources';
import { QF_FIXTURES } from '../../tests/helpers/qf-fixtures';
import { stubQfFetch, unstubQfFetch } from '../../tests/helpers/qf-fixtures';
import { reconcileWords } from './timelineBuilder';
import { countArabicLetters } from '@qvg/core';

/**
 * Text integrity guard.
 *
 * The Qur'anic text must never be altered, normalized, reordered or "fixed" by
 * any feature (plan §0, engineering standards). These tests pin the single
 * permitted normalization: ayah-end markers (U+06DD) and Arabic text ornaments
 * (U+FD3E/U+FD3F, U+06D6–U+06ED) are display metadata that the tokenizer strips
 * before tokenizing, and everything else must survive byte for byte.
 */

/** Code points the tokenizer is allowed to drop before display. */
const DROPPABLE = /[\u06D6-\u06ED\uFD3E\uFD3F]/g;

function canonicalWords(text: string): string[] {
  const cleaned = text.replace(DROPPABLE, '');
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && countArabicLetters(t) > 0);
}

describe('Quranic text integrity', () => {
  const CASES: {
    surah: number;
    from: number;
    to: number;
    verses: { verse_key: string; text_uthmani: string }[];
  }[] = [
    { surah: 1, from: 1, to: 7, verses: QF_FIXTURES.uthmani['1'].verses },
    { surah: 108, from: 1, to: 3, verses: QF_FIXTURES.uthmani['108'].verses },
    { surah: 112, from: 1, to: 4, verses: QF_FIXTURES.uthmani['112'].verses },
    { surah: 114, from: 1, to: 6, verses: QF_FIXTURES.uthmani['114'].verses },
  ];

  it('keeps recorded uthmani payloads byte-for-byte through the source boundary', async () => {
    for (const c of CASES) {
      stubQfFetch({ [`/quran/verses/uthmani?chapter_number=${c.surah}`]: { verses: c.verses } });
      try {
        const fetched = await fetchQfUthmani({ surah: c.surah, from: c.from, to: c.to });
        expect(fetched.map((v) => v.textUthmani)).toEqual(c.verses.map((v) => v.text_uthmani));
      } finally {
        unstubQfFetch();
      }
    }
  });

  it('keeps the word tokens of a recorded Al-Fatihah verse in order', () => {
    const source = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
    const words = reconcileWords(source, [
      { index: 0, startSeconds: 0, endSeconds: 6.09 },
      { index: 1, startSeconds: 6.09, endSeconds: 10.5 },
    ]);
    expect(words).not.toBeNull();
    expect(words!.map((w) => w.text)).toEqual(canonicalWords(source));
  });
});
