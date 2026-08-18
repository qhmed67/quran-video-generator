import { useCallback, useEffect, useRef, useState } from 'react';

export type CropAspect = '1:1' | '9:16';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function aspectValue(a: CropAspect): number {
  return a === '9:16' ? 9 / 16 : 1;
}

function initCrop(imgW: number, imgH: number, aspect: CropAspect): CropRect {
  const want = aspectValue(aspect);
  const imgA = imgW / imgH;
  let w: number;
  let h: number;
  if (imgA > want) {
    h = imgH;
    w = h * want;
  } else {
    w = imgW;
    h = w / want;
  }
  return { x: (imgW - w) / 2, y: (imgH - h) / 2, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

interface Props {
  image: HTMLImageElement;
  defaultAspect: CropAspect;
  onAspectChange?: (a: CropAspect) => void;
  onConfirm: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
}

const HANDLE_PX = 16;

export default function CropModal({ image, defaultAspect, onAspectChange, onConfirm, onCancel }: Props) {
  const [aspect, setAspect] = useState<CropAspect>(defaultAspect);
  const [crop, setCrop] = useState<CropRect>(() =>
    initCrop(image.naturalWidth, image.naturalHeight, defaultAspect),
  );
  const [view, setView] = useState({ dx: 0, dy: 0, dw: 0, dh: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; corner: string; startX: number; startY: number; orig: CropRect } | null>(null);

  useEffect(() => {
    if (defaultAspect === aspect) return;
    setAspect(defaultAspect);
    setCrop(initCrop(image.naturalWidth, image.naturalHeight, defaultAspect));
  }, [defaultAspect, aspect, image]);

  const updateView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / image.naturalWidth, ch / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    setView({ dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh, scale });
  }, [image]);

  useEffect(() => {
    updateView();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateView);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateView]);

  const toNatural = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.dx) / view.scale,
      y: (clientY - r.top - view.dy) / view.scale,
    };
  };

  const hitHandle = (p: { x: number; y: number }): string | null => {
    const h = HANDLE_PX / view.scale;
    const corners: { id: string; x: number; y: number }[] = [
      { id: 'tl', x: crop.x, y: crop.y },
      { id: 'tr', x: crop.x + crop.w, y: crop.y },
      { id: 'bl', x: crop.x, y: crop.y + crop.h },
      { id: 'br', x: crop.x + crop.w, y: crop.y + crop.h },
    ];
    for (const c of corners) {
      if (Math.abs(p.x - c.x) <= h && Math.abs(p.y - c.y) <= h) return c.id;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toNatural(e.clientX, e.clientY);
    const corner = hitHandle(p);
    if (corner) {
      dragRef.current = { mode: 'resize', corner, startX: p.x, startY: p.y, orig: { ...crop } };
    } else if (p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h) {
      dragRef.current = { mode: 'move', corner: '', startX: p.x, startY: p.y, orig: { ...crop } };
    } else {
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toNatural(e.clientX, e.clientY);
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    if (d.mode === 'move') {
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      setCrop({
        x: clamp(d.orig.x + dx, 0, iw - d.orig.w),
        y: clamp(d.orig.y + dy, 0, ih - d.orig.h),
        w: d.orig.w,
        h: d.orig.h,
      });
      return;
    }
    const want = aspectValue(aspect);
    const k = 1 / want;
    const anchorX = d.corner.includes('l') ? d.orig.x + d.orig.w : d.orig.x;
    const anchorY = d.corner.includes('t') ? d.orig.y + d.orig.h : d.orig.y;
    const dirX = d.corner.includes('l') ? -1 : 1;
    const dirY = d.corner.includes('t') ? -1 : 1;
    const maxW = dirX === -1 ? anchorX : iw - anchorX;
    const maxH = dirY === -1 ? anchorY : ih - anchorY;
    const vx = p.x - anchorX;
    const vy = p.y - anchorY;
    const t = Math.max(0, (vx * dirX + vy * dirY * k) / (1 + k * k));
    let w = Math.min(t, maxW);
    let h = w * k;
    if (h > maxH) {
      h = maxH;
      w = h / k;
    }
    w = Math.min(w, maxW);
    h = w * k;
    w = Math.max(w, 20);
    h = w * k;
    const x = dirX === -1 ? anchorX - w : anchorX;
    const y = dirY === -1 ? anchorY - h : anchorY;
    setCrop({ x, y, w, h });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const switchAspect = (a: CropAspect) => {
    setAspect(a);
    setCrop(initCrop(image.naturalWidth, image.naturalHeight, a));
    onAspectChange?.(a);
  };

  const confirm = () => {
    const want = aspectValue(aspect);
    const long = 1080;
    const cw = Math.round(long * want);
    const ch = long;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    if (!octx) return;
    octx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
    onConfirm(out);
  };

  const cw = 2 * view.dx + view.dw;
  const ch = 2 * view.dy + view.dh;
  const rect = {
    x: view.dx + crop.x * view.scale,
    y: view.dy + crop.y * view.scale,
    w: crop.w * view.scale,
    h: crop.h * view.scale,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: '#161b22',
          borderRadius: 12,
          padding: 20,
          width: 'min(92vw, 860px)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          border: '1px solid #30363d',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Crop background image</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => switchAspect('1:1')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: aspect === '1:1' ? '#1f6feb' : '#21262d',
                color: '#fff',
              }}
            >
              1:1
            </button>
            <button
              onClick={() => switchAspect('9:16')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: aspect === '9:16' ? '#1f6feb' : '#21262d',
                color: '#fff',
              }}
            >
              9:16
            </button>
          </div>
        </div>
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'relative',
            width: '100%',
            height: 'min(60vh, 540px)',
            overflow: 'hidden',
            borderRadius: 8,
            background: '#0b0f14',
            touchAction: 'none',
            userSelect: 'none',
            cursor: 'move',
          }}
        >
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: view.dx,
              top: view.dy,
              width: view.dw,
              height: view.dh,
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'absolute', left: 0, top: 0, width: rect.x, height: ch, background: 'rgba(0,0,0,0.62)' }} />
          <div style={{ position: 'absolute', left: rect.x + rect.w, top: 0, width: cw - rect.x - rect.w, height: ch, background: 'rgba(0,0,0,0.62)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: 0, width: rect.w, height: rect.y, background: 'rgba(0,0,0,0.62)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: rect.y + rect.h, width: rect.w, height: ch - rect.y - rect.h, background: 'rgba(0,0,0,0.62)' }} />
          <div
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              border: '2px solid #60a5fa',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5) inset',
              pointerEvents: 'none',
            }}
          />
          {(
            [
              [rect.x, rect.y],
              [rect.x + rect.w, rect.y],
              [rect.x, rect.y + rect.h],
              [rect.x + rect.w, rect.y + rect.h],
            ] as [number, number][]
          ).map(([hx, hy], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: hx - HANDLE_PX / 2,
                top: hy - HANDLE_PX / 2,
                width: HANDLE_PX,
                height: HANDLE_PX,
                background: '#ffffff',
                border: '2px solid #60a5fa',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Drag inside the frame to move · drag a corner handle to resize (aspect locked).
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={{ padding: '8px 14px', background: '#21262d', color: '#fff', border: '1px solid #30363d', borderRadius: 6 }}>
            Cancel
          </button>
          <button onClick={confirm} style={{ padding: '8px 14px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600 }}>
            Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}