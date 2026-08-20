import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
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
  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-foreground">Opening Hours</h2>
      <PlaceOpeningHoursEditor
        openingHours={openingHours}
        onChange={setOpeningHours}
      />
    </div>
  );
}
