import type { ShowcaseHiddenReason } from "@abonten/types/showcaseType";

// Why an entry is not on the wall right now, in the console's words
// (English only). The codes come from _showcase_subject_state() in
// supabase/migrations/20261126100000_on_abonten_showcase.sql.
export const SHOWCASE_REASON_LABEL: Record<ShowcaseHiddenReason, string> = {
  market_closed: "Market not open (not live)",
  account_deleted: "Account deleted",
  account_restricted: "Account suspended or banned",
  team_paused: "Team frozen or closed",
  no_upcoming_event: "No upcoming event in this market",
  missing: "Listing no longer exists",
  other_market: "Place is in another market",
  ownerless: "Nobody runs it (owner account deleted)",
  owner_restricted: "Owner suspended or banned",
  not_published: "Not published",
  moderated: "Hidden, removed or restricted by moderation",
  permanently_closed: "Permanently closed",
  not_claimed: "Listed by Abonten staff, not claimed yet",
};
