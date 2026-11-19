/** Synthetic timeline shared by the benchmark and the visual check. */
import type { CaptionTimeline, VerseTimelineEntry, WordSegmentSeconds } from '@qvg/core';

const AYAT = [
  'ق ۝١ وَالْقُرْآنِ الْمَجِيدِ ۝٢ بَلْ عَجِبُوا أَن جَاءَهُم مُّنذِرٌ مِّنْهُمْ',
  'فَقَالَ الْكَافِرُونَ هَـٰذَا شَيْءٌ عَجِيبٌ ۝٣ أَإِذَا مِتْنَا وَكُنَّا تُرَابًا',
  'ذَٰلِكَ رَجْعٌ بَعِيدٌ ۝٤ قَدْ عَلِمْنَا مَا تَنقُصُ الْأَرْضُ مِنْهُمْ',
  'وَعِندَنَا كِتَابٌ حَفِيظٌ ۝٥ بَلْ كَذَّبُوا بِالْحَقِّ لَمَّا جَاءَهُمْ',
  'فَهُمْ فِي أَمْرٍ مَّرِيجٍ ۝٦ أَفَلَمْ يَنظُرُوا إِلَى السَّمَاءِ فَوْقَهُمْ',
];

export function buildSampleTimeline(): CaptionTimeline {
  const verses: VerseTimelineEntry[] = AYAT.map((text, i) => {
    const parts = text.split(/\s+/).filter(Boolean);
    let t = i * 7;
    const start = t;
    const words: WordSegmentSeconds[] = parts.map((w, wi) => {
      const dur = 0.42 + ((i * 13 + wi * 7) % 9) * 0.06;
      const seg = { index: wi, text: w, startSeconds: t, endSeconds: t + dur };
      t += dur;
      return seg;
    });
    return {
      verseKey: `50:${i + 1}`,
      ayahNumber: i + 1,
      startSeconds: start,
      endSeconds: words[words.length - 1].endSeconds + 0.4,
      uthmani: text,
      translation: 'This is a sample translation line used to check the caption frame.',
      words,
    };
  });
  return {
    version: 1,
    units: { time: 'seconds' },
    meta: {
      granularity: 'word',
      sourceChain: ['visual'],
      reciterId: '1',
      surah: 50,
      versesFrom: 1,
      versesTo: AYAT.length,
      audioUrl: 'sample.mp3',
      clipStartOffsetSeconds: 0,
      captions: {
        uthmani: true,
        translation: { enabled: true, translationId: 131, language: 'en' },
      },
    },
    verses,
    fade: { inSeconds: 0.4, outSeconds: 0.4 },
  };
}
