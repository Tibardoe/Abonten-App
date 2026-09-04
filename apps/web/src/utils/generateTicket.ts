import ticketPurchaseNotification from "@/actions/ticketPurchaseNotification";
import { createClient } from "@/config/supabase/server";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import { releaseTicketQuantity } from "@abonten/services/checkout/ticketInventory";
import { createNotificationCore } from "@abonten/services/notifications/createNotification";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@abonten/services/tickets/generateTicketCode";
import { saveEventQrCodeToCloudinary } from "@abonten/services/tickets/saveEventQrCodeToCloudinary";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import type { Database } from "@abonten/types/database.types";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

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
  status: string;
};

type IssueTicketsResultRow = {
  ticket_id: string;
  already_issued: boolean;
};

/**
 * Issues tickets for an already-reserved, already-priced checkout session.
 *
 * The DB mutation — insert tickets + attendance, flip the checkout to
 * `paid`, credit the organizer — is done in one atomic, idempotent RPC
 * (`issue_tickets_for_checkout`), so a failure mid-way can never leave a
 * half-issued checkout, and a redelivered webhook / user retry converges
 * instead of stranding (limitations FIN-001, FIN-002). Only QR generation +
 * the Cloudinary upload happen here — the one step Postgres can't do.
 *
 * Nothing about "how many tickets of which type" is trusted from the
 * client: the checkout session (created by validateCheckout, owned by the
 * caller, priced and inventory-reserved server-side) is the only source of
 * truth. The RPC additionally refuses to issue a paid checkout without a
 * matching verified `transaction` + `payment_attempt`.
 *
 * **Server-only module function, not a Server Action.** It uses next/cache
 * `revalidatePath` + next/server `after`, so it can only run inside a Server
 * Action or Route Handler — its two callers are `issueFreeCheckoutTickets`
 * (the free-basket "use server" action, gated to 0-price sessions) and
 * `paymentFulfillmentDeps` (injected into `finalizePaystackPayment`).
 *
 * `authOverride` lets the Paystack webhook (no cookies/session) call this
 * with an already-resolved user + service-role client.
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

  const checkoutSelect =
    "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at, occurrence_id, total_price, status";

  // Read every row of this session (any status) up front so an already-paid
  // session — a webhook redelivery, or a retry after the response was cut
  // off post-issuance — is recognised as done instead of falling through to
  // a stale-state error and returning a non-200 the payment finalizer would
  // treat as a failure forever (the reconciliation black hole in limitation
  // FIN-001).
  const { data: allRowsRaw, error: allRowsError } = await supabase
    .from("ticket_checkout")
    .select(checkoutSelect)
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userId);

  if (allRowsError) {
    logger.error(`Failed fetching checkout: ${allRowsError.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const allRows = (allRowsRaw ?? []) as CheckoutRow[];

  if (allRows.length === 0) {
    return { status: 404, message: "Checkout not found" };
  }

  if (allRows.every((row) => row.status === "paid")) {
    return { status: 200, message: "Tickets already issued" };
  }

  // Give the atomic sweep a chance to reclaim this checkout if its
  // reservation window has passed — the same function the scheduled cron
  // job runs. It only restocks rows it actually transitions from 'pending'
  // to 'expired', so this can never double-release even if the job races
  // this call. (The sweep skips any checkout with a live payment_attempt,
  // so a slow mobile-money authorisation keeps its seats — limitation
  // DATA-001.)
  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data: checkoutData, error: checkoutError } = await supabase
    .from("ticket_checkout")
    .select(checkoutSelect)
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

  const { data: event, error: eventFetchError } = await supabase
    .from("event")
    .select(
      "event_code, title, flyer_public_id, flyer_version, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
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

  // Generate a QR image per reserved unit and upload them all concurrently.
  // This is the only step the atomic RPC below can't do; the ticket rows
  // themselves are written by the RPC in one transaction.
  const qrJobs = rows.flatMap((row) =>
    Array.from({ length: row.quantity }, () => ({
      checkout_id: row.id,
      ticket_type_id: row.ticket_type_id,
      occurrence_id: row.occurrence_id,
      ticket_code: generateTicketCode(),
    })),
  );

  const releaseAllReservations = async () => {
    await Promise.all(
      rows.map((row) =>
        releaseTicketQuantity(row.ticket_type_id, row.quantity),
      ),
    );
  };

  let uploadedTickets: {
    checkout_id: string;
    ticket_type_id: string;
    occurrence_id: string | null;
    ticket_code: string;
    qr_public_id: string;
    qr_version: string;
  }[];

  try {
    uploadedTickets = await Promise.all(
      qrJobs.map(async (job) => {
        const qrCodeBase64 = await generateQRCodeDataURL(job.ticket_code);
        const uploadResponse = await saveEventQrCodeToCloudinary(
          qrCodeBase64,
          job.ticket_code,
        );

        if (uploadResponse.error || !uploadResponse.public_id) {
          throw new Error(uploadResponse.error);
        }

        return {
          checkout_id: job.checkout_id,
          ticket_type_id: job.ticket_type_id,
          occurrence_id: job.occurrence_id,
          ticket_code: job.ticket_code,
          qr_public_id: uploadResponse.public_id as string,
          qr_version: String(uploadResponse.version),
        };
      }),
    );
  } catch (error) {
    logger.error(`Error saving QR code to cloudinary: ${error}`);
    // Nothing was written to the DB yet — give the reserved units back so
    // the checkout's expiry sweep isn't the only thing that reclaims them.
    await releaseAllReservations();
    return { status: 500, message: "Something went wrong!" };
  }

  let parsedMetadata: unknown = null;
  if (transactionMetada) {
    try {
      parsedMetadata = JSON.parse(transactionMetada);
    } catch {
      parsedMetadata = { raw: transactionMetada };
    }
  }

  const { data: issueData, error: issueError } = await supabase.rpc(
    "issue_tickets_for_checkout",
    {
      p_checkout_session_id: checkoutSessionId,
      p_user_id: userId,
      p_transaction_id: transactionId ?? null,
      p_metadata: parsedMetadata,
      p_ticket_expires_at: eventEndDate.toISOString(),
      p_tickets: uploadedTickets,
    } as unknown as Database["public"]["Functions"]["issue_tickets_for_checkout"]["Args"],
  );

  if (issueError || !issueData) {
    logger.error(
      `issue_tickets_for_checkout failed for session ${checkoutSessionId}: ${issueError?.message}`,
    );
    // The RPC is one transaction — on error nothing was committed, so the
    // reservation must be handed back. Retryable via the same path. The
    // RPC's own exception messages (e.g. "checkout has expired") are
    // user-safe — it never raises with internal detail — so surface them
    // instead of a generic message when present.
    await releaseAllReservations();
    return {
      status: 500,
      message: issueError?.message || "Something went wrong!",
    };
  }

  const issuedRows = issueData as IssueTicketsResultRow[];
  const allInsertedTicketIds = issuedRows.map((row) => row.ticket_id);
  const wasAlreadyIssued =
    issuedRows.length > 0 && issuedRows.every((row) => row.already_issued);

  // Establish the successful-purchase state before the caller redirects
  // anywhere: without this, browser Back to the wallet pages could keep
  // showing the pre-payment "pending" render until a manual refresh.
  revalidatePath("/checkout");
  revalidatePath(`/checkout/${checkoutSessionId}`);
  revalidatePath("/manage/my-events");
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/manage/dashboard");
  revalidatePath("/transactions");
  revalidatePath(`/events/${event.event_code.toLowerCase()}`);

  // A pure idempotent replay (webhook redelivery after the first run already
  // issued + notified) — don't re-send the receipt email or a duplicate
  // in-app notification.
  if (wasAlreadyIssued) {
    return { status: 200, message: "Tickets already issued" };
  }

  // Runs after this response is sent, so PDF generation + email delivery
  // never add to checkout latency. For a paid purchase the receipt should
  // show what the customer was actually charged (ticket price + the
  // customer-paid Abonten service fee) = transaction.amount. Free
  // registrations have no transaction and fall back to the (zero) subtotal.
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

  // In-app "ticket confirmed" notification (+ mobile push). Awaited inline
  // rather than deferred with after(): the webhook fulfilment path can
  // suspend the function the instant it responds, dropping after()
  // callbacks. Best-effort — the tickets already exist.
  await createNotificationCore(supabase, {
    userId,
    type: "ticket_confirmed",
    title: "Ticket confirmed",
    body: event.title
      ? `Your ticket for ${event.title} is confirmed.`
      : "Your ticket is confirmed.",
    link: "/manage/my-events",
    data: {
      kind: "ticket",
      eventId,
      ticketId: allInsertedTicketIds[0],
    },
    imagePublicId: event.flyer_public_id ?? null,
    imageVersion: event.flyer_version ?? null,
  }).catch((error) =>
    logger.error(`Failed creating ticket notification: ${error}`),
  );

  return { status: 200, message: "Tickets generated successfully" };
}
