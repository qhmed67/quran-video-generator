# ADR-001 — Mobile strategy: Capacitor around the existing React app

- **Status:** Accepted (recorded during Phase 1 of `plan-mobile.md`; revisit only via a superseding ADR)
- **Date:** 2026-11-19

## Context

The product roadmap (see `plan-mobile.md`) calls for real native Android and iOS
apps that run the same renderer/timeline as the web app and export video
natively.

## Decision

Build the shells with **Capacitor** (WebView shell + native plugins) around the
existing Vite + React + TypeScript SPA. Kotlin and Swift are never written by hand
for rendering or timeline logic.

## Options considered

| Option | Reuse of existing code | Cost | Verdict |
|---|---|---|---|
| Native Kotlin + Swift | ~0% (two rewrites of renderer, timeline, UI) | Very high; two codebases to keep in sync | No |
| Flutter / React Native | Data layer only; renderer and UI rewritten | High | No |
| **Capacitor (WebView shell + native plugins)** | **~90%: renderer, timeline, UI, styles** | Low–medium | **Yes** |

## Consequences

- One shared TypeScript implementation of the renderer, timeline, styles and
  interaction; native code only adds access (files, gallery, share, haptics,
  status bar, keep-awake) through Capacitor plugins and a native `ExportEngine`
  behind the port described in ADR-003.
- Mobile encoding must be native (hardware encoder) because WebView
  `MediaRecorder`/`WebCodecs` are the weak spot; kept behind the `ExportEngine`
  port so the web path and native path share the same frame transport contract.

## Deviations from the plan discovered during Phase 1

- The repository already contains an untracked Android Studio / Gradle *template*
  (`app/`, `build.gradle.kts`, `gradlew`, `settings.gradle.kts` at the repo root).
  It is an untouched Compose scaffold (`MainActivity.kt` renders "Hello Android!").
  It is **not** a Kotlin renderer implementation and was not authored by this plan.
  It is candidate debris for Phase 6 (the Capacitor shell should replace it) and
  must be handled deliberately — not deleted from this branch without maintainer
  sign-off.
