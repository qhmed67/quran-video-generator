/**
 * DOM subscription for the preview pointer hook.
 *
 * Kept in its own file so `usePreviewPointer` reads as the interaction state
 * machine. Handlers are read through a ref, so the listeners bind once per
 * canvas even though the handlers are fresh closures.
 */

import { useEffect, useRef } from 'react';

export interface PreviewListeners {
  move: (e: MouseEvent | TouchEvent) => void;
  down: (e: MouseEvent | TouchEvent) => void;
  up: (e: MouseEvent | TouchEvent) => void;
  leave: () => void;
  keyDown: (e: KeyboardEvent) => void;
}

export function usePreviewListeners(
  canvas: HTMLCanvasElement | null,
  listeners: PreviewListeners,
  onCleanup: () => void,
) {
  const currentRef = useRef({ listeners, onCleanup });
  currentRef.current = { listeners, onCleanup };

  useEffect(() => {
    if (!canvas) return;
    const { move, down, up, leave, keyDown } = currentRef.current.listeners;

    // Make the canvas focusable so it can receive key events. The canvas is
    // a plain DOM node owned by the consumer, not React-owned state, so an
    // effect-time attribute fixup is the correct place for this.
    // eslint-disable-next-line react/immutability -- DOM node, not React state
    canvas.tabIndex = 0;

    // Mouse events
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', leave);

    // Touch events
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchend', up);
    canvas.addEventListener('touchcancel', leave);

    // Keyboard navigation
    canvas.addEventListener('keydown', keyDown);

    return () => {
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', leave);

      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchend', up);
      canvas.removeEventListener('touchcancel', leave);

      canvas.removeEventListener('keydown', keyDown);

      currentRef.current.onCleanup();
    };
  }, [canvas]);
}
