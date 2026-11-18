---
name: mushaf-studio
description: The studio that turns a page of the mushaf into a finished reel. Warm paper surfaces, deep ink type, one green accent pulled from the logo, and three motifs borrowed from the mushaf itself - the ayah rosette, the ruled frame, and the recitation ribbon.
status: final
colors:
  paper: "#f5f2e9"
  surface: "#fbf9f2"
  surface-raised: "#ffffff"
  ink: "#161a18"
  ink-2: "#3f4744"
  muted: "#5f6b66"
  rule: "#ddd7c6"
  rule-strong: "#c9c1ab"
  accent: "#1c6b4b"
  accent-on: "#fbf9f2"
  accent-soft: "#e7efe7"
  danger: "#a3301f"
  warn: "#7c5310"
  paper-dark: "#101413"
  surface-dark: "#171c1a"
  surface-raised-dark: "#1e2422"
  ink-dark: "#eef0e9"
  muted-dark: "#a2aca6"
  rule-dark: "#2f3833"
  accent-dark: "#58c99b"
  on-accent-dark: "#0b1411"
  frame-top: "#0b2e26"
  frame-mid: "#14532d"
  frame-base: "#0a0f1e"
  frame-shadow: "rgb(0 0 0 / 0.35)"
  frame-glow: "rgb(120 220 170 / 0.16)"
  scrim: "rgb(0 0 0 / 0.62)"
typography:
  ui:
    fontFamily: "IBM Plex Sans Arabic, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans Arabic, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
  micro:
    fontFamily: "IBM Plex Sans Arabic, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
  display:
    fontFamily: "IBM Plex Sans Arabic, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "clamp(30px, 4.4vw, 54px)"
    fontWeight: 600
    lineHeight: 1.18
  reel:
    fontFamily: "KFGQPC HAFS Uthmanic Script, Scheherazade New, serif"
    fontSize: "clamp(20px, 2.4vw, 27px)"
    fontWeight: 400
    lineHeight: 1.95
  mushaf:
    fontFamily: "KFGQPC HAFS Uthmanic Script, Scheherazade New, serif"
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.9
  measure:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  pill: 9999px
spacing:
  unit: 4px
  scale: "4, 8, 12, 16, 20, 24, 32, 40, 56, 72"
---

# Mushaf studio

## Overview

**Thesis: the page, then the reel.** The app takes a real object — a range of ayat on the mushaf page, spoken by a named reciter — and shows it becoming a different real object, a finished vertical MP4. Every screen answers "what is this page now, and what does it become next?"

The swap test passes or fails on the fonts, the ayah rosette, and the recitation ribbon. Remove the mark, the mushaf face and the ribbon and the studio is a generic three-panel video editor.

This is an **Operate** surface for the studio and a **Persuade** surface for the landing page. The studio earns its keep through scanability, density and predictable controls; the landing page earns attention by showing the artifact.

### Motifs

1. **Ayah rosette** — an eight-point rosette, the shape that closes every ayah in the mushaf.
   *Meaning:* "this is a verse, and verses are countable."
   *Appears:* ayah markers in the preview mock, the active verse marker on the ribbon, the verse-range chip, section eyebrows on the landing page.
   *Must not:* appear as a bullet on every row, on buttons, or at large scale behind text.
   *Recipe:* `.rosette` mask of an inline SVG, painted with `currentColor`; 20–24px in the ribbon, 16px inline. Never animated except a single opacity fade.
   *Mobile cost:* one mask, negligible.

2. **Ruled frame** — the hairline rule that frames a mushaf page.
   *Meaning:* "the frame is the artifact; everything outside it is tooling."
   *Appears:* around the preview canvas (a 1px rule plus an offset inner hairline), and as the rule that runs out from every panel heading.
   *Must not:* outline every card, nest inside buttons, or become a decorative border on the page body.
   *Recipe:* `1px solid var(--rule)` + `box-shadow: 0 0 0 1px var(--rule), 0 24px 60px rgb(22 26 24 / 0.14)` on `.stage-frame::after`; panel headings use a `::after` hairline with an 8px gap.
   *Mobile cost:* free.

3. **Recitation ribbon** — the transport track, segmented by verse.
   *Meaning:* "the recitation is continuous, but the ayat have edges."
   *Appears:* below the preview as the seekbar, with one segment per verse and the playhead as a hairline with a square knob.
   *Must not:* appear anywhere else as a progress bar substitute.
   *Recipe:* `.ribbon` with `.ribbon-seg` flex segments; playhead is `translateX` on a container transform only.
   *Mobile cost:* free.

### Signature moment

The **landing preview**: a nine-by-sixteen reel standing on paper, captioned in the mushaf's own face, with the ayah rosette closing the line and the recitation ribbon underneath. That single object carries the whole pitch; everything else on the page stays quiet.

## Colors

Neutrals are taken from the mushaf page (warm paper, ink) rather than from a UI kit. There is exactly **one accent: green**, pulled from the logo. Gold is *not* a UI accent — it survives only as the default caption glow inside the exported video, which is a style control, not chrome.

| Token | Light | Dark | Pairing | Ratio | Verdict |
| --- | --- | --- | --- | --- | --- |
| ink on paper | `#161a18` | `#eef0e9` | body & headings | 15.70 / 16.15 | pass AAA |
| muted on paper | `#5f6b66` | `#a2aca6` | secondary text | 4.96 / 7.94 | pass AA |
| accent on paper | `#1c6b4b` | `#58c99b` | links, active state text | 5.77 / 9.05 | pass AA |
| on-accent on accent | `#fbf9f2` on `#1c6b4b` | `#0b1411` on `#58c99b` | primary button | 6.13 / 9.13 | pass AA |
| danger on paper | `#a3301f` | `#f0857a` | errors | 6.25 / 7.37 | pass AA |
| warn on paper | `#7c5310` | `#e0b46a` | estimated-timing notice | 6.05 / 9.64 | pass AA |
| rule on paper | `#ddd7c6` | `#2f3833` | hairlines only | 1.28 / 1.53 | decorative |

Rules:

- One accent element per region. The studio has exactly two green things on screen at rest: the primary action (Export) and the playhead. Everything else is ink, muted or hairline.
- Status is never colour-only: every warning and error carries an icon and a sentence.
- No palette values inside components. Components read `var(--…)` only.
- `frame-top`, `frame-mid`, `frame-base`, `frame-shadow`, `frame-glow` and the `scrim` are **content**, not chrome: they are the default video background (shared with the renderer's Deep Forest preset), its caption shadow, and the letterbox behind the crop tool. They never appear on panels, buttons or notices.

## Typography

- **UI:** IBM Plex Sans Arabic, 400/500/600. It is the only family allowed to set Latin and Arabic UI text at once, which keeps a bidi interface on one metric system.
- **Mushaf:** KFGQPC HAFS Uthmanic Script, self-hosted at `/fonts/KFGQPC-Uthmanic-HAFS.otf`, used only for Qur'anic text and the landing preview. Never for UI.
- **Measure:** a monospace stack with `font-variant-numeric: tabular-nums` for durations, percentages and frame counts. Numbers must not jitter while rendering or exporting.
- **Micro (11px):** uppercase eyebrow labels, badge text, rosette digits and the colour readout. Nothing below 11px.
- Arabic text: no `letter-spacing`, no `text-transform`, line-height ≥ 1.8. Latin-only labels stay at `letter-spacing: 0`.
- Fluid headline: `clamp(30px, 4.4vw, 54px)`, weight 600, line-height 1.18.
- Labels sit above their control. Placeholders never carry the only copy of a label.

## Layout

- The studio is a three-zone grid: **source rail (264px) · stage (fluid) · look rail (300px)**, with a full-width transport bar pinned under all three. Below 1120px the rails stack under the stage; below 720px the transport becomes a sticky bottom bar with 48px targets.
- Vertical rhythm comes from the 4px scale. Panel padding is 20px; rail section gap is 24px.
- One focal object per region: the canvas in the stage, the source fields in the left rail, the look controls in the right rail, the primary action in the transport.
- The stage never scrolls; the rails do. The canvas is sized by `max-height` against the stage box so the frame is always fully visible.

## Elevation and shape

- Radii: 6px on inputs and chips, 10px on panels and buttons, 14px on the reel mock. Nested radii follow `outer = inner + padding`.
- Shadows are tinted ink, never pure black: `rgb(22 26 24 / 0.14)`. Only the preview frame and modals take a shadow; panels use hairlines instead.
- No glassmorphism, no gradient chrome. Gradients exist only inside the preview frame, because that is the video's own background.

## Texture

Paper is a feeling, not a texture file. It comes from the warm neutral (`#f5f2e9`) and from hairlines that never reach full opacity. No noise overlays, no animated grain, no decorative orbs or blobs.

## Components

| Component | Rules |
| --- | --- |
| Primary button | Accent fill, `--accent-on` label, pill radius, 40px tall (48px on mobile), `:active` scale 0.97. One per region. |
| Secondary button | Transparent, 1px rule, ink label. |
| Icon button | 36×36, rule border, 8px radius, ink icon at 1.5px stroke. |
| Field | Label above, 13px control text, 6px radius, `:focus-visible` ring of accent at 30%. |
| Switch | 36×20 track, 16px knob, accent when on, label + optional description to the right. |
| Range | 4px track on `--rule`, 16px accent knob, value read in the measure face. |
| Segmented | Two to four equal options in a ruled pill; active option is accent-filled. Used for format and words-per-screen, where the numeric field beside it accepts any count. |
| Colour control | HSV wheel: hue ring plus saturation/brightness square, markers on both, mono H°/S%/V% readout. Never a bar, never an unlabelled H/S/L triple. |
| Badge | Uppercase 11px, `letter-spacing: 0.06em`, rule border, paper fill. Used for format, resolution and timing granularity. |
| Notice | Icon + sentence + dismiss. Warning uses `--warn`, error uses `--danger`, on a 6% tint. |
| Ribbon | Verse segments, accent for the active verse, playhead hairline. Click or drag to seek. |

## Motion intent

- One owner per property: CSS transitions own micro-states (hover, press, focus, toggle). No JS animation library is used; the canvas render loop owns only the video content.
- The canvas is authored at the export size (1080×1920 or 1080×1080) but the preview rasterises at the pixel size the stage actually shows, and repaints only when something changed: the frame looks identical, and an idle or paused stage costs no rendering work.
- Tokens: `--dur-1: 120ms` (hover/press), `--dur-2: 180ms` (state change), `--dur-3: 260ms` (panel/structure), `--ease-out: cubic-bezier(.2,.7,.3,1)`.
- High-frequency controls (sliders, keyboard) change instantly with no easing.
- The landing preview runs **no** infinite decorative animation. The old verse-shine sweep is removed: it made the Qur'anic line illegible at the midpoint of every 4s loop.
- Every animated rule is wrapped in `@media (prefers-reduced-motion: reduce)` guards that fall back to a static equivalent. State never depends on motion.

## Imagery and logo

- The logo (`/download.png`) is a green-and-gold mark on transparent background. It works on both paper and ink surfaces at 28–48px; at 20px in the studio header it is paired with the wordmark so the mark never has to carry recognition alone.
- The landing preview uses the product's own output (the video frame) as its only image. No stock photography, no device mockups, no screenshots-in-browser-chrome.
- User-supplied background images are cropped to the target aspect and drawn edge to edge inside the frame; no UI pattern is ever composited over them.

## Voice and copy

- Plain, specific, warm. Name the object: "reciter", "surah", "ayah range", "word timing", "estimated timing".
- Never claim more than the timing source supports: word-synced where segments exist, verse-accurate where they do not, and say so in the stage.
- Errors say what happened and what to do next. Warnings are sentences, not codes.
- Arabic copy and English copy are written separately, not machine-mirrored.

## RTL

- Root stays LTR because the studio's controls are English; every Arabic run is wrapped with `dir="rtl"` and `lang="ar"` and uses logical spacing (`margin-inline`, `padding-inline`, `text-align: start`).
- The mushaf line is set with `text-align: center`, `line-height: 1.9`, `letter-spacing: 0`. It is never letter-spaced to fake calligraphy.
- The landing language toggle switches copy per block instead of flipping the whole document, so the studio layout stays stable.
- Directional icons (play, chevrons) mirror in RTL; the logo, the rosette and the mushaf text never mirror.

## Do / Don't

**Do**

- Derive every colour, radius, duration and shadow from a token.
- Keep one primary action per region; let the rest be secondary or text.
- Show the artifact. The preview frame is the product.
- Design the states: loading skeleton shaped like caption lines, estimated-timing notice, empty selection, export progress with phase, audio fallback.
- Keep durations and percentages in the measure face with tabular numerals.

**Don't**

- Don't reintroduce a second accent (no purple "AI" gradients, no gold UI chrome).
- Don't animate Qur'anic text for decoration.
- Don't put a spinner where a product-shaped skeleton belongs.
- Don't hide warnings in a truncated chip in the header.
- Don't use placeholder-only labels, colour-only status, or emoji as UI chrome.
- Don't hardcode the palette, or add a new font family.
