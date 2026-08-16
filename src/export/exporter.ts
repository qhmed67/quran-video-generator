import { capturePass } from './capture';
import type { CaptureResult } from './capture';
import { transcodeWebmToMp4 } from './transcode';
import type { TranscodeProgress } from './transcode';

export interface ExportOptions {
  canvas: HTMLCanvasElement;
  audioEl: HTMLAudioElement | null;
  durationSeconds: number;
  fps?: number;
  onCaptureProgress?: (doneSeconds: number) => void;
  onTranscodeProgress?: (p: TranscodeProgress) => void;
}

export interface ExportResult {
  blob: Blob;
  directMp4: boolean;
}

export async function exportClip(opts: ExportOptions): Promise<ExportResult> {
  const fps = opts.fps ?? 30;
  const capture: CaptureResult = await capturePass(
    opts.canvas,
    opts.audioEl,
    opts.durationSeconds,
    fps,
  );
  if (capture.isMp4) {
    return { blob: capture.blob, directMp4: true };
  }
  const blob = await transcodeWebmToMp4(capture.blob, {
    onProgress: opts.onTranscodeProgress,
  });
  return { blob, directMp4: false };
}