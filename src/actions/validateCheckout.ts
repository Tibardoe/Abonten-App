"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import getPromoCode from "./getPromoCode";

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
};

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
      status: 500,
      message: "User not logged in",
    };
  }

  // check if user has a pending ticket checkout
  const { data: ticketCheckoutData, error: ticketCheckoutDataError } =
    await supabase
      .from("ticket_checkout")
      .select("checkout_session_id, event_id, status")
      .eq("user_id", user.id)
      .eq("event_id", eventId);

  if (ticketCheckoutDataError || !ticketCheckoutData) {
    console.log(
      `Error fetching ticket checkout data: ${ticketCheckoutDataError.message}`,
    );

    return { status: 500, message: "Something went wrong" };
  }

  const pendingCheckout = ticketCheckoutData?.find(
    (checkout) => checkout.status === "pending",
  );

  if (pendingCheckout) {
    return {
      status: 300,
      checkoutId: pendingCheckout.checkout_session_id,
      message: "You already have a pending ticket checkout for this event",
    };
  }

  // Check if user has already bought ticket for the event
  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, ticket_type_id(event_id)")
    .eq("user_id", user.id);

  if (ticketDataError || !rawTicketData) {
    console.log(`Error fetching ticket data: ${ticketDataError.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) => ticket.ticket_type_id.event_id === eventId,
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

  let promoCodeDiscount: number | null = null;

  if (promoCode) {
    const promoCodeResponse = await getPromoCode(promoCode);

    if (promoCodeResponse.status !== 200) {
      return {
        status: promoCodeResponse.status,
        message: promoCodeResponse.message,
      };
    }

    promoCodeDiscount = promoCodeResponse.discountPercentage / 100;
  }

  const selectedTickets = await Promise.all(
    Object.entries(quantities)
      .filter(([_id, value]) => value > 0)
      .map(async ([ticketTypeId, quantity]) => {
        const { data: ticketType, error: ticketError } = await supabase
          .from("ticket_type")
          .select("*")
          .eq("id", ticketTypeId)
          .maybeSingle();

        if (ticketError || !ticketType) {
          return {
            status: 404,
            message: `Ticket of type ${ticketTypeId} not found`,
          };
        }

        if (quantity > ticketType.quantity) {
          return {
            status: 300,
            message: "Your ticket puchase quantity exceed ticket quantity",
          };
        }

        const unitPrice = ticketType.price;
        const discount = promoCodeDiscount ? promoCodeDiscount * unitPrice : 0;
        const finalPrice = unitPrice - discount;

        return {
          ticketTypeId,
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          discount,
          amount: quantity * finalPrice,
        };
      }),
  );

  // Check for any failed ticket validation
  const failed = selectedTickets.find((t) => t.status && t.status !== 200);
  if (failed) {
    return failed;
  }

  if (selectedTickets.length === 0) {
    return { status: 404, message: "Please select at least one ticket." };
  }

  const checkoutSessionId = randomUUID();

  for (const ticket of selectedTickets) {
    const { error: checkoutIdError } = await supabase
      .from("ticket_checkout")
      .insert({
        checkout_session_id: checkoutSessionId,
        user_id: user.id,
        event_id: eventId,
        ticket_type_id: ticket.ticketTypeId,
        quantity: ticket.quantity,
        unit_price: ticket.unitPrice,
        promo_code: promoCode ?? null,
        discount: ticket.discount,
        total_price: ticket.amount,
      });

    if (checkoutIdError) {
      console.log(`Failed to insert checkout: ${checkoutIdError.message}`);

      console.log("hww");

      return {
        status: 500,
        message: "Something went wrong!",
      };
    }
  }

  return { status: 200, checkoutSessionId };
}
