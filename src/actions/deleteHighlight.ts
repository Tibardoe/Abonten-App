"use server";

import { createClient } from "@/config/supabase/server";

// Cloudinary assets are not deleted here: uploadHighlight.ts never stores the
// Cloudinary public_id (only the secure_url), so there is no reliable id to
// destroy. This leaves orphaned Cloudinary assets, a pre-existing gap.
export async function deleteHighlight(groupId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: rows, error: fetchError } = await supabase
    .from("highlight")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (fetchError || !rows || rows.length === 0) {
    return {
      status: 404,
      message: "Highlight not found or unauthorized",
    };
  }

  const { error: deleteError } = await supabase
    .from("highlight")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id); // ownership enforced in the delete query itself

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete highlight: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Highlight deleted successfully" };
}
