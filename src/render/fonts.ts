export interface FontSet {
  uthmani: string;
  translation: string;
}

const UTHMANI_FONT =
  "'KFGQPC HAFS Uthmanic Script', 'me_quran', 'Scheherazade New', serif";
const TRANSLATION_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export async function loadFonts(): Promise<FontSet> {
  if ('fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      void 0;
    }
  }
  return { uthmani: UTHMANI_FONT, translation: TRANSLATION_FONT };
}