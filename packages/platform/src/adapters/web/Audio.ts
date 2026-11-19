import { clampSeconds } from '@qvg/core';
import type { AudioPlayer, AudioPort } from '../../ports/AudioPort';

/**
 * Web audio port backed by `HTMLAudioElement` — a 1:1 move of the
 * recitation clip logic that lives in `src/audio/engine.ts` today
 * (metadata wait, seekable polling, clip-relative seeking, synthetic
 * "ended" at the clip end).
 */
export class BrowserAudioPort implements AudioPort {
  async prepareClip(
    url: string,
    startOffsetSeconds: number,
    endSeconds?: number,
  ): Promise<AudioPlayer> {
    const element = new Audio();
    element.preload = 'auto';
    element.src = url;
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

    const target = clampSeconds(startOffsetSeconds);
    if (target > 0) {
      await waitForSeekable(element, target);
    }

    // The stop point is clip-relative (seconds from the clip start), exactly
    // as the app computes it from the last verse's end — when the recitation
    // passes it we stop and fire "ended" ourselves.
    const endAt = endSeconds !== undefined && endSeconds > 0 ? endSeconds : null;
    const endedListeners = new Set<() => void>();
    if (endAt !== null) {
      element.addEventListener('timeupdate', () => {
        if (element.currentTime - target >= endAt) {
          element.pause();
          element.dispatchEvent(new Event('ended'));
        }
      });
    }
    element.addEventListener('ended', () => {
      endedListeners.forEach((l) => l());
    });

    return {
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
      seek: (offsetSeconds: number) => {
        const clamped = clampSeconds(offsetSeconds);
        const withinClip = endAt !== null ? Math.min(clamped, endAt) : clamped;
        element.currentTime = target + withinClip;
      },
      onEnded: (listener) => {
        endedListeners.add(listener);
        return () => {
          endedListeners.delete(listener);
        };
      },
      dispose: () => {
        endedListeners.clear();
        element.pause();
        element.removeAttribute('src');
        element.load();
      },
    };
  }
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
