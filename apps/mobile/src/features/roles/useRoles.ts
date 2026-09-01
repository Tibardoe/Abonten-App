import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// Native echoes of the web useIsOrganizer / useIsPlaceOwner (see
// hooks/useCurrentUser.ts): gate organizer- / place-owner-only nav on
// whether the signed-in user actually owns at least one event / place,
// rather than showing those links to every signed-in user. UI gating only
// — every organizer screen and Server Action re-checks ownership itself.

async function ownsAny(
  table: "event" | "place",
  column: "organizer_id" | "owner_id",
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .eq(column, userId)
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
    queryFn: () => ownsAny("event", "organizer_id", userId as string),
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
    queryFn: () => ownsAny("place", "owner_id", userId as string),
  });
  return data ?? false;
}
