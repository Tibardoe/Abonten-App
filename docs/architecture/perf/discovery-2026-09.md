---
title: Discovery performance measurements (September 2026)
purpose: Record what the search and recommendation functions cost on a large synthetic catalogue, what the measurements changed, and how to repeat them.
audience: Engineering
scope: search_suggest, search_events, search_places, search_organizers, recommendations_generate, recommendations_build_digest, admin_recommendation_metrics. Local Docker Postgres only; not production latency.
status: Approved
version: 1.0
lastReviewed: 2026-09-13
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

## Repeating

```sh
npm run test:db:up
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-search-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-recommendations-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
```

Re-run after changing a search pool, a scoring weight or the digest builder, and update this page.
