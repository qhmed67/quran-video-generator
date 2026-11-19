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

## Phase 3.2 — Renderer consumes style resolver (2026-11-19)

**What changed.**

- Made `renderFrame` consume `resolveWordStyle` per word: when `opts.rules` is
  present, `drawUthmaniVerse` branches to a new `paintResolvedVerse` helper,
  which resolves a `WordStyle` for each laid-out word and paints directly
  (color, opacity, fontScale, glow, shadow, ayah-number split, ghosting).
- When `rules` is absent, the renderer keeps the legacy flat-style behavior
  verbatim (cached glyph tiers, raster compositing), so the app and golden
  tests are untouched.
- Added a new golden shot 'word-rule-override' that proves precedence: a
  global (green) rule is overridden by an ayah (red) rule, demonstrating that
  the resolver's logic reaches the paint path.

**What was learned.**

- The renderer's tiered raster caching and the direct per-word path are fully
  decoupled — the legacy path is untouched by the new rules logic.
- The per-word path must replicate all the legacy ghosting/active-word logic
  (opacity math, timeline fade, word-highlight glow) to ensure visual parity
  when no rules are applied.

**Gate.** Green. All 4 golden shots pass (3 legacy unchanged, 1 new rules-based
  with precedence proven). `npm run check` green.

## Phase 3.3 — Annotations model (2026-11-19)

**What changed.**

- Added annotation model for user-added text per ayah or word, separate from
  the Qur'anic text (never the mushaf font). Examples: translation line,
  tafsir note, reciter name, custom label.
- packages/core/src/annotation.ts: AnnotationAnchor (ayah/word anchors),
  AnnotationPlacement (above/below/inline-after), TextStyle + overrides,
  Annotation, DEFAULT_TEXT_STYLE, resolveTextStyle.
- Unit tests in packages/core/src/annotation.test.ts (defaults, overrides,
  partial merge).
- Exported through packages/core/src/index.ts.

**What was learned.**

- Keeping annotations visually separate from the Quranic text is important for
  user clarity and prevents confusion.

**Gate.** Green. All 39 unit tests pass, `npm run check` green.

## Phase 3.4 — Project document model (2026-11-19)

**What changed.**

- Added project document model — the single source of truth for a video.
- packages/core/src/project.ts: Project interface with schemaVersion, id, name,
  timestamps, source (reciter + range), format, background, rules, annotations.
  DEFAULT_PROJECT, createProject, updateProject.
- Unit tests in packages/core/src/project.test.ts (defaults, overrides, deep
  merge, updates with timestamp changes).
- Exported through packages/core/src/index.ts.

**What was learned.**

- Project persistence will be through StoragePort (web: localStorage, native:
  filesystem) with zod validation on load/import.
- Migrations folder planned for future schema versions.

**Gate.** Green. All 39 unit tests pass, `npm run check` green.

## Phase 4.1 — Layout index and hit-test (2026-11-19)

**What changed.**

- Added layout index and hit-test functionality for word-level interaction.
- src/render/layoutIndex.ts: WordLayoutIndex and LayoutIndex interfaces,
  createLayoutIndex function to generate word positions in canvas coordinates,
  hitTest function to find which word is at a given point.
- src/render/layoutIndex.test.ts: Comprehensive unit tests covering layout
  creation, hit-testing with multiple verses, edge cases.

**What was learned.**

- The layout index provides the foundation for interaction features like hover,
  selection, and word-level styling in Phase 4.
- Hit-testing is a pure function that works with canvas coordinates, making
  it independent of the rendering implementation.

**Gate.** Green. All 46 unit tests pass, `npm run check` green.

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
