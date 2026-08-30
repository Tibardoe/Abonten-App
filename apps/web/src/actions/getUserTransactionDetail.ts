"use server";

import { createClient } from "@/config/supabase/server";
import type { TransactionKind } from "@abonten/types/transactions";

type TransactionRef = {
  id: string;
  status: string;
  refund_requested_at: string | null;
  amount: number | null;
};

// Fetches a single ticket_checkout/subscription_checkout row directly,
// scoped by BOTH id and the caller's own user_id — a checkout row can never
// be fetched cross-user by guessing/manipulating an id, matching the
// pattern the old (transaction-table-backed) getTransactionById.ts already
// used correctly.
export async function getUserTransactionDetail(
  kind: TransactionKind,
  id: string,
) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user.user) {
    return { status: 401, message: "User not authenticated" };
  }

  if (kind === "ticket") {
    const { data, error } = await supabase
      .from("ticket_checkout")
      .select(
        "*, event(title), ticket_type(type, currency), tickets:ticket(status, transaction:transaction_id(id, status, refund_requested_at, amount))",
      )
      .eq("id", id)
      .eq("user_id", user.user.id)
      .maybeSingle();

    if (error) {
      return {
        status: 500,
        message: `Error fetching transaction: ${error.message}`,
      };
    }

    if (!data) {
      return { status: 404, message: "Transaction not found" };
    }

    // Attribute the customer-paid service fee to this checkout row: its
    // share of what Paystack actually captured (transaction.amount),
    // proportioned by ticket revenue so a multi-checkout basket splits
    // correctly. Mirrors get_user_transaction_history's math. 0 for free /
    // legacy rows with no linked paid transaction.
    const thisRevenue = Number(data.total_price) || 0;
    let serviceFee = 0;
    let totalPaid = thisRevenue;

    const txn = ((data.tickets ?? []) as { transaction: TransactionRef }[])
      .map((t) => t.transaction)
      .find((tr): tr is TransactionRef => !!tr?.id && tr.amount != null);

    if (txn) {
      const { data: txnTickets } = await supabase
        .from("ticket")
        .select("ticket_checkout_id")
        .eq("transaction_id", txn.id)
        .not("ticket_checkout_id", "is", null);

      const checkoutIds = Array.from(
        new Set(
          (txnTickets ?? [])
            .map((r) => r.ticket_checkout_id as string | null)
            .filter((v): v is string => !!v),
        ),
      );

      if (checkoutIds.length > 0) {
        const { data: peers } = await supabase
          .from("ticket_checkout")
          .select("total_price")
          .in("id", checkoutIds);

        const peerRevenue = (peers ?? []).reduce(
          (sum, r) => sum + (Number(r.total_price) || 0),
          0,
        );

        if (peerRevenue > 0) {
          const fee =
            Math.round(
              (Number(txn.amount) * (thisRevenue / peerRevenue) - thisRevenue) *
                100,
            ) / 100;
          serviceFee = Math.max(0, fee);
          totalPaid = thisRevenue + serviceFee;
        }
      }
    }

    return { status: 200, data: { kind, ...data, serviceFee, totalPaid } };
  }

  const { data, error } = await supabase
    .from("subscription_checkout")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.user.id)
    .maybeSingle();

  if (error) {
    return {
      status: 500,
      message: `Error fetching transaction: ${error.message}`,
    };
  }

  if (!data) {
    return { status: 404, message: "Transaction not found" };
  }

  return { status: 200, data: { kind, ...data } };
}
