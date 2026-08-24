import { useCallback, useEffect, useRef, useState } from 'react';
import { playClip } from './audio/engine';
import type { ClipPlayer } from './audio/engine';
import { resolveTiming, fetchReciterCatalog } from './data/resolver';
import { buildTimeline } from './data/timelineBuilder';
import type { QfChapterReciter } from './data/types';
import { exportClip } from './export/exporter';
import { compareToWindow } from './lib/time';
import type { CaptionTimeline, TimingGranularity, VerseTimelineEntry } from './lib/types/timeline';
import { GRADIENT_PRESETS, drawBackground } from './render/background';
import type { BgImage, GradientPreset } from './render/background';
import { loadFonts } from './render/fonts';
import type { FontSet } from './render/fonts';
import { defaultBounds, drawTransformOverlay, layoutUthmaniText, renderFrame } from './render/renderFrame';
import type { HslColor, SnapState, TextBounds } from './render/renderFrame';
import CropModal from './components/CropModal';
import type { CropAspect } from './components/CropModal';

/* ── Reusable Components ── */

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-2)' }}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ color: 'var(--fg)' }}>{label}</span>
    </label>
  );
}

function HslSlider({ label, color, onChange }: { label: string; color: HslColor; onChange: (c: HslColor) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 20, height: 20, borderRadius: 4,
        background: `hsl(${color.h}, ${color.s}%, ${color.l}%)`,
        border: '1px solid var(--border)', flexShrink: 0,
      }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <label style={{ fontSize: 10, color: 'var(--muted)' }}>{label} H:{color.h}</label>
        <input type="range" min={0} max={360} value={color.h} onChange={(e) => onChange({ ...color, h: Number(e.target.value) })} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <label style={{ fontSize: 10, color: 'var(--muted)' }}>S:{color.s}%</label>
        <input type="range" min={0} max={100} value={color.s} onChange={(e) => onChange({ ...color, s: Number(e.target.value) })} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <label style={{ fontSize: 10, color: 'var(--muted)' }}>L:{color.l}%</label>
        <input type="range" min={0} max={100} value={color.l} onChange={(e) => onChange({ ...color, l: Number(e.target.value) })} />
      </div>
    </div>
  );
}

/* ── Shared Input Styles ── */

const inputBase: React.CSSProperties = {
  display: 'block', width: '100%', padding: '6px 10px',
  background: 'var(--surface)', color: 'var(--fg)',
  border: '1px solid var(--border)', borderRadius: 4, fontSize: 13,
  transition: 'border-color 150ms, box-shadow 150ms',
};

const selectBase: React.CSSProperties = {
  ...inputBase, paddingRight: 32,
};

/* ── App ── */

type Aspect = '9:16' | '1:1';

const ASPECTS: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

const TRANSLATION_ID = 131;
const SNAP_PX = 14;
const MIN_BOX = 60;

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Theme = 'light' | 'dark';

const ThemeToggle = ({ theme, onToggle }: { theme: Theme; onToggle: () => void }) => (
  <button onClick={onToggle} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="theme-toggle" style={{ padding: '6px 8px' }}>
    {theme === 'dark' ? (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ) : (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )}
  </button>
);

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
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
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [uthmaniFontReady, setUthmaniFontReady] = useState(true);
  const [scrimEnabled, setScrimEnabled] = useState(false);
  const [wordHighlightEnabled, setWordHighlightEnabled] = useState(false);
  const [transformMode, setTransformMode] = useState(false);
  const [cropImage, setCropImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [maxWordsPerScreen] = useState(0);
  const [textColor, setTextColor] = useState<HslColor>({ h: 0, s: 0, l: 100 });
  const [glowColor, setGlowColor] = useState<HslColor>({ h: 38, s: 100, l: 70 });
  const [textOpacity, setTextOpacity] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const playerRef = useRef<ClipPlayer | null>(null);
  const timelineRef = useRef<CaptionTimeline | null>(null);
  const fontsRef = useRef<FontSet>({ uthmani: 'serif', translation: 'sans-serif', uthmaniLoaded: false });
  const bgImageRef = useRef<BgImage>(null);
  const bgPresetRef = useRef<GradientPreset>(GRADIENT_PRESETS[0]);
  const captionsRef = useRef({ uthmani: true, translation: false });
  const boundsRef = useRef<TextBounds>(defaultBounds(1080, 1920));
  const snapRef = useRef<SnapState>({ x: false, y: false });
  const dragRef = useRef<{
    type: 'move' | 'resize'; corner: string;
    startX: number; startY: number; orig: TextBounds;
  } | null>(null);
  const scrimRef = useRef(false);
  const wordHighlightRef = useRef(false);
  const transformModeRef = useRef(false);
  const isExportingRef = useRef(false);
  const maxWordsRef = useRef(0);
  const textColorRef = useRef<HslColor>({ h: 0, s: 0, l: 100 });
  const glowColorRef = useRef<HslColor>({ h: 38, s: 100, l: 70 });
  const textOpacityRef = useRef(1);

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

  const size = ASPECTS[aspect];

  useEffect(() => { boundsRef.current = defaultBounds(size.width, size.height); }, [size.width, size.height]);

  const buildSeq = useRef(0);

  const build = useCallback(async (rid: string, s: number, f: number, t: number, trans: boolean) => {
    if (!rid) return;
    if (s < 1 || s > 114 || f < 1 || t < 1 || f > t) { setError('Invalid verse range'); return; }
    const seq = ++buildSeq.current;
    setIsLoading(true); setError(null);
    try {
      const resolution = await resolveTiming({ reciterId: rid, surah: s, verses: [f, t] });
      const tl = await buildTimeline({ range: { surah: s, from: f, to: t }, reciterId: rid, captions: { uthmani: true, translation: { enabled: trans, translationId: TRANSLATION_ID, language: 'en' } } }, resolution);
      if (seq !== buildSeq.current) return;
      timelineRef.current = tl; setTimeline(tl); setGranularity(tl.meta.granularity);
      if (resolution.warnings.length > 0) setError(resolution.warnings.join('; '));
    } catch (err) { if (seq !== buildSeq.current) return; setError((err as Error).message); } finally { if (seq === buildSeq.current) setIsLoading(false); }
  }, []);

  useEffect(() => { fetchReciterCatalog().then((rs) => { setReciters(rs); if (rs.length > 0) setReciterId(String(rs[0].id)); }).catch((err) => setError((err as Error).message)); }, []);
  useEffect(() => { build(reciterId, surah, from, to, translationEnabled); }, [reciterId, surah, from, to, translationEnabled, build]);
  useEffect(() => { loadFonts().then((fonts) => { fontsRef.current = fonts; setUthmaniFontReady(fonts.uthmaniLoaded); }); }, []);

  useEffect(() => {
    if (!timeline || !timeline.meta.audioUrl) return;
    const dur = timeline.verses.length > 0 ? timeline.verses[timeline.verses.length - 1].endSeconds : undefined;
    let cancelled = false;
    playClip(timeline.meta.audioUrl, timeline.meta.clipStartOffsetSeconds, dur)
      .then((p) => { if (cancelled) { p.stop(); return; } p.element.addEventListener('ended', () => setIsPlaying(false)); playerRef.current = p; })
      .catch((err) => setError((err as Error).message));
    return () => { cancelled = true; playerRef.current?.stop(); playerRef.current = null; setIsPlaying(false); };
  }, [timeline]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return; ctxRef.current = ctx;
    const loop = () => {
      const p = playerRef.current; const t = p ? p.timeSeconds() : 0; const tl = timelineRef.current;
      if (tl) { renderFrame(ctx, { tSeconds: t, timeline: tl, captionsOn: captionsRef.current, fonts: fontsRef.current, bounds: boundsRef.current, scrimEnabled: scrimRef.current, wordHighlightEnabled: wordHighlightRef.current, maxWordsPerScreen: maxWordsRef.current, textColor: textColorRef.current, glowColor: glowColorRef.current, textOpacity: textOpacityRef.current, drawBackground: (c) => drawBackground(c, bgPresetRef.current, bgImageRef.current) }); }
      else { drawBackground(ctx, bgPresetRef.current, bgImageRef.current); }
      if (transformModeRef.current && !isExportingRef.current) drawTransformOverlay(ctx, boundsRef.current, snapRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toLogicalPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * (canvas.width / r.width), y: (clientY - r.top) * (canvas.height / r.height) };
  };

  const measureTextBlock = (box: TextBounds): { width: number; height: number } | null => {
    const ctx = ctxRef.current; const tl = timelineRef.current;
    if (!ctx || !tl) return null;
    const t = playerRef.current?.timeSeconds() ?? 0;
    let verse: VerseTimelineEntry | null = null;
    for (const v of tl.verses) { if (compareToWindow(t, v.startSeconds, v.endSeconds) === 0) { verse = v; break; } }
    if (!verse) return null;
    const info = layoutUthmaniText(ctx, verse, { fonts: fontsRef.current, boxW: box.width, boxH: box.height, align: 'center', atMinFont: true });
    return { width: info.width, height: info.height };
  };

  const RESIZE_CURSOR: Record<string, string> = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', l: 'ew-resize', r: 'ew-resize', t: 'ns-resize', b: 'ns-resize' };

  const applyCursor = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const d = dragRef.current; let cursor = 'default';
    if (d) { cursor = d.type === 'move' ? 'grabbing' : RESIZE_CURSOR[d.corner] ?? 'default'; }
    else if (transformModeRef.current) { const p = toLogicalPoint(clientX, clientY); const b = boundsRef.current; const corner = hitBoxHandle(b, p); if (corner) cursor = RESIZE_CURSOR[corner] ?? 'default'; else if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) cursor = 'move'; }
    canvas.style.cursor = cursor;
  };

  const hitBoxHandle = (b: TextBounds, p: { x: number; y: number }): string | null => {
    const h = Math.max(18, Math.round(size.width * 0.022));
    const corners = [{ id: 'tl', x: b.x, y: b.y }, { id: 'tr', x: b.x + b.width, y: b.y }, { id: 'bl', x: b.x, y: b.y + b.height }, { id: 'br', x: b.x + b.width, y: b.y + b.height }];
    for (const c of corners) { if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id; }
    const edges = [{ id: 'l', x: b.x, y: b.y + b.height / 2 }, { id: 'r', x: b.x + b.width, y: b.y + b.height / 2 }, { id: 't', x: b.x + b.width / 2, y: b.y }, { id: 'b', x: b.x + b.width / 2, y: b.y + b.height }];
    for (const c of edges) { if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id; }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!transformModeRef.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const p = toLogicalPoint(e.clientX, e.clientY); const b = boundsRef.current; const corner = hitBoxHandle(b, p);
    if (corner) dragRef.current = { type: 'resize', corner, startX: p.x, startY: p.y, orig: { ...b } };
    else if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) dragRef.current = { type: 'move', corner: '', startX: p.x, startY: p.y, orig: { ...b } };
    else return;
    applyCursor(e.clientX, e.clientY); canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current; if (!d) return;
    const p = toLogicalPoint(e.clientX, e.clientY); const W = size.width; const H = size.height;
    const dx = p.x - d.startX; const dy = p.y - d.startY;
    let nx = d.orig.x; let ny = d.orig.y; let nw = d.orig.width; let nh = d.orig.height;
    if (d.type === 'move') {
      nx = Math.min(Math.max(d.orig.x + dx, 0), W - nw); ny = Math.min(Math.max(d.orig.y + dy, 0), H - nh);
      const cx = nx + nw / 2; const cy = ny + nh / 2;
      const snapX = Math.abs(cx - W / 2) < SNAP_PX; const snapY = Math.abs(cy - H / 2) < SNAP_PX;
      if (snapX) nx = W / 2 - nw / 2; if (snapY) ny = H / 2 - nh / 2;
      snapRef.current = { x: snapX, y: snapY };
    } else {
      const anchorX = d.corner.includes('l') ? d.orig.x + d.orig.width : d.orig.x;
      const anchorY = d.corner.includes('t') ? d.orig.y + d.orig.height : d.orig.y;
      const dirX = d.corner.includes('l') ? -1 : d.corner.includes('r') ? 1 : 0;
      const dirY = d.corner.includes('t') ? -1 : d.corner.includes('b') ? 1 : 0;
      const maxW = dirX === -1 ? anchorX : W - anchorX; const maxH = dirY === -1 ? anchorY : H - anchorY;
      nw = dirX === 0 ? d.orig.width : Math.min(Math.max(dirX * (p.x - anchorX), MIN_BOX), maxW);
      nh = dirY === 0 ? d.orig.height : Math.min(Math.max(dirY * (p.y - anchorY), MIN_BOX), maxH);
      const text = measureTextBlock({ x: 0, y: 0, width: nw, height: nh });
      if (text) { nw = Math.max(nw, Math.ceil(text.width)); nh = Math.max(nh, Math.ceil(text.height)); }
      nw = Math.min(nw, maxW); nh = Math.min(nh, maxH);
      nx = dirX === -1 ? anchorX - nw : anchorX; ny = dirY === -1 ? anchorY - nh : anchorY;
      snapRef.current = { x: false, y: false };
    }
    boundsRef.current = { x: nx, y: ny, width: nw, height: nh };
    applyCursor(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => { dragRef.current = null; snapRef.current = { x: false, y: false }; applyCursor(e.clientX, e.clientY); };
  const handlePointerLeave = () => { if (!dragRef.current) { const c = canvasRef.current; if (c) c.style.cursor = 'default'; } };

  const handlePlayPause = useCallback(async () => {
    let p = playerRef.current; const tl = timelineRef.current;
    if (!p && tl && tl.meta.audioUrl) {
      try { const dur = tl.verses.length > 0 ? tl.verses[tl.verses.length - 1].endSeconds : undefined; p = await playClip(tl.meta.audioUrl, tl.meta.clipStartOffsetSeconds, dur); p.element.addEventListener('ended', () => setIsPlaying(false)); playerRef.current = p; }
      catch (err) { setError((err as Error).message); return; }
    }
    if (!p) return;
    if (isPlaying) { p.pause(); setIsPlaying(false); } else { await p.play(); setIsPlaying(true); }
  }, [isPlaying]);

  const handleStop = useCallback(() => { const p = playerRef.current; if (!p) return; p.pause(); p.element.currentTime = timelineRef.current?.meta.clipStartOffsetSeconds ?? 0; setIsPlaying(false); }, []);

  const handleBgImage = useCallback((file: File | null) => { if (!file) return; const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => setCropImage({ url, img }); img.onerror = () => URL.revokeObjectURL(url); img.src = url; }, []);
  const handleCropCancel = useCallback(() => { setCropImage((cur) => { if (cur) URL.revokeObjectURL(cur.url); return null; }); }, []);
  const handleCropConfirm = useCallback((canvas: HTMLCanvasElement) => { setCropImage((cur) => { if (cur) URL.revokeObjectURL(cur.url); return null; }); bgImageRef.current = canvas; }, []);

  const [audioWarning, setAudioWarning] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    const tl = timelineRef.current;
    const ctx = ctxRef.current;
    if (!tl) {
      setError('No timeline loaded — load a recitation range first');
      return;
    }
    if (!ctx) {
      setError('Canvas not initialised — please reload the page');
      return;
    }
    if (!tl.meta.audioUrl) {
      setError('No audio source available for this recitation');
      return;
    }
    setIsExporting(true);
    setExportProgress(0);
    setAudioWarning(null);
    try {
      const duration = tl.verses[tl.verses.length - 1].endSeconds;
      const result = await exportClip({
        width: ctx.canvas.width,
        height: ctx.canvas.height,
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
          drawBackground: (c) => drawBackground(c, bgPresetRef.current, bgImageRef.current),
        },
        onProgress: (p) => {
          if (p.phase === 'render') setExportProgress(p.ratio * 0.85);
          else if (p.phase === 'audio') setExportProgress(0.85 + p.ratio * 0.12);
          else setExportProgress(0.97 + p.ratio * 0.03);
        },
      });
      if (!result.hasAudio) {
        setAudioWarning('Exported video has no audio — audio encoding was unavailable in this browser context');
      }
      downloadBlob(result.blob, `quran-${tl.meta.surah}-${tl.meta.versesFrom}-${tl.meta.versesTo}.mp4`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, []);

  const durSeconds = timeline && timeline.verses.length > 0 ? timeline.verses[timeline.verses.length - 1].endSeconds : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Top Bar ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border-soft)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <img src="/download.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              Quranic Video Generator
            </span>
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {granularity && (
            <span style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px', background: 'var(--surface-warm)', borderRadius: 9999 }}>
              {durSeconds.toFixed(1)}s
            </span>
          )}
          {isLoading && (
            <span style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading
            </span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: 'var(--danger)', padding: '4px 10px', background: 'var(--danger-soft)', borderRadius: 9999, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {error}
            </span>
          )}
          {!uthmaniFontReady && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Font fallback
            </span>
          )}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {/* ── Canvas Area ── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          style={{
            height: '100%', maxHeight: '100%',
            aspectRatio: `${size.width} / ${size.height}`,
            borderRadius: 12,
            boxShadow: '0 0 0.5px 0 rgba(0,0,0,0.14), 0 8px 32px 0 rgba(0,0,0,0.24)',
            touchAction: 'none',
          }}
        />
      </main>

      {/* ── Bottom Control Panel ── */}
      <div style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border-soft)',
        padding: '16px 24px',
        display: 'flex', gap: 24, flexWrap: 'wrap',
        alignItems: 'flex-start', flexShrink: 0,
      }}>

        {/* Content Group */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flex: '1 1 auto' }}>
          <Field label="Reciter" style={{ minWidth: 160 }}>
            <select value={reciterId} onChange={(e) => setReciterId(e.target.value)} style={selectBase}>
              {reciters.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name}{r.style?.name ? ` - ${r.style.name}` : ''}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Surah" style={{ width: 64 }}>
              <input type="number" min={1} max={114} value={surah} onChange={(e) => setSurah(Number(e.target.value))} style={inputBase} />
            </Field>
            <Field label="From" style={{ width: 64 }}>
              <input type="number" min={1} max={286} value={from} onChange={(e) => { const v = Math.max(1, Number(e.target.value)); setFrom(Math.min(v, to)); }} style={inputBase} />
            </Field>
            <Field label="To" style={{ width: 64 }}>
              <input type="number" min={1} max={286} value={to} onChange={(e) => { const v = Math.max(1, Number(e.target.value)); setTo(Math.max(v, from)); }} style={inputBase} />
            </Field>
          </div>

          <Field label="Format" style={{ width: 110 }}>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} style={selectBase}>
              <option value="9:16">Vertical 9:16</option>
              <option value="1:1">Square 1:1</option>
            </select>
          </Field>

          <Field label="Background" style={{ width: 130 }}>
            <select value={bgId} onChange={(e) => setBgId(e.target.value)} style={selectBase}>
              {GRADIENT_PRESETS.map((g) => (<option key={g.id} value={g.id}>{g.label}</option>))}
            </select>
          </Field>

          <Field label="Image" style={{ width: 120 }}>
            <input type="file" accept="image/*" onChange={(e) => handleBgImage(e.target.files?.[0] ?? null)} style={{ fontSize: 12, color: 'var(--muted)' }} />
          </Field>
        </div>

        {/* Playback Group */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={handlePlayPause} disabled={!timeline || isExporting} style={{
            padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-on)',
            border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13,
            letterSpacing: '-0.01em', cursor: 'pointer',
            transition: 'all 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }} onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')} onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={handleStop} disabled={!timeline || isExporting} style={{
            padding: '8px 16px', background: 'transparent', color: 'var(--fg)',
            border: '1px solid var(--border)', borderRadius: 9999, fontWeight: 600, fontSize: 13,
            letterSpacing: '-0.01em', cursor: 'pointer',
            transition: 'all 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }} onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')} onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
            Stop
          </button>
          <button onClick={handleExport} disabled={!timeline || isExporting} style={{
            padding: '8px 20px', background: isExporting ? 'var(--surface-warm)' : 'var(--accent)',
            color: isExporting ? 'var(--muted)' : 'var(--accent-on)',
            border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13,
            letterSpacing: '-0.01em', cursor: isExporting ? 'default' : 'pointer',
            transition: 'all 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }} onMouseDown={(e) => { if (!isExporting) e.currentTarget.style.transform = 'scale(0.95)'; }} onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
            {isExporting ? `${Math.round(exportProgress * 100)}%` : 'Export MP4'}
          </button>
        </div>

        {/* Appearance Group */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Toggle checked={translationEnabled} onChange={setTranslationEnabled} label="Translation" />
            <Toggle checked={scrimEnabled} onChange={setScrimEnabled} label="Caption bg" />
            <Toggle checked={wordHighlightEnabled} onChange={setWordHighlightEnabled} label="Word highlight" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
            <HslSlider label="Text" color={textColor} onChange={setTextColor} />
            <HslSlider label="Glow" color={glowColor} onChange={setGlowColor} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, color: 'var(--muted)' }}>
              Opacity: {Math.round(textOpacity * 100)}%
            </label>
            <input type="range" min={0} max={100} value={Math.round(textOpacity * 100)}
              onChange={(e) => setTextOpacity(Number(e.target.value) / 100)} style={{ width: 100 }} />
            <Toggle checked={transformMode} onChange={setTransformMode} label="Transform" />
          </div>
        </div>
      </div>

      {cropImage && (
        <CropModal image={cropImage.img} defaultAspect={aspect as CropAspect}
          onAspectChange={(a) => setAspect(a as Aspect)} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}

      {audioWarning && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          fontSize: 12, color: '#fbbf24', background: 'var(--surface)',
          padding: '6px 14px', borderRadius: 9999, border: '1px solid var(--border)',
        }}>
          {audioWarning}
        </div>
      )}
    </div>
  );
}
