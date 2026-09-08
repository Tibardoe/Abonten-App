"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMarkConversationRead,
  useMarkConversationUnread,
  useSetConversationState,
} from "@/messaging/hooks/useMessagingActions";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type {
  ConversationListItem,
  ConversationType,
} from "@abonten/types/messagingType";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Calendar,
  Circle,
  LifeBuoy,
  MailOpen,
  MapPin,
  MessageSquare,
  MoreVertical,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TYPE_ICON: Record<ConversationType, typeof Calendar> = {
  event: Calendar,
  place: Store,
  support: LifeBuoy,
  direct: MessageSquare,
};
const CONTEXT_ICON: Record<ConversationType, typeof Calendar> = {
  event: Calendar,
  place: MapPin,
  support: LifeBuoy,
  direct: MessageSquare,
};

const ANON_ID = "AnonymousProfile_rn6qez";
const ANON_VERSION = "1743533914";

export function ConversationListRow({
  item,
  currentUserId,
  active,
  archivedView = false,
}: {
  item: ConversationListItem;
  currentUserId: string | undefined;
  active: boolean;
  archivedView?: boolean;
}) {
  const router = useRouter();
  const setState = useSetConversationState();
  const markRead = useMarkConversationRead();
  const markUnread = useMarkConversationUnread();
  const [menuOpen, setMenuOpen] = useState(false);

  const Icon = TYPE_ICON[item.type];
  const ContextIcon = CONTEXT_ICON[item.type];
  const unread = item.unread_count > 0;
  const lastFromMe =
    !!currentUserId && item.last_message_sender_id === currentUserId;
  const identity =
    item.other_display_name ||
    item.subject_title ||
    item.title ||
    "Conversation";
  const context =
    (item.type === "event" || item.type === "place") &&
    item.subject_title &&
    item.subject_title !== identity
      ? item.subject_title
      : null;
  const preview = !item.last_message_preview
    ? "No messages yet"
    : lastFromMe
      ? `You: ${item.last_message_preview}`
      : item.last_message_preview;

  const showAvatar = item.type !== "support" && !!item.other_user_id;
  const avatarSrc = buildCloudinaryUrl(
    item.other_avatar_public_id || ANON_ID,
    item.other_avatar_public_id
      ? (item.other_avatar_version ?? "")
      : ANON_VERSION,
    { width: 44, height: 44 },
  );

  const toggleRead = () =>
    unread
      ? markRead.mutate({ conversationId: item.conversation_id })
      : markUnread.mutate(item.conversation_id);

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      className={cn(
        "group relative flex items-center gap-3 border-b pr-2 transition hover:bg-accent/60",
        active && "bg-accent",
      )}
    >
      <Link
        href={`/messages/${item.conversation_id}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3"
      >
        {showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex-1 truncate text-sm",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {identity}
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
          {context ? (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ContextIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{context}</span>
            </div>
          ) : null}
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "flex-1 truncate text-xs",
                unread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
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

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label="Conversation actions"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => toggleRead()}>
            {unread ? (
              <MailOpen className="mr-2 h-4 w-4" />
            ) : (
              <Circle className="mr-2 h-4 w-4" />
            )}
            {unread ? "Mark as read" : "Mark as unread"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              setState.mutate({
                conversationId: item.conversation_id,
                muted: !item.muted,
              })
            }
          >
            {item.muted ? (
              <Bell className="mr-2 h-4 w-4" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            {item.muted ? "Unmute" : "Mute"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setState.mutate({
                conversationId: item.conversation_id,
                archived: !item.archived,
              });
              if (active) router.push("/messages");
            }}
          >
            {archivedView || item.archived ? (
              <ArchiveRestore className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            {archivedView || item.archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
