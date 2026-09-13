// The registry of Abonten Weekly section kinds. A kind is a template: it
// supplies a default title, which listings it takes and how clients lay it
// out. Editors can change every one of these per section, so no section is
// hard-coded into any UI. The SQL CHECK on weekly_section.kind lists the same
// keys (supabase/migrations/20260913120000_weekly_core.sql).

import type {
  WeeklyLayout,
  WeeklySectionKind,
  WeeklySubjectScope,
} from "@abonten/types/weeklyType";

export type WeeklySectionKindDefinition = {
  kind: WeeklySectionKind;
  /** Shown in the admin kind picker. */
  label: string;
  description: string;
  defaultTitle: string;
  defaultSubtitle: string | null;
  defaultIconKey: string | null;
  subjectScope: WeeklySubjectScope;
  defaultLayout: WeeklyLayout;
  /** Editors can add it by hand (for_you is filled per person, later). */
  editorial: boolean;
};

export const WEEKLY_SECTION_KINDS: readonly WeeklySectionKindDefinition[] = [
  {
    kind: "editorial",
    label: "Editorial note",
    description: "A short paragraph from the Abonten team. No listings.",
    defaultTitle: "This week in Ghana",
    defaultSubtitle: null,
    defaultIconKey: "sparkles",
    subjectScope: "mixed",
    defaultLayout: "editorial",
    editorial: true,
  },
  {
    kind: "curated",
    label: "Curated picks",
    description: "Hand-picked events and places.",
    defaultTitle: "Worth discovering",
    defaultSubtitle: null,
    defaultIconKey: "star",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "this_week",
    label: "This week",
    description: "Events happening between Monday and Sunday.",
    defaultTitle: "Happening this week",
    defaultSubtitle: null,
    defaultIconKey: "calendar",
    subjectScope: "events",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "weekend",
    label: "This weekend",
    description: "The best things to do on Friday, Saturday and Sunday.",
    defaultTitle: "Best things to do this weekend",
    defaultSubtitle: null,
    defaultIconKey: "party",
    subjectScope: "events",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "new",
    label: "New on Abonten",
    description: "Recently published events and places.",
    defaultTitle: "New on Abonten",
    defaultSubtitle: null,
    defaultIconKey: "new",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "free",
    label: "Free things to do",
    description: "Free events and experiences.",
    defaultTitle: "Free things to do",
    defaultSubtitle: null,
    defaultIconKey: "free",
    subjectScope: "events",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "trending",
    label: "Trending",
    description: "Listings people are engaging with right now.",
    defaultTitle: "Trending now",
    defaultSubtitle: null,
    defaultIconKey: "fire",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "hidden_gems",
    label: "Hidden gems",
    description: "Great listings that deserve more attention.",
    defaultTitle: "Hidden gems",
    defaultSubtitle: null,
    defaultIconKey: "gem",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "nearby",
    label: "Around the area",
    description: "Listings in this edition's area.",
    defaultTitle: "Around you",
    defaultSubtitle: null,
    defaultIconKey: "pin",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "category",
    label: "Category",
    description: "One theme, such as music and nightlife or business.",
    defaultTitle: "Music & nightlife",
    defaultSubtitle: null,
    defaultIconKey: "music",
    subjectScope: "events",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "top_places",
    label: "Highly rated places",
    description: "Places with strong reviews.",
    defaultTitle: "Highly rated places",
    defaultSubtitle: null,
    defaultIconKey: "star",
    subjectScope: "places",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "new_places",
    label: "New places",
    description: "Places recently added to Abonten.",
    defaultTitle: "New places to try",
    defaultSubtitle: null,
    defaultIconKey: "food",
    subjectScope: "places",
    defaultLayout: "carousel",
    editorial: true,
  },
  {
    kind: "for_you",
    label: "For you (later)",
    description:
      "Personal picks filled for each signed-in person. Not shown yet.",
    defaultTitle: "For you",
    defaultSubtitle: null,
    defaultIconKey: "heart",
    subjectScope: "mixed",
    defaultLayout: "carousel",
    editorial: false,
  },
];

export const WEEKLY_SECTION_KIND_KEYS = WEEKLY_SECTION_KINDS.map(
  (k) => k.kind,
) as readonly WeeklySectionKind[];

export const WEEKLY_LAYOUTS: readonly WeeklyLayout[] = [
  "hero",
  "carousel",
  "grid",
  "list",
  "editorial",
];

export const WEEKLY_LAYOUT_LABEL: Record<WeeklyLayout, string> = {
  hero: "Hero (one big card)",
  carousel: "Carousel",
  grid: "Grid",
  list: "List",
  editorial: "Text only",
};

export function weeklySectionKind(
  kind: string,
): WeeklySectionKindDefinition | undefined {
  return WEEKLY_SECTION_KINDS.find((k) => k.kind === kind);
}

/** Can a listing of this type go into a section that takes `scope`? */
export function sectionAccepts(
  scope: WeeklySubjectScope,
  subjectType: "event" | "place",
): boolean {
  if (scope === "mixed") return true;
  return scope === (subjectType === "event" ? "events" : "places");
}

/**
 * A new edition starts with these sections, in this order. Editors remove
 * what they do not need; nothing here is required.
 */
export const WEEKLY_DEFAULT_TEMPLATE: readonly WeeklySectionKind[] = [
  "editorial",
  "weekend",
  "new",
  "free",
  "top_places",
];
