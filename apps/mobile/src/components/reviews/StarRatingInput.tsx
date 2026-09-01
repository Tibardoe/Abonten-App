import { Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Native echo of the web atoms/StarRatingInput: a tappable 1–5 row. No hover
// state (touch), so the fill just tracks the selected value.
export function StarRatingInput({
  value,
  onChange,
  size = 32,
}: {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
}) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${star} out of 5`}
        >
          <Icon
            name={value >= star ? "star" : "star-outline"}
            size={size}
            tone={value >= star ? "primary" : "muted"}
          />
        </Pressable>
      ))}
    </View>
  );
}
