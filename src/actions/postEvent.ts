"use server";

import { createClient } from "@/config/supabase/server";
import type { PostsType } from "@/types/postsType";
import { generateEventCode } from "@/utils/eventCodeGenerator";
import { generateSlug } from "@/utils/geerateSlug";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

export async function postEvent(formData: PostsType) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const {
    category,
    singleTicket,
    selectedNetwork,
    receivingAccountDetails,
    paymentOption,
    checked,
    multipleTickets,
    types,
    title,
    description,
    latitude,
    longitude,
    address,
    singleTicketQuantity,
    website_url,
    freeEvents,
    currency,
    capacity,
    selectedFile,
    starts_at,
    ends_at,
    promoCodes,
    specific_dates,
  } = formData;

  const eventCode = generateEventCode(title);

  const isFreeEvent = freeEvents === "Free";

  const flyerUpload = await saveEventFlyerToCloudinary(selectedFile);

  if (!flyerUpload?.public_id || !flyerUpload?.version) {
    return {
      status: 500,
      message: "Flyer upload to Cloudinary failed.",
    };
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const slug = generateSlug(title);

  const { public_id, version } = flyerUpload;

  // Handle specific dates or start and end times
  const eventStartDate = starts_at;
  const eventEndDate = ends_at;
  let eventDates = specific_dates || [];

  // If specific_dates is not provided, use the provided start and end date
  if (!specific_dates || specific_dates.length === 0) {
    eventDates = [];
  }

  // 3. Insert the event
  const { data: insertedEvent, error: insertError } = await supabase
    .from("event")
    .insert({
      slug,
      title: formattedTitle,
      description: description,
      event_code: eventCode,
      location: `POINT(${longitude} ${latitude})`,
      address: { full_address: address },
      capacity: capacity,
      created_at: new Date(),
      organizer_id: user.id,
      website_url: website_url,
      flyer_public_id: public_id,
      flyer_version: version,
      starts_at: eventStartDate ?? null,
      ends_at: eventEndDate ?? null,
      event_dates: eventDates ?? null,
      status: "published",
      event_category: category,
      event_type: types,
      require_registration: checked,
    })
    .select("id") // ✅ Better: Get inserted event ID directly
    .single();

  if (insertError || !insertedEvent) {
    return {
      status: 500,
      message: `Error inserting event: ${insertError?.message}`,
    };
  }

  const eventId = insertedEvent.id;

  // isert receiving account if event is not free
  if (paymentOption && paymentOption === "Mobile Money") {
    const { error: insertReceivingAccountDetailsError } = await supabase
      .from("receiving_account")
      .insert({
        full_name: receivingAccountDetails?.name,
        email: receivingAccountDetails?.email,
        phone: receivingAccountDetails?.phone,
        network_service_provider: selectedNetwork,
        user_id: user.id,
        event_id: eventId,
        payment_option: paymentOption,
      });

    if (insertReceivingAccountDetailsError) {
      console.log(
        `Error inserting user receiving account details: ${insertReceivingAccountDetailsError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }
  }

  if (paymentOption && paymentOption === "Bank") {
    const { error: insertReceivingAccountDetailsError } = await supabase
      .from("receiving_account")
      .insert({
        full_name: receivingAccountDetails?.name,
        email: receivingAccountDetails?.email,
        user_id: user.id,
        event_id: eventId,
        bank_name: receivingAccountDetails?.bankName,
        bank_branch: receivingAccountDetails?.branch,
        bank_account_number: receivingAccountDetails?.bankAccountNumber,
        payment_option: paymentOption,
      });

    if (insertReceivingAccountDetailsError) {
      console.log(
        `Error inserting user receiving account details: ${insertReceivingAccountDetailsError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }
  }

  // Insert ticket(s)
  if (isFreeEvent) {
    const { error: freeTicketError } = await supabase
      .from("ticket_type")
      .insert({
        event_id: eventId,
        type: "FREE",
        price: 0,
        currency,
        quantity: 0,
        available_from: null,
        available_until: null,
      });

    if (freeTicketError) {
      return {
        status: 500,
        message: `Error inserting free ticket: ${freeTicketError.message}`,
      };
    }
  } else {
    if (singleTicket) {
      const { error: singleTicketError } = await supabase
        .from("ticket_type")
        .insert({
          event_id: eventId,
          type: "SINGLE TICKET",
          price: singleTicket,
          currency,
          quantity: singleTicketQuantity,
          available_from: null,
          available_until: null,
        });

      if (singleTicketError) {
        return {
          status: 500,
          message: `Error inserting single ticket: ${singleTicketError.message}`,
        };
      }
    }

    if (multipleTickets?.length) {
      for (const ticket of multipleTickets) {
        const { category, price, quantity, availableFrom, availableUntil } =
          ticket;

        const { error: multipleTicketError } = await supabase
          .from("ticket_type")
          .insert({
            event_id: eventId,
            type: category,
            price,
            quantity,
            available_from: availableFrom,
            available_until: availableUntil,
            currency,
          });

        if (multipleTicketError) {
          return {
            status: 500,
            message: `Error inserting ticket category ${category}: ${multipleTicketError.message}`,
          };
        }
      }
    }
  }

  // Insert promo codes if any
  if (promoCodes && promoCodes.length > 0) {
    const promoInsertPayload = promoCodes.map((promo) => ({
      event_id: eventId,
      promo_code: promo.promoCode,
      discount_percentage: promo.discount,
      expires_at: promo.expiryDate,
      max_uses: promo.maximumUse,
      is_active: promo.expiryDate > new Date(),
    }));

    const { error: promoInsertError } = await supabase
      .from("promo_code")
      .insert(promoInsertPayload);

    if (promoInsertError) {
      return {
        status: 500,
        message: `Error inserting promo codes: ${promoInsertError.message}`,
      };
    }
  }

  return { status: 200, message: "Event posted successfully!" };
}
