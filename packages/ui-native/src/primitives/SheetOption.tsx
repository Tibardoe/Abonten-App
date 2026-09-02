import { Pressable, View } from "react-native";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";

// A single tappable choice inside a <Sheet> — icon medallion, title, optional
// supporting line, chevron. The native echo of the web
// wallet/molecules/PaymentOptionCard: the "what do you want to add?" step
// that fronts the Add Wallet / Add Payout Account / Create flows.

export type SheetOptionProps = {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function SheetOption({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
}: SheetOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      className={`min-h-[64px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-accent">
        <Icon name={icon} size={22} tone="primary" />
      </View>
      <View className="flex-1">
        <AppText className="text-[15px] font-semibold text-foreground">
          {title}
        </AppText>
        {subtitle ? (
          <AppText className="text-[12px] text-muted-foreground">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}
