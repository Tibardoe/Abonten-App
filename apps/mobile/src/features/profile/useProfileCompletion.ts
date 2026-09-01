import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { computeProfileCompletion } from "@abonten/core/profileCompletion";
import { useQuery } from "@tanstack/react-query";

// Native echo of the web getProfileCompletion action + useProfileCompletion
// hook. Same shared `computeProfileCompletion` (4 items: name / real
// username / verified email / avatar). Computed on read from the current
// fields — never a stored percentage. `user_info` is publicly selectable
// (`user_info_public_select`); `username_is_generated` isn't on the
// `user_profile_details` view the profile API returns, so read the base
// table directly.

export function useProfileCompletion() {
  const { session } = useSession();
  const user = session?.user;

  return useQuery({
    queryKey: ["profile", "completion", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_info")
        .select("full_name, username_is_generated, avatar_public_id")
        .eq("id", user?.id ?? "")
        .single();
      if (error) throw error;
      const row = data as {
        full_name: string | null;
        username_is_generated: boolean | null;
        avatar_public_id: string | null;
      };
      return computeProfileCompletion({
        fullName: row.full_name,
        usernameIsGenerated: row.username_is_generated,
        avatarPublicId: row.avatar_public_id,
        email: user?.email,
        emailConfirmedAt: user?.email_confirmed_at,
      });
    },
  });
}
