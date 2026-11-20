# ADR-002 — Monorepo with a platform-free core

- **Status:** Accepted (from `plan-mobile.md`; Phase 2 will execute it)
- **Date:** 2026-11-19

## Context

The mobile plan requires the shared engine (timeline, project model, styles,
layout math, hit-testing) to be usable from web, Android and iOS without a second
implementation.

## Decision

Introduce npm workspaces:

```
packages/
  core/        # PURE TypeScript. No DOM, no React, no Capacitor, no fetch globals.
  render/      # canvas rendering (depends on core). Takes a CanvasLike, never touches `document`.
  data/        # Quran Foundation client, reciter/audio sources, resolver (depends on core)
  ui/          # React components + hooks + design tokens (depends on core, render)
  platform/    # PORT INTERFACES + adapters: web/, native/ (Capacitor)
apps/
  web/         # Vite SPA entry
  mobile/      # Capacitor project
api/           # Vercel functions (unchanged behaviour)
docs/adr/
```

Enforce boundaries with ESLint (`no-restricted-imports` / `eslint-plugin-boundaries`).

## Consequence during Phase 1

The workspace does not exist yet; the code still lives in `src/` with layering
leaks that Phase 2 must fix:

- `src/data/timelineBuilder.ts` imports text helpers from `src/render/layout.ts`
  (data → render direction is wrong; the tokenizer belongs in `core`).
- `src/data/sources.ts` uses `import.meta.env` (fine) and DOM-free fetch; it is
  mostly platform-neutral already.
- `src/render/renderFrame.ts` uses `document` / `OffscreenCanvas` directly; must
  move behind a canvas/font port when the core extraction starts.

## Note on tooling

The Phase 1 lint step uses **oxlint** (with the `eslint`, `typescript`,
`unicorn`, `oxc`, `react`, `import` plugins) rather than
`@typescript-eslint` + ESLint 9, because the repo pins TypeScript **7.0.2**
(the native compiler), which currently ships no JavaScript compiler API and is
therefore unusable as an `@typescript-eslint` peer. `tsc --noEmit` (strict) remains
the type-level gate; oxlint covers correctness/suspicious/perf rules.
