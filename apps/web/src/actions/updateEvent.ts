"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UpdateEventCoreResult,
  updateEventCore,
} from "@/utils/updateEventCore";
import { revalidatePath } from "next/cache";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

export type UpdateEventInput = {
  eventId: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  website_url?: string;
  category: string;
  types: string[];
  checked: boolean;
  starts_at?: Date;
  ends_at?: Date;
  specific_dates?: { start: Date; end: Date }[];
  selectedFile?: File | null;
};

/**
 * Edits the core, non-ticketing fields of an event an organizer already
 * created — title/description/location/schedule/flyer/category. Featuring an
 * event is handled exclusively by the paid Promotion flow, not here.
 * Deliberately does NOT touch ticket_type / promo_code / receiving_account
 * (see updateEventCore for why). Query body shared with the mobile
 * PATCH /api/mobile/organizer/events/:id route via @/utils/updateEventCore;
 * this wrapper only adds auth, server-side flyer-File upload, and the
 * Next cache revalidation the app router needs.
 */
export async function updateEvent(
  formData: UpdateEventInput,
): Promise<UpdateEventCoreResult | { status: 401 | 500; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  let flyerPublicId: string | undefined;
  let flyerVersion: string | undefined;

  if (formData.selectedFile) {
    const flyerUpload = await saveEventFlyerToCloudinary(formData.selectedFile);

    if (!flyerUpload?.public_id || !flyerUpload?.version) {
      return {
        status: 500,
        message:
          (flyerUpload as { error?: string })?.error ??
          "Flyer upload to Cloudinary failed.",
      };
    }

    flyerPublicId = flyerUpload.public_id;
    flyerVersion = String(flyerUpload.version);
  }

  const result = await updateEventCore(supabase, user.id, {
    eventId: formData.eventId,
    title: formData.title,
    description: formData.description,
    address: formData.address,
    latitude: formData.latitude,
    longitude: formData.longitude,
    capacity: formData.capacity,
    website_url: formData.website_url,
    category: formData.category,
    types: formData.types,
    checked: formData.checked,
    starts_at: formData.starts_at,
    ends_at: formData.ends_at,
    specific_dates: formData.specific_dates,
    flyerPublicId,
    flyerVersion,
  });

  if (result.status === 200) {
    revalidatePath("/manage/my-events");
    revalidatePath(`/manage/events/${formData.eventId}`);
    revalidatePath("/manage/dashboard");
    // The public event page is ISR-cached and shows the title/description/
    // capacity/schedule/flyer this action just changed.
    revalidatePath(`/events/${result.eventCode.toLowerCase()}`);
  }

  return result;
}
