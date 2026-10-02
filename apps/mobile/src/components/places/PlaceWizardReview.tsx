import type { PlaceWizard } from "@/features/places/usePlaceWizard";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { dayName } from "@abonten/core/dateFormatter";
import { AppText } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 4 of the place wizard — a last look before publishing. Mirrors the
// web PlaceCreateStepReview. Publish is the header's "Publish" button
// (app/(app)/place/new.tsx).
export function PlaceWizardReview({ w }: { w: PlaceWizard }) {
  const t = useTranslations("places");
  const tc = useTranslations("core");
  const { locale } = useLocale();

  const category = w.categories.find((c) => c.id === w.categoryId);
  const categoryName = category ? placeCategoryLabel(tc, category) : "—";
  const openDays = w.openingHours
    .filter((h) => !h.isClosed)
    .map((h) => dayName(h.dayOfWeek, "short", locale))
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
