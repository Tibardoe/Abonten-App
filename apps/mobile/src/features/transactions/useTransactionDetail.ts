import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import type {
  TransactionKind,
  TransactionStatus,
} from "@abonten/types/transactions";
import { useQuery } from "@tanstack/react-query";

// Native echo of the web getUserTransactionDetail action: one
// ticket_checkout / subscription_checkout row, scoped by BOTH id and the
// caller's own user_id (owner-scoped RLS enforces that too). The
// customer-paid service fee is attributed to this checkout row the same way
// the web action does — its share of what Paystack actually captured
// (transaction.amount), proportioned by ticket revenue across the basket.

type TxnRef = {
  id: string;
  status: string;
  refund_requested_at: string | null;
  amount: number | null;
};

export type TicketTransactionDetail = {
  kind: "ticket";
  id: string;
  status: TransactionStatus;
  unit_price: number;
  discount: number;
  total_price: number;
  quantity: number;
  checkout_session_id: string | null;
  created_at: string;
  expires_at: string | null;
  completed_at: string | null;
  event: { title: string } | null;
  ticket_type: { type: string; currency: string | null } | null;
  tickets: { status: string; transaction: TxnRef | null }[];
  serviceFee: number;
  totalPaid: number;
};

export type SubscriptionTransactionDetail = {
  kind: "subscription";
  id: string;
  status: TransactionStatus;
  unit_price: number;
  discount: number;
  total_price: number;
  created_at: string;
  expires_at: string | null;
  completed_at: string | null;
  subscription_plan_name: string | null;
};

export type TransactionDetail =
  | TicketTransactionDetail
  | SubscriptionTransactionDetail;

async function fetchTicketDetail(
  id: string,
  userId: string,
): Promise<TicketTransactionDetail | null> {
  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      "*, event(title), ticket_type(type, currency), tickets:ticket(status, transaction:transaction_id(id, status, refund_requested_at, amount))",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown> & {
    total_price: number;
    tickets?: { transaction: TxnRef | null }[];
  };

  const thisRevenue = Number(row.total_price) || 0;
  let serviceFee = 0;
  let totalPaid = thisRevenue;

  const txn = (row.tickets ?? [])
    .map((t) => t.transaction)
    .find((tr): tr is TxnRef => !!tr?.id && tr.amount != null);

  if (txn) {
    const { data: txnTickets } = await supabase
      .from("ticket")
      .select("ticket_checkout_id")
      .eq("transaction_id", txn.id)
      .not("ticket_checkout_id", "is", null);

    const checkoutIds = [
      ...new Set(
        ((txnTickets ?? []) as { ticket_checkout_id: string | null }[])
          .map((r) => r.ticket_checkout_id)
          .filter((v): v is string => !!v),
      ),
    ];

    if (checkoutIds.length > 0) {
      const { data: peers } = await supabase
        .from("ticket_checkout")
        .select("total_price")
        .in("id", checkoutIds);
      const peerRevenue = ((peers ?? []) as { total_price: number }[]).reduce(
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

  return {
    kind: "ticket",
    ...(data as object),
    serviceFee,
    totalPaid,
  } as TicketTransactionDetail;
}

async function fetchSubscriptionDetail(
  id: string,
  userId: string,
): Promise<SubscriptionTransactionDetail | null> {
  const { data, error } = await supabase
    .from("subscription_checkout")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    kind: "subscription",
    ...(data as object),
  } as SubscriptionTransactionDetail;
}

export function useTransactionDetail(
  kind: TransactionKind | undefined,
  id: string | undefined,
) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery<TransactionDetail | null>({
    queryKey: ["transactions", "detail", kind, id],
    enabled: !!kind && !!id && !!userId,
    queryFn: () =>
      kind === "ticket"
        ? fetchTicketDetail(id as string, userId as string)
        : fetchSubscriptionDetail(id as string, userId as string),
  });
}
