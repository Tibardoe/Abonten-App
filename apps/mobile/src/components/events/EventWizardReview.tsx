import { prettyTime } from "@/components/datetime/TimeField";
import { useSalesCloseText } from "@/components/events/SalesClosePicker";
import type { EventWizard } from "@/features/events/useEventWizard";
import { prettyDate } from "@/lib/datetime";
import { salesCloseRequestValue } from "@abonten/core/eventPurchaseEligibility";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  DEFAULT_REFUND_POLICY,
  refundCutoffDays,
  refundPolicyFromChoice,
} from "@abonten/core/refundPolicy";
import { AppText } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 7 of the event wizard — a last look before publishing. Mirrors the
// web review/publish step. Publish is the header's "Publish" button
// (app/(app)/event/new.tsx).
export function EventWizardReview({ w }: { w: EventWizard }) {
  const { locale } = useLocale();
  const t = useTranslations("events");

  const c = useThemeColors();
  const salesCloseText = useSalesCloseText();
  const when =
    w.scheduleMode === "single"
      ? w.rangeStart
        ? w.rangeEnd && w.rangeEnd !== w.rangeStart
          ? `${prettyDate(w.rangeStart)}, ${prettyTime(w.rangeStartTime)} → ${prettyDate(
              w.rangeEnd,
            )}, ${prettyTime(w.rangeEndTime)}`
          : `${prettyDate(w.rangeStart)} · ${prettyTime(
              w.rangeStartTime,
            )} – ${prettyTime(w.rangeEndTime)}`
        : "—"
      : t("datesCount", { count: w.occurrences.length });

  const refundChoice =
    refundPolicyFromChoice(w.refundPolicy) ?? DEFAULT_REFUND_POLICY;
  const refundLabel =
    refundChoice.kind === "until_cutoff"
      ? t("refundPolicy.untilCutoff", {
          days: refundCutoffDays(refundChoice.cutoffHours),
        })
      : refundChoice.kind === "none"
        ? t("refundPolicy.none")
        : t("refundPolicy.untilStart");
  const ticketing =
    w.ticketMode === "free"
      ? t("free")
      : w.ticketMode === "single"
        ? w.ticketQuantity
          ? t("quantityAvailable", {
              price: formatMoney(w.currency, Number(w.ticketPrice || 0), {
                locale,
              }),
              count: w.ticketQuantity,
            })
          : formatMoney(w.currency, Number(w.ticketPrice || 0), { locale })
        : t("ticketTypesCount", { count: w.tiers.length });

  return (
    <View className="gap-4">
      {w.flyerUri ? (
        <Image
          source={{ uri: w.flyerUri }}
          // Same opaque ground as the flyer step — see EventWizardFlyer.
          style={{
            width: "100%",
            aspectRatio: 4 / 5,
            borderRadius: 12,
            backgroundColor: c.muted,
          }}
          contentFit="cover"
        />
      ) : null}

      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Row label={t("title")} value={w.title} />
        <Row label={t("category")} value={w.category ?? "—"} />
        <Row label={t("types")} value={w.types.join(", ")} />
        <Row label={t("when")} value={when} />
        {w.venuePlace ? (
          <Row label={t("venue")} value={w.venuePlace.name} />
        ) : null}
        <Row label={t("location")} value={w.address} />
        {w.capacity ? <Row label={t("capacity2")} value={w.capacity} /> : null}
        <Row label={t("ticketing")} value={ticketing} />
        {w.promos.length > 0 ? (
          <Row label={t("promoCodes2")} value={String(w.promos.length)} />
        ) : null}
        <Row
          label={t("registration")}
          value={w.requireRegistration ? t("required") : t("notRequired")}
        />
        <Row
          label={t("salesClose.label")}
          value={salesCloseText(salesCloseRequestValue(w.salesClose))}
        />
        {w.ticketMode !== "free" ? (
          <Row label={t("refundPolicy.label")} value={refundLabel} />
        ) : null}
      </View>

      <AppText variant="muted">{w.description}</AppText>

      {w.isSubmitError ? (
        <AppText variant="small" tone="error">
          {t("weCouldnTPostYourEvent")}
        </AppText>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText variant="muted">{label}</AppText>
      <AppText variant="small" className="flex-1 text-right">
        {value || "—"}
      </AppText>
    </View>
  );
}
