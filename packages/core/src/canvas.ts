/**
 * The 2D draw context of a {@link CanvasLike}. `CanvasRenderingContext2D`
 * (main-thread `HTMLCanvasElement`) and `OffscreenCanvasRenderingContext2D`
 * share this union; everything the renderer uses is inherited by both from
 * the common rendering base.
 */
export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Structural view of a canvas surface the renderer can draw onto.
 *
 * Both `HTMLCanvasElement` and `OffscreenCanvas` satisfy this interface, so
 * `render` never needs to know — or test — which one it received. The backing
 * store size (`width`/`height`) is in physical pixels.
 */
export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): Canvas2DContext | null;
}
