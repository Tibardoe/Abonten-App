"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import claimPromoUsage from "./claimPromoUsage";
import getPromoCode from "./getPromoCode";
import releasePromoUsage from "./releasePromoUsage";
import releaseTicketQuantity from "./releaseTicketQuantity";
import reserveTicketQuantity from "./reserveTicketQuantity";

const CHECKOUT_RESERVATION_MINUTES = 15;

type CheckoutDetailsProp = {
  eventId: string;
  quantities: { [ticketTypeId: string]: number };
  promoCode?: string | null;
};

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: {
    event_id: string;
  };
  status: string;
};

type PendingCheckoutRow = {
  id: string;
  checkout_session_id: string;
  status: string;
  expires_at: string | null;
  ticket_type_id: string;
  quantity: number;
  promo_code: string | null;
  discounted_units: number;
};

async function releaseExpiredCheckout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  userId: string,
  rows: PendingCheckoutRow[],
) {
  for (const row of rows) {
    await releaseTicketQuantity(row.ticket_type_id, row.quantity);
  }

  const totalDiscountedUnits = rows.reduce(
    (sum, row) => sum + (row.discounted_units || 0),
    0,
  );
  const promoCode = rows[0]?.promo_code;

  if (promoCode && totalDiscountedUnits > 0) {
    const { data: promo } = await supabase
      .from("promo_code")
      .select("id")
      .eq("promo_code", promoCode)
      .maybeSingle();

    if (promo) {
      await releasePromoUsage(promo.id, userId, eventId, totalDiscountedUnits);
    }
  }

  await supabase
    .from("ticket_checkout")
    .update({ status: "expired" })
    .in(
      "id",
      rows.map((row) => row.id),
    );
}

export default async function validateCheckout({
  eventId,
  quantities,
  promoCode,
}: CheckoutDetailsProp) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log(`Error fetching user: ${userError?.message}`);

    return {
      status: 401,
      message: "User not logged in",
    };
  }

  // check if user has a pending ticket checkout
  const { data: ticketCheckoutData, error: ticketCheckoutDataError } =
    await supabase
      .from("ticket_checkout")
      .select(
        "id, checkout_session_id, event_id, status, expires_at, ticket_type_id, quantity, promo_code, discounted_units",
      )
      .eq("user_id", user.id)
      .eq("event_id", eventId)
      .eq("status", "pending");

  if (ticketCheckoutDataError) {
    console.log(
      `Error fetching ticket checkout data: ${ticketCheckoutDataError.message}`,
    );

    return { status: 500, message: "Something went wrong" };
  }

  const pendingRows = (ticketCheckoutData ?? []) as PendingCheckoutRow[];

  if (pendingRows.length > 0) {
    const now = new Date();
    const isExpired = pendingRows.some(
      (row) => row.expires_at && new Date(row.expires_at) < now,
    );

    if (!isExpired) {
      return {
        status: 300,
        checkoutId: pendingRows[0].checkout_session_id,
        message: "You already have a pending ticket checkout for this event",
      };
    }

    // The previous reservation timed out — release what it held and let
    // this request create a fresh one instead of blocking the user forever.
    await releaseExpiredCheckout(supabase, eventId, user.id, pendingRows);
  }

  // Check if user has already bought ticket for the event
  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, ticket_type_id(event_id), status")
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

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.log(`Failed to fetch event:${eventError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  if (!event) {
    return { status: 404, message: "No event found!" };
  }

  let promoCodeId: string | null = null;
  let promoCodeDiscount: number | null = null;
  // null = unlimited remaining uses; otherwise the number of ticket units
  // still eligible for the discount, re-read fresh from the DB right now so
  // a slot claimed by another checkout between "Apply" and "Proceed" is honored.
  let remainingEligibleUnits: number | null = null;

  if (promoCode) {
    const promoCodeResponse = await getPromoCode(promoCode, eventId);

    if (promoCodeResponse.status !== 200) {
      return {
        status: promoCodeResponse.status,
        message: promoCodeResponse.message,
      };
    }

    promoCodeId = promoCodeResponse.id;
    promoCodeDiscount = promoCodeResponse.discountPercentage / 100;
    remainingEligibleUnits = promoCodeResponse.remainingUses ?? null;
  }

  // Reserve inventory for every requested ticket type up front (this is the
  // "checkout begins" reservation — Option B from the checkout redesign:
  // holding the units now, and releasing them on expiry/cancellation, avoids
  // telling a buyer their checkout is valid only to find the ticket gone at
  // payment time). Each reservation uses the same atomic compare-and-swap
  // as reserveTicketQuantity always has; if any later item in this request
  // fails, everything reserved so far in THIS request is rolled back.
  const reserved: { ticketTypeId: string; quantity: number }[] = [];
  const rows: {
    ticketTypeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    discountedUnits: number;
    amount: number;
  }[] = [];

  const rollbackReservations = async () => {
    for (const item of reserved) {
      await releaseTicketQuantity(item.ticketTypeId, item.quantity);
    }
  };

  for (const [ticketTypeId, quantity] of Object.entries(quantities).filter(
    ([_id, value]) => value > 0,
  )) {
    const { data: ticketType, error: ticketError } = await supabase
      .from("ticket_type")
      .select("*")
      .eq("id", ticketTypeId)
      .maybeSingle();

    if (ticketError || !ticketType) {
      await rollbackReservations();
      return {
        status: 404,
        message: `Ticket of type ${ticketTypeId} not found`,
      };
    }

    const reservation = await reserveTicketQuantity(ticketTypeId, quantity);

    if (reservation.status !== 200) {
      await rollbackReservations();
      return { status: reservation.status, message: reservation.message };
    }

    reserved.push({ ticketTypeId, quantity });

    const unitPrice = ticketType.price;

    let eligibleUnits = 0;
    if (promoCodeDiscount) {
      eligibleUnits =
        remainingEligibleUnits === null
          ? quantity
          : Math.min(quantity, remainingEligibleUnits);

      if (remainingEligibleUnits !== null) {
        remainingEligibleUnits -= eligibleUnits;
      }
    }

    const discount = promoCodeDiscount
      ? promoCodeDiscount * unitPrice * eligibleUnits
      : 0;
    const amount = Math.max(0, quantity * unitPrice - discount);

    rows.push({
      ticketTypeId,
      quantity,
      unitPrice,
      discount,
      discountedUnits: eligibleUnits,
      amount,
    });
  }

  if (rows.length === 0) {
    await rollbackReservations();
    return { status: 404, message: "Please select at least one ticket." };
  }

  const totalDiscountedUnits = rows.reduce(
    (sum, row) => sum + row.discountedUnits,
    0,
  );

  if (promoCodeId && totalDiscountedUnits > 0) {
    const claim = await claimPromoUsage(
      promoCodeId,
      user.id,
      eventId,
      totalDiscountedUnits,
    );

    if (claim.status !== 200) {
      await rollbackReservations();
      return { status: claim.status, message: claim.message };
    }
  }

  const checkoutSessionId = randomUUID();
  const expiresAt = new Date(
    Date.now() + CHECKOUT_RESERVATION_MINUTES * 60 * 1000,
  );

  const { error: checkoutInsertError } = await supabase
    .from("ticket_checkout")
    .insert(
      rows.map((row) => ({
        checkout_session_id: checkoutSessionId,
        user_id: user.id,
        event_id: eventId,
        ticket_type_id: row.ticketTypeId,
        quantity: row.quantity,
        unit_price: row.unitPrice,
        promo_code: promoCode ?? null,
        discount: row.discount,
        discounted_units: row.discountedUnits,
        total_price: row.amount,
        status: "pending",
        expires_at: expiresAt,
      })),
    );

  if (checkoutInsertError) {
    console.log(`Failed to insert checkout: ${checkoutInsertError.message}`);

    await rollbackReservations();
    if (promoCodeId && totalDiscountedUnits > 0) {
      await releasePromoUsage(
        promoCodeId,
        user.id,
        eventId,
        totalDiscountedUnits,
      );
    }

    return {
      status: 500,
      message: "Something went wrong!",
    };
  }

  return { status: 200, checkoutSessionId };
}
