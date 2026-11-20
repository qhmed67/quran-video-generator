import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

/**
 * Recorded QF v4 payloads + a fetch stub so the data-layer tests can run the
 * real pipeline without touching the network. Never add a fixture here without
 * recording it live (see tests/fixtures/README.md).
 */

interface QfUthmaniResponse {
  verses: { verse_key: string; text_uthmani: string }[];
}

interface QfRecitersResponse {
  reciters: unknown[];
}

interface QfChapterRecitationResponse {
  audio_file: { timestamps: unknown[] };
}

interface QfTranslationResponse {
  translations: unknown[];
}

function readJson<T>(relativePath: string): T {
  const raw = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return JSON.parse(raw) as T;
}

export const QF_FIXTURES = {
  reciters: readJson<QfRecitersResponse>('../fixtures/qf/chapter-reciters.en.json'),
  recitation: readJson<QfChapterRecitationResponse>('../fixtures/qf/chapter-recitation-7-1.json'),
  uthmani: {
    '1': readJson<QfUthmaniResponse>('../fixtures/qf/uthmani-1.json'),
    '108': readJson<QfUthmaniResponse>('../fixtures/qf/uthmani-108.json'),
    '112': readJson<QfUthmaniResponse>('../fixtures/qf/uthmani-112.json'),
    '114': readJson<QfUthmaniResponse>('../fixtures/qf/uthmani-114.json'),
  } as Record<string, QfUthmaniResponse>,
  translations: readJson<QfTranslationResponse>('../fixtures/qf/translations-85-1.json'),
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function stubQfFetch(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const routes: [string, unknown][] = [
    ...Object.entries(overrides).map(([needle, body]) => [needle, body] as [string, unknown]),
    ['/resources/chapter_reciters', QF_FIXTURES.reciters],
    ['/chapter_recitations/', QF_FIXTURES.recitation],
    ['/quran/verses/uthmani', QF_FIXTURES.uthmani['1']],
    ['/quran/translations/', QF_FIXTURES.translations],
  ];
  const stub = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = raw.startsWith('/api/proxy')
      ? decodeURIComponent(raw.split('url=')[1] ?? raw)
      : raw;
    const route = routes.find(([needle]) => url.includes(needle));
    if (!route) return jsonResponse({}, 404);
    return jsonResponse(route[1]);
  });
  vi.stubGlobal('fetch', stub);
  return stub;
}

export function unstubQfFetch(): void {
  vi.unstubAllGlobals();
}
