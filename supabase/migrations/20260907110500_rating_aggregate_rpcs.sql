-- Database-side rating aggregation, replacing "fetch every review row and
-- average it in JavaScript" at eight call sites across web, mobile and admin.
--
-- WHY RPCs RATHER THAN POSTGREST AGGREGATES. PostgREST aggregate functions
-- are disabled on this project (a live request returns PGRST123), which is
-- what forced the JS aggregation in the first place. Turning
-- `db-aggregates-enabled` on would fix these eight sites but would also let
-- any anon caller run arbitrary aggregates over every table they can read --
-- a materially wider surface on a public consumer app. These purpose-specific
-- functions give the same benefit with none of that.
--
-- SECURITY. All four are SECURITY INVOKER (the default -- no SECURITY
-- DEFINER), so row-level security still applies to the caller exactly as it
-- did when the app selected the rows directly. On top of that each function
-- states the public-visibility predicate explicitly:
--
--     status = 'approved'
--     and moderation_state is distinct from 'hidden'
--     and moderation_state is distinct from 'removed'
--
-- which is the same rule the SELECT policies on these tables already use for
-- their public branch. Stating it explicitly makes the number deterministic
-- for every caller, including the admin console's service-role client (which
-- bypasses RLS entirely). That closes two real defects in the code being
-- replaced:
--
--   1. No call site filtered `moderation_state`, so a review an admin had
--      hidden or removed still counted toward the public average. For anon
--      callers RLS masked this; for the admin console's service-role client
--      it did not, so admin saw a different rating than the public did.
--   2. The admin aggregates capped the fetch at `.limit(5000)` rows, which
--      silently produces a WRONG average for any entity past 5000 reviews
--      rather than failing.
--
-- The averages are returned UNROUNDED. Every caller keeps the rounding it
-- already applied (1 dp on the public surfaces, 2 dp in admin); rounding here
-- as well would double-round and could shift a displayed value.

-- ---------------------------------------------------------------------------
-- Covering indexes: make each aggregate an index-only scan over exactly the
-- publicly-visible rows.
-- ---------------------------------------------------------------------------

create index if not exists idx_event_review_visible_rating
  on public.event_review (event_id) include (rating)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index if not exists idx_place_review_visible_rating
  on public.place_review (place_id) include (rating)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

-- `review` is range-partitioned (20 partitions); a partial index created on
-- the parent is propagated to each partition, so the aggregate does not have
-- to scan partitions in full.
create index if not exists idx_review_visible_rating
  on public.review (reviewed_id) include (rating)
  where status = 'approved'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

-- ---------------------------------------------------------------------------
-- Aggregate functions
-- ---------------------------------------------------------------------------

create or replace function public.get_event_rating(p_event_id uuid)
returns table(average_rating numeric, total_ratings integer)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(avg(r.rating), 0)::numeric as average_rating,
    count(*)::integer                   as total_ratings
  from public.event_review r
  where r.event_id = p_event_id
    and r.status = 'approved'
    and r.moderation_state is distinct from 'hidden'
    and r.moderation_state is distinct from 'removed';
$$;

create or replace function public.get_place_rating(p_place_id uuid)
returns table(average_rating numeric, total_ratings integer)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(avg(r.rating), 0)::numeric as average_rating,
    count(*)::integer                   as total_ratings
  from public.place_review r
  where r.place_id = p_place_id
    and r.status = 'approved'
    and r.moderation_state is distinct from 'hidden'
    and r.moderation_state is distinct from 'removed';
$$;

-- Ratings left on a person (an organizer), from the generic `review` table --
-- distinct from get_event_rating, which is about one event.
create or replace function public.get_user_rating(p_reviewed_id uuid)
returns table(average_rating numeric, total_ratings integer)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(avg(r.rating), 0)::numeric as average_rating,
    count(*)::integer                   as total_ratings
  from public.review r
  where r.reviewed_id = p_reviewed_id
    and r.status = 'approved'
    and r.moderation_state is distinct from 'hidden'
    and r.moderation_state is distinct from 'removed';
$$;

-- Batch variant for list surfaces (the favourites page renders many places at
-- once). One round trip, one grouped aggregate -- never one query per card.
create or replace function public.get_place_ratings(p_place_ids uuid[])
returns table(place_id uuid, average_rating numeric, total_ratings integer)
language sql
stable
set search_path to 'public'
as $$
  select
    r.place_id,
    avg(r.rating)::numeric as average_rating,
    count(*)::integer      as total_ratings
  from public.place_review r
  where r.place_id = any(p_place_ids)
    and r.status = 'approved'
    and r.moderation_state is distinct from 'hidden'
    and r.moderation_state is distinct from 'removed'
  group by r.place_id;
$$;

grant execute on function public.get_event_rating(uuid)   to anon, authenticated, service_role;
grant execute on function public.get_place_rating(uuid)   to anon, authenticated, service_role;
grant execute on function public.get_user_rating(uuid)    to anon, authenticated, service_role;
grant execute on function public.get_place_ratings(uuid[]) to anon, authenticated, service_role;
