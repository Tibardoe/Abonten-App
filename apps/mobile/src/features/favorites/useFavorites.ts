import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Favourites — direct RLS-scoped CRUD on `favorite` (events) and
// `favorite_place` (places). Both tables have a single
// `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
// policy (migrations 20260825105625 / 20260825105513), so the client can
// insert / delete / select directly with no Server Action — the same rows
// the web addEventToFavorite / addPlaceToFavorite actions write.

type Kind = "event" | "place";

const TABLE: Record<Kind, "favorite" | "favorite_place"> = {
  event: "favorite",
  place: "favorite_place",
};
const FK: Record<Kind, "event_id" | "place_id"> = {
  event: "event_id",
  place: "place_id",
};

function itemKey(kind: Kind, id: string) {
  return ["favorite", kind, id] as const;
}
/** List key invalidated on every toggle — the profile Favourites tabs read it. */
export function favoritesListKey(kind: Kind) {
  return ["favorites", kind] as const;
}

// The "Favorites" stat on the profile header comes from the
// `user_profile_details` view, whose `total_favorites` is
// `count(distinct favorite.event_id)` — EVENT favourites only, not
// `favorite_place` (same as web). It's surfaced by useProfile (own
// profile, key ["mobile","profile"]) and usePublicProfile (key
// ["profile","public",<username>]). Neither was refreshed on a toggle, so
// the count only changed on a cold reload. Patch both optimistically and
// invalidate them once an EVENT write settles.
type ProfileWithCount = { user_id?: string; total_favorites?: number } | null;

function bumpProfileFavorites(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  delta: number,
) {
  if (!userId) return;
  const patch = (
    p: ProfileWithCount | undefined,
  ): ProfileWithCount | undefined => {
    if (!p || p.user_id !== userId) return p;
    return {
      ...p,
      total_favorites: Math.max(0, (p.total_favorites ?? 0) + delta),
    };
  };
  qc.setQueryData<ProfileWithCount>(["mobile", "profile"], patch);
  qc.setQueriesData<ProfileWithCount>(
    { queryKey: ["profile", "public"] },
    patch,
  );
}

async function fetchIsFavorited(kind: Kind, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE[kind])
    .select(FK[kind])
    .eq(FK[kind], id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export function useIsFavorited(kind: Kind, id: string | undefined) {
  const { session } = useSession();
  return useQuery({
    queryKey: itemKey(kind, id ?? ""),
    enabled: !!session && !!id,
    staleTime: 30_000,
    queryFn: () => fetchIsFavorited(kind, id as string),
  });
}

export function useToggleFavorite(kind: Kind, id: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();

  // The caller passes the target state (true = favourite, false = remove).
  // The DB op must key off the state *before* the optimistic flip, not off
  // the cache — onMutate has already flipped the cache by the time
  // mutationFn runs, so reading it here would invert the write.
  return useMutation({
    mutationFn: async (next: boolean) => {
      if (!session || !id) throw new Error("not-authenticated");

      if (next) {
        const { error } = await supabase.from(TABLE[kind]).insert({
          user_id: session.user.id,
          [FK[kind]]: id,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(TABLE[kind])
          .delete()
          .eq(FK[kind], id);
        if (error) throw error;
      }
    },

    onMutate: async (next: boolean) => {
      if (!id) return { previous: undefined };
      await qc.cancelQueries({ queryKey: itemKey(kind, id) });
      const previous = qc.getQueryData<boolean>(itemKey(kind, id));
      // Only move the counter when the flag actually changes state.
      const changed = previous !== next;
      qc.setQueryData(itemKey(kind, id), next);
      if (changed && kind === "event") {
        bumpProfileFavorites(qc, session?.user.id, next ? 1 : -1);
      }
      return { previous, changed };
    },

    onError: (_err, next, ctx) => {
      if (id) qc.setQueryData(itemKey(kind, id), ctx?.previous ?? false);
      if (ctx?.changed && kind === "event") {
        bumpProfileFavorites(qc, session?.user.id, next ? -1 : 1);
      }
    },

    onSettled: () => {
      if (id) qc.invalidateQueries({ queryKey: itemKey(kind, id) });
      qc.invalidateQueries({ queryKey: favoritesListKey(kind) });
      if (kind === "event") {
        qc.invalidateQueries({ queryKey: ["mobile", "profile"] });
        qc.invalidateQueries({ queryKey: ["profile", "public"] });
      }
    },
  });
}
