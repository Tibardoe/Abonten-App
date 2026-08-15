"use server";

import { createClient } from "@/config/supabase/server";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import insertUserAttendance from "./insertUserAttendance";
import releasePromoUsage from "./releasePromoUsage";
import releaseTicketQuantity from "./releaseTicketQuantity";
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
};

/**
 * Issues tickets for an already-reserved, already-priced checkout session.
 * This is deliberately checkout-session-driven rather than accepting a
 * client-supplied {type, quantity}[] array: the checkout session (created
 * by validateCheckout, owned by the caller, priced and inventory-reserved
 * server-side) is the only source of truth for what gets issued. Nothing
 * about "how many tickets of which type" is trusted from the client here.
 */
export default async function generateTicket(
  checkoutSessionId: string,
  eventEndDate: Date,
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

  const { data: checkoutData, error: checkoutError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, expires_at",
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
    return { status: 404, message: "Checkout not found" };
  }

  const now = new Date();
  const isExpired = rows.some(
    (row) => row.expires_at && new Date(row.expires_at) < now,
  );

  if (isExpired) {
    const eventId = rows[0].event_id;

    for (const row of rows) {
      await releaseTicketQuantity(row.ticket_type_id, row.quantity);
    }

    const totalDiscountedUnits = rows.reduce(
      (sum, row) => sum + (row.discounted_units || 0),
      0,
    );
    const promoCode = rows[0].promo_code;

    if (promoCode && totalDiscountedUnits > 0) {
      const { data: promo } = await supabase
        .from("promo_code")
        .select("id")
        .eq("promo_code", promoCode)
        .maybeSingle();

      if (promo) {
        await releasePromoUsage(
          promo.id,
          user.id,
          eventId,
          totalDiscountedUnits,
        );
      }
    }

    await supabase
      .from("ticket_checkout")
      .update({ status: "expired" })
      .in(
        "id",
        rows.map((row) => row.id),
      );

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

  for (const row of rows) {
    let ticketsCreated = 0;

    for (let i = 0; i < row.quantity; i++) {
      const ticketCode = generateTicketCode();

      const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);

      const uploadResponse = await saveEventQrCodeToCloudinary(
        qrCodeBase64,
        ticketCode,
      );

      if (uploadResponse.error) {
        console.log(
          `Error saving QR code to cloudinary:${uploadResponse.error}`,
        );

        await releaseTicketQuantity(
          row.ticket_type_id,
          row.quantity - ticketsCreated,
        );

        return { status: 500, message: "Something went wrong!" };
      }

      const { data: insertedTicket, error: insertTicketError } = await supabase
        .from("ticket")
        .insert({
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
        })
        .select("id")
        .maybeSingle();

      if (insertTicketError) {
        console.log(`Error inserting ticket: ${insertTicketError.message}`);

        await releaseTicketQuantity(
          row.ticket_type_id,
          row.quantity - ticketsCreated,
        );

        return {
          status: 500,
          message: "Something went wrong!",
        };
      }

      if (!insertedTicket) {
        await releaseTicketQuantity(
          row.ticket_type_id,
          row.quantity - ticketsCreated,
        );

        return {
          status: 500,
          message: "Ticket insertion failed — no ID returned",
        };
      }

      ticketsCreated++;
    }

    const attendanceInsertResponse = await insertUserAttendance(
      eventId,
      row.quantity,
      row.ticket_type_id,
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

  return { status: 200, message: "Tickets generated successfully" };
}
