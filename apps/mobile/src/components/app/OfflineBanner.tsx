import { useIsOnline } from "@/lib/network";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A slim connection bar pinned under the status bar. Absolutely positioned
// so connectivity flapping never shifts screen layout; slides down when the
// connection drops and back up when it returns (instant with reduce-motion).
// Data still loads from cache underneath — this is just so a stalled request
// has an explanation instead of looking broken.
//
// Coming back is announced too, for a couple of seconds. Without it the bar
// just disappeared, which tells you the app *stopped* saying you were
// offline but not that anything now works — so people kept waiting instead
// of retrying the thing that had failed.
const RECONNECTED_MS = 2200;

export function OfflineBanner() {
  const online = useIsOnline();
  const wasOffline = useRef(false);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setReconnected(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setReconnected(true);
    const t = setTimeout(() => setReconnected(false), RECONNECTED_MS);
    return () => clearTimeout(t);
  }, [online]);
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);

  const visible = !online || reconnected;
  useEffect(() => {
    const to = visible ? 1 : 0;
    shown.value = reduceMotion ? to : withTiming(to, { duration: 180 });
  }, [visible, reduceMotion, shown]);

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
          backgroundColor: online ? c.success : c.destructive,
        },
        style,
      ]}
    >
      <View className="flex-row items-center justify-center gap-1.5 py-1.5">
        <Icon
          name={online ? "cloud-done-outline" : "cloud-offline-outline"}
          size={13}
          tone="inverse"
        />
        <AppText
          className="text-[12px] font-semibold"
          style={{
            color: online
              ? c["success-foreground"]
              : c["destructive-foreground"],
          }}
        >
          {online ? "Back online" : "You're offline — showing saved data"}
        </AppText>
      </View>
    </Animated.View>
  );
}
