"use server";

import { createClient } from "@/config/supabase/server";
import { deleteHighlightGroupCore } from "@/utils/highlightDeleteCore";

// Thin wrapper: auth, then delegate to the shared core (also used by the
// mobile /api/mobile/highlights/group/delete route). Cloudinary-first
// cleanup + ownership enforcement live in highlightDeleteCore.ts.
export async function deleteHighlight(groupId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not Logged in" };
  }

  return deleteHighlightGroupCore(supabase, user.id, groupId);
}
