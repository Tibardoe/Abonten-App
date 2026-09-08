import { AppText } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A lightweight transient confirmation ("Copied", "Couldn't find that
// message"). Not a modal, not a sheet — a small pill that fades over the
// composer for a beat. The parent owns the auto-dismiss timer.
export function ChatToast({ message }: { message: string | null }) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(180)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom + 84,
        alignItems: "center",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: c.foreground,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        <AppText
          allowFontScaling={false}
          style={{ color: c.background, fontSize: 13, fontWeight: "600" }}
        >
          {message}
        </AppText>
      </View>
    </Animated.View>
  );
}
