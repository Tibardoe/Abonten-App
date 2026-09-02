import { DAY_LABELS, type PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 4 of the place wizard — a last look before publishing. Mirrors the
// web PlaceCreateStepReview. Publish is the header's "Publish" button
// (app/(app)/place/new.tsx).
export function PlaceWizardReview({ w }: { w: PlaceWizard }) {
  const categoryName =
    w.categories.find((c) => c.id === w.categoryId)?.name ?? "—";
  const openDays = w.openingHours
    .filter((h) => !h.isClosed)
    .map((h) => DAY_LABELS[h.dayOfWeek].slice(0, 3))
    .join(", ");

  return (
    <View className="gap-4">
      {w.coverUri ? (
        <Image
          source={{ uri: w.coverUri }}
          style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : null}
      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <ReviewRow label="Name" value={w.name} />
        <ReviewRow label="Category" value={categoryName} />
        <ReviewRow label="Location" value={w.address} />
        {w.website ? <ReviewRow label="Website" value={w.website} /> : null}
        {w.phone ? <ReviewRow label="Phone" value={w.phone} /> : null}
        {w.whatsapp ? <ReviewRow label="WhatsApp" value={w.whatsapp} /> : null}
        <ReviewRow label="Open days" value={openDays} />
      </View>
      <AppText variant="muted">{w.description}</AppText>

      {w.isSubmitError ? (
        <AppText variant="small" tone="error">
          We couldn't publish your place. Please try again.
        </AppText>
      ) : null}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText variant="muted">{label}</AppText>
      <AppText variant="small" className="flex-1 text-right">
        {value || "—"}
      </AppText>
    </View>
  );
}
