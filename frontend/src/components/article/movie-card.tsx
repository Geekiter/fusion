import { Circle, CircleCheck, Star, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";
import {
  parseDoubanMovie,
  ratingBgColor,
} from "@/lib/douban";
import { toSafeExternalUrl } from "@/lib/safe-url";

interface MovieCardProps {
  article: Item;
  selectedArticleId: number | null;
  onSelectArticle: (articleId: number | null) => void;
  onToggleRead: (article: Item) => Promise<void>;
  onToggleStar: (article: Item) => Promise<void>;
  isStarred: boolean;
}

export function MovieCard({
  article,
  selectedArticleId,
  onSelectArticle,
  onToggleRead,
  onToggleStar,
  isStarred,
}: MovieCardProps) {
  const { t } = useI18n();

  const movie = parseDoubanMovie(article.content, article.title, article.link);
  const isSelected = selectedArticleId === article.id;
  const safeLink = toSafeExternalUrl(article.link);

  if (!movie) return null;

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

  return (
    <div
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
        "group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all hover:shadow-lg hover:ring-1 hover:ring-primary/20",
        isSelected && "ring-2 ring-primary",
        article.unread ? "" : "opacity-70",
      )}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            {t("common.unknown")}
          </div>
        )}

        {/* Rating badge */}
        {movie.rating !== null && (
          <div
            className={cn(
              "absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold text-white shadow-md backdrop-blur-sm",
              ratingBgColor(movie.rating),
            )}
          >
            <Star className="h-3 w-3 fill-white" />
            {movie.rating.toFixed(1)}
          </div>
        )}

        {/* Unread dot */}
        {article.unread && (
          <div className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-primary shadow-md" />
        )}

        {/* Hover actions */}
        <div className="absolute bottom-2 right-2 hidden items-center gap-1 group-hover:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleToggleRead}
            className={cn(
              "h-7 w-7 rounded-full backdrop-blur-md",
              article.unread ? "bg-black/50 text-white" : "bg-primary/20 text-primary",
            )}
            aria-label={
              article.unread
                ? t("article.action.markRead")
                : t("article.action.markUnread")
            }
          >
            {article.unread ? (
              <Circle className="h-3.5 w-3.5" />
            ) : (
              <CircleCheck className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleToggleStar}
            className={cn(
              "h-7 w-7 rounded-full backdrop-blur-md",
              isStarred
                ? "bg-amber-500/80 text-white"
                : "bg-black/50 text-white",
            )}
            aria-label={
              isStarred ? t("article.action.unstar") : t("article.action.star")
            }
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                isStarred && "fill-current",
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
              className="h-7 w-7 rounded-full bg-black/50 text-white backdrop-blur-md"
              aria-label={t("article.action.openInBrowser")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1 p-2.5">
        <h3
          className={cn(
            "line-clamp-1 text-sm font-semibold leading-tight",
            article.unread ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {movie.title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {movie.year && <span>{movie.year}</span>}
          {movie.genres && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="line-clamp-1">{movie.genres}</span>
            </>
          )}
        </div>
        {movie.director && (
          <p className="line-clamp-1 text-xs text-muted-foreground/70">
            {movie.director}
          </p>
        )}
        {movie.cast && (
          <p className="line-clamp-1 text-xs text-muted-foreground/70">
            {movie.cast}
          </p>
        )}
      </div>
    </div>
  );
}
