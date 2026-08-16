export interface CaptureResult {
  blob: Blob;
  mimeType: string;
  isMp4: boolean;
}

export function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

type CaptureStreamSource = { captureStream(fps?: number): MediaStream };

export async function capturePass(
  canvas: HTMLCanvasElement,
  audioEl: HTMLAudioElement | null,
  durationSeconds: number,
  fps = 30,
): Promise<CaptureResult> {
  const mimeType = pickRecorderMimeType();
  if (!mimeType) throw new Error('no supported MediaRecorder mime type');

  const stream = canvas.captureStream(fps);
  if (audioEl) {
    try {
      const audioStream = (audioEl as unknown as CaptureStreamSource).captureStream();
      for (const track of audioStream.getAudioTracks()) {
        stream.addTrack(track);
      }
    } catch {
      void 0;
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<CaptureResult>((resolve, reject) => {
    recorder.onstop = () => {
      resolve({
        blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
        mimeType,
        isMp4: mimeType.startsWith('video/mp4'),
      });
    };
    recorder.onerror = () => reject(new Error('recorder error'));
  });

  recorder.start(250);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, durationSeconds) * 1000));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}