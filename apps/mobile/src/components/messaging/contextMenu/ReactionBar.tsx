import { hapticSelection } from "@/lib/haptics";
import { Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

// The emoji strip that sits immediately beside the selected message (spec §5
// — closest interaction affordance to the bubble). Same width as the action
// menu so the two read as one surface. Tapping one confirms with a light
// haptic, closes the overlay, and toggles the caller's reaction.
const BTN = 38;

export function ReactionBar({
  mine,
  emojis,
  onPick,
  onMore,
}: {
  mine?: string | null;
  /** Quick slots: the user's recent picks first, then the defaults. */
  emojis: readonly string[];
  onPick: (emoji: string) => void;
  /** Opens the full emoji picker for anything not in the quick slots. */
  onMore: () => void;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 6,
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
      {emojis.map((emoji) => {
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

      {/* Anything not in the quick slots: opens the system emoji keyboard.
          Separated by a hairline so it reads as a different kind of control
          rather than a seventh reaction. */}
      <View
        style={{
          width: StyleSheet.hairlineWidth,
          height: 24,
          marginHorizontal: 2,
          backgroundColor: c.border,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More emoji"
        accessibilityHint="Opens the emoji keyboard to react with any emoji"
        onPress={() => {
          hapticSelection();
          onMore();
        }}
        style={({ pressed }) => ({
          width: BTN,
          height: BTN,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: BTN / 2,
          backgroundColor: pressed ? c.muted : "transparent",
          transform: [{ scale: pressed ? 0.86 : 1 }],
        })}
      >
        <Icon name="add" size={22} tone="muted" />
      </Pressable>
    </View>
  );
}
