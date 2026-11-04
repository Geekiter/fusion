import { CalendarDays, Inbox, Layers, PanelLeftClose, PanelLeftOpen, Search, Settings, Rss, Star } from "lucide-react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { FeedList } from "@/components/feed/feed-list";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { isArticleFilter } from "@/lib/article-filter";
import { useUrlState } from "@/hooks/use-url-state";
import { useBookmarkLookup } from "@/queries/bookmarks";
import { useUnreadCounts } from "@/queries/feeds";
import { Button } from "@/components/ui/button";

function SidebarRail() {
  const { t } = useI18n();
  const { setSearchOpen, setSettingsOpen } = useUIStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { articleFilter, selectedFeedId, selectedGroupId, selectTopLevelFilter } =
    useUrlState();
  const { getTotalUnreadCount } = useUnreadCounts();
  const { total: starredCount } = useBookmarkLookup();
  const isOnHomePage = isArticleFilter(pathname.split("/").filter(Boolean)[0] ?? "");
  const isTopLevelSelected = (filter: "all" | "unread" | "today" | "starred") =>
    isOnHomePage &&
    selectedFeedId === null &&
    selectedGroupId === null &&
    articleFilter === filter;
  const items = [
    {
      value: "unread" as const,
      label: t("article.filter.unread"),
      count: getTotalUnreadCount(),
      icon: Inbox,
      onClick: () => selectTopLevelFilter("unread"),
    },
    {
      value: "starred" as const,
      label: t("article.filter.starred"),
      count: starredCount,
      icon: Star,
      onClick: () => selectTopLevelFilter("starred"),
    },
    {
      value: "today" as const,
      label: t("article.filter.today"),
      count: 0,
      icon: CalendarDays,
      onClick: () => selectTopLevelFilter("today"),
    },
    {
      value: "all" as const,
      label: t("article.filter.all"),
      count: getTotalUnreadCount(),
      icon: Layers,
      onClick: () => selectTopLevelFilter("all"),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3">
      <button
        type="button"
        className="relative flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] hover:bg-accent hover:text-foreground active:scale-95"
        onClick={() => setSearchOpen(true)}
        aria-label={t("sidebar.search")}
        title={t("sidebar.search")}
      >
        <Search className="size-4" />
      </button>
      <div className="my-1 h-px w-8 bg-border/70" />
      {items.map(({ value, label, count, icon: Icon, onClick }) => (
        <button
          key={value}
          type="button"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] hover:bg-accent hover:text-foreground active:scale-95",
            isTopLevelSelected(value) && "bg-accent text-accent-foreground",
          )}
          onClick={onClick}
          aria-label={label}
          title={label}
        >
          <Icon className="size-4" />
          {count > 0 && (
            <span className="absolute right-1 top-1 min-w-3.5 rounded-full bg-primary px-1 text-center text-[9px] leading-3.5 text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      ))}
      <div className="mt-auto flex w-full flex-col items-center gap-1 border-t border-border/70 pt-2">
        <button
          type="button"
          className={cn(
            "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] hover:bg-accent hover:text-foreground active:scale-95",
            pathname === "/feeds" && "bg-accent text-accent-foreground",
          )}
          onClick={() => navigate({ to: "/feeds" })}
          aria-label={t("sidebar.manageFeeds")}
          title={t("sidebar.manageFeeds")}
        >
          <Rss className="size-4" />
        </button>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] hover:bg-accent hover:text-foreground active:scale-95"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("sidebar.settings")}
          title={t("sidebar.settings")}
        >
          <Settings className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const { setSearchOpen, setSettingsOpen, isSidebarCollapsed, setSidebarCollapsed } =
    useUIStore();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isFeedsPage = pathname === "/feeds";
  const isCollapsed = !isMobile && isSidebarCollapsed;

  return (
    <aside
      className={cn(
        "sidebar-typography flex h-full flex-none flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
        isCollapsed ? "w-16" : "w-75",
      )}
      data-sidebar-collapsed={isCollapsed}
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b transition-[padding,gap] duration-300",
          isCollapsed ? "justify-center px-2" : "gap-2 px-4",
        )}
      >
        <img
          src="/icon-96.png"
          alt={t("common.fusionLogo")}
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-md"
        />
        {!isCollapsed && <span className="text-base font-semibold">Fusion</span>}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "ml-auto text-muted-foreground",
              isCollapsed && "absolute right-1 top-1/2 -translate-y-1/2 bg-sidebar/90",
            )}
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            aria-label={t(isCollapsed ? "sidebar.expand" : "sidebar.collapse")}
            title={t(isCollapsed ? "sidebar.expand" : "sidebar.collapse")}
          >
            {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
      </div>

      {isCollapsed ? (
        <SidebarRail />
      ) : (
        <>
          {/* Search button */}
          <div className="px-2 pt-3">
        <button
          className="flex w-full items-center justify-between rounded-md bg-muted px-3 py-2 text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => setSearchOpen(true)}
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="text-sm">{t("sidebar.search")}</span>
          </div>
          <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-medium">
            Cmd+K / ?
          </kbd>
        </button>
          </div>

          {/* Feed list */}
          <FeedList />

          {/* Footer */}
          <div className="p-2">
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            isFeedsPage
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50",
          )}
          onClick={() => navigate({ to: "/feeds" })}
        >
          <Rss className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{t("sidebar.manageFeeds")}</span>
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{t("sidebar.settings")}</span>
        </button>
          </div>
        </>
      )}
    </aside>
  );
}
