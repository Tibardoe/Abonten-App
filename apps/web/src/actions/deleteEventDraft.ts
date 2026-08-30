"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Cloudinary-first, DB-second ordering (matches deleteHighlight.ts, not
// deleteEvent.ts's DB-first/best-effort-Cloudinary ordering) — a failed
// Cloudinary destroy leaves the draft row in place so the asset can still
// be found and retried, instead of orphaning it silently.
export async function deleteEventDraft(draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500, message: userError.message };
  }
  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id")
    .eq("id", draftId)
    .eq("draft_type", "event")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message };
  }
  if (!draft || draft.user_id !== user.id) {
    return { status: 404, message: "Draft not found." };
  }

  const { data: eventDraft } = await supabase
    .from("event_drafts")
    .select("flyer_public_id")
    .eq("draft_id", draftId)
    .maybeSingle();

  if (eventDraft?.flyer_public_id) {
    try {
      const result = await cloudinary.uploader.destroy(
        eventDraft.flyer_public_id,
        { resource_type: "image" },
      );
      if (result.result !== "ok" && result.result !== "not found") {
        return {
          status: 500,
          message: "Failed to delete draft image. Please try again.",
        };
      }
    } catch (cloudError) {
      logger.error("Cloudinary deletion failed:", cloudError);
      return {
        status: 500,
        message: "Failed to delete draft image. Please try again.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", user.id); // ownership enforced in the delete query itself

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete draft: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Draft deleted." };
}
