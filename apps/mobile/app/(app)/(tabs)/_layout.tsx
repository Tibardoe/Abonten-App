import { TAB_INDICATOR, TabIcon } from "@/components/app/TabIcon";
import { useContentProgram } from "@/features/content/useContentProgram";
import { useInboxRealtime } from "@/features/messaging/useInboxRealtime";
import { useUnreadMessageCount } from "@/features/messaging/useUnreadMessageCount";
import { useTranslations } from "@abonten/ui-native/i18n";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The unread count on the Messages tab. Hand-rolled rather than
// react-navigation's `tabBarBadge`: that <Badge> pushes `backgroundColor`
// through its bundled `color` lib (fragile — see the hsl-token crash) and
// sizes/positions itself in a way that reads as a stretched pill next to a
// labelled tab. This is a real 16px circle (a pill only past one digit),
// number centred, matching the header bell badge. On the selected tab's
// mint pill it gets a ring in the bar colour so the two don't run together.
function UnreadBadge({ count, ring }: { count: number; ring?: string }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  const border = ring ? 2 : 0;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -5 - border,
        right: (label.length > 1 ? -12 : -8) - border,
        minWidth: 16 + border * 2,
        height: 16 + border * 2,
        borderRadius: 8 + border,
        borderWidth: border,
        borderColor: ring,
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

// The bar's own height above the home indicator / gesture area: room for
// the 32px selected-tab pill and an 11px label. A custom height replaces
// react-navigation's default (49 + inset), so the bottom inset is added
// back here; the library still pads the bar by the inset itself.
const BAR_HEIGHT = 60;

// The bottom tabs — Home · Search · Spotlight · Messages · Account.
// Spotlight took the middle slot from Tickets (now a pushed screen reached
// from Account, the menu and payment success). The Spotlight tab follows
// the content programme: while Spotlight is off for this person it is
// hidden rather than shown as a dead end, and the bar has four tabs. The nav header is hidden here: every
// tab screen draws its own <AppHeader> (branded variant) so the primary
// screens read the same as the pushed secondary screens.
//
// Wallets moved off the bottom bar into Account › Wallets when Messages took
// its slot — the wallet screen itself is unchanged, only its route location
// (now /(app)/wallet, a pushed screen).
//
// The selected tab is marked by a filled mint pill behind a filled glyph
// (TabIcon); its label turns to the foreground colour. Unselected tabs are
// a muted outline glyph and label.
export default function TabsLayout() {
  const c = useThemeColors();
  const t = useTranslations("navigation");
  const insets = useSafeAreaInsets();
  const { data: unread = 0 } = useUnreadMessageCount();
  const { program } = useContentProgram();
  const height = BAR_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Subtle content shift on tab change — fast, interruptible, and the
        // OS reduce-motion setting disables it automatically.
        animation: "shift",
        // The scene behind each tab's screen. Without it the tab-switch
        // shift reveals the container's default (white) between scenes.
        sceneStyle: { backgroundColor: c.background },
        // Labels: the pill carries the mint, so the selected label is the
        // foreground colour (mint text on white is only 2.3:1).
        tabBarActiveTintColor: c.foreground,
        tabBarInactiveTintColor: c["muted-foreground"],
        // Brand font + a legible weight on the bottom nav; 11px is the
        // iOS/Android norm for a tab label.
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          fontFamily: family.byWeight["600"],
          marginTop: 3,
        },
        tabBarIconStyle: TAB_INDICATOR,
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          height,
          backgroundColor: c.sidebar,
          borderTopColor: c["sidebar-border"],
        } as never,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          tabBarLabel: t("home"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              icon="home-outline"
              activeIcon="home"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("search"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              icon="search-outline"
              activeIcon="search"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="spotlight"
        options={{
          title: "Spotlight",
          href: program.spotlight ? undefined : null,
          // Full-bleed video: the bar goes dark with the screen instead of
          // a light strip cutting under the feed. The mint pill stays as it
          // is — it reads on black as well as on the light bar.
          sceneStyle: { backgroundColor: "#000" },
          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "rgba(255,255,255,0.62)",
          tabBarStyle: {
            height,
            backgroundColor: "#000",
            borderTopColor: "rgba(255,255,255,0.12)",
          } as never,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              icon="play-circle-outline"
              activeIcon="play-circle"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t("messages"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              icon="chatbubble-ellipses-outline"
              activeIcon="chatbubble-ellipses"
              focused={focused}
              color={color}
              renderBadge={(onPill) => (
                <UnreadBadge
                  count={unread}
                  ring={onPill ? c.sidebar : undefined}
                />
              )}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("account"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              icon="person-outline"
              activeIcon="person"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
