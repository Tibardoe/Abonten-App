import { supabase } from "@/config/supabase/client";
import type { userProfileType } from "@/types/userProfileType";
import { useEffect, useState } from "react";

export default function useUserProfile() {
  const [error, setError] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<userProfileType | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: userSession, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !userSession.user) {
        setError("User not logged in");
        return;
      }

      const userId = userSession.user.id;

      const { data, error } = await supabase
        .from("user_info")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setUserProfile({
        id: data.id,
        statusId: data.status_id,
        username: data.username,
        fullName: data.full_name,
        avatarPublicId: data.avatar_public_id,
        avatarVersion: data.avatar_version,
        displayName: data.displayName,
        email: data.email,
        phone: data.phone,
        createdAt: data.createdAt,
        lastSignInAt: data.lastSignInAt,
        bio: data.bio,
        updatedAt: data.updated_at,
      });
    };

    fetchUserProfile();
  }, []);

  return { userProfile, error };
}
