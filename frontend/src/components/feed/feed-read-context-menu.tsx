import type { ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useI18n } from "@/lib/i18n";
import type { MarkAllItemsReadRequest } from "@/lib/api";
import { useMarkAllItemsRead } from "@/queries/items";

interface FeedReadContextMenuProps {
  children: ReactNode;
  name: string;
  unreadCount: number;
  scope: MarkAllItemsReadRequest;
}

export function FeedReadContextMenu({
  children,
  name,
  unreadCount,
  scope,
}: FeedReadContextMenuProps) {
  const { t } = useI18n();
  const markAllItemsRead = useMarkAllItemsRead();

  const handleMarkAllAsRead = async () => {
    try {
      await markAllItemsRead.mutateAsync(scope);
      toast.success(t("feed.toast.markAllRead", { name }));
    } catch (error) {
      console.error("Failed to mark all items as read:", error);
      toast.error(t("feed.toast.markAllReadFailed"));
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full min-w-0">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={unreadCount === 0 || markAllItemsRead.isPending}
          onClick={() => void handleMarkAllAsRead()}
        >
          <CheckCheck />
          {t("feed.action.markAllRead")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
