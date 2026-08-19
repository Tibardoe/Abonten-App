"use server";

import { createClient } from "@/config/supabase/server";
import type { TransactionKind } from "@/types/transactions";

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
        "*, event(title), ticket_type(type, currency), tickets:ticket(status, transaction:transaction_id(status, refund_requested_at))",
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

    return { status: 200, data: { kind, ...data } };
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
