import { Folder, Inbox, Layers, Star } from "lucide-react";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUrlState, type ArticleFilter } from "@/hooks/use-url-state";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useBookmarkLookup } from "@/queries/bookmarks";
import { useFeedLookup, useUnreadCounts } from "@/queries/feeds";
import { useGroups } from "@/queries/groups";

interface MobileCategoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileCategoryDrawer({
  open,
  onOpenChange,
}: MobileCategoryDrawerProps) {
  const { t } = useI18n();
  const { data: groups = [], isLoading: groupsLoading } = useGroups();
  const {
    feeds,
    getFeedsByGroup,
    isLoading: feedsLoading,
  } = useFeedLookup();
  const {
    getUnreadCount,
    getGroupUnreadCount,
    getTotalUnreadCount,
  } = useUnreadCounts();
  const { total: starredTotal } = useBookmarkLookup();
  const {
    selectedFeedId,
    selectedGroupId,
    articleFilter,
    selectTopLevelFilter,
    setSelectedFeed,
    setSelectedGroup,
  } = useUrlState();

  const topFilters: Array<{
    value: ArticleFilter;
    label: string;
    count: number;
    icon: typeof Inbox;
  }> = [
    {
      value: "unread",
      label: t("article.filter.unread"),
      count: getTotalUnreadCount(),
      icon: Inbox,
    },
    {
      value: "starred",
      label: t("article.filter.starred"),
      count: starredTotal,
      icon: Star,
    },
    {
      value: "all",
      label: t("article.filter.all"),
      count: getTotalUnreadCount(),
      icon: Layers,
    },
  ];
  const isTopLevelSelected =
    selectedFeedId === null && selectedGroupId === null;
  const ungroupedFeeds = feeds.filter((feed) => feed.group_id === 0);

  const selectFilter = (filter: ArticleFilter) => {
    selectTopLevelFilter(filter);
    onOpenChange(false);
  };

  const selectGroup = (groupId: number) => {
    setSelectedGroup(groupId);
    onOpenChange(false);
  };

  const selectFeed = (feedId: number) => {
    setSelectedFeed(feedId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="shrink-0 border-b px-4 py-3 pr-14">
          <div
            aria-hidden="true"
            className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25"
          />
          <SheetTitle>{t("article.mobile.categories")}</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-4">
          <div className="space-y-1">
            {topFilters.map(({ value, label, count, icon: Icon }) => {
              const isSelected =
                isTopLevelSelected && articleFilter === value;

              return (
                <button
                  key={value}
                  type="button"
                  aria-current={isSelected ? "page" : undefined}
                  onClick={() => selectFilter(value)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 active:bg-accent",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="my-2 border-t" />
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            {t("search.group.feeds")}
          </div>

          {groupsLoading && feedsLoading ? (
            <div className="space-y-1 px-1">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-11 animate-pulse rounded-xl bg-accent"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {groups.map((group) => {
                const groupFeeds = getFeedsByGroup(group.id);
                const isGroupSelected = selectedGroupId === group.id;

                return (
                  <div key={group.id}>
                    <button
                      type="button"
                      aria-current={isGroupSelected ? "page" : undefined}
                      onClick={() => selectGroup(group.id)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                        isGroupSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 active:bg-accent",
                      )}
                    >
                      <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {group.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {getGroupUnreadCount(group.id)}
                      </span>
                    </button>

                    {groupFeeds.map((feed) => {
                      const isFeedSelected = selectedFeedId === feed.id;

                      return (
                        <button
                          key={feed.id}
                          type="button"
                          aria-current={isFeedSelected ? "page" : undefined}
                          onClick={() => selectFeed(feed.id)}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pr-3 pl-9 text-left text-sm transition-colors",
                            isFeedSelected
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50 active:bg-accent",
                          )}
                        >
                          <FeedFavicon
                            src={getFaviconUrl(feed.link, feed.site_url)}
                            className="h-5 w-5"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {feed.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {getUnreadCount(feed.id)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {ungroupedFeeds.map((feed) => {
                const isSelected = selectedFeedId === feed.id;

                return (
                  <button
                    key={feed.id}
                    type="button"
                    aria-current={isSelected ? "page" : undefined}
                    onClick={() => selectFeed(feed.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50 active:bg-accent",
                    )}
                  >
                    <FeedFavicon
                      src={getFaviconUrl(feed.link, feed.site_url)}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {feed.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {getUnreadCount(feed.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
