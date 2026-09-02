import { AppDrawer } from "@/components/app/AppDrawer";
import { NotificationBellButton } from "@/components/app/NotificationBellButton";
import { MenuSheetProvider, useMenuSheet } from "@/components/app/menuSheet";
import { ExploreLocationProvider } from "@/features/discovery/ExploreLocationProvider";
import { usePushRegistration } from "@/features/notifications/usePushRegistration";
import { AbontenLogo, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

// Header menu trigger — the native stand-in for the web mobile header's
// hamburger. Opens the app menu sheet mounted below.
function MenuButton() {
  const { setOpen } = useMenuSheet();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Menu"
      hitSlop={8}
      onPress={() => setOpen(true)}
      style={{ paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <Icon name="menu" size={24} tone="foreground" />
    </Pressable>
  );
}

function Layout() {
  const c = useThemeColors();
  const t = useTranslations("navigation");

  // Register this device for push while the user is in the app.
  usePushRegistration();

  const headerLeft = () => <MenuButton />;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: c.sidebar,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c["sidebar-border"],
          },
          headerTitleStyle: { color: c.foreground, fontSize: 17 },
          headerTintColor: c.foreground,
          headerShadowVisible: false,
          headerRight: () => <NotificationBellButton />,
          tabBarActiveTintColor: c.primary,
          tabBarInactiveTintColor: c["muted-foreground"],
          tabBarStyle: {
            backgroundColor: c.sidebar,
            borderTopColor: c["sidebar-border"],
          } as never,
        }}
      >
        {/* Bottom tabs — mirror the web MobileNavBar's five slots:
            Home · Search · Tickets · Wallets · Account. (Web slot 3 is
            "Transactions" — the buyer analytics page; mobile still shows
            My Tickets there until WP-2 builds that screen.) */}
        <Tabs.Screen
          name="index"
          options={{
            // Home header: menu button (left) · Abonten mark (centre) ·
            // notification bell (right, from screenOptions.headerRight).
            // The web app puts the brand mark in the centre of its nav; the
            // wordmark is dropped here because it's illegible at header
            // height. The bottom-tab slot keeps the web MobileNavBar's
            // "Home" label.
            title: "Explore",
            headerTitle: () => <AbontenLogo size={26} />,
            headerTitleAlign: "center",
            tabBarLabel: t("home"),
            headerLeft,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: t("search"),
            // Dedicated search experience owns its own top area — the
            // search field sits at the very top with no nav header, menu,
            // or bell above it (Phase 2 area 2 / item 7).
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="tickets"
          options={{
            title: "Tickets",
            headerLeft,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: t("wallets"),
            headerLeft,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: t("account"),
            headerLeft,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" color={color} size={size} />
            ),
          }}
        />

        {/* Reachable by navigation, not shown as tabs. They inherit the
            themed header + a back button; per-item titles (event / place
            names) are set from inside the screen via navigation.setOptions. */}
        <Tabs.Screen
          name="notifications"
          options={{ href: null, title: "Notifications" }}
        />
        {/* Nested Stack owns its own header, so hide the tab-level one. */}
        <Tabs.Screen
          name="transactions"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen
          name="places"
          options={{ href: null, title: t("places") }}
        />
        <Tabs.Screen
          name="event/[id]"
          options={{ href: null, title: "Event" }}
        />
        <Tabs.Screen
          name="place/[id]"
          options={{ href: null, title: "Place" }}
        />
        <Tabs.Screen
          name="place/new"
          options={{ href: null, title: "Create place" }}
        />
        <Tabs.Screen
          name="event/new"
          options={{ href: null, title: "Create event" }}
        />
        <Tabs.Screen
          name="user/[username]"
          options={{ href: null, title: "Profile" }}
        />
        {/* Nested Stack owns its own header, so hide the tab-level one. */}
        <Tabs.Screen
          name="settings"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen
          name="ticket/[id]"
          options={{ href: null, title: "Ticket" }}
        />
        <Tabs.Screen
          name="checkout/[sessionId]"
          options={{ href: null, title: "Checkout" }}
        />
        <Tabs.Screen
          name="organizer/index"
          options={{ href: null, title: "Organizer" }}
        />
        <Tabs.Screen
          name="organizer/events"
          options={{ href: null, title: "My events" }}
        />
        <Tabs.Screen
          name="organizer/event-drafts"
          options={{ href: null, title: "Event drafts" }}
        />
        <Tabs.Screen
          name="organizer/events/[eventId]/index"
          options={{ href: null, title: "Event insights" }}
        />
        <Tabs.Screen
          name="organizer/events/[eventId]/edit"
          options={{ href: null, title: "Edit event" }}
        />
        <Tabs.Screen
          name="organizer/events/[eventId]/promote"
          options={{ href: null, title: "Feature this event" }}
        />
        <Tabs.Screen
          name="organizer/events/[eventId]/attendees"
          options={{ href: null, title: "Attendees" }}
        />
        <Tabs.Screen
          name="organizer/events/[eventId]/promo-codes"
          options={{ href: null, title: "Promo codes" }}
        />
        <Tabs.Screen
          name="organizer/places/index"
          options={{ href: null, title: "My places" }}
        />
        <Tabs.Screen
          name="organizer/place-drafts"
          options={{ href: null, title: "Place drafts" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/index"
          options={{ href: null, title: "Place insights" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/edit"
          options={{ href: null, title: "Edit place" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/photos"
          options={{ href: null, title: "Gallery photos" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/bookings"
          options={{ href: null, title: "Bookings" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/reviews"
          options={{ href: null, title: "Reviews" }}
        />
        <Tabs.Screen
          name="organizer/places/[placeId]/promote"
          options={{ href: null, title: "Feature this place" }}
        />
        <Tabs.Screen
          name="organizer/finance"
          options={{ href: null, title: "Finances" }}
        />
        <Tabs.Screen
          name="organizer/payout-accounts"
          options={{ href: null, title: "Payout accounts" }}
        />
        <Tabs.Screen
          name="organizer/payouts"
          options={{ href: null, title: "Withdrawals" }}
        />
        <Tabs.Screen
          name="organizer/withdraw"
          options={{ href: null, title: "Withdraw" }}
        />
        <Tabs.Screen
          name="organizer/cancel-event"
          options={{ href: null, title: "Cancel event" }}
        />
      </Tabs>

      <AppDrawer />
    </>
  );
}

export default function AppLayout() {
  return (
    <ExploreLocationProvider>
      <MenuSheetProvider>
        <Layout />
      </MenuSheetProvider>
    </ExploreLocationProvider>
  );
}
