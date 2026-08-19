# Voice & Export Package — Notes

Context for a fresh model working on this package: this app is a Quran-video
generator (React + Vite + TypeScript) that plays word-by-word recitation and
exports MP4 videos entirely in the browser using the WebCodecs API (no ffmpeg).

## Architecture

- `src/export/webcodecs.ts` — THE core file. Video/audio encode via WebCodecs,
  muxed with mp4-muxer v5. Encoder codec ladder (probe results from headless
  system Chrome): `avc1.640033` prefer-hardware=true(default), then
  prefer-software, then `vp09.00.10.08`, then `av01.0.05M.08`. Audio: AAC
  (`mp4a.40.2`) unsupported in Chrome → Opus always used.
- `src/export/exporter.ts` — thin orchestrator over `encodeVideoToMp4`.
- `src/App.tsx` — `handleExport` (~line 448) calls `encodeVideoToMp4` with
  render options + progress mapping (render 0-0.85, audio 0.85-0.97, finalize 1).
  Also: `build()` has a stale-request guard (sequence counter) so an older
  async build cannot overwrite a newer timeline, and the From/To ayah inputs
  no longer clamp each other cross-wise (typing from=75 before to=80 no longer
  silently rewrites the range).
- `src/audio/engine.ts` — `ClipPlayer`/`playClip`, the in-app preview voice path.
- `src/data/resolver.ts` / `sources.ts` / `timelineBuilder.ts` / `types.ts` —
  reciter catalog, audio URL resolution, timing; `audioUrl` is
  `/api/proxy?url=<encoded>`.
- `vite.config.ts` — `/api/proxy` middleware (ALLOWED_HOSTS incl.
  download.quranicaudio.com; forwards Range headers; QF API token via .env).

## Real audio URL format

`https://download.quranicaudio.com/qdc/{reciterSlug}/murattal/{chapter}.mp3`

## Bug that was fixed (user report, 7:01 AM logs)

`audio encode failed: EncodingError: Unable to decode audio data` — surah 2,
reciter mishari_al_afasy (116,226,409 bytes, ~2.5 h, MPEG-1 Layer III, 128 kbps
CBR, 44.1 kHz stereo, ID3v2.4 tag of 35 bytes).

Root cause 1: `decodeAudioData` on the WHOLE file fails in Chrome (decode
allocation/demux limits). Reproduced in headless Chrome: fetch 200 (110.8 MB
after transfer), decodeAudioData fails after ~12.7 s with
"Unable to decode audio data".

Fix in `loadAudioBuffer`/`loadAudioSliceByRange` (`webcodecs.ts`):

1. Probe `Range: bytes=0-65535`; parse Content-Range for total size.
2. If total > 30 MB (`FULL_DECODE_MAX_BYTES`), never fetch the whole file.
3. Estimate byte offsets from the MPEG header: bitrate from first frame
   (parseMpegFrame: sync 0xFFE, version/layer/bitrate-index/sample-rate-index,
   frame length = 144*bitrate/sampleRate + padding), bytesPerSecond =
   bitrate/8.
4. Fetch `bytes=startByte-endByte` with 5 s margins (RANGE_MARGIN_SECONDS),
   `findFrameSync` + `trimToCompleteFrames` (skips embedded ID3 tags and
   re-syncs past gaps), decode the slice, return `{buffer, offsetSeconds}`.
5. Small files (< 30 MB) keep the full fetch + `decodeAudioBytes` (AudioContext
   then OfflineAudioContext strategies).

Root cause 2 (the "no audio for verses 75-80" report): the clip offset math
mixed file-time with buffer-local time. For a mid-file clip the slice's first
frame was at file-time ~1503 s while the buffer is only ~76 s long, so the
slice start sample landed past the buffer end and the encoder emitted no audio
("Exported video has no audio — audio encoding was unavailable"). It only
worked for verses near the file start because `Math.max(0, ...)` masked it.
Fixed: `offsetSeconds` is now the BUFFER-LOCAL clip position
`clipStart - (startByte + sync - id3Skip)/bytesPerSecond`, and a retry loop
extends the byte range if the decoded slice doesn't cover the clip
(lead/tail shortfall checks; the raw, unclamped offset drives the lead check).

Root cause 3 (user's "random ranges in the 70s"): the From/To ayah inputs
cross-clamped each other (from=min(v,to), to=max(v,from)), so typing
from=75 while to=5 silently made the range 5-80. Clamping removed; build()
validates instead. Also added the stale-build guard.

## Verified (real API + Playwright + system Chrome)

- mishari surah 2 v1-5, v5-10, v70-75, v75-80: all EXPORT OK, avc1+Opus
  tracks, audio warning false. Slice logs: clip@0.00/5.00/4.98/5.00s inside
  the buffer, lead=0 tail=0.
- Default reciter (khalil_al_husary) surah 2 v1-7: EXPORT OK with audio.
- Mocked loop test: 5/5 exports, MP4 valid, audio track present.

## Codec probe results (headless system Chrome, no hardware accel)

```
avc1.640033 prefer-hardware: false (encoder created), default: true,
prefer-software: true
avc1.42001f: false
vp09.00.10.08: true
av01.0.05M.08: true
mp4a.40.2 (AAC): false
opus: true
```

## Other lessons

- `new AudioContext()` can be suspended (autoplay policy) → fall back to
  OfflineAudioContext in `decodeAudioBytes`.
- Vite dev middleware can serve HTML error pages during one-time dep
  re-optimization → `fetchAudioBytes` validates magic bytes and retries once.
- AudioEncoder error callback must not throw; record the error and check state.
- VideoEncoder "Encoder creation error" with prefer-hardware on headless
  Chrome → try the full codec ladder.
- Always close VideoFrames (try/finally) to avoid GC-induced stalls.
- The vite proxy MUST forward Range headers or the slice fetch returns 200
  with the whole file (or fails).
- quran.foundation production API returns 401 invalid_token; prelive
  (apis-prelive.quran.foundation) serves only some chapters (1, 2 work;
  36, 114 → 404). The dev proxy reads VITE_QF_* from .env. Tests mock upstream.

## Testing

- `tests/real-export.mjs` — real API export. Env: SURAH, FROM, TO, RECITER
  (label match).
- `tests/export-loop.mjs` — mock-based loop; validates MP4 boxes (stsd fourcc
  at offset+20: avc1 + Opus).
- `tests/probe-formats.mjs` — proves decodeAudioData handles raw MPEG frames
  (no ID3) and the real ID3 tag, but rejects a malformed synthetic ID3 header.
  Needs local file /tmp/opencode/mishari2.mp3 + server on :9911.
- `tests/probe-slice.mjs` — replays the exact browser range logic against the
  real 116 MB file.
- `tests/probe-codecs.mjs` — codec ladder probe.
- `tests/probe-big-decode.mjs` — reproduces the original whole-file decode
  failure.
- Dev server: `setsid nohup npx vite --port 5173 --strictPort
  > /tmp/opencode/vite.log 2>&1 < /dev/null & disown`; kill with
  `pgrep -a -f vite`.

## QF API notes

- Real audio lives on download.quranicaudio.com (no auth). Chapter reciter
  catalog + verse timing come from the QF content API (needs token; .env
  credentials currently rejected by oauth2.quran.foundation: 401
  invalid_client — external, needs regeneration).