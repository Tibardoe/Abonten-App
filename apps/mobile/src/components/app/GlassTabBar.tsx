import { useReducedMotion } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { brandColors, family, useTheme } from "@abonten/ui-native/theme";
import { requireOptionalNativeModule } from "expo";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { Tabs } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// The bottom navigation: a floating glass capsule that screens scroll
// behind, after iOS 26's tab bar. The selected tab sits in a translucent
// pill that slides between tabs, its glyph filled and tinted mint.
//
// The glass, by platform:
//   • iOS 26+: Liquid Glass (expo-glass-effect, native, linked through
//     expo-router).
//   • Older iOS: the system tab-bar material (UIVisualEffectView, expo-blur).
//   • Android 12+: a real blur of the screen behind (expo-blur on the
//     RenderNode API). Android's blur must be pointed at the view it blurs
//     and must not sit inside it, so each tab screen is wrapped in a
//     BlurTargetView (TabBlurTarget, via the navigator's screenLayout) and
//     the bar blurs the focused one.
//   • Older Android, or a binary built before expo-blur was added: a
//     translucent tint without blur.
//
// Screens behind it keep their last rows clear with useTabBarListPadding()
// (scrolling content) or useTabBarOverlap() (anything pinned to the bottom).

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Capsule height, its gap from the screen's sides and inner padding. */
export const TAB_BAR = { height: 62, side: 16, pad: 5 } as const;

/**
 * Distance from the bottom of the screen to the capsule. iOS: 22 up on a
 * home-indicator phone (inset 34), clear of the indicator, where iOS's own
 * floating bar sits. Android: above the gesture handle or the three-button
 * bar, which are drawn inside the inset.
 */
export function tabBarBottomGap(insetBottom: number): number {
  if (Platform.OS === "ios") return Math.max(insetBottom - 12, 10);
  return insetBottom + (insetBottom >= 40 ? 6 : 4);
}

/** How much of the bottom of the screen the bar covers (with a breath). */
export function tabBarOverlapFor(insetBottom: number): number {
  return tabBarBottomGap(insetBottom) + TAB_BAR.height + 8;
}

// Provided by the tabs layout; 0 anywhere the floating bar isn't drawn.
export const TabBarOverlapContext = createContext(0);

/** How much of the bottom of this screen the floating tab bar covers. */
export function useTabBarOverlap(): number {
  return useContext(TabBarOverlapContext);
}

/** Bottom padding for a tab screen's scrolling content, so its last row clears the bar. */
export function useTabBarListPadding(): number {
  return Math.max(64, useTabBarOverlap() + 24);
}

const LIQUID_GLASS =
  Platform.OS === "ios" &&
  isLiquidGlassAvailable() &&
  isGlassEffectAPIAvailable();

// expo-blur is loaded only when this binary has its native module: an
// older build running newer JavaScript would otherwise fail at import.
const Blur: typeof import("expo-blur") | null = requireOptionalNativeModule(
  "ExpoBlur",
)
  ? require("expo-blur")
  : null;

/** Whether tab screens need wrapping in a blur target (Android only). */
export const TAB_BLUR_TARGETS = Platform.OS === "android" && Blur != null;

/** Route key → the BlurTargetView wrapping that tab's screen. */
export type TabBlurTargets = Map<string, RefObject<View | null>>;

/** Wraps one tab screen so the Android bar can blur it. */
export function TabBlurTarget({
  targets,
  routeKey,
  children,
}: {
  targets: TabBlurTargets;
  routeKey: string;
  children: ReactNode;
}) {
  const ref = useRef<View | null>(null);
  targets.set(routeKey, ref);
  useEffect(() => () => void targets.delete(routeKey), [targets, routeKey]);
  if (!Blur) return children;
  return (
    <Blur.BlurTargetView ref={ref} style={{ flex: 1 }}>
      {children}
    </Blur.BlurTargetView>
  );
}

export function GlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
  darkRoutes = [],
  blurTargets,
}: TabBarProps & {
  /** Routes whose screen is always dark (full-bleed video): the bar follows. */
  darkRoutes?: string[];
  blurTargets?: TabBlurTargets;
}) {
  const t = useTranslations("common");

  const { colors: c, scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);

  const focusedRoute = state.routes[state.index];
  const onDarkScreen = darkRoutes.includes(focusedRoute.name);
  const dark = scheme === "dark" || onDarkScreen;
  const visible = state.routes.filter((r) => {
    const item = StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle);
    return item?.display !== "none";
  });
  const activeIndex = Math.max(
    0,
    visible.findIndex((r) => r.key === focusedRoute.key),
  );

  const tone = {
    // Light grounds: the UI mint fills the glyph and Deep Mint carries the
    // label (mint text on white is only 2.3:1). Dark grounds: brand Mint.
    icon: dark ? brandColors.mint : c.primary,
    label: dark ? brandColors.mint : c["primary-text"],
    inactive: dark ? "rgba(255,255,255,0.78)" : c["muted-foreground"],
    pill: dark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.075)",
    // Laid over the blur, so the glass keeps a readable density over busy
    // content; also the whole fill where there is no blur.
    wash: dark ? "rgba(22,24,28,0.5)" : "rgba(255,255,255,0.55)",
    noBlur: dark ? "rgba(22,24,28,0.9)" : "rgba(250,251,252,0.92)",
    edge: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)",
  };

  // The pill's position in tab slots. Springs to the new tab; jumps with
  // reduce motion, and never animates in from nowhere on the first layout.
  const slot = useSharedValue(activeIndex);
  useEffect(() => {
    slot.value =
      reduceMotion || width === 0
        ? activeIndex
        : withSpring(activeIndex, { damping: 20, stiffness: 240, mass: 0.8 });
  }, [activeIndex, reduceMotion, width, slot]);

  const slotWidth =
    visible.length > 0 ? (width - TAB_BAR.pad * 2) / visible.length : 0;
  const pillStyle = useAnimatedStyle(
    () => ({
      width: slotWidth,
      transform: [{ translateX: TAB_BAR.pad + slot.value * slotWidth }],
    }),
    [slotWidth],
  );

  const radius = TAB_BAR.height / 2;
  const blurTarget = blurTargets?.get(focusedRoute.key);

  // The glass itself, under the pill and the tabs.
  let glass: ReactNode;
  if (LIQUID_GLASS) {
    glass = (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={dark ? "dark" : "light"}
        isInteractive
        style={StyleSheet.absoluteFill}
      />
    );
  } else if (Blur && (Platform.OS === "ios" || blurTarget)) {
    glass = (
      <>
        <Blur.BlurView
          // Remounted per tab: the blur resolves its target when it mounts.
          key={Platform.OS === "android" ? focusedRoute.key : "blur"}
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint={
            Platform.OS === "ios"
              ? dark
                ? "systemChromeMaterialDark"
                : "systemChromeMaterialLight"
              : dark
                ? "dark"
                : "light"
          }
          intensity={Platform.OS === "ios" ? 100 : 80}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tone.wash }]}
        />
      </>
    );
  } else {
    glass = (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tone.noBlur }]}
      />
    );
  }

  return (
    <View
      pointerEvents="box-none"
      accessibilityRole="tablist"
      style={{
        position: "absolute",
        left: TAB_BAR.side + insets.left,
        right: TAB_BAR.side + insets.right,
        bottom: tabBarBottomGap(insets.bottom),
        height: TAB_BAR.height,
        borderRadius: radius,
        // Lift off the page on iOS; Android's elevation shadow would show
        // through the glass, so it relies on the edge line instead.
        shadowColor: "#000",
        shadowOpacity: Platform.OS === "ios" ? (dark ? 0.35 : 0.12) : 0,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          paddingHorizontal: TAB_BAR.pad,
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: LIQUID_GLASS ? 0 : 1,
          borderColor: tone.edge,
        }}
      >
        {glass}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                top: TAB_BAR.pad - (LIQUID_GLASS ? 0 : 1),
                bottom: TAB_BAR.pad - (LIQUID_GLASS ? 0 : 1),
                borderRadius: (TAB_BAR.height - TAB_BAR.pad * 2) / 2,
                backgroundColor: tone.pill,
              },
              pillStyle,
            ]}
          />
        ) : null}
        {visible.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === focusedRoute.key;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const badge =
            typeof options.tabBarBadge === "number" ? options.tabBarBadge : 0;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                (badge > 0
                  ? t("unread", { label: label, badge: badge })
                  : label)
              }
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              // A static style: NativeWind's Pressable wrapper drops a style
              // function, so the press feedback is its `active:` class.
              className={focused ? undefined : "active:opacity-60"}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <View>
                {options.tabBarIcon?.({
                  focused,
                  color: focused ? tone.icon : tone.inactive,
                  size: 24,
                })}
                {badge > 0 ? <UnreadBadge count={badge} /> : null}
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={{
                  color: focused ? tone.label : tone.inactive,
                  fontSize: 11,
                  lineHeight: 14,
                  fontFamily: family.byWeight["600"],
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// The unread count on a tab (Messages). Hand-rolled rather than
// react-navigation's <Badge>, which pushes `backgroundColor` through its
// bundled `color` lib (fragile — see the hsl-token crash) and sizes itself
// as a stretched pill next to a labelled tab. A real 16px circle, a pill
// only past one digit, number centred — matching the header bell badge.
function UnreadBadge({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -5,
        right: label.length > 1 ? -12 : -8,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: label.length > 1 ? 4 : 0,
        backgroundColor: "#0F9D8F",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: "#ffffff",
          fontSize: 10,
          lineHeight: 16,
          fontWeight: "700",
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
