/**
 * Preview pointer hook for interaction (plan phase 4.2).
 *
 * Handles mouse/touch interaction for word selection and hover.
 * Manages hover state and selection model.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WordRef } from '@qvg/core';
import type { LayoutIndex } from './layoutIndex';

export interface HoverState {
  word: WordRef | null;
  position: { x: number; y: number } | null;
}

export interface SelectionState {
  type: 'word' | 'range' | 'ayah';
  start: WordRef | null;
  end: WordRef | null;
  current: WordRef | null;
}

export interface PreviewPointerOptions {
  layoutIndex: LayoutIndex | null;
  onHover?: (hover: HoverState) => void;
  onSelect?: (selection: SelectionState) => void;
  onLongPress?: (position: { x: number; y: number }) => void;
}

export function usePreviewPointer(
  canvas: HTMLCanvasElement | null,
  options: PreviewPointerOptions
) {
  const { layoutIndex, onHover, onSelect, onLongPress } = options;
  
  const [hover, setHover] = useState<HoverState>({ word: null, position: null });
  const [selection, setSelection] = useState<SelectionState>({
    type: 'word',
    start: null,
    end: null,
    current: null,
  });
  
  const isLongPressRef = useRef(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef(0);
  
  // Hit-test function using the layout index
  const hitTest = useCallback((x: number, y: number): WordRef | null => {
    if (!layoutIndex || !canvas) return null;
    
    // Convert client coordinates to canvas coordinates
    const rect = canvas.getBoundingClientRect();
    if (!rect) return null;
    
    const canvasX = (x - rect.left) * (canvas.width / rect.width);
    const canvasY = (y - rect.top) * (canvas.height / rect.height);
    
    // Import hitTest function from layoutIndex
    const { hitTest: hitTestFunction } = require('./layoutIndex');
    return hitTestFunction(layoutIndex, { x: canvasX, y: canvasY });
  }, [layoutIndex, canvas]);
  
  // Handle pointer move (mouse hover)
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!canvas) return;
    
    const point = getPointerPosition(e, canvas);
    if (!point) return;
    
    const word = hitTest(point.x, point.y);
    
    const newHover: HoverState = {
      word,
      position: point,
    };
    
    setHover(newHover);
    onHover?.(newHover);
  }, [canvas, hitTest, onHover]);
  
  // Handle pointer down (mouse/touch start)
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent) => {
    if (!canvas) return;
    
    const point = getPointerPosition(e, canvas);
    if (!point) return;
    
    const word = hitTest(point.x, point.y);
    
    // Handle long press for touch
    if (isTouchEvent(e)) {
      isLongPressRef.current = false;
      
      // Clear any existing timeout
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
      
      // Set long press timeout (500ms)
      longPressTimeoutRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress?.(point);
      }, 500);
    }
    
    // For now, just select on click/tap
    if (word) {
      const newSelection: SelectionState = {
        type: 'word',
        start: word,
        end: word,
        current: word,
      };
      
      setSelection(newSelection);
      onSelect?.(newSelection);
    }
  }, [canvas, hitTest, onLongPress, onSelect]);
  
  // Handle pointer up (mouse/touch end)
  const handlePointerUp = useCallback((e: MouseEvent | TouchEvent) => {
    if (!canvas) return;
    
    const point = getPointerPosition(e, canvas);
    if (!point) return;
    
    // Clear long press timeout
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    
    // Handle double tap for range selection
    if (isTouchEvent(e)) {
      const now = Date.now();
      const lastTap = lastTapPositionRef.current;
      const lastTapTime = lastTapTimeRef.current;
      
      if (lastTap && lastTapTime && now - lastTapTime < 300) {
        // Double tap detected
        const currentWord = hitTest(point.x, point.y);
        if (currentWord && lastTap) {
          const lastWord = hitTest(lastTap.x, lastTap.y);
          
          if (lastWord) {
            const newSelection: SelectionState = {
              type: 'range',
              start: lastWord,
              end: currentWord,
              current: currentWord,
            };
            
            setSelection(newSelection);
            onSelect?.(newSelection);
          }
        }
      }
      
      lastTapPositionRef.current = point;
      lastTapTimeRef.current = now;
    }
  }, [canvas, hitTest, onSelect]);
  
  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setHover({ word: null, position: null });
    onHover?.({ word: null, position: null });
  }, [onHover]);
  
  // Setup event listeners
  useEffect(() => {
    if (!canvas) return;
    
    // Mouse events
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    
    // Touch events
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp);
    canvas.addEventListener('touchcancel', handlePointerLeave);
    
    return () => {
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('mousedown', handlePointerDown);
      canvas.removeEventListener('mouseup', handlePointerUp);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      
      canvas.removeEventListener('touchmove', handlePointerMove);
      canvas.removeEventListener('touchstart', handlePointerDown);
      canvas.removeEventListener('touchend', handlePointerUp);
      canvas.removeEventListener('touchcancel', handlePointerLeave);
      
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, [canvas, handlePointerMove, handlePointerDown, handlePointerUp, handlePointerLeave]);
  
  return {
    hover,
    selection,
    clearSelection: () => {
      setSelection({
        type: 'word',
        start: null,
        end: null,
        current: null,
      });
      onSelect?.({
        type: 'word',
        start: null,
        end: null,
        current: null,
      });
    },
  };
}

// Helper functions
function getPointerPosition(e: MouseEvent | TouchEvent, _canvas: HTMLCanvasElement): { x: number; y: number } | null {
  if (e instanceof MouseEvent) {
    return {
      x: e.clientX,
      y: e.clientY,
    };
  } else if (e.touches && e.touches.length > 0) {
    return {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }
  
  return null;
}

function isTouchEvent(e: Event): e is TouchEvent {
  return 'touches' in e;
}