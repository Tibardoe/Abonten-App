import { hapticSelection } from "@/lib/haptics";
import { MESSAGE_REACTION_EMOJIS } from "@abonten/types/messagingType";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Pressable, Text, View } from "react-native";

// The emoji strip that sits immediately beside the selected message (spec §5
// — closest interaction affordance to the bubble). Same width as the action
// menu so the two read as one surface. Tapping one confirms with a light
// haptic, closes the overlay, and toggles the caller's reaction.
const BTN = 38;

export function ReactionBar({
  mine,
  onPick,
}: {
  mine?: string | null;
  onPick: (emoji: string) => void;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: c.popover,
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 14,
      }}
    >
      {MESSAGE_REACTION_EMOJIS.map((emoji) => {
        const active = mine === emoji;
        return (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              hapticSelection();
              onPick(emoji);
            }}
            style={({ pressed }) => ({
              width: BTN,
              height: BTN,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: BTN / 2,
              backgroundColor: active
                ? c.accent
                : pressed
                  ? c.muted
                  : "transparent",
              transform: [{ scale: pressed ? 0.82 : active ? 1.08 : 1 }],
            })}
          >
            <Text style={{ fontSize: 23 }}>{emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
