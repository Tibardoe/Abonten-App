"use server";

import { createClient } from "@/config/supabase/server";
import { deleteHighlightSlideCore } from "@abonten/services/profile/highlightDeleteCore";

// Thin wrapper: auth, then delegate to the shared core (also used by the
// mobile /api/mobile/highlights/slide/delete route). Cloudinary-first
// cleanup + ownership enforcement live in highlightDeleteCore.ts.
export async function deleteHighlightSlide(slideId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: "User not Logged in" };
  }

  return deleteHighlightSlideCore(supabase, user.id, slideId);
}
