import { useCallback, useRef, useState } from "react";

// Distance (px) the user must pull down before releasing triggers a refresh.
const TRIGGER_DISTANCE = 64;
// Visual cap so the pull indicator doesn't drag forever.
const MAX_PULL = 96;
// Pulling feels more natural if it resists the further you drag.
const RESISTANCE = 0.5;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | void;
  /** Disable the gesture entirely (e.g. on desktop). */
  disabled?: boolean;
  /**
   * Returns the current scrollTop of the scrollable container. Pull-to-
   * refresh only engages when this is 0 (i.e. already at the top), so it
   * doesn't fight with normal list scrolling.
   */
  getScrollTop: () => number;
}

/**
 * Native-touch pull-to-refresh gesture. Only engages when the scroll
 * container is already at the top, so it never interferes with vertical
 * scrolling through the rest of the list.
 */
export function usePullToRefresh({
  onRefresh,
  disabled,
  getScrollTop,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;
      if (getScrollTop() > 0) {
        tracking.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    },
    [disabled, getScrollTop, isRefreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing || !tracking.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      // Only take over the gesture once we're sure it's a downward pull at
      // the top of the list, so normal scrolling elsewhere is untouched.
      e.preventDefault();
      setPullDistance(Math.min(MAX_PULL, dy * RESISTANCE));
    },
    [disabled, isRefreshing],
  );

  const onTouchEnd = useCallback(async () => {
    if (disabled || !tracking.current) return;
    tracking.current = false;

    if (pullDistance >= TRIGGER_DISTANCE) {
      setIsRefreshing(true);
      setPullDistance(TRIGGER_DISTANCE);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [disabled, onRefresh, pullDistance]);

  return {
    pullDistance,
    isRefreshing,
    isTriggered: pullDistance >= TRIGGER_DISTANCE,
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
