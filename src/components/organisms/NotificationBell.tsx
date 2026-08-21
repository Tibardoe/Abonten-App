"use client";

import { getUserNotifications } from "@/actions/getUserNotifications";
import { markAllNotificationsRead } from "@/actions/markAllNotificationsRead";
import { markNotificationRead } from "@/actions/markNotificationRead";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUnreadNotificationCount } from "@/hooks/useUnreadNotificationCount";
import type { NotificationType } from "@/types/notificationType";
import { getRelativeTime } from "@/utils/dateFormatter";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IoNotificationsOutline } from "react-icons/io5";

// Sitewide, not Places-specific (any signed-in user gets notifications
// regardless of whether they own a place), so this lives alongside
// Header.tsx/other sitewide nav pieces in components/organisms rather than
// under src/places -- unlike CreateMenu.tsx, which really is Places-scoped.
//
// Hand-rolled anchored popover, same convention as CreateMenu.tsx (this
// codebase has no shadcn Dialog/Popover in active use): click-outside via
// useClickOutside, Escape-to-close, absolute-positioned panel under the
// trigger button.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();
  const { data: unreadCount } = useUnreadNotificationCount();

  useClickOutside([containerRef], () => setOpen(false));

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const invalidateNotificationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    queryClient.invalidateQueries({
      queryKey: ["unread-notification-count", user?.id],
    });
  };

  const handleRowClick = async (notification: NotificationType) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
      invalidateNotificationQueries();
    }

    setOpen(false);

    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    invalidateNotificationQueries();
  };

  const hasUnread = !!unreadCount && unreadCount > 0;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex items-center hover:text-primary transition-colors"
      >
        <IoNotificationsOutline className="text-2xl" />
        {hasUnread && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-40 w-80 max-h-[28rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-popover">
            <span className="font-medium text-sm">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all as read
            </button>
          </div>

          <InfiniteList<NotificationType>
            queryKey={["notifications", user?.id]}
            initialPage={null}
            fetchPage={(cursor) => getUserNotifications({ cursor })}
            listClassName="flex flex-col"
            emptyState={
              <p className="text-muted-foreground text-sm py-6 text-center">
                No notifications yet.
              </p>
            }
            renderItem={(notification) => {
              const isUnread = !notification.read_at;

              return (
                <li
                  key={notification.id}
                  className="border-b border-border last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => handleRowClick(notification)}
                    className={`flex w-full items-start gap-2 px-4 py-3 text-left text-sm hover:bg-accent transition-colors ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Unread indicator dot -- shown alongside the tint above,
                    not as the sole signal, per this codebase's existing
                    "not color alone" rule for status indicators. */}
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        isUnread ? "bg-primary" : "bg-transparent"
                      }`}
                    />

                    <span className="flex-1 min-w-0">
                      <span
                        className={`block truncate ${isUnread ? "font-semibold" : "font-medium"}`}
                      >
                        {notification.title}
                      </span>

                      {notification.body && (
                        <span className="block text-muted-foreground text-xs mt-0.5 line-clamp-2">
                          {notification.body}
                        </span>
                      )}

                      <span className="block text-muted-foreground text-[11px] mt-1">
                        {getRelativeTime(notification.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
