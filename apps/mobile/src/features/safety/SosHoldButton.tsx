import { SOS_HOLD_MS } from "@abonten/core/safety/rules";
import {
  AppText,
  hapticLight,
  hapticMedium,
  hapticWarning,
  useReducedMotion,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, View } from "react-native";

// The SOS button: hold it for a second and a half. A ring fills while it is
// held and the phone ticks; letting go early sends nothing. That is the whole
// protection against a pocket press — there is no countdown after it,
// because seconds matter more than a second confirmation. Screen-reader
// users get a confirm dialog instead of the hold.

export function SosHoldButton({
  onTrigger,
  disabled = false,
  size = 184,
  label,
}: {
  onTrigger: () => void;
  disabled?: boolean;
  size?: number;
  /** Under "SOS": what holding does ("Hold to alert your contacts"). */
  label?: string;
}) {
  const t = useTranslations("safety");
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const ticks = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holding, setHolding] = useState(false);

  useEffect(
    () => () => {
      if (ticks.current) clearInterval(ticks.current);
    },
    [],
  );

  const stopTicks = () => {
    if (ticks.current) clearInterval(ticks.current);
    ticks.current = null;
  };

  const start = () => {
    if (disabled) return;
    setHolding(true);
    hapticMedium();
    ticks.current = setInterval(hapticLight, SOS_HOLD_MS / 4);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: SOS_HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      stopTicks();
      setHolding(false);
      if (finished) {
        hapticWarning();
        progress.setValue(0);
        onTrigger();
      }
    });
  };

  const cancel = () => {
    if (!holding) return;
    progress.stopAnimation();
    stopTicks();
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : 180,
      useNativeDriver: true,
    }).start();
  };

  const confirmForScreenReader = () => {
    Alert.alert(t("sosConfirmTitle"), t("sosConfirmBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("sendSos"), style: "destructive", onPress: onTrigger },
    ]);
  };

  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sos")}
        accessibilityHint={t("sosHoldHint")}
        accessibilityState={{ disabled, busy: holding }}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate" && !disabled) {
            confirmForScreenReader();
          }
        }}
        onPressIn={start}
        onPressOut={cancel}
        disabled={disabled}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className={`items-center justify-center overflow-hidden bg-destructive ${disabled ? "opacity-50" : ""}`}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "rgba(0,0,0,0.28)",
            transform: [{ scale: progress }],
          }}
        />
        <AppText className="text-[44px] font-bold tracking-wider text-destructive-foreground">
          {t("sos")}
        </AppText>
        <AppText className="mt-1 px-6 text-center text-[13px] text-destructive-foreground">
          {holding ? t("keepHolding") : (label ?? t("holdToAlert"))}
        </AppText>
      </Pressable>
    </View>
  );
}
