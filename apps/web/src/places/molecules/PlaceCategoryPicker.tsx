"use client";

import { getPlaceCategories } from "@/actions/getPlaceCategories";
import TileSelector from "@/components/molecules/TileSelector";
import { useQuery } from "@tanstack/react-query";

type PlaceCategoryPickerProps = {
  categoryId: number | null;
  onSelect: (categoryId: number) => void;
};

// place_category is a small (14 rows), rarely-changing lookup table — cached
// with staleTime: Infinity so switching steps back and forth never
// re-fetches it, and PlaceCreateStepReview's own useQuery with the same key
// hits this same cache instead of fetching again.
export default function PlaceCategoryPicker({
  categoryId,
  onSelect,
}: PlaceCategoryPickerProps) {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["place-categories"],
    queryFn: async () => {
      const response = await getPlaceCategories();
      return response.status === 200 ? (response.data ?? []) : [];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <TileSelector
      label="Category"
      mode="single"
      loading={isLoading}
      options={(categories ?? []).map((cat) => ({
        id: String(cat.id),
        label: cat.name,
      }))}
      value={categoryId === null ? "" : String(categoryId)}
      onChange={(id) => onSelect(Number(id))}
    />
  );
}
