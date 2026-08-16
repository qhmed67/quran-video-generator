import { msToSeconds } from '../lib/time';
import {
  dedupeWordSegments,
  fetchQfChapterAudio,
  fetchQfChapterReciters,
  proxiedUrl,
} from './sources';
import type {
  QfChapterReciter,
  RawWordSegmentSeconds,
  ReciterCapability,
  TimingResolution,
  VerseRange,
} from './types';

let reciterCache: QfChapterReciter[] | null = null;

export async function fetchReciterCatalog(): Promise<QfChapterReciter[]> {
  if (reciterCache === null) {
    reciterCache = await fetchQfChapterReciters();
  }
  return reciterCache;
}

export async function lookupReciter(reciterId: string): Promise<ReciterCapability> {
  const reciters = await fetchReciterCatalog();
  const rec = reciters.find((r) => String(r.id) === reciterId);
  return {
    reciterId,
    name: rec?.name ?? reciterId,
    qfReciterId: rec?.id ?? null,
  };
}

export async function resolveTiming(req: {
  reciterId: string;
  surah: number;
  verses: [number, number];
}): Promise<TimingResolution> {
  const capability = await lookupReciter(req.reciterId);
  const range: VerseRange = { surah: req.surah, from: req.verses[0], to: req.verses[1] };
  const warnings: string[] = [];

  if (capability.qfReciterId !== null) {
    const audio = await fetchQfChapterAudio(capability.qfReciterId, range.surah, true);
    if (audio) {
      const inRange = audio.timestamps
        .filter((t) => {
          const ayah = Number(t.verse_key.split(':')[1]);
          return ayah >= range.from && ayah <= range.to;
        })
        .sort((a, b) => Number(a.verse_key.split(':')[1]) - Number(b.verse_key.split(':')[1]));

      if (inRange.length > 0) {
        const clipStartMs = inRange[0].timestamp_from;
        const perVerse = inRange.map((t) => ({
          verseKey: t.verse_key,
          startSeconds: Math.max(0, msToSeconds(t.timestamp_from - clipStartMs)),
          endSeconds: Math.max(0, msToSeconds(t.timestamp_to - clipStartMs)),
        }));

        const wordSegments: Record<string, RawWordSegmentSeconds[]> = {};
        let hasSegments = false;
        for (const t of inRange) {
          if (!t.segments || t.segments.length === 0) continue;
          const deduped = dedupeWordSegments(t.segments);
          if (deduped.length === 0) continue;
          hasSegments = true;
          wordSegments[t.verse_key] = deduped.map(([wi, s, e]) => ({
            index: wi - 1,
            startSeconds: Math.max(0, msToSeconds(s - clipStartMs)),
            endSeconds: Math.max(0, msToSeconds(e - clipStartMs)),
          }));
        }

        return {
          granularity: hasSegments ? 'word' : 'ayah',
          sourceChain: hasSegments ? ['qf-v4:chapter:word'] : ['qf-v4:chapter:ayah'],
          perVerse,
          wordSegments: hasSegments ? wordSegments : null,
          audioUrl: proxiedUrl(audio.audio_url),
          clipStartOffsetSeconds: msToSeconds(clipStartMs),
          warnings,
        };
      }
      warnings.push('qf-v4 returned no timestamps for the selected range');
    } else {
      warnings.push('qf-v4 chapter audio unavailable for this surah');
    }
  }

  return {
    granularity: 'estimated',
    sourceChain: ['estimated:even-split'],
    perVerse: estimatePerVerse(range),
    wordSegments: null,
    audioUrl: '',
    clipStartOffsetSeconds: 0,
    warnings: [...warnings, 'no verified timing source; captions are estimated'],
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