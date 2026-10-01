import { DAY_LABELS, type PlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 4 of the place wizard — a last look before publishing. Mirrors the
// web PlaceCreateStepReview. Publish is the header's "Publish" button
// (app/(app)/place/new.tsx).
export function PlaceWizardReview({ w }: { w: PlaceWizard }) {
  const t = useTranslations("places");

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
        <ReviewRow label={t("name")} value={w.name} />
        <ReviewRow label={t("category")} value={categoryName} />
        <ReviewRow label={t("location")} value={w.address} />
        {w.website ? (
          <ReviewRow label={t("website2")} value={w.website} />
        ) : null}
        {w.phone ? <ReviewRow label={t("phone2")} value={w.phone} /> : null}
        {w.whatsapp ? <ReviewRow label="WhatsApp" value={w.whatsapp} /> : null}
        <ReviewRow label={t("openDays")} value={openDays} />
      </View>
      <AppText variant="muted">{w.description}</AppText>

      {w.isSubmitError ? (
        <AppText variant="small" tone="error">
          {t("weCouldnTPublishYourPlace2")}
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
