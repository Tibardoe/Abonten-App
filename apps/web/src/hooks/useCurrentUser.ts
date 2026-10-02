"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { getUserEventRole } from "@/actions/getUserEventRole";
import { getUserPlaceRole } from "@/actions/getUserPlaceRole";
import { supabase } from "@/config/supabase/client";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { takeShellSlice } from "./shellBootstrap";
import { useHydrated } from "./useHydrated";

// A shared, single query key for "who is signed in", so every component
// that needs it (Header, SideBar, MobileNavBar, review/menu buttons, etc.)
// shares one cached fetch instead of each calling supabase.auth.getUser()
// independently under its own key.
//
// The server never knows the answer (pages are rendered for everyone), so
// its HTML is always the "not known yet" view. The browser must start from
// that same view: the header asks first, and the answer is often in the
// cache before the rest of the page (inside a Suspense boundary) is
// attached to its HTML. Without this, a signed-in visitor's event page
// rendered "loading reviews" over HTML that said "no reviews yet", React
// threw the server's HTML away and built the page again (error #418).
export function useCurrentUser() {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user;
    },
    staleTime: 60 * 1000,
  });
  if (hydrated) return query;
  return {
    ...query,
    data: undefined,
    status: "pending",
    isPending: true,
    isLoading: true,
    isSuccess: false,
    isFetched: false,
  } as typeof query;
}

// Adds the user_info profile row (username, avatar, etc.) on top of
// useCurrentUser, under the same ["user-details", userId] key regardless of
// caller — so components needing the full profile share that cache too.
export function useCurrentUserDetails() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();

  const detailsQuery = useQuery({
    queryKey: ["user-details", user?.id],
    enabled: !!user?.id,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "userDetails",
        user?.id,
        queryKey,
      );
      if (shared !== undefined) return shared;
      const details = await getUserDetails();
      answerOrThrow(details);
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
  const client = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-event-role", user?.id],
    enabled: !!user?.id,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "eventRole",
        user?.id,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return getUserEventRole(user?.id as string);
    },
    staleTime: 60 * 1000,
  });

  const role = data && "role" in data ? data.role : null;
  return Array.isArray(role) && role.includes("organizer");
}

// Gates the Places nav link (Places feature Milestone 6) on whether this
// user owns at least one place -- mirrors useIsOrganizer() exactly, calling
// getUserPlaceRole instead of getUserEventRole.
export function useIsPlaceOwner() {
  const { data: user } = useCurrentUser();
  const client = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-place-role", user?.id],
    enabled: !!user?.id,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "placeRole",
        user?.id,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return getUserPlaceRole(user?.id as string);
    },
    staleTime: 60 * 1000,
  });

  return !!data && "role" in data && data.role === "owner";
}
