"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

export type EventFinanceSummary = {
  currency: string;
  ticketSales: number;
  platformFee: number;
  refunds: number;
  netSales: number;
  pendingRefunds: number;
  completedRefunds: number;
  refundRequestCount: number;
  organizerEarnings: number;
  settled: boolean;
};

type GetEventFinanceSummaryResult =
  | { status: 401 | 403 | 500; message: string }
  | { status: 200; data: EventFinanceSummary | null };

/**
 * One event's contribution to the organizer's Finances balance — reads the
 * same organizer_ledger_entry rows Finances itself reads, so this can never
 * disagree with the Finances page. `data: null` means this event hasn't
 * produced any recorded earnings yet (e.g. no paid sales), which is a valid,
 * distinct case from a 403 (not this organizer's event).
 */
export default async function getEventFinanceSummary(
  eventId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<GetEventFinanceSummaryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 403, message: "Not authorized to view this event" };
  }

  // pendingRefunds/completedRefunds/settled below come from get_event_refund_
  // breakdown/is_event_settled, which are lifetime/current-state facts (an
  // event either is or isn't settled) — not date-scoped by design, even
  // when a period is passed here for the ticketSales/refunds/netSales figures.
  let ledgerQuery = supabase
    .from("organizer_ledger_entry")
    .select("entry_type, amount, gross_amount, fee_amount, currency")
    .eq("event_id", eventId)
    .in("entry_type", [
      "earning",
      "refund_adjustment",
      "refund_hold",
      "refund_release",
    ]);

  if (startDate) ledgerQuery = ledgerQuery.gte("created_at", startDate);
  if (endDate) ledgerQuery = ledgerQuery.lte("created_at", endDate);

  const { data: ledgerRows, error: ledgerError } = await ledgerQuery;

  if (ledgerError) {
    logger.error(`Failed fetching event ledger rows: ${ledgerError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const rows = (ledgerRows ?? []) as {
    entry_type:
      | "earning"
      | "refund_adjustment"
      | "refund_hold"
      | "refund_release";
    amount: number;
    gross_amount: number | null;
    fee_amount: number | null;
    currency: string;
  }[];

  if (rows.length === 0) {
    return { status: 200, data: null };
  }

  const currency = rows[0].currency;
  const summary = rows.reduce(
    (acc, row) => {
      if (row.entry_type === "earning") {
        acc.ticketSales += row.gross_amount ?? 0;
        acc.platformFee += row.fee_amount ?? 0;
      } else {
        acc.refunds += row.amount;
      }
      acc.organizerEarnings += row.amount;
      return acc;
    },
    { ticketSales: 0, platformFee: 0, refunds: 0, organizerEarnings: 0 },
  );

  // A ledger row alone can't say whether a refund is still pending or
  // already confirmed — that lives on transaction.status, which the
  // organizer's own session can't read directly (transaction RLS is
  // buyer-only). get_event_refund_breakdown is a SECURITY DEFINER RPC
  // scoped to this organizer's own ledger rows that safely bridges that
  // gap — see the migration that added it.
  const { data: refundBreakdownRows, error: refundBreakdownError } =
    await supabase.rpc("get_event_refund_breakdown", { p_event_id: eventId });

  if (refundBreakdownError) {
    logger.error(
      `Failed fetching event refund breakdown: ${refundBreakdownError.message}`,
    );
  }

  const breakdown = (
    (refundBreakdownRows ?? []) as {
      currency: string;
      refund_request_count: number;
      pending_refund_amount: number;
      completed_refund_amount: number;
    }[]
  ).find((row) => row.currency === currency);

  const { data: settled } = await supabase.rpc("is_event_settled", {
    p_event_id: eventId,
  });

  return {
    status: 200,
    data: {
      currency,
      ...summary,
      netSales: summary.ticketSales + summary.refunds,
      pendingRefunds: breakdown?.pending_refund_amount ?? 0,
      completedRefunds: breakdown?.completed_refund_amount ?? 0,
      refundRequestCount: breakdown?.refund_request_count ?? 0,
      settled: Boolean(settled),
    },
  };
}
