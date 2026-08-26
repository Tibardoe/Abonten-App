"use client";

import { getUserNotifications } from "@/actions/getUserNotifications";
import { markAllNotificationsRead } from "@/actions/markAllNotificationsRead";
import { markNotificationRead } from "@/actions/markNotificationRead";
import InfiniteList from "@/components/organisms/InfiniteList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import { useUnreadNotificationCount } from "@/hooks/useUnreadNotificationCount";
import type { NotificationType } from "@/types/notificationType";
import type { PaginatedResult } from "@/types/pagination";
import { getRelativeTime } from "@/utils/dateFormatter";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IoNotificationsOutline } from "react-icons/io5";
import NotificationRowSkeleton from "../molecules/NotificationRowSkeleton";

// Sitewide, not Places-specific (any signed-in user gets notifications
// regardless of whether they own a place), so this lives alongside
// Header.tsx/other sitewide nav pieces in components/organisms rather than
// under src/places -- unlike CreateMenu.tsx, which really is Places-scoped.
//
// Built on shadcn/Radix DropdownMenu for real focus trapping/Escape/outside-
// click handling; the panel content (InfiniteList, mutations) is plain
// interactive markup rather than DropdownMenuItems, since it doesn't want
// Radix's "select closes the menu" behavior -- open/close stays under this
// component's own control (see setOpen calls below).
type NotificationBellProps = {
  // Which edge the dropdown panel hangs from. "right" (default) matches the
  // desktop mount at the far right of the nav; "left" is for the mobile
  // mount next to the hamburger button at the far left of the header --
  // right-aligning there would push the panel off-screen.
  align?: "left" | "right";
};

export default function NotificationBell({
  align = "right",
}: NotificationBellProps = {}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  // Guards against a double-click/double-tap firing markNotificationRead
  // twice for the same row before the optimistic cache update re-renders
  // the row with its new read_at value.
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();
  const { data: unreadCount } = useUnreadNotificationCount();

  const invalidateNotificationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    queryClient.invalidateQueries({
      queryKey: ["unread-notification-count", user?.id],
    });
  };

  type NotificationsCache = InfiniteData<PaginatedResult<NotificationType>>;

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),

    onMutate: async (notificationId) => {
      setPendingReadIds((prev) => new Set(prev).add(notificationId));

      await queryClient.cancelQueries({
        queryKey: ["notifications", user?.id],
      });
      await queryClient.cancelQueries({
        queryKey: ["unread-notification-count", user?.id],
      });

      const previousNotifications =
        queryClient.getQueryData<NotificationsCache>([
          "notifications",
          user?.id,
        ]);
      const previousCount = queryClient.getQueryData<number>([
        "unread-notification-count",
        user?.id,
      ]);

      queryClient.setQueryData<NotificationsCache>(
        ["notifications", user?.id],
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((notification) =>
                notification.id === notificationId && !notification.read_at
                  ? { ...notification, read_at: new Date().toISOString() }
                  : notification,
              ),
            })),
          },
      );

      queryClient.setQueryData<number>(
        ["unread-notification-count", user?.id],
        (old) => (old && old > 0 ? old - 1 : 0),
      );

      return { previousNotifications, previousCount };
    },

    onError: (_error, _notificationId, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          ["notifications", user?.id],
          context.previousNotifications,
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          ["unread-notification-count", user?.id],
          context.previousCount,
        );
      }
      toast.error("Couldn't mark that notification as read. Please try again.");
    },

    onSettled: (_data, _error, notificationId) => {
      setPendingReadIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
      invalidateNotificationQueries();
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: ["notifications", user?.id],
      });
      await queryClient.cancelQueries({
        queryKey: ["unread-notification-count", user?.id],
      });

      const previousNotifications =
        queryClient.getQueryData<NotificationsCache>([
          "notifications",
          user?.id,
        ]);
      const previousCount = queryClient.getQueryData<number>([
        "unread-notification-count",
        user?.id,
      ]);

      const now = new Date().toISOString();

      queryClient.setQueryData<NotificationsCache>(
        ["notifications", user?.id],
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((notification) =>
                notification.read_at
                  ? notification
                  : { ...notification, read_at: now },
              ),
            })),
          },
      );

      queryClient.setQueryData<number>(
        ["unread-notification-count", user?.id],
        0,
      );

      return { previousNotifications, previousCount };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          ["notifications", user?.id],
          context.previousNotifications,
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          ["unread-notification-count", user?.id],
          context.previousCount,
        );
      }
      toast.error("Couldn't mark all notifications as read. Please try again.");
    },

    onSettled: () => {
      invalidateNotificationQueries();
    },
  });

  const handleRowClick = (notification: NotificationType) => {
    if (!notification.read_at && !pendingReadIds.has(notification.id)) {
      markReadMutation.mutate(notification.id);
    }

    setOpen(false);

    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllRead = () => {
    if (markAllReadMutation.isPending) return;
    markAllReadMutation.mutate();
  };

  const hasUnread = !!unreadCount && unreadCount > 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
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
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align === "left" ? "start" : "end"}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-popover">
          <span className="font-medium text-sm">Notifications</span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllReadMutation.isPending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:pointer-events-none"
          >
            {markAllReadMutation.isPending
              ? "Marking as read..."
              : "Mark all as read"}
          </button>
        </div>

        <InfiniteList<NotificationType>
          queryKey={["notifications", user?.id]}
          initialPage={null}
          fetchPage={(cursor) => getUserNotifications({ cursor })}
          listClassName="flex flex-col"
          loadingSkeleton={
            <ul className="flex flex-col">
              {Array.from({ length: 4 }, (_, i) => (
                <NotificationRowSkeleton key={i.toLocaleString()} />
              ))}
            </ul>
          }
          emptyState={
            <p className="text-muted-foreground text-sm py-6 text-center">
              No notifications yet.
            </p>
          }
          renderItem={(notification) => {
            const isUnread = !notification.read_at;
            const isMarking = pendingReadIds.has(notification.id);

            return (
              <li
                key={notification.id}
                className="border-b border-border last:border-0"
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(notification)}
                  disabled={isMarking}
                  className={`flex w-full items-start gap-2 px-4 py-3 text-left text-sm hover:bg-accent transition-colors disabled:opacity-70 ${
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
