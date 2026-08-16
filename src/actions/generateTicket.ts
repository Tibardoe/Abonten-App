"use server";

import { createClient } from "@/config/supabase/server";
import { resolveEventEndDate } from "@/utils/dateFormatter";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import { releaseTicketQuantity } from "@/utils/ticketInventory";
import { revalidatePath } from "next/cache";
import insertUserAttendance from "./insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "./saveEventQrCodeToCloudinary";

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
};

/**
 * Issues tickets for an already-reserved, already-priced checkout session.
 * This is deliberately checkout-session-driven rather than accepting a
 * client-supplied {type, quantity}[] array: the checkout session (created
 * by validateCheckout, owned by the caller, priced and inventory-reserved
 * server-side) is the only source of truth for what gets issued. Nothing
 * about "how many tickets of which type" is trusted from the client here.
 * The event's end date (for ticket.expires_at) is resolved server-side from
 * the event's own rows too — previously this was a client-supplied Date
 * parsed back out of an already-formatted display string, which was fragile
 * for one session and outright unreliable once a single "Proceed to
 * Payment" click can walk several different events' sessions in a row.
 */
export default async function generateTicket(
  checkoutSessionId: string,
  transactionId?: string,
  transactionMetada?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log(`Failed fetching user: ${userError?.message}`);

    return {
      status: 401,
      message: "User not logged in",
    };
  }

  const { data: initialCheckoutData, error: initialCheckoutError } =
    await supabase
      .from("ticket_checkout")
      .select(
        "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at, occurrence_id",
      )
      .eq("checkout_session_id", checkoutSessionId)
      .eq("user_id", user.id)
      .eq("status", "pending");

  if (initialCheckoutError) {
    console.log(`Failed fetching checkout: ${initialCheckoutError.message}`);

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
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at, occurrence_id",
    )
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (checkoutError) {
    console.log(`Failed fetching checkout: ${checkoutError.message}`);

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
    .eq("user_id", user.id);

  if (ticketDataError || !rawTicketData) {
    console.log(`Error fetching ticket data: ${ticketDataError?.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) =>
      ticket.ticket_type_id.event_id === eventId && ticket.status === "active",
  );

  if (alreadyBought) {
    return { status: 300, message: "Ticket for this event already bought" };
  }

  const { data: event, error: eventFetchError } = await supabase
    .from("event")
    .select("starts_at, ends_at, event_occurrence(id, starts_at, ends_at)")
    .eq("id", eventId)
    .maybeSingle();

  if (eventFetchError || !event) {
    console.log(`Failed fetching event: ${eventFetchError?.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    console.log(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

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
      console.log(
        `Error saving QR code to cloudinary:${failedUpload.uploadResponse.error}`,
      );

      await releaseTicketQuantity(row.ticket_type_id, row.quantity);

      return { status: 500, message: "Something went wrong!" };
    }

    const { data: insertedTickets, error: insertTicketError } = await supabase
      .from("ticket")
      .insert(
        uploadResults.map(({ ticketCode, uploadResponse }) => ({
          user_id: user.id,
          ticket_type_id: row.ticket_type_id,
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
      console.log(`Error inserting ticket: ${insertTicketError?.message}`);

      await releaseTicketQuantity(row.ticket_type_id, row.quantity);

      return {
        status: 500,
        message: "Something went wrong!",
      };
    }

    const attendanceInsertResponse = await insertUserAttendance(
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
  }

  await supabase
    .from("ticket_checkout")
    .update({ status: "paid", completed_at: new Date() })
    .in(
      "id",
      rows.map((row) => row.id),
    );

  // Establish the successful-purchase state before the caller redirects
  // anywhere: without this, browser Back to the wallet pages could keep
  // showing the pre-payment "pending" render until a manual refresh, since
  // nothing else in this codebase calls revalidatePath for checkout routes.
  revalidatePath("/checkout");
  revalidatePath(`/checkout/${checkoutSessionId}`);
  revalidatePath("/manage/my-events");
  revalidatePath("/manage/attendance/attendance-list");
  revalidatePath("/manage/dashboard");

  return { status: 200, message: "Tickets generated successfully" };
}
