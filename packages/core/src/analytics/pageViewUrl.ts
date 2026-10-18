// What a page view on abontenhub.com may tell Vercel Web Analytics.
//
// The pages people find through a post or a shared link (events, places,
// Explore, Weekly, Spotlight, public profiles, help, legal) keep their
// address, so visits can be counted per listing. Every other page is
// reported by its first segment only: their addresses carry one-time tokens
// (/consent/field/<token>, /weekly/preview/<token>), private ids
// (/messages/<id>, /checkout/<id>) or what someone typed (/search/<words>).
// The page's route pattern (/messages/[conversationId]) is sent beside the
// address by the analytics library itself, so nothing is lost for counting.
//
// Only a link's utm_* tags are kept: they are how a post says which post it
// is. ?ref=, ?code=, ?q= and everything else never leave the browser.

const CAMPAIGN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

// First path segments whose whole address is public.
const PUBLIC_SECTIONS = new Set([
  "events",
  "places",
  "explore",
  "weekly",
  "spotlight",
  "stories",
  "help",
  "legal",
]);

// Tabs of a public profile; bookings and favourites are private to the
// person (Privacy Policy §5).
const PUBLIC_PROFILE_TABS = new Set([
  "posts",
  "reviews",
  "places",
  "spotlight",
]);

function isPublicPath(segments: string[]): boolean {
  const [section, second, third] = segments;
  if (section === undefined) return true;
  if (section === "weekly") return second !== "preview";
  if (PUBLIC_SECTIONS.has(section)) return true;
  if (section === "user") {
    return third === undefined || PUBLIC_PROFILE_TABS.has(third);
  }
  return false;
}

/**
 * The address to report for a page view, or null when the address cannot be
 * read (the view is then not sent at all).
 */
export function pageViewUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const path = isPublicPath(segments)
    ? `/${segments.join("/")}`
    : `/${segments[0]}`;

  const kept = new URLSearchParams();
  for (const name of CAMPAIGN_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) kept.set(name, value);
  }
  const query = kept.toString();

  return `${url.origin}${path}${query ? `?${query}` : ""}`;
}
