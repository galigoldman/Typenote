import { useEffect, useRef } from 'react';

export interface UseSwipeDrawerOptions {
  edgeWidth?: number;
  threshold?: number;
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  enabled?: boolean;
}

export function useSwipeDrawer(
  ref: React.RefObject<HTMLElement | null>,
  options: UseSwipeDrawerOptions,
): void {
  const {
    edgeWidth = 20,
    threshold = 50,
    onOpen,
    onClose,
    isOpen,
    enabled = true,
  } = options;

  const callbacksRef = useRef({ onOpen, onClose, isOpen });

  useEffect(() => {
    callbacksRef.current = { onOpen, onClose, isOpen };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let isEdgeSwipe = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isEdgeSwipe = touch.clientX <= edgeWidth;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

      if (isEdgeSwipe && deltaX > threshold && !callbacksRef.current.isOpen) {
        callbacksRef.current.onOpen();
        isEdgeSwipe = false;
      } else if (callbacksRef.current.isOpen && deltaX < -threshold) {
        callbacksRef.current.onClose();
      }
    };

    const handleTouchEnd = () => {
      startX = 0;
      startY = 0;
      isEdgeSwipe = false;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, enabled, edgeWidth, threshold]);
}
