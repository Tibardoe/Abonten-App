import {
  type StructuredAddress,
  readStructuredAddress,
} from "@abonten/core/geo/address";
import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import { destroyAsset } from "@abonten/services/media/cloudinaryClient";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveListingLocation } from "../geo/locationResolution";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth body of updatePlace, lifted so the mobile
// PATCH /api/mobile/organizer/places/:id route runs the exact same edit.
// Like updateEventCore, the platform difference (server File upload vs
// device signed upload) is resolved by the caller passing an already-
// uploaded coverPublicId/coverVersion; omit both to keep the current
// cover. Deliberately doesn't touch opening hours / services / the photo
// gallery — those have their own endpoints. NOT a "use server" file.

export type UpdatePlaceCoreInput = {
  placeId: string;
  name: string;
  description: string;
  categoryId: number;
  websiteUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  socialLinks?: Record<string, string> | null;
  address: string;
  addressDetails?: Partial<StructuredAddress> | null;
  latitude: number;
  longitude: number;
  // Both omitted (undefined) = keep the current cover photo.
  coverPublicId?: string | null;
  coverVersion?: string | null;
};

export type UpdatePlaceCoreResult = {
  status: 200 | 400 | 403 | 404 | 500;
  message: string;
};

export async function updatePlaceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdatePlaceCoreInput,
): Promise<UpdatePlaceCoreResult> {
  const {
    placeId,
    name,
    description,
    categoryId,
    websiteUrl,
    phone,
    whatsapp,
    socialLinks,
    address,
    latitude,
    longitude,
    coverPublicId,
    coverVersion,
  } = input;

  const locationCheck = validateLocationInput({ address, latitude, longitude });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  const resolved = await resolveListingLocation({
    lat: latitude,
    lng: longitude,
    countryHint: input.addressDetails?.country_code ?? null,
  });
  if (!resolved.ok) return { status: 400, message: resolved.message };
  const { location } = resolved;

  const { data: existingPlace, error: fetchError } = await supabase
    .from("place")
    .select("id, owner_id, cover_public_id")
    .eq("id", placeId)
    .maybeSingle();

  if (fetchError || !existingPlace) {
    return { status: 404, message: "Place not found" };
  }

  if (existingPlace.owner_id !== userId) {
    return { status: 403, message: "Not authorized to edit this place" };
  }

  const replacingCover = !!coverPublicId && !!coverVersion;
  const previousCoverPublicId = replacingCover
    ? (existingPlace.cover_public_id as string | null)
    : null;

  const { error: updateError } = await supabase
    .from("place")
    .update({
      name,
      description,
      category_id: categoryId,
      website_url: websiteUrl ?? null,
      phone: phone ?? null,
      whatsapp: whatsapp ?? null,
      social_links: socialLinks ?? null,
      address: {
        ...readStructuredAddress(input.addressDetails ?? null),
        full_address: address,
        country_code: location.countryCode,
      },
      location: `POINT(${longitude} ${latitude})`,
      ...(replacingCover && {
        cover_public_id: coverPublicId,
        cover_version: coverVersion,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", placeId)
    .eq("owner_id", userId);

  if (updateError) {
    logger.error(`updatePlaceCore: update failed (${updateError.message})`);
    return {
      status: 500,
      message: "We couldn't save your place. Please try again.",
    };
  }

  // Country and zone are resolved here from the venue, so the service role
  // writes them: owners can't set them directly (guard_listing_market_columns).
  const { error: marketError } = await getSupabaseServiceClient()
    .from("place")
    .update({ country_code: location.countryCode, timezone: location.timeZone })
    .eq("id", placeId)
    .eq("owner_id", userId);
  if (marketError) {
    logger.error(
      `updatePlaceCore: market update failed (${marketError.message})`,
    );
    return {
      status: 500,
      message: "We couldn't save your place. Please try again.",
    };
  }

  if (previousCoverPublicId && previousCoverPublicId !== coverPublicId) {
    try {
      await destroyAsset(previousCoverPublicId, {});
    } catch (cloudError) {
      logger.error(
        "Cloudinary deletion of old cover photo failed:",
        cloudError,
      );
      // Not failing the whole update if cleanup of the old cover fails.
    }
  }

  return { status: 200, message: "Place updated successfully!" };
}
