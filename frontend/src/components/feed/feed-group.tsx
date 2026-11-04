import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import { FeedItem } from "./feed-item";
import type { Feed } from "@/lib/api";
import { FeedReadContextMenu } from "./feed-read-context-menu";

interface FeedGroupProps {
  groupId: number;
  name: string;
  feeds: Feed[];
}

export function FeedGroup({ groupId, name, feeds }: FeedGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { selectedGroupId, setSelectedGroup } = useUrlState();
  const isSelected = selectedGroupId === groupId;

  const unreadCount = feeds.reduce(
    (sum, feed) => sum + (feed.unread_count || 0),
    0,
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full min-w-0"
    >
      <FeedReadContextMenu
        name={name}
        unreadCount={unreadCount}
        scope={{ group_id: groupId }}
      >
        <div
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-[background-color,transform] duration-150 active:scale-[0.99]",
            isSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50",
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className="-m-1 shrink-0 rounded-md p-1 transition-[background-color,transform] hover:bg-foreground/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => setSelectedGroup(groupId)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          >
            <span className="block min-w-0 flex-1 truncate">{name}</span>
            {unreadCount > 0 && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </FeedReadContextMenu>
      <CollapsibleContent>
        <div className="w-full min-w-0 pl-5">
          {feeds.map((feed) => (
            <FeedItem key={feed.id} feed={feed} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
