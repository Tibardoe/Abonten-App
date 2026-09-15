import { offlineStartedAt, useIsOnline } from "@/lib/network";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useTheme } from "@abonten/ui-native/theme";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A compact connection pill floated just under the status bar. Absolutely
// positioned so connectivity flapping never shifts screen layout, and
// touch-transparent so it can never block a control; being a centred pill
// rather than a full-width bar, it no longer covers the back / menu
// buttons in the header while it is up.
//
// Three states, so a normal reconnect is never announced as an outage:
//   • reconnecting — the first seconds of a drop (amber): most of these
//     resolve on their own (a tunnel, a Wi-Fi hand-off, returning from the
//     background). Data still loads from cache underneath.
//   • offline — the drop has lasted (red): a stalled request now has an
//     explanation instead of looking broken.
//   • back online — shown briefly on recovery (green). Without it the pill
//     just disappeared, which said the app *stopped* claiming you were
//     offline but not that anything now worked, so people kept waiting
//     instead of retrying the thing that had failed.
const RECONNECTING_MS = 6000;
const RECONNECTED_MS = 2200;

type Phase = "hidden" | "reconnecting" | "offline" | "reconnected";

export function OfflineBanner() {
  const online = useIsOnline();
  const wasOffline = useRef(false);
  const [phase, setPhase] = useState<Phase>("hidden");

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      const since = offlineStartedAt() ?? Date.now();
      const elapsed = Date.now() - since;
      if (elapsed >= RECONNECTING_MS) {
        setPhase("offline");
        return;
      }
      setPhase("reconnecting");
      const t = setTimeout(
        () => setPhase("offline"),
        RECONNECTING_MS - elapsed,
      );
      return () => clearTimeout(t);
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setPhase("reconnected");
    const t = setTimeout(() => setPhase("hidden"), RECONNECTED_MS);
    return () => clearTimeout(t);
  }, [online]);

  const insets = useSafeAreaInsets();
  const { colors: c, scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);

  const visible = phase !== "hidden";
  useEffect(() => {
    const to = visible ? 1 : 0;
    shown.value = reduceMotion ? to : withTiming(to, { duration: 180 });
  }, [visible, reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * -8 }],
  }));

  const tone: { bg: string; fg: string; icon: IoniconName; label: string } =
    phase === "reconnected"
      ? {
          bg: c.success,
          fg: c["success-foreground"],
          icon: "cloud-done-outline",
          label: "Back online",
        }
      : phase === "reconnecting"
        ? {
            bg: c.warning,
            fg: c["warning-foreground"],
            icon: "sync-outline",
            label: "Reconnecting…",
          }
        : {
            bg: c.destructive,
            fg: c["destructive-foreground"],
            icon: "cloud-offline-outline",
            label: "You're offline — showing saved data",
          };

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: "absolute",
          top: insets.top + 6,
          left: 0,
          right: 0,
          zIndex: 50,
          alignItems: "center",
        },
        style,
      ]}
    >
      <View
        className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
        style={{
          backgroundColor: tone.bg,
          shadowColor: "#000",
          shadowOpacity: scheme === "dark" ? 0.4 : 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Icon name={tone.icon} size={13} color={tone.fg} />
        <AppText
          className="text-[12px] font-semibold"
          style={{ color: tone.fg }}
        >
          {tone.label}
        </AppText>
      </View>
    </Animated.View>
  );
}
