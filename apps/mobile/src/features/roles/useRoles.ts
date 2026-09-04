import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// Native echoes of the web useIsOrganizer / useIsPlaceOwner (see
// hooks/useCurrentUser.ts): gate organizer- / place-owner-only nav on
// whether the signed-in user actually owns at least one event / place,
// rather than showing those links to every signed-in user. UI gating only
// — every organizer screen and Server Action re-checks ownership itself.

// Branched (rather than a single .from(table)/.eq(column,...) call) so
// each arm resolves a single, literal table and column -- the typed
// client can't narrow a query built from table name and column name
// varying together. See useFavorites.ts for the same reasoning.
async function ownsAny(
  table: "event" | "place",
  userId: string,
): Promise<boolean> {
  const { data, error } =
    table === "event"
      ? await supabase
          .from("event")
          .select("organizer_id")
          .eq("organizer_id", userId)
          .limit(1)
      : await supabase
          .from("place")
          .select("owner_id")
          .eq("owner_id", userId)
          .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export function useIsOrganizer(): boolean {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data } = useQuery({
    queryKey: ["role", "organizer", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => ownsAny("event", userId as string),
  });
  return data ?? false;
}

export function useIsPlaceOwner(): boolean {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data } = useQuery({
    queryKey: ["role", "place-owner", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => ownsAny("place", userId as string),
  });
  return data ?? false;
}
