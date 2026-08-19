import * as Mp4Muxer from 'mp4-muxer';
import { renderFrame } from '../render/renderFrame';
import type { FrameRenderOptions } from '../render/renderFrame';

export interface ExportProgress {
  phase: 'render' | 'audio' | 'finalize';
  ratio: number;
}

export interface EncodeVideoOptions {
  width: number;
  height: number;
  durationSeconds: number;
  fps?: number;
  audioUrl: string;
  clipStartOffsetSeconds: number;
  render: Omit<FrameRenderOptions, 'tSeconds'>;
  onProgress?: (p: ExportProgress) => void;
}

export interface EncodeResult {
  blob: Blob;
  hasAudio: boolean;
}

const VIDEO_BITRATE = 8_000_000;
const AUDIO_BITRATE = 128_000;
const AUDIO_CHANNELS = 2;
const AUDIO_CHUNK_FRAMES = 1024;

type MuxerVideoCodec = 'avc' | 'vp9' | 'av1';
type MuxerAudioCodec = 'aac' | 'opus';

interface VideoCodecChoice {
  config: VideoEncoderConfig;
  muxerCodec: MuxerVideoCodec;
}

interface AudioCodecChoice {
  config: AudioEncoderConfig;
  muxerCodec: MuxerAudioCodec;
  sampleRate: number;
}

async function pickVideoCodec(width: number, height: number, fps: number): Promise<VideoCodecChoice> {
  const base = { width, height, bitrate: VIDEO_BITRATE, framerate: fps };
  const candidates: VideoCodecChoice[] = [
    { config: { codec: 'avc1.640033', ...base, hardwareAcceleration: 'prefer-hardware' }, muxerCodec: 'avc' },
    { config: { codec: 'avc1.640033', ...base }, muxerCodec: 'avc' },
    { config: { codec: 'avc1.640033', ...base, hardwareAcceleration: 'prefer-software' }, muxerCodec: 'avc' },
    { config: { codec: 'vp09.00.10.08', ...base }, muxerCodec: 'vp9' },
    { config: { codec: 'av01.0.05M.08', ...base }, muxerCodec: 'av1' },
  ];
  for (const candidate of candidates) {
    try {
      const r = await VideoEncoder.isConfigSupported(candidate.config);
      if (r.supported) return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    'no supported video codec in this browser (tried avc1.640033, vp9, av1)',
  );
}

async function pickAudioCodec(): Promise<AudioCodecChoice | null> {
  const candidates: AudioCodecChoice[] = [
    {
      config: { codec: 'mp4a.40.2', sampleRate: 44_100, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE },
      muxerCodec: 'aac',
      sampleRate: 44_100,
    },
    {
      config: { codec: 'opus', sampleRate: 48_000, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE },
      muxerCodec: 'opus',
      sampleRate: 48_000,
    },
  ];
  for (const candidate of candidates) {
    try {
      const r = await AudioEncoder.isConfigSupported(candidate.config);
      if (r.supported) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAudioMagic(buf: Uint8Array): boolean {
  if (buf.byteLength < 4) return false;
  // ID3 (MP3), MPEG frame sync (MP3/AAC ADTS), RIFF (WAV), fLaC, OggS (opus/vorbis)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) return true;
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;
  return false;
}

function magicPreview(buf: Uint8Array): string {
  return Array.from(buf.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

interface MpegFrameInfo {
  bitrateKbps: number;
  sampleRate: number;
  frameLengthBytes: number;
}

function parseMpegFrame(bytes: Uint8Array, offset: number): MpegFrameInfo | null {
  if (offset + 4 > bytes.byteLength) return null;
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const versionBits = (b1 >> 3) & 0x03; // 0=v2.5, 2=v2, 3=v1 (1 reserved)
  const layerBits = (b1 >> 1) & 0x03; // 1=L3, 2=L2, 3=L1 (0 reserved)
  if (versionBits === 1 || layerBits === 0) return null;
  const b2 = bytes[offset + 2];
  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const v1 = versionBits === 3;
  const v2 = versionBits === 2;
  const l1 = layerBits === 3;
  const kbpsTable = v1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const bitrateKbps = kbpsTable[bitrateIndex];
  if (bitrateKbps === 0) return null;
  const sampleRate = v1
    ? [44_100, 48_000, 32_000][sampleRateIndex]
    : v2
      ? [22_050, 24_000, 16_000][sampleRateIndex]
      : [11_025, 12_000, 8_000][sampleRateIndex];
  const padding = (b2 >> 1) & 0x01;
  const frameLengthBytes = l1
    ? Math.floor(((12 * bitrateKbps * 1000) / sampleRate + padding) * 4)
    : Math.floor((144 * bitrateKbps * 1000) / sampleRate + padding);
  if (frameLengthBytes < 24) return null;
  return { bitrateKbps, sampleRate, frameLengthBytes };
}

function findFrameSync(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 4 <= bytes.byteLength; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      const info = parseMpegFrame(bytes, i);
      if (info) return i;
    }
  }
  return -1;
}

/**
 * Trims a range-sliced MPEG byte stream down to complete frames. Quran
 * recitation files embed ID3 tags at every verse boundary inside the audio
 * stream, so the walk re-syncs past tags and any short gaps between frames.
 */
function trimToCompleteFrames(bytes: Uint8Array, start: number): Uint8Array {
  let cursor = start;
  let lastEnd = start;
  while (cursor + 4 <= bytes.byteLength) {
    if (bytes[cursor] === 0x49 && bytes[cursor + 1] === 0x44 && bytes[cursor + 2] === 0x33) {
      cursor = skipId3(bytes.subarray(cursor)) + cursor;
      continue;
    }
    const info = parseMpegFrame(bytes, cursor);
    if (!info) {
      const next = findFrameSync(bytes, cursor + 1);
      if (next === -1) break;
      cursor = next;
      continue;
    }
    lastEnd = cursor + info.frameLengthBytes;
    cursor = lastEnd;
  }
  return bytes.slice(start, Math.max(lastEnd, start + 24));
}

/**
 * Fetches the clip's audio bytes. Vite's dev middleware can briefly serve HTML
 * error pages (e.g. during one-time dependency re-optimization right after the
 * dev server starts); the response is validated and fetched once more in that
 * case so a transient non-audio body cannot silently break the export.
 */
async function fetchAudioBytes(url: string): Promise<Uint8Array> {
  const attempt = async (): Promise<{ res: Response; buf: Uint8Array }> => {
    const res = await fetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { res, buf };
  };

  let { res, buf } = await attempt();
  if (!res.ok) {
    throw new Error(`audio fetch failed: HTTP ${res.status} ${res.statusText ?? ''}`);
  }
  if (!isAudioMagic(buf)) {
    console.warn(
      `audio fetch returned a non-audio body (HTTP ${res.status}, content-type: ${res.headers.get('content-type') ?? 'n/a'}, ${buf.byteLength} bytes, magic: ${magicPreview(buf)}); retrying once`,
    );
    await sleep(1000);
    ({ res, buf } = await attempt());
    if (!res.ok) {
      throw new Error(`audio fetch failed: HTTP ${res.status} ${res.statusText ?? ''}`);
    }
    if (!isAudioMagic(buf)) {
      throw new Error(
        `audio fetch returned a non-audio body (HTTP ${res.status}, content-type: ${res.headers.get('content-type') ?? 'n/a'}, ${buf.byteLength} bytes, magic: ${magicPreview(buf)})`,
      );
    }
  }
  return buf;
}

async function decodeWithContext(
  bytes: Uint8Array,
  ctx: AudioContext | OfflineAudioContext,
): Promise<AudioBuffer> {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return ctx.decodeAudioData(ab);
}

/**
 * Decodes audio bytes through two strategies: a regular AudioContext and an
 * OfflineAudioContext (immune to autoplay-policy suspension).
 */
async function decodeAudioBytes(bytes: Uint8Array, url: string): Promise<AudioBuffer> {
  const strategies: (() => Promise<AudioBuffer>)[] = [
    async () => {
      const ctx = new AudioContext();
      try {
        return await decodeWithContext(bytes, ctx);
      } finally {
        void ctx.close();
      }
    },
    async () => {
      const ctx = new OfflineAudioContext(AUDIO_CHANNELS, 1, 44_100);
      return decodeWithContext(bytes, ctx);
    },
  ];

  let lastError: unknown = null;
  for (const strategy of strategies) {
    try {
      return await strategy();
    } catch (err) {
      lastError = err;
      console.warn(`audio decode strategy failed: ${(err as Error).message}`);
    }
  }
  throw new Error(
    `audio decode failed for ${url} (${bytes.byteLength} bytes): ${(lastError as Error).message}`,
  );
}

interface LoadedAudio {
  buffer: AudioBuffer;
  /** Seconds into `buffer` where the clip's start offset lands. */
  offsetSeconds: number;
}

const FULL_DECODE_MAX_BYTES = 30 * 1024 * 1024;
const RANGE_MARGIN_SECONDS = 5;

async function fetchRange(url: string, start: number, end: number): Promise<{ status: number; headers: Headers; bytes: Uint8Array }> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, bytes };
}

function parseContentRangeTotal(headers: Headers): number | null {
  const cr = headers.get('content-range');
  if (!cr) return null;
  const match = /\/\s*(\d+)\s*$/.exec(cr);
  return match ? Number(match[1]) : null;
}

/** Returns the byte offset just past a leading ID3v2 tag (0 when absent). */
function skipId3(bytes: Uint8Array): number {
  if (bytes.byteLength < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/**
 * Large surah audio files (often 100+ MB) exceed Chrome's decodeAudioData
 * limits, so only the clip's byte range is fetched (the dev proxy forwards
 * Range requests) and decoded. Returns the decoded buffer plus the time
 * offset of the clip start inside it.
 */
async function loadAudioSliceByRange(
  url: string,
  clipStartSeconds: number,
  clipDurationSeconds: number,
): Promise<LoadedAudio> {
  const head = await fetchRange(url, 0, 65_535);
  if (head.status !== 206 || head.bytes.byteLength < 1024) {
    throw new Error(`range requests not supported (HTTP ${head.status}, ${head.bytes.byteLength} bytes)`);
  }
  const headAudioStart = skipId3(head.bytes);
  const sync = findFrameSync(head.bytes, headAudioStart);
  if (sync === -1) {
    throw new Error('unsupported audio container (no MPEG frame sync in range probe)');
  }
  const frameInfo = parseMpegFrame(head.bytes, sync);
  if (!frameInfo) throw new Error('unsupported audio container (unparseable MPEG frame)');
  const bytesPerSecond = (frameInfo.bitrateKbps * 1000) / 8;
  const totalSize = parseContentRangeTotal(head.headers) ?? head.bytes.byteLength;

  const startByte = Math.max(0, Math.floor((clipStartSeconds - RANGE_MARGIN_SECONDS) * bytesPerSecond));
  const endByte = Math.min(
    Math.max(totalSize - 1, startByte),
    Math.ceil((clipStartSeconds + clipDurationSeconds + RANGE_MARGIN_SECONDS) * bytesPerSecond),
  );

  const slice = await fetchRange(url, startByte, endByte);
  if (slice.status !== 206) throw new Error(`range fetch failed (HTTP ${slice.status})`);
  if (slice.bytes.byteLength < 1024) {
    throw new Error(`range slice too small: expected ~${endByte - startByte + 1} bytes, got ${slice.bytes.byteLength} (content-range: ${slice.headers.get('content-range') ?? 'n/a'})`);
  }
  const sliceAudioStart = skipId3(slice.bytes);
  const sliceSync = findFrameSync(slice.bytes, sliceAudioStart);
  if (sliceSync === -1) throw new Error('no MPEG frame sync in range slice');
  const trimmed = trimToCompleteFrames(slice.bytes, sliceSync);
  console.warn(
    `[slice] total=${totalSize} startByte=${startByte} endByte=${endByte} got=${slice.bytes.byteLength} id3Skip=${sliceAudioStart} sync=${sliceSync} trimmed=${trimmed.byteLength}`,
  );

  const buffer = await decodeAudioBytes(trimmed, url);
  return {
    buffer,
    offsetSeconds: Math.max(
      0,
      clipStartSeconds - RANGE_MARGIN_SECONDS + (sliceSync - sliceAudioStart) / bytesPerSecond,
    ),
  };
}

/**
 * Loads and decodes just the portion of audio needed for the clip. Small
 * files are fetched whole; large files are fetched by byte range so Chrome's
 * decodeAudioData limits are never hit.
 */
async function loadAudioBuffer(
  url: string,
  clipStartSeconds: number,
  clipDurationSeconds: number,
): Promise<LoadedAudio> {
  const probe = await fetchRange(url, 0, 65_535);
  const totalSize = parseContentRangeTotal(probe.headers);

  const attempts: (() => Promise<LoadedAudio>)[] = [];
  if (totalSize === null || totalSize <= FULL_DECODE_MAX_BYTES) {
    attempts.push(async () => ({
      buffer: await decodeAudioBytes(await fetchAudioBytes(url), url),
      offsetSeconds: clipStartSeconds,
    }));
  }
  attempts.push(() => loadAudioSliceByRange(url, clipStartSeconds, clipDurationSeconds));

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      console.warn(`audio load attempt failed: ${(err as Error).message}`);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('audio load failed');
}

/**
 * Decodes the source audio, slices it to the selected clip range, resamples
 * it to the target sample rate as stereo and feeds the PCM through the
 * configured AudioEncoder into the shared muxer. Returns true when audio was
 * successfully encoded.
 */
async function encodeAudioTrack(
  encoder: AudioEncoder,
  opts: EncodeVideoOptions,
  targetRate: number,
  onProgress: (ratio: number) => void,
): Promise<boolean> {
  try {
    const { buffer: full, offsetSeconds } = await loadAudioBuffer(
      opts.audioUrl,
      opts.clipStartOffsetSeconds,
      opts.durationSeconds,
    );

    const srcRate = full.sampleRate;
    const startSample = Math.max(0, Math.round(offsetSeconds * srcRate));
    const requestedSamples = Math.round(opts.durationSeconds * srcRate);
    const endSample = Math.min(full.length, startSample + requestedSamples);
    const sliceLength = Math.max(0, endSample - startSample);
    if (sliceLength <= 0) return false;

    const targetLength = Math.max(1, Math.round((sliceLength / srcRate) * targetRate));

    const offline = new OfflineAudioContext(AUDIO_CHANNELS, targetLength, targetRate);
    const srcBuffer = offline.createBuffer(full.numberOfChannels, sliceLength, srcRate);
    for (let c = 0; c < full.numberOfChannels; c++) {
      const plane = full.getChannelData(c).subarray(startSample, endSample);
      srcBuffer.copyToChannel(new Float32Array(plane), c);
    }
    const srcNode = offline.createBufferSource();
    srcNode.buffer = srcBuffer;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    const rendered = await offline.startRendering();

    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;
    const totalChunks = Math.ceil(rendered.length / AUDIO_CHUNK_FRAMES);
    let offset = 0;
    let chunkIndex = 0;

    while (offset < rendered.length) {
      const n = Math.min(AUDIO_CHUNK_FRAMES, rendered.length - offset);
      const data = new Float32Array(n * AUDIO_CHANNELS);
      for (let j = 0; j < n; j++) {
        data[j] = ch0[offset + j];
        data[n + j] = ch1[offset + j];
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: targetRate,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((offset / targetRate) * 1_000_000),
        data,
      });
      encoder.encode(audioData);
      audioData.close();
      offset += n;
      chunkIndex += 1;
      if (chunkIndex % 20 === 0 || offset >= rendered.length) {
        onProgress(chunkIndex / totalChunks);
      }
    }

    await encoder.flush();
    return true;
  } catch (err) {
    console.error('audio encode failed:', err);
    return false;
  }
}

export async function encodeVideoToMp4(opts: EncodeVideoOptions): Promise<EncodeResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs VideoEncoder is not supported in this browser');
  }

  const fps = opts.fps ?? 30;
  const frameDurationUs = 1_000_000 / fps;
  const totalFrames = Math.max(1, Math.ceil(opts.durationSeconds * fps));

  const width = opts.width & ~1;
  const height = opts.height & ~1;
  if (width <= 0 || height <= 0) throw new Error(`invalid export dimensions ${opts.width}x${opts.height}`);

  const videoChoice = await pickVideoCodec(width, height, fps);
  const audioChoice = await pickAudioCodec();

  let muxer: Mp4Muxer.Muxer<Mp4Muxer.ArrayBufferTarget> | null = null;
  let videoError: Error | null = null;
  let audioError: Error | null = null;
  let audioChunksAdded = 0;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer?.addVideoChunk(chunk, meta),
    error: (e) => {
      videoError = new Error(`VideoEncoder failed: ${e.message}`);
    },
  });
  videoEncoder.configure(videoChoice.config);

  let audioEncoder: AudioEncoder | null = null;
  if (audioChoice) {
    try {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          audioChunksAdded += 1;
          muxer?.addAudioChunk(chunk, meta);
        },
        error: (e) => {
          audioError = new Error(`AudioEncoder failed: ${e.message}`);
        },
      });
      audioEncoder.configure(audioChoice.config);
    } catch (err) {
      console.error('audio encoder configuration failed:', err);
      audioEncoder = null;
    }
  }

  muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: videoChoice.muxerCodec, width, height },
    audio:
      audioEncoder && audioChoice
        ? { codec: audioChoice.muxerCodec, numberOfChannels: AUDIO_CHANNELS, sampleRate: audioChoice.sampleRate }
        : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  if (!ctx) throw new Error('unable to create 2d context for export');

  let hasAudio = false;

  try {
    const audioPromise =
      audioEncoder && audioChoice
        ? encodeAudioTrack(audioEncoder, opts, audioChoice.sampleRate, (ratio) =>
            opts.onProgress?.({ phase: 'audio', ratio }),
          )
        : Promise.resolve(false);

    const progressStep = Math.max(1, Math.floor(totalFrames / 100));
    for (let i = 0; i < totalFrames; i++) {
      if (videoError) throw videoError;
      while (videoEncoder.encodeQueueSize > 5) {
        if (videoError) throw videoError;
        await sleep(5);
      }

      const tSeconds = i / fps;
      renderFrame(ctx, { ...opts.render, tSeconds });

      const videoFrame = new VideoFrame(canvas, { timestamp: i * frameDurationUs });
      try {
        videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
      } finally {
        videoFrame.close();
      }

      if (i % progressStep === 0 || i === totalFrames - 1) {
        opts.onProgress?.({ phase: 'render', ratio: (i + 1) / totalFrames });
      }
    }

    try {
      await videoEncoder.flush();
    } catch (err) {
      throw videoError ?? (err as Error);
    }
    if (videoError) throw videoError;

    opts.onProgress?.({ phase: 'finalize', ratio: 0 });
    hasAudio = (await audioPromise) && !audioError && audioChunksAdded > 0;
    muxer.finalize();
    opts.onProgress?.({ phase: 'finalize', ratio: 1 });

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    return { blob, hasAudio };
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
  }
}