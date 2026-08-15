"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { supabase } from "@/config/supabase/client";
import { useQuery } from "@tanstack/react-query";

// A shared, single query key for "who is signed in", so every component
// that needs it (Header, SideBar, MobileNavBar, review/menu buttons, etc.)
// shares one cached fetch instead of each calling supabase.auth.getUser()
// independently under its own key.
export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user;
    },
    staleTime: 60 * 1000,
  });
}

// Adds the user_info profile row (username, avatar, etc.) on top of
// useCurrentUser, under the same ["user-details", userId] key regardless of
// caller — so components needing the full profile share that cache too.
export function useCurrentUserDetails() {
  const { data: user, isLoading: userLoading } = useCurrentUser();

  const detailsQuery = useQuery({
    queryKey: ["user-details", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const details = await getUserDetails();
      return details?.status === 200 ? details.userDetails : null;
    },
    staleTime: 60 * 1000,
  });

  return { user, userLoading, ...detailsQuery };
}
