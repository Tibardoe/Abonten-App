"use server";

import { createClient } from "@/config/supabase/server";

// Cloudinary assets are not deleted here: uploadHighlight.ts never stores the
// Cloudinary public_id (only the secure_url), so there is no reliable id to
// destroy. This leaves an orphaned Cloudinary asset, a pre-existing gap.
export async function deleteHighlightSlide(slideId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: row, error: fetchError } = await supabase
    .from("highlight")
    .select("id")
    .eq("id", slideId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !row) {
    return {
      status: 404,
      message: "Slide not found or unauthorized",
    };
  }

  const { error: deleteError } = await supabase
    .from("highlight")
    .delete()
    .eq("id", slideId)
    .eq("user_id", user.id); // ownership enforced in the delete query itself

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete slide: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Slide deleted successfully" };
}
