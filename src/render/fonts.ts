export interface FontSet {
  uthmani: string;
  translation: string;
  uthmaniLoaded: boolean;
}

const KFGQPC_FAMILY = "'KFGQPC HAFS Uthmanic Script'";
const UTHMANI_FONT =
  `${KFGQPC_FAMILY}, 'Scheherazade New', 'me_quran', 'Noto Naskh Arabic', serif`;
const TRANSLATION_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export async function loadFonts(): Promise<FontSet> {
  let uthmaniLoaded = false;
  if ('fonts' in document) {
    try {
      const spec = `400 100px ${KFGQPC_FAMILY}`;
      await Promise.race([
        document.fonts.load(spec),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      uthmaniLoaded = document.fonts.check(spec);
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      void 0;
    }
  }
  return { uthmani: UTHMANI_FONT, translation: TRANSLATION_FONT, uthmaniLoaded };
}