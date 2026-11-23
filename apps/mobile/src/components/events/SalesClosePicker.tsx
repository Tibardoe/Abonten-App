import {
  SALES_CLOSE_CHOICES,
  type SalesClose,
  salesCloseChoice,
  salesCloseLabel,
} from "@abonten/core/eventPurchaseEligibility";
import { AppText, Chip } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// When online ticket sales close for each date of an event
// (@abonten/core/eventPurchaseEligibility), on the wizard's ticket step and
// the edit screen: at the start (the default), or while it's on until some
// minutes before it ends. It only changes sales still to come, so it stays
// editable after the first sale.

export function useSalesCloseText() {
  const t = useTranslations("events");
  return (setting: SalesClose) => {
    const label = salesCloseLabel(setting);
    switch (label.kind) {
      case "at_start":
        return t("salesClose.atStart");
      case "until_end":
        return t("salesClose.untilEnd");
      case "minutes_before_end":
        return t("salesClose.minutesBeforeEnd", { minutes: label.minutes });
      case "hours_before_end":
        return t("salesClose.hoursBeforeEnd", { hours: label.hours });
    }
  };
}

export function SalesClosePicker({
  value,
  onChange,
}: {
  /** The choice, as salesCloseChoice writes it ("before_end:60"). */
  value: string;
  onChange: (choice: string) => void;
}) {
  const t = useTranslations("events");
  const text = useSalesCloseText();

  return (
    <View className="gap-2">
      <AppText variant="bodyStrong">{t("salesClose.label")}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {SALES_CLOSE_CHOICES.map((setting) => {
          const choice = salesCloseChoice(setting);
          return (
            <Chip
              key={choice}
              label={text(setting)}
              selected={value === choice}
              onPress={() => onChange(choice)}
            />
          );
        })}
      </View>
      <AppText variant="meta">{t("salesClose.help")}</AppText>
    </View>
  );
}
