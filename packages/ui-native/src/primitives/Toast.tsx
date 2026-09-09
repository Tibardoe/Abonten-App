import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemeColors } from "../theme/ThemeProvider";
import { tintBackground, tintBorder } from "../theme/color";
import { Icon, type IoniconName } from "./Icon";
import { AppText } from "./Typography";
import { hapticError, hapticSuccess } from "./haptics";
import { useReducedMotion } from "./useReducedMotion";

// The app's non-blocking feedback channel.
//
// Before this, every confirmation and every recoverable error went through
// `Alert.alert` — a modal that stops the app, steals focus, and needs a tap
// to dismiss. That is the right shape for "are you sure you want to delete
// this?", and it stays there. It is the wrong shape for "Saved", "Review
// posted", "Couldn't load more": those should confirm and get out of the way.
//
// A toast here:
//   - slides in from the bottom, clear of the tab bar and the safe area
//   - carries an icon + tone, so success/failure is never colour alone
//   - fires a matching haptic, so the outcome lands without looking
//   - announces itself to the screen reader (it is not focusable, so a
//     screen-reader user would otherwise never learn the action worked)
//   - can carry ONE action ("Retry", "View") for a recoverable failure
//   - is tap-to-dismiss, and auto-dismisses on a timer; errors get longer
//
// Only one toast is on screen at a time: a new one replaces the current one,
// because the newest outcome is the relevant one.

export type ToastTone = "success" | "error" | "info";

export type ToastOptions = {
  /** Optional second line — the "what do I do next" detail. */
  description?: string;
  /** One recoverable action. Dismisses the toast when tapped. */
  action?: { label: string; onPress: () => void };
  /** Override the auto-dismiss delay (ms). */
  duration?: number;
};

type ToastRecord = ToastOptions & {
  id: number;
  message: string;
  tone: ToastTone;
};

export type ToastApi = {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<ToastTone, IoniconName> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

// An error stays up long enough to read a sentence and reach for "Retry".
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 2600,
  error: 5000,
  info: 3200,
};

let nextId = 1;

const NOOP_TOAST: ToastApi = {
  success: () => {},
  error: () => {},
  info: () => {},
  dismiss: () => {},
};

/**
 * Mount once, above the navigator. `useToast()` anywhere below it returns
 * the api; call sites never render anything themselves.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastRecord | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string, options?: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      const record: ToastRecord = { ...options, id: nextId++, message, tone };
      setToast(record);

      if (tone === "success") hapticSuccess();
      else if (tone === "error") hapticError();

      // A toast is invisible to the accessibility tree (never focused), so
      // the outcome has to be spoken explicitly.
      AccessibilityInfo.announceForAccessibility(
        options?.description ? `${message}. ${options.description}` : message,
      );

      timer.current = setTimeout(
        () => setToast((t) => (t?.id === record.id ? null : t)),
        options?.duration ?? DEFAULT_DURATION[tone],
      );
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => show("success", m, o),
      error: (m, o) => show("error", m, o),
      info: (m, o) => show("info", m, o),
      dismiss,
    }),
    [show, dismiss],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * The feedback api. Safe to call outside a provider (it no-ops), so a
 * component can be rendered in isolation without blowing up.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_TOAST;
}

function ToastHost({
  toast,
  onDismiss,
}: {
  toast: ToastRecord | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();

  // Kept mounted for one exit animation after `toast` clears, so the pill
  // slides out instead of vanishing.
  const [shown, setShown] = useState<ToastRecord | null>(toast);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast) {
      setShown(toast);
      if (reducedMotion) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (reducedMotion) {
      progress.setValue(0);
      setShown(null);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [toast, progress, reducedMotion]);

  if (!shown) return null;

  const accent =
    shown.tone === "success"
      ? c.success
      : shown.tone === "error"
        ? c.destructive
        : c.primary;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Clears the bottom tab bar (~56pt) and the home indicator, so the
        // toast never covers the nav the user might reach for next.
        bottom: insets.bottom + 68,
        alignItems: "center",
        paddingHorizontal: 16,
      }}
    >
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 480,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${shown.message}. Dismiss`}
          onPress={onDismiss}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingLeft: 14,
            paddingRight: shown.action ? 6 : 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: tintBorder(accent, scheme),
            backgroundColor: c.popover,
            shadowColor: "#000",
            shadowOpacity: scheme === "dark" ? 0.4 : 0.16,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tintBackground(accent, scheme),
            }}
          >
            <Icon name={ICON[shown.tone]} size={17} color={accent} />
          </View>

          <View style={{ flex: 1 }}>
            <AppText
              numberOfLines={2}
              className="text-[14px] font-semibold text-popover-foreground"
            >
              {shown.message}
            </AppText>
            {shown.description ? (
              <AppText variant="caption" numberOfLines={2} className="mt-0.5">
                {shown.description}
              </AppText>
            ) : null}
          </View>

          {shown.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shown.action.label}
              hitSlop={8}
              onPress={() => {
                const run = shown.action?.onPress;
                onDismiss();
                run?.();
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
              }}
              className="active:opacity-60"
            >
              <AppText
                className="text-[14px] font-bold"
                style={{ color: accent }}
              >
                {shown.action.label}
              </AppText>
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}
