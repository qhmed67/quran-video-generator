export interface GradientPreset {
  id: string;
  label: string;
  colors: [string, string, string];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'forest', label: 'Deep Forest', colors: ['#0b2e26', '#14532d', '#0a0f1e'] },
  { id: 'dusk', label: 'Desert Dusk', colors: ['#1e1b4b', '#7c2d12', '#0f172a'] },
  { id: 'ocean', label: 'Ocean Night', colors: ['#082f49', '#134e4a', '#020617'] },
];

/**
 * `width`/`height` are the logical frame size. They differ from the canvas
 * backing size when the preview rasterises at a smaller resolution, because
 * the caller draws through a scale transform.
 */
export function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  preset: GradientPreset,
  width = ctx.canvas.width,
  height = ctx.canvas.height,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, preset.colors[0]);
  grad.addColorStop(0.55, preset.colors[1]);
  grad.addColorStop(1, preset.colors[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

export type BgImage = HTMLImageElement | HTMLCanvasElement | null;

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const ir = img.width / img.height;
  const cr = width / height;
  let sw: number;
  let sh: number;
  if (ir > cr) {
    sh = img.height;
    sw = img.height * cr;
  } else {
    sw = img.width;
    sh = img.width / cr;
  }
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  preset: GradientPreset,
  img: BgImage,
  width = ctx.canvas.width,
  height = ctx.canvas.height,
): void {
  if (img && img.width > 0 && img.height > 0) {
    drawImageCover(ctx, img, width, height);
  } else {
    drawGradientBackground(ctx, preset, width, height);
  }
}
