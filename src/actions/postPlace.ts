"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import type { PlaceFormType } from "@/types/placeType";
import { generateSlug } from "@/utils/geerateSlug";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

export async function postPlace(formData: PlaceFormType) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const {
    name,
    categoryId,
    description,
    address,
    latitude,
    longitude,
    websiteUrl,
    phone,
    whatsapp,
    socialLinks,
    selectedFile,
    openingHours,
    services,
    clientRequestId,
  } = formData;

  if (!selectedFile) {
    return { status: 400, message: "A cover photo is required." };
  }

  const coverUpload = await savePlacePhotoToCloudinary(selectedFile);

  if (!coverUpload?.public_id || !coverUpload?.version) {
    return {
      status: 500,
      message:
        (coverUpload as { error?: string })?.error ??
        "Cover photo upload to Cloudinary failed.",
    };
  }

  // Places have no event-code-style human identifier to append (unlike
  // postEvent.ts's slug, which leans on eventCode's random suffix) — a
  // short random suffix does the same collision-resistance job here.
  const slug = `${generateSlug(name)}-${randomUUID().split("-")[0]}`;

  const openingHoursPayload =
    openingHours && openingHours.length > 0
      ? openingHours.map((hour) => ({
          day_of_week: hour.dayOfWeek,
          open_time: hour.openTime,
          close_time: hour.closeTime,
          is_closed: hour.isClosed,
        }))
      : null;

  const servicesPayload =
    services && services.length > 0
      ? services.map((service) => ({
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
      p_client_request_id: clientRequestId,
      p_owner_id: user.id,
      p_name: name,
      p_slug: slug,
      p_description: description,
      p_category_id: categoryId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_address: { full_address: address },
      p_website_url: websiteUrl ?? null,
      p_phone: phone ?? null,
      p_whatsapp: whatsapp ?? null,
      p_social_links: socialLinks ?? null,
      p_cover_public_id: coverUpload.public_id,
      p_cover_version: String(coverUpload.version),
      p_opening_hours: openingHoursPayload,
      p_services: servicesPayload,
    },
  );

  if (createPlaceError) {
    if (createPlaceError.code === UNIQUE_VIOLATION) {
      // place_slug_key collisions are extremely unlikely given the random
      // suffix, and client_request_id collisions are already handled inside
      // create_place itself (ON CONFLICT DO NOTHING) — this is a generic,
      // retry-friendly fallback rather than a specific message about any
      // one field.
      return {
        status: 500,
        message: "We couldn't publish your place. Please try again.",
      };
    }

    console.log(`Error creating place: ${createPlaceError.message}`);
    return {
      status: 500,
      message: "We couldn't publish your place. Please try again.",
    };
  }

  return {
    status: 200,
    message: "Place published successfully!",
    placeId: placeId as string,
    slug,
  };
}
