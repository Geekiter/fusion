import {
  CheckCheck,
  Languages,
  ListTree,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface MobileActionBarProps {
  translatableCount: number;
  isTranslating: boolean;
  onTranslate: () => void;
  isCategoryOpen: boolean;
  onOpenCategories: () => void;
  isUpdating: boolean;
  onUpdate: () => void;
  unreadCount: number;
  onMarkAllRead: () => void;
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
  onMarkAllRead,
}: MobileActionBarProps) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("article.mobile.actions")}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-3"
    >
      <div
        className="pointer-events-auto grid w-full max-w-xs grid-cols-4 overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-1 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/80 dark:ring-white/5"
      >
        <button
          type="button"
          onClick={onTranslate}
          disabled={translatableCount === 0 || isTranslating}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted disabled:text-muted-foreground"
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
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted"
        >
          <ListTree className="h-5 w-5" />
          <span>{t("article.mobile.categories")}</span>
        </button>

        <button
          type="button"
          onClick={onUpdate}
          disabled={isUpdating}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted disabled:text-muted-foreground"
        >
          <RefreshCw
            className={isUpdating ? "h-5 w-5 animate-spin" : "h-5 w-5"}
          />
          <span className="max-w-full truncate">{t("feeds.refreshOne")}</span>
        </button>

        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted disabled:text-muted-foreground"
        >
          <CheckCheck className="h-5 w-5" />
          <span className="max-w-full truncate">
            {t("article.list.markAllRead")}
          </span>
        </button>
      </div>
    </nav>
  );
}
