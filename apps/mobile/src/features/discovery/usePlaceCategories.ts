import { supabase } from "@/lib/supabase";
import type { PlaceCategory } from "@abonten/types/placeType";
import { useQuery } from "@tanstack/react-query";

// place_category is a small, fixed lookup table — a plain unpaginated read,
// same as the getPlaceCategories Server Action. Cached for the session.
async function fetchPlaceCategories(): Promise<PlaceCategory[]> {
  const { data, error } = await supabase
    .from("place_category")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlaceCategory[];
}

export function usePlaceCategories() {
  return useQuery({
    queryKey: ["explore", "place-categories"],
    queryFn: fetchPlaceCategories,
    staleTime: 1000 * 60 * 30,
  });
}
