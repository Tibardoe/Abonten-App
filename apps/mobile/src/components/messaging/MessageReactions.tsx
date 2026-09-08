import type { MessageReactionSummary } from "@abonten/types/messagingType";
import { useThemeColors } from "@abonten/ui-native/theme";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

// The compact reaction pills under a bubble. Tapping a pill toggles the
// caller's own reaction with that emoji (adds if not mine, removes if mine)
// — the same call the reaction bar makes. Memoised: only re-renders when the
// summary array identity changes.
export const MessageReactions = memo(function MessageReactions({
  reactions,
  isMine,
  onToggle,
}: {
  reactions: MessageReactionSummary[];
  isMine: boolean;
  onToggle: (emoji: string) => void;
}) {
  const c = useThemeColors();
  if (!reactions.length) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
        marginTop: 5,
        justifyContent: isMine ? "flex-end" : "flex-start",
      }}
    >
      {reactions.map((r) => (
        <Animated.View key={r.emoji} entering={FadeIn.duration(140)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.count}${r.reacted_by_me ? ", including you" : ""}. Tap to ${r.reacted_by_me ? "remove" : "add"}`}
            hitSlop={6}
            onPress={() => onToggle(r.emoji)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              height: 27,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: r.reacted_by_me ? c.primary : c.border,
              backgroundColor: r.reacted_by_me ? c.accent : c.card,
            }}
          >
            <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
            {r.count > 1 ? (
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: r.reacted_by_me ? c.primary : c["muted-foreground"],
                }}
              >
                {r.count}
              </Text>
            ) : null}
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
});
