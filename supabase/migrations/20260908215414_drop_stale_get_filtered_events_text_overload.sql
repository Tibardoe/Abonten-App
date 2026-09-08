-- Drop the pre-multi-type get_filtered_events(... p_event_type text ...).
--
-- 20260826095846_multi_type_event_filter.sql correctly DROPped the singular
-- `text` signature and created the `text[]` one. But
-- 20260902120000_add_public_attendance_count_rpcs.sql, a week later, does a
-- CREATE OR REPLACE using the OLD `text` signature -- and because the
-- argument types differ that creates a SECOND overload instead of replacing
-- anything, resurrecting the dropped function.
--
-- Production currently has only the `text[]` form (the stale one was cleared
-- out at some point outside the migration history), but a from-scratch
-- replay of this repo ends up with BOTH. Two overloads differing only in
-- text vs text[] is an ambiguous-call hazard for PostgREST, and it means the
-- repo does not reproduce production.
--
-- Forward-only: a no-op against production, and it removes the stale overload
-- in any replay. The `text[]` version -- the one the app actually calls -- is
-- untouched, and is left as the sole definition.

drop function if exists public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text,
  numeric, timestamp with time zone, double precision, uuid, integer
);
