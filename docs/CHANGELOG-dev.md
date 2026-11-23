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

**Gate.** Green. All 47 unit tests pass, `npm run check` green.

## Phase 4.2 — Preview pointer and overlay canvas (2026-11-19)

**What changed.**

- Added usePreviewPointer hook for mouse/touch interaction handling.
- Added OverlayCanvas component for drawing hover highlights and selection indicators.
- Implemented selection model with word/range/ayah support.
- Tests for both components with basic structure validation.

**What was learned.**

- The overlay canvas provides visual feedback for interaction without affecting exports.
- The hook handles multiple input methods (mouse, touch, keyboard) with appropriate callbacks.
- Selection model supports different types of selections (word, range, ayah).

**Gate.** Green. All 53 unit tests pass, `npm run check` green.

## Phase 4.3 — Word style props registry and inspector UI (2026-11-19)

**What changed.**

- Added wordStyleProps registry for word style properties with PropDescriptor interface.
- Added helper functions for grouping and validation of style properties.
- Implemented Inspector UI component built from the registry with inheritance display.
- Added reset functionality and grouped property controls.
- Tests for both components with basic structure validation.

**What was learned.**

- The registry provides a centralized way to define and access word style properties.
- Adding new properties requires changes in only three places as specified in section 3.5.
- The inspector shows inheritance info and provides reset functionality for each property.

**Gate.** Green. All 54 unit tests pass, `npm run check` green.

## Phase 4.4 — Annotation editor (2026-11-19)

**What changed.**

- Added annotation editor component for add/edit/delete per ayah or word.
- Supports word-level and ayah-level annotations with different placement options.
- Provides style customization for annotation text (font size, color, opacity, alignment).
- Includes edit and delete functionality for existing annotations.
- Tests with basic structure validation.

**What was learned.**

- The annotation model separates user-added text from the Qur'anic text.
- Different placement options (above, below, inline-after) provide flexibility.
- Style customization allows users to match annotations to their preferences.

**Gate.** Green. All 55 unit tests pass, `npm run check` green.

## Phase 4.5 — Responsive layout (2026-11-19)

**What changed.**

- Added responsive layout component that adapts based on screen size.
- Implements three layout modes: desktop (three-zone grid), tablet (stacked rails), mobile (bottom sheet).
- Includes useResponsive hook for detecting screen size and breakpoints.
- Provides ResponsiveTest component for testing specific screen sizes mentioned in the plan.
- Tests with basic structure validation.

**What was learned.**

- The layout adapts from three-zone grid on desktop to stacked rails on tablet to bottom sheet on mobile.
- The transport bar becomes sticky with 48px targets on mobile.
- The component supports testing at the specific sizes mentioned in the plan.

**Gate.** Green. All 55 unit tests pass, `npm run check` green.

## Gate verification and fixes (2026-11-20)

**What changed.**

- Re-ran the full `npm run check` (typecheck, lint, format:check, test:unit,
  test:browser, build) end-to-end. Earlier "gate green" claims only covered
  typecheck + test:unit, so lint and format failures had slipped through.
- Fixed the inspector reading style values via `prop.displayName` cast to
  `keyof WordStyle` (`'Color'` vs `'color'`): `PropDescriptor` now carries
  `key: keyof WordStyle`, populated by the registry, and the Inspector uses it.
- Fixed two lint errors: `Date.now()` called during render in
  `AnnotationEditor` (now a ref counter) and a `prefer-as-const` in
  `project.test.ts`.
- Applied prettier formatting to render sources so `format:check` passes.

**What was learned.**

- Gate claims must come from a full `npm run check` run, not a subset.
- A `as keyof T` cast can hide a real key mismatch; the registry descriptor
  should carry its own key so the type system checks the lookup.

**Gate.** Green (full run). 56 unit tests, browser tests and build all pass.

## Phase 4.6 — Undo/redo UI and keyboard navigation (2026-11-20)

**What changed.**

- `packages/core/src/history.ts`: pure snapshot history per plan §3.4 — capped
  past stack, redo stack cleared on new edits, same-key commits inside a
  600ms window coalesce into one step (a slider drag undoes once, not forty).
  15 unit tests cover round-trips, capping and coalescing.
- Keyboard navigation (plan §3.5b): `adjacentWord`/`adjacentAyah`/`firstWord`/
  `lastWord` pure functions in `layoutIndex`; arrow keys move the selection
  (ArrowLeft = next word in RTL reading order, Up/Down = neighbouring ayah),
  Enter opens the inspector, canvas made focusable.
- Undo/redo UI: `UndoRedoBar` (design-system buttons, disabled states,
  shortcut hints, 44px/48px touch targets) and `useUndoShortcuts`
  (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y; native undo wins in text fields).
- Fixed: `usePreviewPointer` reached `hitTest` via CommonJS `require()`,
  which throws under Vite/ESM in the browser.
- Fixed: `Inspector.test.tsx`/`OverlayCanvas.test.tsx` never ran — the vitest
  include pattern only matches `*.test.ts`. Renamed to `.ts` with static
  imports; test count went from 12 files/56 tests to 16 files/91 tests.
- Lint: disabled `react/react-in-jsx-scope` (~360 false positives under the
  automatic JSX runtime); warnings down from 384 to 22, errors to zero.
- `ResponsiveLayout`: breakpoints extracted to `BREAKPOINT_MOBILE`/
  `BREAKPOINT_TABLET`/`classifyWidth`, deduplicated through `useResponsive`.

**What was learned.**

- Test include patterns silently drop files: a `.tsx` test under a `*.test.ts`
  glob is a test that never runs — and `require()` inside it fails under ESM
  the moment it does.

**Gate.** Green (full `npm run check`). 91 unit tests, browser tests and build
all pass.

**Still open for the Phase 4 gate.** The plan's Playwright scenario (hover a
word → export unchanged; tap → change colour → export shows only that word;
undo restores it) needs the Phase 4 components wired into `App.tsx` — today
they are standalone and unused by the app shell.

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

## Phase 4 gate — Per-word styling reaches the frame (2026-11-24)

**What changed.**

- The pipeline is connected. `useStyleEditing` owns the `StyleRule[]`, the
  scope an edit targets, and undo/redo; `Inspector` writes the rules;
  `renderFrame` resolves them per word; the preview loop and the export call
  receive the same list, so an export shows exactly what the stage showed.
- `tests/gate/style-editing.mjs` (`npm run test:gate`, wired into
  `npm run check`) automates the plan's gate: hover leaves the frame
  unchanged, recolouring one word changes only that word, undo restores it.
  It counts pixels on the preview canvas, so a rule that never reaches the
  renderer fails.

**Bugs found on the way.** Each was invisible before the gate existed.

- `loadFonts` checked `document.fonts.check()` immediately after a
  `fonts.load()` that resolves when loading *starts*. On a slow first load the
  stage fell back to a serif for the whole session (6 of 8 cold loads), and
  word hit-testing stayed disabled with it.
- `createLayoutIndex` re-derived the text layout instead of reusing the
  renderer's, treated `word.x` as a left edge when RTL puts it at the right
  edge, and always appended the ayah number. Every hit landed off its word.
- `usePreviewPointer` rebound its DOM listeners on every index change (hover
  dropped under a stationary pointer) and converted the pointer into the
  preview's backing store rather than frame coordinates.
- Undo mutated its stacks inside a `setState` updater; React may invoke an
  updater twice, which emptied the stack. It now uses the pure history in
  `core`.
- The layout index followed `playhead` while the resting stage paints the
  poster frame, so the index pointed at a different ayah than the one shown.

**Gate.** Green. `npm run check`: 112 unit tests, 4 golden shots unchanged,
8/8 gate checks, build clean.

## Phase 3 leftovers — validation, persistence, annotations, CI (2026-11-24)

**What changed.**

- `core/validate.ts`: zod schemas for the whole project document. Strict on
  rules and annotations, so a misspelled style key is rejected, not dropped.
  `parseProject` returns every issue with its path, for an import dialog.
- `core/migrations.ts`: versioned migration chain; a newer document is
  refused with an "update the app" message. A committed fixture pins the
  unversioned shape.
- `platform/projectStore.ts`: debounced autosave, load/list/delete, and
  `.qvg.json` import/export over the existing StoragePort and FilePort.
  Nothing used those ports before this.
- `renderFrame` draws ayah-anchored annotations above/below the caption
  block; crowded notes are skipped rather than covering the mushaf line.
- `.github/workflows/ci.yml` runs `npm run check` on every PR; the golden
  runner no longer requires `/usr/bin/google-chrome-stable`.

**Gate.** Green: 145 unit tests, 4 golden shots byte-identical (annotations
off), 9/9 phase-4 gate checks, build clean.

**Known gap.** Annotations have a renderer but no editor UI yet — the
Phase 4 AnnotationEditor component is not wired into the app. Word-anchored
(`inline-after`) annotations are not drawn.
