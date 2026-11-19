import { describe, expect, it } from 'vitest';
import { buildTimeline, reconcileWords, validateTimeline } from './timelineBuilder';
import { resolveTiming } from './resolver';
import { QF_FIXTURES, stubQfFetch, unstubQfFetch } from '../../tests/helpers/qf-fixtures';
import type { TimelineRequest } from './types';

describe('reconcileWords', () => {
  it('splits the uthmani text on spaces and maps segments by index', () => {
    const words = reconcileWords('ق ۝١ ٱلْحَمْدُ', [
      { index: 0, startSeconds: 0, endSeconds: 0.5 },
      { index: 1, startSeconds: 0.5, endSeconds: 1 },
    ]);
    expect(words).not.toBeNull();
    expect(words!.map((w) => w.text)).toEqual(['ق', 'ٱلْحَمْدُ']);
    expect(words!.map((w) => w.index)).toEqual([0, 1]);
  });

  it('returns null when no segment is usable', () => {
    expect(reconcileWords('ق ۝١', [])).toBeNull();
    expect(reconcileWords('ق ۝١', [{ index: 0, startSeconds: 1, endSeconds: 0 }])).toBeNull();
  });
});

describe('validateTimeline', () => {
  const timelineWith = (verses: unknown[]) =>
    ({
      version: 1,
      units: { time: 'seconds' },
      meta: {
        granularity: 'word',
        sourceChain: [],
        reciterId: '7',
        surah: 1,
        versesFrom: 1,
        versesTo: 1,
        audioUrl: '',
        clipStartOffsetSeconds: 0,
        captions: {
          uthmani: true,
          translation: { enabled: false, translationId: 85, language: 'en' },
        },
      },
      verses,
      fade: { inSeconds: 0.25, outSeconds: 0.25 },
    }) as never;

  it('flags a non-monotonic window', () => {
    const issues = validateTimeline(
      timelineWith([
        {
          verseKey: '1:1',
          ayahNumber: 1,
          startSeconds: 2,
          endSeconds: 1,
          uthmani: 'ق',
          translation: '',
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('non-monotonic window');
  });

  it('flags a gap between verse windows', () => {
    const issues = validateTimeline(
      timelineWith([
        {
          verseKey: '1:1',
          ayahNumber: 1,
          startSeconds: 0,
          endSeconds: 1,
          uthmani: 'ق',
          translation: '',
        },
        {
          verseKey: '1:2',
          ayahNumber: 2,
          startSeconds: 2,
          endSeconds: 3,
          uthmani: 'ق',
          translation: '',
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('gap between verse windows');
  });

  it('flags a word that falls outside its verse window', () => {
    const issues = validateTimeline(
      timelineWith([
        {
          verseKey: '1:1',
          ayahNumber: 1,
          startSeconds: 0,
          endSeconds: 1,
          uthmani: 'ق',
          translation: '',
          words: [{ index: 0, text: 'ق', startSeconds: 0, endSeconds: 2 }],
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('word outside verse window');
  });

  it('flags word granularity without any word data', () => {
    const issues = validateTimeline(
      timelineWith([
        {
          verseKey: '1:1',
          ayahNumber: 1,
          startSeconds: 0,
          endSeconds: 1,
          uthmani: 'ق',
          translation: '',
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('word granularity without words');
  });
});

describe('buildTimeline over recorded QF fixtures', () => {
  it('resolves word-level timings and builds a timeline for Al-Fatihah ayat 1-7', async () => {
    stubQfFetch();
    try {
      const timing = await resolveTiming({ reciterId: '7', surah: 1, verses: [1, 7] });
      expect(timing.sourceChain).toEqual(['qf-v4:chapter:word']);
      expect(timing.wordSegments).not.toBeNull();
      expect(timing.audioUrl).toContain('/api/proxy?url=');
      expect(timing.warnings).toEqual([]);

      const req: TimelineRequest = {
        range: { surah: 1, from: 1, to: 7 },
        reciterId: '7',
        captions: {
          uthmani: true,
          translation: { enabled: true, translationId: 85, language: 'en' },
        },
      };
      const timeline = await buildTimeline(req, timing);
      expect(timeline.version).toBe(1);
      expect(timeline.units).toEqual({ time: 'seconds' });
      // Characterisation (2026-11-18): the recorded QF fixture trips the
      // validator's word-window check, so the timeline downgrades to the
      // explicit `estimated` state. See docs/audit.md — finding A-2.
      expect(timeline.meta.granularity).toBe('estimated');
      expect(timeline.meta.sourceChain).toEqual(['qf-v4:chapter:word']);
      expect(timeline.meta.reciterId).toBe('7');
      expect(timeline.meta.surah).toBe(1);
      expect(timeline.meta.versesFrom).toBe(1);
      expect(timeline.meta.versesTo).toBe(7);
      expect(timeline.verses).toHaveLength(7);
      expect(timeline.verses.map((v) => v.ayahNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(timeline.verses[0]?.startSeconds).toBeCloseTo(0, 10);
      expect(timeline.verses[0]?.endSeconds).toBeCloseTo(6.09, 10);
      expect(timeline.fade).toEqual({ inSeconds: 0.25, outSeconds: 0.25 });
      expect(timeline.verses[0]?.words).not.toBeNull();
      expect(timeline.verses[0]?.words?.length).toBeGreaterThan(0);
    } finally {
      unstubQfFetch();
    }
  });

  it('keeps every verse text byte-for-byte', async () => {
    stubQfFetch({
      '/quran/verses/uthmani?chapter_number=1': QF_FIXTURES.uthmani['1'],
      '/quran/translations/': QF_FIXTURES.translations,
      '/quran/verses/uthmani': QF_FIXTURES.uthmani['1'],
    });
    try {
      const timeline = await buildTimeline(
        {
          range: { surah: 1, from: 1, to: 7 },
          reciterId: '7',
          captions: {
            uthmani: true,
            translation: { enabled: true, translationId: 85, language: 'en' },
          },
        },
        await resolveTiming({ reciterId: '7', surah: 1, verses: [1, 7] }),
      );
      for (const verse of timeline.verses) {
        const recorded = QF_FIXTURES.uthmani['1'].verses.find(
          (v) => v.verse_key === verse.verseKey,
        );
        expect(verse.uthmani).toBe(recorded?.text_uthmani);
      }
    } finally {
      unstubQfFetch();
    }
  });

  it('disables translations when the v4 translation rows carry no verse keys', async () => {
    stubQfFetch({
      '/quran/translations/': QF_FIXTURES.translations,
      '/quran/verses/uthmani?chapter_number=1': QF_FIXTURES.uthmani['1'],
      '/resources/chapter_reciters': QF_FIXTURES.reciters,
      '/chapter_recitations/': QF_FIXTURES.recitation,
    });
    try {
      const timeline = await buildTimeline(
        {
          range: { surah: 1, from: 1, to: 7 },
          reciterId: '7',
          captions: {
            uthmani: true,
            translation: { enabled: true, translationId: 85, language: 'en' },
          },
        },
        await resolveTiming({ reciterId: '7', surah: 1, verses: [1, 7] }),
      );
      expect(timeline.verses[0]?.translation).toBe('');
    } finally {
      unstubQfFetch();
    }
  });
});
