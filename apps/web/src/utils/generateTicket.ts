import ticketPurchaseNotification from "@/actions/ticketPurchaseNotification";
import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import { releaseTicketQuantity } from "@abonten/services/checkout/ticketInventory";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@abonten/services/tickets/generateTicketCode";
import { insertUserAttendanceCore } from "@abonten/services/tickets/insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "@abonten/services/tickets/saveEventQrCodeToCloudinary";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: {
    event_id: string;
  };
  status: string;
};

type CheckoutRow = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  promo_code: string | null;
  discounted_units: number;
  expires_at: string | null;
  occurrence_id: string | null;
  total_price: number;
};

/**
 * Issues tickets for an already-reserved, already-priced checkout session.
 * This is deliberately checkout-session-driven rather than accepting a
 * client-supplied {type, quantity}[] array: the checkout session (created
 * by validateCheckout, owned by the caller, priced and inventory-reserved
 * server-side) is the only source of truth for what gets issued. Nothing
 * about "how many tickets of which type" is trusted from the client here.
 * The event's end date (for ticket.expires_at) is resolved server-side from
 * the event's own rows too.
 *
 * **Server-only module function, not a Server Action.** It uses next/cache
 * `revalidatePath` + next/server `after`, so it can only run inside a Server
 * Action or Route Handler — its two callers are `issueFreeCheckoutTickets`
 * (the free-basket "use server" action, gated to 0-price sessions) and
 * `paymentFulfillmentDeps` (injected into `finalizePaystackPayment`). There
 * is no client entry point.
 *
 * `authOverride` lets the Paystack webhook (no cookies/session) call this
 * with an already-resolved user + service-role client instead of deriving
 * the session from cookies — see @abonten/types/authOverrideType and
 * @abonten/services/payments/finalizePaystackPayment.
 */
export default async function generateTicket(
  checkoutSessionId: string,
  transactionId?: string,
  transactionMetada?: string,
  authOverride?: AuthOverride,
) {
  const supabase = authOverride?.supabase ?? (await createClient());

  let userId: string;

  if (authOverride) {
    userId = authOverride.userId;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error(`Failed fetching user: ${userError?.message}`);

      return {
        status: 401,
        message: "User not logged in",
      };
    }

    userId = user.id;
  }

  const { data: initialCheckoutData, error: initialCheckoutError } =
    await supabase
      .from("ticket_checkout")
      .select(
        "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at, occurrence_id, total_price",
      )
      .eq("checkout_session_id", checkoutSessionId)
      .eq("user_id", userId)
      .eq("status", "pending");

  if (initialCheckoutError) {
    logger.error(`Failed fetching checkout: ${initialCheckoutError.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  if (!initialCheckoutData || initialCheckoutData.length === 0) {
    return { status: 404, message: "Checkout not found" };
  }

  // Give the atomic sweep a chance to reclaim this checkout if its
  // reservation window has passed — the same function the scheduled cron
  // job runs (see migration expire_stale_ticket_checkouts). It only
  // restocks rows it actually transitions from 'pending' to 'expired',
  // so this can never double-release even if the job races this call.
  // Re-reading status afterward (rather than comparing expires_at to the
  // current time locally) keeps this in lockstep with whatever the sweep
  // actually decided, including its grace period.
  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data: checkoutData, error: checkoutError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at, occurrence_id, total_price",
    )
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (checkoutError) {
    logger.error(`Failed fetching checkout: ${checkoutError.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const rows = (checkoutData ?? []) as CheckoutRow[];

  if (rows.length === 0) {
    return {
      status: 410,
      message: "This checkout has expired. Please start again.",
    };
  }

  const eventId = rows[0].event_id;

  // Check if user has already bought a ticket for the event
  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, status, ticket_type_id(event_id)")
    .eq("user_id", userId);

  if (ticketDataError || !rawTicketData) {
    logger.error(`Error fetching ticket data: ${ticketDataError?.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) =>
      ticket.ticket_type_id.event_id === eventId &&
      (ticket.status === "active" || ticket.status === "used"),
  );

  if (alreadyBought) {
    return { status: 300, message: "Ticket for this event already bought" };
  }

  const { data: event, error: eventFetchError } = await supabase
    .from("event")
    .select(
      "event_code, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventFetchError || !event) {
    logger.error(`Failed fetching event: ${eventFetchError?.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

  const allInsertedTicketIds: string[] = [];

  for (const row of rows) {
    const ticketCodes = Array.from({ length: row.quantity }, () =>
      generateTicketCode(),
    );

    // QR generation + Cloudinary upload has no cross-unit dependency, so a
    // group booking of N tickets no longer pays N sequential round trips —
    // they all run concurrently. Only once every upload in this row has
    // succeeded are the ticket rows inserted, in one batch: either the
    // whole row commits or none of it does, so a single failure releases
    // the row's full reserved quantity rather than tracking partial progress.
    const uploadResults = await Promise.all(
      ticketCodes.map(async (ticketCode) => {
        const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);
        const uploadResponse = await saveEventQrCodeToCloudinary(
          qrCodeBase64,
          ticketCode,
        );
        return { ticketCode, uploadResponse };
      }),
    );

    const failedUpload = uploadResults.find(
      ({ uploadResponse }) => uploadResponse.error,
    );

    if (failedUpload) {
      logger.error(
        `Error saving QR code to cloudinary:${failedUpload.uploadResponse.error}`,
      );

      await releaseTicketQuantity(row.ticket_type_id, row.quantity);

      return { status: 500, message: "Something went wrong!" };
    }

    const { data: insertedTickets, error: insertTicketError } = await supabase
      .from("ticket")
      .insert(
        uploadResults.map(({ ticketCode, uploadResponse }) => ({
          user_id: userId,
          ticket_type_id: row.ticket_type_id,
          ticket_checkout_id: row.id,
          qr_public_id: uploadResponse.public_id,
          qr_version: uploadResponse.version,
          expires_at: eventEndDate,
          used_at: null,
          transaction_id: transactionId ?? null,
          seat_number: null,
          status: "active",
          ticket_code: ticketCode,
          metadata: transactionMetada ?? null,
          created_at: new Date(),
          updated_at: null,
          occurrence_id: row.occurrence_id,
        })),
      )
      .select("id");

    if (
      insertTicketError ||
      !insertedTickets ||
      insertedTickets.length !== row.quantity
    ) {
      logger.error(`Error inserting ticket: ${insertTicketError?.message}`);

      await releaseTicketQuantity(row.ticket_type_id, row.quantity);

      return {
        status: 500,
        message: "Something went wrong!",
      };
    }

    const attendanceInsertResponse = await insertUserAttendanceCore(
      supabase,
      userId,
      eventId,
      row.ticket_type_id,
      insertedTickets.map((ticket) => ticket.id),
    );

    if (attendanceInsertResponse.status !== 200) {
      return {
        status: attendanceInsertResponse.status,
        message: attendanceInsertResponse.message,
      };
    }

    allInsertedTicketIds.push(...insertedTickets.map((ticket) => ticket.id));
  }

  await supabase
    .from("ticket_checkout")
    .update({ status: "paid", completed_at: new Date() })
    .in(
      "id",
      rows.map((row) => row.id),
    );

  // Organizer Finances ledger: one 'earning' entry per checkout row, priced
  // server-side from the now-paid ticket_checkout/ticket_type/event chain —
  // see record_organizer_earning. Idempotent (organizer_ledger_entry_earning_once),
  // so this stays safe even if generateTicket is ever invoked twice for the
  // same checkout session. Runs on the service-role client, never the
  // buyer's: record_organizer_earning credits the *organizer's* ledger and
  // is EXECUTE-revoked from `authenticated` (migration 20260903200000). The
  // checkout it prices from is already paid + owned by this caller.
  const ledgerClient = getSupabaseServiceClient();
  await Promise.all(
    rows.map((row) =>
      ledgerClient.rpc("record_organizer_earning", {
        p_ticket_checkout_id: row.id,
      }),
    ),
  );

  // Establish the successful-purchase state before the caller redirects
  // anywhere: without this, browser Back to the wallet pages could keep
  // showing the pre-payment "pending" render until a manual refresh, since
  // nothing else in this codebase calls revalidatePath for checkout routes.
  revalidatePath("/checkout");
  revalidatePath(`/checkout/${checkoutSessionId}`);
  revalidatePath("/manage/my-events");
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/manage/dashboard");
  revalidatePath("/transactions");
  // The public event page is ISR-cached (revalidate = 60) and shows
  // attendance/sold-out status — without this, it can keep showing
  // pre-purchase numbers for up to a minute, or until a client navigation
  // happens to land on a stale Router Cache entry.
  revalidatePath(`/events/${event.event_code.toLowerCase()}`);

  // Runs after this response is sent, so PDF generation + email delivery
  // never add to checkout latency. Only ever scheduled once every ticket
  // row above has actually committed — never on a failed/partial run, since
  // every earlier failure path returns before reaching here.
  //
  // For a paid purchase the receipt should show what the customer was
  // actually charged (ticket price + the customer-paid Abonten service fee),
  // which is transaction.amount — not the fee-exclusive ticket subtotal.
  // Free registrations have no transaction and fall back to the (zero)
  // subtotal, which the email renders as "Free".
  const ticketSubtotal = rows.reduce((sum, row) => sum + row.total_price, 0);
  let totalAmount = ticketSubtotal;

  if (transactionId) {
    const { data: transactionRow } = await supabase
      .from("transaction")
      .select("amount")
      .eq("id", transactionId)
      .maybeSingle();

    if (transactionRow?.amount != null) {
      totalAmount = Number(transactionRow.amount);
    }
  }
  after(() =>
    ticketPurchaseNotification(
      allInsertedTicketIds,
      totalAmount,
      authOverride,
    ).catch((error) =>
      logger.error(`Failed sending ticket purchase email: ${error}`),
    ),
  );

  return { status: 200, message: "Tickets generated successfully" };
}
