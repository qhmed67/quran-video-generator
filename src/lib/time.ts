const S_PER_MS = 0.001;

export function msToSeconds(ms: number): number {
  return ms * S_PER_MS;
}

export function secondsToMs(s: number): number {
  return s * 1000;
}

export type WindowCompare = -1 | 0 | 1;

export function compareToWindow(
  positionSeconds: number,
  startSeconds: number,
  endSeconds: number,
): WindowCompare {
  if (positionSeconds < startSeconds) return -1;
  if (positionSeconds >= endSeconds) return 1;
  return 0;
}

export function clampSeconds(v: number): number {
  return Math.max(0, v);
}