import type { QueryClient } from "@tanstack/react-query";

// Query key first-segments used by every InfiniteList that can display an
// event (organizer's own list, home/search/explore feeds, favorites, a
// user's posts) plus the organizer dashboard's stat widgets. Event
// create/update/cancel/delete all need to invalidate this whole family,
// since the same event can appear in any of them and the mutating
// component (an event card's dropdown menu) has no way to know which
// specific list instance it's rendered inside.
const EVENT_LIST_KEY_PREFIXES = [
  "user-posts",
  "organizer-events",
  "favorites",
  "events",
  "organizer-dashboard",
];

// Query key first-segments affected by a ticket status change: the ticket
// holder's own Active/Cancelled lists, the organizer's attendance list, and
// the organizer dashboard's stat widgets.
const TICKET_STATUS_KEY_PREFIXES = [
  "attending-events",
  "attending-events-counts",
  "attendance-list",
  "organizer-dashboard",
  "attending-event-ids",
];

function matchesAnyPrefix(key: unknown, prefixes: string[]) {
  return (
    typeof key === "string" &&
    prefixes.some((prefix) => key === prefix || key.startsWith(prefix))
  );
}

export function invalidateEventListQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      matchesAnyPrefix(query.queryKey[0], EVENT_LIST_KEY_PREFIXES),
  });
}

export function invalidateTicketStatusQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      matchesAnyPrefix(query.queryKey[0], TICKET_STATUS_KEY_PREFIXES),
  });
}

// No Places list queries exist yet (Explore/management pages are later
// milestones) — this is a forward-looking single-prefix analog of
// invalidateEventListQueries, ready for whatever query key those milestones
// introduce as long as it's namespaced under "places".
const PLACE_LIST_KEY_PREFIXES = ["places"];

export function invalidatePlaceListQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      matchesAnyPrefix(query.queryKey[0], PLACE_LIST_KEY_PREFIXES),
  });
}
