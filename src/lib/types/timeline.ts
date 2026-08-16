export type TimingGranularity = 'word' | 'ayah' | 'estimated';

export interface WordSegmentSeconds {
  index: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface VerseTimelineEntry {
  verseKey: string;
  ayahNumber: number;
  startSeconds: number;
  endSeconds: number;
  uthmani: string;
  translation: string;
  words: WordSegmentSeconds[] | null;
}

export interface CaptionTimeline {
  version: 1;
  units: { time: 'seconds' };
  meta: {
    granularity: TimingGranularity;
    sourceChain: string[];
    reciterId: string;
    surah: number;
    versesFrom: number;
    versesTo: number;
    audioUrl: string;
    clipStartOffsetSeconds: number;
    captions: {
      uthmani: boolean;
      translation: { enabled: boolean; translationId: number; language: string };
    };
  };
  verses: VerseTimelineEntry[];
  fade: { inSeconds: number; outSeconds: number };
}