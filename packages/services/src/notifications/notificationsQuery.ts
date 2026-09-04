import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { Database } from "@abonten/types/database.types";
import type { NotificationType } from "@abonten/types/notificationType";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth query bodies for the signed-in user's notifications, shared by
// the Server Actions (src/actions/getUserNotifications.ts etc., cookie
// session) and the mobile HTTP routes (Bearer session). Both pass an
// already-authenticated `supabase` client plus the resolved `userId`, so
// the ownership scoping (`.eq("user_id", userId)`) and behaviour are
// identical on either transport — no logic fork.

export async function fetchNotificationsPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<NotificationType>> {
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("notification")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching notifications: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<NotificationType>(
    (data ?? []) as unknown as NotificationType[],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function markNotificationReadFor(
  supabase: SupabaseClient<Database>,
  userId: string,
  notificationId: string,
): Promise<{ status: number; message?: string }> {
  const { error } = await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) {
    logger.error(`Failed marking notification read: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}

export async function markAllNotificationsReadFor(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ status: number; message?: string }> {
  const { error } = await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    logger.error(`Failed marking all notifications read: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}
