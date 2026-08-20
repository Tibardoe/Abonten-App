import { getPlaceCategories } from "@/actions/getPlaceCategories";
import ImagePreviewPane from "@/components/molecules/ImagePreviewPane";
import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import { useQuery } from "@tanstack/react-query";

const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

// Monday-first display order, same convention as PlaceOpeningHoursEditor.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type PlaceCreateStepReviewProps = Pick<
  ReturnType<typeof usePlaceUploadForm>,
  "getValues" | "categoryId" | "selectedAddress" | "openingHours"
> & { coverPreview: string | null; className?: string };

// Step 4 of the Place creation flow: a compact read-only summary of
// everything entered on the previous three steps, so the owner gets one
// last look before Publish — there's no draft-save safety net in Phase 1,
// unlike the event flow's Save Draft option.
export default function PlaceCreateStepReview({
  getValues,
  categoryId,
  selectedAddress,
  openingHours,
  coverPreview,
  className,
}: PlaceCreateStepReviewProps) {
  const values = getValues();

  // Same query key as PlaceCategoryPicker — this reads from that cache
  // (staleTime: Infinity) rather than fetching the lookup table again.
  const { data: categories } = useQuery({
    queryKey: ["place-categories"],
    queryFn: async () => {
      const response = await getPlaceCategories();
      return response.status === 200 ? (response.data ?? []) : [];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const categoryName = categories?.find((cat) => cat.id === categoryId)?.name;

  return (
    <div className={className}>
      {coverPreview && (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
          <ImagePreviewPane
            src={coverPreview}
            alt="Place cover photo"
            className="w-full h-full"
          />
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">
          {values.name || "Untitled place"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {categoryName ?? "No category selected"}
        </p>
        <p className="text-sm text-foreground">
          {selectedAddress || "No address selected"}
        </p>
      </div>

      {values.description && (
        <p className="text-sm text-foreground">{values.description}</p>
      )}

      {(values.website_url || values.phone || values.whatsapp) && (
        <div className="text-sm text-foreground space-y-1">
          {values.website_url && <p>Website: {values.website_url}</p>}
          {values.phone && <p>Phone: {values.phone}</p>}
          {values.whatsapp && <p>WhatsApp: {values.whatsapp}</p>}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Hours</h3>
        <ul className="text-sm text-foreground space-y-0.5">
          {DISPLAY_ORDER.map((dayOfWeek) => {
            const hour = openingHours.find((h) => h.dayOfWeek === dayOfWeek);
            if (!hour) return null;

            return (
              <li key={dayOfWeek} className="flex justify-between">
                <span>{DAY_LABELS[dayOfWeek]}</span>
                <span className="text-muted-foreground">
                  {hour.isClosed
                    ? "Closed"
                    : `${hour.openTime} - ${hour.closeTime}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
