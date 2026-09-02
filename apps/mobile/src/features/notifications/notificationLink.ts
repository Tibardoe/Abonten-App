// Maps a notification's stored web `link` path to the matching native route.
// The web app (apps/web/src/components/organisms/NotificationBell.tsx) just
// does `router.push(notification.link)` on tap; on native the same links have
// to be translated to `/(app)/…` routes. The link values actually generated
// today (grep `link:` across packages/services + apps/web/src/actions):
//   /settings/edit-profile · /manage/events/:id · /manage/places/:id ·
//   /places/:slug · null
// Anything unrecognised returns null → the row is still marked read, it just
// doesn't navigate.

const RULES: [RegExp, (id: string) => string][] = [
  [/^\/manage\/events\/([^/?#]+)/, (id) => `/(app)/organizer/events/${id}`],
  [/^\/manage\/places\/([^/?#]+)/, (id) => `/(app)/organizer/places/${id}`],
  [/^\/places\/([^/?#]+)/, (id) => `/(app)/place/${id}`],
  [/^\/events?\/([^/?#]+)/, (id) => `/(app)/event/${id}`],
];

export function notificationHref(
  link: string | null | undefined,
): string | null {
  if (!link) return null;
  if (link === "/settings/edit-profile") return "/(app)/settings/edit-profile";

  for (const [pattern, build] of RULES) {
    const match = link.match(pattern);
    if (match) return build(match[1]);
  }
  return null;
}
