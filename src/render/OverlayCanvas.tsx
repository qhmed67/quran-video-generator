/**
 * Overlay canvas for hover and selection feedback (plan phase 4.2).
 *
 * Draws hover highlights and selection indicators on a separate canvas.
 * Must never be baked into exports.
 */

import { useEffect, useRef, useMemo } from 'react';
import type { HoverState, SelectionState } from './usePreviewPointer';

interface OverlayCanvasProps {
  canvas: HTMLCanvasElement | null;
  hover: HoverState;
  selection: SelectionState;
  width: number;
  height: number;
  deviceScale: number;
}

export function OverlayCanvas({
  canvas,
  hover,
  selection,
  width,
  height,
  deviceScale,
}: OverlayCanvasProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Create overlay canvas that matches the main canvas
  useEffect(() => {
    if (!canvas || !overlayRef.current) return;

    const overlay = overlayRef.current;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Set overlay canvas size to match main canvas
    overlay.width = canvas.width;
    overlay.height = canvas.height;

    // Clear overlay
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }, [canvas]);

  // Draw hover and selection feedback
  const drawFeedback = useMemo(() => {
    if (!canvas || !overlayRef.current) return;

    const overlay = overlayRef.current;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Clear overlay
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Apply device scale for high DPI displays
    ctx.save();
    ctx.scale(deviceScale, deviceScale);

    // Draw hover highlight
    if (hover.word && hover.position) {
      drawHoverHighlight(ctx, hover.word, width, height);
    }

    // Draw selection indicator
    if (selection.current) {
      drawSelectionIndicator(ctx, selection, width, height);
    }

    ctx.restore();
  }, [canvas, hover, selection, width, height, deviceScale]);

  // Trigger redraw when hover or selection changes
  useEffect(() => {
    // The drawFeedback is called automatically when dependencies change
  }, [drawFeedback]);

  return (
    <canvas
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none', // Allow events to pass through to the main canvas
        zIndex: 10,
      }}
    />
  );
}

// Helper functions for drawing
function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  _word: { surah: number; ayah: number; word: number },
  width: number,
  height: number,
) {
  // For now, just draw a simple highlight around the word
  // In a real implementation, we'd need to get the word position from the layout index

  ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);

  // This is a placeholder - in a real implementation, we'd get the actual word bounds
  // For now, draw a rectangle in the center of the screen
  const centerX = width / 2;
  const centerY = height / 2;
  const wordWidth = 100;
  const wordHeight = 40;

  ctx.strokeRect(centerX - wordWidth / 2, centerY - wordHeight / 2, wordWidth, wordHeight);

  ctx.setLineDash([]);
}

function drawSelectionIndicator(
  ctx: CanvasRenderingContext2D,
  selection: SelectionState,
  width: number,
  height: number,
) {
  // Draw selection indicator based on selection type
  if (selection.current) {
    ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
    ctx.lineWidth = 2;

    if (selection.type === 'word') {
      // Draw a solid rectangle around the selected word
      const centerX = width / 2;
      const centerY = height / 2;
      const wordWidth = 100;
      const wordHeight = 40;

      ctx.strokeRect(centerX - wordWidth / 2, centerY - wordHeight / 2, wordWidth, wordHeight);

      // Draw corner handles
      const handleSize = 8;
      const handleOffset = 4;

      // Top-left
      ctx.fillStyle = 'rgba(59, 130, 246, 1)';
      ctx.fillRect(
        centerX - wordWidth / 2 - handleOffset,
        centerY - wordHeight / 2 - handleOffset,
        handleSize,
        handleSize,
      );

      // Top-right
      ctx.fillRect(
        centerX + wordWidth / 2 - handleSize + handleOffset,
        centerY - wordHeight / 2 - handleOffset,
        handleSize,
        handleSize,
      );

      // Bottom-left
      ctx.fillRect(
        centerX - wordWidth / 2 - handleOffset,
        centerY + wordHeight / 2 - handleSize + handleOffset,
        handleSize,
        handleSize,
      );

      // Bottom-right
      ctx.fillRect(
        centerX + wordWidth / 2 - handleSize + handleOffset,
        centerY + wordHeight / 2 - handleSize + handleOffset,
        handleSize,
        handleSize,
      );
    } else if (selection.type === 'range') {
      // Draw a dashed rectangle around the range
      if (selection.start && selection.end) {
        const centerX = width / 2;
        const centerY = height / 2;
        const rangeWidth = 200;
        const rangeHeight = 60;

        ctx.setLineDash([8, 4]);
        ctx.strokeRect(
          centerX - rangeWidth / 2,
          centerY - rangeHeight / 2,
          rangeWidth,
          rangeHeight,
        );
        ctx.setLineDash([]);
      }
    }
  }
}
