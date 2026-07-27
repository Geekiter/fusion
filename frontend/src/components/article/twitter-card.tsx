import { Circle, CircleCheck, Star, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn, formatRelativeTime, extractSummary } from "@/lib/utils";
import type { Item } from "@/lib/api";
import { parseTweet } from "@/lib/twitter";
import { toSafeExternalUrl } from "@/lib/safe-url";

interface TwitterCardProps {
  article: Item;
  selectedArticleId: number | null;
  onSelectArticle: (articleId: number | null) => void;
  onToggleRead: (article: Item) => Promise<void>;
  onToggleStar: (article: Item) => Promise<void>;
  isStarred: boolean;
}

/**
 * Extract @handle from a Nitter status URL.
 * URLs look like: http://nitter.net/username/status/123456
 * or http://172.17.0.1:8082/username/status/123456
 */
function extractHandle(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/\/([^/]+)\/status\//);
  return match ? `@${match[1]}` : null;
}

export function TwitterCard({
  article,
  selectedArticleId,
  onSelectArticle,
  onToggleRead,
  onToggleStar,
  isStarred,
}: TwitterCardProps) {
  const { t } = useI18n();

  const tweet = parseTweet(article.content, article.link);
  const isSelected = selectedArticleId === article.id;
  const safeLink = toSafeExternalUrl(article.link);
  const handle = extractHandle(article.link);

  if (!tweet) return null;

  const handleToggleRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onToggleRead(article);
    } catch (error) {
      console.error("Failed to toggle read status:", error);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onToggleStar(article);
    } catch (error) {
      console.error("Failed to toggle star status:", error);
    }
  };

  const imgCount = tweet.images.length;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelectArticle(article.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectArticle(article.id);
        }
      }}
      className={cn(
        "group relative cursor-pointer border-b border-border/60 bg-card transition-colors duration-150 hover:bg-accent/40",
        isSelected && "bg-accent",
        !article.unread && "opacity-50",
      )}
    >
      {/* Hover actions */}
      <div className="absolute right-3 top-3 z-20 hidden items-center gap-0.5 rounded-lg bg-background/90 p-0.5 shadow-sm ring-1 ring-border/50 backdrop-blur-md group-hover:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleRead}
          className="h-7 w-7 rounded-md"
          aria-label={
            article.unread
              ? t("article.action.markRead")
              : t("article.action.markUnread")
          }
        >
          {article.unread ? (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <CircleCheck className="h-3.5 w-3.5 text-primary" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleStar}
          className="h-7 w-7 rounded-md"
          aria-label={
            isStarred ? t("article.action.unstar") : t("article.action.star")
          }
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              isStarred
                ? "fill-amber-500 text-amber-500"
                : "text-muted-foreground",
            )}
          />
        </Button>
        {safeLink && (
          <Button
            nativeButton={false}
            render={
              <a
                href={safeLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              />
            }
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 rounded-md"
            aria-label={t("article.action.openInBrowser")}
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>

      <div className="flex gap-3 px-4 py-3">
        {/* Avatar placeholder with first letter */}
        <div className="shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {handle ? handle.charAt(1).toUpperCase() : "T"}
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header: handle + time */}
          <div className="mb-1 flex items-center gap-1.5 text-[13px]">
            <span className="font-semibold text-foreground">
              {handle ? handle.slice(1) : "Twitter"}
            </span>
            {handle && (
              <span className="text-muted-foreground">{handle}</span>
            )}
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/70">
              {formatRelativeTime(article.pub_date)}
            </span>
          </div>

          {/* Tweet text — use translated summary if available, otherwise original summary */}
          {(() => {
            const displayText = article.translated_summary || extractSummary(article.content, 500);
            return displayText ? (
              <p className="mb-2 line-clamp-6 whitespace-pre-wrap break-words text-[15px] leading-[1.5] text-foreground">
                {displayText}
              </p>
            ) : null;
          })()}

          {/* Images — grid layout matching Twitter's design */}
          {imgCount > 0 && (
            <div
              className={cn(
                "mb-2 overflow-hidden rounded-xl border border-border/40",
                imgCount === 1 && "flex max-h-48",
                imgCount === 2 && "grid grid-cols-2 max-h-48",
                imgCount === 3 && "grid grid-cols-2 max-h-64",
                imgCount >= 4 && "grid grid-cols-2 grid-rows-2 max-h-64",
              )}
              style={{ gap: "2px" }}
            >
              {tweet.images.slice(0, 4).map((img, i) => (
                <div
                  key={i}
                  className={cn(
                    "relative overflow-hidden bg-muted",
                    imgCount === 3 && i === 0 && "row-span-2",
                  )}
                  style={
                    imgCount === 1
                      ? { maxHeight: "192px" }
                      : imgCount === 2
                        ? { aspectRatio: "16 / 9" }
                        : imgCount === 3 && i === 0
                          ? { aspectRatio: "1 / 1" }
                          : { aspectRatio: "1 / 1" }
                  }
                >
                  <img
                    src={img.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-full w-full object-cover",
                      imgCount === 1
                        ? "max-h-48 object-contain"
                        : "transition-transform duration-300 group-hover:scale-105",
                    )}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Quoted tweets — styled like Twitter's quoted tweets */}
          {tweet.quotes.map((quote, i) => (
            <blockquote
              key={i}
              className="mb-2 overflow-hidden rounded-xl border border-border/50 transition-colors hover:bg-muted/30"
            >
              <div className="p-3">
                {quote.author && (
                  <p className="mb-0.5 line-clamp-1 text-[13px] font-semibold text-foreground">
                    {quote.author}
                  </p>
                )}
                {quote.text && (
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-[1.4] text-muted-foreground">
                    {quote.text}
                  </p>
                )}
              </div>
              {quote.images.length > 0 && (
                <div
                  className={cn(
                    "grid max-h-32 overflow-hidden border-t border-border/40",
                    quote.images.length === 1 ? "grid-cols-1" : "grid-cols-2",
                  )}
                  style={{ gap: "2px" }}
                >
                  {quote.images.slice(0, 4).map((img, j) => (
                    <div
                      key={j}
                      className="overflow-hidden bg-muted"
                    >
                      <img
                        src={img.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </blockquote>
          ))}
        </div>
      </div>
    </article>
  );
}
