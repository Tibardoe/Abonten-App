import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  type AccountSetupPromptState,
  accountSetupPromptVisible,
} from "@abonten/core/accountSetupPrompt";
import {
  type ProfileCompletion,
  computeProfileCompletion,
} from "@abonten/core/profileCompletion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

// Account setup: what's done and what isn't (name, username, photo,
// verified email, verified phone — @abonten/core/profileCompletion), and
// whether the reminder card may show (@abonten/core/accountSetupPrompt).
//
// The profile half is read from user_info (publicly selectable; the
// `username_is_generated` flag isn't on the profile API's view). The email
// and phone half comes from the live session, so finishing a code on the
// Security screen updates the checklist the moment the session refreshes.
// Nothing is stored as a percentage.
//
// Profile saves (useUpdateProfile, useAvatarUpload) invalidate
// ["account-setup"] so the checklist follows them.

export const ACCOUNT_SETUP_KEY = ["account-setup"] as const;

type ProfileRow = {
  full_name: string | null;
  username_is_generated: boolean | null;
  avatar_public_id: string | null;
};

export function useProfileCompletion() {
  const { session } = useSession();
  const user = session?.user;

  const row = useQuery({
    queryKey: [...ACCOUNT_SETUP_KEY, user?.id, "profile"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_info")
        .select("full_name, username_is_generated, avatar_public_id")
        .eq("id", user?.id ?? "")
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
  });

  const email = user?.email;
  const emailConfirmedAt = user?.email_confirmed_at;
  const pendingEmail = (user as { new_email?: string | null } | undefined)
    ?.new_email;
  const phone = user?.phone;
  const phoneConfirmedAt = user?.phone_confirmed_at;

  const data = useMemo<ProfileCompletion | undefined>(
    () =>
      row.data
        ? computeProfileCompletion({
            fullName: row.data.full_name,
            usernameIsGenerated: row.data.username_is_generated,
            avatarPublicId: row.data.avatar_public_id,
            email,
            emailConfirmedAt,
            pendingEmail,
            phone,
            phoneConfirmedAt,
          })
        : undefined,
    [row.data, email, emailConfirmedAt, pendingEmail, phone, phoneConfirmedAt],
  );

  return { ...row, data };
}

/** The reminder card's dismissal record (account_setup_prompt_state). */
function useAccountSetupPromptState() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: [...ACCOUNT_SETUP_KEY, userId, "prompt"],
    enabled: !!userId,
    queryFn: async (): Promise<AccountSetupPromptState> => {
      const { data, error } = await supabase
        .from("account_setup_prompt_state")
        .select("dismiss_count, dismissed_at")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return {
        dismissCount: data?.dismiss_count ?? 0,
        dismissedAt: data?.dismissed_at ?? null,
      };
    },
  });
}

/**
 * Whether to show the "Finish setting up your account" card, and how to put
 * it away. Hidden until both halves are known — never flashes in and out.
 */
export function useAccountSetupPrompt() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const completion = useProfileCompletion();
  const prompt = useAccountSetupPromptState();

  const dismiss = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .rpc("account_setup_prompt_dismiss")
        .single();
      if (error) throw error;
      return data as { dismiss_count: number; dismissed_at: string };
    },
    onMutate: () => {
      // Put it away at once; the server's record replaces this.
      qc.setQueryData<AccountSetupPromptState>(
        [...ACCOUNT_SETUP_KEY, userId, "prompt"],
        (old) => ({
          dismissCount: (old?.dismissCount ?? 0) + 1,
          dismissedAt: new Date().toISOString(),
        }),
      );
    },
    onSuccess: (row) => {
      qc.setQueryData<AccountSetupPromptState>(
        [...ACCOUNT_SETUP_KEY, userId, "prompt"],
        { dismissCount: row.dismiss_count, dismissedAt: row.dismissed_at },
      );
    },
  });

  const visible =
    !!completion.data &&
    prompt.isSuccess &&
    accountSetupPromptVisible(completion.data, prompt.data);

  return { completion: completion.data, visible, dismiss: dismiss.mutate };
}
