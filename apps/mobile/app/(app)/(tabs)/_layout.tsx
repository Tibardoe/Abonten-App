import { useInboxRealtime } from "@/features/messaging/useInboxRealtime";
import { useUnreadMessageCount } from "@/features/messaging/useUnreadMessageCount";
import { useTranslations } from "@abonten/ui-native/i18n";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { type ColorValue, Text, View } from "react-native";

// The Messages tab icon with its own unread badge. Hand-rolled rather than
// react-navigation's `tabBarBadge`: that <Badge> pushes `backgroundColor`
// through its bundled `color` lib (fragile — see the hsl-token crash) and
// sizes/positions itself in a way that reads as a stretched pill next to a
// labelled tab. This is a real 16px circle (a pill only past one digit),
// number centred, matching the header bell badge.
function MessagesTabIcon({
  color,
  size,
  count,
}: {
  color: ColorValue;
  size: number;
  count: number;
}) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <View style={{ width: size, height: size }}>
      <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
      {count > 0 ? (
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
      ) : null}
    </View>
  );
}

// The five bottom tabs — Home · Search · Tickets · Messages · Account, the
// native echo of the web MobileNavBar. The nav header is hidden here: every
// tab screen draws its own <AppHeader> (branded variant) so the primary
// screens read the same as the pushed secondary screens.
//
// Wallets moved off the bottom bar into Account › Wallets when Messages took
// its slot — the wallet screen itself is unchanged, only its route location
// (now /(app)/wallet, a pushed screen).
export default function TabsLayout() {
  const c = useThemeColors();
  const t = useTranslations("navigation");
  // Keep the badge live while the user is anywhere in the tab bar.
  useInboxRealtime();
  const { data: unread = 0 } = useUnreadMessageCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Subtle content shift on tab change — fast, interruptible, and the
        // OS reduce-motion setting disables it automatically.
        animation: "shift",
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c["muted-foreground"],
        // Brand font + a legible weight on the bottom nav; 11px is the
        // iOS/Android norm for a tab label.
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          fontFamily: family.byWeight["600"],
        },
        tabBarStyle: {
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("search"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t("messages"),
          tabBarIcon: ({ color, size }) => (
            <MessagesTabIcon color={color} size={size} count={unread} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("account"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
