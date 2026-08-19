"use server";

import { createClient } from "@/config/supabase/server";

export type EventFinanceSummary = {
  currency: string;
  ticketSales: number;
  platformFee: number;
  refunds: number;
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

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("organizer_ledger_entry")
    .select("entry_type, amount, gross_amount, fee_amount, currency")
    .eq("event_id", eventId)
    .in("entry_type", ["earning", "refund_adjustment"]);

  if (ledgerError) {
    console.log(`Failed fetching event ledger rows: ${ledgerError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const rows = (ledgerRows ?? []) as {
    entry_type: "earning" | "refund_adjustment";
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

  const { data: settled } = await supabase.rpc("is_event_settled", {
    p_event_id: eventId,
  });

  return {
    status: 200,
    data: { currency, ...summary, settled: Boolean(settled) },
  };
}
