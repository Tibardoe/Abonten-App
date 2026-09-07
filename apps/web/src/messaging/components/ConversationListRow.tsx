"use client";

import { cn } from "@/components/lib/utils";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type {
  ConversationListItem,
  ConversationType,
} from "@abonten/types/messagingType";
import {
  BellOff,
  Calendar,
  LifeBuoy,
  MessageSquare,
  Store,
} from "lucide-react";
import Link from "next/link";

const TYPE_ICON: Record<ConversationType, typeof Calendar> = {
  event: Calendar,
  place: Store,
  support: LifeBuoy,
  direct: MessageSquare,
};

export function ConversationListRow({
  item,
  currentUserId,
  active,
}: {
  item: ConversationListItem;
  currentUserId: string | undefined;
  active: boolean;
}) {
  const Icon = TYPE_ICON[item.type];
  const unread = item.unread_count > 0;
  const lastFromMe =
    !!currentUserId && item.last_message_sender_id === currentUserId;
  const preview = !item.last_message_preview
    ? "No messages yet"
    : lastFromMe
      ? `You: ${item.last_message_preview}`
      : item.last_message_preview;

  return (
    <Link
      href={`/messages/${item.conversation_id}`}
      className={cn(
        "flex items-center gap-3 border-b px-3 py-3 transition hover:bg-accent/60",
        active && "bg-accent",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex-1 truncate text-sm",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {item.title ?? "Conversation"}
          </span>
          {item.last_message_at ? (
            <span
              className={cn(
                "shrink-0 text-[11px]",
                unread ? "text-primary" : "text-muted-foreground",
              )}
            >
              {getRelativeTime(item.last_message_at)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "flex-1 truncate text-xs",
              unread ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {preview}
          </span>
          {item.muted ? (
            <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          {unread ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {item.unread_count > 99 ? "99+" : item.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
