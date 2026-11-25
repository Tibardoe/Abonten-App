-- Team accounts: an Owner edits the team's public profile, and a team is
-- deleted when every Owner agrees; usernames that change keep their old
-- links for 30 days (2026-11-25, asked for by the founder after he could
-- neither change a team's username nor delete a team;
-- docs/architecture/team-accounts.md §4n–§4p).
--
--   1. Usernames that change (people and teams). The old handle goes into
--      username_history (service role only). For 30 days it is held for
--      the account that gave it up (nobody else may take it: trigger
--      user_info_username_hold, the availability check username_states)
--      and /user/<old>/… redirects to the account's new handle
--      (username_redirect). After 30 days it is free again. A handle given
--      to another account in the same transaction ("make this a team"
--      hands the person's handle to the new team) is not held against it,
--      and a deleted account keeps nothing.
--   2. team_update_profile: an Owner (team.profile) changes the team's
--      username, photo, bio, website and social links. The name keeps its
--      own path (team_rename: a Verified team's new name goes back to
--      review).
--   3. Deleting a team. An Owner asks (team_delete_request), every other
--      active Owner approves (team_delete_approve), any Owner may stop it
--      (team_delete_cancel); it ends by itself after 7 days, when the
--      Owners change, or when something now stops the deletion. When all
--      have approved, team_delete_finish runs the same pipeline as a
--      person's account deletion (credit closed, anonymize_deleted_account),
--      withdraws invitations, removes every member and closes the team
--      (status 'closed', reason 'closed_by_owner'). Staff may delete a team
--      without the Owners (admin_team_delete, abuse or legal cases; reason
--      'staff'). What stops it: team_deletion_blockers.
--   4. anonymize_deleted_account (people and teams) now also removes the
--      follows of the account, ends the alerts people set on it and closes
--      its conversations, so nobody follows, watches or writes to an
--      account that is gone.
--
-- Teams ship switched off (team_program_setting, TEAMS_KILL_SWITCH);
-- nothing here is reachable for a team until one exists. Every new table
-- and team function is service-role only.

begin;

-- ---------------------------------------------------------------------------
-- 0. What this migration was written against
-- ---------------------------------------------------------------------------
-- anonymize_deleted_account is replaced (fingerprint below); the others are
-- called and must still be the definitions read when this was written.

do $$
declare
  v_expected constant jsonb := jsonb_build_object(
    'anonymize_deleted_account', 'c540966424aa5f03f9d067b00d92027c',
    'account_deletion_blockers', '9bca40758a01e6902bcf419e103a4ac1',
    'credit_close_account',      '7902daa5b0a159abf8a0df08e9e5d2db',
    '_team_require',             '478a4a35067b6aad32d82ca8ecb49146',
    '_team_log',                 'a141db1bc5a2d8520acbbc51d228ef79'
  );
  v_name text;
begin
  for v_name in select jsonb_object_keys(v_expected) loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
        and md5(replace(p.prosrc, E'\r', '')) = v_expected ->> v_name
    ) then
      raise exception 'team profile and delete: public.% is not the definition this migration expects', v_name;
    end if;
  end loop;
  if exists (select 1 from pg_class where oid = to_regclass('public.username_history')) then
    raise exception 'migration 20261125100000: username_history already exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Usernames that change
-- ---------------------------------------------------------------------------

create table public.username_history (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.user_info (id) on delete cascade,
  old_username  extensions.citext not null,
  new_username  extensions.citext,
  changed_at    timestamptz not null default now(),
  -- The transaction that made the change: a handle passed on to another
  -- account in that same transaction is not held against that account.
  changed_xact  bigint not null default txid_current()
);

create index username_history_old on public.username_history (old_username, changed_at desc);
create index username_history_user on public.username_history (user_id, changed_at desc);

comment on table public.username_history is
  'Handles accounts gave up. For 30 days a handle is held for its old account and /user/<old> redirects to it (username_redirect); written only by the trigger user_info_username_history. Service role only.';

alter table public.username_history enable row level security;
revoke all on table public.username_history from anon, authenticated;
grant all on table public.username_history to service_role;

-- Whether a handle is held for another account: it gave the handle up in
-- the last 30 days and is not deleted. The account itself may take it back.
-- (Handles compare without case. With an empty search_path a plain "=" on
-- two citext values falls back to text and compares WITH case, so every
-- comparison here names the citext operator: OPERATOR(extensions.=), which
-- also lets the unique index on user_info.username answer.)
create or replace function public._username_held(p_username extensions.citext, p_for uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.username_history h
    join public.user_info o on o.id = h.user_id
    where h.old_username operator(extensions.=) p_username
      and h.changed_at > now() - interval '30 days'
      and h.user_id is distinct from p_for
      and h.changed_xact is distinct from txid_current_if_assigned()
      and o.status_id <> 4
  );
$$;

create or replace function public.user_info_record_username_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.username_history (user_id, old_username, new_username)
  values (new.id, old.username, new.username);
  return null;
end;
$$;

-- A case-only change is no change (the column compares without case); a
-- deletion's placeholder handle is not a change anyone asked for.
create trigger user_info_username_history
  after update of username on public.user_info
  for each row
  when (old.username is not null
        and lower(old.username::text) is distinct from lower(new.username::text)
        and old.status_id <> 4
        and new.status_id <> 4)
  execute function public.user_info_record_username_change();

-- Nobody takes a handle held for someone else. The error is a unique
-- violation, so every path that saves a username already answers "taken".
-- (Sign-up's generated handles are not checked: they are made from the
-- person's own name and refusing them would stop the sign-up.)
create or replace function public.user_info_username_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is not null
     and lower(new.username::text) is distinct from lower(old.username::text)
     and new.status_id <> 4
     and public._username_held(new.username, new.id) then
    raise exception 'username:held' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger user_info_username_hold
  before update of username on public.user_info
  for each row
  execute function public.user_info_username_hold();

-- What the availability check answers for each handle: 'yours' (the
-- account has it), 'taken' (another account has it), 'held' (given up by
-- another account in the last 30 days) or 'available'. Service role only:
-- the services rate-limit it and only ask for well-formed handles.
create or replace function public.username_states(p_usernames text[], p_for uuid)
returns table (username text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.u,
    case
      when exists (
        select 1 from public.user_info x
        where x.username operator(extensions.=) c.u::extensions.citext and x.id = p_for
      ) then 'yours'
      when exists (
        select 1 from public.user_info x
        where x.username operator(extensions.=) c.u::extensions.citext
      ) then 'taken'
      when public._username_held(c.u::extensions.citext, p_for) then 'held'
      else 'available'
    end
  from unnest(p_usernames) with ordinality as c(u, n)
  order by c.n;
$$;

-- The handle an old one moved to, for 30 days: only when nobody has the
-- old handle now and the account that gave it up is active. The website's
-- profile pages redirect with it (308), the app follows it. It reveals only
-- what the redirect itself shows, so anyone may ask.
create or replace function public.username_redirect(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.username::text
  from public.username_history h
  join public.user_info u on u.id = h.user_id
  where p_username ~ '^[A-Za-z0-9_]{3,30}$'
    and h.old_username operator(extensions.=) p_username::extensions.citext
    and h.changed_at > now() - interval '30 days'
    and u.status_id = 1
    and lower(u.username::text) is distinct from lower(h.old_username::text)
    and not exists (
      select 1 from public.user_info x
      where x.username operator(extensions.=) p_username::extensions.citext
    )
  order by h.changed_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. A deleted account: nobody follows, watches or writes to it
-- ---------------------------------------------------------------------------
-- The 20260930100000 definition with one block added (follows, alerts and
-- conversations of the account); everything else is unchanged.

CREATE OR REPLACE FUNCTION public.anonymize_deleted_account(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_suffix          text := replace(left(p_user_id::text, 13), '-', '');
  r                 record;
  v_events_cancelled integer := 0;
  v_events_archived  integer := 0;
  v_drafts_deleted   integer := 0;
  v_places_unclaimed integer := 0;
  v_claims_deleted   integer := 0;
  v_cases_closed     integer := 0;
  v_follows_removed  integer := 0;
  v_alerts_ended     integer := 0;
  v_conversations_closed integer := 0;
begin
  if not exists (select 1 from public.user_info where id = p_user_id) then
    raise exception 'anonymize_deleted_account: unknown user %', p_user_id;
  end if;

  for r in
    select id, status from public.verification_case
    where requester_id = p_user_id
      and status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_cases_closed := v_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'account_deleted'
  from public.place_claim_document d
  join public.place_claim_request cr on cr.id = d.claim_request_id
  where cr.claimant_id = p_user_id and cr.status = 'pending'
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_request
  where claimant_id = p_user_id and status = 'pending';
  get diagnostics v_claims_deleted = row_count;

  delete from public.event
  where organizer_id = p_user_id and status = 'draft';
  get diagnostics v_drafts_deleted = row_count;

  update public.event e
     set status = 'canceled'
   where e.organizer_id = p_user_id
     and e.status = 'published'
     and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
     and not exists (
       select 1
       from public.ticket t
       join public.ticket_type tt on tt.id = t.ticket_type_id
       where tt.event_id = e.id and t.status in ('active', 'used'));
  get diagnostics v_events_cancelled = row_count;

  update public.event e
     set archived_at = coalesce(e.archived_at, now())
   where e.organizer_id = p_user_id
     and e.archived_at is null;
  get diagnostics v_events_archived = row_count;

  update public.place
     set claimed = false,
         verified = false,
         verified_at = null,
         verification_case_id = null,
         updated_at = now()
   where owner_id = p_user_id
     and (claimed or verified or verification_case_id is not null);
  get diagnostics v_places_unclaimed = row_count;

  -- Nobody follows or watches an account that is gone (the follower counts
  -- follow, trigger trg_follow_count), and its conversations close, so a
  -- message is never sent where nobody will read it.
  delete from public.follow
  where target_kind = 'organizer' and target_id = p_user_id;
  get diagnostics v_follows_removed = row_count;

  update public.notification_subscription
     set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
   where kind = 'organizer' and target_id = p_user_id and status <> 'unsubscribed';
  get diagnostics v_alerts_ended = row_count;

  update public.conversation c
     set status = 'closed'
   where c.status = 'open'
     and exists (
       select 1 from public.conversation_participant cp
       where cp.conversation_id = c.id and cp.user_id = p_user_id);
  get diagnostics v_conversations_closed = row_count;

  delete from public.device_token where user_id = p_user_id;
  delete from public.web_push_subscription where user_id = p_user_id;
  delete from public.favorite where user_id = p_user_id;
  delete from public.favorite_place where user_id = p_user_id;
  delete from public.event_reminder where user_id = p_user_id;
  delete from public.notification where user_id = p_user_id;
  delete from public.notification_preference where user_id = p_user_id;
  delete from public.notification_subscription where user_id = p_user_id;
  delete from public.area_waitlist where user_id = p_user_id;
  delete from public.user_image_history where user_id = p_user_id;
  delete from public.receiving_account where user_id = p_user_id;
  delete from public.highlight where user_id = p_user_id;
  delete from public.drafts where user_id = p_user_id;

  update public.payment_method
     set status = 'removed',
         is_default = false,
         details = jsonb_strip_nulls(jsonb_build_object(
           'scrubbed', true,
           'brand',   details ->> 'brand',
           'last4',   details ->> 'last4',
           'network', details ->> 'network',
           'bank',    details ->> 'bank')),
         updated_at = now()
   where user_id = p_user_id;

  update public.payout_account
     set status = 'removed',
         is_default = false,
         account_holder_name = 'Deleted user',
         account_number = 'removed',
         updated_at = now()
   where organizer_id = p_user_id;

  update public.user_info
     set full_name = 'Deleted user',
         username = ('deleted_' || v_suffix)::extensions.citext,
         username_is_generated = true,
         avatar_public_id = null,
         avatar_version = null,
         bio = null,
         website = null,
         organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null,
         status_id = 4,
         updated_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'events_cancelled', v_events_cancelled,
    'events_archived',  v_events_archived,
    'drafts_deleted',   v_drafts_deleted,
    'places_unclaimed', v_places_unclaimed,
    'claims_deleted',   v_claims_deleted,
    'cases_closed',     v_cases_closed,
    'follows_removed',  v_follows_removed,
    'alerts_ended',     v_alerts_ended,
    'conversations_closed', v_conversations_closed
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The team's profile
-- ---------------------------------------------------------------------------
-- p_patch holds only the fields to change: username (text), bio, website
-- (text or null to clear), social_links (the canonical map from
-- @abonten/core/social/listerSocialLinks, or null), and a photo
-- (avatar_public_id + avatar_version + transformation) uploaded to the
-- team's own folder user_profiles/<team>/. The service checks the shapes
-- first; the constraints and triggers on user_info stay the last word.
create or replace function public.team_update_profile(p_team uuid, p_by uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.user_info;
  v_fields text[] := '{}';
  v_username text;
  v_bio text;
  v_website text;
  v_links jsonb;
  v_public_id text;
  v_version text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform public._team_fail('nothing_to_change');
  end if;
  perform public._team_require(p_team, p_by, 'team.profile');
  select * into v_old from public.user_info
  where id = p_team and account_kind = 'team'
  for update;
  if not found then
    perform public._team_fail('not_found');
  end if;

  if p_patch ? 'username' then
    v_username := btrim(coalesce(p_patch ->> 'username', ''));
    if v_username !~ '^[A-Za-z0-9_]{3,30}$' then
      perform public._team_fail('username_invalid');
    end if;
    if v_username ilike 'deleted\_%' then
      perform public._team_fail('username_taken');
    end if;
    if v_username is distinct from v_old.username::text then
      begin
        update public.user_info
           set username = v_username::extensions.citext,
               username_is_generated = false,
               updated_at = now()
         where id = p_team;
      exception when unique_violation then
        -- Another account has it, or it is held for the account that gave
        -- it up in the last 30 days (user_info_username_hold).
        perform public._team_fail('username_taken');
      end;
      perform public._team_log(p_team, p_by, 'team.username_changed', 'team', p_team::text,
        jsonb_build_object('from', v_old.username::text, 'to', v_username));
    end if;
  end if;

  if p_patch ? 'bio' then
    v_bio := nullif(btrim(coalesce(p_patch ->> 'bio', '')), '');
    if char_length(coalesce(v_bio, '')) > 160 then
      perform public._team_fail('bad_input');
    end if;
    if v_bio is distinct from v_old.bio then
      update public.user_info set bio = v_bio, updated_at = now() where id = p_team;
      v_fields := array_append(v_fields, 'bio');
    end if;
  end if;

  if p_patch ? 'website' then
    v_website := nullif(btrim(coalesce(p_patch ->> 'website', '')), '');
    if char_length(coalesce(v_website, '')) > 300 then
      perform public._team_fail('bad_input');
    end if;
    if v_website is distinct from v_old.website then
      update public.user_info set website = v_website, updated_at = now() where id = p_team;
      v_fields := array_append(v_fields, 'website');
    end if;
  end if;

  if p_patch ? 'social_links' then
    v_links := case
      when jsonb_typeof(p_patch -> 'social_links') = 'object'
           and p_patch -> 'social_links' <> '{}'::jsonb
        then p_patch -> 'social_links'
      else null
    end;
    if v_links is distinct from v_old.social_links then
      begin
        update public.user_info set social_links = v_links, updated_at = now() where id = p_team;
      exception when check_violation then
        perform public._team_fail('bad_input');
      end;
      v_fields := array_append(v_fields, 'social_links');
    end if;
  end if;

  if p_patch ? 'avatar_public_id' then
    v_public_id := btrim(coalesce(p_patch ->> 'avatar_public_id', ''));
    v_version := btrim(coalesce(p_patch ->> 'avatar_version', ''));
    -- Only a photo uploaded to the team's own folder (the signature for it
    -- is issued after the same capability check).
    if v_public_id not like 'user_profiles/' || p_team::text || '/%'
       or v_version !~ '^[0-9]{1,20}$' then
      perform public._team_fail('bad_photo');
    end if;
    if v_public_id is distinct from v_old.avatar_public_id
       or v_version is distinct from v_old.avatar_version then
      insert into public.user_image_history (user_id, public_id, version, transformation)
      values (p_team, v_public_id, v_version, nullif(p_patch ->> 'transformation', ''))
      on conflict (user_id, version) do nothing;
      update public.user_info
         set avatar_public_id = v_public_id, avatar_version = v_version, updated_at = now()
       where id = p_team;
      v_fields := array_append(v_fields, 'photo');
    end if;
  end if;

  if cardinality(v_fields) > 0 then
    perform public._team_log(p_team, p_by, 'team.profile_updated', 'team', p_team::text,
      jsonb_build_object('fields', to_jsonb(v_fields)));
  end if;

  return jsonb_build_object(
    'username', coalesce(v_username, v_old.username::text),
    'fields', to_jsonb(v_fields),
    'username_changed', v_username is not null and v_username is distinct from v_old.username::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Deleting a team
-- ---------------------------------------------------------------------------

create table public.team_deletion_request (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.team (account_id) on delete cascade,
  requested_by  uuid references public.user_info (id) on delete set null,
  status        text not null default 'pending'
                  check (status in ('pending', 'completed', 'cancelled', 'expired')),
  -- Why a request that did not complete ended: an Owner stopped it, the
  -- Owners changed, something now stops the deletion, staff deleted the
  -- team, or nobody finished it in time.
  end_reason    text check (end_reason in ('cancelled', 'owners_changed', 'blocked', 'staff', 'expired')),
  -- The active Owners when it was asked: every one must approve. A change
  -- to the Owners ends the request (trigger team_member_owners_end_deletion).
  owner_ids     uuid[] not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  ended_at      timestamptz,
  ended_by      uuid references public.user_info (id) on delete set null
);

create unique index team_deletion_request_one_open
  on public.team_deletion_request (team_id) where status = 'pending';
create index team_deletion_request_open_expiry
  on public.team_deletion_request (expires_at) where status = 'pending';
create index team_deletion_request_team
  on public.team_deletion_request (team_id, created_at desc);

create table public.team_deletion_approval (
  request_id   uuid not null references public.team_deletion_request (id) on delete cascade,
  owner_id     uuid not null references public.user_info (id) on delete cascade,
  approved_at  timestamptz not null default now(),
  primary key (request_id, owner_id)
);

create index team_deletion_approval_owner on public.team_deletion_approval (owner_id);

do $$
declare
  t text;
begin
  foreach t in array array['team_deletion_request', 'team_deletion_approval'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

-- What stops a team from being deleted right now. Each value is a count so
-- the service can say which step to take first. The first three are a
-- person's (account_deletion_blockers); the rest are a team's:
--   seats_held               Pay small small plans still running on its events
--   payments_in_progress     a ticket, featuring or Spotlight payment going through
--   promotions_running       a paid Spotlight promotion live, scheduled or in review
--   owners_changed_recently  an Owner removed or demoted by someone else in the
--                            last 7 days (one Owner cannot clear the others out
--                            and then delete alone)
create or replace function public.team_deletion_blockers(p_team uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person jsonb := public.account_deletion_blockers(p_team);
begin
  return jsonb_build_object(
    'upcoming_events_with_attendees', coalesce((v_person ->> 'upcoming_events_with_attendees')::bigint, 0),
    'payouts_in_flight', coalesce((v_person ->> 'payouts_in_flight')::bigint, 0),
    'balance_owed', coalesce((v_person ->> 'balance_owed')::numeric, 0),
    'seats_held',
      (select count(*)
       from public.ticket_plan tp
       join public.event e on e.id = tp.event_id
       where e.organizer_id = p_team
         and tp.status in ('awaiting_payment', 'active', 'settling')),
    'payments_in_progress',
      (select count(*)
       from public.ticket_checkout tc
       join public.ticket_type tt on tt.id = tc.ticket_type_id
       join public.event e on e.id = tt.event_id
       where e.organizer_id = p_team
         and tc.status = 'pending'
         and (tc.expires_at is null or tc.expires_at > now()))
      + (select count(*) from public.event_promotion_checkout c
         where c.account_id = p_team and c.status = 'pending'
           and (c.expires_at is null or c.expires_at > now()))
      + (select count(*) from public.place_promotion_checkout c
         where c.account_id = p_team and c.status = 'pending'
           and (c.expires_at is null or c.expires_at > now()))
      + (select count(*) from public.content_campaign cc
         where cc.advertiser_id = p_team and cc.status = 'pending_payment'),
    'promotions_running',
      (select count(*) from public.content_campaign cc
       where cc.advertiser_id = p_team
         and cc.status in ('payment_confirmed', 'pending_review', 'scheduled', 'active', 'paused')),
    'owners_changed_recently',
      (select count(*) from public.team_activity a
       where a.team_id = p_team
         and a.created_at > now() - interval '7 days'
         and a.actor_user_id is not null
         and a.actor_user_id::text is distinct from a.subject_id
         and (
           (a.action = 'member.removed' and a.details ->> 'role' = 'owner')
           or (a.action = 'member.role_changed'
               and a.details ->> 'from' = 'owner'
               and a.details ->> 'to' is distinct from 'owner')))
  );
end;
$$;

-- Whether anything stops the deletion. Staff are not bound by the Owners'
-- seven-day rule (it protects Owners from each other, not from a review).
create or replace function public._team_deletion_blocked(p_team uuid, p_staff boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b jsonb := public.team_deletion_blockers(p_team);
begin
  return (b ->> 'upcoming_events_with_attendees')::bigint > 0
      or (b ->> 'payouts_in_flight')::bigint > 0
      or (b ->> 'balance_owed')::numeric > 0.005
      or (b ->> 'seats_held')::bigint > 0
      or (b ->> 'payments_in_progress')::bigint > 0
      or (b ->> 'promotions_running')::bigint > 0
      or (not p_staff and (b ->> 'owners_changed_recently')::bigint > 0);
end;
$$;

create or replace function public._team_owner_ids(p_team uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(user_id order by user_id), '{}')
  from public.team_member
  where team_id = p_team and role = 'owner' and status = 'active';
$$;

-- An Owner asks to delete the team. They approve it by asking; with one
-- Owner it is ready at once.
create or replace function public.team_delete_request(p_team uuid, p_by uuid, p_days smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owners uuid[];
  v_id uuid;
  v_expires timestamptz;
begin
  perform public._team_require(p_team, p_by, 'team.delete');
  if public._team_deletion_blocked(p_team, false) then
    perform public._team_fail('delete_blocked');
  end if;
  if exists (
    select 1 from public.team_deletion_request
    where team_id = p_team and status = 'pending' and expires_at > now()
  ) then
    perform public._team_fail('delete_pending');
  end if;
  -- One that ran out but was not swept yet.
  update public.team_deletion_request
     set status = 'expired', end_reason = 'expired', ended_at = now()
   where team_id = p_team and status = 'pending';

  v_owners := public._team_owner_ids(p_team);
  v_expires := now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)));
  insert into public.team_deletion_request (team_id, requested_by, owner_ids, expires_at)
  values (p_team, p_by, v_owners, v_expires)
  returning id into v_id;
  insert into public.team_deletion_approval (request_id, owner_id) values (v_id, p_by);
  perform public._team_log(p_team, p_by, 'team.delete_requested', 'deletion_request', v_id::text,
    jsonb_build_object('owners', cardinality(v_owners)));

  return jsonb_build_object(
    'request_id', v_id,
    'expires_at', v_expires,
    'owners', cardinality(v_owners),
    'approvals', 1,
    'ready', cardinality(v_owners) = 1,
    'owner_ids', to_jsonb(v_owners)
  );
end;
$$;

-- Another Owner approves. Answers 'approved' (more to come), 'ready' (every
-- Owner has: the service finishes it) or 'blocked' (something now stops
-- the deletion: the request ends).
create or replace function public.team_delete_approve(p_request uuid, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_req public.team_deletion_request;
  v_approvals integer;
begin
  select team_id into v_team from public.team_deletion_request where id = p_request;
  if v_team is null then
    perform public._team_fail('delete_not_found');
  end if;
  perform public._team_require(v_team, p_by, 'team.delete');
  select * into v_req from public.team_deletion_request where id = p_request for update;
  if v_req.status <> 'pending' then
    perform public._team_fail('delete_not_pending');
  end if;
  if v_req.expires_at <= now() then
    perform public._team_fail('delete_expired');
  end if;
  if v_req.owner_ids is distinct from public._team_owner_ids(v_team) then
    perform public._team_fail('delete_owners_changed');
  end if;
  if public._team_deletion_blocked(v_team, false) then
    update public.team_deletion_request
       set status = 'cancelled', end_reason = 'blocked', ended_at = now(), ended_by = p_by
     where id = p_request;
    perform public._team_log(v_team, null, 'team.delete_cancelled', 'deletion_request', p_request::text,
      jsonb_build_object('reason', 'blocked'));
    return jsonb_build_object('team_id', v_team, 'outcome', 'blocked');
  end if;

  insert into public.team_deletion_approval (request_id, owner_id)
  values (p_request, p_by)
  on conflict do nothing;
  if found then
    perform public._team_log(v_team, p_by, 'team.delete_approved', 'deletion_request', p_request::text, '{}'::jsonb);
  end if;

  select count(*) into v_approvals
  from public.team_deletion_approval a
  where a.request_id = p_request and a.owner_id = any (v_req.owner_ids);

  return jsonb_build_object(
    'team_id', v_team,
    'outcome', case when v_approvals >= cardinality(v_req.owner_ids) then 'ready' else 'approved' end,
    'owners', cardinality(v_req.owner_ids),
    'approvals', v_approvals
  );
end;
$$;

-- Any Owner stops a request.
create or replace function public.team_delete_cancel(p_request uuid, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_req public.team_deletion_request;
begin
  select team_id into v_team from public.team_deletion_request where id = p_request;
  if v_team is null then
    perform public._team_fail('delete_not_found');
  end if;
  perform public._team_require(v_team, p_by, 'team.delete');
  select * into v_req from public.team_deletion_request where id = p_request for update;
  if v_req.status <> 'pending' then
    perform public._team_fail('delete_not_pending');
  end if;
  update public.team_deletion_request
     set status = 'cancelled', end_reason = 'cancelled', ended_at = now(), ended_by = p_by
   where id = p_request;
  perform public._team_log(v_team, p_by, 'team.delete_cancelled', 'deletion_request', p_request::text,
    jsonb_build_object('reason', 'cancelled'));
  return jsonb_build_object('team_id', v_team, 'owner_ids', to_jsonb(v_req.owner_ids));
end;
$$;

-- The deletion itself, shared by the Owners' path and the staff path: the
-- caller holds the team's row lock and has checked the blockers. The same
-- pipeline as a person's account deletion (credit closed, then
-- anonymize_deleted_account: events cancelled or archived, places
-- unclaimed, payout accounts scrubbed, verification withdrawn, follows,
-- alerts and conversations ended, profile scrubbed, status 'Deleted'), then
-- the team itself: invitations withdrawn, every member removed, the team
-- closed. The financial record stays: nothing is hard-deleted. The service
-- soft-deletes the team's auth user afterwards.
create or replace function public._team_delete_apply(
  p_team uuid,
  p_actor uuid,
  p_staff boolean,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_username text;
  v_members uuid[];
  v_owners uuid[];
  v_invites integer;
  v_result jsonb;
begin
  select full_name, username::text into v_name, v_username
  from public.user_info where id = p_team;
  select coalesce(array_agg(user_id order by joined_at), '{}') into v_members
  from public.team_member where team_id = p_team and status = 'active';
  v_owners := public._team_owner_ids(p_team);

  begin
    perform public.credit_close_account(p_team, case when p_staff then 'admin' else 'user' end, p_actor);
  exception when others then
    -- As for a person: a failure here shows in the credit reconciliation
    -- checks instead of keeping a team its Owners agreed to delete.
    raise warning 'team delete: credit_close_account failed for %: %', p_team, sqlerrm;
  end;

  -- Runs while the team is still active, so withdrawing its verification
  -- requests passes the team checks of verification_transition.
  v_result := public.anonymize_deleted_account(p_team);

  update public.team_invite
     set status = 'cancelled', decided_at = now()
   where team_id = p_team and status = 'pending';
  get diagnostics v_invites = row_count;

  update public.team_member
     set status = 'removed', ended_at = now(), ended_by = null, updated_at = now()
   where team_id = p_team and status = 'active';

  -- closed_by_owner: its Owners deleted it; staff: Abonten did.
  update public.team
     set status = 'closed',
         status_reason = case when p_staff then 'staff' else 'closed_by_owner' end,
         updated_at = now()
   where account_id = p_team;

  perform public._team_log(p_team, case when p_staff then null else p_actor end,
    'team.deleted', 'team', p_team::text,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
      -- What the team was called, so its activity (and Admin › Teams) can
      -- still say which business this was; the profile itself is scrubbed.
      'name', v_name,
      'username', v_username,
      'members', cardinality(v_members),
      'invites_withdrawn', v_invites,
      'by', case when p_staff then 'staff' else 'owners' end));

  return jsonb_build_object(
    'outcome', 'deleted',
    'team_id', p_team,
    'name', v_name,
    'username', v_username,
    'member_ids', to_jsonb(v_members),
    'owner_ids', to_jsonb(v_owners),
    'anonymized', v_result
  );
end;
$$;

-- Every Owner approved: delete the team, if nothing stops it now.
create or replace function public.team_delete_finish(p_request uuid, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_req public.team_deletion_request;
  v_approved uuid[];
begin
  select team_id into v_team from public.team_deletion_request where id = p_request;
  if v_team is null then
    perform public._team_fail('delete_not_found');
  end if;
  perform public._team_require(v_team, p_by, 'team.delete');
  select * into v_req from public.team_deletion_request where id = p_request for update;
  if v_req.status <> 'pending' or v_req.expires_at <= now()
     or v_req.owner_ids is distinct from public._team_owner_ids(v_team) then
    perform public._team_fail('delete_not_ready');
  end if;
  select coalesce(array_agg(owner_id order by approved_at), '{}') into v_approved
  from public.team_deletion_approval
  where request_id = p_request and owner_id = any (v_req.owner_ids);
  if cardinality(v_approved) < cardinality(v_req.owner_ids) then
    perform public._team_fail('delete_not_ready');
  end if;
  if public._team_deletion_blocked(v_team, false) then
    update public.team_deletion_request
       set status = 'cancelled', end_reason = 'blocked', ended_at = now(), ended_by = p_by
     where id = p_request;
    perform public._team_log(v_team, null, 'team.delete_cancelled', 'deletion_request', p_request::text,
      jsonb_build_object('reason', 'blocked'));
    return jsonb_build_object('team_id', v_team, 'outcome', 'blocked');
  end if;

  -- Completed before the members go, so the Owners' change it makes does
  -- not end it (team_member_owners_end_deletion).
  update public.team_deletion_request
     set status = 'completed', ended_at = now(), ended_by = p_by
   where id = p_request;

  return public._team_delete_apply(v_team, v_req.requested_by, false,
    jsonb_build_object('request_id', p_request, 'approved_by', to_jsonb(v_approved)));
end;
$$;

-- Staff delete a team without its Owners (abuse, a legal order): the same
-- blockers (but not the Owners' seven-day rule) and the same effects. The
-- console checks teams.manage, a fresh step-up and a reason, and writes
-- the admin audit log.
create or replace function public.admin_team_delete(p_team uuid, p_staff uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.team;
begin
  select * into v_team from public.team where account_id = p_team for update;
  if not found or v_team.status = 'closed' then
    perform public._team_fail('not_found');
  end if;
  if public._team_deletion_blocked(p_team, true) then
    perform public._team_fail('delete_blocked');
  end if;
  update public.team_deletion_request
     set status = 'cancelled', end_reason = 'staff', ended_at = now()
   where team_id = p_team and status = 'pending';
  return public._team_delete_apply(p_team, p_staff, true, '{}'::jsonb);
end;
$$;

-- A change to the Owners (one added, removed, leaving, demoted, promoted)
-- ends a request: the Owners who agreed are no longer the Owners.
create or replace function public.team_member_owners_end_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (tg_op = 'INSERT' and new.role = 'owner' and new.status = 'active')
     or (tg_op = 'UPDATE'
         and (old.role = 'owner' and old.status = 'active')
             is distinct from (new.role = 'owner' and new.status = 'active')) then
    update public.team_deletion_request
       set status = 'cancelled', end_reason = 'owners_changed', ended_at = now()
     where team_id = new.team_id and status = 'pending'
    returning id into v_id;
    if v_id is not null then
      perform public._team_log(new.team_id, null, 'team.delete_cancelled', 'deletion_request', v_id::text,
        jsonb_build_object('reason', 'owners_changed'));
    end if;
  end if;
  return null;
end;
$$;

create trigger team_member_owners_end_deletion
  after insert or update of role, status on public.team_member
  for each row
  execute function public.team_member_owners_end_deletion();

-- Requests nobody finished in time, and requests something now stops.
create or replace function public.team_delete_requests_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id, team_id, expires_at from public.team_deletion_request
    where status = 'pending'
    for update skip locked
  loop
    if r.expires_at <= now() then
      update public.team_deletion_request
         set status = 'expired', end_reason = 'expired', ended_at = now()
       where id = r.id;
      perform public._team_log(r.team_id, null, 'team.delete_expired', 'deletion_request', r.id::text, '{}'::jsonb);
      v_count := v_count + 1;
    elsif public._team_deletion_blocked(r.team_id, false) then
      update public.team_deletion_request
         set status = 'cancelled', end_reason = 'blocked', ended_at = now()
       where id = r.id;
      perform public._team_log(r.team_id, null, 'team.delete_cancelled', 'deletion_request', r.id::text,
        jsonb_build_object('reason', 'blocked'));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

select cron.schedule(
  'team-delete-requests-sweep',
  '*/15 * * * *',
  $$select public.team_delete_requests_sweep();$$
);

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._username_held(extensions.citext, uuid)',
    'public.user_info_record_username_change()',
    'public.user_info_username_hold()',
    'public.username_states(text[], uuid)',
    'public.team_update_profile(uuid, uuid, jsonb)',
    'public.team_deletion_blockers(uuid)',
    'public._team_deletion_blocked(uuid, boolean)',
    'public._team_owner_ids(uuid)',
    'public.team_delete_request(uuid, uuid, smallint)',
    'public.team_delete_approve(uuid, uuid)',
    'public.team_delete_cancel(uuid, uuid)',
    'public._team_delete_apply(uuid, uuid, boolean, jsonb)',
    'public.team_delete_finish(uuid, uuid)',
    'public.admin_team_delete(uuid, uuid)',
    'public.team_member_owners_end_deletion()',
    'public.team_delete_requests_sweep()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

revoke all on function public.username_redirect(text) from public;
grant execute on function public.username_redirect(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.username_history', 'select')
     or has_table_privilege('authenticated', 'public.team_deletion_request', 'select')
     or has_table_privilege('authenticated', 'public.team_deletion_approval', 'select') then
    raise exception 'migration check: the new tables must be service-role only';
  end if;
  if has_function_privilege('authenticated', 'public.team_delete_finish(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.team_update_profile(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.username_states(text[], uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_team_delete(uuid, uuid)', 'execute') then
    raise exception 'migration check: the new team functions must be service-role only';
  end if;
  -- team.delete is an Owner's alone (mirrors @abonten/core/teams/roles).
  if not public.team_role_can('owner', 'team.delete')
     or public.team_role_can('finance', 'team.delete')
     or public.team_role_can('manager', 'team.delete')
     or public.team_role_can('content', 'team.delete')
     or public.team_role_can('door', 'team.delete')
     or public.team_role_can('front_desk', 'team.delete')
     or not public.team_role_can('owner', 'team.profile')
     or public.team_role_can('finance', 'team.profile') then
    raise exception 'migration check: team_role_can does not match the role table';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'anonymize_deleted_account'
      and position('delete from public.follow' in p.prosrc) > 0
      and position('''deleted_'' || v_suffix' in p.prosrc) > 0
  ) then
    raise exception 'migration check: anonymize_deleted_account was not replaced';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_info_username_hold' and tgrelid = 'public.user_info'::regclass
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'team_member_owners_end_deletion' and tgrelid = 'public.team_member'::regclass
  ) then
    raise exception 'migration check: the triggers are missing';
  end if;
end;
$$;

commit;
