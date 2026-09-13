# Discovery performance harness

Synthetic-data timings for unified search and the recommendation engine.
**Local test stack only.** Every script runs inside one transaction that ends
in `ROLLBACK`, and the seed refuses to run on a database with more than 5,000
events or accounts.

Results and their interpretation live in
`docs/architecture/perf/discovery-2026-09.md`.

## Run

Start the local stack first (`npm run test:db:up`), then from the repo root:

```sh
# Search: 19 query shapes x 40 runs, p50/p95/max, plus index plans (~1 min)
cat scripts/perf/discovery-perf-seed.sql scripts/perf/discovery-search-perf.sql \
  | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1

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

## Caveats

- Timings come from a laptop Docker container, not the production database.
  Use them to compare changes and to catch plans that scan whole tables, not
  as production latency. Production latency is `search_query_log.latency_ms`
  (Admin › Discovery).
- Everything runs in one transaction, so tables created or filled in it have
  no autovacuum statistics until the script runs `ANALYZE`. The seed analyzes
  after loading.
