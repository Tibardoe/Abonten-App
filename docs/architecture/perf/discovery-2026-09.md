---
title: Discovery performance measurements (September 2026)
purpose: Record what the search and recommendation functions cost on a large synthetic catalogue, what the measurements changed, and how to repeat them.
audience: Engineering
scope: search_suggest, search_events, search_places (including place services), search_organizers, get_events_in_window, the Explore lists (get_filtered_events, get_nearby_events, get_explore_event_sections, get_similar_events, get_filtered_places, get_nearby_places), recommendations_generate, recommendations_build_digest, admin_recommendation_metrics. Local Docker Postgres only; not production latency.
status: Approved
version: 1.4
lastReviewed: 2026-10-03
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Discovery performance measurements (September 2026)

## How these were taken

Scripts: `scripts/perf/` (see its README). One transaction seeds 50,000 accounts (2,000 organizers), 100,000 events, 20,000 places and about 60,000 attendance rows, times each case 40 times after two warm-up runs as the `anon` role, prints index plans, and rolls back. Titles mix 50 common real words (each in about 6% of events, the worst case), 500 mid-frequency words (about 0.2%) and 20,000 rare words (about 5 events each).

The machine was a Windows laptop running the local Supabase Docker stack. Treat the numbers as relative: they show which shapes are expensive and whether plans use their indexes. Production latency is recorded per search in `search_query_log.latency_ms` and shown in Admin › Discovery.

Targets set before measuring: suggestions p95 under 60 ms in the database; result pages under 120 ms; generating picks for one event with tens of thousands of subscribers under 2 s; a digest for 10,000 people under 30 s.

## Search

Database time, milliseconds, after migration `20260913090600_search_pool_index_paths.sql`.

| Case | Rows | p50 | p95 | max |
|---|---|---|---|---|
| suggest · 2 characters, common prefix ("ja") | 13 | 51.3 | 55.7 | 77.1 |
| suggest · common word | 13 | 46.8 | 49.7 | 53.3 |
| suggest · mid-frequency word | 13 | 29.8 | 31.3 | 32.3 |
| suggest · mid-frequency prefix (4 characters) | 13 | 29.9 | 36.8 | 47.4 |
| suggest · rare word | 4 | 22.0 | 26.2 | 30.3 |
| suggest · typo of a rare word (trigram fallback) | 3 | 17.0 | 18.0 | 25.2 |
| suggest · typo of a common word (trigram fallback) | 13 | 54.3 | 67.5 | 72.3 |
| suggest · common + mid word, with location | 13 | 37.6 | 46.1 | 51.0 |
| suggest · `@handle` prefix | 8 | 11.8 | 12.3 | 13.5 |
| events · common word, with location | 21 | 21.8 | 23.2 | 26.7 |
| events · mid-frequency word, with location | 21 | 5.0 | 5.5 | 5.7 |
| events · rare word | 3 | 3.7 | 3.9 | 4.1 |
| events · common word + price + date filters | 0 | 25.9 | 27.0 | 32.0 |
| events · one organizer's events | 21 | 1.0 | 1.1 | 1.2 |
| places · common word, with location | 21 | 20.3 | 26.0 | 28.2 |
| places · mid-frequency word | 21 | 8.1 | 12.9 | 13.8 |
| places · category name ("restaurant") | 21 | 25.5 | 30.2 | 33.1 |
| organizers · mid-frequency word | 4 | 12.4 | 13.6 | 16.7 |
| organizers · `@handle` prefix | 21 | 8.1 | 8.7 | 13.3 |

Result pages meet their target with a wide margin. Suggestions meet theirs except one worst case: a misspelling of a word that appears in 6% of all events and 2% of all account names, at 67.5 ms p95. Real vocabularies are rarely that concentrated.

Plans confirmed: event and place candidates use the partial GIN indexes (`idx_event_search_tsv`, `idx_place_search_tsv`), the event trigram fallback uses `idx_event_title_trgm`, and `@handle` uses `idx_user_info_username_prefix`.

### What the measurements changed

The first run, with 2,000 accounts, looked fine. Growing accounts to 50,000 exposed two plans that read whole tables:

- The organizer trigram fallback (`username <% q OR full_name <% q`) became a sequential scan of `user_info`: **105 ms** for one lookup, growing with every sign-up. The `@handle` display-name match (`lower(full_name) LIKE`) had the same problem.
- The place candidate query (`text match OR category_id = any(...)`) scanned `place` even when no category matched.

Migration `20260913090600` rewrites each OR as a UNION of indexed branches and finds display-name word starts through the A-weighted lexemes of `search_tsv`. What matches and how it scores did not change; the integration suite gained a test for display-name matching.

### Place services (2026-09-15)

Migration `20260915100000` adds a place-services branch to `_search_place_pool`. The seed now also writes five services per place (100,000 rows): one of 20 amenity words, each in 5% of services, plus a mid-frequency word. Same laptop, same method:

| Case | Rows | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| places · common word, with location ("rooftop", now also an amenity word) | 21 | 41.9 | 51.9 | 56.2 |
| places · mid-frequency word (also in about 200 services) | 21 | 12.4 | 14.8 | 15.8 |
| places · category name ("restaurant", no service matches) | 21 | 20.2 | 23.4 | 29.2 |
| places · common amenity ("sauna", 5,000 services) | 21 | 38.3 | 42.0 | 43.6 |
| places · amenity + mid-frequency word | 21 | 8.0 | 9.0 | 9.1 |
| suggest · common amenity ("massage") | 4 | 41.8 | 48.8 | 49.9 |

Queries no service matches cost the same as before (category name 25.5 → 20.2 ms p50, events and organizers unchanged). Queries that do match services cost more in proportion to how many services match, because every matching place is scored before the top 400 are kept: "rooftop" went from 20.3 to 41.9 ms p50 once 5,000 services also contained it. That is the worst case the seed can produce and stays under the 68 ms p95 of the slowest suggestion shape. The services branch uses `idx_place_service_search_tsv` (5,000 matches in 1.7 ms). If a real amenity word ever matches tens of thousands of services, cap the services branch before scoring.

## Recommendation engine

Setup: 10,000 of the seeded people subscribe to 3 organizers each and to similar events around Accra in 2 categories (60,000 subscriptions); one organizer is followed by all 10,000; 200,000 historic notifications exist; 50 events are published; shadow mode off so the full notification path runs.

| Step | Before | After `20260913090700` |
|---|---|---|
| `recommendations_generate(200)` — 164 subjects, 132,844 picks | 12.6 s | 4.4 s |
| — the event followed by 10,000 people | about 0.95 s (estimated from the per-row rate) | about 0.33 s (estimated) |
| second run with nothing new | 0.5 ms | 0.4 ms |
| `recommendations_build_digest` — 10,000 people, 10,000 pushes queued, near-empty `notification` table | 38.7 s | 17.5 s |
| the same, with 200,000 historic notifications (realistic for 10,000 subscribers) | not measured | 11.2 s |
| second digest run the same day | 5.1 s | 0.8 s |
| `admin_recommendation_metrics(14)` | 0.21 s | 0.21 s |

Checks in the same run: every person got exactly one digest, at most five picks, and a second run the same day added none.

### What the measurements changed

`pg_stat_statements` (with nested statement tracking) showed three causes, all fixed in `20260913090700_recommendations_engine_scale.sql`:

1. **Per-row suppression.** A PL/pgSQL function re-read the subject for every one of the 10,000 followers of the same event. Subject checks now run once per subject; per-person checks are plain SQL in the same statement.
2. **Quadratic digest loop.** Four per-person lookups on `recommendation_digest` ran while the loop inserted into that table. PL/pgSQL cached plans made while the table was nearly empty, so each lookup scanned a growing table. The history is now read once, in the query that drives the loop.
3. **A starvation bug found on the way.** The digest job ran hourly with a 5,000-person limit and acted only in the digest hour, so anyone after the first 5,000 people (ordered by id) would never have received a digest. The loop now skips people already handled today and the job runs every 10 minutes during that hour. An integration test builds a day's digests one person per run.

Remaining cost in the digest is mostly foreign-key checks and inserts, about 1.1 ms per person. At that rate the 20,000-person batch the job requests takes about 22 seconds, and six runs in the digest hour cover about 120,000 people.

## Search in the reader's language (2026-10-02)

Migration `20261002140000_search_reads_every_language.sql` folds the search
documents and the query, reads date words from a table, widens the
vocabulary to four more languages and keeps the dates in the typo fallback
([../search-languages.md](../search-languages.md)). Same harness, same
laptop, three runs on the same afternoon. The laptop was also running an
Android emulator and two local servers, so the absolute numbers are higher
than the September tables above; compare the columns with each other.

| Case | Before p50 | Before p95 | After p50 | After p95 |
|---|---|---|---|---|
| suggest · common word | 107.7 | 139.1 | 82.4 | 115.3 |
| suggest · typo of a common word | 91.2 | 107.7 | 72.2 | 83.5 |
| suggest · `@handle` prefix | 17.5 | 20.9 | 13.2 | 16.9 |
| events · common word, with location | 32.2 | 37.4 | 23.5 | 30.9 |
| events · rare word | 5.4 | 7.2 | 5.2 | 6.2 |
| events · common word + price + date filters | 56.0 | 63.4 | 47.8 | 51.8 |
| places · common word, with location | 44.1 | 51.3 | 31.0 | 37.8 |
| places · category name ("restaurant") | 57.0 | 63.5 | 45.9 | 51.8 |
| organizers · mid-frequency word | 17.5 | 20.4 | 14.2 | 18.7 |
| broad · events, city + common word, with location | 108.5 | 133.4 | 84.9 | 94.0 |

Nothing got slower. Folding costs nothing at search time because the folded
title and name are stored columns; the date words are one small indexed
lookup per search. Plans confirmed in the same run: candidates use
`idx_event_search_tsv`, `idx_place_search_tsv` and
`idx_place_service_search_tsv`, the event trigram fallback uses
`idx_event_search_title_trgm` (the folded title), and `@handle` uses
`idx_user_info_username_prefix`.

New cases, after only:

| Case | Rows | p50 | p95 | max |
|---|---|---|---|---|
| events · dated, French ("jazz ce week-end") | 21 | 31.8 | 34.6 | 39.1 |
| events · French word through the vocabulary ("soirée jazz") | 21 | 27.9 | 30.9 | 34.4 |
| events · typo in a dated search (trigram inside the dates) | 1 | 11.9 | 13.7 | 15.5 |
| places · French word through the vocabulary ("plage") | 21 | 42.2 | 56.9 | 64.2 |

### What the measurements changed

The first version of the migration let the new words work both ways, like
every vocabulary term before them: "plage" found a beach, and "beach" also
looked for "plage". On this catalogue no listing contains a French, Spanish,
German or Portuguese word, so those lookups found nothing, and they were not
free. A common English word gained up to seventeen alternatives, each a
term in the ranking of every candidate row. Measured in one session, with
the other-language rows switched on and off:

| Case | Rows on p50 | Rows on p95 | Rows off p50 | Rows off p95 |
|---|---|---|---|---|
| places · category name ("restaurant", 17 extra words) | 70.7 | 93.6 | 47.6 | 55.6 |
| events · common word + filters ("night", 6 extra words) | 61.1 | 70.9 | 46.6 | 50.1 |
| suggest · common word ("party") | 132.5 | 143.3 | 98.7 | 114.0 |
| events · common word with no extra words ("jazz") | 24.7 | 31.2 | 23.8 | 26.4 |

So a vocabulary term now has a direction (`search_concept.two_way`). The
other-language words are one-way: the term finds its words and nothing
finds the term. Staff switch a language's terms to two-way when a market's
listings are written in it. The "After" columns above are with one-way rows.

The older search (`get_filtered_events` / `get_filtered_places` with a
search text, the fallback when unified search is off) was first changed to
fold the description, category and type of every row. Old body against new
body, same session, 50 km around the seeded city:

| Case | Old p50 | Folding every row p50 | Final p50 | Final p95 |
|---|---|---|---|---|
| events · common word | 330.7 | 3045.4 | 139.9 | 149.9 |
| events · rare word | 301.1 | 3091.8 | 80.4 | 90.9 |
| places · common word | 26.4 | 174.8 | 5.4 | 6.2 |

One fold is a few microseconds, and a scan makes a hundred thousand of
them. The final body compares the title, name and slug through the stored
folded columns and reads the description, category and type from the
search document, which is indexed. It is faster than the body it
replaced. The rule since: never fold a column for every row of a scan.

Noticed then and changed since: `get_filtered_events` with no search text,
the Explore list, built prices, ratings and attendance for every event in
the radius before it took a page. See "Explore lists" below.

## Repeating

```sh
npm run test:db:up
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-search-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-recommendations-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
```

Re-run after changing a search pool, a scoring weight or the digest builder, and update this page.

## Date-window feed (2026-09-26)

`get_events_in_window` ("Happening today / this week / this month"). Script:
`scripts/perf/discovery-window-perf.sql`, same seed, 20 runs per case after
two warm-ups, first page of 20 (plus the has-more row) unless noted. Before:
the production body. After: migration
`20260926100400_events_in_window_page_first.sql`.

| Case | Before p50 | Before p95 | After p50 | After p95 |
|---|---|---|---|---|
| today, 10 km | 77.0 | 80.7 | 3.6 | 4.2 |
| next 7 days, 10 km | 85.7 | 98.0 | 21.4 | 27.6 |
| next 30 days, 10 km | 101.9 | 120.3 | 71.5 | 76.8 |
| next 30 days, 50 km (the whole seeded city) | 377.7 | 416.9 | 61.5 | 64.9 |
| next 30 days, 50 km, page 11 | 381.1 | 388.1 | 59.2 | 60.5 |

What changed: each event's earliest start inside the window now comes from
two start-time indexes (`idx_event_starts_at_discoverable`,
`idx_event_occurrence_starts_at`) instead of a per-event subquery run for
every event in the radius, and the lowest price and date list are built only
for the rows returned. A page-by-page comparison against the old body (24
pages across four windows, with 400 multi-date events added to the seed)
found no difference in rows, values or order. The remaining cost grows with
the number of events that start inside the window across the market, not
with the radius.

## Explore lists (2026-10-02)

Migration `20261002180000_explore_lists_one_rule.sql`
([../explore-lists.md](../explore-lists.md)). Script:
`scripts/perf/discovery-explore-perf.sql`, same seed plus what the lists
read and the seed lacks: ticket tiers, 2,000 events with three dates,
event, place and organizer reviews, opening hours for four places in five
(none for any place of kind 14, so "open now" for that kind finds nothing at
any hour), and a second, small city (300 events and 100 places around Kumasi).
12 runs per case after two warm-ups, as the `anon` role, first page of 20
(plus the has-more row) unless noted. Before: the production bodies.

"Accra 10 km" has 21,000 events in range, "Accra 50 km" 92,000 and
"Accra 20 km" 20,000 places: far more than any one city has on at once.
Kumasi is the size of a city today.

| Case | Rows | Before p50 | Before p95 | After p50 | After p95 |
|---|---|---|---|---|---|
| events list · Accra 10 km | 21 | 212.8 | 234.2 | 74.5 | 82.1 |
| events list · Accra 50 km (the whole city) | 21 | 894.4 | 929.7 | 263.3 | 284.8 |
| events list · 50 km, one category | 21 | 258.2 | 280.6 | 107.7 | 119.2 |
| events list · 50 km, price 10 to 60 | 21 | 625.9 | 660.3 | 248.7 | 284.3 |
| events list · 50 km, next 7 days | 21 | 407.7 | 416.2 | 166.0 | 168.6 |
| events list · 50 km, rated 4 and up | 21 | 664.1 | 694.6 | 165.4 | 176.2 |
| events list · Kumasi 10 km | 21 | 3.0 | 3.2 | 1.9 | 2.0 |
| events list · no area (the whole catalogue) | 21 | 777.5 | 809.1 | 147.8 | 157.8 |
| events list · 10 km, a later page | 21 | 210.0 | 218.9 | 71.8 | 73.5 |
| events nearby · Accra 10 km | 21 | 56.9 | 62.2 | 56.0 | 61.2 |
| events nearby · Accra 50 km | 21 | 210.6 | 226.7 | 178.9 | 180.7 |
| events nearby · Accra 10 km, 60 rows | 61 | 66.7 | 72.5 | 55.1 | 59.6 |
| events nearby · Kumasi 10 km | 21 | 1.9 | 2.0 | 1.5 | 1.5 |
| similar events · one category, 10 km | 20 | 64.0 | 72.2 | 31.6 | 32.7 |
| events in window · today, Accra 10 km | 21 | 2.8 | 3.5 | 3.3 | 3.7 |
| events in window · next 30 days, Accra 10 km | 21 | 86.5 | 90.7 | 88.9 | 97.9 |
| places list · Accra 20 km | 21 | 78.2 | 84.9 | 34.1 | 35.5 |
| places list · 20 km, open now | 11 | 295.2 | 331.1 | 35.6 | 36.9 |
| places list · 20 km, rated 4 and up | 21 | 64.4 | 69.7 | 36.2 | 45.8 |
| places list · 20 km, one category | 21 | 6.8 | 7.2 | 5.8 | 7.2 |
| places nearby · Accra 5 km | 21 | 5.5 | 5.8 | 4.6 | 5.2 |
| places nearby · Accra 50 km | 21 | 86.4 | 102.2 | 33.9 | 38.1 |
| places list · Kumasi 20 km | 21 | 1.1 | 1.2 | 2.5 | 2.8 |

New, after only:

| Case | Events returned | p50 | p95 |
|---|---|---|---|
| Explore rows · Accra 10 km, all six | 70 | 92.6 | 98.5 |
| Explore rows · Accra 10 km, one category | 52 | 41.3 | 42.6 |
| Explore rows · Kumasi 10 km, all six | 35 | 3.2 | 3.4 |
| Explore rows · Accra 10 km, top rated only, 60 | 60 | 77.9 | 83.0 |

The Explore rows used to be two `get_nearby_events` calls and a read of
the active promotions (about 85 ms together on "Accra 10 km"), cut into
rows on the client from the first 20 or 60 events. They are now one call
that takes each row from every event in range.

### What changed, and what the measurements changed

Every list built the whole card (lowest price, ratings, attendance, the
dates as JSON, open now) for every listing in range and then kept 20. Now a
list reads only what decides the order and the asked filters for the
listings in range, picks its page, and builds the cards for that page.

What is left is one visit per event in range to learn its next date, about
3 microseconds each. `get_nearby_events` already worked that way, which is
why it barely moved; its change is the order (soonest first, section 1 of
the linked page).

Three things came out of measuring:

- **The first attempt at finding events with one date was an anti-join
  against `event_occurrence`.** The planner's estimate of how many events
  lie in an area is far too low, and it chose a nested loop over a
  materialised copy of the occurrence table: 3.5 s for 10 km and 16.5 s for
  the whole city. Asking each event for its dates through the index is the
  same speed whatever the planner estimates, and is what shipped.
- **"Open now" was a third of a second** because `place_is_open_now` ran
  for every place in range. The list now sorts the places by distance and
  asks the nearest first until the page is full. With every place closed it
  still asks them all; since 2026-10-03 each ask is an index lookup instead
  of a call (below).
- **A small list got a millisecond slower** ("places list · Kumasi", 1.1 to
  2.5 ms). The lists plan each call with the values given
  (`plan_cache_mode = force_custom_plan`), because a plan made for a city
  and reused for a village, or the other way round, reads the whole table.

Every list was compared with the function it replaces on this catalogue:
27 cases, each row's values and the order, and five pages by cursor for
the events list and for the open-now list. No difference where the meaning
did not change. Where it changed (dates and prices with one end, whole
days, several dates, the order of nearby events) the integration suite
says what the answer must be
(`packages/services/src/__integration__/explore-lists.integration.test.ts`).

### 2026-10-03: dates read first, "open now" without a call

Two changes to the same migration, measured in one run (before: the
migration as above; after: the migration as shipped). The run was late in
the evening, Accra time, when only late bars are open.

| Case | Rows | Before p50 | Before p95 | After p50 | After p95 |
|---|---|---|---|---|---|
| events list · Accra 10 km, today | 21 | 63.4 | 64.9 | 18.2 | 25.4 |
| events list · 50 km, next 7 days | 21 | 222.4 | 241.9 | 65.5 | 68.0 |
| events in window · today, Accra 10 km | 21 | 63.0 | 64.7 | 18.2 | 23.1 |
| events in window · this week, Accra 10 km | 21 | 62.6 | 63.3 | 22.3 | 23.4 |
| events in window · next 30 days, Accra 10 km | 21 | 63.8 | 64.9 | 43.8 | 45.9 |
| events in window · a week, the whole country (Abonten Weekly's fallback) | 13 | 213.3 | 227.3 | 56.2 | 61.8 |
| places list · 20 km, open now (late evening) | 11 | 46.9 | 57.3 | 34.3 | 37.5 |
| places list · 20 km, open now, none open (1,400 places asked) | 0 | 79.1 | 80.7 | 7.8 | 8.4 |

Every other case of the script was within a few per cent of the table
above.

- **Dates read first.** `get_events_in_window` now uses the shared rule, so
  an event that began before the window and is still running is in it (a
  festival on its second day is "happening today"). Alone, that made every
  window cost a visit to every event in range (about 63 ms in Accra). The
  rule now reads the two start-time indexes whenever a list has an end
  date, and the planner starts from the dates or from the area, whichever
  is smaller. "Today" is 18 ms rather than the 3 ms of the window list
  before, because "still running" has no lower bound in time: every event
  that started before tonight and is not archived is read. The test
  catalogue never archives anything; in production the nightly job
  archives or deletes ended events, so that set is what is on now.
- **"Open now" without a call.** `place_is_open_now` costs about 60
  microseconds a place, almost all of it the call. The list checks the
  opening hours itself in one index lookup a place, about 5 microseconds:
  the 20,000 places of "Accra 20 km", all closed, took 1.2 s before. The
  integration suite checks the list and the function agree for every kind
  of opening hours.
