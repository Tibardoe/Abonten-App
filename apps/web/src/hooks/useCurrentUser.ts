"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { getUserEventRole } from "@/actions/getUserEventRole";
import { getUserPlaceRole } from "@/actions/getUserPlaceRole";
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

// Gates organizer-only nav links (e.g. the Organizer Dashboard link) on
// whether this user actually owns at least one event, rather than showing
// them to every signed-in user the way My Events/Manage Attendance
// currently do — those two are unrelated existing behavior, left as-is.
export function useIsOrganizer() {
  const { data: user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["user-event-role", user?.id],
    enabled: !!user?.id,
    queryFn: () => getUserEventRole(user?.id as string),
    staleTime: 60 * 1000,
  });

  return Array.isArray(data?.role) && data.role.includes("organizer");
}

// Gates the Places nav link (Places feature Milestone 6) on whether this
// user owns at least one place -- mirrors useIsOrganizer() exactly, calling
// getUserPlaceRole instead of getUserEventRole.
export function useIsPlaceOwner() {
  const { data: user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["user-place-role", user?.id],
    enabled: !!user?.id,
    queryFn: () => getUserPlaceRole(user?.id as string),
    staleTime: 60 * 1000,
  });

  return data?.role === "owner";
}
