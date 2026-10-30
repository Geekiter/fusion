import { useCallback, useState } from "react";

const PULL_THRESHOLD = 96;
const MAX_OFFSET = 56;
const RESISTANCE = 0.35;
const REPEAT_WINDOW_MS = 2500;
const DIRECTION_THRESHOLD = 8;

interface UsePullToDismissOptions {
  enabled: boolean;
  onDismiss: () => void;
}

/** Requires two deliberate pulls that each start at the top of the scroller. */
export function usePullToDismiss({ enabled, onDismiss }: UsePullToDismissOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isArmed, setIsArmed] = useState(false);

  const scrollRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport || !enabled) return;

      let gesture: {
        id: number;
        x: number;
        y: number;
        distance: number;
        didVibrate: boolean;
      } | null = null;
      let armedUntil = 0;
      let armTimer: ReturnType<typeof setTimeout> | undefined;
      setPullDistance(0);
      setIsArmed(false);

      const disarm = () => {
        clearTimeout(armTimer);
        armedUntil = 0;
        setIsArmed(false);
      };
      const resetPull = () => {
        gesture = null;
        setPullDistance(0);
      };
      const cancel = () => {
        resetPull();
        disarm();
      };
      const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1 || viewport.scrollTop > 1) {
          cancel();
          return;
        }
        if (Date.now() > armedUntil) disarm();
        const touch = event.touches[0];
        gesture = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          distance: 0,
          didVibrate: false,
        };
      };
      const onTouchMove = (event: TouchEvent) => {
        if (!gesture) return;
        if (event.touches.length !== 1 || viewport.scrollTop > 1) {
          cancel();
          return;
        }
        const touch = event.touches[0];
        if (touch.identifier !== gesture.id) {
          cancel();
          return;
        }
        const dx = touch.clientX - gesture.x;
        const dy = touch.clientY - gesture.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_THRESHOLD) {
          gesture.distance = 0;
          setPullDistance(0);
          return;
        }
        if (dy <= 0 || Math.abs(dx) > dy) {
          cancel();
          return;
        }
        if (event.cancelable) event.preventDefault();
        gesture.distance = dy;
        if (dy >= PULL_THRESHOLD && !gesture.didVibrate) {
          gesture.didVibrate = true;
          try {
            navigator.vibrate?.(12);
          } catch {
            // Haptic feedback is optional when the browser or device blocks it.
          }
        }
        setPullDistance(Math.min(MAX_OFFSET, dy * RESISTANCE));
      };
      const onTouchEnd = (event: TouchEvent) => {
        if (!gesture) return;
        if (event.touches.length !== 0) {
          cancel();
          return;
        }
        const distance = gesture.distance;
        if (distance >= DIRECTION_THRESHOLD && event.cancelable) {
          event.preventDefault();
        }
        resetPull();
        if (distance < PULL_THRESHOLD) return;
        if (Date.now() <= armedUntil) {
          disarm();
          onDismiss();
          return;
        }
        armedUntil = Date.now() + REPEAT_WINDOW_MS;
        setIsArmed(true);
        clearTimeout(armTimer);
        armTimer = setTimeout(disarm, REPEAT_WINDOW_MS);
      };
      const onScroll = () => {
        if (viewport.scrollTop > 1) cancel();
      };

      // React touch listeners are passive; a native listener lets the drawer
      // absorb overscroll without triggering the browser's pull-to-refresh.
      viewport.addEventListener("touchstart", onTouchStart, { passive: true });
      viewport.addEventListener("touchmove", onTouchMove, { passive: false });
      viewport.addEventListener("touchend", onTouchEnd, { passive: false });
      viewport.addEventListener("touchcancel", cancel, { passive: true });
      viewport.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        clearTimeout(armTimer);
        viewport.removeEventListener("touchstart", onTouchStart);
        viewport.removeEventListener("touchmove", onTouchMove);
        viewport.removeEventListener("touchend", onTouchEnd);
        viewport.removeEventListener("touchcancel", cancel);
        viewport.removeEventListener("scroll", onScroll);
      };
    },
    [enabled, onDismiss],
  );

  return { scrollRef, pullDistance, isArmed };
}
