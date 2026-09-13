import { useState } from "react";
import {
  Circle,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Languages,
  Loader2,
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUrlState } from "@/hooks/use-url-state";
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
import { cn, extractSummary, formatDate, needsTranslation } from "@/lib/utils";
import { processArticleContent } from "@/lib/content";
import { getFaviconUrl } from "@/lib/api/favicon";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";

/**
 * Collapsible full-title section shown in the article body.
 * Collapsed by default — click to expand.
 * Styled distinctly from body text: muted background, border, smaller italic font.
 */
function FullTitleToggle({ title }: { title: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
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
          {expanded ? title : "查看完整标题"}
        </span>
      </button>
      {expanded && (
        <p className="mt-2 px-3 text-[13px] italic leading-relaxed text-muted-foreground">
          {title}
        </p>
      )}
    </div>
  );
}

export function ArticleDrawer() {
  const { t } = useI18n();
  const {
    selectedArticleId,
    setSelectedArticle,
    setSelectedFeed,
    selectedFeedId,
    selectedGroupId,
    articleFilter,
  } = useUrlState();
  const { getFeedById } = useFeedLookup();

  const { articles, isItemStarred, getBookmarkByItemId } =
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

  const storeArticle = selectedArticleId
    ? (articles.find((i) => i.id === selectedArticleId) ?? null)
    : null;

  const shouldFetchArticle = selectedArticleId !== null && selectedArticleId > 0;
  const { data: fetchedArticle } = useItem(
    selectedArticleId,
    shouldFetchArticle,
  );

  const article: Item | null = fetchedArticle ?? storeArticle ?? null;
  const canToggleRead = article !== null && article.id > 0;
  const feed = article ? getFeedById(article.feed_id) : null;
  const bookmark = article ? getBookmarkByItemId(article.id) : null;
  const starred = article ? isItemStarred(article.id) : false;
  const safeArticleLink = article ? toSafeExternalUrl(article.link) : null;

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
      onToggleRead: () => {
        void handleToggleRead();
      },
      onToggleStar: () => {
        void handleToggleStar();
      },
      onOpenOriginal: handleOpenOriginal,
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
  const mobileActionClass =
    "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none active:bg-muted disabled:text-muted-foreground";

  return (
    <Sheet open={selectedArticleId !== null} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-[max(840px,60vw)] p-0"
        showCloseButton={false}
      >
        {article && (
          <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="flex min-h-14 items-center justify-between border-b px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 md:px-6 md:py-3">
              <SheetTitle className="min-w-0 flex-1 truncate pr-3 text-sm font-semibold md:sr-only">
                {article.translated_title || article.title}
              </SheetTitle>

              <div className="hidden flex-wrap items-center gap-2 md:flex">
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
                <Button
                  nativeButton={false}
                  render={
                    safeArticleLink ? (
                      <a
                        href={safeArticleLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    ) : undefined
                  }
                  variant="outline"
                  size="sm"
                  onClick={safeArticleLink ? undefined : handleOpenOriginal}
                  disabled={!safeArticleLink}
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("article.action.original")}
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
            <ScrollArea className="min-h-0 flex-1">
              <article className="min-w-0 px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-12 md:py-8">
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
                    className="typeset typeset-article min-w-0 max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: processArticleContent(
                        article.extracted_content || article.content,
                        safeArticleLink ?? undefined,
                      ),
                    }}
                  />
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

            <nav
              aria-label={t("article.mobile.actions")}
              className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 flex justify-center px-2 md:hidden"
            >
              <div className="pointer-events-auto grid w-full max-w-sm grid-cols-6 overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-1 shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/80 dark:ring-white/5">
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
            </nav>

            {/* Footer - Navigation */}
            <div className="hidden items-center justify-between border-t px-6 py-3 md:flex">
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
  );
}
