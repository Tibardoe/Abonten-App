"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PostEventCoreResult,
  postEventCore,
} from "@abonten/services/events/postEventCore";
import type { PostsType } from "@abonten/types/postsType";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

export async function postEvent(
  formData: PostsType,
): Promise<PostEventCoreResult | { status: 400 | 401 | 500; message: string }> {
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

  const { selectedFile, existingFlyer } = formData;

  // A continued draft whose flyer wasn't replaced already has an uploaded
  // Cloudinary asset — reuse it instead of uploading again.
  let flyerPublicId: string;
  let flyerVersion: string | number;

  if (existingFlyer) {
    flyerPublicId = existingFlyer.public_id;
    flyerVersion = existingFlyer.version;
  } else if (selectedFile) {
    const flyerUpload = await saveEventFlyerToCloudinary(selectedFile);

    if (!flyerUpload?.public_id || !flyerUpload?.version) {
      return {
        status: 500,
        message:
          (flyerUpload as { error?: string })?.error ??
          "Flyer upload to Cloudinary failed.",
      };
    }

    flyerPublicId = flyerUpload.public_id;
    flyerVersion = flyerUpload.version;
  } else {
    return { status: 400, message: "An event flyer is required." };
  }

  return postEventCore(supabase, user.id, {
    title: formData.title,
    description: formData.description,
    category: formData.category,
    types: formData.types,
    address: formData.address,
    latitude: formData.latitude,
    longitude: formData.longitude,
    capacity: formData.capacity ?? null,
    websiteUrl: formData.website_url ?? null,
    requireRegistration: formData.checked,
    currency: formData.currency,
    startsAt: formData.starts_at ?? null,
    endsAt: formData.ends_at ?? null,
    specificDates: formData.specific_dates ?? null,
    freeEvent: formData.freeEvents === "Free",
    singleTicket:
      formData.singleTicket != null
        ? {
            price: formData.singleTicket,
            quantity: formData.singleTicketQuantity ?? null,
          }
        : null,
    multipleTickets: (formData.multipleTickets ?? []).map((ticket) => ({
      type: ticket.category ?? "",
      price: ticket.price,
      quantity: ticket.quantity ?? null,
      availableFrom: ticket.availableFrom ?? null,
      availableUntil: ticket.availableUntil ?? null,
    })),
    promoCodes: formData.promoCodes ?? null,
    flyerPublicId,
    flyerVersion: String(flyerVersion),
    clientRequestId: formData.clientRequestId,
    placeId: formData.placeId ?? null,
    draftId: formData.draftId ?? null,
  });
}
