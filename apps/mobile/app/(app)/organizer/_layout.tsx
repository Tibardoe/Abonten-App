import { AppHeader } from "@/components/app/AppHeader";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// The organizer section is one nested stack so the whole area shares a
// single header implementation (the standard secondary-screen <AppHeader>)
// instead of every screen wiring its own. Each screen just declares its
// `title`; back always pops to the real previous screen (e.g.
// Organizer -> My Events -> Event Insights -> back -> My Events).
export default function OrganizerLayout() {
  const t = useTranslations("manage");

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
      <Stack.Screen name="index" options={{ title: t("organizer") }} />
      <Stack.Screen name="events" options={{ title: t("myEvents") }} />
      <Stack.Screen name="event-drafts" options={{ title: t("eventDrafts") }} />
      <Stack.Screen name="places/index" options={{ title: t("myPlaces") }} />
      <Stack.Screen name="place-drafts" options={{ title: t("placeDrafts") }} />
      <Stack.Screen name="finance" options={{ title: t("finances") }} />
      <Stack.Screen name="withdraw" options={{ title: t("withdraw") }} />
      <Stack.Screen
        name="payout-accounts"
        options={{ title: t("payoutAccounts") }}
      />
      <Stack.Screen name="payouts" options={{ title: t("withdrawals") }} />
      <Stack.Screen name="cancel-event" options={{ title: t("cancelEvent") }} />
      <Stack.Screen
        name="events/[eventId]/index"
        options={{ title: t("eventInsights") }}
      />
      <Stack.Screen
        name="events/[eventId]/edit"
        options={{ title: t("editEvent") }}
      />
      <Stack.Screen
        name="events/[eventId]/promote"
        options={{ title: t("featureThisEvent") }}
      />
      <Stack.Screen
        name="events/[eventId]/attendees"
        options={{ title: t("attendees") }}
      />
      <Stack.Screen
        name="events/[eventId]/promo-codes"
        options={{ title: t("promoCodes") }}
      />
      <Stack.Screen
        name="events/[eventId]/reviews"
        options={{ title: t("reviews") }}
      />
      <Stack.Screen
        name="places/[placeId]/index"
        options={{ title: t("placeInsights") }}
      />
      <Stack.Screen
        name="places/[placeId]/edit"
        options={{ title: t("editPlace") }}
      />
      <Stack.Screen
        name="places/[placeId]/photos"
        options={{ title: t("galleryPhotos") }}
      />
      <Stack.Screen
        name="places/[placeId]/bookings"
        options={{ title: t("bookings") }}
      />
      <Stack.Screen
        name="places/[placeId]/reviews"
        options={{ title: t("reviews") }}
      />
      <Stack.Screen
        name="places/[placeId]/promote"
        options={{ title: t("featureThisPlace") }}
      />
      <Stack.Screen
        name="places/[placeId]/check-in"
        options={{ title: t("visitorCheckIn") }}
      />
    </Stack>
  );
}
