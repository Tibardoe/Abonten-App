import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import { useTranslations } from "next-intl";
import PlaceOpeningHoursEditor from "../molecules/PlaceOpeningHoursEditor";

type PlaceCreateStepHoursProps = Pick<
  ReturnType<typeof usePlaceUploadForm>,
  "openingHours" | "setOpeningHours"
> & { className?: string };

// Step 3 of the Place creation flow: opening hours, one range per day.
export default function PlaceCreateStepHours({
  openingHours,
  setOpeningHours,
  className,
}: PlaceCreateStepHoursProps) {
  const t = useTranslations("places");

  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-foreground">
        {t("openingHours2")}
      </h2>
      <PlaceOpeningHoursEditor
        openingHours={openingHours}
        onChange={setOpeningHours}
      />
    </div>
  );
}
