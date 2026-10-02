"use client";

import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { useQuery } from "@tanstack/react-query";

// The place categories: a small lookup table that hardly ever changes, read
// once per page load and shared by everything that needs it (the category
// picker, the review step of the place form, search suggestions).
//
// One hook because there were three copies of this query under one cache
// key, and whichever ran first decided what the other two got. A failed
// read is an error, not "there are no categories": the copies answered a
// failure with an empty list, which was then kept for the life of the page
// (staleTime: Infinity) and left the picker empty until a reload.
export function usePlaceCategories({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["place-categories"],
    queryFn: async () => {
      const response = await getPlaceCategories();
      if (response.status !== 200) {
        throw new Error(`place categories: ${response.status}`);
      }
      return response.data ?? [];
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
