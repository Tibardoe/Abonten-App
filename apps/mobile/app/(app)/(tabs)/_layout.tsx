import { useTranslations } from "@abonten/ui-native/i18n";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

// The five bottom tabs — Home · Search · Tickets · Wallets · Account, the
// native echo of the web MobileNavBar. The nav header is hidden here: every
// tab screen draws its own <AppHeader> (branded variant) so the primary
// screens read the same as the pushed secondary screens.
export default function TabsLayout() {
  const c = useThemeColors();
  const t = useTranslations("navigation");

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
        name="wallet"
        options={{
          title: t("wallets"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" color={color} size={size} />
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
