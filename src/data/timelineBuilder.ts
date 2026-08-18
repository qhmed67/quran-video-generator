import type { CaptionTimeline, WordSegmentSeconds } from '../lib/types/timeline';
import { fetchQfTranslation, fetchQfUthmani } from './sources';
import type { RawWordSegmentSeconds, TimelineRequest, TimingResolution } from './types';
import { countArabicLetters, stripAyahOrnaments, stripQuranicMarks } from '../render/layout';

export interface ValidationIssue {
  verseKey: string;
  message: string;
}

export function reconcileWords(
  verseText: string,
  raw: RawWordSegmentSeconds[],
): WordSegmentSeconds[] | null {
  const words = stripAyahOrnaments(stripQuranicMarks(verseText))
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && countArabicLetters(w) > 0);
  if (words.length === 0 || raw.length === 0) return null;
  const byIndex = new Map(raw.map((r) => [r.index, r]));
  const out: WordSegmentSeconds[] = [];
  let timed = 0;
  for (let i = 0; i < words.length; i++) {
    const seg = byIndex.get(i);
    if (seg && seg.endSeconds > seg.startSeconds) timed += 1;
    out.push({
      index: i,
      text: words[i],
      startSeconds: seg?.startSeconds ?? 0,
      endSeconds: seg?.endSeconds ?? 0,
    });
  }
  if (timed === 0) return null;
  return out;
}

export function validateTimeline(t: CaptionTimeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let wordVerseCount = 0;
  for (let i = 0; i < t.verses.length; i++) {
    const v = t.verses[i];
    if (!(v.endSeconds > v.startSeconds)) {
      issues.push({ verseKey: v.verseKey, message: 'non-monotonic window' });
    }
    if (i > 0 && Math.abs(t.verses[i - 1].endSeconds - v.startSeconds) > 0.001) {
      issues.push({ verseKey: v.verseKey, message: 'gap between verse windows' });
    }
    if (v.words) {
      wordVerseCount += 1;
      for (const w of v.words) {
        if (w.startSeconds < v.startSeconds || w.endSeconds > v.endSeconds) {
          issues.push({ verseKey: v.verseKey, message: 'word outside verse window' });
          break;
        }
      }
    }
  }
  if (t.meta.granularity === 'word' && wordVerseCount === 0) {
    issues.push({ verseKey: t.verses[0]?.verseKey ?? '', message: 'word granularity without words' });
  }
  return issues;
}

export async function buildTimeline(
  req: TimelineRequest,
  res: TimingResolution,
): Promise<CaptionTimeline> {
  const uthmani = await fetchQfUthmani(req.range);
  const textByKey = new Map(uthmani.map((u) => [u.verseKey, u.textUthmani]));

  let translations = new Map<string, string>();
  let translationEnabled = req.captions.translation.enabled;
  if (translationEnabled) {
    try {
      const rows = await fetchQfTranslation(req.range, req.captions.translation.translationId);
      if (rows.length === 0) {
        translationEnabled = false;
      } else {
        translations = new Map(rows.map((r) => [r.verseKey, r.text]));
      }
    } catch {
      translationEnabled = false;
    }
  }

  const verses = res.perVerse.map((v) => {
    const raw = res.wordSegments?.[v.verseKey] ?? null;
    const words =
      res.granularity === 'word' && raw && textByKey.has(v.verseKey)
        ? reconcileWords(textByKey.get(v.verseKey) ?? '', raw)
        : null;
    return {
      verseKey: v.verseKey,
      ayahNumber: Number(v.verseKey.split(':')[1]),
      startSeconds: v.startSeconds,
      endSeconds: v.endSeconds,
      uthmani: textByKey.get(v.verseKey) ?? '',
      translation: translations.get(v.verseKey) ?? '',
      words,
    };
  });

  const timeline: CaptionTimeline = {
    version: 1,
    units: { time: 'seconds' },
    meta: {
      granularity: res.granularity,
      sourceChain: res.sourceChain,
      reciterId: req.reciterId,
      surah: req.range.surah,
      versesFrom: req.range.from,
      versesTo: req.range.to,
      audioUrl: res.audioUrl,
      clipStartOffsetSeconds: res.clipStartOffsetSeconds,
      captions: {
        uthmani: req.captions.uthmani,
        translation: {
          enabled: translationEnabled,
          translationId: req.captions.translation.translationId,
          language: req.captions.translation.language,
        },
      },
    },
    verses,
    fade: { inSeconds: 0.25, outSeconds: 0.25 },
  };

  const issues = validateTimeline(timeline);
  const granularity = issues.length > 0 ? 'estimated' : res.granularity;
  if (issues.length > 0) {
    return { ...timeline, meta: { ...timeline.meta, granularity } };
  }
  return timeline;
}