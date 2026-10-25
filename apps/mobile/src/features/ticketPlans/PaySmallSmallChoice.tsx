import { formatPercent } from "@abonten/core/i18n/format";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import { planMinimums } from "@abonten/core/ticketPlans/rules";
import type { TicketPlanOffer } from "@abonten/types/ticketPlanType";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Pressable, View } from "react-native";

export type PayMode = "full" | "plan";

type AvailableOffer = Extract<TicketPlanOffer, { available: true }>;

/**
 * On the Buy screen: pay the whole price now, or pay small small — lock
 * the price, hold the tickets, pay in parts until the deadline. The terms,
 * including what happens if the plan is not finished, are on screen before
 * anything starts.
 */
export function PaySmallSmallChoice({
  offer,
  mode,
  onModeChange,
  totalMinor,
  ticketCount,
}: {
  offer: AvailableOffer;
  mode: PayMode;
  onModeChange: (mode: PayMode) => void;
  totalMinor: number;
  ticketCount: number;
}) {
  const t = useTranslations("ticketPlans");
  const { locale } = useLocale();
  const deadline = planMomentText(offer.deadlineAt, offer.timezone, locale);
  const minimums = planMinimums(totalMinor, offer);
  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency: offer.currency }, { locale });
  const pct = (bps: number) => formatPercent(bps / 100, locale);

  const option = (value: PayMode, title: string, line: string) => {
    const selected = mode === value;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => onModeChange(value)}
        className={`flex-row items-start gap-3 rounded-xl border p-3.5 ${
          selected ? "border-primary bg-accent" : "border-border bg-card"
        }`}
      >
        <Icon
          name={selected ? "radio-button-on" : "radio-button-off"}
          size={20}
          tone={selected ? "primary" : "muted"}
        />
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="meta">{line}</AppText>
        </View>
      </Pressable>
    );
  };

  const terms = [
    totalMinor > 0
      ? t("termFirstPart", {
          amount: say(minimums.firstPartMinMinor),
          pct: pct(offer.firstPartMinBps),
        })
      : t("termFirstPartShare", { pct: pct(offer.firstPartMinBps) }),
    t("termLaterParts", { pct: pct(offer.partMinBps) }),
    t("termTicketsWhenPaid"),
    offer.keepFeeOnRefund
      ? t("termNotFinishedKeepsFee", { deadline })
      : t("termNotFinishedFullRefund", { deadline }),
    t("termHold", { minutes: offer.holdMinutes }),
  ];

  return (
    <View className="gap-2">
      <AppText variant="overline">{t("howDoYouWantToPay")}</AppText>
      {option("full", t("payInFull"), t("payInFullLine"))}
      {option("plan", t("paySmallSmall"), t("paySmallSmallLine", { deadline }))}
      {mode === "plan" ? (
        <View className="gap-1.5 rounded-xl bg-muted p-3.5">
          {terms.map((line) => (
            <View key={line} className="flex-row items-start gap-2">
              <AppText variant="caption">•</AppText>
              <AppText variant="caption" className="flex-1">
                {line}
              </AppText>
            </View>
          ))}
          {ticketCount > offer.maxTickets ? (
            <AppText variant="caption" tone="error" className="font-semibold">
              {t("termMaxTickets", { count: offer.maxTickets })}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
