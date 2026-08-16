import { clampSeconds } from '../lib/time';

export interface ClipPlayer {
  element: HTMLAudioElement;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  timeSeconds: () => number;
}

function waitForSeekable(
  element: HTMLAudioElement,
  targetSeconds: number,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const canSeek = () =>
      element.seekable.length > 0 &&
      element.seekable.start(0) <= targetSeconds &&
      element.seekable.end(element.seekable.length - 1) >= targetSeconds;

    if (canSeek()) {
      element.currentTime = targetSeconds;
      resolve();
      return;
    }
    const onProgress = () => {
      if (canSeek()) {
        element.removeEventListener('progress', onProgress);
        element.removeEventListener('canplay', onProgress);
        element.currentTime = targetSeconds;
        resolve();
      }
    };
    element.addEventListener('progress', onProgress);
    element.addEventListener('canplay', onProgress);
    setTimeout(() => {
      element.removeEventListener('progress', onProgress);
      element.removeEventListener('canplay', onProgress);
      element.currentTime = targetSeconds;
      resolve();
    }, timeoutMs);
  });
}

export async function playClip(
  audioUrl: string,
  clipStartOffsetSeconds: number,
  clipEndSeconds?: number,
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
  const target = clampSeconds(clipStartOffsetSeconds);
  if (target > 0) {
    await waitForSeekable(element, target);
  }
  const endAt = clipEndSeconds !== undefined && clipEndSeconds > 0 ? clipEndSeconds : null;
  if (endAt !== null) {
    element.addEventListener('timeupdate', () => {
      if (element.currentTime - target >= endAt) {
        element.pause();
        element.dispatchEvent(new Event('ended'));
      }
    });
  }
  return {
    element,
    play: async () => {
      if (endAt !== null && element.currentTime - target >= endAt - 0.05) {
        element.currentTime = target;
      }
      await element.play();
    },
    pause: () => element.pause(),
    stop: () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    },
    timeSeconds: () => Math.max(0, element.currentTime - target),
  };
}

export function seekTo(player: ClipPlayer, offsetSeconds: number): void {
  const el = player.element;
  el.currentTime = clampSeconds(offsetSeconds);
}