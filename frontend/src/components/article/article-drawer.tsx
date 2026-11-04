import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleCheck,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  ArrowUp,
  Share2,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUrlState } from "@/hooks/use-url-state";
import { usePreferencesStore } from "@/store";
import type { Item } from "@/lib/api";
import {
  useItem,
  useFetchItemFulltext,
  useMarkItemsRead,
  useMarkItemsUnread,
  useTranslateItemContent,
  useSummarizeItem,
} from "@/queries/items";
import { useFeedLookup } from "@/queries/feeds";
import {
  useCreateBookmark,
  useDeleteBookmark,
} from "@/queries/bookmarks";
import { useArticleList } from "@/hooks/use-article-list";
import { useArticleNavigation } from "@/hooks/use-keyboard";
import { useI18n } from "@/lib/i18n";
import {
  cn,
  estimateReadingTime,
  extractSummary,
  formatDate,
  needsTranslation,
} from "@/lib/utils";
import { processArticleContent } from "@/lib/content";
import { getFaviconUrl } from "@/lib/api/favicon";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";
import {
  getReadingPosition,
  saveReadingPosition,
} from "@/lib/reading-position";

/**
 * Collapsible full-title section shown in the article body.
 * Collapsed by default — click to expand.
 * Styled distinctly from body text: muted background, border, smaller italic font.
 */
function FullTitleToggle({ title }: { title: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
        <span
          className={cn(
            "text-[13px] leading-snug text-muted-foreground",
            !expanded && "truncate",
          )}
        >
          {expanded
            ? t("article.collapseFullTitle")
            : t("article.showFullTitle")}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="mt-2 px-3 text-[13px] italic leading-relaxed text-muted-foreground">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ArticleDrawer() {
  const { t } = useI18n();
  const articleContentRef = useRef<HTMLElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeOffsetRef = useRef(0);
  const pendingReadingPositionRef = useRef<{
    top: number;
    deadline: number;
  } | null>(null);
  const readingPositionRestoredRef = useRef(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<
    Array<{ src: string; alt: string }>
  >([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const {
    selectedArticleId,
    setSelectedArticle,
    setSelectedFeed,
    selectedFeedId,
    selectedGroupId,
    articleFilter,
  } = useUrlState();
  const { getFeedById } = useFeedLookup();
  const markArticleReadOnOpen = usePreferencesStore(
    (state) => state.markArticleReadOnOpen,
  );
  const articleTextSize = usePreferencesStore(
    (state) => state.articleTextSize,
  );

  const { articles, hasMore, isItemStarred, getBookmarkByItemId } =
    useArticleList({
      feedId: selectedFeedId,
      groupId: selectedGroupId,
      articleFilter,
    });

  const markRead = useMarkItemsRead();
  const markUnread = useMarkItemsUnread();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const translateContent = useTranslateItemContent();
  const summarizeItem = useSummarizeItem();
  const fetchFulltext = useFetchItemFulltext();

  const articleIds = articles.map((a) => a.id);
  const articleIndex = selectedArticleId
    ? articleIds.indexOf(selectedArticleId)
    : -1;
  const articlePosition = articleIndex >= 0 ? articleIndex + 1 : null;

  const storeArticle = selectedArticleId
    ? (articles.find((i) => i.id === selectedArticleId) ?? null)
    : null;

  const shouldFetchArticle = selectedArticleId !== null && selectedArticleId > 0;
  const { data: fetchedArticle } = useItem(
    selectedArticleId,
    shouldFetchArticle,
  );

  const article: Item | null = fetchedArticle ?? storeArticle ?? null;
  const unreadArticleIds = articles
    .filter((item) => item.unread && item.id > 0)
    .map((item) => item.id);
  const nextUnreadArticleId =
    unreadArticleIds.find(
      (itemId) =>
        itemId !== article?.id && articleIds.indexOf(itemId) > articleIndex,
    ) ?? unreadArticleIds.find((itemId) => itemId !== article?.id);
  const hasNextUnread = nextUnreadArticleId !== undefined;

  const markedArticleOnOpenRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedArticleId === null) {
      markedArticleOnOpenRef.current = null;
      return;
    }

    if (
      !markArticleReadOnOpen ||
      !article ||
      article.id <= 0 ||
      !article.unread ||
      markedArticleOnOpenRef.current === article.id
    ) {
      return;
    }

    markedArticleOnOpenRef.current = article.id;
    void markRead.mutateAsync([article.id]).catch((error) => {
      if (markedArticleOnOpenRef.current === article.id) {
        markedArticleOnOpenRef.current = null;
      }
      console.error("Failed to mark opened article as read:", error);
    });
  }, [
    article?.id,
    article?.unread,
    markArticleReadOnOpen,
    markRead,
    selectedArticleId,
  ]);

  const canToggleRead = article !== null && article.id > 0;
  const feed = article ? getFeedById(article.feed_id) : null;
  const bookmark = article ? getBookmarkByItemId(article.id) : null;
  const starred = article ? isItemStarred(article.id) : false;
  const safeArticleLink = article ? toSafeExternalUrl(article.link) : null;
  const readingMinutes = article
    ? estimateReadingTime(article.extracted_content || article.content)
    : 1;

  const handleScrollToTop = () => {
    const content = articleContentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleArticleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(
        "a, button, input, textarea, select, img, [data-swipe-ignore]",
      )
    ) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleArticleTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    if (!start || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.2) {
      if (Math.abs(dy) > 18) swipeStartRef.current = null;
      return;
    }

    event.preventDefault();
    setIsSwiping(true);
    const canNavigate = dx < 0 ? hasNext() : hasPrevious();
    const resistance = canNavigate ? 0.4 : 0.16;
    const nextOffset = Math.max(-96, Math.min(96, dx * resistance));
    swipeOffsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  };

  const handleArticleTouchEnd = () => {
    const offset = swipeOffsetRef.current;
    swipeStartRef.current = null;
    swipeOffsetRef.current = 0;
    setIsSwiping(false);
    setSwipeOffset(0);

    if (offset <= -56 && hasNext()) {
      goToNext();
    } else if (offset >= 56 && hasPrevious()) {
      goToPrevious();
    }
  };

  useEffect(() => {
    const content = articleContentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    const savedTop = article?.id ? getReadingPosition(article.id) : 0;
    pendingReadingPositionRef.current =
      savedTop > 0
        ? { top: savedTop, deadline: Date.now() + 1500 }
        : null;
    readingPositionRestoredRef.current = savedTop <= 0;

    viewport.scrollTo({ top: 0, behavior: "instant" });
    setReadingProgress(0);
    setLightboxIndex(null);
  }, [article?.id]);

  useEffect(() => {
    if (selectedArticleId === null) {
      setIsFocusMode(false);
    }
  }, [selectedArticleId]);

  useEffect(() => {
    const content = articleContentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport || !content) {
      setReadingProgress(0);
      return;
    }

    const articleId = article?.id ?? 0;
    let saveTimer: number | null = null;

    const applyPendingReadingPosition = () => {
      const pending = pendingReadingPositionRef.current;
      if (!pending || articleId <= 0) return;

      const scrollableHeight = Math.max(
        0,
        viewport.scrollHeight - viewport.clientHeight,
      );
      const target = Math.min(pending.top, scrollableHeight);
      viewport.scrollTo({ top: target, behavior: "instant" });

      if (pending.top <= scrollableHeight || Date.now() > pending.deadline) {
        pendingReadingPositionRef.current = null;
        readingPositionRestoredRef.current = true;
      }
    };

    const getCurrentProgress = () => {
      const scrollableHeight = viewport.scrollHeight - viewport.clientHeight;
      return scrollableHeight > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round((viewport.scrollTop / scrollableHeight) * 100),
            ),
          )
        : 0;
    };

    const persistCurrentPosition = () => {
      if (articleId > 0 && readingPositionRestoredRef.current) {
        saveReadingPosition(
          articleId,
          viewport.scrollTop,
          getCurrentProgress(),
        );
      }
    };

    const updateProgress = () => {
      applyPendingReadingPosition();
      const nextProgress = getCurrentProgress();
      setReadingProgress(Math.min(100, Math.max(0, nextProgress)));

      if (readingPositionRestoredRef.current && articleId > 0) {
        if (saveTimer !== null) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          persistCurrentPosition();
        }, 180);
      }
    };

    viewport.addEventListener("scroll", updateProgress, { passive: true });
    const resizeObserver = new ResizeObserver(updateProgress);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    updateProgress();

    return () => {
      viewport.removeEventListener("scroll", updateProgress);
      resizeObserver.disconnect();
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      persistCurrentPosition();
    };
  }, [
    article?.ai_summary,
    article?.content,
    article?.extracted_content,
    article?.id,
    article?.translated_content,
  ]);

  useEffect(() => {
    const root = articleBodyRef.current;
    if (!root) return;

    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
    const loadedClass = "fusion-article-image-loaded";
    const imageItems = images.map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt,
    }));
    const clickHandlers = new Map<
      HTMLImageElement,
      (event: MouseEvent) => void
    >();
    const handleLoad = (event: Event) => {
      (event.currentTarget as HTMLImageElement).classList.add(loadedClass);
    };

    for (const [index, image] of images.entries()) {
      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setLightboxImages(imageItems);
        setLightboxIndex(index);
      };

      clickHandlers.set(image, handleClick);
      image.classList.add("fusion-article-image");
      image.classList.add("cursor-zoom-in");
      image.addEventListener("click", handleClick);
      if (image.complete && image.naturalWidth > 0) {
        image.classList.add(loadedClass);
      } else {
        image.addEventListener("load", handleLoad);
      }
    }

    return () => {
      for (const image of images) {
        const handleClick = clickHandlers.get(image);
        if (handleClick) image.removeEventListener("click", handleClick);
        image.removeEventListener("load", handleLoad);
      }
    };
  }, [
    article?.content,
    article?.extracted_content,
    article?.id,
    article?.translated_content,
  ]);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLightboxIndex((current) =>
          current === null || current <= 0 ? current : current - 1,
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setLightboxIndex((current) =>
          current === null || current >= lightboxImages.length - 1
            ? current
            : current + 1,
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImages.length, lightboxIndex]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedArticle(null);
    }
  };

  const handleToggleRead = async () => {
    if (!article || !canToggleRead) return;
    try {
      if (article.unread) {
        await markRead.mutateAsync([article.id]);
      } else {
        await markUnread.mutateAsync([article.id]);
      }
    } catch (error) {
      console.error("Failed to toggle read status:", error);
    }
  };

  const handleMarkReadAndNext = async () => {
    if (!article) return;

    try {
      if (article.unread && canToggleRead) {
        await markRead.mutateAsync([article.id]);
      }

      if (nextUnreadArticleId !== undefined) {
        setSelectedArticle(nextUnreadArticleId);
      } else {
        setSelectedArticle(null);
        toast.info(t("article.list.endOfList"));
      }
    } catch (error) {
      console.error("Failed to mark article as read and continue:", error);
    }
  };

  const handleToggleStar = async () => {
    if (!article) return;
    try {
      if (starred) {
        const bookmark = getBookmarkByItemId(article.id);
        if (bookmark) {
          await deleteBookmark.mutateAsync(bookmark.id);
        }
      } else {
        await createBookmark.mutateAsync(article);
      }
    } catch (error) {
      console.error("Failed to toggle star:", error);
    }
  };

  const handleOpenOriginal = () => {
    if (!safeArticleLink) return;
    window.open(safeArticleLink, "_blank", "noopener,noreferrer");
  };

  const handleShareArticle = async () => {
    if (!article || !safeArticleLink || isSharing) return;

    const shareData = {
      title: article.translated_title || article.title,
      text: extractSummary(
        article.extracted_content || article.content,
        180,
      ),
      url: safeArticleLink,
    };

    setIsSharing(true);
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }

      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(safeArticleLink);
      toast.success(t("article.share.copied"));
    } catch (error) {
      console.error("Failed to share article:", error);
      toast.error(t("article.share.failed"));
    } finally {
      setIsSharing(false);
    }
  };

  const handleOpenFeed = () => {
    if (!article || article.feed_id <= 0) return;
    setSelectedFeed(article.feed_id);
  };

  const handleTranslateContent = async () => {
    if (!article || article.id <= 0) return;
    try {
      const translated = await translateContent.mutateAsync(article);
      if (translated.translated_content) {
        toast.success(t("article.translate.contentSuccess"));
      } else {
        toast.info(t("article.translate.notNeeded"));
      }
    } catch (error) {
      console.error("Failed to translate article content:", error);
      toast.error(t("article.translate.failed"));
    }
  };

  const handleSummarize = async () => {
    if (!article || article.id <= 0) return;
    try {
      const summarized = await summarizeItem.mutateAsync(article);
      if (summarized.ai_summary) {
        toast.success(t("article.summary.success"));
      }
    } catch (error) {
      console.error("Failed to summarize article:", error);
      toast.error(t("article.summary.failed"));
    }
  };

  const handleFetchFulltext = async () => {
    if (!article || article.id <= 0) return;
    try {
      const fetched = await fetchFulltext.mutateAsync(article);
      if (fetched.extracted_content) {
        toast.success(t("article.fulltext.success"));
      }
    } catch (error) {
      console.error("Failed to fetch full article content:", error);
      toast.error(t("article.fulltext.failed"));
    }
  };

  const getLinkDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const { goToNext, goToPrevious, hasNext, hasPrevious } =
    useArticleNavigation(articleIds, {
      enabled: selectedArticleId !== null,
      unreadArticleIds: articles
        .filter((item) => item.unread && item.id > 0)
        .map((item) => item.id),
      onToggleRead: () => {
        void handleToggleRead();
      },
      onMarkReadAndNext: () => {
        void handleMarkReadAndNext();
      },
      onToggleStar: () => {
        void handleToggleStar();
      },
      onOpenOriginal: handleOpenOriginal,
      onShare: handleShareArticle,
      onToggleFocus: () => setIsFocusMode((current) => !current),
    });

  const isReadPending = markRead.isPending || markUnread.isPending;
  const isStarPending =
    createBookmark.isPending || deleteBookmark.isPending;
  const isFulltextDisabled =
    !article ||
    article.id <= 0 ||
    !safeArticleLink ||
    Boolean(article.extracted_content) ||
    fetchFulltext.isPending;
  const isSummaryDisabled =
    !article ||
    article.id <= 0 ||
    Boolean(article.ai_summary) ||
    summarizeItem.isPending;
  const isTranslationDisabled =
    !article ||
    article.id <= 0 ||
    Boolean(article.translated_content) ||
    translateContent.isPending ||
    !needsTranslation(
      extractSummary(article.extracted_content || article.content, 500),
    );
  const lightboxImage =
    lightboxIndex === null ? null : lightboxImages[lightboxIndex] ?? null;
  const mobileActionClass =
    "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-foreground transition-[background-color,box-shadow,transform] duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.97] active:bg-muted disabled:text-muted-foreground";

  return (
    <>
      <Sheet open={selectedArticleId !== null} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "data-[side=right]:w-full p-0",
            isFocusMode
              ? "data-[side=right]:sm:max-w-none"
              : "data-[side=right]:sm:max-w-[max(840px,60vw)]",
          )}
          showCloseButton={false}
        >
        {article && (
          <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="flex min-h-14 items-center justify-between border-b px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 md:px-6 md:py-3">
              <SheetTitle className="min-w-0 flex-1 truncate pr-3 text-sm font-semibold md:sr-only">
                {article.translated_title || article.title}
              </SheetTitle>

              {articlePosition !== null && (
                <span
                  className="mr-2 shrink-0 rounded-full border border-border/70 bg-muted/60 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                  aria-label={t("article.position", {
                    current: articlePosition,
                    total: articles.length,
                  })}
                  title={t("article.position", {
                    current: articlePosition,
                    total: articles.length,
                  })}
                >
                  {articlePosition} / {articles.length}
                  {hasMore ? "+" : ""}
                </span>
              )}

              <div
                className={cn(
                  "hidden flex-wrap items-center gap-2",
                  !isFocusMode && "md:flex",
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchFulltext}
                  disabled={isFulltextDisabled}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {fetchFulltext.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {article.extracted_content
                    ? t("article.fulltext.completed")
                    : fetchFulltext.isPending
                      ? t("article.fulltext.fetching")
                      : t("article.fulltext.action")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleRead}
                  disabled={!canToggleRead || isReadPending}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {article.unread ? (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <CircleCheck className="h-4 w-4 text-primary" />
                  )}
                  {article.unread
                    ? t("article.action.markRead")
                    : t("article.action.markUnread")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSummarize}
                  disabled={isSummaryDisabled}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {summarizeItem.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {article.ai_summary
                    ? t("article.summary.completed")
                    : summarizeItem.isPending
                      ? t("article.summary.summarizing")
                      : t("article.summary.action")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleStar}
                  disabled={isStarPending}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  <Star
                    className={`h-4 w-4 ${starred ? "fill-current text-amber-500" : ""}`}
                  />
                  {starred ? t("article.action.unstar") : t("article.action.star")}
                </Button>
                {safeArticleLink ? (
                  <a
                    href={safeArticleLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground",
                    )}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("article.action.original")}
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("article.action.original")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShareArticle}
                  disabled={!safeArticleLink || isSharing}
                  aria-busy={isSharing}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {isSharing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  {t("article.share.action")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTranslateContent}
                  disabled={isTranslationDisabled}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  {translateContent.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Languages className="h-4 w-4" />
                  )}
                  {article.translated_content
                    ? t("article.translate.translated")
                    : translateContent.isPending
                      ? t("article.translate.translating")
                      : t("article.translate.content")}
                </Button>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsFocusMode((current) => !current)}
                aria-pressed={isFocusMode}
                aria-label={
                  isFocusMode
                    ? t("article.focus.exit")
                    : t("article.focus.enter")
                }
                title={
                  isFocusMode
                    ? t("article.focus.exit")
                    : t("article.focus.enter")
                }
                className="size-11 md:size-8"
              >
                {isFocusMode ? (
                  <Minimize2 className="h-[18px] w-[18px] text-muted-foreground" />
                ) : (
                  <Maximize2 className="h-[18px] w-[18px] text-muted-foreground" />
                )}
              </Button>

              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto size-11 md:size-8"
                    aria-label={t("common.cancel")}
                  />
                }
              >
                <X className="h-[18px] w-[18px] text-muted-foreground" />
              </SheetClose>
            </div>

            {/* Content */}
            <div className="relative min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
                <div
                  className="h-0.5 bg-border/40"
                  role="progressbar"
                  aria-label={t("article.readingProgress", {
                    percent: readingProgress,
                  })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={readingProgress}
                >
                  <div
                    className="h-full bg-primary transition-[width] duration-150 ease-out"
                    style={{ width: `${readingProgress}%` }}
                  />
                </div>
                {readingProgress > 8 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={handleScrollToTop}
                    aria-label={t("article.scrollToTop")}
                    title={t("article.scrollToTop")}
                    className="pointer-events-auto absolute top-3 right-4 size-9 rounded-full bg-background/90 shadow-md backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:transition-none"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <ScrollArea className="min-h-0 h-full">
                <article
                  key={article.id}
                  ref={articleContentRef}
                  onTouchStart={handleArticleTouchStart}
                  onTouchMove={handleArticleTouchMove}
                  onTouchEnd={handleArticleTouchEnd}
                  onTouchCancel={handleArticleTouchEnd}
                  className={cn(
                    "min-w-0 touch-pan-y px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 motion-reduce:animate-none",
                    isFocusMode
                      ? "mx-auto w-full max-w-4xl md:px-20 md:py-10 lg:px-24"
                      : "md:px-12 md:py-8",
                  )}
                  style={{
                    transform: `translate3d(${swipeOffset}px, 0, 0)`,
                    transition: isSwiping
                      ? "none"
                      : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                <div className="space-y-3">
                  <h1 className="line-clamp-2 text-[28px] font-bold leading-[1.3]">
                    {article.translated_title || article.title}
                  </h1>
                  {article.translated_title && (
                    <p className="text-sm text-muted-foreground italic">
                      {article.title}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {article.feed_id > 0 ? (
                      <button
                        type="button"
                        onClick={handleOpenFeed}
                        className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                      >
                        {feed && (
                          <FeedFavicon
                            src={getFaviconUrl(feed.link, feed.site_url)}
                            className="h-3.5 w-3.5 rounded-sm"
                          />
                        )}
                        <span className="truncate hover:underline">
                          {feed?.name ?? bookmark?.feed_name ?? t("common.unknown")}
                        </span>
                      </button>
                    ) : (
                      <span className="flex max-w-48 items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        <span className="truncate">
                          {bookmark?.feed_name ?? t("common.unknown")}
                        </span>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {formatDate(article.pub_date)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-muted-foreground"
                      title={t("article.readingTime", { minutes: readingMinutes })}
                    >
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("article.readingTime", { minutes: readingMinutes })}
                    </span>
                    {safeArticleLink ? (
                      <a
                        href={safeArticleLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        {getLinkDomain(safeArticleLink)}
                      </a>
                    ) : null}
                  </div>
                </div>

                {article.ai_summary && (
                  <section className="mt-8 rounded-lg border border-primary/20 bg-primary/5 p-5">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                      <Sparkles className="h-4 w-4" />
                      {t("article.summary.title")}
                    </h2>
                    <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                      {article.ai_summary}
                    </div>
                  </section>
                )}

                {article.translated_content && (
                  <section className="mt-8 border-b pb-8">
                    <h2 className="mb-4 text-sm font-semibold text-primary">
                      {t("article.translate.translation")}
                    </h2>
                    <div className="whitespace-pre-wrap text-[16px] leading-7 text-foreground">
                      {article.translated_content}
                    </div>
                  </section>
                )}

                <section className={article.translated_content ? "mt-8" : "mt-6"}>
                  {article.translated_content && (
                    <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
                      {t("article.translate.original")}
                    </h2>
                  )}
                  {article.extracted_content && !article.translated_content && (
                    <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
                      {t("article.fulltext.title")}
                    </h2>
                  )}
                  <FullTitleToggle title={article.title} />
                  <div
                    ref={articleBodyRef}
                    className={cn(
                      "typeset typeset-article min-w-0 max-w-none transition-[font-size] duration-200 motion-reduce:transition-none",
                      articleTextSize === 15 && "reader-text-small",
                      articleTextSize === 17 && "reader-text-medium",
                      articleTextSize === 19 && "reader-text-large",
                    )}
                    dangerouslySetInnerHTML={{
                      __html: processArticleContent(
                        article.extracted_content || article.content,
                        safeArticleLink ?? undefined,
                      ),
                    }}
                  />
                </section>

                <section className="mt-12 hidden rounded-2xl border border-border/70 bg-muted/25 p-4 md:block motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-reduce:animate-none">
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleCheck className="h-4 w-4 text-primary/70" />
                    <span>
                      {t("article.readingProgress", {
                        percent: readingProgress,
                      })}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPrevious}
                      disabled={!hasPrevious()}
                      className="h-auto gap-1.5 px-2 py-2 text-xs"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleMarkReadAndNext}
                      disabled={(!article.unread && !hasNextUnread) || isReadPending}
                      className="h-auto gap-1.5 px-2 py-2 text-xs"
                    >
                      <CheckCheck className="h-4 w-4" />
                      <span className="truncate">
                        {article.unread
                          ? t("article.action.markReadAndNext")
                          : t("shortcuts.action.nextUnreadArticle")}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNext}
                      disabled={!hasNext()}
                      className="h-auto gap-1.5 px-2 py-2 text-xs"
                    >
                      {t("common.next")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </section>

                <div className="mt-10 flex items-center justify-between md:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevious}
                    disabled={!hasPrevious()}
                    className="h-auto gap-1.5 px-3 py-2 text-[13px] font-medium text-muted-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t("common.previous")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleMarkReadAndNext}
                    disabled={(!article.unread && !hasNextUnread) || isReadPending}
                    aria-label={
                      article.unread
                        ? t("article.action.markReadAndNext")
                        : t("shortcuts.action.nextUnreadArticle")
                    }
                    className="h-auto gap-1.5 px-2 py-2 text-[13px] font-medium"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNext}
                    disabled={!hasNext()}
                    className="h-auto gap-1.5 px-3 py-2 text-[13px] font-medium text-muted-foreground"
                  >
                    {t("common.next")}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                </article>
              </ScrollArea>
            </div>

            {!isFocusMode && <nav
              aria-label={t("article.mobile.actions")}
              className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 flex justify-center px-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 md:hidden"
            >
              <div className="pointer-events-auto grid w-full max-w-md grid-cols-7 overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-1 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/80 dark:ring-white/5">
                <button
                  type="button"
                  onClick={handleFetchFulltext}
                  disabled={isFulltextDisabled}
                  aria-label={
                    article.extracted_content
                      ? t("article.fulltext.completed")
                      : fetchFulltext.isPending
                        ? t("article.fulltext.fetching")
                        : t("article.fulltext.action")
                  }
                  className={mobileActionClass}
                >
                  {fetchFulltext.isPending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <FileText className="h-[18px] w-[18px]" />
                  )}
                  <span className="max-w-full truncate">
                    {article.extracted_content
                      ? t("article.fulltext.completed")
                      : t("article.fulltext.action")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleRead}
                  disabled={!canToggleRead || isReadPending}
                  aria-label={
                    article.unread
                      ? t("article.action.markRead")
                      : t("article.action.markUnread")
                  }
                  className={mobileActionClass}
                >
                  {article.unread ? (
                    <Circle className="h-[18px] w-[18px]" />
                  ) : (
                    <CircleCheck className="h-[18px] w-[18px] text-primary" />
                  )}
                  <span className="max-w-full truncate">
                    {article.unread
                      ? t("article.action.markRead")
                      : t("article.action.markUnread")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSummarize}
                  disabled={isSummaryDisabled}
                  aria-label={
                    article.ai_summary
                      ? t("article.summary.completed")
                      : summarizeItem.isPending
                        ? t("article.summary.summarizing")
                        : t("article.summary.action")
                  }
                  className={mobileActionClass}
                >
                  {summarizeItem.isPending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <Sparkles className="h-[18px] w-[18px]" />
                  )}
                  <span className="max-w-full truncate">
                    {article.ai_summary
                      ? t("article.summary.completed")
                      : t("article.summary.action")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleStar}
                  disabled={isStarPending}
                  aria-label={
                    starred
                      ? t("article.action.unstar")
                      : t("article.action.star")
                  }
                  className={mobileActionClass}
                >
                  <Star
                    className={cn(
                      "h-[18px] w-[18px]",
                      starred && "fill-current text-amber-500",
                    )}
                  />
                  <span className="max-w-full truncate">
                    {starred
                      ? t("article.action.unstar")
                      : t("article.action.star")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenOriginal}
                  disabled={!safeArticleLink}
                  aria-label={t("article.action.original")}
                  className={mobileActionClass}
                >
                  <ExternalLink className="h-[18px] w-[18px]" />
                  <span className="max-w-full truncate">
                    {t("article.action.original")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleShareArticle}
                  disabled={!safeArticleLink || isSharing}
                  aria-busy={isSharing}
                  aria-label={t("article.share.action")}
                  className={mobileActionClass}
                >
                  {isSharing ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <Share2 className="h-[18px] w-[18px]" />
                  )}
                  <span className="max-w-full truncate">
                    {t("article.share.action")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleTranslateContent}
                  disabled={isTranslationDisabled}
                  aria-label={
                    article.translated_content
                      ? t("article.translate.translated")
                      : translateContent.isPending
                        ? t("article.translate.translating")
                        : t("article.translate.content")
                  }
                  className={mobileActionClass}
                >
                  {translateContent.isPending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <Languages className="h-[18px] w-[18px]" />
                  )}
                  <span className="max-w-full truncate">
                    {article.translated_content
                      ? t("article.translate.translated")
                      : t("article.translate.content")}
                  </span>
                </button>
              </div>
            </nav>}

            {/* Footer - Navigation */}
            <div
              className={cn(
                "hidden items-center justify-between border-t px-6 py-3",
                !isFocusMode && "md:flex",
              )}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevious}
                disabled={!hasPrevious()}
                className="h-auto gap-1.5 px-3 py-2 text-[13px] font-medium text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNext}
                disabled={!hasNext()}
                className="h-auto gap-1.5 px-3 py-2 text-[13px] font-medium text-muted-foreground"
              >
                {t("common.next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={lightboxImage !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-[min(96vw,1200px)] max-w-none border-0 bg-black/90 p-2 text-white shadow-2xl sm:p-4"
        >
          <DialogTitle className="sr-only">
            {t("article.imagePreview.title")}
          </DialogTitle>
          {lightboxImage && lightboxIndex !== null && (
            <div className="relative flex min-h-[50vh] items-center justify-center">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.alt || t("article.imagePreview.title")}
                className="max-h-[82vh] max-w-full object-contain"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLightboxIndex(null)}
                aria-label={t("article.imagePreview.close")}
                className="absolute top-2 right-2 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>

              {lightboxIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLightboxIndex((current) =>
                    current === null ? null : current - 1,
                  )}
                  aria-label={t("article.imagePreview.previous")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
              )}

              {lightboxIndex < lightboxImages.length - 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLightboxIndex((current) =>
                    current === null ? null : current + 1,
                  )}
                  aria-label={t("article.imagePreview.next")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              )}

              {lightboxImages.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white/90">
                  {lightboxIndex + 1} / {lightboxImages.length}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
