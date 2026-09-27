import { type IoniconName, useReducedMotion } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import { type ReactNode, useEffect } from "react";
import { type ColorValue, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// The bottom-tab icon. The selected tab's icon sits on a filled mint pill
// (the `primary` token) and switches to its filled glyph in
// `primary-foreground` — the theme's text-on-primary pair, 6.4:1 in light
// mode and 8.2:1 in dark. Unselected tabs stay a quiet outline glyph.
//
// react-navigation draws every tab icon twice, stacked, and cross-fades
// them: `focused` in `tabBarIcon` says which of the two copies is being
// drawn, not whether the tab is selected. The selected state comes from
// useIsFocused (each tab item is rendered inside its own route's
// navigation context), and it drives the pill's short grow-in.

/** The pill's box. `tabBarIconStyle` gives the icon slot the same size. */
export const TAB_INDICATOR = { width: 56, height: 32 } as const;
const ICON_SIZE = 22;

type Props = {
  /** Outline glyph, shown when the tab is not selected. */
  icon: IoniconName;
  /** Filled glyph, shown on the pill when the tab is selected. */
  activeIcon: IoniconName;
  /** Which of react-navigation's two stacked copies this is. */
  focused: boolean;
  /** The bar's tint for this copy (used for the unselected glyph). */
  color: ColorValue;
  /** Drawn over the glyph's top-right corner, e.g. an unread count. */
  renderBadge?: (onPill: boolean) => ReactNode;
};

export function TabIcon({
  icon,
  activeIcon,
  focused,
  color,
  renderBadge,
}: Props) {
  if (!focused) {
    return (
      <View style={slot}>
        <View>
          <Ionicons name={icon} color={color} size={ICON_SIZE} />
          {renderBadge?.(false)}
        </View>
      </View>
    );
  }
  return <SelectedTabIcon icon={activeIcon} renderBadge={renderBadge} />;
}

function SelectedTabIcon({
  icon,
  renderBadge,
}: {
  icon: IoniconName;
  renderBadge?: (onPill: boolean) => ReactNode;
}) {
  const c = useThemeColors();
  const selected = useIsFocused();
  const reduceMotion = useReducedMotion();
  // Starts full size for the tab that is already selected at launch, so the
  // first frame never animates. Only the width animates (never opacity), a
  // circle opening out to the pill with its ends kept round: if an
  // animation were ever dropped the pill would still be drawn.
  const grow = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    if (!selected) {
      grow.value = 0;
    } else if (reduceMotion) {
      grow.value = 1;
    } else {
      grow.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [selected, reduceMotion, grow]);

  const pillStyle = useAnimatedStyle(() => ({
    width:
      TAB_INDICATOR.height +
      (TAB_INDICATOR.width - TAB_INDICATOR.height) * grow.value,
  }));

  return (
    <View style={slot}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            height: TAB_INDICATOR.height,
            borderRadius: TAB_INDICATOR.height / 2,
            backgroundColor: c.primary,
          },
          pillStyle,
        ]}
      />
      <View>
        <Ionicons
          name={icon}
          color={c["primary-foreground"]}
          size={ICON_SIZE}
        />
        {renderBadge?.(true)}
      </View>
    </View>
  );
}

const slot = {
  width: TAB_INDICATOR.width,
  height: TAB_INDICATOR.height,
  alignItems: "center",
  justifyContent: "center",
} as const;
