import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth body of getUserPendingTicketCheckouts, lifted verbatim so the
// mobile API route (`/api/mobile/checkout/pending`) and the "use server"
// action run the exact same logic. The caller supplies an already-
// authenticated Supabase client and the resolved userId. Deliberately NOT a
// "use server" file (see validateCheckoutCore.ts for the reasoning).

type PendingCheckoutRow = {
  id: string;
  checkout_session_id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  admits: number;
  group_discount_percent: number | null;
  unit_price: number;
  discount: number;
  discounted_units: number;
  total_price: number;
  promo_code: string | null;
  expires_at: string;
  // Null when the person may no longer read the event (staff hid it).
  event: {
    title: string;
    event_code: string;
    timezone: string | null;
    starts_at: string | null;
    ends_at: string | null;
    event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  } | null;
  ticket_type: {
    type: string;
    currency: string;
    quantity: number | null;
  };
};

export type PendingCheckoutSessionLine = {
  ticketCheckoutId: string;
  ticketTypeId: string;
  type: string;
  /** The price of one purchase (a Couple ticket admitting two). */
  unitPrice: number;
  /** Tickets on the line (people). */
  quantity: number;
  /** People one purchase admits; purchases = quantity / admits. */
  admits: number;
  purchases: number;
  /** The event's group price applied to this line, or null. */
  groupDiscountPercent: number | null;
  discount: number;
  discountedUnits: number;
  amount: number;
  currency: string;
  availableStock: number | null;
};

/**
 * A payment already started for the checkout and not yet settled: the
 * buyer is approving it on their phone, the provider has not answered, or
 * it was paid and the tickets are still being issued ("finishing"). While
 * it is open the checkout cannot be released, and paying again would start
 * a second charge, so the apps offer "Check payment" instead.
 */
export type PendingCheckoutPayment = {
  attemptId: string;
  stage: "awaiting" | "finishing";
  startedAt: string;
};

export type PendingCheckoutSession = {
  checkoutSessionId: string;
  eventId: string;
  eventTitle: string;
  eventCode: string;
  eventDateAndTime: { date: string; time: string };
  expiresAt: string;
  promoCode: string | null;
  lines: PendingCheckoutSessionLine[];
  sessionSubtotal: number;
  paymentInProgress: PendingCheckoutPayment | null;
};

export type GetUserPendingTicketCheckoutsCoreResult =
  | { status: 500; message: string }
  | { status: 200; sessions: PendingCheckoutSession[] };

/**
 * The order-summary "basket": every active, non-expired pending checkout
 * session across ALL of the user's events. Self-heals expiry the same way
 * every other checkout read does, so a session that just timed out is
 * already gone from this list rather than needing a separate filter.
 */
export async function getUserPendingTicketCheckoutsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GetUserPendingTicketCheckoutsCoreResult> {
  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      `id, checkout_session_id, event_id, ticket_type_id, quantity, admits,
       group_discount_percent, unit_price,
       discount, discounted_units, total_price, promo_code, expires_at,
       event:event_id(title, event_code, starts_at, ends_at, timezone, event_occurrence(id, starts_at, ends_at)),
       ticket_type:ticket_type_id(type, currency, quantity)`,
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    logger.error(`Failed fetching pending checkouts: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const rows = (data ?? []) as unknown as PendingCheckoutRow[];

  const sessionsById = new Map<string, PendingCheckoutSession>();

  for (const row of rows) {
    if (!row.event) continue;
    let session = sessionsById.get(row.checkout_session_id);

    if (!session) {
      session = {
        checkoutSessionId: row.checkout_session_id,
        eventId: row.event_id,
        eventTitle: row.event.title,
        eventCode: row.event.event_code,
        eventDateAndTime: getFormattedEventDate(
          row.event.starts_at,
          row.event.ends_at,
          row.event.event_occurrence,
          row.event.timezone,
        ),
        expiresAt: row.expires_at,
        promoCode: row.promo_code,
        lines: [],
        sessionSubtotal: 0,
        paymentInProgress: null,
      };
      sessionsById.set(row.checkout_session_id, session);
    }

    session.lines.push({
      ticketCheckoutId: row.id,
      ticketTypeId: row.ticket_type_id,
      type: row.ticket_type.type,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      admits: Math.max(1, row.admits ?? 1),
      purchases: row.quantity / Math.max(1, row.admits ?? 1),
      groupDiscountPercent: row.group_discount_percent ?? null,
      discount: row.discount,
      discountedUnits: row.discounted_units,
      amount: row.total_price,
      currency: row.ticket_type.currency,
      availableStock: row.ticket_type.quantity,
    });
    session.sessionSubtotal += row.total_price;
  }

  const sessions = Array.from(sessionsById.values());
  await attachPaymentsInProgress(userId, sessions);
  return { status: 200, sessions };
}

// An attempt is still open while it is initiated, pending or processing,
// and "finishing" when it was paid but the tickets are not issued yet. An
// initiated attempt counts only for a direct charge (mobile money, a saved
// card): the charge went out when it was created. An initiated popup
// attempt is a payment page the buyer may simply have closed.
async function attachPaymentsInProgress(
  userId: string,
  sessions: PendingCheckoutSession[],
): Promise<void> {
  if (sessions.length === 0) return;
  // Service role with the buyer named: payment attempts are server-only.
  const { data, error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .select("id, status, metadata, created_at, checkout_session_id")
    .eq("user_id", userId)
    .in(
      "checkout_session_id",
      sessions.map((s) => s.checkoutSessionId),
    )
    .in("status", ["initiated", "pending", "processing", "fulfillment_failed"])
    .order("created_at", { ascending: false });
  if (error) {
    // The list still shows; only the "being confirmed" note is missing.
    logger.error(
      `Failed reading open payments for checkouts: ${error.message}`,
    );
    return;
  }
  const bySession = new Map(sessions.map((s) => [s.checkoutSessionId, s]));
  for (const attempt of data ?? []) {
    const session = attempt.checkout_session_id
      ? bySession.get(attempt.checkout_session_id)
      : undefined;
    if (!session || session.paymentInProgress) continue;
    const mode = (attempt.metadata as { mode?: unknown } | null)?.mode;
    if (attempt.status === "initiated" && mode !== "direct") continue;
    session.paymentInProgress = {
      attemptId: attempt.id,
      stage: attempt.status === "fulfillment_failed" ? "finishing" : "awaiting",
      startedAt: attempt.created_at,
    };
  }
}
