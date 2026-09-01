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
    queryFn: () => fetchIsFavorited(kind, id as string),
  });
}

export function useToggleFavorite(kind: Kind, id: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();

  return useMutation({
    mutationFn: async () => {
      if (!session || !id) throw new Error("not-authenticated");
      const current = qc.getQueryData<boolean>(itemKey(kind, id)) ?? false;

      if (current) {
        const { error } = await supabase
          .from(TABLE[kind])
          .delete()
          .eq(FK[kind], id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(TABLE[kind]).insert({
          user_id: session.user.id,
          [FK[kind]]: id,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },

    onMutate: async () => {
      if (!id) return { previous: undefined };
      await qc.cancelQueries({ queryKey: itemKey(kind, id) });
      const previous = qc.getQueryData<boolean>(itemKey(kind, id));
      qc.setQueryData(itemKey(kind, id), !(previous ?? false));
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (id) qc.setQueryData(itemKey(kind, id), ctx?.previous ?? false);
    },

    onSettled: () => {
      if (id) qc.invalidateQueries({ queryKey: itemKey(kind, id) });
      qc.invalidateQueries({ queryKey: favoritesListKey(kind) });
    },
  });
}
