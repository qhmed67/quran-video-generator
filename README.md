# Quranic Video Generator

Client-side web app (Phase 1) that generates short-form vertical (9:16) or square (1:1)
videos combining a nature background, official Quranic recitation, and word-synchronized
Uthmani captions. Phase 2 targets Android/Kotlin (see `docs/architecture.md`).

## Stack

- Vite + React + TypeScript (pure SPA, all processing client-side)
- Vercel: static hosting + two serverless functions (`api/oauth-token.ts`, `api/proxy.ts`)
- ffmpeg.wasm (`@ffmpeg.wasm/main` + self-hosted `core-mt`/`core-st` cores)
- No backend, no GPU, no ASR — timing/text comes from pre-verified sources

## Quick start

```bash
npm install
npm run dev
```

The dev server injects COOP/COEP headers and a local `/api/proxy` middleware so
everything works without Vercel.

Production:

```bash
npm run build      # copies ffmpeg cores into public/, typechecks, builds
npm run typecheck
```

## Environment (Vercel)

Set in the Vercel project dashboard:

| Variable | Purpose |
|---|---|
| `QF_CLIENT_ID` | Quran Foundation app client id |
| `QF_CLIENT_SECRET` | Quran Foundation app client secret (never sent to the browser) |
| `QF_TOKEN_ENDPOINT` | OAuth token endpoint (defaults to `https://apis.quran.foundation/oauth/token`) |

Without QF credentials the app falls back to the public quran.com endpoints for verse
text and mp3quran for ayah timing.

## Fonts

Place the Uthmani font at `public/fonts/KFGQPC-Uthmanic-HAFS.otf` (referenced by
`src/index.css`). The renderer falls back to `me_quran` / `Scheherazade New` / serif if
absent.

## Layout

```
api/            Vercel serverless functions (OAuth proxy, CORS proxy)
docs/           architecture.md + caption-timeline JSON schema
scripts/        copy-ffmpeg.mjs (self-hosts ffmpeg cores into public/)
src/
  lib/          time unit conversion (ms <-> s), timeline types
  data/         sources (QF/mp3quran/quran-align), resolver, timeline builder
  render/       shared renderFrame (canvas), RTL layout, fonts, backgrounds
  audio/        audio engine (HTMLAudioElement clock)
  export/       MediaRecorder capture + ffmpeg.wasm transcode
```

See `docs/architecture.md` for the full design, fallback logic, and Android plan.