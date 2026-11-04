import { useCallback, useEffect, useRef } from "react";
import { Folder, Inbox, Layers, Star } from "lucide-react";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePullToDismiss } from "@/hooks/use-pull-to-dismiss";
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
  const selectedCategoryRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { scrollRef, pullDistance, isArmed } = usePullToDismiss({
    enabled: open,
    onDismiss: dismiss,
  });
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

  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => {
      selectedCategoryRef.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    open,
    groupsLoading,
    feedsLoading,
    selectedFeedId,
    selectedGroupId,
    articleFilter,
  ]);

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
        initialFocus={selectedCategoryRef}
        style={
          pullDistance > 0
            ? {
                transform: `translateY(${pullDistance}px)`,
                transitionDuration: "0ms",
              }
            : undefined
        }
        className="max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="shrink-0 border-b px-4 py-3 pr-14">
          <div
            aria-hidden="true"
            className={cn(
              "mx-auto mb-1 h-1 rounded-full transition-all",
              isArmed
                ? "w-14 bg-muted-foreground/70"
                : "w-10 bg-muted-foreground/25",
            )}
          />
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t("article.mobile.categories")}</SheetTitle>
            <span role="status" className="text-xs text-muted-foreground">
              {isArmed ? t("article.mobile.pullAgainToClose") : null}
            </span>
          </div>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-4"
        >
          <div className="space-y-1">
            {topFilters.map(({ value, label, count, icon: Icon }) => {
              const isSelected =
                isTopLevelSelected && articleFilter === value;

              return (
                <button
                  key={value}
                  ref={isSelected ? selectedCategoryRef : undefined}
                  type="button"
                  aria-current={isSelected ? "page" : undefined}
                  onClick={() => selectFilter(value)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]",
                    isSelected
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "hover:bg-accent/50 active:bg-accent",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground",
                      isSelected && "text-primary",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums text-muted-foreground",
                      isSelected && "font-semibold text-foreground",
                    )}
                  >
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
                      ref={isGroupSelected ? selectedCategoryRef : undefined}
                      aria-current={isGroupSelected ? "page" : undefined}
                      onClick={() => selectGroup(group.id)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]",
                        isGroupSelected
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "hover:bg-accent/50 active:bg-accent",
                      )}
                    >
                      <Folder
                        className={cn(
                          "h-5 w-5 shrink-0 text-muted-foreground",
                          isGroupSelected && "text-primary",
                        )}
                      />
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
                          ref={isFeedSelected ? selectedCategoryRef : undefined}
                          type="button"
                          aria-current={isFeedSelected ? "page" : undefined}
                          onClick={() => selectFeed(feed.id)}
                          className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl py-2 pr-3 pl-9 text-left text-sm transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]",
                            isFeedSelected
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "hover:bg-accent/50 active:bg-accent",
                          )}
                        >
                          <FeedFavicon
                            src={getFaviconUrl(feed.link, feed.site_url)}
                            className={cn(
                              "h-5 w-5",
                              isFeedSelected && "ring-1 ring-primary/40",
                            )}
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
                    ref={isSelected ? selectedCategoryRef : undefined}
                    type="button"
                    aria-current={isSelected ? "page" : undefined}
                    onClick={() => selectFeed(feed.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]",
                      isSelected
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "hover:bg-accent/50 active:bg-accent",
                    )}
                  >
                    <FeedFavicon
                      src={getFaviconUrl(feed.link, feed.site_url)}
                      className={cn(
                        "h-5 w-5",
                        isSelected && "ring-1 ring-primary/40",
                      )}
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
