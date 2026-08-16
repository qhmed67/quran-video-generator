import type { TimingGranularity } from '../lib/types/timeline';

export interface RawWordSegmentSeconds {
  index: number;
  startSeconds: number;
  endSeconds: number;
}

export interface VerseRange {
  surah: number;
  from: number;
  to: number;
}

export interface ReciterCapability {
  reciterId: string;
  name: string;
  qfReciterId: number | null;
}

export interface QfChapterReciter {
  id: number;
  name: string;
  style?: { name?: string };
  qirat?: { name?: string };
}

export interface QfChapterTimestamp {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments: [number, number, number][] | null;
}

export interface QfChapterAudioFile {
  id: number;
  chapter_id: number;
  audio_url: string;
  format?: string;
  timestamps: QfChapterTimestamp[];
}

export interface VerseTimingSeconds {
  verseKey: string;
  startSeconds: number;
  endSeconds: number;
}

export interface TimingResolution {
  granularity: TimingGranularity;
  sourceChain: string[];
  perVerse: VerseTimingSeconds[];
  wordSegments: Record<string, RawWordSegmentSeconds[]> | null;
  audioUrl: string;
  clipStartOffsetSeconds: number;
  warnings: string[];
}

export interface TimelineRequest {
  range: VerseRange;
  reciterId: string;
  captions: {
    uthmani: boolean;
    translation: { enabled: boolean; translationId: number; language: string };
  };
}