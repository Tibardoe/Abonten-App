"use server";

import { createClient } from "@/config/supabase/server";
import { v2 as cloudinary } from "cloudinary";

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: event, error: fetchError } = await supabase
    .from("event")
    .select("flyer_public_id")
    .eq("id", eventId)
    .eq("organizer_id", user.user.id)
    .single();

  if (fetchError || !event) {
    return {
      status: 404,
      message: "Event not found or unauthorized",
    };
  }

  const flyerPublicId = event.flyer_public_id;

  const { error: deleteError } = await supabase
    .from("event")
    .delete()
    .eq("id", eventId)
    .eq("organizer_id", user.user.id); // make sure you delete the correct favorite

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete event: ${deleteError.message}`,
    };
  }

  try {
    if (flyerPublicId) {
      const result = await cloudinary.uploader.destroy(flyerPublicId);
      console.log("Cloudinary delete result:", result);
    }
  } catch (cloudError) {
    console.error("Cloudinary deletion failed:", cloudError);
    // Not failing the whole function if cloudinary deletion fails
  }

  return { status: 200, message: "Event deleted successfully" };
}
