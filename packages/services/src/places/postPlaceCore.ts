import { randomUUID } from "node:crypto";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import type { Database } from "@abonten/types/database.types";
import type {
  PlaceOpeningHoursInput,
  PlaceServiceInput,
} from "@abonten/types/placeType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth, post-cover-upload body of postPlace, lifted so the
// `/api/mobile/places` route runs the exact same create flow as the web
// Server Action. The one thing that legitimately differs by platform — how
// the cover photo bytes reach Cloudinary (web: a File uploaded server-side
// by savePlacePhotoToCloudinary; mobile: a signed direct upload from the
// device) — is resolved by the caller, which hands this an already-uploaded
// `coverPublicId` / `coverVersion`. Everything below (location check, slug,
// the create_place RPC, draft cleanup) is identical for both. Deliberately
// NOT a "use server" file (see ticketInventory.ts).

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

export type PostPlaceCoreInput = {
  name: string;
  categoryId: number;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  websiteUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  socialLinks?: Record<string, string> | null;
  coverPublicId: string;
  coverVersion: string;
  openingHours: PlaceOpeningHoursInput[];
  services?: PlaceServiceInput[] | null;
  // Generated once per submission and reused across retries so create_place
  // can recognise a replay and return the already-created place instead of
  // inserting a duplicate (mirrors PlaceFormType.clientRequestId).
  clientRequestId: string;
  // Set when publishing from a continued draft — deleted here once the
  // place is actually created.
  draftId?: string | null;
};

export type PostPlaceCoreResult =
  | { status: 400 | 500; message: string }
  | { status: 200; message: string; placeId: string; slug: string };

export async function postPlaceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: PostPlaceCoreInput,
): Promise<PostPlaceCoreResult> {
  const locationCheck = validateLocationInput({
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  // Places have no event-code-style human identifier to append (unlike
  // postEvent.ts) — a short random suffix does the collision-resistance job.
  const slug = `${generateSlug(input.name)}-${randomUUID().split("-")[0]}`;

  const openingHoursPayload =
    input.openingHours && input.openingHours.length > 0
      ? input.openingHours.map((hour) => ({
          day_of_week: hour.dayOfWeek,
          open_time: hour.openTime,
          close_time: hour.closeTime,
          is_closed: hour.isClosed,
        }))
      : null;

  const servicesPayload =
    input.services && input.services.length > 0
      ? input.services.map((service) => ({
          name: service.name,
          description: service.description ?? null,
          price: service.price ?? null,
          price_unit: service.priceUnit ?? null,
          show_price: service.showPrice,
        }))
      : null;

  const { data: placeId, error: createPlaceError } = await supabase.rpc(
    "create_place",
    {
      p_client_request_id: input.clientRequestId,
      p_owner_id: userId,
      p_name: input.name,
      p_slug: slug,
      p_description: input.description,
      p_category_id: input.categoryId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_address: { full_address: input.address },
      p_website_url: input.websiteUrl ?? null,
      p_phone: input.phone ?? null,
      p_whatsapp: input.whatsapp ?? null,
      p_social_links: input.socialLinks ?? null,
      p_cover_public_id: input.coverPublicId,
      p_cover_version: String(input.coverVersion),
      p_opening_hours: openingHoursPayload,
      p_services: servicesPayload,
    } as unknown as Database["public"]["Functions"]["create_place"]["Args"],
  );

  if (createPlaceError) {
    // client_request_id collisions are handled inside create_place itself
    // (ON CONFLICT DO NOTHING); a slug collision is extremely unlikely given
    // the random suffix. Either way this is a generic, retry-friendly
    // fallback.
    if (createPlaceError.code !== UNIQUE_VIOLATION) {
      logger.error(`Error creating place: ${createPlaceError.message}`);
    }
    return {
      status: 500,
      message: "We couldn't publish your place. Please try again.",
    };
  }

  // Only delete the source draft after the place has actually been created.
  // Best-effort: a failure here doesn't affect the publish result, and a
  // stray draft just expires naturally in 48h.
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
    message: "Place published successfully!",
    placeId: placeId as string,
    slug,
  };
}
