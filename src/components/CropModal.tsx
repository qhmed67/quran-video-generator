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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Crop background image">
        <div className="modal__head">
          <h2 className="modal__title">Crop background image</h2>
          <div className="segmented" role="group" aria-label="Crop aspect ratio">
            <button type="button" aria-pressed={aspect === '9:16'} onClick={() => switchAspect('9:16')}>
              9:16
            </button>
            <button type="button" aria-pressed={aspect === '1:1'} onClick={() => switchAspect('1:1')}>
              1:1
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="modal__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
          <div style={{ position: 'absolute', left: 0, top: 0, width: rect.x, height: ch, background: 'var(--scrim)' }} />
          <div style={{ position: 'absolute', left: rect.x + rect.w, top: 0, width: cw - rect.x - rect.w, height: ch, background: 'var(--scrim)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: 0, width: rect.w, height: rect.y, background: 'var(--scrim)' }} />
          <div style={{ position: 'absolute', left: rect.x, top: rect.y + rect.h, width: rect.w, height: ch - rect.y - rect.h, background: 'var(--scrim)' }} />
          <div
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              border: '2px solid var(--accent)',
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
                background: 'var(--surface-raised)',
                border: '2px solid var(--accent)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            />
          ))}
        </div>

        <div className="modal__foot">
          <p className="modal__hint">
            Drag inside the frame to move it, or drag a corner to resize. The aspect stays locked to the output format.
          </p>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm}>
            Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}
