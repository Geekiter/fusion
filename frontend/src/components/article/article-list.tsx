import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronsDown,
  Languages,
  List,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Star,
  X,
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
  useMarkItemsRead,
  useMarkItemsUnread,
  useTranslateItemPreviews,
} from "@/queries/items";
import {
  useFeedLookup,
  useRefreshFeed,
  useRefreshFeeds,
} from "@/queries/feeds";
import { useGroups } from "@/queries/groups";
import { useCreateBookmark, useDeleteBookmark } from "@/queries/bookmarks";
import { usePreferencesStore } from "@/store";
import { getFaviconUrl } from "@/lib/api/favicon";
import { useI18n } from "@/lib/i18n";
import type { Item } from "@/lib/api";
import { cn, extractSummary, needsTranslation } from "@/lib/utils";
import {
  getListScrollPosition,
  saveListScrollPosition,
} from "@/lib/list-position";

function getArticleDateKey(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
}

function formatArticleDateGroup(
  timestamp: number,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (getArticleDateKey(timestamp) === getArticleDateKey(today.getTime() / 1000)) {
    return todayLabel;
  }

  if (
    getArticleDateKey(timestamp) ===
    getArticleDateKey(yesterday.getTime() / 1000)
  ) {
    return yesterdayLabel;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function ArticleList() {
  const { t } = useI18n();
  const locale = usePreferencesStore((state) => state.locale);
  const articleListDensity = usePreferencesStore(
    (state) => state.articleListDensity,
  );
  const setArticleListDensity = usePreferencesStore(
    (state) => state.setArticleListDensity,
  );
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
  const markItemsUnread = useMarkItemsUnread();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const translatePreviews = useTranslateItemPreviews();
  const refreshFeed = useRefreshFeed();
  const refreshFeeds = useRefreshFeeds();
  const isMobile = useIsMobile();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreGateRef = useRef<"idle" | "pending" | "cooldown">("idle");
  const pendingListRestoreRef = useRef<{
    key: string;
    top: number;
    deadline: number;
  } | null>(null);
  const listRestoreFrameRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const [isCategoryOpen, setCategoryOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [hideMobileActionBar, setHideMobileActionBar] = useState(false);
  const [isLoadMorePending, setIsLoadMorePending] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<number>>(
    () => new Set(),
  );

  const listViewKey = `${selectedFeedId ? `feed:${selectedFeedId}` : selectedGroupId ? `group:${selectedGroupId}` : "home"}:${articleFilter}`;

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedArticleIds(new Set());
  }, [listViewKey]);

  const toggleSelectedArticle = useCallback((articleId: number) => {
    setSelectedArticleIds((current) => {
      const next = new Set(current);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }, []);

  const handleSelectArticle = useCallback(
    (articleId: number | null) => {
      if (articleId === null) {
        setSelectedArticle(null);
        return;
      }
      if (isSelectionMode) {
        toggleSelectedArticle(articleId);
        return;
      }
      setSelectedArticle(articleId);
    },
    [isSelectionMode, setSelectedArticle, toggleSelectedArticle],
  );

  const getArticleScrollViewport = useCallback(
    () =>
      scrollViewportRef.current?.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    [],
  );

  useEffect(() => {
    const viewport = getArticleScrollViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const scrollTop = Math.max(0, viewport.scrollTop);
      const lastScrollTop = lastScrollTopRef.current;

      if (!isMobile || scrollTop <= 24 || scrollTop < lastScrollTop - 2) {
        setHideMobileActionBar(false);
      } else if (scrollTop > lastScrollTop + 4) {
        setHideMobileActionBar(true);
      }

      lastScrollTopRef.current = scrollTop;
      setShowScrollTop(scrollTop > 480);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [articles.length, getArticleScrollViewport, isMobile]);

  useEffect(() => {
    const viewport = getArticleScrollViewport();
    if (!viewport) return;

    const savedTop = getListScrollPosition(listViewKey);
    pendingListRestoreRef.current =
      savedTop > 0
        ? { key: listViewKey, top: savedTop, deadline: Date.now() + 2000 }
        : null;

    viewport.scrollTo({ top: 0, behavior: "instant" });
    loadMoreGateRef.current = "idle";
    lastScrollTopRef.current = 0;
    setHideMobileActionBar(false);
    setShowScrollTop(false);
    setIsLoadMorePending(false);

    if (savedTop <= 0) return;

    const restore = () => {
      const pending = pendingListRestoreRef.current;
      if (!pending || pending.key !== listViewKey) return;

      const scrollableHeight = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight,
      );
      viewport.scrollTo({
        top: Math.min(pending.top, scrollableHeight),
        behavior: "instant",
      });

      if (pending.top <= scrollableHeight || Date.now() > pending.deadline) {
        pendingListRestoreRef.current = null;
        listRestoreFrameRef.current = null;
        return;
      }

      listRestoreFrameRef.current = window.requestAnimationFrame(restore);
    };

    listRestoreFrameRef.current = window.requestAnimationFrame(restore);
    return () => {
      if (listRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(listRestoreFrameRef.current);
        listRestoreFrameRef.current = null;
      }
    };
  }, [getArticleScrollViewport, listViewKey]);

  useEffect(() => {
    const viewport = getArticleScrollViewport();
    if (!viewport) return;

    let saveTimer: number | null = null;
    const saveCurrentPosition = () => {
      if (pendingListRestoreRef.current?.key === listViewKey) return;
      saveListScrollPosition(listViewKey, viewport.scrollTop);
    };
    const handleScroll = () => {
      if (pendingListRestoreRef.current?.key === listViewKey) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveCurrentPosition, 180);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveCurrentPosition();
    };
  }, [getArticleScrollViewport, listViewKey]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const viewport = getArticleScrollViewport();
    if (!sentinel || !viewport || !hasMore) {
      setIsLoadMorePending(false);
      return;
    }

    const offerLoadMore = () => {
      if (loadMoreGateRef.current !== "idle" || isLoadingMore) return;
      loadMoreGateRef.current = "pending";
      setIsLoadMorePending(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([12, 28, 8]);
      }
    };

    const nearBottomObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          loadMoreGateRef.current = "idle";
          setIsLoadMorePending(false);
          return;
        }

        offerLoadMore();
      },
      { root: viewport, rootMargin: "0px 0px 240px", threshold: 0 },
    );

    nearBottomObserver.observe(sentinel);
    return () => {
      nearBottomObserver.disconnect();
    };
  }, [fetchNextPage, getArticleScrollViewport, hasMore, isLoadingMore]);

  const confirmLoadMore = useCallback(() => {
    if (
      !hasMore ||
      loadMoreGateRef.current === "cooldown" ||
      isLoadingMore
    ) {
      return;
    }
    loadMoreGateRef.current = "cooldown";
    setIsLoadMorePending(false);
    fetchNextPage();
    loadMoreGateRef.current = "idle";
  }, [fetchNextPage, hasMore, isLoadingMore]);

  const articleIds = articles.map((a) => a.id);
  const unreadArticleIds = articles
    .filter((article) => article.unread && article.id > 0)
    .map((article) => article.id);
  useArticleNavigation(articleIds, {
    enabled: selectedArticleId === null,
    unreadArticleIds,
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
  } else if (articleFilter === "today") {
    title = t("article.filter.today");
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

  const unreadCount = articles.filter((a) => a.unread).length;
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

  const handleStartReading = useCallback(() => {
    const firstUnreadId = articles.find(
      (article) => article.unread && article.id > 0,
    )?.id;
    if (firstUnreadId !== undefined) {
      setSelectedArticle(firstUnreadId);
    }
  }, [articles, setSelectedArticle]);

  const handleMarkAllAsRead = async () => {
    const unreadIds = articles
      .filter((a) => a.unread && a.id > 0)
      .map((a) => a.id);

    if (unreadIds.length === 0) return;

    try {
      await markItemsRead.mutateAsync(unreadIds);
      requestAnimationFrame(() => {
        getArticleScrollViewport()?.scrollTo({ top: 0, behavior: "instant" });
      });
      toast.success(
        t("article.list.markAllReadSuccess", { count: unreadIds.length }),
        {
          duration: 7000,
          action: {
            label: t("common.undo"),
            onClick: () => {
              void markItemsUnread
                .mutateAsync(unreadIds)
                .then(() => {
                  toast.success(t("article.list.markAllReadUndone"));
                })
                .catch((error) => {
                  console.error("Failed to undo marking items as read:", error);
                  toast.error(t("article.list.markAllReadUndoFailed"));
                });
            },
          },
        },
      );
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      toast.error(t("article.list.markAllReadFailed"));
    }
  };

  const selectedArticles = articles.filter(
    (article) => selectedArticleIds.has(article.id) && article.id > 0,
  );
  const selectedUnreadIds = selectedArticles
    .filter((article) => article.unread)
    .map((article) => article.id);
  const selectedUnstarredCount = selectedArticles.filter(
    (article) => !isItemStarred(article.id),
  ).length;

  const handleSelectAllLoaded = () => {
    setSelectedArticleIds((current) => {
      const selectableIds = articles
        .filter((article) => article.id > 0)
        .map((article) => article.id);
      const allSelected =
        selectableIds.length > 0 &&
        selectableIds.every((articleId) => current.has(articleId));
      return allSelected ? new Set() : new Set(selectableIds);
    });
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedUnreadIds.length === 0) return;

    try {
      await markItemsRead.mutateAsync(selectedUnreadIds);
      toast.success(
        t("article.selection.readSuccess", {
          count: selectedUnreadIds.length,
        }),
      );
      setSelectedArticleIds((current) => {
        const next = new Set(current);
        selectedUnreadIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (error) {
      console.error("Failed to mark selected articles as read:", error);
      toast.error(t("article.list.markAllReadFailed"));
    }
  };

  const handleStarSelected = async () => {
    const articlesToStar = selectedArticles.filter(
      (article) => !isItemStarred(article.id),
    );
    if (articlesToStar.length === 0) return;

    try {
      await Promise.all(
        articlesToStar.map((article) => createBookmark.mutateAsync(article)),
      );
      toast.success(
        t("article.selection.starSuccess", { count: articlesToStar.length }),
      );
      setSelectedArticleIds(new Set());
    } catch (error) {
      console.error("Failed to star selected articles:", error);
      toast.error(t("article.selection.starFailed"));
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
      const viewport = getArticleScrollViewport();
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
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setArticleListDensity(
                articleListDensity === "compact" ? "comfortable" : "compact",
              )
            }
            aria-pressed={articleListDensity === "compact"}
            aria-label={t("article.list.densityToggle")}
            title={t("article.list.densityToggle")}
            className="gap-1.5 text-xs"
          >
            <List className="h-4 w-4" />
            <span className="hidden lg:inline">
              {articleListDensity === "compact"
                ? t("settings.density.compact")
                : t("settings.density.comfortable")}
            </span>
          </Button>
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
              disabled={
                unreadCount === 0 || markItemsRead.isPending
              }
            className="gap-1.5 text-xs"
          >
              {markItemsRead.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
            {t("article.list.markAllRead")}
          </Button>
          {isSelectionMode ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectAllLoaded}
                disabled={articles.length === 0}
                className="gap-1.5 text-xs"
              >
                <ListChecks className="h-4 w-4" />
                {t("article.selection.selected", {
                  count: selectedArticleIds.size,
                })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkSelectedAsRead}
                disabled={selectedUnreadIds.length === 0 || markItemsRead.isPending}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="h-4 w-4" />
                {t("article.selection.markRead")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStarSelected}
                disabled={selectedUnstarredCount === 0 || createBookmark.isPending}
                className="gap-1.5 text-xs"
              >
                <Star className="h-4 w-4" />
                {t("article.selection.star")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedArticleIds(new Set());
                }}
                aria-label={t("article.selection.exit")}
                title={t("article.selection.exit")}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSelectionMode(true)}
              disabled={articles.length === 0}
              className="gap-1.5 text-xs"
            >
              <ListChecks className="h-4 w-4" />
              <span className="hidden lg:inline">
                {t("article.selection.enter")}
              </span>
            </Button>
          )}
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
              <TabsTrigger value="today">
                {t("article.filter.today")}
              </TabsTrigger>
              <TabsTrigger value="starred">
                {t("article.filter.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {articles.length > 0 && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-2 text-[11px] text-muted-foreground md:px-0"
            aria-live="polite"
          >
            <span className="tabular-nums">
              {t("article.list.loadedSummary", {
                loaded: articles.length,
                unread: unreadCount,
              })}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartReading}
                  className="h-7 gap-1 rounded-full px-2.5 text-[11px] text-primary hover:bg-primary/10"
                >
                  <Play className="size-3.5 fill-current" />
                  {t("article.session.start")}
                </Button>
              )}
              {hasMore && (
                <span className="hidden rounded-full bg-muted/70 px-2 py-1 sm:inline">
                  {t("article.list.loadMoreManual")}
                </span>
              )}
            </div>
          </div>
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
                      <div key={article.id} className="relative">
                        {isSelectionMode && (
                          <button
                            type="button"
                            className={cn(
                              "absolute left-2 top-2 z-20 flex size-7 items-center justify-center rounded-full border bg-background shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95",
                              selectedArticleIds.has(article.id) &&
                                "border-primary bg-primary text-primary-foreground",
                            )}
                            onClick={() => toggleSelectedArticle(article.id)}
                            aria-label={
                              selectedArticleIds.has(article.id)
                                ? t("article.selection.deselect")
                                : t("article.selection.select")
                            }
                            aria-pressed={selectedArticleIds.has(article.id)}
                          >
                            {selectedArticleIds.has(article.id) && (
                              <Check className="size-4" />
                            )}
                          </button>
                        )}
                        <MovieCard
                          article={article}
                          selectedArticleId={
                            isSelectionMode
                              ? selectedArticleIds.has(article.id)
                                ? article.id
                                : null
                              : selectedArticleId
                          }
                          onSelectArticle={handleSelectArticle}
                          onToggleRead={handleToggleRead}
                          onToggleStar={handleToggleStar}
                          isStarred={isItemStarred(article.id)}
                        />
                      </div>
                    );
                  })}
                </div>
                <div ref={loadMoreSentinelRef} className="h-px" aria-hidden="true" />
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    {isLoadMorePending && (
                      <div className="fusion-load-more-prompt flex max-w-sm items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground">
                        <ChevronsDown className="h-4 w-4 shrink-0 text-primary" />
                        <span>{t("article.list.loadMoreConfirm")}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={confirmLoadMore}
                          disabled={isLoadingMore}
                          className="h-7 rounded-full px-2.5 text-xs text-primary hover:bg-primary/10"
                        >
                          {t("article.list.loadMoreNow")}
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={confirmLoadMore}
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
                {!hasMore && articles.length > 0 && (
                  <div
                    className="flex items-center justify-center gap-2 border-t border-border/40 py-5 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                    role="status"
                    aria-live="polite"
                  >
                    <Check className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                    <span>{t("article.list.endOfList")}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Plain articles and tweets are interleaved in one list;
                    each item picks its own card based on its source feed. */}
                {articles.map((article, index) => {
                  const previousArticle = articles[index - 1];
                  const isNewDateGroup =
                    index === 0 ||
                    !previousArticle ||
                    getArticleDateKey(article.pub_date) !==
                      getArticleDateKey(previousArticle.pub_date);
                  const dateGroupLabel = isNewDateGroup
                    ? formatArticleDateGroup(
                        article.pub_date,
                        locale,
                        t("article.list.today"),
                        t("article.list.yesterday"),
                      )
                    : null;
                  let articleRow: React.ReactNode;

                  if (getArticleKind(article) === "twitter") {
                    articleRow = (
                      <SwipeableRow
                        unread={article.unread}
                        isStarred={isItemStarred(article.id)}
                        canToggleRead={article.id > 0}
                        onToggleRead={() => handleToggleRead(article)}
                        onToggleStar={() => handleToggleStar(article)}
                      >
                        <TwitterCard
                          article={article}
                          selectedArticleId={
                            isSelectionMode
                              ? selectedArticleIds.has(article.id)
                                ? article.id
                                : null
                              : selectedArticleId
                          }
                          onSelectArticle={handleSelectArticle}
                          onToggleRead={handleToggleRead}
                          onToggleStar={handleToggleStar}
                          isStarred={isItemStarred(article.id)}
                          density={articleListDensity}
                        />
                      </SwipeableRow>
                    );
                  } else {
                    const feed = getFeedById(article.feed_id);
                    const bookmark = getBookmarkByItemId(article.id);

                    articleRow = (
                      <SwipeableRow
                        unread={article.unread}
                        isStarred={isItemStarred(article.id)}
                        canToggleRead={article.id > 0}
                        onToggleRead={() => handleToggleRead(article)}
                        onToggleStar={() => handleToggleStar(article)}
                      >
                        <ArticleItem
                          article={article}
                          selectedArticleId={
                            isSelectionMode
                              ? selectedArticleIds.has(article.id)
                                ? article.id
                                : null
                              : selectedArticleId
                          }
                          onSelectArticle={handleSelectArticle}
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
                          density={articleListDensity}
                        />
                      </SwipeableRow>
                    );
                  }

                  return (
                    <Fragment key={article.id}>
                      {dateGroupLabel && (
                        <div
                          className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-background/90 px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground backdrop-blur-md md:px-0"
                          role="heading"
                          aria-level={3}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                          <span>{dateGroupLabel}</span>
                        </div>
                      )}
                      {isSelectionMode ? (
                        <div className="relative pl-9">
                          <button
                            type="button"
                            className={cn(
                              "absolute left-1 top-1/2 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95",
                              selectedArticleIds.has(article.id) &&
                                "border-primary bg-primary text-primary-foreground",
                            )}
                            onClick={() => toggleSelectedArticle(article.id)}
                            aria-label={
                              selectedArticleIds.has(article.id)
                                ? t("article.selection.deselect")
                                : t("article.selection.select")
                            }
                            aria-pressed={selectedArticleIds.has(article.id)}
                          >
                            {selectedArticleIds.has(article.id) && (
                              <Check className="size-4" />
                            )}
                          </button>
                          {articleRow}
                        </div>
                      ) : (
                        articleRow
                      )}
                    </Fragment>
                  );
                })}
                <div ref={loadMoreSentinelRef} className="h-px" aria-hidden="true" />
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    {isLoadMorePending && (
                      <div className="fusion-load-more-prompt flex max-w-sm items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground">
                        <ChevronsDown className="h-4 w-4 shrink-0 text-primary" />
                        <span>{t("article.list.loadMoreConfirm")}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={confirmLoadMore}
                          disabled={isLoadingMore}
                          className="h-7 rounded-full px-2.5 text-xs text-primary hover:bg-primary/10"
                        >
                          {t("article.list.loadMoreNow")}
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={confirmLoadMore}
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
                {!hasMore && articles.length > 0 && (
                  <div
                    className="flex items-center justify-center gap-2 border-t border-border/40 py-5 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                    role="status"
                    aria-live="polite"
                  >
                    <Check className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                    <span>{t("article.list.endOfList")}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {showScrollTop && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() =>
            getArticleScrollViewport()?.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
          aria-label={t("article.list.scrollToTop")}
          title={t("article.list.scrollToTop")}
          className={cn(
            "absolute right-4 z-30 size-10 rounded-full border border-border/70 bg-background/90 shadow-lg shadow-black/10 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
            isMobile
              ? "bottom-[calc(env(safe-area-inset-bottom)+6rem)]"
              : "bottom-4 md:right-6",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}

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
            isMarkingAllRead={markItemsRead.isPending}
            onMarkAllRead={handleMarkAllAsRead}
            isSelectionMode={isSelectionMode}
            selectedCount={selectedArticleIds.size}
            onToggleSelectionMode={() => {
              setIsSelectionMode((active) => !active);
              if (isSelectionMode) setSelectedArticleIds(new Set());
            }}
            onSelectAllLoaded={handleSelectAllLoaded}
            onMarkSelectedRead={handleMarkSelectedAsRead}
            onStarSelected={handleStarSelected}
            selectedUnreadCount={selectedUnreadIds.length}
            selectedUnstarredCount={selectedUnstarredCount}
            isHidden={hideMobileActionBar}
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
