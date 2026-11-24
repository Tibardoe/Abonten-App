import { logger } from "@abonten/core/logger";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// The amount paid for a ticket whose amount the buyer chose (open-amount
// tickets, docs/architecture/open-amount-tickets.md), for the person who
// holds the ticket now. A ticket someone sent them (ticket transfers,
// PROJECT.md §74) was bought on the sender's checkout line, and only the
// buyer's session may read `ticket_checkout`; yet the amount is what the
// gate loads, so the holder's ticket must show it. The line is read here
// with the service role, and only for tickets the database says this
// person holds right now (`ticket.user_id`), the way checkInTicketCore
// reads it for the door after authorising the scanner. The line's access
// rules are never opened.

export type HeldTicketPaidAmount = { amount: number; currency: string };

export type HeldTicketPaidAmountsResult =
  | { status: 200; data: Record<string, HeldTicketPaidAmount> }
  | { status: 400 | 500; message: string };

/** One screen's worth: a ticket list page, a purchase email. */
export const HELD_TICKET_PAID_AMOUNTS_MAX = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HeldTicketRow = {
  id: string;
  ticket_checkout_id: string | null;
  ticket_type: { amount_mode: string | null; currency: string | null } | null;
};

/**
 * The amount paid for each of `ticketIds` that `holderId` holds and whose
 * amount the buyer chose, by ticket id. Tickets the person does not hold,
 * fixed-price tickets and unknown ids are simply absent.
 */
export async function heldTicketPaidAmountsCore(
  holderId: string,
  ticketIds: readonly string[],
): Promise<HeldTicketPaidAmountsResult> {
  const ids = [...new Set(ticketIds)];
  if (
    ids.length > HELD_TICKET_PAID_AMOUNTS_MAX ||
    ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))
  ) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  if (ids.length === 0) return { status: 200, data: {} };

  const service = getSupabaseServiceClient();
  // Held by this person now: a ticket they sent on is no longer theirs.
  const { data: rawTickets, error: ticketError } = await service
    .from("ticket")
    .select(
      "id, ticket_checkout_id, ticket_type:ticket_type_id(amount_mode, currency)",
    )
    .in("id", ids)
    .eq("user_id", holderId);
  if (ticketError) {
    logger.error(
      `heldTicketPaidAmounts: ticket read failed (${ticketError.message})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const open = ((rawTickets ?? []) as unknown as HeldTicketRow[]).filter(
    (row) =>
      row.ticket_type?.amount_mode === "open" &&
      !!row.ticket_type.currency &&
      !!row.ticket_checkout_id,
  );
  if (open.length === 0) return { status: 200, data: {} };

  const { data: lines, error: lineError } = await service
    .from("ticket_checkout")
    .select("id, open_amount, unit_price")
    .in("id", [...new Set(open.map((row) => row.ticket_checkout_id ?? ""))]);
  if (lineError) {
    logger.error(
      `heldTicketPaidAmounts: checkout line read failed (${lineError.message})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const lineById = new Map((lines ?? []).map((line) => [line.id, line]));
  const data: Record<string, HeldTicketPaidAmount> = {};
  for (const row of open) {
    const line = lineById.get(row.ticket_checkout_id ?? "");
    const amount = Number(line?.unit_price);
    if (!line?.open_amount || line.unit_price == null) continue;
    if (!Number.isFinite(amount)) continue;
    data[row.id] = { amount, currency: row.ticket_type?.currency ?? "" };
  }
  return { status: 200, data };
}

type TicketWithLine = {
  id: string;
  checkout?: { open_amount: boolean | null; unit_price: number | null } | null;
  ticket_type?: { amount_mode?: string | null } | null;
};

/**
 * Fills in the checkout line of the person's open-amount tickets whose line
 * their own session could not read (a ticket someone sent them), so
 * `openAmountPaidOf` shows the amount on their ticket like on the buyer's.
 * A failed read leaves the tickets as they came: the ticket, its code and
 * everything else on it still show; only the amount is missing.
 */
export async function fillHeldTicketPaidAmounts<T extends TicketWithLine>(
  holderId: string,
  tickets: T[],
): Promise<T[]> {
  const missing = tickets
    .filter(
      (ticket) =>
        ticket.ticket_type?.amount_mode === "open" &&
        !ticket.checkout?.open_amount,
    )
    .map((ticket) => ticket.id)
    .slice(0, HELD_TICKET_PAID_AMOUNTS_MAX);
  if (missing.length === 0) return tickets;

  const result = await heldTicketPaidAmountsCore(holderId, missing);
  if (result.status !== 200) return tickets;
  return tickets.map((ticket) => {
    const paid = result.data[ticket.id];
    return paid
      ? { ...ticket, checkout: { open_amount: true, unit_price: paid.amount } }
      : ticket;
  });
}
