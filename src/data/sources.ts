import type {
  QfChapterAudioFile,
  QfChapterReciter,
  VerseRange,
} from './types';

const PROXY_BASE = '/api/proxy';
const QF_BASE = (import.meta.env.VITE_QF_API_BASE as string | undefined) ?? 'https://apis.quran.foundation/content/api/v4';

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

export async function fetchQfChapterReciters(language = 'en'): Promise<QfChapterReciter[]> {
  const data = await proxiedJson<{ reciters: QfChapterReciter[] }>(
    `${QF_BASE}/resources/chapter_reciters?language=${language}`,
  );
  return data.reciters;
}

export async function fetchQfChapterAudio(
  reciterId: number,
  chapter: number,
  withSegments = true,
): Promise<QfChapterAudioFile | null> {
  try {
    const qs = withSegments ? '?segments=true' : '';
    const data = await proxiedJson<{ audio_file: QfChapterAudioFile }>(
      `${QF_BASE}/chapter_recitations/${reciterId}/${chapter}${qs}`,
    );
    if (!data.audio_file || !Array.isArray(data.audio_file.timestamps)) return null;
    return data.audio_file;
  } catch {
    return null;
  }
}

function inRange(verseKey: string, range: VerseRange): boolean {
  const ayah = Number(verseKey.split(':')[1]);
  return ayah >= range.from && ayah <= range.to;
}

export async function fetchQfUthmani(
  range: VerseRange,
): Promise<{ verseKey: string; textUthmani: string }[]> {
  try {
    const params = new URLSearchParams({ chapter_number: String(range.surah) });
    const data = await proxiedJson<{
      verses: { verse_key: string; text_uthmani: string }[];
    }>(`${QF_BASE}/quran/verses/uthmani?${params.toString()}`);
    if (data.verses.length === 0) throw new Error('empty qf verses');
    return data.verses
      .filter((v) => inRange(v.verse_key, range))
      .map((v) => ({ verseKey: v.verse_key, textUthmani: v.text_uthmani }));
  } catch {
    const params = new URLSearchParams({ chapter_number: String(range.surah) });
    const res = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?${params.toString()}`);
    if (!res.ok) throw new Error('failed to fetch uthmani text');
    const data = (await res.json()) as {
      verses: { verse_key: string; text_uthmani: string }[];
    };
    return data.verses
      .filter((v) => inRange(v.verse_key, range))
      .map((v) => ({ verseKey: v.verse_key, textUthmani: v.text_uthmani }));
  }
}

export async function fetchQfTranslation(
  range: VerseRange,
  translationId: number,
): Promise<{ verseKey: string; text: string }[]> {
  const params = new URLSearchParams({ chapter_number: String(range.surah) });
  const data = await proxiedJson<{
    translations: { verse_key: string; text: string }[];
  }>(`${QF_BASE}/quran/translations/${translationId}?${params.toString()}`);
  return data.translations
    .filter((t) => inRange(t.verse_key, range))
    .map((t) => ({ verseKey: t.verse_key, text: t.text }));
}

export function dedupeWordSegments(
  segments: [number, number, number][],
): [number, number, number][] {
  const byIndex = new Map<number, [number, number, number]>();
  for (const [wi, s, e] of segments) {
    const cur = byIndex.get(wi);
    if (!cur) {
      byIndex.set(wi, [wi, s, e]);
    } else {
      if (s < cur[1]) cur[1] = s;
      if (e > cur[2]) cur[2] = e;
    }
  }
  return Array.from(byIndex.values()).sort((a, b) => a[0] - b[0]);
}