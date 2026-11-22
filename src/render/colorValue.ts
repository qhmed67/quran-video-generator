/**
 * Numeric and colour helpers shared by the inspector controls.
 *
 * Hex is what `<input type="color">` speaks and what the renderer stores;
 * the app's existing colour control works in HSL. Converting here keeps one
 * implementation instead of one per control.
 */

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether a string is a CSS hex colour the colour input accepts. */
export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

/** Expand `#abc` to `#aabbcc` and lowercase; returns `#000000` for garbage. */
export function normalizeHex(value: string): string {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return '#000000';
  const body = match[1].toLowerCase();
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return `#${full}`;
}

/** `#rrggbb` to HSL. H is degrees, S and L are percentages. */
export function hexToHsl(hex: string): HslColor {
  const clean = normalizeHex(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL to `#rrggbb`. */
export function hslToHex({ h, s, l }: HslColor): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toByte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toByte(r1)}${toByte(g1)}${toByte(b1)}`;
}

/**
 * Swap a colour's hue and saturation but keep its lightness relationship.
 * Used to seed a glow colour from a text colour without inventing a palette.
 */
export function withLightness(hex: string, lightness: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: lightness });
}
