"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchNotificationsPage } from "@abonten/services/notifications/notificationsQuery";
import type { NotificationType } from "@abonten/types/notificationType";
import type { PaginatedResult } from "@abonten/types/pagination";

/**
 * Cursor-paginated list of the signed-in user's own notifications, newest
 * first — the data source for the NotificationBell dropdown. Mirrors
 * getPlaceReviews.ts's shape: PaginatedResult<T>, SimpleCursor keyset on
 * (created_at, id).
 *
 * The query body lives in src/utils/notificationsQuery.ts so the mobile
 * HTTP route (Bearer session) runs the identical query.
 */
export const getUserNotifications = withActionLocale(
  async function getUserNotifications(options?: {
    cursor?: string | null;
    pageSize?: number;
  }): Promise<PaginatedResult<NotificationType>> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 401,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: tr("userNotLoggedIn"),
      };
    }

    return fetchNotificationsPage(supabase, user.id, options);
  },
);
