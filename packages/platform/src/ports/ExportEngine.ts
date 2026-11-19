import type { CanvasLike } from '@qvg/core';

/**
 * ExportEngine — video export behind a port (ADR-003).
 *
 * One interface, several engines: the web app exports with WebCodecs (with
 * MediaRecorder / ffmpeg.wasm fallbacks); on Android/iOS a native
 * `QvgExport` Capacitor plugin encodes with the device's hardware encoder.
 * Native code never draws — the WebView always produces the frames through
 * the job's `renderFrame`, so both paths share the single renderer.
 *
 * Progress and control flow: the engine drives a deterministic loop — for
 * frame `i` of `totalFrames` it calls `job.renderFrame(i, target)` at
 * `t = i / fps` (never wall-clock), then encodes. It reports through
 * `onProgress`, honours `signal.aborted`, and when the encoder rejects a
 * configuration it falls back in a defined order (lower profile, then lower
 * bitrate) and reports what it actually used in {@link ExportResult.used}.
 * It never silently changes resolution or fps.
 */
export interface ExportEngine {
  /** Which engine this is — the plan's four engine ids. */
  readonly id: ExportEngineId;

  /** Probe what this device/browser can encode (codecs, max size, speed estimate). */
  isSupported(): Promise<ExportCapability>;

  /**
   * Run the export. Resolves with the encoded video ({@link ExportResult});
   * rejects with {@link ExportError} (code in {@link ExportErrorCode}) on
   * failure — `ExportError.CANCELLED` is a normal outcome, not a defect.
   */
  export(
    job: ExportJob,
    onProgress: (p: ExportProgress) => void,
    signal: AbortSignal,
  ): Promise<ExportResult>;
}

export type ExportEngineId = 'native' | 'webcodecs' | 'mediarecorder' | 'ffmpeg-wasm';

/**
 * Error codes shared verbatim by TS, Kotlin and Swift: the UI maps each
 * code to a sentence that says what happened and what to do next.
 */
export const ExportErrorCode = {
  /** No usable hardware/software encoder for the requested format. */
  ENCODER_UNAVAILABLE: 'ENCODER_UNAVAILABLE',
  /** The requested codec cannot be encoded here at all. */
  UNSUPPORTED_CODEC: 'UNSUPPORTED_CODEC',
  /** The device ran out of space writing temp frames or the output. */
  DISK_FULL: 'DISK_FULL',
  /** The recitation audio could not be decoded for the mux. */
  AUDIO_DECODE_FAILED: 'AUDIO_DECODE_FAILED',
  /** The caller cancelled; temp files are cleaned up. */
  CANCELLED: 'CANCELLED',
  /** Anything else; `message` carries the detail. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type ExportErrorCode = (typeof ExportErrorCode)[keyof typeof ExportErrorCode];

export interface ExportCapability {
  supported: boolean;
  /** Encodable video codecs in preference order, e.g. `['h264']`. */
  codecs: string[];
  /** Largest supported output size, when the engine knows one. */
  maxResolution: { width: number; height: number } | null;
  /** Heuristic encode speed in frames/second; 0 when unknown. */
  estimatedFps: number;
}

export interface ExportJobAudio {
  /** The recitation file already available to the engine (URL on web, cached path on native). */
  url: string;
  /** File-absolute start of the audio range, in ms. */
  startMs: number;
  /** File-absolute end of the audio range, in ms; defaults to `startMs + duration`. */
  endMs?: number;
}

export interface ExportJob {
  /** Stable id for this export session (native: the job id across the bridge). */
  id: string;
  /** Exact output size — the engine must never change it. */
  width: number;
  height: number;
  /** Fixed output frame rate. */
  fps: number;
  /** Total frames to encode (the engine loops `0..totalFrames - 1`). */
  totalFrames: number;
  codec: 'h264' | 'hevc';
  videoBitrateBps?: number;

  /**
   * Deterministic frame source. The engine calls it once per frame, in
   * order, with a `width` x `height` canvas: implement it by drawing the
   * frame for `t = index / fps`. It must be safe to call at any point and
   * must not consult the wall clock.
   */
  renderFrame(index: number, target: CanvasLike): void | Promise<void>;

  /** Recitation audio to trim and mux; omit for a silent video. */
  audio?: ExportJobAudio;
}

export type ExportProgress =
  | { phase: 'render'; frame: number; totalFrames: number }
  | { phase: 'encode'; frame: number; totalFrames: number }
  | { phase: 'mux' };

export interface ExportResult {
  /** The encoded video: a Blob in the browser, a file path on the device. */
  output: Blob | string;
  mimeType: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  /**
   * What was actually used. Differs from the job only when the engine fell
   * back (lower profile / lower bitrate); resolution and fps always match
   * the job.
   */
  used: { codec: string; profile?: string; bitrateBps?: number };
}

/**
 * A typed export failure; `code` is stable and shared with the native
 * implementations so the UI can map one table of sentences.
 */
export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}
