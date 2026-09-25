---
title: Discovery — unified search and opt-in recommendations
purpose: How Abonten searches events, places and organizers, how results are ranked, and how people opt in to alerts and recommendation notices that stay capped and controllable.
audience: Engineering, operations, security and privacy reviewers
scope: The search_* and recommendation* database functions and tables, notification_subscription, notification_prompt_state and notification_consent_event, push delivery (Expo receipts, web push), @abonten/services search and notifications modules, web and mobile surfaces, admin module and scheduled jobs. Not covered - the older filter-only browsing RPCs (get_filtered_events and siblings), which are unchanged.
status: Approved
version: 1.2
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Discovery — unified search and opt-in recommendations

**State (2026-09-13): built, in production, switched off.** `discovery_program_setting` ships with `search_v2_enabled = false`, `recommendations_enabled = false`, `recommendations_shadow_mode = true`, `prompts_enabled = false` and both audiences `staff`. With everything off, every surface behaves as before this work. Rollout steps are in §9 and [admin/discovery.md](../admin/discovery.md).

**2026-09-15 — limitation fixes.** Place services are searchable (§2.1), type-ahead is rate-limited on both platforms and logged (§2.4, §3), Expo push receipts are read (§5, step 7), browsers can receive push (§5, step 8), and recommendation email exists but is locked off behind legal item G1 (§4.4). Migrations `20260915100000`–`20260915100300`.

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

`place_service` also has a generated `search_tsv` (service name A; description C, first 500 characters) with a GIN index, so a place is found by what it offers: "sauna", "braids", "parking" (`20260915100000_place_service_search.sql`). A generated column cannot read another table, which is why services are not folded into `place.search_tsv`.

The event, place and account columns each have a partial GIN index whose predicate is the visibility rule (published, not archived, moderation state not hidden or removed; `status_id = 1` for accounts), so drafts and hidden rows are never candidates. Trigram GIN indexes cover `event.title`, `place.name`, `user_info.username` and `user_info.full_name`, and a `text_pattern_ops` btree on `lower(username)` serves `@prefix` lookups. Migration: `supabase/migrations/20260913090000_search_v2_foundation.sql`.

### 2.2 Query handling

The same rules run in SQL and in `packages/core/src/search/parseSearchQuery.ts` (the TypeScript copy only drives the UI; it never builds SQL):

- Text is lower-cased, control characters removed, whitespace collapsed, capped at 120 characters.
- `@name` at the start switches to organizer mode. Anything else is text mode and needs at least two characters.
- Two tsqueries are built: every word required with a prefix match on the last word (typing as you go), and `websearch_to_tsquery` (quotes and `-word` work). LIKE patterns are escaped.

### 2.3 Candidates, then ranking

Each group is found in two stages.

**Stage 1 — candidates** (`_search_event_pool`, `_search_place_pool`, `_search_organizer_pool`). The precise match runs first: full text, last-word prefix, place category names, place services, handle prefix and display-name word starts. Only when that finds fewer than five candidates are trigram matches added, so a typo ("afrobeets") still finds "Afrobeats" while a well-spelled query stays exact (`20260913090500_search_trigram_fallback.sql`). Each OR of different indexes is written as a UNION so every branch uses its own index (`20260913090600_search_pool_index_paths.sql`). Pools are capped at 400 rows per group, and since 2026-09-25 (`20260925111700`) every ranking branch — precise, dated, related, relaxed, trigram, place services — scores at most `greatest(p_limit, 1500)` matching rows, the limit placed after every filter (market, moderation, radius, date window, category, organizer). Below the cap results are unchanged; above it the best of the first 1,500 matches are returned, so a word found in every listing costs about the same as a rare one.

**Stage 2 — score.** Weights live in the function bodies; changing one is a migration.

| Group | Score |
|---|---|
| Events (`search_events`) | 0.45 text + 0.15 time + 0.15 distance + 0.10 popularity + 0.05 completeness + 0.03 verified organizer + up to 0.08 new |
| Places (`search_places`) | 0.50 text + 0.15 distance + 0.12 popularity + 0.05 open now + 0.05 completeness + 0.05 verified + up to 0.08 new − 0.10 if temporarily closed |
| Organizers (`search_organizers`) | 0.55 text + 0.20 activity + 0.10 rating + 0.05 distance + 0.05 completeness + 0.05 verified + up to 0.08 new |

- **Text** mixes `ts_rank_cd` with exact, prefix and word-start title matches and trigram similarity. A place found only through a service uses 60% of the best service rank and an exact-match term of 0.30, below a category match (0.35) and a name match, so "Sauna House" ranks above a hotel that lists a sauna.
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
- **Mobile**: type-ahead goes through `GET /api/mobile/search/suggest` (180 a minute per user or IP, the programme's switches, logging) and submitted searches through `GET /api/mobile/search`. Until 2026-09-15 the app called `search_suggest` directly with the anon key, which nothing could rate-limit or count; the earlier "hybrid" decision was reversed by the owner for that reason. `search_suggest` keeps its anon grant so app builds from before the change keep working until they update; those builds' type-ahead stays unmetered and unlogged.

## 3. Search analytics

`search_query_log` holds the normalised query, mode, surface, platform, whether a location or filters were used, per-group counts, latency and the first result opened with its rank. **It has no user, device, session or IP column.** Rows are purged after `search_log_retention_days` (90) by the `search-log-purge` job. Only the first page of a search is logged; `search_logging_enabled` turns logging off. `admin_search_insights(p_days)` feeds Admin › Discovery. Migration: `20260913090100_search_query_log.sql`.

**Type-ahead** (2026-09-15): every suggestion request that reaches the database writes a row with `surface = 'suggest'`, and its id comes back as `searchId` so the suggestion someone opens is recorded like a result click. One search usually makes several suggestion rows (one per pause while typing, after the 300 ms debounce), so `admin_search_insights` keeps every existing figure over submitted searches only and reports suggestions separately (requests, share with nothing to suggest, share where a suggestion was opened, latency, platform, opened type) with no top-queries list, because type-ahead text is a prefix of what someone is still typing. Migration: `20260915100100_search_suggest_insights.sql`.

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

`notification_preference` gained `recommendations_push`, `organizer_alerts_push`, `place_updates_push`, `social_push` (all default on) and `paused_until`. The `*_email` columns default off and are only ever set by the person themselves (§4.4). Push defaults are on because the subscription, which only exists after an explicit opt-in, is the gate that matters. Existing users received no subscriptions.

Transactional notices — tickets, payments, refunds, cancellations, security, verification decisions — have no switch.

### 4.4 Recommendation email (locked off — legal item G1)

**Built 2026-09-15, switched off, and must stay off until legal item G1 is Decided** ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)). Promotional email needs consent and an opt-out under Act 843; the design below is what counsel is asked to confirm.

- **Same digest, not a new send.** The email carries the picks of the digest the push was built from, so it inherits the daily and weekly caps, the pause, the ignored-digest pause and the 18:00 build. `recommendations_build_digest` queues an email beside the push only when `discovery_program_setting.recommendations_email_enabled` is on and the person switched email on for at least one pick's reason. Migration: `20260915100300_recommendation_email.sql`.
- **Opt-in only.** One switch, "Email me picks and alerts", in Settings › Notifications on web and in the app, sets the three `*_email` columns together. It can be turned on only while the programme allows it for that person (`DiscoveryProgram.recommendationEmail`: personalisation on, shadow mode off, the email switch on, no kill switch) and the account has an email address; turning it off is always allowed. Nobody was opted in by the migration.
- **Consent record.** Every real change writes `notification_consent_event` (`granted` or `withdrawn`; `settings_web`, `settings_app`, `email_link` or `email_one_click`; the time). Service role only. How long to keep it is part of G3.
- **Ways out.** A footer link to `/unsubscribe/recommendations` (asks first; the signed token uses its own key, `recommendation-email-unsubscribe:v1`, so a rewards link cannot be replayed), the mail client's one-click button (`List-Unsubscribe` to `POST /api/notifications/unsubscribe?topic=recommendations`), and the settings switch. Opting back in happens only in settings, signed in.
- **Checked when sent.** `notification_delivery_claim` skips a queued recommendation email as `channel_off` when the email switch is off, and as `opted_out` against the *email* switches (push keeps the push switches). `recommendation_digest_email_items()` re-reads the picks: still visible, not ended, reason still allowed by email, subscription still active; an email with nothing left is skipped as `not_visible`. A queued recommendation email goes stale after one day.
- **Two channels, one digest.** `_recommendation_delivery_outcome` marks picks notified when either channel is sent, and returns them to candidates only when neither is still queued, sending or sent.
- **Content.** `RecommendationDigestEmailTemplate` (`apps/web`) lists each pick with why it is there ("New from @organizer", "Similar to events you liked") and says why the email came. Links go through `/notifications/open`, which marks the digest opened for the signed-in owner; there is no tracking pixel. Sent by `sendRecommendationDigestEmail` through Resend, with replies going to the support mailbox.
- **Switches.** Admin › Discovery › Settings "Recommendation email (legal item G1)" (step-up, reason, audit; the server refuses to switch it on without `confirmLegalG1`) and the web deployment's `RECOMMENDATION_EMAIL_KILL_SWITCH`, which hides the opt-in and skips queued emails. `social_push` controls pushes for messages, reviews, replies and booking updates (`packages/core/src/notifications/categories.ts`); the in-app row is always written.

## 5. Recommendation engine

Migrations `20260913090400_recommendations_engine.sql` and `20260913090700_recommendations_engine_scale.sql`.

1. **Publication.** A trigger stamps `event.published_at` / `place.published_at` the first time a row becomes published. Existing rows were backfilled from `created_at`, and the generator's watermark started at deploy time, so nothing published earlier is ever recommended.
2. **Candidates** — `recommendations_generate(200)` every 15 minutes. For each newly published subject (at least 5 minutes old), it matches active subscriptions (organizer, place, similar events by category and distance) and writes one `recommendation` row per person with the strongest reason. Rows that must not be sent are kept with a reason for the metrics: `inactive_user`, `not_visible`, `ended`, `own_subject`, `attending`, `saved`, `reminded`, `visited`. Outside the audience or in shadow mode, rows are marked `is_shadow`.
3. **Digest** — `recommendations_build_digest(20000, false)` every 10 minutes, acting only in `digest_hour_local` (18:00 Accra). Per person: re-check suppression, then skip (and record why in `recommendation_digest_skip`) when the daily cap is 0, the person paused, the weekly cap (3) is reached, or their last three delivered digests went unopened (which pauses them for 14 days). Hold back a second event from an organizer seen in the last 72 hours unless it starts within 48 hours. Pick up to five by score. Shadow: write the digest row only. Live: write one `notification` (`recommendation_digest`, data `{kind, digestId}` plus the subject id when there is one pick) and one `notification_delivery` with source `recommendations`, which can never be urgent. Each run picks up where the previous one stopped.
4. **Delivery** — the existing `notification-delivery` job. `notification_delivery_claim` skips a recommendation push when the programme is off or in shadow (`channel_off`) or when the person turned that reason off or paused (`opted_out`), re-checked at send time. Pushes follow the existing 08:00–20:59 Accra window. A trigger moves picks to `notified` when the push is sent and back to `candidate` when it is skipped or fails.
5. **Feedback** — opening the notice sets `recommendation_digest.opened_at`; "Not interested" on For you marks the pick dismissed, and three dismissals of the same subscription in 30 days pause it (it resumes after 30 days).
6. **Email** — for people who opted in, once G1 allows the switch (§4.4); same digest, same caps.
7. **Expo push receipts** — Expo answers a send with a ticket per message; whether Apple or Google took it is in the receipt, ready about 15 minutes later and kept for about a day. `sendPushToUser` records every accepted ticket in `push_receipt`; `run_notification_delivery` also wakes `POST /api/notifications/deliver` when a receipt is due and drops rows older than a day; the route's `pollPushReceiptsCore` reads them in batches of 300, deletes device tokens reported `DeviceNotRegistered`, logs every other provider error (`MessageTooBig`, `MessageRateExceeded`, `InvalidCredentials`, `MismatchSenderId`; these reach Sentry) and checks tickets without a receipt again 15 minutes later. Applies to every push, not only recommendations. Migration: `20260915100200_push_receipts_and_web_push.sql`.
8. **Web push** — signed-in web users can turn on "Browser notifications" in Settings › Notifications. The switch registers `/push-sw.js` (shows and opens pushes only: no caching, no fetch handler), asks the browser for permission from that click, subscribes with the VAPID public key and saves the subscription in `web_push_subscription` through a Server Action (`@abonten/services/notifications/webPushCore`). `sendPushToUser` then sends to browsers alongside the app's Expo tokens, so every notice that pushes to the app reaches them, under the same preferences, quiet hours and caps. Only endpoints on Google, Mozilla, Apple or Microsoft push services are stored (the server POSTs to the endpoint, so any other URL is refused), at most ten browsers per person; a 404 or 410 from the push service deletes the subscription. A click opens `/notifications/open`, which marks the notice read (and a digest opened) and redirects to a path on the site. Signing out removes this browser's subscription first, so a shared computer never shows the previous person's notices; account deletion removes all of them. Needs `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` on the web deployment; without them the switch is hidden and nothing is sent. iPhone and iPad support it only from a Home Screen web app (iOS 16.4 or later), which the settings text explains.
9. **Retention** — `recommendations_purge()` daily removes picks older than `recommendation_retention_days` (90), digests older than twice that (they carry the cap and open-rate history), and skip rows older than 30 days.

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
| `recommendations_email_enabled` | Lets the audience opt in to the digest by email. **Legal item G1: keep off** |
| `RECOMMENDATION_EMAIL_KILL_SWITCH=true` | No email opt-in; queued recommendation emails are skipped. Push and in-app unaffected |

`staff` means an active `admin_user`. The resolver fails closed: an unreadable settings row means off. Settings are cached for 15 seconds per server instance. The answer is cached per person on both clients, so signing in never keeps the signed-out answer.

## 7. Security and privacy

- New tables have RLS on and no client write grants. `push_receipt`, `web_push_subscription` and `notification_consent_event` have no anon or authenticated privileges at all. Owners can read their own subscriptions and prompt state; `recommendation`, digests, skips, settings and the search log are service-role only.
- Search functions return only discoverable rows and public columns, bound parameters, escaped LIKE patterns, capped page and pool sizes.
- Push payloads carry a title, an event or place name and date, and ids. No other person's name, no address, no ticket data.
- Admin: `discovery.view` (operations, analyst) reads the module; `discovery.configure` (operations) changes settings behind step-up, with a reason and an audit entry (`discovery.settings.update`).
- Security advisors after the migrations: no new errors. The anon-executable `SECURITY DEFINER` warnings on `search_*` are intentional and match the existing discovery RPCs.

## 8. Why Postgres and not a search engine

Broad queries (a word in nearly every listing, e.g. the city) were measured on 2026-09-25 before and after the ranking cap: `search_events` 2.6 s → 115 ms, `search_suggest` 1.0 s → 38 ms on the same 100,000-event catalogue. The perf harness now includes these cases and fails if their p95 exceeds 500 ms.

Measured on 100,000 events, 20,000 places and 50,000 accounts, the slowest search shape had a p95 of 68 ms in the database and result pages stayed under 31 ms ([perf/discovery-2026-09.md](perf/discovery-2026-09.md)). An external engine becomes worth its operational cost for multi-language stemming, faceted counts over millions of rows or learned ranking. Revisit points: organizer search scans accounts whose names match a common word before checking they organize anything (fine to roughly 500,000 accounts; beyond that, maintain a flag), and popularity is computed per request over the candidate pool (fine to roughly a million engagement rows).

## 9. Rollout

1. **Internal**: search on for `staff`; recommendations on, shadow on, audience `staff`; prompts off. Watch Admin › Discovery.
2. **Pilot**: search `beta` then `all`; prompts on for `beta`; shadow still on. Check projected digests per person, duplicates and suppression reasons.
3. **Live**: shadow off for `beta`, then `all`. Exit criteria for shadow: p95 digests per person per week at or below the weekly cap, the same subject rarely offered twice, `not_visible` suppressions under 5%.

Turning `recommendations_enabled` off, or setting `RECOMMENDATIONS_KILL_SWITCH`, stops sends within one job tick. Dates and audiences are decision **N1** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md).

## 10. Known limitations

- App builds from before 2026-09-15 still fetch type-ahead straight from `search_suggest`: unmetered and unlogged until people update. Revoking the anon grant would break their search, so it stays until the minimum supported build moves past the change.
- Recommendation email is built but must stay off until legal item G1 is Decided (§4.4). How long to keep `notification_consent_event` is part of G3.
- Web push needs the three `WEB_PUSH_*` environment variables on the web deployment before anyone can turn it on. It has not been checked against real browser push services (the integration suite mocks the sender), and Safari on iPhone and iPad supports it only from a Home Screen web app.
- A browser subscription the push service rotates is replaced the next time the person opens Settings › Notifications; until then pushes to the old endpoint fail and it is deleted on the push service's 410.
- A place found through a service does not say which service matched.
- iOS has not been tested; Android was tested on the emulator against a local stack.
