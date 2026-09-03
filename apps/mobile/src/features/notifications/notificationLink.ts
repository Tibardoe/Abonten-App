import type {
  NotificationData,
  NotificationType,
} from "@abonten/types/notificationType";

// Resolves a notification to the native route it should open. Prefers the
// structured `data` (kind + entity ids, populated by createNotificationCore
// since 20260905090000) and falls back to translating the legacy web `link`
// path. Returns null when there's nothing safe to open — the caller still
// marks the row read, it just doesn't navigate (never to a broken screen).

// --- legacy `link` string → native route -----------------------------------
// The web app does `router.push(notification.link)`; on native the same links
// have to be translated. Values seen in the wild:
//   /settings/edit-profile · /manage/events/:id · /manage/places/:id ·
//   /events/:code · /places/:slug · null
const LINK_RULES: [RegExp, (id: string) => string][] = [
  [/^\/manage\/events\/([^/?#]+)/, (id) => `/(app)/organizer/events/${id}`],
  [/^\/manage\/places\/([^/?#]+)/, (id) => `/(app)/organizer/places/${id}`],
  [/^\/events?\/([^/?#]+)/, (id) => `/(app)/event/${id}`],
  // NOTE: no rule for /places/:slug — the native place route is keyed by id,
  // not slug, so a bare slug link can't be routed. New notifications carry
  // data.placeId instead (handled below).
];

export function notificationHref(
  link: string | null | undefined,
): string | null {
  if (!link) return null;
  if (link === "/settings/edit-profile") return "/(app)/settings/edit-profile";
  for (const [pattern, build] of LINK_RULES) {
    const match = link.match(pattern);
    if (match) return build(match[1]);
  }
  return null;
}

// --- structured `data` → native route ------------------------------------
function targetFromData(
  data: NotificationData | null | undefined,
): string | null {
  if (!data || !data.kind) return null;
  switch (data.kind) {
    case "ticket":
      return data.ticketId
        ? `/(app)/ticket/${data.ticketId}`
        : "/(app)/(tabs)/tickets";
    case "event":
    case "event_featured":
      return data.eventId ? `/(app)/event/${data.eventId}` : null;
    case "place":
    case "place_featured":
      return data.placeId ? `/(app)/place/${data.placeId}` : null;
    case "review_reply":
      if (data.eventId) return `/(app)/event/${data.eventId}`;
      if (data.placeId) return `/(app)/place/${data.placeId}`;
      return null;
    case "profile":
      return "/(app)/settings/edit-profile";
    case "place_claim":
      return data.placeId ? `/(app)/organizer/places/${data.placeId}` : null;
    case "place_booking":
      return data.placeId ? `/(app)/place/${data.placeId}` : null;
    default:
      return null;
  }
}

/** The route a tapped notification (list row or push) should open, or null. */
export function notificationTarget(
  input:
    | Pick<NotificationType, "link" | "data">
    | { link?: string | null; data?: NotificationData | null },
): string | null {
  return targetFromData(input.data) ?? notificationHref(input.link);
}
