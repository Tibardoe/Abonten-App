import { generateEventCode } from "@abonten/core/eventCodeGenerator";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth, post-flyer-upload body of postEvent, lifted so the
// `/api/mobile/events` route runs the exact same create flow as the web
// Server Action. The one platform difference — how the flyer bytes reach
// Cloudinary (web: a File uploaded server-side by saveEventFlyerToCloudinary;
// mobile: a signed direct upload from the device) — is resolved by the
// caller, which hands this an already-uploaded `flyerPublicId` /
// `flyerVersion`. Everything below (location check, event code, slug, the
// ticket/promo/date payload shaping, the create_event RPC, draft cleanup)
// is identical for both. Deliberately NOT a "use server" file.

const UNIQUE_VIOLATION = "23505";

type DateInput = string | Date;

export type PostEventCoreInput = {
  title: string;
  description: string;
  category: string;
  types: string[];
  address: string;
  latitude: number;
  longitude: number;
  capacity?: number | null;
  websiteUrl?: string | null;
  requireRegistration: boolean;
  // Passed straight into each ticket type's `currency`. The web form always
  // resolves this (defaults to "GHS"); left nullable to match its type.
  currency: string | null | undefined;
  // Schedule — a single start/end range OR a list of specific date entries
  // (occurrences), never both.
  startsAt?: DateInput | null;
  endsAt?: DateInput | null;
  specificDates?: { start: DateInput; end: DateInput }[] | null;
  // Ticketing — free, a single paid tier, or multiple named tiers.
  freeEvent?: boolean;
  singleTicket?: { price: number; quantity: number | null } | null;
  multipleTickets?:
    | {
        type: string;
        price: number;
        quantity: number | null;
        availableFrom?: DateInput | null;
        availableUntil?: DateInput | null;
      }[]
    | null;
  promoCodes?:
    | {
        promoCode: string;
        discount: number;
        maximumUse: number;
        expiryDate: DateInput;
      }[]
    | null;
  flyerPublicId: string;
  flyerVersion: string;
  // Generated once per submission and reused across retries so create_event
  // can recognise a replay and return the already-created event.
  clientRequestId: string;
  placeId?: string | null;
  draftId?: string | null;
};

export type PostEventCoreResult =
  | { status: 400 | 409 | 500; message: string }
  | { status: 200; message: string; eventId: string };

export async function postEventCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: PostEventCoreInput,
): Promise<PostEventCoreResult> {
  const locationCheck = validateLocationInput({
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  const eventCode = generateEventCode(input.title);

  const formattedTitle = input.title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  // generateSlug(title) alone collides for same-titled events; eventCode
  // carries a random suffix, so appending it keeps the slug unique without
  // touching the unique constraint (slug is search-only, not routing).
  const slug = `${generateSlug(input.title)}-${generateSlug(eventCode)}`;

  const isSpecificEvent =
    !!input.specificDates && input.specificDates.length > 0;

  const eventStartDate = isSpecificEvent ? null : (input.startsAt ?? null);
  const eventEndDate = isSpecificEvent ? null : (input.endsAt ?? null);

  const specificDatesPayload = isSpecificEvent
    ? // biome-ignore lint/style/noNonNullAssertion: guarded by isSpecificEvent
      input.specificDates!.map((entry) => ({
        start: entry.start,
        end: entry.end,
      }))
    : null;

  const ticketTypesPayload = input.freeEvent
    ? [
        {
          type: "FREE",
          price: 0,
          currency: input.currency,
          quantity: input.capacity ?? null,
          available_from: null,
          available_until: null,
        },
      ]
    : [
        ...(input.singleTicket
          ? [
              {
                type: "SINGLE TICKET",
                price: input.singleTicket.price,
                currency: input.currency,
                quantity: input.singleTicket.quantity,
                available_from: null,
                available_until: null,
              },
            ]
          : []),
        ...(input.multipleTickets ?? []).map((ticket) => ({
          type: ticket.type,
          price: ticket.price,
          quantity: ticket.quantity,
          available_from: ticket.availableFrom ?? null,
          available_until: ticket.availableUntil ?? null,
          currency: input.currency,
        })),
      ];

  const promoCodesPayload =
    input.promoCodes && input.promoCodes.length > 0
      ? input.promoCodes.map((promo) => ({
          promo_code: promo.promoCode,
          discount_percentage: promo.discount,
          expires_at: promo.expiryDate,
          max_uses: promo.maximumUse,
        }))
      : null;

  const { data: eventId, error: createEventError } = await supabase.rpc(
    "create_event",
    // create_event's SQL signature has no DEFAULT on several of these
    // params even though the function genuinely accepts (and this app has
    // always passed) null for "not set" -- a generated-type gap, not a
    // real constraint. Same class of cast as get_filtered_events, see
    // useFilteredEvents.ts on mobile for the fuller explanation.
    {
      p_client_request_id: input.clientRequestId,
      p_organizer_id: userId,
      p_title: formattedTitle,
      p_slug: slug,
      p_description: input.description,
      p_event_code: eventCode,
      p_event_category: input.category,
      p_event_type: input.types,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_address: { full_address: input.address },
      p_capacity: input.capacity ?? null,
      p_website_url: input.websiteUrl ?? null,
      p_flyer_public_id: input.flyerPublicId,
      p_flyer_version: String(input.flyerVersion),
      p_starts_at: eventStartDate,
      p_ends_at: eventEndDate,
      p_require_registration: input.requireRegistration,
      // Featuring an event happens only through the paid Promotion flow.
      p_featured: false,
      p_specific_dates: specificDatesPayload,
      p_ticket_types: ticketTypesPayload.length > 0 ? ticketTypesPayload : null,
      p_promo_codes: promoCodesPayload,
      p_receiving_account: null,
      p_place_id: input.placeId ?? null,
    } as unknown as Database["public"]["Functions"]["create_event"]["Args"],
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
      return {
        status: 500,
        message: "We couldn't post your event. Please try again.",
      };
    }

    logger.error(`Error creating event: ${createEventError.message}`);
    return {
      status: 500,
      message: "We couldn't post your event. Please try again.",
    };
  }

  if (input.draftId) {
    const { error: deleteDraftError } = await supabase
      .from("drafts")
      .delete()
      .eq("id", input.draftId)
      .eq("user_id", userId);

    if (deleteDraftError) {
      logger.error(
        `Failed to delete draft ${input.draftId} after successful publish: ${deleteDraftError.message}`,
      );
    }
  }

  return {
    status: 200,
    message: "Event posted successfully!",
    eventId: eventId as string,
  };
}
