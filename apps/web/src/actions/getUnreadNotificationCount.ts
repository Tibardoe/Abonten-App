"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { unreadNotificationCountFor } from "@abonten/services/notifications/notificationsQuery";

type GetUnreadNotificationCountResult =
  | { status: 401 | 500; message: string }
  | { status: 200; count: number };

/**
 * Count-only query backing the NotificationBell badge — deliberately a
 * separate action from getUserNotifications rather than deriving the count
 * from a fetched page, since the badge needs to stay accurate even while the
 * dropdown itself is closed/unfetched. Thin wrapper over the shared
 * @abonten/services query the mobile /notifications/unread-count route uses.
 */
export const getUnreadNotificationCount = withActionLocale(
  async function getUnreadNotificationCount(): Promise<GetUnreadNotificationCountResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const result = await unreadNotificationCountFor(supabase, user.id);
    if (result.status !== 200) {
      return {
        status: 500,
        message: result.message ?? tr("somethingWentWrong"),
      };
    }
    return { status: 200, count: result.count };
  },
);
