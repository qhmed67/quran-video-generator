# Dev changelog — quran-video-generator

Phase notes appended here per `plan-mobile.md` §4 ("each phase ends with a short
note"). Not user-facing; for maintainers and future agents.

## Phase 1 — Audit and safety net (2026-11-19)

**What changed.**

- Added the safety net required before mobile work: `npm run check`
  (`tsc --noEmit` + oxlint + prettier + vitest + golden browser shots + vite
  build), `docs/audit.md` (module map, layering-leak table, dead code), and the
  supporting tooling/tests.
- Characterization/unit tests: 21 unit tests (time helpers, timeline builder,
  text integrity, RTL layout), a golden-image test of `renderFrame` (3 committed
  baselines in `tests/golden/baselines/`), and text-integrity fixtures under
  `tests/fixtures/`.

**Gate.** Green. No functional diff in the app.

**Deferred.** None within Phase 1. (The untracked Android Studio/Gradle template
at the repo root was identified as candidate debris for Phase 6 — not touched.)

## Phase 2 — Restructure into packages (2026-11-19)

**What changed.**

- Converted to npm workspaces per ADR-002 (source-level consumption: no per-package
  build step; `tsconfig.json` `paths` + `vite.config.ts` `resolve.alias` +
  workspace symlinks map `@qvg/*` → `packages/*/src/index.ts`; vitest picks up
  `packages/**` tests).
- Moved pure vocabulary into `@qvg/core`: `CanvasLike` / `Canvas2DContext` /
  `FontSet`, time helpers, timeline schema types, Arabic text helpers.
- Added port contracts in `packages/platform/src/ports/` (Clock, Http, Storage,
  File, Audio, Export, Haptics, FontLoader) with shared error/value types, plus
  `@qvg/platform/web` adapters that wrap today's behavior 1:1.
- `renderFrame` now takes a `CanvasLike` (and internal helpers now use the core
  `Canvas2DContext` union) instead of a single 2D context.
- Added ESLint boundary rules (`no-restricted-imports` + `no-restricted-globals`)
  so CI fails on package-boundary violations.

**What was learned.**

- The renderer had to adopt the `Canvas2DContext` union internally for the
  `CanvasLike` signature to typecheck without per-call casts.

**Deferred.**

- App wiring to ports (adapters exist; the app still calls `src/...` modules
  directly for now).
- Thin `ExportEngine` web adapter over the existing WebCodecs loop — first
  Phase 3 item.

## Deviations from the plan

- The plan sketched `StoragePort` over IndexedDB; the shipped web adapter is
  `LocalStoragePort` over `window.localStorage`. The speculative IndexedDB port
  was dropped during Phase 2 because today's persistence is localStorage-only.
- `AudioPort.prepareClip`'s `endSeconds` is clip-relative (seconds from the clip
  start), mirroring the pre-existing `playClip(clipEndSeconds)` contract; only
  `startOffsetSeconds` is file-absolute.
- The plan's Phase 2.3 asks for a font-loader port; the shipped shape is
  `FontLoader` (port) + `FontSet` (core value) — resolved fonts are passed through
  the render options as today.
