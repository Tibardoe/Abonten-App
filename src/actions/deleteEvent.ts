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

  const hasHistory = await eventHasRealHistory(supabase, eventId);

  if (hasHistory) {
    return {
      status: 409,
      message:
        "This event has ticket sales, attendance, or reviews and can't be permanently deleted. Cancel it instead to remove it from discovery while keeping its history.",
    };
  }

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

// Hard delete cascades to ticket_checkout/attendance/event_review (and,
// transitively, ticket) via their existing FKs -- fine for an event nobody
// has interacted with yet, destructive for one that has. Cancel (status ->
// 'canceled', see cancelEvent.ts) is the non-destructive alternative for
// removing an event with real history from discovery, and is already
// exposed in the same menu as Delete (EventCardMenuModal.tsx).
async function eventHasRealHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const [
    { count: attendanceCount },
    { count: paidCheckoutCount },
    { count: reviewCount },
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "paid"),
    supabase
      .from("event_review")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
  ]);

  return (
    (attendanceCount ?? 0) > 0 ||
    (paidCheckoutCount ?? 0) > 0 ||
    (reviewCount ?? 0) > 0
  );
}
