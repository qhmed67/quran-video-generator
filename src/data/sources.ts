import type {
  Mp3quranAyahTimingRow,
  Mp3quranReciter,
  QfVerseTiming,
  QuranAlignSegment,
  VerseRange,
} from './types';

const PROXY_BASE = '/api/proxy';
const QF_BASE = 'https://apis.quran.foundation/content/api/v4';

export function proxiedUrl(targetUrl: string): string {
  return `${PROXY_BASE}?url=${encodeURIComponent(targetUrl)}`;
}

async function proxiedFetch(targetUrl: string): Promise<Response> {
  return fetch(proxiedUrl(targetUrl));
}

async function proxiedJson<T>(targetUrl: string): Promise<T> {
  const res = await proxiedFetch(targetUrl);
  if (!res.ok) throw new Error(`proxy ${res.status} for ${targetUrl}`);
  return res.json() as Promise<T>;
}

export function mp3quranAudioUrl(folderUrl: string, surah: number): string {
  const base = folderUrl.endsWith('/') ? folderUrl : `${folderUrl}/`;
  return proxiedUrl(`${base}${String(surah).padStart(3, '0')}.mp3`);
}

export async function fetchMp3quranReciters(language = 'eng'): Promise<Mp3quranReciter[]> {
  const data = await proxiedJson<{ reciters: Mp3quranReciter[] }>(
    `https://mp3quran.net/api/v3/reciters?language=${language}`,
  );
  return data.reciters;
}

const mp3quranTimingCache = new Map<string, Map<string, { startMs: number; endMs: number }>>();

export async function fetchMp3quranAyahTiming(
  surah: number,
  readId: number,
): Promise<Map<string, { startMs: number; endMs: number }> | null> {
  const cacheKey = `${surah}:${readId}`;
  const cached = mp3quranTimingCache.get(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = await proxiedJson<Mp3quranAyahTimingRow[]>(
        `https://mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${readId}`,
      );
      const map = new Map<string, { startMs: number; endMs: number }>();
      for (const row of rows) {
        map.set(`${row.surah}:${row.ayah}`, {
          startMs: row.start_time,
          endMs: row.end_time,
        });
      }
      if (map.size > 0) {
        mp3quranTimingCache.set(cacheKey, map);
        return map;
      }
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  return null;
}

export async function fetchQfUthmani(
  range: VerseRange,
): Promise<{ verseKey: string; textUthmani: string }[]> {
  try {
    const params = new URLSearchParams({
      chapter_number: String(range.surah),
      chapter_verse_number_from: String(range.from),
      chapter_verse_number_to: String(range.to),
    });
    const data = await proxiedJson<{
      verses: { id: number; verse_key: string; text_uthmani: string }[];
    }>(`${QF_BASE}/quran/verses/uthmani?${params.toString()}`);
    return data.verses.map((v) => ({ verseKey: v.verse_key, textUthmani: v.text_uthmani }));
  } catch {
    const params = new URLSearchParams({ chapter_number: String(range.surah) });
    const res = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?${params.toString()}`);
    if (!res.ok) throw new Error('failed to fetch uthmani text');
    const data = (await res.json()) as {
      verses: { verse_key: string; text_uthmani: string }[];
    };
    return data.verses
      .filter((v) => {
        const ayah = Number(v.verse_key.split(':')[1]);
        return ayah >= range.from && ayah <= range.to;
      })
      .map((v) => ({ verseKey: v.verse_key, textUthmani: v.text_uthmani }));
  }
}

export async function fetchQfTranslation(
  range: VerseRange,
  translationId: number,
): Promise<{ verseKey: string; text: string }[]> {
  const params = new URLSearchParams({
    chapter_number: String(range.surah),
    chapter_verse_number_from: String(range.from),
    chapter_verse_number_to: String(range.to),
  });
  const data = await proxiedJson<{
    translations: { verse_key: string; text: string }[];
  }>(`${QF_BASE}/quran/translations/${translationId}?${params.toString()}`);
  return data.translations.map((t) => ({ verseKey: t.verse_key, text: t.text }));
}

export async function fetchQfAudioTiming(
  reciterId: number,
  range: VerseRange,
): Promise<{ granularity: 'word' | 'ayah'; perVerse: QfVerseTiming[] } | null> {
  try {
    const params = new URLSearchParams({
      chapter_number: String(range.surah),
      from: String(range.from),
      to: String(range.to),
      fields: 'segments',
    });
    const data = await proxiedJson<{
      audio_files: {
        verse_key: string;
        timestamp_from: number;
        timestamp_to: number;
        segments: number[][];
      }[];
    }>(`${QF_BASE}/audio/reciters/${reciterId}/timestamp?${params.toString()}`);
    const perVerse: QfVerseTiming[] = data.audio_files.map((a) => {
      let segments: [number, number, number, number][] | null = null;
      if (Array.isArray(a.segments) && a.segments.length > 0) {
        segments = a.segments.map((s) => {
          if (s.length === 3) {
            return [s[0], s[0] + 1, s[1], s[2]];
          }
          return [s[0], s[1], s[2], s[3]];
        });
      }
      return {
        verseKey: a.verse_key,
        startMs: a.timestamp_from,
        endMs: a.timestamp_to,
        segments,
      };
    });
    const hasAnySegments = perVerse.some((v) => v.segments !== null);
    return {
      granularity: hasAnySegments ? 'word' : 'ayah',
      perVerse,
    };
  } catch {
    return null;
  }
}

export async function loadQuranAlignSurah(
  reciterKey: string,
  surah: number,
): Promise<QuranAlignSegment[] | null> {
  try {
    const res = await fetch(`/timing/${reciterKey}/${String(surah).padStart(3, '0')}.json`);
    if (!res.ok) return null;
    return res.json() as Promise<QuranAlignSegment[]>;
  } catch {
    return null;
  }
}

export function expandRangedSegments(
  segments: [number, number, number, number][],
): [number, number, number, number][] {
  const perWord: [number, number, number, number][] = [];
  for (let i = 0; i < segments.length; i++) {
    const [from, to, startMs, endMs] = segments[i];
    const count = Math.max(1, to - from);
    const spanMs = endMs - startMs;
    for (let w = from; w < to; w++) {
      const local = (w - from) / count;
      const ws = startMs + spanMs * local;
      const we = startMs + spanMs * ((w - from + 1) / count);
      perWord.push([w, w + 1, Math.round(ws), Math.round(we)]);
    }
  }
  return perWord;
}

export function anchorQuranAlign(
  verseStartSeconds: number,
  verseEndSeconds: number,
  segmentsMs: [number, number, number, number][],
): [number, number, number, number][] {
  const windowSpan = verseEndSeconds - verseStartSeconds;
  const s0 = Math.min(...segmentsMs.map((s) => s[2]));
  const eN = Math.max(...segmentsMs.map((s) => s[3]));
  const segSpanSeconds = (eN - s0) / 1000;
  const offset =
    windowSpan > segSpanSeconds * 1.6 ? verseEndSeconds - eN / 1000 : verseStartSeconds;
  return segmentsMs.map(([w0, w1, s, e]) => [
    w0,
    w1,
    Math.max(verseStartSeconds, offset + s / 1000),
    Math.min(verseEndSeconds, offset + e / 1000),
  ]);
}