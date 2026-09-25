import type { PersistRule } from "@abonten/core/query/persistPolicy";

// What survives an app restart. Everything here is data the person has
// already seen and that is safe to show again while stale: public listings
// and the detail screens behind them, profiles, the Spotlight feed's first
// page, Stories they can still watch, their inbox and recent threads, their
// own notifications, and the feature switches that decide which entry
// points exist (without those, an offline cold start would hide Spotlight,
// Search and Rewards entirely, because every programme hook fails closed).
//
// Messages are the person's own conversations, shown to them on their own
// phone: the file is theirs alone (one per account, deleted on sign-out) and
// is kept to the inbox's first page and the latest page of the most recent
// threads — enough that Messages opens offline to what was there, the way a
// messaging app is expected to, without mirroring whole histories.
//
// Deliberately NOT here — kept for the session only:
//   * money and identity: tickets and their QR codes, payments, wallet,
//     transactions, payouts, organizer finance, verification cases;
//   * comments (live, realtime-updated) and search results (query-specific);
//   * signed attachment links (they expire; the thread re-requests them);
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
  // Which market is being browsed, its currency and payment methods, the
  // display rates and the feature flags: public configuration plus the
  // person's own preferences. Without it an offline cold start would not
  // know which currency or payment methods to show.
  {
    id: "market-context",
    prefix: ["mobile", "markets", "context"],
    maxEntries: 3,
  },

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

  // Discovery. A detail screen's secondary sections are kept with it, so a
  // saved event or place reads the same offline as it did online.
  { id: "event-detail", prefix: ["mobile", "event"], maxEntries: 40 },
  { id: "place-detail", prefix: ["mobile", "place"], maxEntries: 40 },
  // Reviews of events and places: the rating breakdown and preview on each
  // details screen, the first page of each filtered list, a shared review.
  {
    id: "reviews",
    prefix: ["mobile", "reviews"],
    maxEntries: 80,
    maxPages: 1,
  },
  {
    id: "place-upcoming-events",
    prefix: ["mobile", "place-upcoming-events"],
    maxEntries: 20,
  },
  // Before "explore", whose newest-8 cap would otherwise evict the chips.
  {
    id: "place-categories",
    prefix: ["explore", "place-categories"],
    maxEntries: 1,
  },
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
  // What a Story ring opens. Expiry is enforced when it is shown
  // (StoryViewer drops ended Stories), so a saved sequence never replays a
  // Story past its lifetime.
  {
    id: "story-sequence",
    prefix: ["mobile", "content", "stories", "sequence"],
    maxEntries: 20,
  },

  // Messages: the unfiltered inbox views, the latest page of recent threads.
  {
    id: "inbox-all",
    prefix: ["mobile", "messaging", "list", "active", "all", "", "", false],
    maxEntries: 1,
    maxPages: 1,
  },
  {
    id: "inbox-member",
    prefix: ["mobile", "messaging", "list", "active", "member", "", "", false],
    maxEntries: 1,
    maxPages: 1,
  },
  {
    id: "inbox-business",
    prefix: [
      "mobile",
      "messaging",
      "list",
      "active",
      "business",
      "",
      "",
      false,
    ],
    maxEntries: 1,
    maxPages: 1,
  },
  {
    id: "thread-detail",
    prefix: ["mobile", "messaging", "detail"],
    maxEntries: 15,
  },
  {
    id: "thread-messages",
    prefix: ["mobile", "messaging", "messages"],
    maxEntries: 15,
    maxPages: 1,
  },
  {
    id: "unread-messages",
    prefix: ["mobile", "messaging", "unread-count"],
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
