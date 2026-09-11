import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditQuote } from "@abonten/types/rewards";
import { AppText } from "@abonten/ui-native";
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
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <AppText className="text-sm font-semibold text-foreground">
            Use {formatCredit(quote.creditMinor)} Abonten Credit
          </AppText>
          <AppText variant="meta">
            {!quote.creditOnly
              ? `You have ${formatCredit(quote.spendableMinor)} you can use here.`
              : value
                ? "Your credit covers this. Nothing else is charged."
                : "Your credit can cover all of this. Turn it on to use it."}
          </AppText>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel="Use Abonten Credit"
        />
      </View>
      {value ? (
        <View className="gap-1 border-t border-border pt-2">
          <View className="flex-row justify-between">
            <AppText variant="meta">Total</AppText>
            <AppText variant="meta" className="tabular-nums">
              {formatCredit(quote.orderTotalMinor)}
            </AppText>
          </View>
          <View className="flex-row justify-between">
            <AppText variant="meta">Credit</AppText>
            <AppText variant="meta" className="tabular-nums">
              −{formatCredit(quote.creditMinor)}
            </AppText>
          </View>
          <View className="flex-row justify-between">
            <AppText variant="metaStrong">You pay</AppText>
            <AppText variant="metaStrong" className="tabular-nums">
              {formatCredit(quote.cashMinor)}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}
