import { logger } from "@abonten/core/logger";
import { toPesewas } from "@abonten/core/paystackAmount";
import type { Database } from "@abonten/types/database.types";
import type { CreditQuote } from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreparedCheckoutPayment } from "../checkout/checkoutPaymentPreparation";
import { getSpendableCredit, quoteCredit } from "./creditRedemptionCore";

// Spending Abonten Credit on tickets (Phase 3). A ticket payment covers one
// or more pending checkout sessions at once (one payment group, one Paystack
// charge), so the credit is quoted and reserved for the whole group: target
// 'ticket_payment_group', scope 'tickets'. Amounts come from
// prepareCheckoutPayment -- the server-priced ticket_checkout rows plus the
// service fee -- never from the client.

export type TicketOrderSession = {
  checkoutSessionId: string;
  /** Session total including the service fee, in pesewas. */
  totalMinor: number;
  expiresAt: string | null;
  eventTitle: string;
  organizerId: string | null;
};

export type TicketOrder = {
  sessions: TicketOrderSession[];
  orderTotalMinor: number;
  currency: string;
  /** The soonest any of the sessions lapses. */
  earliestExpiry: string | null;
  /** Shown on the credit activity line: "Used on {label}". */
  label: string;
  /** The buyer organizes one of these events. */
  ownEvent: boolean;
};

type SessionRow = {
  checkout_session_id: string;
  expires_at: string | null;
  event: { title: string | null; organizer_id: string | null } | null;
};

/** The caller's own pending ticket order, as prepareCheckoutPayment priced it. */
export async function loadTicketOrder(
  supabase: SupabaseClient<Database>,
  userId: string,
  prepared: PreparedCheckoutPayment,
): Promise<TicketOrder> {
  const ids = prepared.validSessions.map((s) => s.checkoutSessionId);
  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      "checkout_session_id, expires_at, event:event_id(title, organizer_id)",
    )
    .in("checkout_session_id", ids.length > 0 ? ids : [""])
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    logger.error(`loadTicketOrder failed: ${error.message}`);
    throw new Error("Failed to load the ticket order");
  }

  const rows = (data ?? []) as unknown as SessionRow[];
  const bySession = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const list = bySession.get(row.checkout_session_id) ?? [];
    list.push(row);
    bySession.set(row.checkout_session_id, list);
  }

  const sessions: TicketOrderSession[] = prepared.validSessions.map((s) => {
    const sessionRows = bySession.get(s.checkoutSessionId) ?? [];
    const expiries = sessionRows
      .map((r) => r.expires_at)
      .filter((v): v is string => !!v)
      .sort();
    return {
      checkoutSessionId: s.checkoutSessionId,
      totalMinor: toPesewas(s.total),
      expiresAt: expiries[0] ?? null,
      eventTitle: s.eventTitle || sessionRows[0]?.event?.title || "",
      organizerId: sessionRows[0]?.event?.organizer_id ?? null,
    };
  });

  const titles = Array.from(
    new Set(sessions.map((s) => s.eventTitle).filter(Boolean)),
  );
  const expiries = sessions
    .map((s) => s.expiresAt)
    .filter((v): v is string => !!v)
    .sort();

  return {
    sessions,
    orderTotalMinor: sessions.reduce((sum, s) => sum + s.totalMinor, 0),
    currency: prepared.currency,
    earliestExpiry: expiries[0] ?? null,
    label:
      titles.length === 1
        ? `tickets for ${titles[0]}`
        : titles.length > 1
          ? `tickets for ${titles.length} events`
          : "tickets",
    ownEvent: sessions.some((s) => s.organizerId === userId),
  };
}

/**
 * What the "Use credit" switch offers on a ticket order. Credit can't be
 * spent on tickets to an event the buyer organizes (so it can't be turned
 * into organizer earnings and paid out).
 */
export async function quoteTicketCredit(
  supabase: SupabaseClient<Database>,
  userId: string,
  prepared: PreparedCheckoutPayment,
): Promise<{ quote: CreditQuote; order: TicketOrder }> {
  const order = await loadTicketOrder(supabase, userId, prepared);
  const spendable = await getSpendableCredit(
    userId,
    "tickets",
    order.orderTotalMinor,
  );
  return {
    quote: quoteCredit(order, spendable, order.ownEvent ? "own_event" : null),
    order,
  };
}

/** quoteTicketCredit for the read-only prepare step; never throws. */
export async function safeQuoteTicketCredit(
  supabase: SupabaseClient<Database>,
  userId: string,
  prepared: PreparedCheckoutPayment,
): Promise<CreditQuote | null> {
  if (prepared.validSessions.length === 0) return null;
  try {
    return (await quoteTicketCredit(supabase, userId, prepared)).quote;
  } catch {
    return null;
  }
}
