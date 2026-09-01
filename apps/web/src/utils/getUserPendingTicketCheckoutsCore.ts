import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  unit_price: number;
  discount: number;
  discounted_units: number;
  total_price: number;
  promo_code: string | null;
  expires_at: string;
  event: {
    title: string;
    event_code: string;
    starts_at: string | null;
    ends_at: string | null;
    event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  };
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
  unitPrice: number;
  quantity: number;
  discount: number;
  discountedUnits: number;
  amount: number;
  currency: string;
  availableStock: number | null;
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
  supabase: SupabaseClient,
  userId: string,
): Promise<GetUserPendingTicketCheckoutsCoreResult> {
  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      `id, checkout_session_id, event_id, ticket_type_id, quantity, unit_price,
       discount, discounted_units, total_price, promo_code, expires_at,
       event:event_id(title, event_code, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)),
       ticket_type:ticket_type_id(type, currency, quantity)`,
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    logger.error(`Failed fetching pending checkouts: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const rows = (data ?? []) as unknown as PendingCheckoutRow[];

  const sessionsById = new Map<string, PendingCheckoutSession>();

  for (const row of rows) {
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
        ),
        expiresAt: row.expires_at,
        promoCode: row.promo_code,
        lines: [],
        sessionSubtotal: 0,
      };
      sessionsById.set(row.checkout_session_id, session);
    }

    session.lines.push({
      ticketCheckoutId: row.id,
      ticketTypeId: row.ticket_type_id,
      type: row.ticket_type.type,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      discount: row.discount,
      discountedUnits: row.discounted_units,
      amount: row.total_price,
      currency: row.ticket_type.currency,
      availableStock: row.ticket_type.quantity,
    });
    session.sessionSubtotal += row.total_price;
  }

  return { status: 200, sessions: Array.from(sessionsById.values()) };
}
