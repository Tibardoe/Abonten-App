import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditQuote } from "@abonten/types/rewards";
import { AppText } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Switch, View } from "react-native";

// The "Use Abonten Credit" switch shown on ticket and promotion checkout:
// the server-quoted credit, and -- while on -- the Total / Credit / You pay
// breakdown. Starts on by default in its callers (unused credit expires).

export function CreditSwitch({
  quote,
  value,
  onChange,
  disabled,
}: {
  quote: CreditQuote;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const { locale } = useLocale();
  const t = useTranslations("rewards");

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <AppText className="text-sm font-semibold text-foreground">
            {t("useAbontenCredit", {
              formatCredit: formatCredit(
                quote.creditMinor,
                quote.currency,
                locale,
              ),
            })}
          </AppText>
          <AppText variant="meta">
            {!quote.creditOnly
              ? t("youHaveYouCanUseHere", {
                  formatCredit: formatCredit(
                    quote.spendableMinor,
                    quote.currency,
                    locale,
                  ),
                })
              : value
                ? t("yourCreditCoversThisNothingElse")
                : t("yourCreditCanCoverAllOf")}
          </AppText>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={t("useAbontenCredit2")}
        />
      </View>
      {value ? (
        <View className="gap-1 border-t border-border pt-2">
          <View className="flex-row justify-between">
            <AppText variant="meta">{t("total")}</AppText>
            <AppText variant="meta" className="tabular-nums">
              {formatCredit(quote.orderTotalMinor, quote.currency, locale)}
            </AppText>
          </View>
          <View className="flex-row justify-between">
            <AppText variant="meta">{t("credit")}</AppText>
            <AppText variant="meta" className="tabular-nums">
              −{formatCredit(quote.creditMinor, quote.currency, locale)}
            </AppText>
          </View>
          <View className="flex-row justify-between">
            <AppText variant="metaStrong">{t("youPay")}</AppText>
            <AppText variant="metaStrong" className="tabular-nums">
              {formatCredit(quote.cashMinor, quote.currency, locale)}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}
