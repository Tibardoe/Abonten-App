"use client";

import { useUnreadMessageCount } from "@/messaging/hooks/useUnreadMessageCount";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { IoChatbubbleEllipsesOutline } from "react-icons/io5";

// Desktop-header entry point for Messages, sitting next to the notification
// bell. Badges the unread-conversation count from the dedicated action.
export function MessagesNavLink() {
  const t = useTranslations("messaging");

  const { data: unread = 0 } = useUnreadMessageCount();

  return (
    <Link
      href="/messages"
      aria-label={
        unread > 0 ? t("messagesUnread", { unread: unread }) : t("messages")
      }
      className="relative flex items-center transition-colors hover:text-primary"
    >
      <IoChatbubbleEllipsesOutline className="text-2xl" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
