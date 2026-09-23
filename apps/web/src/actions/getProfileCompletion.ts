"use server";

import { createClient } from "@/config/supabase/server";
import {
  type AccountSetupPromptState,
  accountSetupPromptVisible,
} from "@abonten/core/accountSetupPrompt";
import { computeProfileCompletion } from "@abonten/core/profileCompletion";

export type GetProfileCompletionResult =
  | {
      status: 200;
      completion: ReturnType<typeof computeProfileCompletion>;
      /** Whether the dismissible "Finish setting up" reminder may show now. */
      promptVisible: boolean;
      prompt: AccountSetupPromptState;
    }
  | { status: 401 | 500; message: string };

// Account setup for the signed-in user: the five steps (name, username,
// photo, verified email, verified phone — @abonten/core/profileCompletion)
// computed from the live profile and auth fields on every read (never a
// stored percentage), plus the reminder card's dismissal record
// (account_setup_prompt_state) so the card follows the same 7/30/90-day
// quiet periods as the app.
export async function getProfileCompletion(): Promise<GetProfileCompletionResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { status: 401, message: "User not authenticated" };
  }
  const user = userData.user;

  const [{ data: userInfo, error: userInfoError }, { data: promptRow }] =
    await Promise.all([
      supabase
        .from("user_info")
        .select("full_name, username_is_generated, avatar_public_id")
        .eq("id", user.id)
        .single(),
      supabase
        .from("account_setup_prompt_state")
        .select("dismiss_count, dismissed_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (userInfoError || !userInfo) {
    return { status: 500, message: "Could not load profile details" };
  }

  const completion = computeProfileCompletion({
    fullName: userInfo.full_name,
    usernameIsGenerated: userInfo.username_is_generated,
    avatarPublicId: userInfo.avatar_public_id,
    email: user.email,
    emailConfirmedAt: user.email_confirmed_at,
    pendingEmail: user.new_email,
    phone: user.phone,
    phoneConfirmedAt: user.phone_confirmed_at,
  });
  const prompt: AccountSetupPromptState = {
    dismissCount: promptRow?.dismiss_count ?? 0,
    dismissedAt: promptRow?.dismissed_at ?? null,
  };

  return {
    status: 200,
    completion,
    prompt,
    promptVisible: accountSetupPromptVisible(completion, prompt),
  };
}
