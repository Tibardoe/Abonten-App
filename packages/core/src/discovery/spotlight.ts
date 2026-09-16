// The Explore "Spotlight": the single hero carousel at the top of discovery.
//
// Three kinds of top-of-feed content used to compete there — the editorial
// Abonten Weekly edition and paid Featured events / places — as two stacked
// banners with two autoplays and two progress indicators. The Spotlight puts
// them in ONE carousel with one height, one indicator and one rotation.
//
// This module is the framework-free half: which slides exist, in what order,
// and how many. Rendering lives in the app. Keeping the decision here makes
// the ordering testable and lets another surface (web, a future sponsored
// slot) reuse it without copying the rules.
//
// Rules:
//   • The Weekly edition, when one is out for the area, is the first slide —
//     it is the area's front page and the one slide that links to many
//     listings. It shows on both tabs because an edition mixes events and
//     places.
//   • Then the tab's Featured listings, in the order the feed ranked them.
//     A listing is never repeated (the same id twice from upstream data).
//   • Featured content is a paid placement, not a search result, so the
//     caller passes the UNFILTERED featured lists.
//   • Capped, so rotation through every slide stays short and the carousel
//     never renders an unbounded strip of full-bleed images.

export const SPOTLIGHT_MAX_SLIDES = 8;

export type SpotlightSlide<W, E, P> =
  | { kind: "weekly"; key: string; weekly: W }
  | { kind: "event"; key: string; event: E }
  | { kind: "place"; key: string; place: P };

export function buildSpotlightSlides<
  W extends { scopeSlug: string; weekStart: string },
  E extends { id: string },
  P extends { id: string },
>({
  tab,
  weekly,
  featuredEvents,
  featuredPlaces,
  max = SPOTLIGHT_MAX_SLIDES,
}: {
  tab: "events" | "places";
  weekly: W | null | undefined;
  featuredEvents: readonly E[];
  featuredPlaces: readonly P[];
  max?: number;
}): SpotlightSlide<W, E, P>[] {
  const slides: SpotlightSlide<W, E, P>[] = [];
  if (weekly) {
    slides.push({
      kind: "weekly",
      key: `weekly:${weekly.scopeSlug}:${weekly.weekStart}`,
      weekly,
    });
  }

  const seen = new Set<string>();
  if (tab === "events") {
    for (const event of featuredEvents) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      slides.push({ kind: "event", key: `event:${event.id}`, event });
    }
  } else {
    for (const place of featuredPlaces) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      slides.push({ kind: "place", key: `place:${place.id}`, place });
    }
  }

  return slides.slice(0, Math.max(0, max));
}

/**
 * The hero height for a given window width: tall enough to read as the
 * page's hero (roughly square on a phone), bounded so a large phone or a
 * tablet in portrait never pushes the feed below the fold.
 */
export function spotlightHeight(windowWidth: number): number {
  return Math.round(Math.min(Math.max(windowWidth * 0.92, 320), 440));
}
