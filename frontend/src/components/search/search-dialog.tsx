import { useEffect, useState } from "react";
import {
  Clock3,
  Bookmark,
  BookmarkCheck,
  FileText,
  Keyboard,
  Loader2,
  Search,
  Settings,
  X,
} from "lucide-react";
import { getFaviconUrl } from "@/lib/api/favicon";
import { searchAPI } from "@/lib/api";
import type { SearchFeed, SearchItem } from "@/lib/api/types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";
import { useFeedLookup } from "@/queries/feeds";
import { useUrlState } from "@/hooks/use-url-state";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { FeedFavicon } from "@/components/feed/feed-favicon";

const SEARCH_HISTORY_KEY = "fusion-search-history";
const SAVED_SEARCHES_KEY = "fusion-saved-searches";
const MAX_SEARCH_HISTORY = 6;
const MAX_SAVED_SEARCHES = 8;

function readSearchHistory(): string[] {
  try {
    const value = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function readSavedSearches(): string[] {
  try {
    const value = window.localStorage.getItem(SAVED_SEARCHES_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function SearchDialog() {
  const { t } = useI18n();
  const { isSearchOpen, setSearchOpen, setEditFeedOpen, setShortcutsOpen } =
    useUIStore();
  const { getFeedById } = useFeedLookup();
  const { setSelectedFeed, setSelectedArticle } = useUrlState();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [feeds, setFeeds] = useState<SearchFeed[]>([]);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);

  useEffect(() => {
    setSearchHistory(readSearchHistory());
    setSavedSearches(readSavedSearches());
  }, []);

  const rememberSearch = (value: string) => {
    const normalized = value.trim();
    if (normalized.length < 2) return;

    setSearchHistory((current) => {
      const next = [
        normalized,
        ...current.filter(
          (item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
        ),
      ].slice(0, MAX_SEARCH_HISTORY);
      try {
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Browsers may disable local storage; search itself should still work.
      }
      return next;
    });
  };

  const selectSearchHistory = (value: string) => {
    setQuery(value);
    setDebouncedQuery(value);
    setLoading(true);
  };

  const removeSearchHistory = (value: string) => {
    setSearchHistory((current) => {
      const next = current.filter((item) => item !== value);
      try {
        if (next.length === 0) {
          window.localStorage.removeItem(SEARCH_HISTORY_KEY);
        } else {
          window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        }
      } catch {
        // Ignore storage failures; the in-memory list is still updated.
      }
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    try {
      window.localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {
      // Ignore storage failures; the in-memory list is still cleared.
    }
  };

  const isSavedSearch = (value: string) =>
    savedSearches.some(
      (item) => item.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );

  const toggleSavedSearch = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;

    setSavedSearches((current) => {
      const existing = current.some(
        (item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      );
      const next = existing
        ? current.filter(
            (item) =>
              item.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
          )
        : [normalized, ...current].slice(0, MAX_SAVED_SEARCHES);
      try {
        if (next.length === 0) {
          window.localStorage.removeItem(SAVED_SEARCHES_KEY);
        } else {
          window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
        }
      } catch {
        // Ignore storage failures; the in-memory list is still updated.
      }
      return next;
    });
  };

  const removeSavedSearch = (value: string) => {
    setSavedSearches((current) => {
      const next = current.filter((item) => item !== value);
      try {
        if (next.length === 0) {
          window.localStorage.removeItem(SAVED_SEARCHES_KEY);
        } else {
          window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
        }
      } catch {
        // Ignore storage failures; the in-memory list is still updated.
      }
      return next;
    });
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(Boolean(query));
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch search results from backend
  useEffect(() => {
    if (!debouncedQuery) {
      return;
    }

    let cancelled = false;

    searchAPI
      .search(debouncedQuery)
      .then((res) => {
        if (cancelled) return;
        rememberSearch(debouncedQuery);
        setFeeds(res.data?.feeds ?? []);
        setItems(res.data?.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        rememberSearch(debouncedQuery);
        setFeeds([]);
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const handleSelectFeed = (feedId: number) => {
    setSelectedFeed(feedId);
    setSearchOpen(false);
  };

  const handleEditFeed = (e: React.MouseEvent, feedId: number) => {
    e.stopPropagation();
    const fullFeed = getFeedById(feedId);
    if (fullFeed) {
      setSearchOpen(false);
      setEditFeedOpen(true, fullFeed);
    }
  };

  const handleSelectArticle = (articleId: number) => {
    setSelectedArticle(articleId);
    setSearchOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setFeeds([]);
      setItems([]);
      setLoading(false);
    }
    setSearchOpen(open);
  };

  const handleOpenShortcuts = () => {
    setSearchOpen(false);
    setShortcutsOpen(true);
  };

  return (
    <Dialog open={isSearchOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("search.title")}</DialogTitle>
          <DialogDescription>{t("search.description")}</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder={t("search.placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          {debouncedQuery && !loading && (
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">
                {t("search.queryLabel")}: {debouncedQuery}
              </span>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => toggleSavedSearch(debouncedQuery)}
              >
                {isSavedSearch(debouncedQuery) ? (
                  <BookmarkCheck className="size-3.5 text-primary" />
                ) : (
                  <Bookmark className="size-3.5" />
                )}
                {isSavedSearch(debouncedQuery)
                  ? t("search.saved")
                  : t("search.save")}
              </button>
            </div>
          )}
          <CommandList>
            {loading && debouncedQuery && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading &&
              debouncedQuery &&
              feeds.length === 0 &&
              items.length === 0 && (
                <CommandEmpty>{t("search.noResults")}</CommandEmpty>
              )}

            {feeds.length > 0 && (
              <CommandGroup heading={t("search.group.feeds")}>
                {feeds.map((feed) => (
                  <CommandItem
                    key={`feed-${feed.id}`}
                    value={`feed-${feed.id}`}
                    onSelect={() => handleSelectFeed(feed.id)}
                    className="group gap-2"
                  >
                    <FeedFavicon
                      src={getFaviconUrl(feed.link, feed.site_url)}
                      className="h-4 w-4 rounded-sm"
                    />
                    <span className="flex-1 truncate">{feed.name}</span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      onClick={(e) => handleEditFeed(e, feed.id)}
                      aria-label={t("feed.edit.title")}
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {feeds.length > 0 && items.length > 0 && <CommandSeparator />}

            {items.length > 0 && (
              <CommandGroup heading={t("search.group.articles")}>
                {items.map((article) => {
                  const feed = getFeedById(article.feed_id);
                  return (
                    <CommandItem
                      key={`article-${article.id}`}
                      value={`article-${article.id}`}
                      onSelect={() => handleSelectArticle(article.id)}
                      className="flex-col items-start gap-1"
                    >
                      <div className="flex w-full items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{article.title}</span>
                      </div>
                      <div className="flex w-full items-center gap-2 pl-6 text-xs text-muted-foreground">
                        <span>{feed?.name ?? t("search.unknownFeed")}</span>
                        <span>·</span>
                        <span>{formatDate(article.pub_date)}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!debouncedQuery && !loading && (
              <>
                <CommandGroup heading={t("search.group.quickActions")}>
                  <CommandItem className="gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span>{t("search.quickActionHint")}</span>
                  </CommandItem>
                  <CommandItem
                    className="justify-between gap-2"
                    onSelect={handleOpenShortcuts}
                  >
                    <div className="flex items-center gap-2">
                      <Keyboard className="h-4 w-4 text-muted-foreground" />
                      <span>{t("shortcuts.title")}</span>
                    </div>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                      ?
                    </kbd>
                  </CommandItem>
                </CommandGroup>
                {savedSearches.length > 0 && (
                  <CommandGroup heading={t("search.group.saved")}>
                    {savedSearches.map((term) => (
                      <CommandItem
                        key={term}
                        value={`saved-${term}`}
                        className="group/saved justify-between gap-2"
                        onSelect={() => selectSearchHistory(term)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <BookmarkCheck className="h-4 w-4 text-primary/70" />
                          <span className="truncate">{term}</span>
                        </div>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover/saved:opacity-100 focus:opacity-100"
                          aria-label={`${t("search.removeSaved")}: ${term}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSavedSearch(term);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {searchHistory.length > 0 && (
                  <CommandGroup
                    heading={
                      <div className="flex items-center justify-between pr-2">
                        <span>{t("search.group.recent")}</span>
                        <button
                          type="button"
                          className="text-[11px] font-normal text-muted-foreground transition-colors hover:text-foreground"
                          onClick={clearSearchHistory}
                        >
                          {t("search.clearHistory")}
                        </button>
                      </div>
                    }
                  >
                    {searchHistory.map((term) => (
                      <CommandItem
                        key={term}
                        value={`recent-${term}`}
                        className="group/recent justify-between gap-2"
                        onSelect={() => selectSearchHistory(term)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Clock3 className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{term}</span>
                        </div>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover/recent:opacity-100 focus:opacity-100"
                          aria-label={`${t("search.removeHistory")}: ${term}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSearchHistory(term);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
