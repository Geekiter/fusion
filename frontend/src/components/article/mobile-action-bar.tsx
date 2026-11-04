import {
  CheckCheck,
  Languages,
  ListTree,
  ListChecks,
  Loader2,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface MobileActionBarProps {
  translatableCount: number;
  isTranslating: boolean;
  onTranslate: () => void;
  isCategoryOpen: boolean;
  onOpenCategories: () => void;
  isUpdating: boolean;
  onUpdate: () => void;
  unreadCount: number;
  isMarkingAllRead: boolean;
  onMarkAllRead: () => void;
  isSelectionMode: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
  onSelectAllLoaded: () => void;
  onMarkSelectedRead: () => void;
  onStarSelected: () => void;
  selectedUnreadCount: number;
  selectedUnstarredCount: number;
  isHidden: boolean;
}

/**
 * Mobile-only floating action bar. The article scroller reserves enough
 * trailing space for it, so the last row remains reachable.
 */
export function MobileActionBar({
  translatableCount,
  isTranslating,
  onTranslate,
  isCategoryOpen,
  onOpenCategories,
  isUpdating,
  onUpdate,
  unreadCount,
  isMarkingAllRead,
  onMarkAllRead,
  isSelectionMode,
  selectedCount,
  onToggleSelectionMode,
  onSelectAllLoaded,
  onMarkSelectedRead,
  onStarSelected,
  selectedUnreadCount,
  selectedUnstarredCount,
  isHidden,
}: MobileActionBarProps) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("article.mobile.actions")}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-3 transition-[opacity,transform] duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-reduce:transition-none",
        isHidden
          ? "translate-y-[calc(100%+1rem)] opacity-0"
          : "translate-y-0 opacity-100",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto grid w-full overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-1 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/80 dark:ring-white/5",
          isSelectionMode
            ? "max-w-sm grid-cols-4"
            : "max-w-md grid-cols-5",
        )}
      >
        {isSelectionMode ? (
          <>
            <button
              type="button"
              onClick={onSelectAllLoaded}
              className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ListChecks className="h-5 w-5" />
              <span className="max-w-full truncate">
                {t("article.selection.selected", { count: selectedCount })}
              </span>
            </button>
            <button
              type="button"
              onClick={onMarkSelectedRead}
              disabled={selectedUnreadCount === 0}
              className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-muted-foreground"
            >
              <CheckCheck className="h-5 w-5" />
              <span className="max-w-full truncate">
                {t("article.selection.markRead")}
              </span>
            </button>
            <button
              type="button"
              onClick={onStarSelected}
              disabled={selectedUnstarredCount === 0}
              className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-muted-foreground"
            >
              <Star className="h-5 w-5" />
              <span className="max-w-full truncate">
                {t("article.selection.star")}
              </span>
            </button>
            <button
              type="button"
              onClick={onToggleSelectionMode}
              aria-label={t("article.selection.exit")}
              className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-5 w-5" />
              <span>{t("article.selection.exit")}</span>
            </button>
          </>
        ) : (
          <>
        <button
          type="button"
          onClick={onTranslate}
          disabled={translatableCount === 0 || isTranslating}
          aria-busy={isTranslating}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-muted-foreground"
        >
          {isTranslating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Languages className="h-5 w-5" />
          )}
          <span className="max-w-full truncate">
            {isTranslating
              ? t("article.translate.translating")
              : t("article.translate.loaded", { count: translatableCount })}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenCategories}
          aria-haspopup="dialog"
          aria-expanded={isCategoryOpen}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ListTree className="h-5 w-5" />
          <span>{t("article.mobile.categories")}</span>
        </button>

        <button
          type="button"
          onClick={onUpdate}
          disabled={isUpdating}
          aria-busy={isUpdating}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-muted-foreground"
        >
          <RefreshCw
            className={isUpdating ? "h-5 w-5 animate-spin" : "h-5 w-5"}
          />
          <span className="max-w-full truncate">{t("feeds.refreshOne")}</span>
        </button>

        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAllRead}
          aria-busy={isMarkingAllRead}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:text-muted-foreground"
        >
          {isMarkingAllRead ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCheck className="h-5 w-5" />
          )}
          <span className="max-w-full truncate">
            {t("article.list.markAllRead")}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleSelectionMode}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted active:scale-[0.97] active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ListChecks className="h-5 w-5" />
          <span>{t("article.selection.enter")}</span>
        </button>
          </>
        )}
      </div>
    </nav>
  );
}
