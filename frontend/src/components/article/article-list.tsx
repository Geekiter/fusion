import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  CheckCheck,
  Languages,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleItem } from "./article-item";
import { MovieCard } from "./movie-card";
import { TwitterCard } from "./twitter-card";
import { SwipeableRow } from "./swipeable-row";
import { MobileActionBar } from "./mobile-action-bar";
import { MobileCategoryDrawer } from "./mobile-category-drawer";
import { isDoubanMovieFeed } from "@/lib/douban";
import { isTwitterFeed } from "@/lib/twitter";
import { ContentHeader } from "@/components/layout/content-header";
import { SidebarTrigger } from "@/components/layout/sidebar-trigger";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { useUrlState, type ArticleFilter } from "@/hooks/use-url-state";
import { useArticleList } from "@/hooks/use-article-list";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  useMarkAllItemsRead,
  useMarkItemsRead,
  useMarkItemsUnread,
  useTranslateItemPreviews,
} from "@/queries/items";
import {
  useFeedLookup,
  useRefreshFeed,
  useRefreshFeeds,
  useUnreadCounts,
} from "@/queries/feeds";
import { useGroups } from "@/queries/groups";
import { useCreateBookmark, useDeleteBookmark } from "@/queries/bookmarks";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useI18n } from "@/lib/i18n";
import type { Item } from "@/lib/api";
import { cn, extractSummary, needsTranslation } from "@/lib/utils";

export function ArticleList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    articleFilter,
    setArticleFilter,
    selectedFeedId,
    selectedGroupId,
    selectedArticleId,
    setSelectedArticle,
  } = useUrlState();

  const {
    articles,
    hasMore,
    isLoading,
    isLoadingMore,
    fetchNextPage,
    isItemStarred,
    getBookmarkByItemId,
  } = useArticleList({
    feedId: selectedFeedId,
    groupId: selectedGroupId,
    articleFilter,
  });

  const { data: groups = [] } = useGroups();
  const { feeds, getFeedById, isLoading: isFeedsLoading } = useFeedLookup();
  const markItemsRead = useMarkItemsRead();
  const markAllItemsRead = useMarkAllItemsRead();
  const markItemsUnread = useMarkItemsUnread();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const translatePreviews = useTranslateItemPreviews();
  const refreshFeed = useRefreshFeed();
  const refreshFeeds = useRefreshFeeds();
  const isMobile = useIsMobile();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [isCategoryOpen, setCategoryOpen] = useState(false);

  const articleIds = articles.map((a) => a.id);
  useArticleNavigation(articleIds, {
    enabled: selectedArticleId === null,
  });

  let title = t("article.list.all");
  const selectedFeed = selectedFeedId
    ? getFeedById(selectedFeedId)
    : undefined;
  if (selectedFeedId) {
    title = selectedFeed?.name ?? t("article.feedFallback");
  } else if (selectedGroupId) {
    const group = groups.find((g) => g.id === selectedGroupId);
    title = group?.name ?? t("article.groupFallback");
  }

  // Movie feeds keep their own dedicated grid layout: only activated when the
  // user has drilled into a single Douban movie feed, since a movie grid
  // can't sensibly interleave with the list-style article/tweet rows.
  const isMovieView =
    !!selectedFeed &&
    isDoubanMovieFeed(selectedFeed.name, selectedFeed.site_url);

  // Everywhere else (including cross-feed views like the unread list), the
  // card type is decided per item based on the item's own feed, so plain
  // articles and tweets can be mixed together in a single list.
  const getArticleKind = useCallback(
    (article: Item): "twitter" | "article" => {
      const feed = getFeedById(article.feed_id);
      if (isTwitterFeed(feed?.name, feed?.site_url)) return "twitter";
      return "article";
    },
    [getFeedById],
  );

  const { getGroupUnreadCount, getTotalUnreadCount } = useUnreadCounts();
  const unreadCount = selectedFeedId
    ? (selectedFeed?.unread_count ?? 0)
    : selectedGroupId
      ? getGroupUnreadCount(selectedGroupId)
      : getTotalUnreadCount();
  const hasNoFeeds = !isFeedsLoading && feeds.length === 0;
  const translatableItems = articles.filter((article) => {
    if (article.id <= 0) return false;
    const summary = extractSummary(article.content, 150);
    return (
      (!article.translated_title && needsTranslation(article.title)) ||
      (!article.translated_summary && needsTranslation(summary))
    );
  });

  const handleToggleRead = useCallback(
    async (article: Item) => {
      if (article.id <= 0) return;

      try {
        if (article.unread) {
          await markItemsRead.mutateAsync([article.id]);
        } else {
          await markItemsUnread.mutateAsync([article.id]);
        }
      } catch (error) {
        console.error("Failed to toggle read status:", error);
      }
    },
    [markItemsRead, markItemsUnread],
  );

  const handleToggleStar = useCallback(
    async (article: Item) => {
      try {
        if (isItemStarred(article.id)) {
          const bookmark = getBookmarkByItemId(article.id);
          if (bookmark) {
            await deleteBookmark.mutateAsync(bookmark.id);
          }
          return;
        }

        await createBookmark.mutateAsync(article);
      } catch (error) {
        console.error("Failed to toggle star:", error);
      }
    },
    [createBookmark, deleteBookmark, getBookmarkByItemId, isItemStarred],
  );

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    try {
      await markAllItemsRead.mutateAsync(
        selectedFeedId
          ? { feed_id: selectedFeedId }
          : selectedGroupId
            ? { group_id: selectedGroupId }
            : {},
      );
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleTranslateLoaded = async () => {
    if (translatableItems.length === 0) return;
    try {
      const result = await translatePreviews.mutateAsync(translatableItems);
      if (result.failed > 0) {
        toast.warning(
          t("article.translate.partial", {
            translated: result.translated,
            failed: result.failed,
          }),
        );
      } else {
        toast.success(
          t("article.translate.listSuccess", { count: result.translated }),
        );
      }
    } catch (error) {
      console.error("Failed to translate loaded articles:", error);
      toast.error(t("article.translate.failed"));
    }
  };

  const handleRefreshFeed = async () => {
    if (!selectedFeed) return;
    try {
      await refreshFeed.mutateAsync(selectedFeed.id);
      toast.success(
        t("feeds.toast.refreshingOne", { name: selectedFeed.name }),
      );
    } catch {
      toast.error(
        t("feeds.toast.refreshOneFailed", { name: selectedFeed.name }),
      );
    }
  };

  // Mobile pull-to-refresh: refreshes the currently selected feed if any,
  // otherwise refreshes every feed. Desktop keeps the explicit "Update"
  // button in the header instead.
  const handlePullRefresh = useCallback(async () => {
    try {
      if (selectedFeed) {
        await refreshFeed.mutateAsync(selectedFeed.id);
      } else {
        await refreshFeeds.mutateAsync();
      }
    } catch {
      toast.error(t("article.mobile.refreshFailed"));
    }
  }, [refreshFeed, refreshFeeds, selectedFeed, t]);

  const {
    pullDistance,
    isRefreshing,
    isTriggered,
    handlers: pullHandlers,
  } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    disabled: !isMobile,
    getScrollTop: () => {
      const viewport = scrollViewportRef.current?.closest(
        '[data-slot="scroll-area-viewport"]',
      );
      return viewport?.scrollTop ?? 0;
    },
  });

  return (
    <div className="relative flex h-full flex-col">
      <ContentHeader className="hidden md:flex">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {selectedFeed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshFeed}
              disabled={refreshFeed.isPending}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  refreshFeed.isPending && "animate-spin",
                )}
              />
              {t("feeds.refreshOne")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTranslateLoaded}
            disabled={
              translatableItems.length === 0 || translatePreviews.isPending
            }
            className="gap-1.5 text-xs"
          >
            {translatePreviews.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Languages className="h-4 w-4" />
            )}
            {translatePreviews.isPending
              ? t("article.translate.translating")
              : t("article.translate.loaded", {
                  count: translatableItems.length,
                })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0 || markAllItemsRead.isPending}
            className="gap-1.5 text-xs"
          >
            <CheckCheck className="h-4 w-4" />
            {t("article.list.markAllRead")}
          </Button>
        </div>
      </ContentHeader>

      <div className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 z-40 md:hidden">
        <SidebarTrigger className="size-11 rounded-full border border-border/70 bg-background/90 shadow-lg shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl hover:bg-background dark:bg-background/80 dark:ring-white/5" />
      </div>

      {/* Article area with desktop filter tabs */}
      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-0 py-0 md:gap-4 md:px-6 md:py-4">
        {/* Mobile filtering moves into the bottom category drawer. */}
        {!hasNoFeeds && (articles.length > 0 || articleFilter !== "all") && (
          <Tabs
            value={articleFilter}
            onValueChange={(v) => setArticleFilter(v as ArticleFilter)}
            className="hidden md:block"
          >
            <TabsList>
              <TabsTrigger value="all">{t("article.filter.all")}</TabsTrigger>
              <TabsTrigger value="unread">
                {t("article.filter.unread")}
              </TabsTrigger>
              <TabsTrigger value="starred">
                {t("article.filter.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Mobile: pull-to-refresh indicator, shown above the list while
            dragging down from the top of the scroll area. */}
        {isMobile && (pullDistance > 0 || isRefreshing) && (
          <div
            className="flex items-center justify-center overflow-hidden text-xs text-muted-foreground transition-[height]"
            style={{ height: isRefreshing ? 32 : pullDistance }}
          >
            {isRefreshing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("article.mobile.refreshing")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <ArrowDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isTriggered && "rotate-180",
                  )}
                />
                {isTriggered
                  ? t("article.mobile.releaseToRefresh")
                  : t("article.mobile.pullToRefresh")}
              </span>
            )}
          </div>
        )}

        {/* Article list */}
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={scrollViewportRef}
            {...pullHandlers}
            className="px-4 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-0 md:pt-0 md:pb-0"
          >
            {isLoading && articles.length === 0 ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-md bg-accent"
                  />
                ))}
              </div>
            ) : articles.length === 0 ? (
              hasNoFeeds ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("article.list.noFeeds")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate({ to: "/feeds" })}
                  >
                    {t("article.list.openFeedManagement")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("article.list.noArticles")}
                  </p>
                </div>
              )
            ) : isMovieView ? (
              <>
                <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {articles.map((article) => {
                    return (
                      <MovieCard
                        key={article.id}
                        article={article}
                        selectedArticleId={selectedArticleId}
                        onSelectArticle={setSelectedArticle}
                        onToggleRead={handleToggleRead}
                        onToggleStar={handleToggleStar}
                        isStarred={isItemStarred(article.id)}
                      />
                    );
                  })}
                </div>
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchNextPage()}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {isLoadingMore
                        ? t("article.list.loading")
                        : t("article.list.loadMore")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Plain articles and tweets are interleaved in one list;
                    each item picks its own card based on its source feed. */}
                {articles.map((article) => {
                  if (getArticleKind(article) === "twitter") {
                    return (
                      <SwipeableRow
                        key={article.id}
                        unread={article.unread}
                        isStarred={isItemStarred(article.id)}
                        canToggleRead={article.id > 0}
                        onToggleRead={() => handleToggleRead(article)}
                        onToggleStar={() => handleToggleStar(article)}
                      >
                        <TwitterCard
                          article={article}
                          selectedArticleId={selectedArticleId}
                          onSelectArticle={setSelectedArticle}
                          onToggleRead={handleToggleRead}
                          onToggleStar={handleToggleStar}
                          isStarred={isItemStarred(article.id)}
                        />
                      </SwipeableRow>
                    );
                  }

                  const feed = getFeedById(article.feed_id);
                  const bookmark = getBookmarkByItemId(article.id);

                  return (
                    <SwipeableRow
                      key={article.id}
                      unread={article.unread}
                      isStarred={isItemStarred(article.id)}
                      canToggleRead={article.id > 0}
                      onToggleRead={() => handleToggleRead(article)}
                      onToggleStar={() => handleToggleStar(article)}
                    >
                      <ArticleItem
                        article={article}
                        selectedArticleId={selectedArticleId}
                        onSelectArticle={setSelectedArticle}
                        onToggleRead={handleToggleRead}
                        onToggleStar={handleToggleStar}
                        canToggleRead={article.id > 0}
                        isStarred={isItemStarred(article.id)}
                        feedName={
                          feed?.name ??
                          bookmark?.feed_name ??
                          t("common.unknown")
                        }
                        feedFaviconUrl={
                          feed ? getFaviconUrl(feed.link, feed.site_url) : null
                        }
                      />
                    </SwipeableRow>
                  );
                })}
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchNextPage()}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {isLoadingMore
                        ? t("article.list.loading")
                        : t("article.list.loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {isMobile && (
        <>
          <MobileActionBar
            translatableCount={translatableItems.length}
            isTranslating={translatePreviews.isPending}
            onTranslate={handleTranslateLoaded}
            isCategoryOpen={isCategoryOpen}
            onOpenCategories={() => setCategoryOpen(true)}
            isUpdating={
              isRefreshing ||
              refreshFeed.isPending ||
              refreshFeeds.isPending
            }
            onUpdate={handlePullRefresh}
            unreadCount={unreadCount}
            onMarkAllRead={handleMarkAllAsRead}
          />
          <MobileCategoryDrawer
            open={isCategoryOpen}
            onOpenChange={setCategoryOpen}
          />
        </>
      )}
    </div>
  );
}
