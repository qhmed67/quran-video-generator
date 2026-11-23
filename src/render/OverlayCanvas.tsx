/**
 * Overlay canvas for hover and selection feedback (plan phase 4.2).
 *
 * Draws hover and selection boxes on a separate canvas stacked over the
 * preview. It must never be baked into exports, so nothing here touches the
 * frame renderer: the overlay only reads layout geometry.
 *
 * Colours come from the design tokens read off the document root, so the
 * overlay follows the light/dark theme instead of carrying its own palette.
 */

import { useEffect, useRef } from 'react';
import type { LayoutIndex } from './layoutIndex';
import { sameWordRef } from './layoutIndex';
import { RANGE_HANDLE_RADIUS, rangeHandlePoints, wordBox } from './rangeHandles';
import type { HoverState, SelectionState } from './usePreviewPointer';

interface OverlayCanvasProps {
  /** Layout geometry in logical frame coordinates. */
  layoutIndex: LayoutIndex | null;
  hover: HoverState;
  selection: SelectionState;
  /** Logical (export) frame size the layout index is expressed in. */
  frameWidth: number;
  frameHeight: number;
}

/** Every word between two refs in reading order, inclusive. */
function boxesInRange(
  layoutIndex: LayoutIndex,
  from: { surah: number; ayah: number; word: number },
  to: { surah: number; ayah: number; word: number },
): { x: number; y: number; width: number; height: number }[] {
  const ordered = layoutIndex.verses.flatMap((verse) =>
    verse.words.words.map((word) => ({
      surah: verse.surah,
      ayah: verse.ayah,
      word: word.index,
      box: { x: word.x, y: word.y - word.height, width: word.width, height: word.height },
    })),
  );
  const startsBefore = (a: (typeof ordered)[number], b: typeof from) =>
    a.surah !== b.surah ? a.surah < b.surah : a.ayah !== b.ayah ? a.ayah < b.ayah : a.word < b.word;

  return ordered
    .filter((entry) => !startsBefore(entry, from) && startsBefore(entry, to) === false)
    .map((entry) => entry.box);
}

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

/**
 * Hover: a translucent fill plus a hairline. Selection: a solid 2px outline
 * and, for ranges, a fill joining the boxes. Both avoid animating the
 * Qur'anic text they sit on.
 */
function paint(ctx: CanvasRenderingContext2D, props: OverlayCanvasProps): void {
  const { layoutIndex, hover, selection, frameWidth, frameHeight } = props;
  ctx.clearRect(0, 0, frameWidth, frameHeight);
  if (!layoutIndex) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = readToken(styles, '--accent', '#1c6b4b');
  const accentSoft = readToken(styles, '--accent-soft', 'rgba(28, 107, 75, 0.18)');

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Hover first so a selected word's outline stays on top.
  if (hover.word) {
    const box = wordBox(layoutIndex, hover.word);
    if (box) {
      ctx.fillStyle = accentSoft;
      // A hint of the words underneath must stay readable: hover is feedback,
      // not a highlight of the text itself.
      ctx.globalAlpha = 0.28;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    }
  }

  const start = selection.start ?? selection.current;
  const end = selection.end ?? selection.current;
  if (start && end) {
    const boxes =
      selection.type === 'range' && !sameWordRef(start, end)
        ? boxesInRange(layoutIndex, start, end)
        : (() => {
            const box = wordBox(layoutIndex, start);
            return box ? [box] : [];
          })();

    if (boxes.length > 0) {
      if (boxes.length > 1) {
        ctx.fillStyle = accentSoft;
        ctx.globalAlpha = 0.28;
        for (const box of boxes) ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (const box of boxes) {
        ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2);
      }

      // Drag handles (plan 3.5b): filled dots outside the range ends. Pure
      // overlay feedback — hit-testing happens in the pointer hook.
      const handles = rangeHandlePoints(layoutIndex, selection);
      if (handles) {
        ctx.fillStyle = accent;
        for (const edge of ['from', 'to'] as const) {
          ctx.beginPath();
          ctx.arc(handles[edge].x, handles[edge].y, RANGE_HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accentSoft;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore();
}

export function OverlayCanvas(props: OverlayCanvasProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const { frameWidth, frameHeight } = props;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (overlay.width !== frameWidth) overlay.width = frameWidth;
    if (overlay.height !== frameHeight) overlay.height = frameHeight;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    // Repaint on token changes too (theme toggle): the canvas holds pixels,
    // so it cannot inherit CSS.
    paint(ctx, props);
    const observer = new MutationObserver(() => paint(ctx, props));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
    // `props` is a fresh object each render; depend on its parts instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layoutIndex, props.hover, props.selection, frameWidth, frameHeight]);

  return (
    <canvas
      ref={overlayRef}
      className="stage-overlay-canvas"
      width={frameWidth}
      height={frameHeight}
      aria-hidden="true"
    />
  );
}
