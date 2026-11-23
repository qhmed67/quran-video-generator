export interface FontSet {
  uthmani: string;
  translation: string;
  uthmaniLoaded: boolean;
}

const KFGQPC_FAMILY = "'KFGQPC HAFS Uthmanic Script'";
const UTHMANI_FONT = `${KFGQPC_FAMILY}, 'Scheherazade New', 'me_quran', 'Noto Naskh Arabic', serif`;
const TRANSLATION_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const FONT_TIMEOUT_MS = 3000;

/**
 * Whether the Uthmani face itself has finished loading.
 *
 * `document.fonts.status` is global: it reports `loading` while *any* face
 * (IBM Plex, for instance) is in flight, so it must not gate this check.
 */
function uthmaniReady(spec: string): boolean {
  const faces = [...document.fonts].filter((face) => face.family.includes('KFGQPC'));
  if (faces.some((face) => face.status === 'loading')) return false;
  return document.fonts.check(spec);
}

/**
 * Load the Uthmani face and report whether it is usable.
 *
 * `document.fonts.load()` resolves as soon as the face *starts* loading, so
 * checking immediately after it can still see `unloaded` — and on a slow or
 * throttled first load that made the stage fall back to a serif for the whole
 * session. The face is polled until it reports `loaded`, then the real check
 * decides. Timers are cleared so an abandoned wait cannot keep firing.
 */
export async function loadFonts(): Promise<FontSet> {
  let uthmaniLoaded = false;
  if ('fonts' in document) {
    const spec = `400 100px ${KFGQPC_FAMILY}`;

    // Warm the face. `load()` can settle before the face is `loaded`, so the
    // result is not trusted on its own.
    const warm = (): Promise<void> =>
      document.fonts.load(spec).then(
        () => undefined,
        () => undefined,
      );

    await new Promise<void>((resolve) => {
      if (uthmaniReady(spec)) {
        resolve();
        return;
      }

      let settled = false;
      let timer = 0;
      const onDone = () => {
        if (uthmaniReady(spec)) finish();
        else void warm();
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(timer);
        window.clearTimeout(deadline);
        document.fonts.removeEventListener('loadingdone', onDone);
        resolve();
      };
      const deadline = window.setTimeout(finish, FONT_TIMEOUT_MS);
      document.fonts.addEventListener('loadingdone', onDone);
      // A face that is neither loaded nor loading will never fire loadingdone
      // (nothing referenced it yet), so ask again on a slow tick as a backstop.
      timer = window.setInterval(() => {
        if (uthmaniReady(spec)) finish();
        else void warm();
      }, 100);
      void warm();
    });

    uthmaniLoaded = uthmaniReady(spec);
  }
  return { uthmani: UTHMANI_FONT, translation: TRANSLATION_FONT, uthmaniLoaded };
}
