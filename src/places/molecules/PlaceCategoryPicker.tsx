"use client";

import { getPlaceCategories } from "@/actions/getPlaceCategories";
import { cn } from "@/components/lib/utils";
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

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Loading categories...</p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Category</h2>

      <div className="grid grid-cols-2 gap-2">
        {categories?.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm text-left transition-colors",
              categoryId === cat.id && "border-primary bg-accent",
            )}
          >
            {cat.name}
            <span className="w-[16px] h-[16px] rounded-full grid place-items-center border border-border shrink-0">
              <span
                className={cn("bg-primary w-[8px] h-[8px] rounded-full", {
                  hidden: categoryId !== cat.id,
                })}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
