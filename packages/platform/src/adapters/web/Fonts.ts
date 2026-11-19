import type { FontSet } from '@qvg/core';
import type { FontLoader } from '../../ports/FontLoader';

const KFGQPC_FAMILY = "'KFGQPC HAFS Uthmanic Script'";
const UTHMANI_FONT = `${KFGQPC_FAMILY}, 'Scheherazade New', 'me_quran', 'Noto Naskh Arabic', serif`;
const TRANSLATION_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Web font loader — a 1:1 move of `loadFonts` from `src/render/fonts.ts`.
 * Tries the CSS Font Loading API with a 3 s budget, then reports whether
 * the primary Uthmani face actually loaded. Never throws: on any failure
 * it resolves with the fallback stacks and `uthmaniLoaded: false`, which
 * is exactly the app's current behavior.
 */
export class BrowserFontLoader implements FontLoader {
  async loadFonts(): Promise<FontSet> {
    let uthmaniLoaded = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
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
}
