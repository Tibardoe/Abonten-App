---
title: Discovery — unified search and opt-in recommendations
purpose: How Abonten searches events, places and organizers, how results are ranked, and how people opt in to alerts and recommendation notices that stay capped and controllable.
audience: Engineering, operations, security and privacy reviewers
scope: The search_* and recommendation* database functions and tables, notification_subscription and notification_prompt_state, @abonten/services search and notifications modules, web and mobile surfaces, admin module and scheduled jobs. Not covered - the older filter-only browsing RPCs (get_filtered_events and siblings), which are unchanged.
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Discovery — unified search and opt-in recommendations

**State (2026-09-13): built, in production, switched off.** `discovery_program_setting` ships with `search_v2_enabled = false`, `recommendations_enabled = false`, `recommendations_shadow_mode = true`, `prompts_enabled = false` and both audiences `staff`. With everything off, every surface behaves as before this work. Rollout steps are in §9 and [admin/discovery.md](../admin/discovery.md).

## 1. What changed and why

Before this work, search was an events-only `ILIKE` scan returned in date order. Places were only searchable from Explore, organizers not at all, nothing was measured, and the two suggestion RPCs returned hidden and archived rows. Notifications were transactional only: nobody could ask to hear from an organizer or a place, and there was no preference centre.

Discovery adds:

- **One search** across events, places and organizers with real ranking, and an `@handle` mode that finds organizers.
- **Explicit opt-in** alerts: a private "Notify me" on organizers and places, and "Enjoy events like this?" / "Like this place?" prompts after a ticket, an RSVP, a favorite, a review or a second check-in.
- **Recommendation notices** built from those opt-ins, at most one push a day and three a week per person, never at night, with shadow mode to measure volume before anything is sent.
- **A preference centre** on web and mobile that separates optional notices from transactional ones.

Everything runs on the existing stack: Postgres full-text and trigram search, pg_cron, the existing `notification_delivery` queue, `@abonten/services`, Server Actions and `/api/mobile`, and the admin console. No search engine or message broker was added (§8).

## 2. Search

### 2.1 Indexing

Stored generated `tsvector` columns, `simple` configuration (no stemming, so Ghanaian names are never mangled):

| Table | Column | Weight A | Weight B | Weight C |
|---|---|---|---|---|
| `event` | `search_tsv` | title | category, event types, `address->>'full_address'` | description (first 2,000 characters) |
| `place` | `search_tsv` | name | `address->>'full_address'` | description |
| `user_info` | `search_tsv` | username, full name | — | bio |

Each has a partial GIN index whose predicate is the visibility rule (published, not archived, moderation state not hidden or removed; `status_id = 1` for accounts), so drafts and hidden rows are never candidates. Trigram GIN indexes cover `event.title`, `place.name`, `user_info.username` and `user_info.full_name`, and a `text_pattern_ops` btree on `lower(username)` serves `@prefix` lookups. Migration: `supabase/migrations/20260913090000_search_v2_foundation.sql`.

### 2.2 Query handling

The same rules run in SQL and in `packages/core/src/search/parseSearchQuery.ts` (the TypeScript copy only drives the UI; it never builds SQL):

- Text is lower-cased, control characters removed, whitespace collapsed, capped at 120 characters.
- `@name` at the start switches to organizer mode. Anything else is text mode and needs at least two characters.
- Two tsqueries are built: every word required with a prefix match on the last word (typing as you go), and `websearch_to_tsquery` (quotes and `-word` work). LIKE patterns are escaped.

### 2.3 Candidates, then ranking

Each group is found in two stages.

**Stage 1 — candidates** (`_search_event_pool`, `_search_place_pool`, `_search_organizer_pool`). The precise match runs first: full text, last-word prefix, place category names, handle prefix and display-name word starts. Only when that finds fewer than five candidates are trigram matches added, so a typo ("afrobeets") still finds "Afrobeats" while a well-spelled query stays exact (`20260913090500_search_trigram_fallback.sql`). Each OR of different indexes is written as a UNION so every branch uses its own index (`20260913090600_search_pool_index_paths.sql`). Pools are capped at 400 rows per group.

**Stage 2 — score.** Weights live in the function bodies; changing one is a migration.

| Group | Score |
|---|---|
| Events (`search_events`) | 0.45 text + 0.15 time + 0.15 distance + 0.10 popularity + 0.05 completeness + 0.03 verified organizer + up to 0.08 new |
| Places (`search_places`) | 0.50 text + 0.15 distance + 0.12 popularity + 0.05 open now + 0.05 completeness + 0.05 verified + up to 0.08 new − 0.10 if temporarily closed |
| Organizers (`search_organizers`) | 0.55 text + 0.20 activity + 0.10 rating + 0.05 distance + 0.05 completeness + 0.05 verified + up to 0.08 new |

- **Text** mixes `ts_rank_cd` with exact, prefix and word-start title matches and trigram similarity.
- **Time** is 1 while an event is on, then halves every 7 days until it starts.
- **Distance** halves every 10 km when the searcher shares a location, and is a neutral 0.5 when they do not.
- **Popularity** is a logarithm of attendance and favorites plus a Bayesian rating (prior 3.8 over 5 reviews), so one five-star review does not outrank fifty four-star ones.
- **New** is 0.08 on the day of publication, falling to 0 over 14 days. Popularity is worth at most 0.10, so a relevant new event sits beside a popular one instead of below it.

Paging is keyset on `(score desc, id asc)` with a pinned `as_of`, so the time term does not drift between pages. A row whose popularity changes between two page requests can move; this is accepted and documented.

### 2.4 Functions and transports

| Function | Used by |
|---|---|
| `search_suggest(p_query, p_lat, p_lng, p_types)` | Type-ahead: up to 6 events, 4 places, 3 organizers (8 in `@` mode) |
| `search_events`, `search_places`, `search_organizers` | Result pages, 20 per page (max 50) |
| `get_event_suggestions`, `get_place_suggestions` | Old clients; same signatures, now with the visibility rule |

All are `SECURITY DEFINER`, `search_path = ''`, executable by `anon`. They return public listing and public profile columns only; organizers never expose email, phone or account status.

- **Service**: `packages/services/src/search/searchCore.ts` runs the groups a request needs in parallel, maps rows to `@abonten/types/searchType`, and treats one failed group as that group's error, not the whole search's.
- **Web**: `/search?q=&type=all|events|places|organizers&organizer=` (`apps/web/src/app/(pages)/search/page.tsx`), rate-limited Server Actions `searchDiscovery` (60 a minute) and `suggestDiscovery` (180 a minute). Old `/search/<slug>` links redirect when unified search is on; `/search?q=` redirects the other way when it is off for the visitor.
- **Mobile** (hybrid): type-ahead calls `search_suggest` directly with the anon key; submitted searches go through `GET /api/mobile/search`. The direct call is bounded only by the database caps. Type-ahead is not logged on either platform; only submitted searches are.

## 3. Search analytics

`search_query_log` holds the normalised query, mode, surface, platform, whether a location or filters were used, per-group counts, latency and the first result opened with its rank. **It has no user, device, session or IP column.** Rows are purged after `search_log_retention_days` (90) by the `search-log-purge` job. Only the first page of a search is logged; `search_logging_enabled` turns logging off. `admin_search_insights(p_days)` feeds Admin › Discovery. Migration: `20260913090100_search_query_log.sql`.

## 4. Opt-in model

### 4.1 Subscriptions

`notification_subscription` records what a person asked to hear about:

| Kind | Target | Created by |
|---|---|---|
| `organizer` | organizer account | "Notify me" on a profile or a search result |
| `place` | place | "Like this place?" prompt, or the place page bell |
| `similar_events` | category + location (rounded to 0.1°) + radius (default 25 km) | "Enjoy events like this?" after a ticket or an RSVP |
| `similar_places` | place category + location + radius | "Like this place?" prompt |

A unique `(user_id, kind, topic_key)` stops duplicates; following again reactivates the old row. There is no follower count anywhere. Clients can only read their own rows; every write goes through `packages/services/src/notifications/subscriptionCore.ts` with the service role after identity is checked, limited to 30 changes an hour. Migration: `20260913090300_notification_subscriptions.sql`.

### 4.2 Prompts

`notification_prompt_state` is the consent record: per person and topic, how often a prompt was shown, when it was dismissed and when it was accepted. `packages/services/src/notifications/promptCore.ts` decides whether a prompt may appear:

- the programme and prompts are on for the person;
- the interaction is real: a ticket or RSVP they hold, a favorite or review that exists, or at least two check-ins in 90 days (a first check-in may be reward-driven);
- they do not already have that subscription;
- at most 3 showings per topic, none within 30 days of "Not now", and at most one prompt of any kind in 7 days.

Declining creates nothing. The "Also alert me when @organizer posts" option starts unticked.

### 4.3 Preferences

`notification_preference` gained `recommendations_push`, `organizer_alerts_push`, `place_updates_push`, `social_push` (all default on) and `paused_until`. The `*_email` columns exist and default off; **nothing sends recommendation email** (legal item G1). Defaults are on because the subscription, which only exists after an explicit opt-in, is the gate that matters. Existing users received no subscriptions.

Transactional notices — tickets, payments, refunds, cancellations, security, verification decisions — have no switch. `social_push` controls pushes for messages, reviews, replies and booking updates (`packages/core/src/notifications/categories.ts`); the in-app row is always written.

## 5. Recommendation engine

Migrations `20260913090400_recommendations_engine.sql` and `20260913090700_recommendations_engine_scale.sql`.

1. **Publication.** A trigger stamps `event.published_at` / `place.published_at` the first time a row becomes published. Existing rows were backfilled from `created_at`, and the generator's watermark started at deploy time, so nothing published earlier is ever recommended.
2. **Candidates** — `recommendations_generate(200)` every 15 minutes. For each newly published subject (at least 5 minutes old), it matches active subscriptions (organizer, place, similar events by category and distance) and writes one `recommendation` row per person with the strongest reason. Rows that must not be sent are kept with a reason for the metrics: `inactive_user`, `not_visible`, `ended`, `own_subject`, `attending`, `saved`, `reminded`, `visited`. Outside the audience or in shadow mode, rows are marked `is_shadow`.
3. **Digest** — `recommendations_build_digest(20000, false)` every 10 minutes, acting only in `digest_hour_local` (18:00 Accra). Per person: re-check suppression, then skip (and record why in `recommendation_digest_skip`) when the daily cap is 0, the person paused, the weekly cap (3) is reached, or their last three delivered digests went unopened (which pauses them for 14 days). Hold back a second event from an organizer seen in the last 72 hours unless it starts within 48 hours. Pick up to five by score. Shadow: write the digest row only. Live: write one `notification` (`recommendation_digest`, data `{kind, digestId}` plus the subject id when there is one pick) and one `notification_delivery` with source `recommendations`, which can never be urgent. Each run picks up where the previous one stopped.
4. **Delivery** — the existing `notification-delivery` job. `notification_delivery_claim` skips a recommendation push when the programme is off or in shadow (`channel_off`) or when the person turned that reason off or paused (`opted_out`), re-checked at send time. Pushes follow the existing 08:00–20:59 Accra window. A trigger moves picks to `notified` when the push is sent and back to `candidate` when it is skipped or fails.
5. **Feedback** — opening the notice sets `recommendation_digest.opened_at`; "Not interested" on For you marks the pick dismissed, and three dismissals of the same subscription in 30 days pause it (it resumes after 30 days).
6. **Retention** — `recommendations_purge()` daily removes picks older than `recommendation_retention_days` (90), digests older than twice that (they carry the cap and open-rate history), and skip rows older than 30 days.

Picks are listed on **For you** (`/for-you`, `/(app)/for-you`) from `recommendations_for_user`: live picks from the last 30 days whose subject is still visible and not already acted on.

## 6. Programme switches

`discovery_program_setting` (one row) plus two env kill switches on the web deployment, read by `packages/services/src/search/discoveryProgram.ts`:

| Switch | Effect |
|---|---|
| `search_v2_enabled` + `search_audience` (`staff` / `beta` / `all`) | Unified search for that audience; everyone else gets the old search |
| `organizer_search_enabled`, `place_search_enabled` | Hide a group |
| `recommendations_enabled` | Jobs run; off also skips queued pushes |
| `recommendations_shadow_mode` | Compute and count, send nothing |
| `recommendations_audience` | Who gets alerts, prompts and For you |
| `prompts_enabled` | Opt-in prompts |
| `SEARCH_V2_KILL_SWITCH=true` | Old search everywhere on that deployment |
| `RECOMMENDATIONS_KILL_SWITCH=true` | No prompts, alerts or For you, no new subscriptions |

`staff` means an active `admin_user`. The resolver fails closed: an unreadable settings row means off. Settings are cached for 15 seconds per server instance. The answer is cached per person on both clients, so signing in never keeps the signed-out answer.

## 7. Security and privacy

- New tables have RLS on and no client write grants. Owners can read their own subscriptions and prompt state; `recommendation`, digests, skips, settings and the search log are service-role only.
- Search functions return only discoverable rows and public columns, bound parameters, escaped LIKE patterns, capped page and pool sizes.
- Push payloads carry a title, an event or place name and date, and ids. No other person's name, no address, no ticket data.
- Admin: `discovery.view` (operations, analyst) reads the module; `discovery.configure` (operations) changes settings behind step-up, with a reason and an audit entry (`discovery.settings.update`).
- Security advisors after the migrations: no new errors. The anon-executable `SECURITY DEFINER` warnings on `search_*` are intentional and match the existing discovery RPCs.

## 8. Why Postgres and not a search engine

Measured on 100,000 events, 20,000 places and 50,000 accounts, the slowest search shape had a p95 of 68 ms in the database and result pages stayed under 31 ms ([perf/discovery-2026-09.md](perf/discovery-2026-09.md)). An external engine becomes worth its operational cost for multi-language stemming, faceted counts over millions of rows or learned ranking. Revisit points: organizer search scans accounts whose names match a common word before checking they organize anything (fine to roughly 500,000 accounts; beyond that, maintain a flag), and popularity is computed per request over the candidate pool (fine to roughly a million engagement rows).

## 9. Rollout

1. **Internal**: search on for `staff`; recommendations on, shadow on, audience `staff`; prompts off. Watch Admin › Discovery.
2. **Pilot**: search `beta` then `all`; prompts on for `beta`; shadow still on. Check projected digests per person, duplicates and suppression reasons.
3. **Live**: shadow off for `beta`, then `all`. Exit criteria for shadow: p95 digests per person per week at or below the weekly cap, the same subject rarely offered twice, `not_visible` suppressions under 5%.

Turning `recommendations_enabled` off, or setting `RECOMMENDATIONS_KILL_SWITCH`, stops sends within one job tick. Dates and audiences are decision **N1** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md).

## 10. Known limitations

- Type-ahead suggestions are not logged, and on mobile they are bounded only by database limits.
- Expo push receipts are not polled; dead device tokens are pruned from send tickets only (existing behaviour).
- Recommendation email does not exist (legal item G1).
- Web has no push; the bell and For you page cover web.
- Place amenities (`place_service`) are not searchable.
- iOS has not been tested; Android was tested on the emulator against a local stack.
