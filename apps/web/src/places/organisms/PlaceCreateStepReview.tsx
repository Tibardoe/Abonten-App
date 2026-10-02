import ImagePreviewPane from "@/components/molecules/ImagePreviewPane";
import { usePlaceCategories } from "@/hooks/usePlaceCategories";
import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { dayName } from "@abonten/core/dateFormatter";
import { useLocale, useTranslations } from "next-intl";

// Monday-first display order, same convention as PlaceOpeningHoursEditor.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type PlaceCreateStepReviewProps = Pick<
  ReturnType<typeof usePlaceUploadForm>,
  "getValues" | "categoryId" | "selectedAddress" | "openingHours"
> & { coverPreview: string | null; className?: string };

// Step 4 of the Place creation flow: a compact read-only summary of
// everything entered on the previous three steps, so the owner gets one
// last look before Publish.
export default function PlaceCreateStepReview({
  getValues,
  categoryId,
  selectedAddress,
  openingHours,
  coverPreview,
  className,
}: PlaceCreateStepReviewProps) {
  const t = useTranslations("places");
  const locale = useLocale();
  const tc = useTranslations("core");

  const values = getValues();

  // Same query key as PlaceCategoryPicker — this reads from that cache
  // (staleTime: Infinity) rather than fetching the lookup table again.
  const { data: categories } = usePlaceCategories();

  const category = categories?.find((cat) => cat.id === categoryId);
  const categoryName = category ? placeCategoryLabel(tc, category) : undefined;

  return (
    <div className={className}>
      {coverPreview && (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
          <ImagePreviewPane
            src={coverPreview}
            alt={t("placeCoverPhoto")}
            className="w-full h-full"
          />
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">
          {values.name || t("untitledPlace")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {categoryName ?? t("noCategorySelected")}
        </p>
        <p className="text-sm text-foreground">
          {selectedAddress || t("noAddressSelected")}
        </p>
      </div>

      {values.description && (
        <p className="text-sm text-foreground">{values.description}</p>
      )}

      {(values.website_url || values.phone || values.whatsapp) && (
        <div className="text-sm text-foreground space-y-1">
          {values.website_url && (
            <p>{t("website", { website_url: values.website_url })}</p>
          )}
          {values.phone && <p>{t("phone", { phone: values.phone })}</p>}
          {values.whatsapp && (
            <p>{t("whatsapp", { whatsapp: values.whatsapp })}</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{t("hours")}</h3>
        <ul className="text-sm text-foreground space-y-0.5">
          {DISPLAY_ORDER.map((dayOfWeek) => {
            const hour = openingHours.find((h) => h.dayOfWeek === dayOfWeek);
            if (!hour) return null;

            return (
              <li key={dayOfWeek} className="flex justify-between">
                <span>{dayName(dayOfWeek, "long", locale)}</span>
                <span className="text-muted-foreground">
                  {hour.isClosed
                    ? t("closed")
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
