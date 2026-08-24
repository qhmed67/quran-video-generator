import { encodeVideoToMp4 } from './webcodecs';
import type { ExportProgress } from './webcodecs';
import type { FrameRenderOptions } from '../render/renderFrame';

export interface ExportOptions {
  width: number;
  height: number;
  durationSeconds: number;
  fps?: number;
  audioUrl: string;
  clipStartOffsetSeconds: number;
  render: Omit<FrameRenderOptions, 'tSeconds'>;
  onProgress?: (p: ExportProgress) => void;
}

export interface ExportResult {
  blob: Blob;
  directMp4: boolean;
  hasAudio: boolean;
}

export async function exportClip(opts: ExportOptions): Promise<ExportResult> {
  const result = await encodeVideoToMp4({
    width: opts.width,
    height: opts.height,
    durationSeconds: opts.durationSeconds,
    fps: opts.fps,
    audioUrl: opts.audioUrl,
    clipStartOffsetSeconds: opts.clipStartOffsetSeconds,
    render: opts.render,
    onProgress: opts.onProgress,
  });
  return { blob: result.blob, directMp4: true, hasAudio: result.hasAudio };
}