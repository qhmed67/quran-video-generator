import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playClip } from './audio/engine';
import type { ClipPlayer } from './audio/engine';
import { resolveTiming, fetchReciterCatalog } from './data/resolver';
import { buildTimeline } from './data/timelineBuilder';
import type { QfChapterReciter } from './data/types';
import { exportClip } from './export/exporter';
import {
  compareToWindow,
  type CaptionTimeline,
  type TimingGranularity,
  type VerseTimelineEntry,
} from '@qvg/core';
import { GRADIENT_PRESETS, drawBackground } from './render/background';
import type { BgImage, GradientPreset } from './render/background';
import { loadFonts } from './render/fonts';
import type { FontSet } from './render/fonts';
import {
  defaultBounds,
  drawTransformOverlay,
  layoutUthmaniText,
  renderFrame,
  clearRenderCaches,
} from './render/renderFrame';
import type { HslColor, SnapState, TextBounds } from './render/renderFrame';
import CropModal from './components/CropModal';
import type { CropAspect } from './components/CropModal';
import {
  CloseIcon,
  ExportIcon,
  FolderIcon,
  ImageIcon,
  InfoIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SaveIcon,
  StopIcon,
  SunIcon,
  WarnIcon,
} from './components/icons';
import { applyTheme, flipTheme, readTheme } from './lib/theme';
import type { Theme } from './lib/theme';
import { Inspector } from './render/Inspector';
import { OverlayCanvas } from './render/OverlayCanvas';
import { usePreviewPointer } from './render/usePreviewPointer';
import type { SelectionState } from './render/usePreviewPointer';
import { useStyleEditing } from './render/useStyleEditing';
import { createLayoutIndex } from './render/layoutIndex';
import type { LayoutIndex } from './render/layoutIndex';
import { useUndoShortcuts } from './render/undoShortcuts';
import { useProjectStore } from './projectStore';
import { AnnotationEditor } from './render/AnnotationEditor';
import type { Project } from '@qvg/core';

/* ── Types & constants ── */

type Aspect = '9:16' | '1:1';

const ASPECTS: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

const TRANSLATION_ID = 131;
const SNAP_PX = 14;
const MIN_BOX = 60;
const BUILD_DEBOUNCE_MS = 220;
const PLAYHEAD_TICK_MS = 120;

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function formatSeconds(t: number): string {
  const safe = Number.isFinite(t) && t > 0 ? t : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

function hslToHsv(color: HslColor): HsvColor {
  const l = color.l / 100;
  const s = color.s / 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return { h: color.h, s: sv * 100, v: v * 100 };
}

function hsvToHsl(color: HsvColor): HslColor {
  const s = color.s / 100;
  const v = color.v / 100;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h: color.h, s: sl * 100, l: l * 100 };
}

const GRANULARITY_LABEL: Record<TimingGranularity, string> = {
  word: 'Word timing',
  ayah: 'Ayah timing',
  estimated: 'Estimated timing',
};

/** Resolver warnings are internal codes; the studio speaks in sentences. */
const WARNING_COPY: Record<string, string> = {
  'qf-v4 returned no timestamps for the selected range':
    'This reciter has no timing data for these ayat.',
  'qf-v4 chapter audio unavailable for this surah':
    'This reciter has no chapter audio for this surah.',
  'no verified timing source; captions are estimated':
    'Caption timing is estimated rather than taken from a verified timing source.',
};

function buildNotice(warnings: string[], hasAudio: boolean): string | null {
  if (!hasAudio) {
    return 'No audio is available for this range with this reciter, so playback and MP4 export stay disabled. Choose another reciter to continue.';
  }
  const messages = warnings.map((w) => WARNING_COPY[w] ?? w).filter((w) => w.length > 0);
  return messages.length > 0 ? messages.join(' ') : null;
}

/**
 * The frame the stage shows at rest. The player sits at 0, inside the first
 * verse's fade-in, so the stage would render an empty canvas. The middle of
 * the selected range is a real frame of the video and usually representative.
 */
function posterTimeOf(verses: VerseTimelineEntry[]): number {
  const first = verses[0];
  const last = verses[verses.length - 1];
  return first && last ? (first.startSeconds + last.endSeconds) / 2 : 0;
}

/* ── Small components ── */

function Field({
  label,
  value,
  className,
  children,
}: {
  label: string;
  value?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span className="field__label">
        <span>{label}</span>
        {value !== undefined && <span className="field__value">{value}</span>}
      </span>
      {children}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  name,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  name: string;
  hint?: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__text">
        <span className="switch__name">{name}</span>
        {hint && <span className="switch__hint">{hint}</span>}
      </span>
    </label>
  );
}

const WHEEL_SIZE = 132;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const WHEEL_RING_WIDTH = 10;
const WHEEL_RING_OUTER = WHEEL_CENTER - 1;
const WHEEL_RING_INNER = WHEEL_RING_OUTER - WHEEL_RING_WIDTH;
const WHEEL_SQUARE = Math.round(WHEEL_RING_INNER * 1.16);
const WHEEL_DEG = Math.PI / 180;
const clampPercent = (n: number) => Math.min(100, Math.max(0, n));

function ColorControl({
  name,
  color,
  onChange,
}: {
  name: string;
  color: HslColor;
  onChange: (c: HslColor) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hsv = useMemo(() => hslToHsv(color), [color]);
  const hsvRef = useRef(hsv);
  const dragRef = useRef<'hue' | 'sv' | null>(null);
  hsvRef.current = hsv;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(WHEEL_SIZE * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

    // Hue ring — one arc per degree keeps every hue exact.
    const rMid = (WHEEL_RING_OUTER + WHEEL_RING_INNER) / 2;
    ctx.lineWidth = WHEEL_RING_WIDTH + 0.6;
    for (let deg = 0; deg < 360; deg += 1) {
      ctx.beginPath();
      ctx.arc(WHEEL_CENTER, WHEEL_CENTER, rMid, (deg - 0.8) * WHEEL_DEG, (deg + 0.8) * WHEEL_DEG);
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.stroke();
    }

    // Saturation / value square inside the ring.
    const x0 = WHEEL_CENTER - WHEEL_SQUARE / 2;
    const y0 = WHEEL_CENTER - WHEEL_SQUARE / 2;
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`;
    ctx.fillRect(x0, y0, WHEEL_SQUARE, WHEEL_SQUARE);
    const white = ctx.createLinearGradient(x0, 0, x0 + WHEEL_SQUARE, 0);
    white.addColorStop(0, 'rgba(255, 255, 255, 1)');
    white.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = white;
    ctx.fillRect(x0, y0, WHEEL_SQUARE, WHEEL_SQUARE);
    const black = ctx.createLinearGradient(0, y0, 0, y0 + WHEEL_SQUARE);
    black.addColorStop(0, 'rgba(0, 0, 0, 0)');
    black.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = black;
    ctx.fillRect(x0, y0, WHEEL_SQUARE, WHEEL_SQUARE);

    const solid = hsvToHsl(hsv);
    const marker = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${solid.h}, ${solid.s}%, ${solid.l}%)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(x, y, 4.4, 0, Math.PI * 2);
      ctx.stroke();
    };

    const hueAngle = (hsv.h % 360) * WHEEL_DEG;
    marker(WHEEL_CENTER + Math.cos(hueAngle) * rMid, WHEEL_CENTER + Math.sin(hueAngle) * rMid);
    marker(
      x0 + (clampPercent(hsv.s) / 100) * WHEEL_SQUARE,
      y0 + (1 - clampPercent(hsv.v) / 100) * WHEEL_SQUARE,
    );
  }, [hsv]);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * WHEEL_SIZE,
      y: ((e.clientY - r.top) / r.height) * WHEEL_SIZE,
    };
  };

  const pick = (x: number, y: number, mode: 'hue' | 'sv') => {
    const cur = hsvRef.current;
    if (mode === 'hue') {
      const deg = (Math.atan2(y - WHEEL_CENTER, x - WHEEL_CENTER) / WHEEL_DEG + 360) % 360;
      onChange(hsvToHsl({ ...cur, h: Math.round(deg) % 360 }));
      return;
    }
    const half = WHEEL_SQUARE / 2;
    const s = clampPercent(((x - (WHEEL_CENTER - half)) / WHEEL_SQUARE) * 100);
    const v = clampPercent((1 - (y - (WHEEL_CENTER - half)) / WHEEL_SQUARE) * 100);
    onChange(hsvToHsl({ h: cur.h, s: Math.round(s), v: Math.round(v) }));
  };

  const modeFor = (p: { x: number; y: number }): 'hue' | 'sv' | null => {
    const d = Math.hypot(p.x - WHEEL_CENTER, p.y - WHEEL_CENTER);
    if (d <= WHEEL_RING_INNER) return 'sv';
    if (d <= WHEEL_RING_OUTER + 8) return 'hue';
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointOf(e);
    const mode = modeFor(p);
    if (!mode) return;
    dragRef.current = mode;
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(p.x, p.y, mode);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = dragRef.current;
    if (!mode) return;
    const p = pointOf(e);
    pick(p.x, p.y, mode);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const cur = hsvRef.current;
    if (e.key === 'ArrowLeft') onChange(hsvToHsl({ ...cur, h: (cur.h + 360 - step) % 360 }));
    else if (e.key === 'ArrowRight') onChange(hsvToHsl({ ...cur, h: (cur.h + step) % 360 }));
    else if (e.key === 'ArrowUp') onChange(hsvToHsl({ ...cur, v: Math.min(100, cur.v + step) }));
    else if (e.key === 'ArrowDown') onChange(hsvToHsl({ ...cur, v: Math.max(0, cur.v - step) }));
    else return;
    e.preventDefault();
  };

  return (
    <div className="color-control">
      <span className="color-control__name">{name}</span>
      <canvas
        ref={canvasRef}
        className="color-wheel"
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        tabIndex={0}
        role="application"
        aria-label={`${name} colour wheel — hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s)} percent, brightness ${Math.round(hsv.v)} percent. Arrow keys adjust hue and brightness; hold Shift for larger steps.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      />
      <span className="color-control__readout">
        {Math.round(hsv.h)}° {Math.round(hsv.s)}% {Math.round(hsv.v)}%
      </span>
    </div>
  );
}

function Notice({
  tone,
  children,
  onClose,
}: {
  tone: 'warn' | 'danger' | 'info';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'info' ? <InfoIcon /> : <WarnIcon />}
      <span className="notice__text">{children}</span>
      {onClose && (
        <button
          type="button"
          className="notice__close"
          onClick={onClose}
          aria-label="Dismiss message"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/* ── App ── */

export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => flipTheme(t)), []);

  const [reciters, setReciters] = useState<QfChapterReciter[]>([]);
  const [reciterId, setReciterId] = useState('');
  const [surah, setSurah] = useState(36);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(5);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [bgId, setBgId] = useState('forest');
  const [timeline, setTimeline] = useState<CaptionTimeline | null>(null);
  const [granularity, setGranularity] = useState<TimingGranularity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportState, setExportState] = useState<{ label: string; ratio: number } | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [uthmaniFontReady, setUthmaniFontReady] = useState(true);
  const [scrimEnabled, setScrimEnabled] = useState(false);
  const [wordHighlightEnabled, setWordHighlightEnabled] = useState(false);
  const [transformMode, setTransformMode] = useState(false);
  const [cropImage, setCropImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [bgImageName, setBgImageName] = useState<string | null>(null);
  const [maxWordsPerScreen, setMaxWordsPerScreen] = useState(0);
  const [textColor, setTextColor] = useState<HslColor>({ h: 0, s: 0, l: 100 });
  const [glowColor, setGlowColor] = useState<HslColor>({ h: 38, s: 100, l: 70 });
  const [textOpacity, setTextOpacity] = useState(1);
  // Preview backing store, as a fraction of the logical (export) frame size.
  const [previewScale, setPreviewScale] = useState(1);

  // Per-word styling (plan phase 4.3). `styleEditing` owns the StyleRule list
  // the renderer resolves; the selection below decides which scope an edit
  // lands on.
  const styleEditing = useStyleEditing();
  const [layoutIndex, setLayoutIndex] = useState<LayoutIndex | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const rulesRef = useRef(styleEditing.rules);
  rulesRef.current = styleEditing.rules;
  const [annotations, setAnnotations] = useState<Project['annotations']>([]);
  const annotationsRef = useRef<Project['annotations']>(annotations);
  annotationsRef.current = annotations;
  const annotationsPast = useRef<Project['annotations'][]>([]);
  const annotationsFuture = useRef<Project['annotations'][]>([]);

  const commitAnnotations = useCallback((next: Project['annotations']) => {
    setAnnotations((current) => {
      annotationsPast.current = [...annotationsPast.current, current].slice(-100);
      annotationsFuture.current = [];
      return next;
    });
    bumpRenderRevision();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable helper, deps intentionally empty
  }, []);

  const undoAnnotations = useCallback(() => {
    setAnnotations((current) => {
      const previous = annotationsPast.current[annotationsPast.current.length - 1];
      if (!previous) return current;
      annotationsPast.current = annotationsPast.current.slice(0, -1);
      annotationsFuture.current = [current, ...annotationsFuture.current];
      return previous;
    });
  }, []);

  // Annotation and rule edits share one undo history in practice, so a
  // Ctrl+Z after a note walks both.
  const undoEither = useCallback(() => {
    styleEditing.undo();
    undoAnnotations();
  }, [styleEditing, undoAnnotations]);

  // Project persistence (plan phase 3.4): the document is derived from the
  // studio's settings and autosaved; import/export go through the file port.
  const projectStore = useProjectStore({
    snapshot: {
      reciterId,
      surah,
      from,
      to,
      aspect,
      bgId,
      rules: styleEditing.rules,
      annotations,
    },
    revision:
      surah * 1_000_000 +
      from * 1_000 +
      to +
      styleEditing.rules.length * 10_000_000_000 +
      annotations.length * 100_000_000_000,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const scrubRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<ClipPlayer | null>(null);
  const playerLoadRef = useRef<ReturnType<typeof playClip> | null>(null);
  const timelineRef = useRef<CaptionTimeline | null>(null);
  const fontsRef = useRef<FontSet>({
    uthmani: 'serif',
    translation: 'sans-serif',
    uthmaniLoaded: false,
  });
  const bgImageRef = useRef<BgImage>(null);
  const bgPresetRef = useRef<GradientPreset>(GRADIENT_PRESETS[0]);
  const captionsRef = useRef({ uthmani: true, translation: false });
  const boundsRef = useRef<TextBounds>(defaultBounds(1080, 1920));
  const snapRef = useRef<SnapState>({ x: false, y: false });
  const dragRef = useRef<{
    type: 'move' | 'resize';
    corner: string;
    startX: number;
    startY: number;
    orig: TextBounds;
  } | null>(null);
  const scrimRef = useRef(false);
  const wordHighlightRef = useRef(false);
  const transformModeRef = useRef(false);
  const isExportingRef = useRef(false);
  const maxWordsRef = useRef(0);
  const textColorRef = useRef<HslColor>({ h: 0, s: 0, l: 100 });
  const glowColorRef = useRef<HslColor>({ h: 38, s: 100, l: 70 });
  const textOpacityRef = useRef(1);
  const lastReportRef = useRef(0);
  const reportedTimeRef = useRef(0);
  const scrubbingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const scratchTimeRef = useRef(0);
  const posterTimeRef = useRef(0);
  /** Bumped whenever something visual changes without a React state change
   *  (caption drag, cropped background, font load) so the loop repaints. */
  const renderRevisionRef = useRef(0);
  function bumpRenderRevision() {
    renderRevisionRef.current += 1;
  }
  const frameSizeRef = useRef(ASPECTS['9:16']);

  captionsRef.current = { uthmani: true, translation: translationEnabled };
  bgPresetRef.current = GRADIENT_PRESETS.find((p) => p.id === bgId) ?? GRADIENT_PRESETS[0];
  scrimRef.current = scrimEnabled;
  wordHighlightRef.current = wordHighlightEnabled;
  transformModeRef.current = transformMode;
  isExportingRef.current = isExporting;
  maxWordsRef.current = maxWordsPerScreen;
  textColorRef.current = textColor;
  glowColorRef.current = glowColor;
  textOpacityRef.current = textOpacity;
  isPlayingRef.current = isPlaying;

  const size = ASPECTS[aspect];
  frameSizeRef.current = size;
  // The stage shows the frame at a fraction of its authored size, so the
  // preview is rasterised at (roughly) the pixels it actually occupies. The
  // export still renders at the full logical size.
  const previewWidth = Math.max(2, Math.round(size.width * previewScale));
  const previewHeight = Math.max(2, Math.round(size.height * previewScale));
  const totalSeconds =
    timeline && timeline.verses.length > 0
      ? timeline.verses[timeline.verses.length - 1].endSeconds
      : 0;

  const totalSecondsRef = useRef(0);
  totalSecondsRef.current = totalSeconds;

  useEffect(() => {
    boundsRef.current = defaultBounds(size.width, size.height);
  }, [size.width, size.height]);

  /* ── Data ── */

  const buildSeq = useRef(0);

  const build = useCallback(
    async (rid: string, s: number, f: number, t: number, trans: boolean) => {
      if (!rid) return;
      if (!Number.isInteger(s) || s < 1 || s > 114) {
        setError('Surah must be a number between 1 and 114.');
        return;
      }
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f) {
        setError('The ayah range is invalid: “From” must be at least 1 and no higher than “To”.');
        return;
      }
      const seq = ++buildSeq.current;
      setIsLoading(true);
      setError(null);
      try {
        const resolution = await resolveTiming({ reciterId: rid, surah: s, verses: [f, t] });
        const tl = await buildTimeline(
          {
            range: { surah: s, from: f, to: t },
            reciterId: rid,
            captions: {
              uthmani: true,
              translation: { enabled: trans, translationId: TRANSLATION_ID, language: 'en' },
            },
          },
          resolution,
        );
        if (seq !== buildSeq.current) return;
        timelineRef.current = tl;
        setTimeline(tl);
        setGranularity(tl.meta.granularity);
        setNotice(buildNotice(resolution.warnings, Boolean(tl.meta.audioUrl)));
      } catch (err) {
        if (seq !== buildSeq.current) return;
        setError((err as Error).message);
      } finally {
        if (seq === buildSeq.current) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchReciterCatalog()
      .then((rs) => {
        setReciters(rs);
        if (rs.length > 0) setReciterId(String(rs[0].id));
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  // Typing a verse number used to fire a network request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void build(reciterId, surah, from, to, translationEnabled);
    }, BUILD_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [reciterId, surah, from, to, translationEnabled, build]);

  useEffect(() => {
    loadFonts().then((fonts) => {
      fontsRef.current = fonts;
      // Glyphs already rasterised with the fallback would stay on screen.
      clearRenderCaches();
      renderRevisionRef.current += 1;
      setUthmaniFontReady(fonts.uthmaniLoaded);
    });
  }, []);

  /* ── Audio ── */

  // Key the player on the clip itself, not on the timeline object: rebuilding
  // captions for the same recitation must not stop playback or rewind it.
  const clipUrl = timeline?.meta.audioUrl ?? '';
  const clipStart = timeline?.meta.clipStartOffsetSeconds ?? 0;
  const clipEnd =
    timeline && timeline.verses.length > 0
      ? timeline.verses[timeline.verses.length - 1].endSeconds
      : undefined;

  useEffect(() => {
    if (!clipUrl) return;
    let cancelled = false;
    const load = playClip(clipUrl, clipStart, clipEnd);
    playerLoadRef.current = load;
    load
      .then((p) => {
        if (cancelled) {
          p.stop();
          return;
        }
        p.element.addEventListener('ended', () => setIsPlaying(false));
        playerRef.current = p;
        reportedTimeRef.current = 0;
        setPlayhead(0);
      })
      .catch((err) => setError((err as Error).message));
    return () => {
      cancelled = true;
      if (playerLoadRef.current === load) playerLoadRef.current = null;
      playerRef.current?.stop();
      playerRef.current = null;
      setIsPlaying(false);
    };
  }, [clipUrl, clipStart, clipEnd]);

  useEffect(() => {
    // Keep the rendered stage and the stage foot in agreement: both use the
    // poster frame while the player rests at 0.
    posterTimeRef.current = timeline ? posterTimeOf(timeline.verses) : 0;
    scratchTimeRef.current = 0;
  }, [timeline]);

  /* ── Render loop ── */

  // Everything the frame depends on, as one comparable value. The loop below
  // repaints only when this changes, when the playhead moves, or while the user
  // is dragging — a paused, untouched stage costs nothing.
  const visualKey = [
    timeline
      ? `${timeline.meta.audioUrl}|${timeline.verses.length}|${timeline.meta.versesFrom}`
      : 'none',
    aspect,
    uthmaniFontReady ? 'font' : 'fallback',
    translationEnabled ? 'tr' : '',
    scrimEnabled ? 'scrim' : '',
    wordHighlightEnabled ? 'hl' : '',
    maxWordsPerScreen,
    bgId,
    bgImageName ?? '',
    `${textColor.h}/${textColor.s}/${textColor.l}`,
    `${glowColor.h}/${glowColor.s}/${glowColor.l}`,
    textOpacity,
    transformMode ? 'transform' : '',
    isExporting ? 'exporting' : '',
    // Per-word rules change the frame; without this the stage would keep
    // showing the previous paint until something else moved.
    JSON.stringify(styleEditing.rules),
    JSON.stringify(annotations),
    previewWidth,
    previewHeight,
  ].join('|');
  const visualKeyRef = useRef(visualKey);
  visualKeyRef.current = visualKey;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fit = Math.min((rect.width * dpr) / size.width, (rect.height * dpr) / size.height);
      // Quantised so a resize cannot ping-pong on sub-pixel differences.
      const next = Math.min(1, Math.max(0.2, Math.round(fit * 20) / 20));
      setPreviewScale((cur) => (Math.abs(cur - next) > 0.001 ? next : cur));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
  }, [size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    let lastKey = '';
    let lastTime = Number.NaN;
    let lastRevision = -1;
    const loop = () => {
      const p = playerRef.current;
      const raw = p ? p.timeSeconds() : scratchTimeRef.current;
      // At rest the player sits at 0, which is inside the first verse's fade-in:
      // render the poster frame instead of an empty canvas. Playback and export
      // still render the honest frame for the real time.
      const atRest = !isPlayingRef.current && !isExportingRef.current && raw < 0.05;
      const t = atRest ? posterTimeRef.current : raw;
      const tl = timelineRef.current;
      const key = visualKeyRef.current;
      const revision = renderRevisionRef.current;
      const busy =
        isPlayingRef.current ||
        scrubbingRef.current ||
        dragRef.current !== null ||
        isExportingRef.current;
      const stale =
        key !== lastKey || revision !== lastRevision || !(Math.abs(t - lastTime) < 0.0005);
      if (stale || busy) {
        if (!isExportingRef.current) {
          const frame = frameSizeRef.current;
          const scale = canvas.width / frame.width;
          ctx.save();
          if (tl) {
            renderFrame(canvas, {
              tSeconds: t,
              timeline: tl,
              frameWidth: frame.width,
              frameHeight: frame.height,
              captionsOn: captionsRef.current,
              fonts: fontsRef.current,
              bounds: boundsRef.current,
              scrimEnabled: scrimRef.current,
              wordHighlightEnabled: wordHighlightRef.current,
              maxWordsPerScreen: maxWordsRef.current,
              textColor: textColorRef.current,
              glowColor: glowColorRef.current,
              textOpacity: textOpacityRef.current,
              rules: rulesRef.current,
              annotations: annotationsRef.current,
              drawBackground: (c) =>
                drawBackground(
                  c,
                  bgPresetRef.current,
                  bgImageRef.current,
                  frame.width,
                  frame.height,
                ),
            });
          } else {
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            drawBackground(ctx, bgPresetRef.current, bgImageRef.current, frame.width, frame.height);
          }
          if (transformModeRef.current) {
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            drawTransformOverlay(ctx, boundsRef.current, snapRef.current, frame);
          }
          ctx.restore();
        }
        lastKey = key;
        lastTime = t;
        lastRevision = revision;
      }
      const now = performance.now();
      if (
        !scrubbingRef.current &&
        now - lastReportRef.current > PLAYHEAD_TICK_MS &&
        Math.abs(raw - reportedTimeRef.current) > 0.04
      ) {
        lastReportRef.current = now;
        reportedTimeRef.current = raw;
        setPlayhead(raw);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Word selection and styling (plan phase 4) ── */

  // The hit-test index only makes sense for the verse currently painted, so
  // rebuild it when the visible verse, its layout or the frame size changes.
  const activeVerseForIndex = useMemo<VerseTimelineEntry | null>(() => {
    const tl = timeline;
    if (!tl || tl.verses.length === 0) return null;
    // The loop paints the poster frame while the stage rests at t≈0, so the
    // index has to test the same instant or every hit lands on the wrong ayah.
    const atRest = !isPlaying && playhead < 0.05;
    const t = atRest ? posterTimeOf(tl.verses) : playhead;
    return (
      tl.verses.find((v) => compareToWindow(t, v.startSeconds, v.endSeconds) === 0) ??
      tl.verses[0] ??
      null
    );
  }, [timeline, playhead, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = ASPECTS[aspect];
    if (!canvas || !activeVerseForIndex || !uthmaniFontReady) {
      setLayoutIndex(null);
      return;
    }
    try {
      // The renderer only paints the ayah number on the verse's final screen
      // chunk, so the index must agree or its last word is too wide to hit.
      const fitsOneScreen =
        maxWordsPerScreen <= 0 ||
        !activeVerseForIndex.words ||
        activeVerseForIndex.words.length <= maxWordsPerScreen;
      const index = createLayoutIndex(canvas, activeVerseForIndex, {
        fonts: fontsRef.current,
        bounds: boundsRef.current,
        align: 'center',
        deviceScale: 1,
        showAyahNumber: fitsOneScreen,
      });
      setLayoutIndex({
        width: frame.width,
        height: frame.height,
        bounds: boundsRef.current,
        verses: [
          {
            surah: parseInt(activeVerseForIndex.verseKey.split(':')[0], 10),
            ayah: activeVerseForIndex.ayahNumber,
            words: index,
          },
        ],
      });
    } catch {
      // A canvas without a 2D context (unlikely) leaves the stage unselectable
      // rather than breaking the app.
      setLayoutIndex(null);
    }
  }, [activeVerseForIndex, aspect, uthmaniFontReady, maxWordsPerScreen]);

  const handleSelect = useCallback(
    (selection: SelectionState) => {
      if (!selection.current) {
        styleEditing.clearSelection();
        return;
      }
      const nextRange =
        selection.type === 'range' && selection.start && selection.end
          ? { from: selection.start, to: selection.end }
          : null;
      styleEditing.selectWord(selection.current, nextRange);
      // Selecting a word is the moment the inspector becomes useful, so make
      // sure it is visible on a narrow layout.
      setInspectorOpen(true);
    },
    [styleEditing],
  );

  const { hover, selection } = usePreviewPointer(transformMode ? null : canvasRef.current, {
    layoutIndex,
    onSelect: handleSelect,
    onOpenInspector: () => setInspectorOpen(true),
    onExtendRange: styleEditing.extendRange,
  });

  useUndoShortcuts({
    undo: undoEither,
    redo: styleEditing.redo,
    enabled: !isExporting,
  });

  /* ── Transform overlay interactions ── */

  const toLogicalPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const frame = frameSizeRef.current;
    // Caption bounds live in the logical (export) frame, whatever the preview
    // backing store is scaled to.
    return {
      x: (clientX - r.left) * (frame.width / r.width),
      y: (clientY - r.top) * (frame.height / r.height),
    };
  };

  const measureTextBlock = (box: TextBounds): { width: number; height: number } | null => {
    const ctx = ctxRef.current;
    const tl = timelineRef.current;
    if (!ctx || !tl) return null;
    const t = playerRef.current?.timeSeconds() ?? 0;
    let verse: VerseTimelineEntry | null = null;
    for (const v of tl.verses) {
      if (compareToWindow(t, v.startSeconds, v.endSeconds) === 0) {
        verse = v;
        break;
      }
    }
    if (!verse) return null;
    const info = layoutUthmaniText(ctx, verse, {
      fonts: fontsRef.current,
      boxW: box.width,
      boxH: box.height,
      align: 'center',
      atMinFont: true,
    });
    return { width: info.width, height: info.height };
  };

  const RESIZE_CURSOR: Record<string, string> = {
    tl: 'nwse-resize',
    br: 'nwse-resize',
    tr: 'nesw-resize',
    bl: 'nesw-resize',
    l: 'ew-resize',
    r: 'ew-resize',
    t: 'ns-resize',
    b: 'ns-resize',
  };

  const hitBoxHandle = (b: TextBounds, p: { x: number; y: number }): string | null => {
    const h = Math.max(18, Math.round(size.width * 0.022));
    const corners = [
      { id: 'tl', x: b.x, y: b.y },
      { id: 'tr', x: b.x + b.width, y: b.y },
      { id: 'bl', x: b.x, y: b.y + b.height },
      { id: 'br', x: b.x + b.width, y: b.y + b.height },
    ];
    for (const c of corners) {
      if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id;
    }
    const edges = [
      { id: 'l', x: b.x, y: b.y + b.height / 2 },
      { id: 'r', x: b.x + b.width, y: b.y + b.height / 2 },
      { id: 't', x: b.x + b.width / 2, y: b.y },
      { id: 'b', x: b.x + b.width / 2, y: b.y + b.height },
    ];
    for (const c of edges) {
      if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id;
    }
    return null;
  };

  const applyCursor = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const d = dragRef.current;
    let cursor = 'default';
    if (d) {
      cursor = d.type === 'move' ? 'grabbing' : (RESIZE_CURSOR[d.corner] ?? 'default');
    } else if (transformModeRef.current) {
      const p = toLogicalPoint(clientX, clientY);
      const b = boundsRef.current;
      const corner = hitBoxHandle(b, p);
      if (corner) cursor = RESIZE_CURSOR[corner] ?? 'default';
      else if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
        cursor = 'move';
    }
    canvas.style.cursor = cursor;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!transformModeRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toLogicalPoint(e.clientX, e.clientY);
    const b = boundsRef.current;
    const corner = hitBoxHandle(b, p);
    if (corner)
      dragRef.current = { type: 'resize', corner, startX: p.x, startY: p.y, orig: { ...b } };
    else if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
      dragRef.current = { type: 'move', corner: '', startX: p.x, startY: p.y, orig: { ...b } };
    else return;
    applyCursor(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toLogicalPoint(e.clientX, e.clientY);
    const W = size.width;
    const H = size.height;
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    let nx = d.orig.x;
    let ny = d.orig.y;
    let nw = d.orig.width;
    let nh = d.orig.height;
    if (d.type === 'move') {
      nx = Math.min(Math.max(d.orig.x + dx, 0), W - nw);
      ny = Math.min(Math.max(d.orig.y + dy, 0), H - nh);
      const cx = nx + nw / 2;
      const cy = ny + nh / 2;
      const snapX = Math.abs(cx - W / 2) < SNAP_PX;
      const snapY = Math.abs(cy - H / 2) < SNAP_PX;
      if (snapX) nx = W / 2 - nw / 2;
      if (snapY) ny = H / 2 - nh / 2;
      snapRef.current = { x: snapX, y: snapY };
    } else {
      const anchorX = d.corner.includes('l') ? d.orig.x + d.orig.width : d.orig.x;
      const anchorY = d.corner.includes('t') ? d.orig.y + d.orig.height : d.orig.y;
      const dirX = d.corner.includes('l') ? -1 : d.corner.includes('r') ? 1 : 0;
      const dirY = d.corner.includes('t') ? -1 : d.corner.includes('b') ? 1 : 0;
      const maxW = dirX === -1 ? anchorX : W - anchorX;
      const maxH = dirY === -1 ? anchorY : H - anchorY;
      nw = dirX === 0 ? d.orig.width : Math.min(Math.max(dirX * (p.x - anchorX), MIN_BOX), maxW);
      nh = dirY === 0 ? d.orig.height : Math.min(Math.max(dirY * (p.y - anchorY), MIN_BOX), maxH);
      const text = measureTextBlock({ x: 0, y: 0, width: nw, height: nh });
      if (text) {
        nw = Math.max(nw, Math.ceil(text.width));
        nh = Math.max(nh, Math.ceil(text.height));
      }
      nw = Math.min(nw, maxW);
      nh = Math.min(nh, maxH);
      nx = dirX === -1 ? anchorX - nw : anchorX;
      ny = dirY === -1 ? anchorY - nh : anchorY;
      snapRef.current = { x: false, y: false };
    }
    boundsRef.current = { x: nx, y: ny, width: nw, height: nh };
    renderRevisionRef.current += 1;
    applyCursor(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    snapRef.current = { x: false, y: false };
    applyCursor(e.clientX, e.clientY);
  };

  const handlePointerLeave = () => {
    if (!dragRef.current) {
      const c = canvasRef.current;
      if (c) c.style.cursor = 'default';
    }
  };

  /* ── Transport ── */

  const handlePlayPause = useCallback(async () => {
    let p = playerRef.current;
    const tl = timelineRef.current;
    if (!p && playerLoadRef.current) {
      // The player for this clip is still loading; never build a second one.
      try {
        p = await playerLoadRef.current;
      } catch {
        return;
      }
    }
    if (!p && tl && tl.meta.audioUrl) {
      try {
        const dur = tl.verses.length > 0 ? tl.verses[tl.verses.length - 1].endSeconds : undefined;
        p = await playClip(tl.meta.audioUrl, tl.meta.clipStartOffsetSeconds, dur);
        p.element.addEventListener('ended', () => setIsPlaying(false));
        playerRef.current = p;
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    if (!p) return;
    if (isPlayingRef.current) {
      p.pause();
      setIsPlaying(false);
    } else {
      await p.play();
      setIsPlaying(true);
    }
  }, []);

  const handleStop = useCallback(() => {
    scratchTimeRef.current = 0;
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.seek(0);
    setPlayhead(0);
    reportedTimeRef.current = 0;
    setIsPlaying(false);
  }, []);

  const seekToRatio = useCallback((clientX: number) => {
    const el = scrubRef.current;
    const total = totalSecondsRef.current;
    if (!el || total <= 0) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const target = ratio * total;
    const p = playerRef.current;
    // Without a player (reciter has no audio) still let the user inspect frames.
    if (p) p.seek(target);
    else scratchTimeRef.current = target;
    reportedTimeRef.current = target;
    setPlayhead(target);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const total = totalSecondsRef.current;
    const current = playerRef.current?.timeSeconds() ?? scratchTimeRef.current;
    const next = Math.min(total, Math.max(0, current + delta));
    const p = playerRef.current;
    if (p) p.seek(next);
    else scratchTimeRef.current = next;
    reportedTimeRef.current = next;
    setPlayhead(next);
  }, []);

  const onScrubberDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalSecondsRef.current <= 0) return;
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToRatio(e.clientX);
  };

  const onScrubberMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    seekToRatio(e.clientX);
  };

  const onScrubberUp = () => {
    scrubbingRef.current = false;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        target?.isContentEditable
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        void handlePlayPause();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlayPause, seekBy]);

  /* ── Background image ── */

  const handleBgImage = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setCropImage({ url, img });
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    setBgImageName(file.name);
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropImage((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
    if (!bgImageRef.current) setBgImageName(null);
  }, []);

  const handleCropConfirm = useCallback((canvas: HTMLCanvasElement) => {
    setCropImage((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
    bgImageRef.current = canvas;
    bumpRenderRevision();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable helper, deps intentionally empty
  }, []);

  const handleClearImage = useCallback(() => {
    bgImageRef.current = null;
    setBgImageName(null);
    bumpRenderRevision();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable helper, deps intentionally empty
  }, []);

  /* ── Export ── */

  const handleExport = useCallback(async () => {
    const tl = timelineRef.current;
    const ctx = ctxRef.current;
    if (!tl) {
      setError('Nothing to export yet — load a recitation range first.');
      return;
    }
    if (!ctx) {
      setError('The canvas is not ready. Reload the page and try again.');
      return;
    }
    if (!tl.meta.audioUrl) {
      setError('No audio is available for this recitation, so the video cannot include sound.');
      return;
    }
    setIsExporting(true);
    setExportProgress(0);
    setExportState({ label: 'Preparing', ratio: 0 });
    setAudioWarning(null);
    try {
      const duration = tl.verses[tl.verses.length - 1].endSeconds;
      const frame = frameSizeRef.current;
      const result = await exportClip({
        width: frame.width,
        height: frame.height,
        durationSeconds: duration,
        audioUrl: tl.meta.audioUrl,
        clipStartOffsetSeconds: tl.meta.clipStartOffsetSeconds,
        render: {
          timeline: tl,
          captionsOn: captionsRef.current,
          fonts: fontsRef.current,
          bounds: boundsRef.current,
          scrimEnabled: scrimRef.current,
          wordHighlightEnabled: wordHighlightRef.current,
          maxWordsPerScreen: maxWordsRef.current,
          textColor: textColorRef.current,
          glowColor: glowColorRef.current,
          textOpacity: textOpacityRef.current,
          // Same rule list as the preview: the gate requires an export to
          // show exactly what the stage showed.
          rules: rulesRef.current,
          annotations: annotationsRef.current,
          drawBackground: (c) => drawBackground(c, bgPresetRef.current, bgImageRef.current),
        },
        onProgress: (p) => {
          if (p.phase === 'render') {
            const ratio = p.ratio * 0.85;
            setExportProgress(ratio);
            setExportState({ label: 'Rendering frames', ratio });
          } else if (p.phase === 'audio') {
            const ratio = 0.85 + p.ratio * 0.12;
            setExportProgress(ratio);
            setExportState({ label: 'Muxing audio', ratio });
          } else {
            const ratio = 0.97 + p.ratio * 0.03;
            setExportProgress(ratio);
            setExportState({ label: 'Finishing file', ratio });
          }
        },
      });
      if (!result.hasAudio) {
        setAudioWarning(
          'This export has no audio track: the browser could not encode audio in this context.',
        );
      }
      downloadBlob(
        result.blob,
        `quran-${tl.meta.surah}-${tl.meta.versesFrom}-${tl.meta.versesTo}.mp4`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportState(null);
    }
  }, []);

  useEffect(() => {
    if (!audioWarning) return;
    const id = window.setTimeout(() => setAudioWarning(null), 10_000);
    return () => window.clearTimeout(id);
  }, [audioWarning]);

  const dismissMessage = projectStore.dismissMessage;
  useEffect(() => {
    if (!projectStore.message) return;
    const id = window.setTimeout(dismissMessage, 6000);
    return () => window.clearTimeout(id);
  }, [projectStore.message, dismissMessage]);

  /* ── Derived view data ── */

  const currentVerse = useMemo(() => {
    if (!timeline) return null;
    const atRest = !isPlaying && !isExporting && playhead < 0.05;
    const t = atRest ? posterTimeOf(timeline.verses) : playhead;
    return timeline.verses.find((v) => t >= v.startSeconds && t < v.endSeconds) ?? null;
  }, [timeline, playhead, isPlaying, isExporting]);

  const rangeLabel = `Surah ${surah} · ayah ${from}–${to}`;
  const frameStyle = { '--ratio': size.width / size.height } as React.CSSProperties;
  const canPlay = Boolean(timeline && timeline.meta.audioUrl) && !isExporting;
  const noticeStack = error || audioWarning || notice || projectStore.message;

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/" title="Back to the overview">
          <img className="brand__mark" src="/download.png" alt="" />
          <span className="brand__text">
            <span className="brand__name">Quranic Video Generator</span>
            <span className="brand__meta">{rangeLabel}</span>
          </span>
        </a>
        <div className="header-spacer" />
        <div className="header-actions">
          {granularity && granularity !== 'estimated' && (
            <span className="badge header-granularity">{GRANULARITY_LABEL[granularity]}</span>
          )}
          {timeline && (
            <span className="badge">
              <span className="measure">{formatSeconds(totalSeconds)}</span>
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={projectStore.exportFile}
            disabled={!timeline}
            title="Save the project as a .qvg.json file"
          >
            <SaveIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={projectStore.importFile}
            title="Open a saved .qvg.json project"
          >
            <FolderIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {noticeStack && (
        <div className="notice-stack" role="region" aria-label="Messages">
          {error && (
            <Notice tone="danger" onClose={() => setError(null)}>
              {error}
            </Notice>
          )}
          {audioWarning && (
            <Notice tone="warn" onClose={() => setAudioWarning(null)}>
              {audioWarning}
            </Notice>
          )}
          {notice && (
            <Notice tone="warn" onClose={() => setNotice(null)}>
              {notice}
            </Notice>
          )}
          {projectStore.message && (
            <Notice tone="info" onClose={projectStore.dismissMessage}>
              {projectStore.message}
            </Notice>
          )}
        </div>
      )}

      <div className="studio">
        <aside className="rail rail--source" aria-label="Recitation source">
          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Recitation</span>
            </div>
            <Field label="Reciter">
              <span className="select-wrap">
                <select
                  className="select"
                  value={reciterId}
                  onChange={(e) => setReciterId(e.target.value)}
                >
                  {reciters.length === 0 && <option value="">Loading reciters…</option>}
                  {reciters.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                      {r.style?.name ? ` · ${r.style.name}` : ''}
                    </option>
                  ))}
                </select>
              </span>
            </Field>
            <Field label="Surah" value={`1–114`}>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={114}
                value={surah}
                onChange={(e) => setSurah(Number(e.target.value))}
              />
            </Field>
            <div className="rail__row">
              <Field label="From ayah">
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={from}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value));
                    setFrom(Math.min(v, to));
                  }}
                />
              </Field>
              <Field label="To ayah">
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={to}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value));
                    setTo(Math.max(v, from));
                  }}
                />
              </Field>
            </div>
            <p className="rail__note">{rangeLabel}</p>
          </section>

          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Output</span>
            </div>
            <Field label="Format" value={`${size.width}×${size.height}`}>
              <div className="segmented" role="group" aria-label="Aspect ratio">
                <button
                  type="button"
                  aria-pressed={aspect === '9:16'}
                  onClick={() => setAspect('9:16')}
                >
                  Vertical 9:16
                </button>
                <button
                  type="button"
                  aria-pressed={aspect === '1:1'}
                  onClick={() => setAspect('1:1')}
                >
                  Square 1:1
                </button>
              </div>
            </Field>
            <Field
              label="Words per screen"
              value={maxWordsPerScreen === 0 ? 'auto' : `${maxWordsPerScreen}`}
            >
              <div className="words-row">
                <div className="segmented" role="group" aria-label="Words per screen">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={maxWordsPerScreen === n}
                      onClick={() => setMaxWordsPerScreen(n)}
                    >
                      {n === 0 ? 'Auto' : n}
                    </button>
                  ))}
                </div>
                <input
                  className="input words-row__count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  aria-label="Custom words per screen"
                  placeholder="4–20"
                  value={maxWordsPerScreen === 0 ? '' : String(maxWordsPerScreen)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.trim() === '') {
                      setMaxWordsPerScreen(0);
                      return;
                    }
                    const n = Math.round(Number(raw));
                    if (Number.isFinite(n) && n >= 1) setMaxWordsPerScreen(Math.min(n, 20));
                  }}
                />
              </div>
            </Field>
          </section>

          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Playback</span>
            </div>
            <p className="rail__note">
              Space plays and pauses, arrow keys step one second, or drag the ribbon under the frame
              to seek.
            </p>
            {!canPlay && !isExporting && (
              <p className="rail__note">Playback unlocks once a recitation with audio is loaded.</p>
            )}
          </section>
        </aside>

        <section className="stage" aria-label="Preview">
          <div className="stage-head">
            <span className="badge">
              {aspect === '9:16' ? '9:16' : '1:1'} ·{' '}
              <span className="measure">
                {size.width}×{size.height}
              </span>
            </span>
            {granularity === 'estimated' && (
              <span className="badge badge--warn">Estimated timing</span>
            )}
            {!uthmaniFontReady && <span className="badge badge--warn">Fallback font</span>}
            <span className="stage-head__spacer" />
            {isLoading && <span className="badge badge--accent">Loading recitation…</span>}
            {transformMode && <span className="badge">Drag the caption on the frame</span>}
          </div>

          <div className="stage-body">
            <div className="stage-frame" style={frameStyle}>
              <canvas
                ref={canvasRef}
                width={previewWidth}
                height={previewHeight}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                aria-label="Video preview"
              />
              {/* Hover and selection live on their own canvas so an export can
                  never pick them up. Hidden in transform mode, which owns the
                  pointer for dragging the caption box. */}
              {!transformMode && (
                <OverlayCanvas
                  layoutIndex={layoutIndex}
                  hover={hover}
                  selection={selection}
                  frameWidth={ASPECTS[aspect].width}
                  frameHeight={ASPECTS[aspect].height}
                />
              )}
              {isLoading && !timeline && (
                <div className="stage-overlay">
                  <div className="skeleton-lines" aria-hidden="true">
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                  </div>
                  <span className="stage-overlay__title">Loading recitation…</span>
                  <span className="stage-overlay__hint">
                    Fetching the verses and their timing from the reciter.
                  </span>
                </div>
              )}
              {!isLoading && !timeline && (
                <div className="stage-overlay">
                  <span className="stage-overlay__title">No recitation loaded</span>
                  <span className="stage-overlay__hint">
                    Choose a reciter, a surah and an ayah range on the left to build the frame.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="stage-foot">
            {currentVerse ? (
              <div className="stage-foot__verse">
                <span className="rosette" aria-hidden="true">
                  <span>{currentVerse.ayahNumber}</span>
                </span>
                <span className="stage-foot__verse-label">
                  Ayah <span className="measure">{currentVerse.ayahNumber}</span>
                  <span className="stage-foot__of">
                    {' '}
                    of <span className="measure">{timeline?.verses.length ?? 0}</span>
                  </span>
                </span>
              </div>
            ) : (
              <span className="stage-foot__verse-label">
                {timeline
                  ? 'Silence between ayat'
                  : isLoading
                    ? 'Loading recitation…'
                    : 'Waiting for a recitation'}
              </span>
            )}
            <span className="stage-foot__spacer" />
            {currentVerse && !isPlaying && !isExporting && playhead < 0.05 && (
              <span className="stage-foot__hint">Preview: middle of the range</span>
            )}
          </div>
        </section>

        <aside className="rail rail--look" aria-label="Look and captions">
          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Background</span>
            </div>
            <div className="swatches">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="swatch"
                  aria-pressed={bgId === g.id && !bgImageName}
                  onClick={() => {
                    setBgId(g.id);
                    handleClearImage();
                  }}
                >
                  <span
                    className="swatch__chip"
                    style={{
                      background: `linear-gradient(160deg, ${g.colors[0]}, ${g.colors[1]} 58%, ${g.colors[2]})`,
                    }}
                  />
                  <span className="swatch__label">{g.label}</span>
                </button>
              ))}
            </div>
            <div className="image-row">
              <label className="btn btn--secondary btn--sm" htmlFor="bg-image">
                <ImageIcon />
                Image
              </label>
              <input
                id="bg-image"
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleBgImage(e.target.files?.[0] ?? null);
                  e.currentTarget.value = '';
                }}
              />
              <span className="image-row__name" title={bgImageName ?? undefined}>
                {bgImageName ?? 'No image'}
              </span>
              {bgImageName && (
                <button type="button" className="btn btn--quiet btn--sm" onClick={handleClearImage}>
                  Remove
                </button>
              )}
            </div>
            <p className="rail__note">
              Uploaded images are cropped to the frame and drawn edge to edge.
            </p>
          </section>

          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Captions</span>
            </div>
            <Switch
              checked={translationEnabled}
              onChange={setTranslationEnabled}
              name="Translation"
              hint="Adds an English line under the Uthmani text."
            />
            <Switch
              checked={scrimEnabled}
              onChange={setScrimEnabled}
              name="Caption backdrop"
              hint="Dark band behind the text, for busy photographs."
            />
            <Switch
              checked={wordHighlightEnabled}
              onChange={setWordHighlightEnabled}
              name="Word highlight"
              hint="Lights the word being recited, when word timing exists."
            />
          </section>

          <section className="rail__section">
            <div className="section-head">
              <span className="section-head__title">Type</span>
            </div>
            <div className="color-pair">
              <ColorControl name="Caption text" color={textColor} onChange={setTextColor} />
              <ColorControl name="Glow" color={glowColor} onChange={setGlowColor} />
            </div>
            <Field label="Text opacity" value={`${Math.round(textOpacity * 100)}%`}>
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                value={Math.round(textOpacity * 100)}
                onChange={(e) => setTextOpacity(Number(e.target.value) / 100)}
              />
            </Field>
            <Switch
              checked={transformMode}
              onChange={setTransformMode}
              name="Position text"
              hint="Drag and resize the caption block directly on the frame."
            />
          </section>
        </aside>

        {/* Word styling shares the look rail: both edit how the frame paints,
            and a fourth column would crowd the stage. */}
        <div className="rail rail--style" aria-label="Word style">
          <Inspector
            selection={selection}
            scopeLabel={styleEditing.scopeLabel}
            currentStyle={styleEditing.currentStyle}
            inheritedStyle={styleEditing.inheritedStyle}
            hasOwnRule={styleEditing.hasOwnRule}
            onPropertyChange={styleEditing.setProperty}
            onReset={styleEditing.reset}
            isOpen={inspectorOpen}
            onToggle={() => setInspectorOpen((open) => !open)}
          />
          <AnnotationEditor
            selection={
              selection.current
                ? {
                    surah: selection.current.surah,
                    ayah: selection.current.ayah,
                    word: selection.type === 'word' ? selection.current.word : undefined,
                  }
                : null
            }
            annotations={annotations}
            onAnnotationAdd={(annotation) => commitAnnotations([...annotations, annotation])}
            onAnnotationUpdate={(id, updates) =>
              commitAnnotations(annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)))
            }
            onAnnotationDelete={(id) => commitAnnotations(annotations.filter((a) => a.id !== id))}
            isOpen={notesOpen}
            onToggle={() => setNotesOpen((open) => !open)}
          />
        </div>
      </div>

      <div className="transport">
        {exportState && (
          <div className="export-bar" role="status">
            <ExportIcon />
            <span>{exportState.label}</span>
            <span className="export-bar__track">
              <span
                className="export-bar__fill"
                style={{ width: `${Math.round(exportProgress * 100)}%` }}
              />
            </span>
            <span className="export-bar__pct">{Math.round(exportProgress * 100)}%</span>
          </div>
        )}
        <div className="transport__row">
          <div className="transport__buttons">
            <button
              type="button"
              className="btn btn--primary transport__play"
              onClick={handlePlayPause}
              disabled={!canPlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleStop}
              disabled={!canPlay}
            >
              <StopIcon />
              Stop
            </button>
          </div>

          <div className="transport__scrub">
            <div
              ref={scrubRef}
              className="ribbon"
              role="slider"
              tabIndex={0}
              aria-label="Seek within the recitation"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalSeconds)}
              aria-valuenow={Math.round(playhead)}
              aria-valuetext={`${formatSeconds(playhead)} of ${formatSeconds(totalSeconds)}`}
              onPointerDown={onScrubberDown}
              onPointerMove={onScrubberMove}
              onPointerUp={onScrubberUp}
              onPointerCancel={onScrubberUp}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  seekBy(1);
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  seekBy(-1);
                }
              }}
            >
              <div className="ribbon__track" aria-hidden="true">
                {timeline ? (
                  timeline.verses.map((v) => {
                    const span = Math.max(v.endSeconds - v.startSeconds, 0.01);
                    const active = playhead >= v.startSeconds && playhead < v.endSeconds;
                    return (
                      <span
                        key={v.verseKey}
                        className={active ? 'ribbon__seg is-active' : 'ribbon__seg'}
                        style={{ flexGrow: span }}
                      />
                    );
                  })
                ) : (
                  <span className="ribbon__seg" style={{ flexGrow: 1 }} />
                )}
              </div>
              <div
                className="ribbon__playhead"
                style={{ left: `${totalSeconds > 0 ? (playhead / totalSeconds) * 100 : 0}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="transport__time">
              <span>{formatSeconds(playhead)}</span>
              <span className="transport__time-sep">/</span>
              <span className="transport__time-total">{formatSeconds(totalSeconds)}</span>
            </div>
          </div>

          <div className="transport__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleExport}
              disabled={!timeline || isExporting || !timeline.meta.audioUrl}
            >
              <ExportIcon />
              {isExporting ? 'Exporting…' : 'Export MP4'}
            </button>
          </div>
        </div>
      </div>

      {cropImage && (
        <CropModal
          image={cropImage.img}
          defaultAspect={aspect as CropAspect}
          onAspectChange={(a) => setAspect(a as Aspect)}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
