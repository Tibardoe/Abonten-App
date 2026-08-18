"use server";

import { createClient } from "@/config/supabase/server";

export async function deleteReviewDraft(draftId: string) {
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
    .eq("draft_type", "review")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message };
  }
  if (!draft || draft.user_id !== user.id) {
    return { status: 404, message: "Draft not found." };
  }

  const { error: deleteError } = await supabase
    .from("drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", user.id);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete draft: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Draft deleted." };
}
