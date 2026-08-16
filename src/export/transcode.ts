import { FFmpeg } from '@ffmpeg.wasm/main';
import type { FFmpegCoreConstructor } from '@ffmpeg.wasm/core-mt';

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true;
}

export interface TranscodeProgress {
  seconds: number;
  ratio: number;
}

export interface TranscodeOptions {
  onProgress?: (p: TranscodeProgress) => void;
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

export async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise === null) {
    ffmpegPromise = createFfmpegInstance();
  }
  return ffmpegPromise;
}

async function loadCoreConstructor(base: string): Promise<FFmpegCoreConstructor> {
  const res = await fetch(`${base}core.js`);
  const text = await res.text();
  const fn = new Function(
    'module',
    'exports',
    'require',
    `${text}\n;return module.exports;`,
  );
  const factory = fn({}, {}, () => {
    throw new Error('node require is unavailable in the browser');
  });
  return factory as FFmpegCoreConstructor;
}

async function createFfmpegInstance(): Promise<FFmpeg> {
  const mt = isCrossOriginIsolated();
  const base = mt ? '/ffmpeg/' : '/ffmpeg-st/';
  const core = await loadCoreConstructor(base);
  const instance = await FFmpeg.create({
    core,
    coreOptions: {
      wasmPath: `${base}core.wasm`,
      workerPath: mt ? `${base}core.worker.js` : undefined,
    },
    log: false,
  });
  return instance;
}

export async function transcodeWebmToMp4(webm: Blob, opts: TranscodeOptions = {}): Promise<Blob> {
  const ffmpeg = await loadFfmpeg();

  if (opts.onProgress) {
    let currentSeconds = 0;
    let lastUpdate = 0;
    ffmpeg.setLogger((level, ...msg) => {
      if (level !== 'info') return;
      const line = msg.join(' ');
      const m = line.match(/out_time_us=(\d+)/);
      if (m) {
        currentSeconds = Number(m[1]) / 1_000_000;
      } else if (line.includes('progress=end')) {
        currentSeconds = Number.MAX_SAFE_INTEGER;
      }
      const now = Date.now();
      if (now - lastUpdate > 250) {
        lastUpdate = now;
        opts.onProgress?.({ seconds: currentSeconds, ratio: currentSeconds });
      }
    });
  }

  ffmpeg.fs.writeFile('in.webm', new Uint8Array(await webm.arrayBuffer()));
  const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency ?? 1));
  await ffmpeg.run(
    '-i', 'in.webm',
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.0',
    '-threads', String(threads),
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '44100',
    '-ac', '2',
    'out.mp4',
  );
  const data = ffmpeg.fs.readFile('out.mp4');
  ffmpeg.fs.unlink('in.webm');
  ffmpeg.fs.unlink('out.mp4');
  return new Blob([data.slice()], { type: 'video/mp4' });
}