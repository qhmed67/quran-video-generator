/**
 * Resolved font stacks for one rendered frame.
 *
 * The strings are canvas `font-family` lists, not CSS rules; the renderer
 * only ever passes them to `ctx.font`. `uthmaniLoaded` tells the caller that
 * the primary Uthmani face is actually available — when it is `false` the
 * stacks fall back to system fonts and metrics will differ.
 */
export interface FontSet {
  uthmani: string;
  translation: string;
  uthmaniLoaded: boolean;
}
