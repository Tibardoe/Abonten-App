import { Pressable, View } from "react-native";
import { Icon } from "./Icon";
import { AppText } from "./Typography";

// Native echo of the web QuantityStepper (atoms/QuantityStepper.tsx) used in
// the ticket picker. Clamps to [min, max]; disables the end it's resting on.

export type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
}: StepperProps) {
  const canDec = value - step >= min;
  const canInc = value + step <= max;

  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        disabled={!canDec}
        onPress={() => onChange(value - step)}
        className={`h-8 w-8 items-center justify-center rounded-full border border-border ${
          canDec ? "active:opacity-70" : "opacity-30"
        }`}
      >
        <Icon name="remove" size={16} tone="foreground" />
      </Pressable>

      <AppText variant="bodyStrong" className="min-w-[24px] text-center">
        {value}
      </AppText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        disabled={!canInc}
        onPress={() => onChange(value + step)}
        className={`h-8 w-8 items-center justify-center rounded-full border border-border ${
          canInc ? "active:opacity-70" : "opacity-30"
        }`}
      >
        <Icon name="add" size={16} tone="foreground" />
      </Pressable>
    </View>
  );
}
