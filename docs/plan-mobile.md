# PLAN.md — Quranic Video Generator: full word-level customization + native Android/iOS apps

> Audience: an autonomous coding agent working in `qhmed67/quran-video-generator`.
> Read this whole file before touching code. Work phase by phase. Do not skip the gates.

---

## 0. Goals (what "done" means)

1. **Full customization down to the single word.** The user can style, annotate and
   interact with any word in any ayah, not only the whole video. Hover on desktop,
   tap / long-press on touch devices.
2. **Real Android and iOS apps** (installable, from the stores), so nobody has to open the web UI.
   They must reuse the same engine as the web app. No second implementation of the renderer or the timeline.
3. **Maintainable code.** A new style option, a new reciter source, or a new export
   backend must each be addable by touching one small, obvious place.

Non-goals (for now): accounts/cloud sync, social publishing, ASR/GPU features,
a custom Quran text editor. **Qur'anic text is never modified by any feature in this plan.**

---

## 1. Known state of the repo (read this, then verify it in Phase 1)

From the README and `DESIGN.md` (the only files that were readable when this plan was written):

- Vite + React + TypeScript pure SPA, everything client-side.
- Vercel hosts static files and two serverless functions: `api/oauth-token.ts`, `api/proxy.ts`
  (the Quran Foundation client secret lives only there).
- Layout: `src/lib` (time units, timeline types), `src/data` (QF v4 sources, resolver,
  timeline builder), `src/render` (shared `renderFrame` on canvas, RTL layout, fonts,
  backgrounds), `src/audio` (audio engine), `src/export` (MediaRecorder capture + ffmpeg.wasm).
- Audio and word timings come from QF v4 `chapter_recitations`; fallback is estimated even-split captions with no audio.
- `docs/architecture.md` exists and mentions a *Phase 2: Android/Kotlin* idea.
  **This plan supersedes that idea** (see ADR-001). Update that doc when you are done.
- `DESIGN.md` is the design-token source of truth: one green accent, no palette values
  inside components, tokens only, no new font families. **Keep following it.**

**Not verified when this plan was written:** the contents of `src/`, `tests/`,
`docs/architecture.md`, `package.json`, the open pull request. Phase 1 starts by
reading them. If reality differs from this plan, follow the principles, adjust the
details, and record the difference in `docs/adr/`.

---

## 2. Decisions (record each as an ADR in `docs/adr/NNN-title.md`)

### ADR-001 — Mobile strategy: Capacitor around the existing React app

Options considered:

| Option | Reuse of existing code | Cost | Verdict |
|---|---|---|---|
| Native Kotlin + Swift | ~0% (two rewrites of renderer, timeline, UI) | Very high, two codebases to keep in sync | No |
| Flutter / React Native | Data layer only; renderer and UI rewritten | High | No |
| **Capacitor (WebView shell + native plugins)** | ~90%: renderer, timeline, UI, styles | Low–medium | **Yes** |

Why: the hard parts (RTL Uthmani layout, word-synced canvas rendering, style resolution)
already exist in TypeScript and must have *one* implementation. Capacitor lets Android and
iOS run the same code and gives native access (files, gallery, share, haptics, status bar)
through plugins.

Known cost: encoding video inside a WebView is the weak spot, so mobile export is native
(see ADR-003) and sits behind an interface that can be swapped without touching anything else.

### ADR-002 — Monorepo with a platform-free core

Introduce npm workspaces:

```
packages/
  core/        # PURE TypeScript. No DOM, no React, no Capacitor, no fetch globals.
               # timeline, project model, style schema + resolver, layout math, hit-testing math,
               # undo/redo, migrations, validation, text-integrity checks
  render/      # canvas rendering (depends on core). Takes a CanvasLike, never touches `document`.
  data/        # Quran Foundation client, reciter/audio sources, resolver (depends on core)
  ui/          # React components + hooks + design tokens (depends on core, render)
  platform/    # PORT INTERFACES + adapters: web/, native/ (Capacitor)
apps/
  web/         # Vite SPA entry (what exists today)
  mobile/      # Capacitor project (android/, ios/ generated here)
api/           # Vercel functions stay where they are, or move to apps/api. Keep deployed behavior identical.
docs/adr/      # decisions
```

Enforce boundaries with ESLint (`eslint-plugin-boundaries` or `no-restricted-imports`):
`core` may import nothing from other packages; `render` and `data` may import only `core`;
`ui` may not import from `platform/native` directly; only `apps/*` wires adapters to ports.
CI fails on violations. This is what keeps the code from turning into a heap.

### ADR-003 — Mobile export is native (hardware encoder), behind a port

**Default on Android and iOS: a native Capacitor plugin (`QvgExport`) that encodes with the
device's hardware encoder** (Android `MediaCodec` + `MediaMuxer`, iOS `AVAssetWriter` / AVFoundation).
The WebView keeps doing the only thing it must do: render frames with the *single* shared
`renderFrame`. Native code never draws, lays out or styles anything.
The web app keeps MediaRecorder + ffmpeg.wasm.

```ts
// packages/platform/src/ports/ExportEngine.ts
export interface ExportEngine {
  readonly id: 'native' | 'webcodecs' | 'mediarecorder' | 'ffmpeg-wasm';
  isSupported(): Promise<ExportCapability>;       // codecs, max resolution, est. speed
  export(job: ExportJob, onProgress: (p: ExportProgress) => void, signal: AbortSignal): Promise<ExportResult>;
}
```

**Frame transport protocol** (raw 1080x1920 RGBA is about 8 MB per frame, so never send pixels over the Capacitor bridge):

1. `begin({ jobId, width, height, fps, totalFrames, bitrate, codec: 'h264', audio })`
   Native creates a temp dir and the encoder session, returns `{ frameDir }`.
   `audio` = `{ path, startMs, endMs }` pointing at the recitation file already cached on disk.
2. For frame `i` in `0..N-1`: JS renders at `t = i / fps` (deterministic, never wall-clock),
   encodes to JPEG (`quality >= 0.92`, `OffscreenCanvas.convertToBlob` when available), writes
   `frameDir/frame_000123.jpg`, then calls `pushFrame({ jobId, index, path })`. Only paths and
   indices cross the bridge.
3. **Backpressure:** JS may be at most `K` frames ahead of native's last acknowledged index
   (start with `K = 8`, tune in the spike). Native deletes each frame file right after encoding it.
   Progress comes back as native events `{ phase: 'encode', index }`.
4. `finish({ jobId })`: native flushes the video track, decodes/trims the audio to the ayah range,
   encodes AAC, muxes, writes the MP4 to app cache, returns `{ path, durationMs, width, height }`.
   Saving to Photos/Gallery and sharing then go through `FilePort`.
5. `cancel({ jobId })` aborts the session and deletes the temp dir. It must be safe to call at any time, including twice.

Rules for the plugin:

- One shared TypeScript API in `packages/platform/src/native/QvgExport.ts`; Kotlin and Swift
  implement the same contract. No behavior may exist on only one platform.
- Output spec is identical on both: H.264 (baseline/main/high chosen by capability), AAC,
  MP4, BT.709 / sRGB color tagging, fixed fps, and exactly the requested resolution.
- If the encoder rejects a configuration (profile, bitrate, size), fall back in a defined order
  (lower profile, then lower bitrate) and report what was used in `ExportResult`. Never silently change resolution or fps.
- Error codes are an enum shared by TS, Kotlin and Swift (`ENCODER_UNAVAILABLE`, `DISK_FULL`,
  `AUDIO_DECODE_FAILED`, `CANCELLED`, ...). The UI maps each code to a sentence that says what happened and what to do next.
- JPEG is lossy. If the spike shows visible artifacts around glow or thin diacritics, switch the
  intermediate to PNG (slower) or raise quality. Decide with a side-by-side frame comparison, not by eye on one frame.
- If file writes turn out to be the bottleneck, try other transports behind the same
  `pushFrame` contract (custom URL scheme handler, local loopback HTTP, shared-memory style
  plugins). Do not change the contract for the rest of the app.

Fallbacks, used only if the Phase 5 spike shows the native path is worse on a given platform:

1. WebCodecs `VideoEncoder` (+ `AudioEncoder`) with a JS MP4 muxer (hardware encoder, no bridge, but codec support varies by WebView version).
2. MediaRecorder on `canvas.captureStream()` (real-time only, app must stay in the foreground).

Do **not** adopt FFmpegKit: it was retired upstream, so verify the status of any fork before even considering it.

### ADR-004 — Secrets never ship in the app

The QF client secret must not be in the mobile binary. Mobile uses the already-deployed
`api/oauth-token` and `api/proxy` endpoints through a configurable `API_BASE_URL`
(env at build time). Add rate limiting and an allowlist of proxied paths on the server if not
already present. Cache API responses locally so the app works offline once content is fetched.

---

## 3. Core design: styles, words, and interaction

### 3.1 Identity of a word

```ts
type WordRef = { surah: number; ayah: number; word: number };   // 1-based, matches QF numbering
const wordKey = (w: WordRef) => `${w.surah}:${w.ayah}:${w.word}`;
```

The timeline already has per-word segments when the source provides them. Every word in the
timeline must carry a stable `WordRef`. When only verse-level timing exists, words still get
refs (estimated timing), and the UI says so (existing "estimated timing" notice).

### 3.2 Style model: layered rules, one pure resolver

```ts
// packages/core/src/style/types.ts
export interface WordStyle {            // every field optional in overrides, required in defaults
  color: string;  opacity: number;  fontScale: number;
  glow: { color: string; radius: number } | null;
  shadow: ShadowSpec | null;
  highlight: { fill: string; radius: number } | null;   // background pill behind the word
  underline: UnderlineSpec | null;
  entrance: AnimationSpec | null;       // e.g. fade, rise; time-based only, deterministic
  // add new properties HERE and nowhere else; see 3.5
}

export type Target =
  | { kind: 'global' }
  | { kind: 'state'; state: 'upcoming' | 'active' | 'spoken' }  // relative to playback time
  | { kind: 'ayah'; surah: number; ayah: number }
  | { kind: 'wordRange'; from: WordRef; to: WordRef }
  | { kind: 'word'; ref: WordRef };

export interface StyleRule { id: string; target: Target; props: Partial<WordStyle> }
```

Resolution order, lowest to highest priority:
`DEFAULTS < global < state < ayah < wordRange < word`.
Within the same level, later rule wins. Implement `resolveWordStyle(project, ref, playbackState): WordStyle`
as a pure function in `core`, with a per-frame cache keyed by rule-set version. It must be:
deterministic (same input, same output), allocation-light (called per word per frame), and
fully unit-tested including conflicts.

### 3.3 Annotations (text the user adds per ayah or per word)

The request mentions placing a word/text on each ayah. Model it explicitly and keep it **separate from the Qur'anic text**:

```ts
interface Annotation {
  id: string;
  anchor: { kind: 'ayah'; surah: number; ayah: number } | { kind: 'word'; ref: WordRef };
  placement: 'above' | 'below' | 'inline-after';
  text: string;  lang: 'ar' | 'en' | string;
  style: Partial<TextStyle>;
}
```

Use cases: translation line, tafsir note, reciter name, a custom label. Annotations render with a
visibly different style path (never the mushaf font) so they can never be confused with the ayah.
If, during Phase 1, you decide the original request meant something else (for example per-word
downloads of audio), stop and write the assumption into `docs/adr/` before building.

### 3.4 Project document (the single source of truth for a video)

```ts
interface Project {
  schemaVersion: number;                // bump on any breaking change
  id: string; name: string; createdAt: string; updatedAt: string;
  source: { reciterId: number; surah: number; fromAyah: number; toAyah: number };
  format: '9:16' | '1:1';
  background: BackgroundSpec;
  rules: StyleRule[];
  annotations: Annotation[];
}
```

- Validate with **zod** (or the existing validator if there is one) on load/import.
- `migrations/` folder: `v1→v2.ts` etc., each a pure function with a test and a fixture file.
- Export/import as `.qvg.json`. Persist through `StoragePort` (IndexedDB on web, app filesystem on native).
- Undo/redo: command or patch-based history in `core` (immer patches are fine), capped at N steps,
  coalescing drag/slider changes into one step.
- UI state (hover, selection, open panels) is **not** in `Project`. Keep it in a separate store.

### 3.5 Extensibility rule (this is the maintainability contract)

Adding a new word style property must require changes in only:
(1) the `WordStyle` type + default, (2) one paint function in `render/paint/`,
(3) one control in `ui/inspector/` registered in a controls table.
No `switch` statements spread across files. Use a registry:

```ts
export const wordStyleProps: Record<keyof WordStyle, PropDescriptor> = { ... };
```

### 3.5b Interaction layer (hover on desktop, tap on touch)

- `renderFrame` must **return a layout index** (word rects in canvas coordinates, plus ayah
  bounds) or expose `layoutFor(project, size)` in `render`. Hit-testing is a pure function in
  `core` (`hitTest(layoutIndex, point) → WordRef | null`), unit-tested.
- Preview canvas pointer handling lives in one hook, `usePreviewPointer`:
  - Mouse: `pointermove` → `hoverWord` (UI state only), `click` → select.
  - Touch: `tap` → select, `long-press` → start range selection, drag handles to extend.
  - Pen/keyboard: arrow keys move selection word by word, Enter opens the inspector.
- Hover/selection feedback is drawn on a **separate overlay canvas**. It must never be baked into exports.
- Inspector: a side panel on desktop, a **bottom sheet** on mobile. Edits apply to the
  selection (word / range / whole ayah / global) and create or update a `StyleRule` at that scope.
  Show where the current value comes from ("inherited from ayah", "set on this word") with a reset button.
- Accessibility: all inspector controls keyboard-operable, 44–48px touch targets on mobile (matches `DESIGN.md`).

---

## 4. Phases (each ends with a gate; do not start the next until the gate passes)

### Phase 1 — Audit and safety net  (no behavior change)

1. Read: `package.json`, `vite.config.ts`, `src/**`, `tests/**`, `api/**`, `docs/**`, the open PR.
2. Produce `docs/audit.md`: module map, who imports whom, file sizes, duplicated logic, dead code,
   places that touch `window`/`document`/`localStorage`/`fetch` (these block moving code into `core`).
3. Add or fix tooling: ESLint (strict TS), Prettier, `tsc --noEmit`, Vitest, a CI workflow
   (typecheck + lint + test + build). Add `npm run check` that runs all of them.
4. Write **characterization tests** around today's behavior: timeline building from a recorded
   QF fixture (save fixtures under `tests/fixtures/`, do not hit the network in tests), time-unit
   conversion, RTL layout of a known ayah, and a **golden-image test** of `renderFrame` at 3 timestamps.
5. Add a **text integrity test**: for several surahs, the concatenated word text in the timeline
   equals the source text byte for byte. This test guards every later phase.

**Gate:** `npm run check` is green in CI; audit doc committed; no functional diff in the app.

### Phase 2 — Restructure into packages  (behavior-preserving)

1. Convert to npm workspaces per ADR-002. Move code in small commits, one module at a time,
   keeping the app working after each commit.
2. Extract port interfaces in `packages/platform/src/ports/`:
   `StoragePort`, `FilePort` (save/share/pick image), `ExportEngine`, `AudioPort` (clock + play),
   `HttpPort` (base URL, auth), `HapticsPort` (optional), `Clock`. Provide `platform/web` adapters
   that wrap today's behavior exactly.
3. Make `render` accept a `CanvasLike` (OffscreenCanvas or HTMLCanvasElement) and a font-loader port.
4. Add ESLint boundary rules and fail CI on violations.
5. Rules for new/moved code: **no file over ~300 lines, no function over ~60 lines**, no
   `any` (use `unknown` + narrowing), no default exports in libraries, no barrel files that
   re-export entire packages, named exports with explicit public API per package.

**Gate:** golden-image and integrity tests unchanged; web app behaves identically; boundaries enforced.

### Phase 3 — Project model, styles, annotations  (web first)

1. Implement section 3.1–3.4 in `packages/core` with full unit tests (resolver conflicts,
   migrations, undo/redo coalescing, zod validation of malformed input).
2. Make the renderer consume `resolveWordStyle` per word (replace the old global-only style path).
   Keep the old global style controls working: they now write `global` rules.
3. Implement annotations rendering (section 3.3), including RTL/LTR mixing rules from `DESIGN.md`.
4. Save/load/import/export projects. Autosave debounced to `StoragePort`.

**Gate:** with no per-word rules, output is pixel-identical to Phase 2 (golden tests).
With rules, golden tests prove precedence. Integrity test still green.

### Phase 4 — Interaction and inspector UI

1. Layout index + `hitTest` (section 3.5b) with tests.
2. `usePreviewPointer`, overlay canvas, selection model (word / range / ayah), hover.
3. Inspector built from the `wordStyleProps` registry (section 3.5), with inheritance display and reset.
4. Annotation editor (add/edit/delete per ayah or word).
5. Responsive layout per `DESIGN.md`: the rails become a bottom sheet under 720px. Test at 360×640, 390×844, 768×1024.
6. Undo/redo UI (buttons + shortcuts), keyboard navigation.

**Gate:** Playwright tests: hover highlights a word without changing the export; tapping a
word, changing its color, then exporting a frame shows only that word changed; undo restores it.

### Phase 5 — Native export plugin (spike first, then build)

1. **Spike (time-boxed; write results to `docs/adr/003-export-benchmark.md`).**
   Build the thinnest possible `QvgExport` on one real mid-range Android phone and one real iPhone:
   `begin` -> N x (`render JPEG -> write file -> pushFrame`) -> `finish`, with a solid-color or simple-caption clip. Measure for a
   30 s 1080x1920 @30fps clip: frame transport throughput (frames/s), total export time, peak memory,
   device temperature/throttling over a 60 s clip, output quality (frame comparison vs PNG), A/V sync
   drift, and whether the MP4 plays in Gallery/Photos and previews in WhatsApp.
   Run the WebCodecs path only as a reference point, not as the plan.
   **Pass criteria for the native path:** at least 1x real time on the mid-range Android phone (target 2x or better),
   no OOM on a 60 s clip, A/V drift under 40 ms, correct playback everywhere above.
   If a platform misses them, tune (`K`, JPEG quality, transport) before switching to a fallback; record each experiment.
2. **Implement** the plugin on both platforms against the single TS contract in ADR-003.
   Add `NativeExportEngine` in `platform/native` that wraps it and implements `ExportEngine`.
3. **Contract tests:** the same fixture job (recorded timeline + audio fixture) run on an Android
   emulator/device and an iOS simulator/device must produce MP4s with identical duration (within one frame),
   resolution, fps, codec and an audio track. Automate on the Android emulator in CI; run iOS in a documented manual/macOS job.
4. **Progress, cancel, errors:** progress phases (render / encode / mux), `AbortSignal` mapped to `cancel`, enum error codes (ADR-003).
5. **Lifecycle:** keep the screen awake during export. Android: use a foreground service/notification
   for long exports. iOS: request a short background grace period and warn the user that leaving the app may pause the export.
   If an export is interrupted, clean temp files on next launch and let the user retry (no partial-resume promised).
6. **Storage hygiene:** check free disk space before starting (frames are deleted as consumed, but verify the peak),
   and always remove the temp dir on success, failure or cancel.

**Gate:** exported MP4 plays in Android Gallery, iOS Photos and WhatsApp preview with correct
audio sync on the benchmark devices; the spike numbers and the chosen defaults per platform are recorded in the ADR.

### Phase 6 — Mobile shells (Android + iOS)

1. `apps/mobile`: Capacitor config, app id, name, icons/splash from the existing logo,
   `android/` and `ios/` projects checked in (generated native folders are committed, with notes on what is customized).
2. Native adapters in `platform/native`: Filesystem, Share, Save to Photos/Gallery
   (permissions with clear rationale strings), Haptics, KeepAwake, StatusBar/SafeArea,
   and the `QvgExport` plugin from Phase 5 wired as the default `ExportEngine` on mobile.
   Recitation audio is downloaded to a file (not held in memory) so the plugin can read it by path.
3. Network: `API_BASE_URL` per environment; response cache (stale-while-revalidate) so
   previously fetched surahs and audio work offline. Cap cache size, provide "Clear cache".
4. Fonts and the Uthmani font are bundled in the app, not fetched.
5. WebView caveats to handle explicitly: no COOP/COEP assumptions, safe-area insets,
   keyboard resize behavior, back-button handling on Android, audio autoplay policy
   (start audio only on a user gesture), lifecycle pause/resume.
6. Build scripts: `npm run mobile:sync`, `mobile:android`, `mobile:ios`. CI builds a debug APK on every PR.
   iOS builds need macOS: document the manual steps and, if possible, a macOS CI job.

**Gate:** debug APK installs and completes the full flow (choose surah → style a word →
export → save to gallery) on a real Android device. Same flow on an iOS simulator and,
before release, a real iPhone.

### Phase 7 — Release readiness

1. Performance budgets (write them in `docs/performance.md`, enforce what can be enforced):
   preview stays interactive on a mid-range phone; idle preview costs no rendering work (as `DESIGN.md` requires).
2. Content/licensing checklist in `docs/compliance.md`: the license of the KFGQPC font,
   Quran Foundation API terms and attribution, reciter audio redistribution terms, background
   media licenses, and store policy notes for religious content. **Surface anything unclear
   to the maintainer; do not guess.**
3. Privacy: no analytics by default; if added, opt-in and documented. Privacy policy draft.
4. Store assets and metadata drafts; versioning and changelog; signing keys are the maintainer's
   job (document the steps, never commit keys).
5. Update `README.md`, `docs/architecture.md` (remove the obsolete Kotlin plan), add `CONTRIBUTING.md`.

---

## 5. Engineering standards (apply to every commit)

**Structure**
- One responsibility per file. Co-locate tests (`foo.ts` + `foo.test.ts`).
- Dependencies point inward: `apps → ui/platform → render/data → core`. Never the other way.
- Side effects (network, storage, time, randomness) only through ports. `core` is pure.

**Types and validation**
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any`, no non-null `!` without a comment.
- Anything crossing a boundary (API responses, imported files, stored data) is validated at the edge and typed inside.

**State and UI**
- Components are small and dumb; logic lives in hooks and `core`.
- No palette, radius, duration or shadow literals in components: read tokens only (`DESIGN.md`).
- Do not add a UI or state library unless the audit shows a real need; record it in an ADR first.

**Testing**
- Unit tests for `core` (aim for near-complete coverage there), golden-image tests for the renderer,
  Playwright for key flows, fixtures for all network data. Tests never call the real API.
- Every bug fix lands with a regression test.

**Change management**
- Small, reviewable commits with conventional messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- Refactors and behavior changes never share a commit.
- Each phase ends with a short note appended to `docs/CHANGELOG-dev.md`: what changed, what was learned, what is deferred.
- If a requirement is ambiguous or this plan conflicts with reality, **stop and ask the maintainer**
  (or write the assumption in an ADR) rather than silently choosing.

**Never**
- Never alter, normalize, reorder or "fix" Qur'anic text. Styling only.
- Never commit secrets, keystores, or `.env` files.
- Never put the QF client secret in a client or mobile bundle.
- Never add a second implementation of timeline or rendering logic for mobile.

---

## 6. Risks to watch

| Risk | Mitigation |
|---|---|
| Frame transport (WebView to native) is the bottleneck | Only paths cross the bridge, bounded look-ahead `K`, JPEG tuning, alternative transports behind the same contract; measured in the Phase 5 spike on real devices |
| Kotlin and Swift implementations drift apart | One TS contract, shared error enum, contract tests that compare MP4 properties from both platforms |
| Per-word styling slows rendering | Cache resolved styles per rule-set version; benchmark in Phase 3; paint only what changed |
| Hover/tap hit-testing drifts from rendered layout | Hit-test uses the *same* layout index the renderer produced; golden + unit tests |
| Scope creep in customization options | Registry pattern (3.5); add options only via that path; maintainer approves new props |
| Licensing of font/audio/API in store apps | Phase 7 compliance checklist; escalate unknowns |
| iOS build requires macOS | Document; use a macOS CI runner or the maintainer's Mac for release builds |
| Old saved projects break after schema change | `schemaVersion` + migration tests with frozen fixtures |

---

## 7. Order of work summary

1. Audit + tests + CI
2. Packages + ports + boundaries
3. Project/style/annotation model (core + renderer)
4. Interaction + inspector UI
5. Native export plugin: spike on real devices, then Kotlin + Swift implementations
6. Capacitor shells (Android first, then iOS)
7. Compliance, performance, docs, release

Start with Phase 1 now. Report back with `docs/audit.md` and any deviations from this plan before starting Phase 2.
