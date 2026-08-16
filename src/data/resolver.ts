import { msToSeconds } from '../lib/time';
import {
  anchorQuranAlign,
  expandRangedSegments,
  fetchMp3quranAyahTiming,
  fetchMp3quranReciters,
  fetchQfAudioTiming,
  loadQuranAlignSurah,
  mp3quranAudioUrl,
} from './sources';
import type {
  Mp3quranReciter,
  RawWordSegmentSeconds,
  ReciterCapability,
  TimingResolution,
  VerseRange,
} from './types';

const QF_RECITER_IDS: Record<string, number> = {};
const QURAN_ALIGN_FILES: Record<string, string> = {};

let reciterCache: Mp3quranReciter[] | null = null;

export async function fetchReciterCatalog(): Promise<Mp3quranReciter[]> {
  if (reciterCache === null) {
    reciterCache = await fetchMp3quranReciters();
  }
  return reciterCache;
}

export async function lookupReciter(reciterId: string): Promise<ReciterCapability> {
  const reciters = await fetchReciterCatalog();
  const rec = reciters.find((r) => String(r.id) === reciterId);
  const moshaf = rec?.moshaf[0] ?? null;
  return {
    reciterId,
    name: rec?.name ?? reciterId,
    qfReciterId: QF_RECITER_IDS[reciterId] ?? null,
    mp3quranReadId: moshaf?.id ?? null,
    mp3quranFolderUrl: moshaf?.server ?? null,
    quranAlignReciterKey: QURAN_ALIGN_FILES[reciterId] ?? null,
  };
}

interface ClipVerseWindow {
  verseKey: string;
  startSeconds: number;
  endSeconds: number;
}

function toClipRelative(
  perVerse: { verseKey: string; startSeconds: number; endSeconds: number }[],
  clipStartMs: number,
): ClipVerseWindow[] {
  const clipStart = msToSeconds(clipStartMs);
  return perVerse.map((v) => ({
    verseKey: v.verseKey,
    startSeconds: Math.max(0, v.startSeconds - clipStart),
    endSeconds: Math.max(0, v.endSeconds - clipStart),
  }));
}

export async function resolveTiming(req: {
  reciterId: string;
  surah: number;
  verses: [number, number];
}): Promise<TimingResolution> {
  const capability = await lookupReciter(req.reciterId);
  const range: VerseRange = { surah: req.surah, from: req.verses[0], to: req.verses[1] };
  const warnings: string[] = [];

  const qf = capability.qfReciterId
    ? await fetchQfAudioTiming(capability.qfReciterId, range)
    : null;
  if (qf) {
    const clipStartMs = qf.perVerse[0]?.startMs ?? 0;
    const perVerse = toClipRelative(
      qf.perVerse.map((v) => ({
        verseKey: v.verseKey,
        startSeconds: msToSeconds(v.startMs),
        endSeconds: msToSeconds(v.endMs),
      })),
      clipStartMs,
    );
    if (qf.granularity === 'word') {
      const wordSegments: Record<string, RawWordSegmentSeconds[]> = {};
      for (const v of qf.perVerse) {
        if (!v.segments) continue;
        const segmentsMs = expandRangedSegments(v.segments);
        if (segmentsMs.length === 0) continue;
        wordSegments[v.verseKey] = segmentsMs.map(([w0, , s, e]) => ({
          index: w0,
          startSeconds: Math.max(0, msToSeconds(s - clipStartMs)),
          endSeconds: Math.max(0, msToSeconds(e - clipStartMs)),
        }));
      }
      return {
        granularity: 'word',
        sourceChain: ['qf-v4:word'],
        perVerse,
        wordSegments,
        audioUrl: mp3quranAudioUrl(capability.mp3quranFolderUrl ?? '', req.surah),
        clipStartOffsetSeconds: msToSeconds(clipStartMs),
        warnings,
      };
    }
    warnings.push('qf-v4 verse-level only; continuing to stronger ayah source');
  }

  const qa = capability.quranAlignReciterKey
    ? await loadQuranAlignSurah(capability.quranAlignReciterKey, req.surah)
    : null;

  const mp = capability.mp3quranReadId
    ? await fetchMp3quranAyahTiming(req.surah, capability.mp3quranReadId)
    : null;

  const entries = mp
    ? Array.from(mp.entries())
        .filter(([key]) => {
          const [, ayah] = key.split(':').map(Number);
          return ayah >= range.from && ayah <= range.to;
        })
        .sort((a, b) => a[1].startMs - b[1].startMs)
    : [];

  const clipStartMs = entries[0]?.[1].startMs ?? 0;
  const perVerse = entries.map(([key, t]) => ({
    verseKey: key,
    startSeconds: Math.max(0, msToSeconds(t.startMs - clipStartMs)),
    endSeconds: Math.max(0, msToSeconds(t.endMs - clipStartMs)),
  }));

  if (perVerse.length === 0) {
    return {
      granularity: 'estimated',
      sourceChain: ['estimated:even-split'],
      perVerse: estimatePerVerse(range),
      wordSegments: null,
      audioUrl: mp3quranAudioUrl(capability.mp3quranFolderUrl ?? '', req.surah),
      clipStartOffsetSeconds: 0,
      warnings: [...warnings, 'no verified timing source; captions are estimated'],
    };
  }

  if (qa && mp) {
    const wordSegments: Record<string, RawWordSegmentSeconds[]> = {};
    for (const entry of qa) {
      const key = `${entry.surah}:${entry.ayah}`;
      if (!(entry.ayah >= range.from && entry.ayah <= range.to)) continue;
      const win = perVerse.find((p) => p.verseKey === key);
      if (!win) continue;
      const anchored = anchorQuranAlign(win.startSeconds, win.endSeconds, entry.segments);
      const segmentsSeconds = expandRangedSegments(anchored);
      if (segmentsSeconds.length === 0) continue;
      wordSegments[key] = segmentsSeconds.map(([w0, , s, e]) => ({
        index: w0,
        startSeconds: s,
        endSeconds: e,
      }));
    }
    if (Object.keys(wordSegments).length > 0) {
      return {
        granularity: 'word',
        sourceChain: ['quran-align:word', 'mp3quran:ayah'],
        perVerse,
        wordSegments,
        audioUrl: mp3quranAudioUrl(capability.mp3quranFolderUrl ?? '', req.surah),
        clipStartOffsetSeconds: msToSeconds(clipStartMs),
        warnings,
      };
    }
  }

  return {
    granularity: 'ayah',
    sourceChain: ['mp3quran:ayah'],
    perVerse,
    wordSegments: null,
    audioUrl: mp3quranAudioUrl(capability.mp3quranFolderUrl ?? '', req.surah),
    clipStartOffsetSeconds: msToSeconds(clipStartMs),
    warnings,
  };
}

function estimatePerVerse(range: VerseRange): {
  verseKey: string;
  startSeconds: number;
  endSeconds: number;
}[] {
  const count = range.to - range.from + 1;
  const perVerseSeconds = 4;
  return Array.from({ length: count }, (_, i) => ({
    verseKey: `${range.surah}:${range.from + i}`,
    startSeconds: i * perVerseSeconds,
    endSeconds: (i + 1) * perVerseSeconds,
  }));
}