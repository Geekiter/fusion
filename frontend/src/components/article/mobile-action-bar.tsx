import { CheckCheck, Languages, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface MobileActionBarProps {
  translatableCount: number;
  isTranslating: boolean;
  onTranslate: () => void;
  unreadCount: number;
  onMarkAllRead: () => void;
}

/**
 * Mobile-only bottom action bar. Replaces the header's "Translate" and
 * "Mark all as read" buttons with large thumb-reachable targets fixed to
 * the bottom of the screen, since those small header buttons are hard to
 * hit reliably on a touch screen. Desktop keeps using the header buttons
 * (this component is only mounted when isMobile is true).
 */
export function MobileActionBar({
  translatableCount,
  isTranslating,
  onTranslate,
  unreadCount,
  onMarkAllRead,
}: MobileActionBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <button
        type="button"
        onClick={onTranslate}
        disabled={translatableCount === 0 || isTranslating}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-foreground disabled:text-muted-foreground",
        )}
      >
        {isTranslating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Languages className="h-5 w-5" />
        )}
        {isTranslating
          ? t("article.translate.translating")
          : t("article.translate.loaded", { count: translatableCount })}
      </button>
      <div className="w-px bg-border" />
      <button
        type="button"
        onClick={onMarkAllRead}
        disabled={unreadCount === 0}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-foreground disabled:text-muted-foreground"
      >
        <CheckCheck className="h-5 w-5" />
        {t("article.list.markAllRead")}
      </button>
    </div>
  );
}
