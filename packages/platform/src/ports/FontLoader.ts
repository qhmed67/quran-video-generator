import type { FontSet } from '@qvg/core';

/**
 * FontLoader port — resolving the fonts the renderer draws with.
 *
 * The web adapter uses the CSS Font Loading API (`document.fonts`); native
 * may preload faces into the WebView or report them as unavailable.
 * Implementations must **not** throw when a face fails to load — they
 * resolve with the fallback stacks still set and `uthmaniLoaded: false`,
 * exactly as the web app behaves today.
 */
export interface FontLoader {
  /** Resolve font stacks for rendering. Always settles, never rejects. */
  loadFonts(): Promise<FontSet>;
}
