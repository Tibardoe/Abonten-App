import { useIsOnline } from "@/lib/network";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A slim "You're offline" bar pinned under the status bar. Absolutely
// positioned so connectivity flapping never shifts screen layout; slides
// down when the connection drops and back up when it returns (instant with
// reduce-motion). Data still loads from cache underneath — this is just so a
// stalled request has an explanation instead of looking broken.
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);

  useEffect(() => {
    const to = online ? 0 : 1;
    shown.value = reduceMotion ? to : withTiming(to, { duration: 180 });
  }, [online, reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * -8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          paddingTop: insets.top,
          backgroundColor: c.destructive,
        },
        style,
      ]}
    >
      <View className="flex-row items-center justify-center gap-1.5 py-1.5">
        <Icon name="cloud-offline-outline" size={13} tone="inverse" />
        <AppText
          className="text-[12px] font-semibold"
          style={{ color: c["destructive-foreground"] }}
        >
          You're offline — showing saved data
        </AppText>
      </View>
    </Animated.View>
  );
}
