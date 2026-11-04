import { Circle, CircleCheck, Star } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeRow } from "@/hooks/use-swipe-row";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SwipeableRowProps {
  children: React.ReactNode;
  unread: boolean;
  isStarred: boolean;
  canToggleRead: boolean;
  onToggleRead: () => void;
  onSwipeRead?: () => void;
  onToggleStar: () => void;
}

/**
 * Mobile-only swipe-left-to-reveal actions wrapper for article/tweet rows.
 * On desktop this renders children untouched (no gesture handlers, no extra
 * markup effect) since the underlying hooks are disabled via `useIsMobile`.
 */
export function SwipeableRow({
  children,
  unread,
  isStarred,
  canToggleRead,
  onToggleRead,
  onSwipeRead,
  onToggleStar,
}: SwipeableRowProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { translateX, isOpen, isDragging, close, handlers } = useSwipeRow({
    disabled: !isMobile,
  });

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Actions revealed behind the row when swiped left */}
      <div className="absolute inset-y-0 right-0 flex w-24">
        <button
          type="button"
          disabled={!canToggleRead}
          onClick={() => {
            if (unread && onSwipeRead) {
              onSwipeRead();
            } else {
              onToggleRead();
            }
            close();
          }}
          aria-label={
            unread ? t("article.action.markRead") : t("article.action.markUnread")
          }
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-white transition-[filter,transform] active:scale-95 active:brightness-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80",
            unread ? "bg-blue-500" : "bg-muted-foreground",
          )}
        >
          {unread ? (
            <CircleCheck className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleStar();
            close();
          }}
          aria-label={isStarred ? t("article.action.unstar") : t("article.action.star")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-white transition-[filter,transform] active:scale-95 active:brightness-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80",
            isStarred ? "bg-amber-400" : "bg-amber-500",
          )}
        >
          <Star className={cn("h-4 w-4", isStarred && "fill-white")} />
        </button>
      </div>

      {/* Foreground row content, dragged horizontally with the finger */}
      <div
        {...handlers}
        onClick={(e) => {
          // While the actions strip is open, tapping the row should close it
          // instead of opening the article.
          if (isOpen) {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging
            ? "none"
            : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative bg-card"
      >
        {children}
      </div>
    </div>
  );
}
