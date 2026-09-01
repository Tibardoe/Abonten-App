import { View } from "react-native";

// The little progress-dot row shared by the multi-step creation wizards
// (place now; event next). The active step is a wider bar.
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View className="flex-row justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length step indicator
          key={i}
          className={`h-1.5 rounded-full ${
            i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
          }`}
        />
      ))}
    </View>
  );
}
