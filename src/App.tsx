import { useCallback, useEffect, useRef, useState } from 'react';
import { playClip } from './audio/engine';
import type { ClipPlayer } from './audio/engine';
import { resolveTiming, fetchReciterCatalog } from './data/resolver';
import { buildTimeline } from './data/timelineBuilder';
import type { QfChapterReciter } from './data/types';
import { exportClip } from './export/exporter';
import type { CaptionTimeline, TimingGranularity } from './lib/types/timeline';
import { GRADIENT_PRESETS, drawBackground } from './render/background';
import type { BgImage, GradientPreset } from './render/background';
import { loadFonts } from './render/fonts';
import type { FontSet } from './render/fonts';
import { defaultBounds, drawTransformOverlay, renderFrame } from './render/renderFrame';
import type { SnapState, TextBounds } from './render/renderFrame';
import CropModal from './components/CropModal';
import type { CropAspect } from './components/CropModal';

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

export default function App() {
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

  captionsRef.current = { uthmani: true, translation: translationEnabled };
  bgPresetRef.current = GRADIENT_PRESETS.find((p) => p.id === bgId) ?? GRADIENT_PRESETS[0];
  scrimRef.current = scrimEnabled;
  wordHighlightRef.current = wordHighlightEnabled;
  transformModeRef.current = transformMode;
  isExportingRef.current = isExporting;

  const size = ASPECTS[aspect];

  useEffect(() => {
    boundsRef.current = defaultBounds(size.width, size.height);
  }, [size.width, size.height]);

  const build = useCallback(
    async (rid: string, s: number, f: number, t: number, trans: boolean) => {
      if (!rid) return;
      if (s < 1 || s > 114 || f < 1 || t < 1 || f > t) {
        setError('Invalid verse range (1 <= from <= to)');
        return;
      }
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
        timelineRef.current = tl;
        setTimeline(tl);
        setGranularity(tl.meta.granularity);
        if (resolution.warnings.length > 0) {
          setError(resolution.warnings.join('; '));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
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

  useEffect(() => {
    build(reciterId, surah, from, to, translationEnabled);
  }, [reciterId, surah, from, to, translationEnabled, build]);

  useEffect(() => {
    loadFonts().then((fonts) => {
      fontsRef.current = fonts;
      setUthmaniFontReady(fonts.uthmaniLoaded);
    });
  }, []);

  useEffect(() => {
    if (!timeline || !timeline.meta.audioUrl) return;
    const dur =
      timeline.verses.length > 0 ? timeline.verses[timeline.verses.length - 1].endSeconds : undefined;
    let cancelled = false;
    playClip(timeline.meta.audioUrl, timeline.meta.clipStartOffsetSeconds, dur)
      .then((p) => {
        if (cancelled) {
          p.stop();
          return;
        }
        p.element.addEventListener('ended', () => setIsPlaying(false));
        playerRef.current = p;
      })
      .catch((err) => setError((err as Error).message));
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
      setIsPlaying(false);
    };
  }, [timeline]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    const loop = () => {
      const p = playerRef.current;
      const t = p ? p.timeSeconds() : 0;
      const tl = timelineRef.current;
      if (tl) {
        renderFrame(ctx, {
          tSeconds: t,
          timeline: tl,
          captionsOn: captionsRef.current,
          fonts: fontsRef.current,
          bounds: boundsRef.current,
          scrimEnabled: scrimRef.current,
          wordHighlightEnabled: wordHighlightRef.current,
          drawBackground: (c) => drawBackground(c, bgPresetRef.current, bgImageRef.current),
        });
      } else {
        drawBackground(ctx, bgPresetRef.current, bgImageRef.current);
      }
      if (transformModeRef.current && !isExportingRef.current) {
        drawTransformOverlay(ctx, boundsRef.current, snapRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const hitBoxHandle = (b: TextBounds, p: { x: number; y: number }): string | null => {
    const h = Math.max(18, Math.round(size.width * 0.022));
    const corners: { id: string; x: number; y: number }[] = [
      { id: 'tl', x: b.x, y: b.y },
      { id: 'tr', x: b.x + b.width, y: b.y },
      { id: 'bl', x: b.x, y: b.y + b.height },
      { id: 'br', x: b.x + b.width, y: b.y + b.height },
    ];
    for (const c of corners) {
      if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!transformModeRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toLogical(e);
    const b = boundsRef.current;
    const corner = hitBoxHandle(b, p);
    if (corner) {
      dragRef.current = { type: 'resize', corner, startX: p.x, startY: p.y, orig: { ...b } };
    } else if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) {
      dragRef.current = { type: 'move', corner: '', startX: p.x, startY: p.y, orig: { ...b } };
    } else {
      return;
    }
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toLogical(e);
    const W = size.width;
    const H = size.height;
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    let nx = d.orig.x;
    let ny = d.orig.y;
    let nw = d.orig.width;
    let nh = d.orig.height;
    if (d.type === 'move') {
      nx = d.orig.x + dx;
      ny = d.orig.y + dy;
    } else {
      let left = d.orig.x;
      let top = d.orig.y;
      let right = d.orig.x + d.orig.width;
      let bottom = d.orig.y + d.orig.height;
      if (d.corner.includes('l')) left = d.orig.x + dx;
      if (d.corner.includes('r')) right = d.orig.x + dx;
      if (d.corner.includes('t')) top = d.orig.y + dy;
      if (d.corner.includes('b')) bottom = d.orig.y + dy;
      if (right - left < MIN_BOX) {
        if (d.corner.includes('l')) left = right - MIN_BOX;
        else right = left + MIN_BOX;
      }
      if (bottom - top < MIN_BOX) {
        if (d.corner.includes('t')) top = bottom - MIN_BOX;
        else bottom = top + MIN_BOX;
      }
      nx = left;
      ny = top;
      nw = right - left;
      nh = bottom - top;
    }
    nx = Math.min(Math.max(nx, 0), W - nw);
    ny = Math.min(Math.max(ny, 0), H - nh);
    const cx = nx + nw / 2;
    const cy = ny + nh / 2;
    const snapX = Math.abs(cx - W / 2) < SNAP_PX;
    const snapY = Math.abs(cy - H / 2) < SNAP_PX;
    if (snapX) nx = W / 2 - nw / 2;
    if (snapY) ny = H / 2 - nh / 2;
    nx = Math.min(Math.max(nx, 0), W - nw);
    ny = Math.min(Math.max(ny, 0), H - nh);
    snapRef.current = { x: snapX, y: snapY };
    boundsRef.current = { x: nx, y: ny, width: nw, height: nh };
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    snapRef.current = { x: false, y: false };
  };

  const handlePlayPause = useCallback(async () => {
    let p = playerRef.current;
    const tl = timelineRef.current;
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
    if (isPlaying) {
      p.pause();
      setIsPlaying(false);
    } else {
      await p.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.element.currentTime = timelineRef.current?.meta.clipStartOffsetSeconds ?? 0;
    setIsPlaying(false);
  }, []);

  const handleBgImage = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setCropImage({ url, img });
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropImage((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
  }, []);

  const handleCropConfirm = useCallback((canvas: HTMLCanvasElement) => {
    setCropImage((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
    bgImageRef.current = canvas;
  }, []);

  const handleExport = useCallback(async () => {
    const tl = timelineRef.current;
    const p = playerRef.current;
    const ctx = ctxRef.current;
    if (!tl || !p || !ctx) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      const duration = tl.verses[tl.verses.length - 1].endSeconds;
      p.element.currentTime = tl.meta.clipStartOffsetSeconds;
      await p.play();
      setIsPlaying(true);
      const result = await exportClip({
        canvas: ctx.canvas,
        audioEl: p.element,
        durationSeconds: duration,
        onCaptureProgress: (d) => setExportProgress(Math.min(0.9, d / duration)),
        onTranscodeProgress: (pr) =>
          setExportProgress(0.9 + 0.1 * Math.min(1, pr.ratio / duration)),
      });
      downloadBlob(result.blob, `quran-${tl.meta.surah}-${tl.meta.versesFrom}-${tl.meta.versesTo}.mp4`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      p.pause();
    }
  }, []);

  const durSeconds =
    timeline && timeline.verses.length > 0
      ? timeline.verses[timeline.verses.length - 1].endSeconds
      : 0;

  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, height: '100%' }}>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            height: '100%',
            maxHeight: 720,
            aspectRatio: `${size.width} / ${size.height}`,
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            touchAction: 'none',
            cursor: transformMode ? 'move' : 'default',
          }}
        />
      </main>

      <aside style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Quranic Video Generator</h1>

        <label>
          Reciter
          <select
            value={reciterId}
            onChange={(e) => setReciterId(e.target.value)}
            style={inputStyle}
          >
            {reciters.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
                {r.style?.name ? ` — ${r.style.name}` : ''}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>
            Surah
            <input
              type="number"
              min={1}
              max={114}
              value={surah}
              onChange={(e) => setSurah(Number(e.target.value))}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1 }}>
            From ayah
            <input
              type="number"
              min={1}
              max={286}
              value={from}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setFrom(Math.min(v, to));
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1 }}>
            To ayah
            <input
              type="number"
              min={1}
              max={286}
              value={to}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setTo(Math.max(v, from));
              }}
              style={inputStyle}
            />
          </label>
        </div>

        <label>
          Format
          <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} style={inputStyle}>
            <option value="9:16">Vertical 9:16 (1080x1920)</option>
            <option value="1:1">Square 1:1 (1080x1080)</option>
          </select>
        </label>

        <label>
          Background
          <select value={bgId} onChange={(e) => setBgId(e.target.value)} style={inputStyle}>
            {GRADIENT_PRESETS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Background image
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleBgImage(e.target.files?.[0] ?? null)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={translationEnabled}
            onChange={(e) => setTranslationEnabled(e.target.checked)}
          />
          Show translation
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={scrimEnabled}
            onChange={(e) => setScrimEnabled(e.target.checked)}
          />
          Caption background (scrim)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={wordHighlightEnabled}
            onChange={(e) => setWordHighlightEnabled(e.target.checked)}
          />
          Word-by-word highlight
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={transformMode}
            onChange={(e) => setTransformMode(e.target.checked)}
          />
          Text transform (drag / resize on canvas)
        </label>
        {transformMode && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Drag inside the box to move it, drag corner handles to resize. The box snaps to the
            canvas center guides. Overlay is hidden during export.
          </div>
        )}

        {granularity && (
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Timing: <strong>{granularity}</strong> · Duration: {durSeconds.toFixed(1)}s
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePlayPause} disabled={!timeline || isExporting} style={buttonStyle}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={handleStop} disabled={!timeline || isExporting} style={buttonStyle}>
            Stop
          </button>
          <button onClick={handleExport} disabled={!timeline || isExporting} style={buttonStyle}>
            {isExporting ? `Exporting ${Math.round(exportProgress * 100)}%` : 'Export MP4'}
          </button>
        </div>

        {isLoading && <div style={{ fontSize: 13, opacity: 0.8 }}>Loading timeline…</div>}
        {!uthmaniFontReady && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Note: Uthmani font file not found — add{' '}
            <code>public/fonts/KFGQPC-Uthmanic-HAFS.otf</code> for the official script
            (currently falling back to Scheherazade New).
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: '#fca5a5' }}>{error}</div>}
        {isExporting && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Keep this tab in the foreground during export.
          </div>
        )}
      </aside>

      {cropImage && (
        <CropModal
          image={cropImage.img}
          defaultAspect={aspect as CropAspect}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  background: '#161b22',
  color: '#e7e7e7',
  border: '1px solid #30363d',
  borderRadius: 6,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#1f6feb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
};