"use server";

import { createClient } from "@/config/supabase/server";
import type { PostsType } from "@/types/postsType";
import { generateEventCode } from "@/utils/eventCodeGenerator";
import { generateSlug } from "@/utils/geerateSlug";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

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
    featured,
    clientRequestId,
  } = formData;

  const eventCode = generateEventCode(title);

  const isFreeEvent = freeEvents === "Free";

  const flyerUpload = await saveEventFlyerToCloudinary(selectedFile);

  if (!flyerUpload?.public_id || !flyerUpload?.version) {
    return {
      status: 500,
      message:
        (flyerUpload as { error?: string })?.error ??
        "Flyer upload to Cloudinary failed.",
    };
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  // generateSlug(title) alone is purely deterministic from the title, so two
  // events with the same title (any organizer) produced the same slug and
  // collided on event_slug_key -- surfacing to users as "duplicate title".
  // eventCode already carries a random suffix, so appending it here makes
  // the slug collision-resistant without touching the unique constraint
  // (slug isn't used for routing -- only for ILIKE search -- so the
  // human-readable prefix still matches search text).
  const slug = `${generateSlug(title)}-${generateSlug(eventCode)}`;

  const { public_id, version } = flyerUpload;

  // Handle specific dates or start and end times
  const isSpecificEvent = specific_dates && specific_dates.length > 0;

  const eventStartDate = isSpecificEvent ? null : starts_at;
  const eventEndDate = isSpecificEvent ? null : ends_at;

  const specificDatesPayload = isSpecificEvent
    ? specific_dates.map((entry) => ({ start: entry.start, end: entry.end }))
    : null;

  const receivingAccountPayload =
    paymentOption === "Mobile Money"
      ? {
          full_name: receivingAccountDetails?.name,
          email: receivingAccountDetails?.email,
          phone: receivingAccountDetails?.phone,
          network_service_provider: selectedNetwork,
          payment_option: paymentOption,
        }
      : paymentOption === "Bank"
        ? {
            full_name: receivingAccountDetails?.name,
            email: receivingAccountDetails?.email,
            bank_name: receivingAccountDetails?.bankName,
            bank_branch: receivingAccountDetails?.branch,
            bank_account_number: receivingAccountDetails?.bankAccountNumber,
            payment_option: paymentOption,
          }
        : null;

  const ticketTypesPayload = isFreeEvent
    ? [
        {
          type: "FREE",
          price: 0,
          currency,
          quantity: capacity ?? null,
          available_from: null,
          available_until: null,
        },
      ]
    : [
        ...(singleTicket
          ? [
              {
                type: "SINGLE TICKET",
                price: singleTicket,
                currency,
                quantity: singleTicketQuantity,
                available_from: null,
                available_until: null,
              },
            ]
          : []),
        ...(multipleTickets ?? []).map((ticket) => ({
          type: ticket.category,
          price: ticket.price,
          quantity: ticket.quantity,
          available_from: ticket.availableFrom ?? null,
          available_until: ticket.availableUntil ?? null,
          currency,
        })),
      ];

  const promoCodesPayload =
    promoCodes && promoCodes.length > 0
      ? promoCodes.map((promo) => ({
          promo_code: promo.promoCode,
          discount_percentage: promo.discount,
          expires_at: promo.expiryDate,
          max_uses: promo.maximumUse,
        }))
      : null;

  const { data: eventId, error: createEventError } = await supabase.rpc(
    "create_event",
    {
      p_client_request_id: clientRequestId,
      p_organizer_id: user.id,
      p_title: formattedTitle,
      p_slug: slug,
      p_description: description,
      p_event_code: eventCode,
      p_event_category: category,
      p_event_type: types,
      p_latitude: latitude,
      p_longitude: longitude,
      p_address: { full_address: address },
      p_capacity: capacity ?? null,
      p_website_url: website_url ?? null,
      p_flyer_public_id: public_id,
      p_flyer_version: version,
      p_starts_at: eventStartDate ?? null,
      p_ends_at: eventEndDate ?? null,
      p_require_registration: checked,
      p_featured: featured ?? false,
      p_specific_dates: specificDatesPayload,
      p_ticket_types: ticketTypesPayload.length > 0 ? ticketTypesPayload : null,
      p_promo_codes: promoCodesPayload,
      p_receiving_account: receivingAccountPayload,
    },
  );

  if (createEventError) {
    if (createEventError.code === UNIQUE_VIOLATION) {
      if (
        createEventError.message.includes(
          "promo_code_event_id_normalized_code_key",
        )
      ) {
        return {
          status: 409,
          message:
            "One of your promo codes is already used for this event. Please use a different code.",
        };
      }

      // event_client_request_id_key can't fire here (create_event checks
      // for it before inserting); event_code/slug collisions are now
      // extremely rare thanks to their random suffixes, so this is a
      // generic fallback rather than a specific message about any one field.
      return {
        status: 500,
        message: "We couldn't post your event. Please try again.",
      };
    }

    console.log(`Error creating event: ${createEventError.message}`);
    return {
      status: 500,
      message: "We couldn't post your event. Please try again.",
    };
  }

  return {
    status: 200,
    message: "Event posted successfully!",
    eventId: eventId as string,
  };
}
