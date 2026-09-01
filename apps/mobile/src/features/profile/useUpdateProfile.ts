import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native equivalent of the web `updateUserDetails` action — a direct
// RLS-scoped update on `user_info` (policy `user_info_self_update`,
// migration 20260825105625). Only the text fields the mobile Edit Profile
// form exposes; avatar changes are a later pass.

export type ProfileUpdate = {
  username: string;
  full_name: string;
  bio: string;
  website: string;
};

export function useUpdateProfile() {
  const { session } = useSession();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (fields: ProfileUpdate) => {
      if (!session) throw new Error("not-authenticated");
      const { error } = await supabase
        .from("user_info")
        .update(fields)
        .eq("id", session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile", "public"] });
    },
  });
}
