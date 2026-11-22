import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import type { ListerSocialNetwork } from "@abonten/core/social/listerSocialLinks";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native equivalent of the web `updateUserDetails` action: PATCH
// /api/mobile/profile, the same service (@abonten/services/profile/
// updateProfileCore), which checks the social accounts and stores them in
// their canonical form. Only the text fields the mobile Edit Profile form
// exposes; the photo has its own upload flow. (Builds before 2026-11-22
// wrote these fields straight to user_info; the update policy still allows
// that for them.)

export type ProfileUpdate = {
  username: string;
  full_name: string;
  bio: string;
  website: string;
  social_links: Record<ListerSocialNetwork, string>;
};

/** The server answered and refused: its message is in the app's language. */
export class ProfileUpdateRefused extends Error {}

export function useUpdateProfile() {
  const { session } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (fields: ProfileUpdate) => {
      if (!session) throw new Error("not-authenticated");
      const res = await api.profile.update(fields);
      if (res.status !== 200) throw new ProfileUpdateRefused(res.message ?? "");
      return res.data ?? null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile", "public"] });
      // The account-setup checklist and reminder card.
      qc.invalidateQueries({ queryKey: ["account-setup"] });
    },
  });
}
