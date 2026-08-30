"use server";

import { createClient } from "@/config/supabase/server";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { getEventStatus } from "@/utils/eventStatus";
import { logger } from "@/utils/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";
import { TICKET_WITH_EVENT_SELECT } from "@/utils/ticketSelect";

type TicketRow = UserTicketType & {
  ticket_type: { event: UserTicketType["event"] };
};

// "Past" = you still hold this ticket (status active/used, never
// self-cancelled) but the event itself is over or was called off. This is
// derived from the event, not the ticket row, so it can't be expressed as a
// plain column filter -- hence the paginated over-fetch below.
function isPastTicket(row: TicketRow): boolean {
  const event = row.ticket_type?.event;
  if (!event) return false;
  return (
    event.status === "canceled" ||
    getEventStatus(event.starts_at, event.ends_at, event.occurrences) ===
      "ended"
  );
}

export default async function getUserAttendingEvents(options?: {
  status?: "active" | "cancelled";
  // Only meaningful with status "active": splits held tickets into ones for
  // events still to come ("active") vs ones for events already over/cancelled
  // ("past"). Omitted -> the old behaviour (every held ticket).
  timeframe?: "active" | "past";
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<UserTicketType>> {
  const supabase = await createClient();
  const status = options?.status ?? "active";
  const timeframe = options?.timeframe;
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const needsLifecycleFilter =
    status === "active" && (timeframe === "active" || timeframe === "past");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    logger.error(userError?.message);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  const statusValues = status === "active" ? ["active", "used"] : ["cancelled"];

  const runQuery = (from: SimpleCursor | null, limit: number) => {
    let query = supabase
      .from("ticket")
      .select(TICKET_WITH_EVENT_SELECT)
      .eq("user_id", user.id)
      // "Active" means "still a valid, non-cancelled ticket" -- includes
      // 'used' (checked in via checkInTicket.ts), not just the literal
      // 'active' status. Without this, a ticket disappears from the
      // attendee's own list the moment an organizer checks them in.
      .in("status", statusValues)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (from) {
      query = query.or(keysetOlderThan("created_at", "id", from));
    }
    return query;
  };

  const buildResult = (
    collected: TicketRow[],
    {
      rawExhausted,
      scanCursor,
    }: {
      rawExhausted: boolean;
      scanCursor: SimpleCursor | null;
    },
  ): PaginatedResult<UserTicketType> => {
    const { page, hasNextPage: hasMoreCollected } = splitPage<TicketRow>(
      collected,
      pageSize,
    );

    const ticketsWithEvents = page.map((ticket) => ({
      ...ticket,
      event: ticket.ticket_type.event,
    }));

    // We stopped without proving the list is exhausted (iteration cap) and
    // don't already have a full page in hand -- there may be more matches
    // further back, resumable from where the raw scan left off.
    const stoppedEarly = !rawExhausted && !hasMoreCollected;

    let nextCursor: string | null = null;
    if (hasMoreCollected) {
      const last = page[page.length - 1];
      nextCursor = encodeCursor<SimpleCursor>({
        sortValue: String(last.created_at),
        id: last.id,
      });
    } else if (stoppedEarly && scanCursor) {
      nextCursor = encodeCursor<SimpleCursor>(scanCursor);
    }

    return {
      status: 200,
      data: ticketsWithEvents,
      nextCursor,
      hasNextPage: hasMoreCollected || stoppedEarly,
    };
  };

  // --- Simple path: no lifecycle split, one query, exactly as before. -----
  if (!needsLifecycleFilter) {
    const { data: tickets, error: ticketsError } = await runQuery(
      cursor,
      pageSize + 1,
    );

    if (ticketsError) {
      logger.error(
        `Error fetching user attending events: ${ticketsError.message}`,
      );
      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "Something went wrong",
      };
    }

    return buildResult((tickets ?? []) as unknown as TicketRow[], {
      rawExhausted: true,
      scanCursor: null,
    });
  }

  // --- Lifecycle-split path: scan raw pages, keep only the matching ones,
  // until we have more than a page's worth or run out. The cap bounds the
  // work for the (contrived) case of a user with hundreds of tickets all on
  // the wrong side of the split. -----------------------------------------
  const CHUNK = pageSize + 1;
  const MAX_ITERATIONS = 20;
  const wantPast = timeframe === "past";

  const collected: TicketRow[] = [];
  let scanCursor: SimpleCursor | null = cursor;
  let rawExhausted = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data, error } = await runQuery(scanCursor, CHUNK);

    if (error) {
      logger.error(`Error fetching user attending events: ${error.message}`);
      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "Something went wrong",
      };
    }

    const chunk = (data ?? []) as unknown as TicketRow[];
    if (chunk.length === 0) {
      rawExhausted = true;
      break;
    }

    for (const row of chunk) {
      if (isPastTicket(row) === wantPast) collected.push(row);
    }

    const lastRaw = chunk[chunk.length - 1];
    scanCursor = { sortValue: String(lastRaw.created_at), id: lastRaw.id };

    if (chunk.length < CHUNK) {
      rawExhausted = true;
      break;
    }
    if (collected.length > pageSize) break;
  }

  return buildResult(collected, { rawExhausted, scanCursor });
}
