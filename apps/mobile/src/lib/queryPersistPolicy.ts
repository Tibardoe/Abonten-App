import type { PersistRule } from "@abonten/core/query/persistPolicy";

// What survives an app restart. Everything here is data the person has
// already seen and that is safe to show again while stale: public listings,
// profiles, the Spotlight feed's first page, their own notifications and the
// feature switches that decide which entry points exist (without those, an
// offline cold start would hide Spotlight, Search and Rewards entirely,
// because every programme hook fails closed).
//
// Deliberately NOT here — kept for the session only:
//   * money and identity: tickets and their QR codes, payments, wallet,
//     transactions, payouts, organizer finance, verification cases;
//   * private conversations (messaging keeps its own failed-send outbox);
//   * comments (live, realtime-updated) and search results (query-specific);
//   * anything a screen would act on as fresh truth (checkout sessions,
//     promotion quotes, eligibility checks).
//
// The file is per signed-in user, lives in the OS cache directory (excluded
// from device backups, may be purged under storage pressure) and is deleted
// on sign-out. Changing the shape of a persisted query's data requires
// bumping QUERY_CACHE_VERSION in queryPersistence.ts.
export const PERSIST_RULES: readonly PersistRule[] = [
  // Identity and feature switches
  { id: "own-profile", prefix: ["mobile", "profile"], maxEntries: 1 },
  { id: "roles", prefix: ["role"], maxEntries: 4 },
  {
    id: "content-program",
    prefix: ["mobile", "content", "program"],
    maxEntries: 2,
  },
  {
    id: "discovery-program",
    prefix: ["mobile", "discovery", "program"],
    maxEntries: 2,
  },
  {
    id: "rewards-program",
    prefix: ["mobile", "rewards", "program"],
    maxEntries: 1,
  },
  {
    id: "verification-program",
    prefix: ["mobile", "verification", "program"],
    maxEntries: 1,
  },
  { id: "weekly", prefix: ["mobile", "weekly"], maxEntries: 4 },

  // Profiles
  { id: "public-profile", prefix: ["profile", "public"], maxEntries: 30 },
  {
    id: "profile-highlights",
    prefix: ["profile", "highlights"],
    maxEntries: 20,
  },
  {
    id: "profile-events",
    prefix: ["profile", "events"],
    maxEntries: 20,
    maxPages: 1,
  },
  {
    id: "profile-places",
    prefix: ["profile", "places"],
    maxEntries: 20,
    maxPages: 1,
  },
  {
    id: "profile-reviews",
    prefix: ["profile", "reviews"],
    maxEntries: 10,
    maxPages: 1,
  },
  {
    id: "profile-place-reviews",
    prefix: ["profile", "place-reviews"],
    maxEntries: 10,
    maxPages: 1,
  },

  // Discovery
  { id: "event-detail", prefix: ["mobile", "event"], maxEntries: 40 },
  { id: "place-detail", prefix: ["mobile", "place"], maxEntries: 40 },
  { id: "explore", prefix: ["explore"], maxEntries: 8, maxPages: 1 },
  { id: "nearby", prefix: ["discovery", "nearby"], maxEntries: 3, maxPages: 1 },

  // Spotlight + Stories
  {
    id: "content-feed",
    prefix: ["mobile", "content", "feed"],
    maxEntries: 5,
    maxPages: 1,
  },
  { id: "content-post", prefix: ["mobile", "content", "post"], maxEntries: 30 },
  {
    id: "content-publisher",
    prefix: ["mobile", "content", "publisher"],
    maxEntries: 15,
    maxPages: 1,
  },
  {
    id: "content-own",
    prefix: ["mobile", "content", "own"],
    maxEntries: 6,
    maxPages: 1,
  },
  {
    id: "content-saved",
    prefix: ["mobile", "content", "saved"],
    maxEntries: 1,
    maxPages: 1,
  },
  {
    id: "story-tray",
    prefix: ["mobile", "content", "stories", "tray"],
    maxEntries: 1,
  },

  // Account
  {
    id: "notifications",
    prefix: ["mobile", "notifications"],
    maxEntries: 2,
    maxPages: 1,
  },
  {
    id: "active-promotions",
    prefix: ["mobile", "account", "promotions"],
    maxEntries: 1,
  },
];
