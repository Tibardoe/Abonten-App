"use server";

import { createClient } from "@/config/supabase/server";
import { computeProfileCompletion } from "@abonten/core/profileCompletion";

export type GetProfileCompletionResult =
  | { status: 200; completion: ReturnType<typeof computeProfileCompletion> }
  | { status: 401 | 500; message: string };

// Powers ProfileCompletionIndicator/ProfileCompletionChecklist on the Edit
// Profile page. Always computed on read from the current fields (per
// CLAUDE.md: don't persist a potentially stale percentage) rather than a
// stored progress value.
export async function getProfileCompletion(): Promise<GetProfileCompletionResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userInfo, error: userInfoError } = await supabase
    .from("user_info")
    .select("full_name, username_is_generated, avatar_public_id")
    .eq("id", userData.user.id)
    .single();

  if (userInfoError || !userInfo) {
    return { status: 500, message: "Could not load profile details" };
  }

  const completion = computeProfileCompletion({
    fullName: userInfo.full_name,
    usernameIsGenerated: userInfo.username_is_generated,
    avatarPublicId: userInfo.avatar_public_id,
    email: userData.user.email,
    emailConfirmedAt: userData.user.email_confirmed_at,
  });

  return { status: 200, completion };
}
