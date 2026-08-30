"use server";

import createNotification from "@/actions/createNotification";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { logger } from "@/utils/logger";
import { computeProfileCompletion } from "@/utils/profileCompletion";

// Idempotently creates the "Complete your profile" notification for a user.
// Safe to call on every sign-in (not just the first one) -- it checks
// completion and existing-notification state first, so it never fires for
// an already-complete profile and never duplicates (the partial unique
// index notification_profile_completion_unique is the DB-level backstop
// for the race case). Uses the service-role client because this can run
// from src/actions/verifyPhoneSignIn.ts right after a brand-new user was
// created via the Admin API, before any cookie session exists yet.
export default async function ensureProfileCompletionNotification(
  userId: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const [
    { data: authUser, error: authUserError },
    { data: userInfo, error: userInfoError },
  ] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("user_info")
      .select("full_name, username_is_generated, avatar_public_id")
      .eq("id", userId)
      .single(),
  ]);

  if (authUserError || userInfoError || !authUser.user || !userInfo) {
    logger.error(
      `ensureProfileCompletionNotification: could not load user ${userId}`,
      authUserError?.message ?? userInfoError?.message,
    );
    return;
  }

  const completion = computeProfileCompletion({
    fullName: userInfo.full_name,
    usernameIsGenerated: userInfo.username_is_generated,
    avatarPublicId: userInfo.avatar_public_id,
    email: authUser.user.email,
    emailConfirmedAt: authUser.user.email_confirmed_at,
  });

  if (completion.isComplete) return;

  const { data: existing } = await supabase
    .from("notification")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "profile_completion")
    .maybeSingle();

  if (existing) return;

  await createNotification(
    {
      userId,
      type: "profile_completion",
      title: "Complete your profile",
      body: "Add a name, username, profile picture, and verify your email so people recognize you.",
      link: "/settings/edit-profile",
    },
    supabase,
  );
}
