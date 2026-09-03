-- Perf advisor 0005_unused_index: most of the 45 flagged indexes are simply
-- not exercised yet on a young DB (geo, trigram, FK, status lookups) —
-- dropping those would hurt once real traffic lands, so they stay. Revisit
-- with pg_stat_user_indexes.idx_scan after a few weeks of production.
--
-- These two, however, are strict left-prefixes of another index on the same
-- table — genuinely redundant regardless of traffic:
--   idx_event_occurrence_event_id (event_id)      ⊂ idx_event_occurrence_event_starts (event_id, starts_at)
--   event_reminder_user_id_idx    (user_id)       ⊂ event_reminder_pkey                (user_id, event_id)
-- (event_reminder_event_id_idx stays — the PK's leading col is user_id, so an
--  event_id-only lookup, e.g. the delete-cascade, still needs its own index.)

drop index if exists public.idx_event_occurrence_event_id;
drop index if exists public.event_reminder_user_id_idx;
