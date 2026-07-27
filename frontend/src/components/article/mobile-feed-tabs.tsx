import { Layers } from "lucide-react";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useFeedLookup } from "@/queries/feeds";
import { useUrlState } from "@/hooks/use-url-state";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Mobile-only horizontal, swipeable feed switcher shown below the header.
 * Lets a thumb scroll sideways between "All" and individual feeds instead
 * of opening the sidebar sheet for every switch. Desktop keeps using the
 * sidebar exclusively; this component is only mounted when `useIsMobile()`
 * is true (see ArticleList).
 */
export function MobileFeedTabs() {
  const { t } = useI18n();
  const { feeds } = useFeedLookup();
  const { selectedFeedId, selectedGroupId, setSelectedFeed } = useUrlState();

  if (feeds.length === 0) return null;

  return (
    <div
      className="flex w-full min-w-0 gap-1.5 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={t("article.mobile.feedSwitcher")}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selectedFeedId === null && selectedGroupId === null}
        onClick={() => setSelectedFeed(null)}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
          selectedFeedId === null && selectedGroupId === null
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        <Layers className="h-3.5 w-3.5" />
        {t("article.list.all")}
      </button>

      {feeds.map((feed) => (
        <button
          key={feed.id}
          type="button"
          role="tab"
          aria-selected={selectedFeedId === feed.id}
          onClick={() => setSelectedFeed(feed.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            selectedFeedId === feed.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <FeedFavicon
            src={getFaviconUrl(feed.link, feed.site_url)}
            className="h-3.5 w-3.5 rounded-sm"
          />
          <span className="max-w-28 truncate">{feed.name}</span>
          {feed.unread_count > 0 && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 text-[10px] leading-4",
                selectedFeedId === feed.id
                  ? "bg-primary-foreground/20"
                  : "bg-background",
              )}
            >
              {feed.unread_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
