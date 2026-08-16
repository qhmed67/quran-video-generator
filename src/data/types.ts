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
  mp3quranReadId: number | null;
  mp3quranFolderUrl: string | null;
  quranAlignReciterKey: string | null;
}

export interface QfVerseTiming {
  verseKey: string;
  startMs: number;
  endMs: number;
  segments: [number, number, number, number][] | null;
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

export interface Mp3quranMoshaf {
  id: number;
  name: string;
  server: string;
  surah_total: number;
  moshaf_type: number;
  surah_list: string;
}

export interface Mp3quranReciter {
  id: number;
  name: string;
  letter: string;
  moshaf: Mp3quranMoshaf[];
}

export interface Mp3quranAyahTimingRow {
  surah: number;
  ayah: number;
  start_time: number;
  end_time: number;
}

export interface QuranAlignSegment {
  surah: number;
  ayah: number;
  segments: [number, number, number, number][];
}

export interface TimelineRequest {
  range: VerseRange;
  reciterId: string;
  captions: {
    uthmani: boolean;
    translation: { enabled: boolean; translationId: number; language: string };
  };
}