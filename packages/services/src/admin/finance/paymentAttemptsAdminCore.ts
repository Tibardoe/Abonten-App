// Admin › Finance › Payment attempts: every try at paying, including the
// ones that never became a payment (declined, cancelled, never confirmed),
// which Transactions cannot show because a transaction only exists once a
// payment succeeds. For support ("I paid but got nothing", "it keeps
// failing") and for seeing why payments fail. Read-only.

import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  PaymentAttemptListItem,
  PaymentAttemptStatusGroup,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { assertPermission } from "../adminContext";

/** The attempt statuses behind each filter tab. */
export const PAYMENT_ATTEMPT_STATUS_GROUPS: Record<
  PaymentAttemptStatusGroup,
  string[]
> = {
  open: ["initiated", "pending", "processing"],
  failed: ["failed"],
  cancelled: ["cancelled"],
  finishing: ["fulfillment_failed"],
  succeeded: ["succeeded", "refunded"],
};

export type ListPaymentAttemptsFilters = {
  group?: PaymentAttemptStatusGroup;
  /** A provider reference, or a buyer's username / name. */
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

type AttemptRow = {
  id: string;
  user_id: string;
  status: string;
  provider: string | null;
  provider_reference: string | null;
  amount: number | string;
  currency: string;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  transaction_id: string | null;
  checkout_session_id: string | null;
  event_promotion_checkout_id: string | null;
  place_promotion_checkout_id: string | null;
  content_campaign_checkout_id: string | null;
  ticket_plan_id: string | null;
  created_at: string;
  updated_at: string | null;
};

function purposeOf(row: AttemptRow): PaymentAttemptListItem["purpose"] {
  if (row.ticket_plan_id) return "ticket_plan";
  if (row.checkout_session_id) return "tickets";
  if (row.event_promotion_checkout_id) return "event_promotion";
  if (row.place_promotion_checkout_id) return "place_promotion";
  if (row.content_campaign_checkout_id) return "spotlight_promotion";
  return "other";
}

export async function listPaymentAttemptsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListPaymentAttemptsFilters = {},
): Promise<PaginatedResult<PaymentAttemptListItem>> {
  try {
    assertPermission(ctx, "transactions.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const fail = (message: string): PaginatedResult<PaymentAttemptListItem> => {
    logger.error(`listPaymentAttemptsCore failed: ${message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  };

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("payment_attempt")
    .select(
      "id, user_id, status, provider, provider_reference, amount, currency, failure_reason, metadata, transaction_id, checkout_session_id, event_promotion_checkout_id, place_promotion_checkout_id, content_campaign_checkout_id, ticket_plan_id, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.group) {
    query = query.in("status", PAYMENT_ATTEMPT_STATUS_GROUPS[filters.group]);
  }

  const search = filters.search?.trim().replace(/[%,()]/g, "") ?? "";
  if (search) {
    // A reference, or the people whose username / name matches.
    const { data: people, error: peopleError } = await supabase
      .from("user_info")
      .select("id")
      .or(`username.ilike.%${search}%,full_name.ilike.%${search}%`)
      .limit(50);
    if (peopleError) return fail(peopleError.message);
    const ids = (people ?? []).map((p) => p.id);
    query = query.or(
      ids.length > 0
        ? `provider_reference.ilike.%${search}%,user_id.in.(${ids.join(",")})`
        : `provider_reference.ilike.%${search}%`,
    );
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as AttemptRow[];
  const { page, hasNextPage } = splitPage(rows, pageSize);

  // Who paid, and what for (an event's title for tickets).
  const userIds = [...new Set(page.map((r) => r.user_id))];
  const sessionIds = [
    ...new Set(
      page.map((r) => r.checkout_session_id).filter((x): x is string => !!x),
    ),
  ];
  const [people, checkouts] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from("user_info")
          .select("id, username, full_name")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? supabase
          .from("ticket_checkout")
          .select("checkout_session_id, quantity, event:event_id(title)")
          .in("checkout_session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (people.error) return fail(people.error.message);
  if (checkouts.error) return fail(checkouts.error.message);

  const personById = new Map(
    (people.data ?? []).map((p) => [
      p.id,
      { username: p.username ?? null, name: p.full_name ?? null },
    ]),
  );
  const orderBySession = new Map<
    string,
    { title: string | null; tickets: number }
  >();
  for (const c of (checkouts.data ?? []) as unknown as {
    checkout_session_id: string;
    quantity: number | null;
    event: { title: string | null } | null;
  }[]) {
    const prev = orderBySession.get(c.checkout_session_id);
    orderBySession.set(c.checkout_session_id, {
      title: prev?.title ?? c.event?.title ?? null,
      tickets: (prev?.tickets ?? 0) + (c.quantity ?? 0),
    });
  }

  const items: PaymentAttemptListItem[] = page.map((r) => {
    const person = personById.get(r.user_id);
    const order = r.checkout_session_id
      ? orderBySession.get(r.checkout_session_id)
      : undefined;
    const method = r.metadata?.method;
    const mode = r.metadata?.mode;
    const amount =
      typeof r.amount === "string" ? Number.parseFloat(r.amount) : r.amount;
    return {
      id: r.id,
      status: r.status,
      provider: r.provider,
      providerReference: r.provider_reference,
      amount: Number.isFinite(amount) ? amount : 0,
      currency: r.currency,
      failureReason: r.failure_reason,
      method: typeof method === "string" ? method : null,
      mode: typeof mode === "string" ? mode : null,
      purpose: purposeOf(r),
      orderTitle: order?.title ?? null,
      ticketCount: order?.tickets ?? null,
      buyerId: r.user_id,
      buyerUsername: person?.username ?? null,
      buyerName: person?.name ?? null,
      transactionId: r.transaction_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;
  return { status: 200, data: items, nextCursor, hasNextPage };
}
