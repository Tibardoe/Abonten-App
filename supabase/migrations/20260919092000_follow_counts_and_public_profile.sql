-- Follower counts as a maintained number, and a public profile in one call.
--
-- WHY. A profile showed no follower count at all on your own profile (the
-- count lived inside the Follow button, which is hidden there) and only
-- after a second request (follow status) on anyone else's; that request
-- counted `follow` rows every time. The profile itself took three
-- round-trips in sequence (the profile view, then the rating, then the
-- verification flags).
--
-- Adds:
--   * follow_count — one row per followed organizer or place, kept exact by
--     a trigger on `follow` in the same transaction as the follow itself
--     (insert +1, delete -1; the row-level upsert serialises concurrent
--     follows of the same target). Backfilled from `follow`. Public read
--     (the number is public; who follows whom stays private).
--   * follow_counts(kind, ids) reads it (same signature and grants).
--   * get_public_profile(username) — the profile view's columns, the
--     rating, organizer verification, the follower count and whether the
--     caller follows them, as one JSON object. SECURITY INVOKER: every read
--     goes through the same RLS the separate queries did, so it shows
--     exactly what they showed.

create table if not exists public.follow_count (
  target_kind    text        not null check (target_kind in ('organizer', 'place')),
  target_id      uuid        not null,
  follower_count integer     not null default 0 check (follower_count >= 0),
  updated_at     timestamptz not null default now(),
  primary key (target_kind, target_id)
);

comment on table public.follow_count is
  'Followers per organizer / place, maintained by trg_follow_count on public.follow. Public read; written only by that trigger.';

alter table public.follow_count enable row level security;
revoke all on table public.follow_count from anon, authenticated;
grant select on table public.follow_count to anon, authenticated;
grant all on table public.follow_count to service_role;

drop policy if exists follow_count_public_read on public.follow_count;
create policy follow_count_public_read
  on public.follow_count
  for select
  to anon, authenticated
  using (true);

create or replace function public._follow_count_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.follow_count as fc (target_kind, target_id, follower_count)
    values (new.target_kind, new.target_id, 1)
    on conflict (target_kind, target_id)
    do update set follower_count = fc.follower_count + 1, updated_at = now();
  elsif tg_op = 'DELETE' then
    update public.follow_count
       set follower_count = greatest(0, follower_count - 1), updated_at = now()
     where target_kind = old.target_kind
       and target_id = old.target_id;
  end if;
  return null;
end;
$$;

revoke execute on function public._follow_count_touch() from public, anon, authenticated;

drop trigger if exists trg_follow_count on public.follow;
create trigger trg_follow_count
  after insert or delete on public.follow
  for each row execute function public._follow_count_touch();

-- Backfill (idempotent: recomputes from the source of truth).
insert into public.follow_count (target_kind, target_id, follower_count)
select f.target_kind, f.target_id, count(*)::integer
from public.follow f
group by f.target_kind, f.target_id
on conflict (target_kind, target_id)
do update set follower_count = excluded.follower_count, updated_at = now();

create or replace function public.follow_counts(p_kind text, p_ids uuid[])
returns table (target_id uuid, follower_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.target_id, c.follower_count::bigint
  from public.follow_count c
  where c.target_kind = p_kind and c.target_id = any (p_ids)
$$;

-- Whether the CALLER follows a target. Definer, because signed-out callers
-- have no grant on `follow` at all; it can only ever answer about auth.uid()
-- (null when signed out -> false), never about anyone else.
create or replace function public.viewer_follows(p_kind text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select true
    from public.follow f
    where f.follower_id = (select auth.uid())
      and f.target_kind = p_kind
      and f.target_id = p_target_id
    limit 1
  ), false)
$$;

revoke execute on function public.viewer_follows(text, uuid) from public;
grant execute on function public.viewer_follows(text, uuid) to anon, authenticated, service_role;

create or replace function public.get_public_profile(p_username text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', d.user_id,
    'username', d.username,
    'full_name', d.full_name,
    'bio', d.bio,
    'avatar_public_id', d.avatar_public_id,
    'avatar_version', d.avatar_version,
    'total_posts', d.total_posts,
    'total_favorites', d.total_favorites,
    'average_rating', coalesce(r.average_rating, 0),
    'total_ratings', coalesce(r.total_ratings, 0),
    'organizer_verified', coalesce(u.organizer_verified, false),
    'status_id', u.status_id,
    'follower_count', coalesce(fc.follower_count, 0),
    'viewer_follows', public.viewer_follows('organizer', d.user_id)
  )
  from public.user_profile_details d
  left join public.user_info u on u.id = d.user_id
  left join public.follow_count fc
    on fc.target_kind = 'organizer' and fc.target_id = d.user_id
  left join lateral public.get_user_rating(d.user_id) r on true
  where d.username = p_username::extensions.citext
  limit 1
$$;

comment on function public.get_public_profile(text) is
  'A public profile by username in one call: profile view, rating, verification, follower count, and whether the caller follows. SECURITY INVOKER — same RLS as the separate reads it replaces.';

revoke execute on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated, service_role;
