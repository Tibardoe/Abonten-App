import { AppHeader } from "@/components/app/AppHeader";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// The organizer section is one nested stack so the whole area shares a
// single header implementation (the standard secondary-screen <AppHeader>)
// instead of every screen wiring its own. Each screen just declares its
// `title`; back always pops to the real previous screen (e.g.
// Organizer -> My Events -> Event Insights -> back -> My Events).
export default function OrganizerLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        contentStyle: { backgroundColor: c.background },
        header: ({ options }) => (
          <AppHeader
            variant="title"
            title={typeof options.title === "string" ? options.title : ""}
            backFallback="/(app)/organizer"
          />
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Organizer" }} />
      <Stack.Screen name="events" options={{ title: "My Events" }} />
      <Stack.Screen name="event-drafts" options={{ title: "Event drafts" }} />
      <Stack.Screen name="places/index" options={{ title: "My Places" }} />
      <Stack.Screen name="place-drafts" options={{ title: "Place drafts" }} />
      <Stack.Screen name="finance" options={{ title: "Finances" }} />
      <Stack.Screen name="withdraw" options={{ title: "Withdraw" }} />
      <Stack.Screen
        name="payout-accounts"
        options={{ title: "Payout Accounts" }}
      />
      <Stack.Screen name="payouts" options={{ title: "Withdrawals" }} />
      <Stack.Screen name="cancel-event" options={{ title: "Cancel event" }} />
      <Stack.Screen
        name="events/[eventId]/index"
        options={{ title: "Event Insights" }}
      />
      <Stack.Screen
        name="events/[eventId]/edit"
        options={{ title: "Edit event" }}
      />
      <Stack.Screen
        name="events/[eventId]/promote"
        options={{ title: "Feature this event" }}
      />
      <Stack.Screen
        name="events/[eventId]/attendees"
        options={{ title: "Attendees" }}
      />
      <Stack.Screen
        name="events/[eventId]/promo-codes"
        options={{ title: "Promo codes" }}
      />
      <Stack.Screen
        name="events/[eventId]/reviews"
        options={{ title: "Reviews" }}
      />
      <Stack.Screen
        name="places/[placeId]/index"
        options={{ title: "Place insights" }}
      />
      <Stack.Screen
        name="places/[placeId]/edit"
        options={{ title: "Edit place" }}
      />
      <Stack.Screen
        name="places/[placeId]/photos"
        options={{ title: "Gallery photos" }}
      />
      <Stack.Screen
        name="places/[placeId]/bookings"
        options={{ title: "Bookings" }}
      />
      <Stack.Screen
        name="places/[placeId]/reviews"
        options={{ title: "Reviews" }}
      />
      <Stack.Screen
        name="places/[placeId]/promote"
        options={{ title: "Feature this place" }}
      />
    </Stack>
  );
}
