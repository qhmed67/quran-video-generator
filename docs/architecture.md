# Quranic Video Generator — Technical Architecture

> **Status:** Reference document for Phase 1 (Web) and Phase 2 (Android).
> **Stack:** Vite + React + TypeScript · Vercel (static SPA + two serverless functions).
> **Constraints enforced:** zero backend, zero cost, no ASR/STT, memory-safe export, correct
> Unicode for Quranic text, cross-origin isolation for `ffmpeg.wasm` threading, no `FFmpegKit`
> on Android.

---

## 1. Corrected End-to-End Architecture

```
┌────────────────────────────────── BROWSER (Vite + React SPA) ──────────────────────────────────┐
│                                                                                                  │
│  User input: reciter · surah · verse range · background (image/loop video) · captions ·          │
│              translation (on/off + language)                                                      │
│                                                                                                  │
│  ┌─ data-fetching / alignment engine ──────────────────────────────────────────────────────┐     │
│  │  reciter capability index (IndexedDB-cached)                                             │     │
│  │  resolver.ts: QF v4 word/ayah ─▶ mp3quran v3 ayah ─▶ quran-align/QUL word  (fallback     │     │
│  │  state machine, per reciter)                                                             │     │
│  │  timelineBuilder.ts ─▶ CaptionTimeline  ⚠ units: SECONDS (float) — single source of truth│     │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘     │
│        │ CaptionTimeline (JSON, seconds)                                                           │
│  ┌─ render / canvas engine ─────────────────────────────────────────────────────────────────┐     │
│  │  ONE renderCanvas @ export resolution (CSS-scaled for preview)                            │     │
│  │  renderFrame(ctx, tSeconds)  =  RTL per-word draw + highlight + ayah marker U+06DD        │     │
│  │  Preview: RAF loop, clock = audioEl.currentTime − clipStartOffset (seconds)              │     │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘     │
│        │ same canvas, same renderFrame (NO libass/ass renderer anywhere)                           │
│  ┌─ export engine ──────────────────────────────────────────────────────────────────────────┐     │
│  │  canvas.captureStream(30) + audioEl.captureStream() → MediaRecorder(webm/vp8, ~10Mbps)   │     │
│  │  → single Blob (compressed — never accumulates raw frames)                                │     │
│  │  → ffmpeg.wasm core-mt (worker) webm→mp4: libx264 CRF 23 / preset fast / faststart        │     │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                                  │
│  All outbound data through Vercel only:  POST /api/oauth-token   ·   GET /api/proxy?url=…        │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲  OAuth (client_secret stays in env)                  │  JSON + binary streams
          │                                                      ▼  (COEP-safe: same-origin)
   ┌──────────────  VERCEL  ──────────────┐         ┌────────────────────────────────────────┐
   │  headers: COOP same-origin,          │         │  QF API v4 (OAuth)                      │
   │  COEP require-corp, CORP same-origin │         │  mp3quran.net v3 (no auth)              │
   └──────────────────────────────────────┘         │  quran-align / QUL (bundled static,      │
                                                    │    served from Vercel = same-origin)    │
                                                    └────────────────────────────────────────┘
```

### Corrections vs. the naive plan (each is a flagged deviation)

| # | Naive assumption | Corrected design | Why |
|---|---|---|---|
| C1 | Browser calls QF/mp3quran directly | All outbound traffic through `/api/proxy` (whitelist); OAuth exchange through `/api/oauth-token` | COEP `require-corp` blocks non-CORS cross-origin subresources; binary media needs CORS for `captureStream`; `client_secret` must never reach the browser |
| C2 | Stream raw canvas frames into ffmpeg.wasm VFS | `MediaRecorder` first pass (VP8) → ffmpeg.wasm transcode | Raw 1080×1920 RGBA = 8.3 MB/frame → 124 GB for a 60 s/30 fps clip; impossible in JS. Compressed pass stays in tens of MB and fits the wasm 1 GB VFS limit |
| C3 | Separate subtitle burn-in for export | Export reuses the identical `renderFrame` on the identical canvas | Constraint 8; guarantees preview == export |
| C4 | Word timing from any reciter | Word data only from same-reciter sources (QF segments or quran-align); otherwise degrade to ayah granularity | Cross-reciter proportional rescale is a known reliability hazard; fallback is an explicit state, not an afterthought |
| C5 | ffmpeg.wasm assumed available everywhere | Capability probe: `core-mt` if cross-origin isolated, else `core-st` single-thread, else Safari `MediaRecorder(mp4)` fast path | Safari has no `SharedArrayBuffer` → multi-thread core cannot load |
| C6 | Uthmani font loaded from quran.com CDN | Font self-hosted in `public/fonts/` | Under COEP, cross-origin font loads require CORP/CORS the CDN may not send; self-hosting eliminates it |

---

## 2. Module Specifications

### 2.1 `src/lib/time.ts` — the ONLY unit-conversion surface (constraint 1)

Every API timestamp (milliseconds) and every `currentTime` (seconds) boundary passes through this module. No inline `/1000` anywhere else.

```ts
const S_PER_MS = 0.001;

/** Milliseconds (API/alignment inputs) → seconds (canonical timeline unit). */
export function msToSeconds(ms: number): number {
  return ms * S_PER_MS;          // e.g. 3520 ms → 3.52
}

/** Seconds → milliseconds. Used only when feeding ms-only sinks (never the render loop). */
export function secondsToMs(s: number): number {
  return s * 1000;
}

/**
 * Canonical comparison helper for the render loop.
 * tSeconds is timeline time; positionSeconds is mediaEl.currentTime (seconds, float).
 * Returns 0 when media position falls inside [start,end), -1 before, +1 after.
 */
export function compareToWindow(
  positionSeconds: number, startSeconds: number, endSeconds: number,
): -1 | 0 | 1;

/** Sanity clamp for auto-fixed overlaps/negatives. */
export function clampSeconds(v: number): number;
```

**Interface boundaries and their units:**

| Boundary | Unit | Conversion |
|---|---|---|
| QF v4 / mp3quran / quran-align raw payloads | ms (integers) | — |
| alignment engine → `CaptionTimeline` | **seconds (float)** | via `msToSeconds`, once, at assembly |
| `CaptionTimeline` (schema) | seconds (float) | — |
| render loop `tSeconds` (from `currentTime`) | seconds (float) | direct compare, **no conversion** |
| export capture pass | seconds (float, wall-clock) | MediaRecorder handles µs internally |
| Android `MediaPlayer.currentPosition` | ms | ported `msToSeconds` in Kotlin; timeline stays seconds |

### 2.2 Data-fetching / alignment engine (`src/data/`)

```ts
// ---------------------------------------------------------------- sources
// All QF calls go through the same-origin /api/proxy (auth headers added server-side).
async function fetchQfUthmani(range: VerseRange): Promise<{ verseKey: string; textUthmani: string }[]>;
async function fetchQfTranslation(range: VerseRange, translationId: number): Promise<{ verseKey: string; text: string }[]>;
// QF audio timestamp endpoint. Returns word segments when the reciter has them, else verse windows.
async function fetchQfAudioTiming(reciterId: string, range: VerseRange):
  Promise<{ granularity: 'word' | 'ayah'; perVerse: QfVerseTiming[] } | null>;   // QfVerseTiming uses ms
async function fetchMp3quranAyahTiming(surah: number, readId: number):            // ms
  Promise<Map<string, { startMs: number; endMs: number }> | null>;
async function loadQuranAlignSurah(reciterKey: string, surah: number):            // ms
  Promise<QuranAlignSurah | null>;                                                // [{surah,ayah,segments:[[wi0,wi1,sMs,eMs],…]}]
async function fetchReciterCapabilities(): Promise<ReciterCapability[]>;
```

```ts
// ---------------------------------------------------------------- resolver
type TimingGranularity = 'word' | 'ayah' | 'estimated';   // explicit fallback state (constraint)

interface TimingResolution {
  granularity: TimingGranularity;
  sourceChain: string[];                 // e.g. ["qf-v4:word"] or ["qf-v4:ayah→mp3quran:ayah"]
  perVerse: { verseKey: string; startSeconds: number; endSeconds: number }[];   // SECONDS
  wordSegments: Record<string, WordSegmentSeconds[]> | null;                    // SECONDS
  audioUrl: string;                      // via /api/proxy (COEP-safe)
  clipStartOffsetSeconds: number;        // clip start within the audio file
  warnings: string[];
}

async function resolveTiming(req: { reciterId: string; surah: number; verses: [number, number] }): Promise<TimingResolution>;
```

**Runtime selection chain (per reciter, evaluated once per request):**

1. **QF v4** — does `apis.quran.foundation` provide audio timing for this reciter?
   - Word segments available → `granularity='word'`, source chain `["qf-v4:word"]`. Stop.
   - Verse windows only → remember as candidate `qf-v4:ayah`, continue (mp3quran often has the same data more reliably).
2. **quran-align / QUL** — is there a downloaded word-timing file for this reciter (bundled in `public/timing/` at build time, small, same-origin)?
   - Present and covers the surah → `granularity='word'`, chain `["quran-align:word"]`. Stop.
3. **mp3quran v3** — `ayat_timing?surah=…&read=…` (covers virtually every mp3quran reciter) →
   - `granularity='ayah'`, chain includes `["mp3quran:ayah"]`.
4. **Estimated** (only if none of the above resolved, practically unreachable because mp3quran covers its own reciters):
   - Evenly divide the audio duration across verses weighted by word/char count. `granularity='estimated'`, UI shows a persistent warning badge, captions render ayah-level.

**Granularity degradation is explicit:** the renderer receives `granularity` in the timeline; a `word` timeline falls back *per verse* to ayah rendering if word-count reconciliation fails (below) — never silently.

**Basmala/ta'awwudh offset:** whole-surah mp3quran files begin with a basmala/ta'awwudh prefix on some reciters. The resolver compares the first verse's duration across available sources; if the mp3quran first-window is > 1.6× the other source's window, it treats the delta as a lead-in offset and aligns to the *end* of the window, setting `clipStartOffsetSeconds` accordingly.

```ts
// ---------------------------------------------------------------- alignment / reconciliation
/** Tokenizes uthmani text by U+0020, must index exactly into quran-align/QF segment indices.
 *  Returns null when counts mismatch → caller degrades that verse to ayah granularity. */
function reconcileWords(verseTextUthmani: string, segmentsMs: [number, number, number, number][]):
  { words: string[]; segments: WordSegmentSeconds[] } | null;   // SECONDS out

async function buildTimeline(req: TimelineRequest, res: TimingResolution): Promise<CaptionTimeline>;
function validateTimeline(t: CaptionTimeline): ValidationIssue[];   // monotonicity, gaps, in-range words, marker presence
```

### 2.3 Render / canvas engine (`src/render/`)

```ts
interface FrameRenderOptions {
  tSeconds: number;                // SECONDS, relative to clip start
  timeline: CaptionTimeline;
  highlightMode: 'word' | 'verse'; // from timeline.granularity
  captionsOn: { uthmani: boolean; translation: boolean };
  fonts: FontSet;                  // loaded via FontFace + document.fonts.ready
}

/** THE shared draw routine — preview RAF loop and export capture loop both call this. */
function renderFrame(ctx: CanvasRenderingContext2D, opts: FrameRenderOptions): void;
```

- Single `renderCanvas` at export resolution (e.g. 1080×1920). Preview shows it CSS-scaled → pixel-identical export (constraint 8).
- RTL caption layout: words drawn **one per `fillText`** from the right edge (avoids bidi shaping; the standard approach for word-level highlight). Line wrapping: even split of words across `maxRows` (default 2), `fontSize` auto-shrinks to fit. Current word gets a highlight rect + full opacity; others at 55%.
- Ayah-end marker: renderer appends `\u06DD` + **Arabic-Indic digits** of the ayah number to the last word/verse (constraint 5). It also strips any `\uFD3E`/`\uFD3F` present in source text.
- Fades: `fade.inSeconds = 0.25`, `fade.outSeconds = 0.25` (from timeline).
- `@font-face` (self-hosted, COEP-safe):

```
font-family: 'KFGQPC HAFS Uthmanic Script';
src: url('/fonts/KFGQPC-Uthmanic-HAFS.otf') format('opentype');
/* fallback stack: 'KFGQPC HAFS Uthmanic Script', 'me_quran', 'Scheherazade New', serif */
```

### 2.4 Audio engine (`src/audio/`)

```ts
async function playClip(audioUrl: string, clipStartOffsetSeconds: number): Promise<HTMLAudioElement>;
function clipTimeSeconds(audioEl: HTMLAudioElement, clipStartOffsetSeconds: number): number;
//   = Math.max(0, audioEl.currentTime - clipStartOffsetSeconds)   ← seconds, canonical clock
```

### 2.5 Export engine (`src/export/`)

```ts
// Path A — primary (memory-safe, all browsers with MediaRecorder):
async function capturePass(
  canvas: HTMLCanvasElement, audioEl: HTMLAudioElement,
  durationSeconds: number, fps = 30,
): Promise<Blob>;   // webm (vp8, videoBitrate ~10 Mbps, audio opus 128k)

// Path B — transcode/remux:
async function loadFfmpeg(): Promise<FFmpeg>;   // core-mt if crossOriginIsolated, else core-st
async function transcodeWebmToMp4(webm: Blob): Promise<Blob>;
//  -c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p -profile:v high -level 4.0
//  -movflags +faststart -threads N  (N = min(4, navigator.hardwareConcurrency))
//  -c:a aac -b:a 160k -ar 44100 -ac 2

// Safari fast path (no SharedArrayBuffer): if MediaRecorder supports 'video/mp4;codecs=avc1…', skip ffmpeg entirely.

async function exportClip(opts: ExportOptions): Promise<void>;   // orchestrates A then B, progress events
```

Export run is **real-time** (1:1): the same RAF loop drives the audio element and the canvas; `canvas.captureStream(30)` + `audioEl.captureStream()` are merged into one `MediaRecorder`, so A/V sync is handled by the browser clock. `MediaRecorder` writes compressed chunks → single Blob (bounded memory, ~15–45 MB for 60 s). ffmpeg decodes compressed VP8 → encodes H.264 in the worker; the VFS holds only the compressed webm + output mp4, never raw frames. Tab-visibility detection warns the user to keep the tab focused (RAF throttling drops frames otherwise).

---

## 3. Caption Timeline — Single Source of Truth (JSON Schema)

File: `docs/schemas/caption-timeline.json` (used by web TS types via JSON→TS, and later by Android via `kotlinx.serialization`). All times in **seconds (float)**. This schema doubles as the documented ".ass-like" **data contract** for caption timing — not a subtitle-filter pipeline (constraint 10).

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "caption-timeline.json",
  "title": "QuranicVideo CaptionTimeline",
  "description": "Single source of truth driving the web canvas renderer AND the Android renderer. Time units: SECONDS (float), relative to clip start (0 = first frame of the clip).",
  "type": "object",
  "required": ["version", "units", "meta", "verses"],
  "properties": {
    "version": { "const": 1 },
    "units": {
      "type": "object",
      "required": ["time"],
      "properties": { "time": { "const": "seconds" } }
    },
    "meta": {
      "type": "object",
      "required": ["granularity", "sourceChain", "surah", "versesFrom", "versesTo", "reciterId", "audioUrl", "clipStartOffsetSeconds", "captions"],
      "properties": {
        "granularity": { "enum": ["word", "ayah", "estimated"] },
        "sourceChain": { "type": "array", "items": { "type": "string" } },
        "reciterId": { "type": "string" },
        "surah": { "type": "integer", "minimum": 1, "maximum": 114 },
        "versesFrom": { "type": "integer" },
        "versesTo": { "type": "integer" },
        "audioUrl": { "type": "string", "format": "uri" },
        "clipStartOffsetSeconds": { "type": "number", "minimum": 0 },
        "captions": {
          "type": "object",
          "required": ["uthmani", "translation"],
          "properties": {
            "uthmani": { "type": "boolean" },
            "translation": {
              "type": "object",
              "required": ["enabled", "translationId", "language"],
              "properties": {
                "enabled": { "type": "boolean" },
                "translationId": { "type": "integer" },
                "language": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "verses": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["verseKey", "ayahNumber", "startSeconds", "endSeconds", "uthmani", "translation"],
        "properties": {
          "verseKey": { "type": "string", "pattern": "^\\d+:\\d+$" },
          "ayahNumber": { "type": "integer" },
          "startSeconds": { "type": "number", "minimum": 0 },
          "endSeconds": { "type": "number", "minimum": 0 },
          "uthmani": { "type": "string", "description": "Raw verse text; renderer appends U+06DD + Arabic-Indic digits; FD3E/FD3F stripped if present" },
          "translation": { "type": "string" },
          "words": {
            "type": ["array", "null"],
            "description": "null/omitted when granularity is 'ayah' or 'estimated'. Each word text is the U+0020-split token of `uthmani`, so word indices align with the text.",
            "items": {
              "type": "object",
              "required": ["index", "text", "startSeconds", "endSeconds"],
              "properties": {
                "index": { "type": "integer", "minimum": 0 },
                "text": { "type": "string" },
                "startSeconds": { "type": "number" },
                "endSeconds": { "type": "number" }
              }
            }
          }
        }
      }
    },
    "fade": {
      "type": "object",
      "required": ["inSeconds", "outSeconds"],
      "properties": {
        "inSeconds": { "type": "number", "default": 0.25 },
        "outSeconds": { "type": "number", "default": 0.25 }
      }
    }
  }
}
```

### Validation invariants (`validateTimeline`)

`verses[i].endSeconds === verses[i+1].startSeconds` (zero-gap); all word windows ⊆ verse window; monotonic `startSeconds < endSeconds`; ≥1 `words` entry when `granularity='word'`; `words` null when `granularity!=='word'`; every verse ends with the ayah marker at render time.

### Example instance (granularity `word`)

```json
{
  "version": 1,
  "units": { "time": "seconds" },
  "meta": {
    "granularity": "word",
    "sourceChain": ["qf-v4:word"],
    "reciterId": "mishari-alafasy",
    "surah": 36, "versesFrom": 1, "versesTo": 5,
    "audioUrl": "/api/proxy?url=https%3A%2F%2Fserver.mp3quran.net%2Fafasy%2F036.mp3",
    "clipStartOffsetSeconds": 2.41,
    "captions": { "uthmani": true, "translation": { "enabled": true, "translationId": 131, "language": "en" } }
  },
  "verses": [
    {
      "verseKey": "36:1", "ayahNumber": 1,
      "startSeconds": 0.0, "endSeconds": 1.15,
      "uthmani": "يسٓ",
      "translation": "Yā, Sīn.",
      "words": [ { "index": 0, "text": "يسٓ", "startSeconds": 0.0, "endSeconds": 1.15 } ]
    },
    {
      "verseKey": "36:2", "ayahNumber": 2,
      "startSeconds": 1.15, "endSeconds": 2.6,
      "uthmani": "وَٱلْقُرْءَانِ ٱلْحَكِيمِ",
      "translation": "By the wise Qur’ān,",
      "words": [
        { "index": 0, "text": "وَٱلْقُرْءَانِ", "startSeconds": 1.15, "endSeconds": 2.05 },
        { "index": 1, "text": "ٱلْحَكِيمِ",   "startSeconds": 2.05, "endSeconds": 2.6 }
      ]
    }
  ],
  "fade": { "inSeconds": 0.25, "outSeconds": 0.25 }
}
```

---

## 4. Encoding Parameter Table (browser, CPU-only)

| Aspect ratio | Resolution | fps | Codec | CRF | Preset | Expected size (60 s) | Use case |
|---|---|---|---|---|---|---|---|
| 9:16 | 1080×1920 | 30 | H.264 (libx264) | **23** | **fast** | ~20–35 MB | Default (TikTok/Reels standard) |
| 1:1 | 1080×1080 | 30 | H.264 | 23 | fast | ~15–25 MB | Default square |
| 9:16 (speed tier) | 720×1280 | 30 | H.264 | **26** | **veryfast** | ~8–15 MB | Low-RAM devices / quick export |

### Justification (why not "lossless" / why 23/fast)

- x264 CRF 23 is the encoder default: visually near-transparent for this content class (photographic nature background + large text overlays), at roughly half the bitrate of CRF 18.
- **The first pass is already one generation** (VP8 ~10 Mbps is near-lossless for input, then H.264 CRF 23 is gen-2), and **target platforms (TikTok/IG) recompress to ~2.5–4 Mbps anyway**. Pushing CRF below ~20 yields no visible gain after platform recompression — hence 23, never 18, never "lossless".
- `preset fast` vs `medium`: medium costs ~1.3–1.5× CPU time on WASM for a PSNR gain that platform recompression destroys. `fast` is the right speed/quality pivot for CPU-only; `veryfast` only for the speed tier.
- Audio: AAC 160 kbps / 44.1 kHz / stereo (recitation is voice; 96–128 k mono is a lean alternative). Output needs `-pix_fmt yuv420p` (yuv444 plays black in some players) and `-movflags +faststart` (moov at front for streaming upload).

---

## 5. Vercel Configuration

### `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",  "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" },
        { "key": "Permissions-Policy", "value": "cross-origin-isolated=(self)" }
      ]
    }
  ],
  "functions": {
    "api/oauth-token.ts": { "maxDuration": 10 },
    "api/proxy.ts":       { "maxDuration": 30 }
  }
}
```

These two headers make `self.crossOriginIsolated === true` and unlock `SharedArrayBuffer` for `@ffmpeg/core-mt`. Consequences: COEP requires every cross-origin subresource to be CORS-enabled or proxied (we proxy them), and popup-based OAuth breaks — not applicable here (client-credentials only).

**ffmpeg core is self-hosted** in `public/ffmpeg/` (copied from `@ffmpeg.wasm/core-mt/dist/esm/`), loaded via `toBlobURL(fetch → Blob)` so wasm+worker are same-origin. Startup probe: `crossOriginIsolated` → `core-mt`; else `core-st`; both unavailable → Safari `MediaRecorder(mp4)` fast path or a clearly worded limitation.

### Function 1 — `api/oauth-token.ts` (OAuth proxy)

- `POST`. Reads `QF_CLIENT_ID` / `QF_CLIENT_SECRET` / `QF_TOKEN_ENDPOINT` from Vercel env. Exchanges `client_credentials` + `scope=content` (form-encoded) at the QF token endpoint.
- Returns `{ access_token, expires_in }`; **secret never leaves the server**.
- Caches the token in module scope (per warm isolate) and sets `Cache-Control: s-maxage=300, stale-while-revalidate=120` so the Vercel CDN serves it edge-side between cold starts.
- On `401`/`403` from QF: purge cache, retry once with a fresh exchange.

### Function 2 — `api/proxy.ts` (CORS fallback proxy)

- `GET` (and `HEAD`), param `url`, **strict host whitelist** (SSRF guard): `apis.quran.foundation`, `apis-prelive.quran.foundation`, `mp3quran.net` and `*.mp3quran.net` (+ `server*.mp3quran.net`). Anything else → 403.
- If target host is QF: attaches `x-auth-token` + `x-client-id` from env — **browser never holds QF credentials**.
- Streams the upstream body through (pipe; supports binary audio/video, not just JSON), forwards content-type/length, adds `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, and `Cache-Control` (short TTL for audio).
- Runtime probe optimization: app first tries direct `fetch(audioUrl, { mode: 'cors' })` with `crossOrigin='anonymous'`; if the source lacks CORS headers the request fails → fall back to proxying. Keeps Vercel free-tier bandwidth (100 GB/mo) low for users whose sources are CORS-friendly.

---

## 6. Android Migration (Post-FFmpegKit)

| Layer | Web (Phase 1) | Android (Phase 2) | Notes / trade-offs |
|---|---|---|---|
| Caption timeline | TS types + `caption-timeline.json` | `kotlinx.serialization` + same schema | One contract, two consumers (constraint 10). Seconds floats ported directly. |
| Alignment/resolver | TS `resolver.ts` fallback state machine | Kotlin port (same logic, same chain QF→quran-align→mp3quran) | Reciters/capabilities fetched the same way; QF still via OAuth — callable directly from Android with the client secret obfuscated/remoted or a thin serverless call. |
| Text rendering | Canvas 2D per-word RTL | Compose Canvas (`android.graphics.Canvas`) | Same `drawFrame(canvas, tSeconds)` algorithm; KFGQPC font bundled as asset. |
| Audio playback | `HTMLAudioElement` clock | `MediaPlayer` / ExoPlayer | `positionSeconds = currentPosition_ms × 0.001` via ported `msToSeconds`. |
| Video encode | MediaRecorder(vp8) + ffmpeg.wasm(libx264) | **MediaCodec (H.264, surface input) + MediaMuxer** | No FFmpeg. HW encoder = real-time 1080p30. Render frames into MediaCodec input surface canvas; mux audio (decode via MediaExtractor/MediaCodec → AAC encoder) with MediaMuxer. |
| **FFmpegKit (arthenica)** | — | **NOT USED** — retired Jan 2025, binaries gone from Maven Central | See alternatives below. |
| Export delivery | Blob download | MediaStore / FileProvider share | — |

### Two real alternatives to FFmpegKit

| Option | How | Trade-offs |
|---|---|---|
| **(a) Build FFmpeg via NDK/Gradle** | Custom FFmpeg build scripts (`externalNativeBuild`, cross-compile for arm64-v8a/armeabi-v7a/x86_64), ship `.so`; full filter graph available | Full control but heavy: per-ABI build matrix + CI, +30–50 MB per ABI, perpetual maintenance of build config. Only worth it if the app needs ffmpeg *filters* (concat, complex watermarks, transitions). |
| **(b) Native MediaCodec + MediaMuxer** | Canvas/GL render → MediaCodec H.264 surface input → MediaMuxer; audio via MediaExtractor/MediaCodec→AAC | HW-accelerated (near-real-time 1080p), no FFmpeg dependency, smaller binary. Constraint: no complex filter graphs — but this project renders captions app-side anyway (mirroring web constraint 8), so it needs only **overlay + mux**. |

**Recommendation: (b).** This project's actual complexity is overlay + mux; the rendering pipeline is already app-side and shared (same timeline schema). FFmpeg on Android adds weight and build pain for zero required capability. Defer (a) as a contingency only if a future feature genuinely needs ffmpeg filters — and even then, implement those effects in the renderer instead.

---

## 7. Risk / Trade-off Appendix (deviations from the naive plan)

| # | Risk | Naive expectation | Mitigation / fallback |
|---|---|---|---|
| R1 | Raw-frame accumulation | "Stream frames to ffmpeg.wasm VFS" | MediaRecorder VP8 first pass; ffmpeg.wasm only transcode. Wasm 1 GB hard limit respected (compressed webm + mp4 only). |
| R2 | Safari has no `SharedArrayBuffer` | ffmpeg core-mt everywhere | Capability probe → `core-st` (slow but works) or Safari `MediaRecorder(video/mp4)` direct (skips ffmpeg). WebM-only delivery as documented last resort. |
| R3 | Gen-2 quality loss (VP8→H.264) | "CRF 18 = near lossless" | Record VP8 at ~10 Mbps (gen-1 near-lossless), then H.264 CRF 23 — platform recompression makes tighter CRF pointless. No value labelled "lossless". |
| R4 | Cross-reciter word timing | "Rescale Afasy segments to any reciter" | Rejected: tempo/pause variance makes it unreliable. Word data only from same-reciter sources; else explicit `ayah` granularity with a UI badge. Rescale remains a flagged off-switch for later. |
| R5 | No timing source at all | "Guess by word count" | `granularity='estimated'` state with persistent warning; rendered ayah-level. Practically unreachable since mp3quran covers its own reciters. |
| R6 | COEP breaks popups/embeds/analytics | Assume everything works | client-credentials only (no popup OAuth); analytics are fetch-based (fine); `Permissions-Policy` cross-origin-isolated declared. |
| R7 | Cross-origin media under COEP (audio/images/fonts) | "Just fetch from mp3quran/quran.com" | Everything routed via whitelisted `/api/proxy` (CORS + CORP added) or self-hosted (fonts, wasm core, quran-align files) → same-origin. Direct-CORS runtime probe avoids unnecessary proxying. |
| R8 | mp3quran whole-surah audio basmala lead-in | "Verse 1 starts at 0 s" | Anchor-window duration comparison (>1.6×) → lead-in offset; `clipStartOffsetSeconds` set; align to end of window. |
| R9 | Word-index mismatch between text and timing (different tokenizations) | Assume alignment | `reconcileWords` splits `text_uthmani` on U+0020 and checks against segment indices; mismatch → per-verse ayah fallback, never mis-highlighted words. |
| R10 | Background-tab throttling corrupts export | "RAF keeps running" | Real-time export + `visibilitychange` guard that pauses/warns; frames captured live so dropped RAF ticks drop frames, not corrupt the container. |
| R11 | Long-verse line wrapping / shaping | DOM text auto-layout | Per-word `fillText` with even row split, auto font-shrink, max 2 rows; RTL handled by drawing right→left. (Trade-off of canvas vs DOM, accepted for word-level highlighting.) |
| R12 | Vercel free-tier bandwidth via proxying | Proxy everything | CORS probe first → direct fetch when possible; audio cached with short TTL; functions are thin (no business logic). |
| R13 | Uthmani marker wrongness | U+FD3E/FD3F or Western digits | Renderer appends `U+06DD` + Arabic-Indic digits only; strips stray `U+FD3E`/`U+FD3F` from source text; schema invariant enforces it in validation. |
| R14 | FFmpegKit assumed for Android | "Use FFmpegKit" | Rejected (retired). Native MediaCodec+MediaMuxer chosen (constraint 9), NDK FFmpeg documented as contingency only. |
