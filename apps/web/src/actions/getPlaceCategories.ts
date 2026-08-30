"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";
import type { PlaceCategory } from "@abonten/types/placeType";

// place_category is a small, fixed lookup table — a plain unpaginated read
// is intentional here (see the migration's header comment for why it's a
// real table rather than a hardcoded TS array like
// src/data/eventCategoriesAndTypes.ts).
export async function getPlaceCategories() {
  const supabase = publicSupabase;

  const { data, error } = await supabase
    .from("place_category")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    logger.error(`Error fetching place categories: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as PlaceCategory[] };
}
