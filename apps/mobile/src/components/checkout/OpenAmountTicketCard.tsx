import { formatMoney } from "@abonten/core/formatMoney";
import {
  type OpenAmountRange,
  chosenAmountProblem,
  chosenAmountProblemMessage,
  openAmountQuickPicks,
  openAmountRangeHint,
} from "@abonten/core/openAmountTickets";
import { AppText, Chip, Field, Input } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

/**
 * A ticket type whose amount the buyer chooses on the Buy tickets screen
 * (docs/architecture/open-amount-tickets.md): the range, a few amounts to
 * tap and a field to type one. A valid amount is one ticket at that amount;
 * an empty field picks nothing. Promo codes and group prices never apply.
 */
export function OpenAmountTicketCard({
  name,
  note,
  range,
  currency,
  amountText,
  onAmountTextChange,
  availability,
  disabled,
}: {
  /** The type's name, already worded. */
  name: string;
  /** What the amount buys (ticket_type.description). */
  note: string | null | undefined;
  range: OpenAmountRange;
  currency: string;
  amountText: string;
  onAmountTextChange: (text: string) => void;
  /** "12 left", "Sold out"… already worded; null when nothing to say. */
  availability: string | null;
  disabled: boolean;
}) {
  const { locale } = useLocale();
  const tc = useTranslations("core");
  const tCommon = useTranslations("common");
  const typed = amountText.trim() !== "";
  const problem = typed
    ? chosenAmountProblem(amountText, range, currency)
    : null;
  const selected = typed && problem === null;

  return (
    <View
      className={`gap-3 rounded-xl border bg-card p-3.5 ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <View className="gap-0.5">
        <AppText variant="body" className="font-medium">
          {name}
        </AppText>
        {note ? (
          <AppText variant="caption" tone="muted">
            {note}
          </AppText>
        ) : null}
        <AppText variant="meta">
          {openAmountRangeHint(tc, range, currency, locale)}
        </AppText>
        {availability ? (
          <AppText variant="caption" tone="muted">
            {availability}
          </AppText>
        ) : null}
      </View>

      {disabled ? null : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {openAmountQuickPicks(range, currency).map((amount) => (
              <Chip
                key={amount}
                label={formatMoney(currency, amount, {
                  locale,
                  trimZeroFraction: true,
                })}
                selected={selected && Number(amountText) === amount}
                onPress={() => onAmountTextChange(String(amount))}
              />
            ))}
          </View>
          <Field label={tCommon("chooseYourAmount")} hint={currency}>
            <Input
              value={amountText}
              onChangeText={onAmountTextChange}
              keyboardType="decimal-pad"
              accessibilityLabel={tCommon("chooseYourAmount")}
            />
          </Field>
          {problem ? (
            <AppText
              variant="small"
              tone="error"
              accessibilityLiveRegion="polite"
            >
              {chosenAmountProblemMessage(tc, problem, range, currency, locale)}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="muted">
            {tCommon("openAmountNoDiscounts")}
          </AppText>
        </>
      )}
    </View>
  );
}
