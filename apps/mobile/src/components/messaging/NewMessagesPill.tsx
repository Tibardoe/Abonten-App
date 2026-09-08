import { AppText, Icon } from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
import { Pressable, View } from "react-native";

// The unobtrusive "↓ N new messages" affordance shown when a message
// arrives while the reader is scrolled up in the history (task §3). Tapping
// it jumps to the latest message. Rendered as an absolute overlay pinned to
// the bottom of the message-list area, so it floats just above the composer.

export function NewMessagesPill({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  const label = `${count} new ${count === 1 ? "message" : "messages"}`;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-2 items-center"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Scroll to latest.`}
        className="flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 active:opacity-80"
        style={shadow.card}
      >
        <Icon name="arrow-down" size={14} tone="inverse" />
        <AppText
          variant="caption"
          className="font-semibold text-primary-foreground"
        >
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}
