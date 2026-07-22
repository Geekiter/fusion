import {
  Circle,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Languages,
  Loader2,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUrlState } from "@/hooks/use-url-state";
import type { Item } from "@/lib/api";
import {
  useItem,
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
import { extractSummary, formatDate, needsTranslation } from "@/lib/utils";
import { processArticleContent } from "@/lib/content";
import { getFaviconUrl } from "@/lib/api/favicon";
import { FeedFavicon } from "@/components/feed/feed-favicon";
import { toSafeExternalUrl } from "@/lib/safe-url";

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
      const translated = await translateContent.mutateAsync(article.id);
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
      const summarized = await summarizeItem.mutateAsync(article.id);
      if (summarized.ai_summary) {
        toast.success(t("article.summary.success"));
      }
    } catch (error) {
      console.error("Failed to summarize article:", error);
      toast.error(t("article.summary.failed"));
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

  return (
    <Sheet open={selectedArticleId !== null} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-[max(840px,60vw)] p-0"
        showCloseButton={false}
      >
        {article && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleRead}
                  disabled={!canToggleRead}
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
                  disabled={
                    article.id <= 0 ||
                    Boolean(article.ai_summary) ||
                    summarizeItem.isPending
                  }
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
                  className="h-auto gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                >
                  <Star
                    className={`h-4 w-4 ${starred ? "fill-current text-amber-500" : ""}`}
                  />
                  {starred ? t("article.action.unstar") : t("article.action.star")}
                </Button>
                <Button
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
                  disabled={
                    article.id <= 0 ||
                    Boolean(article.translated_content) ||
                    translateContent.isPending ||
                    !needsTranslation(extractSummary(article.content, 500))
                  }
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

              <SheetTitle className="sr-only">{article.translated_title || article.title}</SheetTitle>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedArticle(null)}
                aria-label={t("common.cancel")}
              >
                <X className="h-[18px] w-[18px] text-muted-foreground" />
              </Button>
            </div>

            {/* Content */}
            <ScrollArea className="min-h-0 flex-1">
              <article className="min-w-0 px-5 py-6 sm:px-12 sm:py-8">
                <div className="space-y-3">
                  <h1 className="text-[28px] font-bold leading-[1.3]">
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
                  <div
                    className="typeset typeset-article min-w-0 max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: processArticleContent(
                        article.content,
                        safeArticleLink ?? undefined,
                      ),
                    }}
                  />
                </section>
              </article>
            </ScrollArea>

            {/* Footer - Navigation */}
            <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
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
