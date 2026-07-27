import { useRef, useState, useCallback } from "react";

// How far (px) the row must be dragged before the swipe actions are
// considered "open". Anything less snaps back to closed on release.
const OPEN_THRESHOLD = 56;
// Maximum drag distance, so the row can't be swiped further than the
// actions strip actually needs.
const MAX_DRAG = 96;
// If the finger moves more vertically than horizontally before crossing
// this many px, treat the gesture as a scroll instead of a swipe.
const DIRECTION_LOCK_PX = 8;

interface UseSwipeRowOptions {
  /** Disable the gesture entirely (e.g. on desktop). */
  disabled?: boolean;
}

/**
 * Lightweight touch-only swipe-to-reveal-actions gesture for a list row.
 * Left swipe reveals a fixed-width actions strip on the right edge; a full
 * swipe past OPEN_THRESHOLD leaves it open, otherwise it snaps closed.
 *
 * Implemented with native touch events (no gesture library dependency) and
 * is a no-op unless attached, so it never affects desktop mouse/pointer
 * interactions.
 */
export function useSwipeRow({ disabled }: UseSwipeRowOptions = {}) {
  const [translateX, setTranslateX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTranslate = useRef(0);
  const direction = useRef<"horizontal" | "vertical" | null>(null);

  const close = useCallback(() => {
    setTranslateX(0);
    setIsOpen(false);
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      startTranslate.current = translateX;
      direction.current = null;
      setIsDragging(true);
    },
    [disabled, translateX],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (direction.current === null) {
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
          return;
        }
        direction.current =
          Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }

      if (direction.current === "vertical") return;

      // Prevent the page from scrolling while swiping horizontally.
      e.preventDefault();

      const next = Math.min(
        0,
        Math.max(-MAX_DRAG, startTranslate.current + dx),
      );
      setTranslateX(next);
    },
    [disabled],
  );

  const onTouchEnd = useCallback(() => {
    if (disabled) return;
    setIsDragging(false);
    if (direction.current !== "horizontal") return;

    if (translateX <= -OPEN_THRESHOLD) {
      setTranslateX(-MAX_DRAG);
      setIsOpen(true);
    } else {
      close();
    }
  }, [close, disabled, translateX]);

  return {
    translateX,
    isOpen,
    isDragging,
    close,
    handlers: disabled
      ? {}
      : {
          onTouchStart,
          onTouchMove,
          onTouchEnd,
          onTouchCancel: onTouchEnd,
        },
  };
}
