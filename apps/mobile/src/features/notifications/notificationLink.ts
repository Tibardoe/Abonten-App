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
  [/^\/messages\/([^/?#]+)/, (id) => `/(app)/messages/${id}`],
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
    case "message":
      return data.conversationId
        ? `/(app)/messages/${data.conversationId}`
        : "/(app)/(tabs)/messages";
    case "ticket":
      if (data.ticketId) return `/(app)/ticket/${data.ticketId}`;
      // e.g. "Event cancelled": open the section it's listed in.
      return data.ticketsSection
        ? `/(app)/(tabs)/tickets?section=${data.ticketsSection}`
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
    case "review_received":
      // The owner/organizer got a new review — open the screen where they
      // can read and reply to it, not the public listing.
      if (data.eventId)
        return `/(app)/organizer/events/${data.eventId}/reviews`;
      if (data.placeId)
        return `/(app)/organizer/places/${data.placeId}/reviews`;
      return null;
    case "profile":
      return "/(app)/settings/edit-profile";
    case "place_claim":
      return data.placeId ? `/(app)/organizer/places/${data.placeId}` : null;
    case "place_booking":
      return data.placeId ? `/(app)/place/${data.placeId}` : null;
    case "rewards":
      return "/(app)/rewards";
    case "fieldops":
      // Field workers use the web app (/field). The app has no section to
      // open until Phase 9, so the notice is readable but not tappable.
      return null;
    case "verification":
      if (data.verificationSubject === "organizer") {
        return "/(app)/organizer/verification";
      }
      return data.placeId
        ? `/(app)/organizer/places/${data.placeId}/verification`
        : "/(app)/organizer/verification";
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
