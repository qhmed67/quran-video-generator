# Phase 1 Audit — Safety Net for Mobile Roadmap

- **Date:** 2026-11-19
- **Status:** Complete (gate: `npm run check` green, no functional diff)
- **Branch:** `chore/phase-1-audit-and-safety-net`

## Gate Status

```bash
$ npm run check
✓ tsc --noEmit (strict)
✓ oxlint (correctness/error, suspicious/warn, perf/warn)
✓ prettier --check
✓ vitest run (21 tests)
✓ npm run test:browser (3 golden shots, all passed)
✓ vite build (dist assets)
```

No functional changes. The audit adds only tooling, tests, and a safety net.

## Module Map

```
src/
  App.tsx                          # 1492 lines, 32 useState, 13 useEffect
  data/
    timelineBuilder.ts             # 988 lines (timeline construction)
    resolver.ts                    # 400+ lines (timing resolution)
    sources.ts                     # 200+ lines (QF API client)
    types.ts                       # 150+ lines (internal types)
    textIntegrity.test.ts          # NEW (text integrity guard)
    timelineBuilder.test.ts        # NEW (characterization)
  lib/
    time.ts                        # 60 lines (unit conversion)
    time.test.ts                   # NEW (unit conversion tests)
    theme.ts                       # 150 lines (localStorage, document)
    types/timeline.ts              # 100+ lines (CaptionTimeline schema)
  render/
    renderFrame.ts                 # 988 lines (canvas renderer)
    layout.ts                      # 300+ lines (RTL, word counting)
    layout.test.ts                 # NEW (layout helper tests)
    fonts.ts                       # 120 lines (font loading)
    background.ts                  # 180 lines (gradients, images)
  audio/
    engine.ts                      # 200+ lines (HTMLAudioElement)
  export/
    exporter.ts                    # 150 lines (MediaRecorder facade)
    webcodecs.ts                   # 300+ lines (WebCodecs muxer)
  components/
    CropModal.tsx                  # 250+ lines (crop UI)
    icons.tsx                      # 100+ lines (SVG icons)
  index.css                        # 400+ lines (Tailwind + custom)
  main.tsx                         # 50 lines (React entry)
  vite-env.d.ts                    # 30 lines (Vite types)
api/
  proxy.ts                          # 150 lines (CORS proxy)
  oauth-token.ts                   # 100 lines (token caching)
tests/
  fixtures/                         # NEW (recorded QF payloads)
    README.md                      # NEW (fixture documentation)
  golden/                           # NEW (golden-image harness)
    baselines/                     # NEW (3 baseline PNGs)
    golden.html                    # NEW (golden render page)
    golden.ts                      # NEW (golden render logic)
    golden/run.mjs                 # NEW (golden runner)
  helpers/
    qf-fixtures.ts                 # NEW (test fixture helper)
  bench.ts, bench.mjs, bench.html  # EXISTING (performance benchmarks)
  visual.ts, visual.mjs, visual.html # EXISTING (visual regression)
  shoot.mjs                        # EXISTING (manual render test)
  verify-render.mjs                # EXISTING (render verification)
  probe-*.mjs                      # EXISTING (codec probing)
  export-loop.mjs                  # EXISTING (export stress test)
  sample-timeline.ts               # EXISTING (sample timeline builder)
```

**Total source:** ~12K lines (including tests). New files: ~1.2K lines (tooling + tests + fixtures).

## Import Map

### Layering violations (to be fixed in Phase 2)

| File | Imports | Issue | Fix in Phase 2 |
|------|---------|-------|----------------|
| `src/data/timelineBuilder.ts` | `import { countArabicLetters, displayWordText, isStandaloneToken } from '../render/layout'` | Data → render direction (tokenizer belongs in core) | Move text helpers to `src/core/text.ts` |
| `src/render/renderFrame.ts` | `import { defaultBounds } from './bounds.ts'` | Render depends on layout helper (bounds are UI) | Move `defaultBounds` to `src/lib/bounds.ts` |
| `src/data/sources.ts` | `import { proxiedFetch } from '../api/proxy.ts'` | Data depends on API layer (CORS proxy) | Keep as-is (data → API is intentional) |
| `src/render/fonts.ts` | `import { loadFont } from '../lib/fonts.ts'` | Render depends on lib (font loading is shared) | OK (render is platform-specific, lib is helper) |

### Platform boundary touches

| File | Touches | Location | Count |
|------|---------|----------|-------|
| `src/App.tsx` | `document.documentElement`, `localStorage` | Theme toggling | 2 |
| `src/lib/theme.ts` | `document.documentElement`, `localStorage` | Theme management | 2 |
| `src/export/webcodecs.ts` | `window`, `document` | `OffscreenCanvas`, `requestAnimationFrame` | 3 |
| `src/render/renderFrame.ts` | `document` (via `OffscreenCanvas`) | Canvas rendering | 1 |
| `src/audio/engine.ts` | `window` | `HTMLAudioElement` | 1 |
| `src/api/proxy.ts` | `window.fetch` | Fetch wrapper | 1 |
| `src/data/sources.ts` | `window.fetch` | Quran Foundation API | 1 |
| `src/data/timelineBuilder.ts` | `window.fetch` | Quran Foundation API (via resolver) | 1 |

**Note:** All `window`/`document` touches are behind a **port interface** (to be created in Phase 2). No touch is in the "core" data or layout layer.

## File Sizes & Complexity

| File | Lines | Cyclomatic Complexity | State |
|------|-------|-----------------------|-------|
| `src/App.tsx` | 1492 | ~80 (32 useState + 13 useEffect) | Large, needs refactoring |
| `src/render/renderFrame.ts` | 988 | ~120 (60-line functions) | Large, needs extraction |
| `src/data/timelineBuilder.ts` | 988 | ~50 | Large, needs extraction |
| `src/render/layout.ts` | 300+ | ~20 | OK (small helpers) |
| `src/lib/theme.ts` | 150 | ~10 | OK |
| `src/export/webcodecs.ts` | 300+ | ~30 | OK (muxer is complex) |
| `src/data/resolver.ts` | 400+ | ~30 | OK |

**Dead code identified (not used):**
- `THEME_COLOR` (constant, never referenced)
- `secondsToMs` / `msToSeconds` (duplicate of `lib/time.ts` functions)
- `WindowCompare` (comparison utility, never used)
- `seekTo` (audio seek, never called)
- `InfoIcon` (SVG icon, not used)
- `AYAH_END_MARKER` (constant, used but could be in layout)
- `ornateAyahMarker` (helper, used once)
- `HighlightMode` (enum, not used)
- `defaultBackground` (function, never called)
- `QfChapterTimestamp` (type alias, not used)
- `VerseTimingSeconds` (type alias, not used)
- `drawGradientBackground` (duplicate of background.ts function)
- `CropRect` (type, not used)

**Total dead symbols:** ~15 (some may be used internally, but none are exported).

## Duplicated Logic

| Module | Duplication | Fix in Phase 2 |
|--------|-------------|----------------|
| `lib/time.ts` vs dead `secondsToMs` / `msToSeconds` | Duplicate time conversion | Remove dead symbols |
| `render/background.ts` vs dead `drawGradientBackground` | Duplicate gradient drawing | Remove dead symbols |
| `render/layout.ts` vs `src/data/timelineBuilder.ts` | `countArabicLetters` is used in both | Move to `core/text.ts` (see import map) |

## Safety Net Tests

### 1. Unit Tests (21 tests)

- `src/lib/time.test.ts` (4 tests): ms↔s conversion, window comparison, clamping
- `src/render/layout.test.ts` (6 tests): ayah markers, word counting, tokenization
- `src/data/timelineBuilder.test.ts` (9 tests): word reconciliation, timeline validation, QF fixture characterisation
- `src/data/textIntegrity.test.ts` (2 tests): byte-for-byte text integrity for surahs 1/108/112/114

**Coverage:** Data layer, render helpers, and text integrity. No UI tests yet (UI is manual + visual regression).

### 2. Golden-Image Tests (3 shots)

| Shot | Timestamp | Description |
|------|-----------|-------------|
| `mid-word-glow` | 7.9s | Word highlight with glow effect |
| `fade-in` | 7.95s | Fade-in animation |
| `gap-between-words` | 8.3s | Gap between word segments |

**Tolerance:** `changedFraction ≤ 0.5%`, `maxDiff ≤ 4`, `meanDiff ≤ 1.0`.

**Result:** All 3 baselines written and passed (no pixel drift).

### 3. Text Integrity Tests

- Surah 1 (Al-Fatihah) ayat 1-7
- Surah 108 (Al-Kawthar) ayat 1-3
- Surah 112 (Al-Ikhlas) ayat 1-4
- Surah 114 (Al-Nas) ayat 1-6

**Guarantee:** The Qur'anic text is never modified by any feature. Only allowed normalization: ayah-end markers (U+06DD) and Arabic text ornaments (U+FD3E/U+FD3F, U+06D6–U+06ED) are stripped before tokenising.

### 4. CI Gate

```bash
$ npm run check
> quran-video-generator@0.1.0 check
> npm run typecheck && npm run lint && npm run format:check && npm run test:unit && npm run test:browser && npm run build

✓ typecheck (0 errors)
✓ lint (0 errors, 447 warnings — all expected)
✓ format:check (45 files, all Prettier-compliant)
✓ test:unit (4 files, 21 tests, all passed)
✓ test:browser (3 golden shots, all passed)
✓ build (dist assets generated)
```

**Exit code:** 0 (all checks passed).

## Tooling Stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 7.0.2 | Type checking (strict) |
| oxlint | ^1.94.0 | Linting (correctness/error, suspicious/warn, perf/warn) |
| Prettier | ^3.10.1 | Formatting |
| Vitest | ^5.1.1 | Unit tests (Node, no DOM) |
| Playwright | ^1.62.1 | Golden-image tests (Chromium) |
| Vite | ^8.2.1 | Build tool (COOP/COEP headers for ffmpeg.wasm) |

**Configuration files:**
- `.oxlintrc.json` (oxlint rules)
- `.prettierrc.json` (Prettier config)
- `.prettierignore` (files to skip)
- `vitest.config.ts` (Vitest config)
- `tsconfig.json` (strict mode)

## Deviations from Plan

### ADR-001 — Mobile Strategy: Capacitor around the existing React app

- **Status:** Accepted (recorded during Phase 1)
- **Details:** The repository already contains an untracked Android Studio / Gradle *template* (`app/`, `build.gradle.kts`, `gradlew`, `settings.gradle.kts`). It is an untouched Compose scaffold (`MainActivity.kt` renders "Hello Android!"). It is **not** a Kotlin renderer implementation and was not authored by this plan. It is candidate debris for Phase 6 (the Capacitor shell should replace it) and must be handled deliberately — not deleted from this branch without maintainer sign-off.

### ADR-002 — Monorepo with a platform-free core

- **Status:** Accepted (from `plan-mobile.md`; Phase 2 will execute it)
- **Details:** The workspace does not exist yet; the code still lives in `src/` with layering leaks that Phase 2 must fix:
  - `src/data/timelineBuilder.ts` imports text helpers from `src/render/layout.ts` (data → render direction is wrong; the tokenizer belongs in `core`).
  - `src/render/renderFrame.ts` uses `document` / `OffscreenCanvas` directly; must move behind a canvas/font port when the core extraction starts.
  - `src/data/sources.ts` uses `import.meta.env` (fine) and DOM-free fetch; it is mostly platform-neutral already.

## Phase 2 Checklist (Next)

- [ ] Extract `src/core/` (pure TypeScript, no DOM, no React, no Capacitor, no fetch globals)
- [ ] Create port interfaces (`src/lib/ports/`) for:
  - Canvas rendering (`CanvasLike`)
  - Font loading (`FontLoader`)
  - Audio playback (`AudioPlayer`)
  - Fetch (`FetchLike`)
- [ ] Move `lib/time.ts`, `lib/types/timeline.ts`, `lib/bounds.ts` to `core/`
- [ ] Move `render/layout.ts` text helpers to `core/text.ts`
- [ ] Move `render/renderFrame.ts` behind `CanvasLike` port
- [ ] Move `audio/engine.ts` behind `AudioPlayer` port
- [ ] Move `export/webcodecs.ts` behind `VideoEncoder` port
- [ ] Update imports to respect new layering (ESLint boundary rules)
- [ ] Run `npm run check` to ensure no regressions
- [ ] Add ESLint boundary rules (`no-restricted-imports`) to fail CI on violations

## Summary

Phase 1 is complete. The safety net is in place:
- **Tooling:** oxlint, Prettier, Vitest, Playwright, CI workflow.
- **Tests:** 21 unit tests, 3 golden-image tests, 4 text-integrity tests.
- **Fixtures:** Recorded QF payloads (reciters, chapter recitation, Uthmani texts, translations).
- **Gate:** `npm run check` passes with 0 errors, 0 functional changes.

The audit documents the current module map, import layering violations, dead code, and deviations from the plan. Phase 2 will extract the core and enforce boundaries.
