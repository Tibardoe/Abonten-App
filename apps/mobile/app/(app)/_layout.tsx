import { usePushRegistration } from "@/features/notifications/usePushRegistration";
import { resolveScheme } from "@abonten/ui-tokens/palette";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useColorScheme } from "react-native";

// Mirrors the web MobileNavBar: Home (explore) · Search · Transactions ·
// Wallet · Account.
export default function AppLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = resolveScheme(scheme);

  // Register this device for push while the user is in the app.
  usePushRegistration();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c["muted-foreground"],
        tabBarStyle: {
          backgroundColor: c.sidebar,
          borderTopColor: c["sidebar-border"],
        } as never,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ticket-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          title: "Places",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="location-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Reachable by navigation, not shown as tabs. Detail screens keep a
          header so the back affordance is visible; their titles are set
          per-item from inside the screen via navigation.setOptions. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen
        name="wallet"
        options={{ href: null, headerShown: true, title: "Payment methods" }}
      />
      <Tabs.Screen
        name="event/[id]"
        options={{ href: null, headerShown: true, title: "Event" }}
      />
      <Tabs.Screen
        name="place/[id]"
        options={{ href: null, headerShown: true, title: "Place" }}
      />
      <Tabs.Screen
        name="ticket/[id]"
        options={{ href: null, headerShown: true, title: "Ticket" }}
      />
      <Tabs.Screen
        name="checkout/[sessionId]"
        options={{ href: null, headerShown: true, title: "Checkout" }}
      />
      <Tabs.Screen
        name="organizer/index"
        options={{ href: null, headerShown: true, title: "Organizer" }}
      />
      <Tabs.Screen
        name="organizer/events"
        options={{ href: null, headerShown: true, title: "My events" }}
      />
      <Tabs.Screen
        name="organizer/finance"
        options={{ href: null, headerShown: true, title: "Finances" }}
      />
      <Tabs.Screen
        name="organizer/payout-accounts"
        options={{ href: null, headerShown: true, title: "Payout accounts" }}
      />
      <Tabs.Screen
        name="organizer/payouts"
        options={{ href: null, headerShown: true, title: "Withdrawals" }}
      />
      <Tabs.Screen
        name="organizer/withdraw"
        options={{ href: null, headerShown: true, title: "Withdraw" }}
      />
      <Tabs.Screen
        name="organizer/cancel-event"
        options={{ href: null, headerShown: true, title: "Cancel event" }}
      />
    </Tabs>
  );
}
