// Shared between the Server Component (explore/[location]/page.tsx) and the
// Client Component (ExploreTabs.tsx) — mirrors
// src/app/(pages)/manage/my-events/myEventsTab.ts's split, since a plain
// helper exported from a "use client" module can't be invoked directly from
// server code (only rendered/passed as a prop).
export const EXPLORE_TAB_VALUES = ["events", "places"] as const;
export type ExploreTab = (typeof EXPLORE_TAB_VALUES)[number];

export function isExploreTab(value: string | undefined): value is ExploreTab {
  return !!value && (EXPLORE_TAB_VALUES as readonly string[]).includes(value);
}
