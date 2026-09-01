import { DAY_LABELS, type PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, Button } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 4 of the place wizard — a last look before publishing. Mirrors the
// web PlaceCreateStepReview.
export function PlaceWizardReview({
  w,
  onBack,
  onPublish,
}: {
  w: PlaceWizard;
  onBack: () => void;
  onPublish: () => void;
}) {
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
      <AppText className="text-[13px] text-muted-foreground">
        {w.description}
      </AppText>

      {w.isSubmitError ? (
        <AppText className="text-[13px] text-destructive">
          We couldn't publish your place. Please try again.
        </AppText>
      ) : null}

      <View className="flex-row gap-3">
        <Button
          title="Back"
          variant="ghost"
          className="flex-1"
          onPress={onBack}
        />
        <Button
          title={w.isSubmitting ? "Publishing…" : "Publish"}
          className="flex-1"
          loading={w.isSubmitting}
          onPress={onPublish}
        />
      </View>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText className="text-[13px] text-muted-foreground">{label}</AppText>
      <AppText className="flex-1 text-right text-[13px] text-foreground">
        {value || "—"}
      </AppText>
    </View>
  );
}
