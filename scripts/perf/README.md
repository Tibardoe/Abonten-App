# Discovery performance harness

Synthetic-data timings for unified search, the Explore lists, the
date-window feed and the recommendation engine.
**Local test stack only.** Every script runs inside one transaction that ends
in `ROLLBACK`, and the seed refuses to run on a database with more than 5,000
events or accounts.

Results and their interpretation live in
`docs/architecture/perf/discovery-2026-09.md`.

## Run

Start the local stack first (`npm run test:db:up`), then from the repo root:

```sh
# Search: 30 query shapes x 40 runs, p50/p95/max, plus index plans (a few minutes)
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-search-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1

# Explore lists: "All events", nearby, the Explore rows, similar events,
# the place lists. 27 cases x 12 runs (~2 min after the seed)
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-explore-perf.sql   | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1

# Date-window feed ("Happening today / this week / this month"), 5 cases (~1 min)
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-window-perf.sql   | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1

# Recommendations: 60,000 subscriptions, 50 new events, generate + digest (~1 min)
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-recommendations-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
```

## What the seed builds

| Data | Volume |
|---|---|
| Accounts | 50,000 (2,000 organizers) |
| Events | 100,000, published, starting from 10 days ago to 110 days ahead |
| Places | 20,000 |
| Attendance rows | ~60,000 |

Titles and names mix three vocabulary bands so a result can be read per band:
50 common real words (each in ~6% of events, the worst case), 500 mid-frequency
pseudo-words (~0.2%) and 20,000 rare pseudo-words (~5 events each).

The Explore script adds what the lists read and the seed lacks: ticket
tiers, 2,000 events with three dates each, event, place and organizer
reviews, opening hours for four places in five, 40 featured events, and a
second, small city (300 events and 100 places around Kumasi) so an area
with few listings is timed beside the crowded one.

## Caveats

- The seed needs about 2 GB of free disk for the length of the run (it is
  rolled back, but the rows are written first). On a full disk Postgres
  stops and Docker Desktop has to be restarted.

- Timings come from a laptop Docker container, not the production database.
  Use them to compare changes and to catch plans that scan whole tables, not
  as production latency. Production latency is `search_query_log.latency_ms`
  (Admin › Discovery).
- Everything runs in one transaction, so tables created or filled in it have
  no autovacuum statistics until the script runs `ANALYZE`. The seed analyzes
  after loading.

## Promotion delivery simulation

`promotion-delivery-simulation.sql` runs a simulated week of Spotlight
promotion delivery (8,000 devices, about 3,000 a day, three promotions side by
side) through the real candidate, ingest, accrual, tick and reconciliation
functions, prints per-day and final figures, and rolls back. It needs three
live Spotlight posts on the local stack (any integration run leaves them) and
takes about three minutes.

```sh
cat scripts/perf/promotion-delivery-simulation.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1
```

Results: `docs/architecture/perf/promotion-delivery-2026-09.md`.
