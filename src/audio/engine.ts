import { clampSeconds } from '../lib/time';

export interface ClipPlayer {
  element: HTMLAudioElement;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  timeSeconds: () => number;
}

export async function playClip(
  audioUrl: string,
  clipStartOffsetSeconds: number,
): Promise<ClipPlayer> {
  const element = new Audio();
  element.preload = 'auto';
  element.src = audioUrl;
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('error', onError);
      reject(new Error('audio failed to load'));
    };
    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('error', onError);
  });
  element.currentTime = clampSeconds(clipStartOffsetSeconds);
  return {
    element,
    play: () => element.play(),
    pause: () => element.pause(),
    stop: () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    },
    timeSeconds: () => Math.max(0, element.currentTime - clipStartOffsetSeconds),
  };
}

export function seekTo(player: ClipPlayer, offsetSeconds: number): void {
  const el = player.element;
  el.currentTime = clampSeconds(offsetSeconds);
}