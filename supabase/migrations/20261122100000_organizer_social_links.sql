-- Organizer social links (2026-11-22, docs/architecture/social-distribution.md
-- §4, founder's decision of 22 Nov 2026).
--
-- Abonten's own social accounts are small, so its posts borrow the lister's
-- audience: Admin › Social credits the lister ("via @handle" on X, a mention
-- or Collab invite on Instagram). Places already carry `place.social_links`;
-- organizers get the same flat map network → profile address on their
-- account row.
--
-- - `user_info.social_links jsonb`, null when none. Only the four networks
--   Admin › Social credits (instagram, x, tiktok, facebook), each the
--   canonical https address @abonten/core/social/listerSocialLinks builds
--   from what the person typed. That module is the rule; the check below is
--   the database's backstop for a row written past the service (the Data
--   API: older app builds write the profile directly), so no other scheme
--   (javascript:, data:, …) or host can ever be stored. Change the two
--   together.
-- - Written by the account's owner: the existing `user_info_update` policy
--   (owner only) and `protect_user_info_privileged_columns` (it guards a
--   fixed list of staff/server columns; this one is not on it) already let
--   the owner write it and nobody else. A team's row has no signed-in owner
--   (its auth user never signs in), so a team's links stay empty until team
--   profile editing exists.
-- - Readable like the rest of the public profile (`user_info_public_select`).
-- - A deleted account (status 4, a soft delete) loses its links, like its
--   bio and website (trigger `user_info_forget_social_links`).

begin;

alter table public.user_info
  add column if not exists social_links jsonb;

comment on column public.user_info.social_links is
  'The account''s own social profiles, network → canonical https address (instagram, x, tiktok, facebook). Written by the owner through @abonten/services/profile/updateProfileCore; shapes checked by social_links_valid(). Read by Admin › Social to credit the organizer.';

-- The canonical shapes @abonten/core/social/listerSocialLinks stores.
create or replace function public.social_links_valid(p_links jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_links is null
      or (
        jsonb_typeof(p_links) = 'object'
        and not exists (
          select 1
          from jsonb_each(p_links) as e(network, link)
          where jsonb_typeof(e.link) <> 'string'
             or length(e.link #>> '{}') > 200
             or not coalesce(
                  (e.link #>> '{}') ~ case e.network
                    when 'instagram' then '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}$'
                    when 'x'         then '^https://x\.com/[A-Za-z0-9_]{1,15}$'
                    when 'tiktok'    then '^https://www\.tiktok\.com/@[A-Za-z0-9._]{2,24}$'
                    when 'facebook'  then '^https://www\.facebook\.com/([A-Za-z0-9.]{5,50}|profile\.php\?id=[0-9]{5,20})$'
                  end,
                  false)
        )
      );
$$;

comment on function public.social_links_valid(jsonb) is
  'True when a social_links map holds only instagram/x/tiktok/facebook profile addresses in the canonical form of @abonten/core/social/listerSocialLinks (or is null).';

-- The check runs with the writer's rights: an owner saving their profile
-- must be able to call it. It reads nothing but its argument.
grant execute on function public.social_links_valid(jsonb)
  to anon, authenticated, service_role;

alter table public.user_info
  drop constraint if exists user_info_social_links_object;
alter table public.user_info
  add constraint user_info_social_links_object
  check (social_links is null or jsonb_typeof(social_links) = 'object');

alter table public.user_info
  drop constraint if exists user_info_social_links_valid;
alter table public.user_info
  add constraint user_info_social_links_valid
  check (public.social_links_valid(social_links));

-- A deleted account keeps no social profiles.
create or replace function public.user_info_forget_social_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.social_links := null;
  return new;
end;
$$;

revoke all on function public.user_info_forget_social_links()
  from public, anon, authenticated;

drop trigger if exists user_info_forget_social_links on public.user_info;
create trigger user_info_forget_social_links
  before update on public.user_info
  for each row
  when (new.status_id = 4 and new.social_links is not null)
  execute function public.user_info_forget_social_links();

-- Checks: the owner may write the column, the guard is in place, and the
-- trigger exists.
do $$
begin
  if not has_column_privilege('authenticated', 'public.user_info', 'social_links', 'UPDATE') then
    raise exception 'migration check: owners must be able to update user_info.social_links';
  end if;
  if public.social_links_valid('{"instagram": "javascript:alert(1)"}'::jsonb)
     or public.social_links_valid('{"snapchat": "https://www.snapchat.com/add/abonten"}'::jsonb)
     or public.social_links_valid('["https://x.com/abonten"]'::jsonb)
     or not public.social_links_valid('{"x": "https://x.com/abonten", "tiktok": "https://www.tiktok.com/@abonten.hub"}'::jsonb)
     or not public.social_links_valid('{"facebook": "https://www.facebook.com/profile.php?id=100089123456789"}'::jsonb)
     or not public.social_links_valid(null) then
    raise exception 'migration check: social_links_valid does not hold its shapes';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_info_forget_social_links'
      and tgrelid = 'public.user_info'::regclass
  ) then
    raise exception 'migration check: the social links clean-up trigger is missing';
  end if;
end;
$$;

commit;
