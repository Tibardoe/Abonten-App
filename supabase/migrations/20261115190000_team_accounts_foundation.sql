-- Team accounts, stage 1: the foundation (Tickets, entry and teams plan,
-- Part 2; docs/architecture/team-accounts.md; decisions X5-X8 and X42,
-- approved by the founder on 2026-11-15).
--
-- An organizer or a place can be run by a team: its own account, with its
-- own handle, followers, events, places, payout account and credit, run by
-- members who each sign in as themselves and hold a role. The team is a
-- user_info row with account_kind = 'team', backed by an auth user that can
-- never sign in, so everything already keyed on a user id (events, places,
-- follows, conversations, payouts, credit, verification, notices) can belong
-- to a team without a second ownership model.
--
--   team                   one row per team account (status, who made it)
--   team_member            who runs it and in which role
--   team_invite            an Owner's invitation, accepted by the person
--   team_activity          who did what for the team (append-only)
--   team_program_setting   switches (off), audience, limits
--   team_role_can()        the role matrix (mirrors @abonten/core/teams/roles)
--   acts_for()             "may the signed-in person act for this account
--                          in this capacity": for access rules in later stages
--
-- Stage 1 builds the team, its members, invitations, roles and activity.
-- Acting for the team on events, places, money and messages comes in
-- stages 2-4, so a team cannot run anything yet. Everything here is
-- service-role only, and the programme ships switched off.

-- ---------------------------------------------------------------------------
-- 1. A profile is a person or a team
-- ---------------------------------------------------------------------------

alter table public.user_info
  add column if not exists account_kind text not null default 'person'
    check (account_kind in ('person', 'team'));

-- account_kind joins the columns only the server may change.
create or replace function public.protect_user_info_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Trusted server contexts only: the service-role key (admin console,
  -- backend services) or a superuser / the postgres role (migrations,
  -- SECURITY DEFINER maintenance such as verification_transition). A
  -- signed-in staff account is not one of them: staff change these fields
  -- through the console, which checks the permission, asks for step-up
  -- where required and writes the audit entry.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id
     or new.organizer_verified is distinct from old.organizer_verified
     or new.organizer_verified_at is distinct from old.organizer_verified_at
     or new.organizer_verification_case_id is distinct from old.organizer_verification_case_id
     or new.country_code is distinct from old.country_code
     or new.identity_verified is distinct from old.identity_verified
     or new.identity_verified_at is distinct from old.identity_verified_at
     or new.identity_valid_until is distinct from old.identity_valid_until
     or new.identity_verification_id is distinct from old.identity_verification_id
     or new.account_kind is distinct from old.account_kind then
    raise exception 'Not authorized to modify this field' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Programme settings
-- ---------------------------------------------------------------------------

create table public.team_program_setting (
  id                     smallint primary key default 1 check (id = 1),
  enabled                boolean not null default false,
  audience               text not null default 'staff'
                           check (audience in ('staff', 'beta', 'all')),
  beta_user_ids          uuid[] not null default '{}',
  -- How many teams one person may make (a brake on spam accounts).
  max_teams_created      smallint not null default 5
                           check (max_teams_created between 1 and 50),
  -- Active members plus open invitations, per team.
  max_members            smallint not null default 50
                           check (max_members between 2 and 500),
  -- How long an invitation stays open.
  invite_hours           smallint not null default 168
                           check (invite_hours between 1 and 720),
  -- Invitation texts to numbers with no account, per team per day (X44).
  texts_per_team_per_day smallint not null default 20
                           check (texts_per_team_per_day between 0 and 200),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.user_info (id) on delete set null
);

insert into public.team_program_setting (id) values (1);

-- ---------------------------------------------------------------------------
-- 3. Teams, members, invitations, activity
-- ---------------------------------------------------------------------------

create table public.team (
  account_id     uuid primary key references public.user_info (id) on delete cascade,
  -- active: runs normally. frozen: nobody may act for it (no Owner left,
  -- a dispute, a staff hold); members and history stay. closed: wound up.
  status         text not null default 'active'
                   check (status in ('active', 'frozen', 'closed')),
  status_reason  text check (status_reason in ('no_owner', 'dispute', 'staff', 'closed_by_owner')),
  created_by     uuid references public.user_info (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index team_created_by on public.team (created_by, created_at desc);

create table public.team_member (
  team_id    uuid not null references public.team (account_id) on delete cascade,
  user_id    uuid not null references public.user_info (id) on delete cascade,
  role       text not null
               check (role in ('owner', 'finance', 'manager', 'content', 'door', 'front_desk')),
  -- A person who leaves or is removed keeps their row (status), so their
  -- past actions still name them; inviting them again reactivates it.
  status     text not null default 'active'
               check (status in ('active', 'left', 'removed')),
  added_by   uuid references public.user_info (id) on delete set null,
  joined_at  timestamptz not null default now(),
  ended_at   timestamptz,
  ended_by   uuid references public.user_info (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint team_member_not_self check (team_id <> user_id)
);

create index team_member_user_active on public.team_member (user_id) where status = 'active';
create index team_member_team_active on public.team_member (team_id, role) where status = 'active';

create table public.team_invite (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.team (account_id) on delete cascade,
  role         text not null
                 check (role in ('owner', 'finance', 'manager', 'content', 'door', 'front_desk')),
  -- The account named, or a number with no account yet (accepted by the
  -- account whose verified phone it is); the accepting account is written
  -- here when it accepts.
  to_user_id   uuid references public.user_info (id) on delete cascade,
  to_phone     text check (to_phone is null or to_phone ~ '^\+[1-9][0-9]{6,14}$'),
  invited_by   uuid references public.user_info (id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  text_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  decided_at   timestamptz,
  constraint team_invite_has_receiver check (to_user_id is not null or to_phone is not null)
);

create unique index team_invite_one_open_per_user
  on public.team_invite (team_id, to_user_id) where status = 'pending' and to_user_id is not null;
create unique index team_invite_one_open_per_phone
  on public.team_invite (team_id, to_phone) where status = 'pending' and to_user_id is null;
create index team_invite_to_user on public.team_invite (to_user_id, status, created_at desc);
create index team_invite_to_phone_open on public.team_invite (to_phone) where status = 'pending' and to_user_id is null;
create index team_invite_team on public.team_invite (team_id, created_at desc);
create index team_invite_open_expiry on public.team_invite (expires_at) where status = 'pending';

create table public.team_activity (
  id             bigint generated always as identity primary key,
  team_id        uuid not null references public.team (account_id) on delete cascade,
  -- The member who acted; null for the system (an invitation expiring, an
  -- account closing).
  actor_user_id  uuid references public.user_info (id) on delete set null,
  action         text not null,
  subject_kind   text,
  subject_id     text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index team_activity_team on public.team_activity (team_id, created_at desc);

-- Activity is a record: it is added to, never changed.
create or replace function public.team_activity_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.team where account_id = old.team_id
  ) then
    -- The team itself is being deleted (cascade).
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger team_activity_no_update
  before update or delete on public.team_activity
  for each row execute function public.team_activity_append_only();

-- ---------------------------------------------------------------------------
-- 4. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_program_setting', 'team', 'team_member', 'team_invite', 'team_activity'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roles and "acting for" an account
-- ---------------------------------------------------------------------------

-- The role matrix (X5): what each role may do for its team. Mirrors
-- @abonten/core/teams/roles; change the two together.
create or replace function public.team_role_can(p_role text, p_capability text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then true
    when 'finance' then p_capability in ('money.view', 'refunds.issue', 'payout.view')
    when 'manager' then p_capability in (
      'events.manage', 'places.manage', 'promo.manage', 'bookings.manage',
      'attendees.view', 'checkin.scan'
    )
    when 'content' then p_capability in ('messages.reply', 'content.post', 'reviews.reply')
    when 'door' then p_capability in ('checkin.scan')
    when 'front_desk' then p_capability in ('bookings.manage', 'visit.show')
    else false
  end;
$$;

-- May the signed-in person act for this account in this capacity: it is
-- their own account, or they are an active member of the active team with
-- a role that covers it. For access rules (stages 2-4); reads the
-- service-only membership table with the definer's rights.
create or replace function public.acts_for(p_account uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_account = auth.uid()
    or exists (
      select 1
      from public.team_member m
      join public.team t on t.account_id = m.team_id
      where m.team_id = p_account
        and m.user_id = auth.uid()
        and m.status = 'active'
        and t.status = 'active'
        and public.team_role_can(m.role, p_capability)
    );
$$;

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------

create or replace function public._team_fail(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'team:%', p_code using errcode = 'P0001';
end;
$$;

create or replace function public._team_log(
  p_team uuid,
  p_actor uuid,
  p_action text,
  p_subject_kind text,
  p_subject_id text,
  p_details jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.team_activity (team_id, actor_user_id, action, subject_kind, subject_id, details)
  values (p_team, p_actor, p_action, p_subject_kind, p_subject_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._team_active_owners(p_team uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.team_member
  where team_id = p_team and role = 'owner' and status = 'active';
$$;

-- The caller must be an active member of the active team whose role covers
-- the capability; returns their role.
create or replace function public._team_require(p_team uuid, p_user uuid, p_capability text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_role text;
begin
  select status into v_status from public.team where account_id = p_team for update;
  if not found then
    perform public._team_fail('not_found');
  end if;
  select role into v_role from public.team_member
  where team_id = p_team and user_id = p_user and status = 'active';
  if v_role is null then
    perform public._team_fail('not_member');
  end if;
  if v_status <> 'active' then
    perform public._team_fail('team_frozen');
  end if;
  if not public.team_role_can(v_role, p_capability) then
    perform public._team_fail('not_allowed');
  end if;
  return v_role;
end;
$$;

-- A person may join a team: an active personal account.
create or replace function public._team_person_ok(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.user_info
    where id = p_user and account_kind = 'person' and status_id = 1
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Making a team
-- ---------------------------------------------------------------------------

-- The service has created the team's sign-in-less auth user (whose trigger
-- made the user_info row); this turns that row into a team run by its
-- maker as the first Owner.
create or replace function public.team_finalize_create(
  p_account uuid,
  p_creator uuid,
  p_name text,
  p_username text,
  p_max_created smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator public.user_info;
begin
  select * into v_creator from public.user_info where id = p_creator for update;
  if not found or v_creator.account_kind <> 'person' or v_creator.status_id <> 1 then
    perform public._team_fail('creator_unavailable');
  end if;
  if (select count(*) from public.team where created_by = p_creator) >= p_max_created then
    perform public._team_fail('too_many_teams');
  end if;
  if exists (select 1 from public.user_info where username = p_username and id <> p_account) then
    perform public._team_fail('username_taken');
  end if;

  update public.user_info
  set account_kind = 'team',
      full_name = p_name,
      username = p_username,
      username_is_generated = false,
      country_code = v_creator.country_code,
      updated_at = now()
  where id = p_account;
  if not found then
    perform public._team_fail('not_found');
  end if;

  insert into public.team (account_id, created_by) values (p_account, p_creator);
  insert into public.team_member (team_id, user_id, role, added_by)
  values (p_account, p_creator, 'owner', p_creator);
  perform public._team_log(p_account, p_creator, 'team.created', 'team', p_account::text,
    jsonb_build_object('name', p_name, 'username', p_username));
end;
$$;

-- An Owner renames the team. (A team with the business badge going back to
-- review on a new name, X42, comes with the business check in stage 5.)
create or replace function public.team_rename(p_team uuid, p_by uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public._team_require(p_team, p_by, 'team.profile');
  select full_name into v_old from public.user_info where id = p_team;
  if v_old is not distinct from p_name then
    return;
  end if;
  update public.user_info set full_name = p_name, updated_at = now() where id = p_team;
  perform public._team_log(p_team, p_by, 'team.renamed', 'team', p_team::text,
    jsonb_build_object('from', v_old, 'to', p_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Invitations
-- ---------------------------------------------------------------------------

create or replace function public.team_invite_send(
  p_team uuid,
  p_by uuid,
  p_role text,
  p_to_user uuid,
  p_to_phone text,
  p_hours smallint,
  p_max_members smallint
)
returns table (invite_id uuid, expires_at timestamptz, resolved_to_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_to uuid := p_to_user;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_to_user is null and coalesce(p_to_phone, '') = '' then
    perform public._team_fail('no_receiver');
  end if;
  if p_role not in ('owner', 'finance', 'manager', 'content', 'door', 'front_desk') then
    perform public._team_fail('bad_role');
  end if;
  perform public._team_require(p_team, p_by, 'team.members');

  -- A number that belongs to an account is sent to that account.
  if v_to is null then
    v_to := public.ticket_transfer_user_by_phone(p_to_phone);
  end if;

  if v_to is not null then
    if v_to = p_by or v_to = p_team then
      perform public._team_fail('self');
    end if;
    if not public._team_person_ok(v_to) then
      perform public._team_fail('receiver_unavailable');
    end if;
    if exists (
      select 1 from public.team_member
      where team_id = p_team and user_id = v_to and status = 'active'
    ) then
      perform public._team_fail('already_member');
    end if;
    -- Someone who blocked the inviter is never invited by them.
    if exists (
      select 1 from public.conversation_block b
      where b.blocker_id = v_to and b.blocked_id = p_by and b.conversation_id is null
    ) then
      perform public._team_fail('receiver_unavailable');
    end if;
  end if;

  if (
    (select count(*) from public.team_member where team_id = p_team and status = 'active')
    + (select count(*) from public.team_invite where team_id = p_team and status = 'pending')
  ) >= p_max_members then
    perform public._team_fail('team_full');
  end if;

  v_expires := now() + make_interval(hours => p_hours);
  begin
    insert into public.team_invite (team_id, role, to_user_id, to_phone, invited_by, expires_at)
    values (p_team, p_role, v_to, case when v_to is null then p_to_phone else null end, p_by, v_expires)
    returning id into v_id;
  exception when unique_violation then
    perform public._team_fail('already_invited');
  end;

  perform public._team_log(p_team, p_by, 'member.invited', 'invite', v_id::text,
    jsonb_build_object('role', p_role, 'to_user_id', v_to,
      'to_phone_last4', case when v_to is null then right(p_to_phone, 4) end));

  return query select v_id, v_expires, v_to;
end;
$$;

-- The invited person joins. The account named, or the account whose
-- verified phone is the number named.
create or replace function public.team_invite_accept(p_invite uuid, p_user uuid, p_max_members smallint)
returns table (team_id uuid, role text, invited_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invite public.team_invite;
  v_status text;
begin
  select * into v_invite from public.team_invite where id = p_invite for update;
  if not found then
    perform public._team_fail('invite_not_found');
  end if;
  if v_invite.status <> 'pending' then
    perform public._team_fail('invite_not_pending');
  end if;
  if v_invite.expires_at <= now() then
    perform public._team_fail('invite_expired');
  end if;
  if v_invite.to_user_id is not null then
    if v_invite.to_user_id <> p_user then
      perform public._team_fail('not_receiver');
    end if;
  elsif public._ticket_transfer_verified_phone(p_user) is distinct from v_invite.to_phone then
    perform public._team_fail('not_receiver');
  end if;
  if not public._team_person_ok(p_user) or p_user = v_invite.team_id then
    perform public._team_fail('receiver_unavailable');
  end if;

  select status into v_status from public.team where account_id = v_invite.team_id for update;
  if v_status is distinct from 'active' then
    perform public._team_fail('team_frozen');
  end if;
  if (select count(*) from public.team_member m
      where m.team_id = v_invite.team_id and m.status = 'active') >= p_max_members then
    perform public._team_fail('team_full');
  end if;

  insert into public.team_member as m (team_id, user_id, role, added_by)
  values (v_invite.team_id, p_user, v_invite.role, v_invite.invited_by)
  on conflict on constraint team_member_pkey do update
    set role = excluded.role,
        status = 'active',
        added_by = excluded.added_by,
        joined_at = now(),
        ended_at = null,
        ended_by = null,
        updated_at = now()
    where m.status <> 'active';

  update public.team_invite
  set status = 'accepted', to_user_id = p_user, decided_at = now()
  where id = p_invite;

  perform public._team_log(v_invite.team_id, p_user, 'member.joined', 'member', p_user::text,
    jsonb_build_object('role', v_invite.role, 'invite_id', p_invite));

  return query select v_invite.team_id, v_invite.role, v_invite.invited_by;
end;
$$;

create or replace function public.team_invite_decline(p_invite uuid, p_user uuid)
returns table (team_id uuid, invited_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invite public.team_invite;
begin
  select * into v_invite from public.team_invite where id = p_invite for update;
  if not found then
    perform public._team_fail('invite_not_found');
  end if;
  if v_invite.status <> 'pending' then
    perform public._team_fail('invite_not_pending');
  end if;
  if v_invite.to_user_id is not null then
    if v_invite.to_user_id <> p_user then
      perform public._team_fail('not_receiver');
    end if;
  elsif public._ticket_transfer_verified_phone(p_user) is distinct from v_invite.to_phone then
    perform public._team_fail('not_receiver');
  end if;
  update public.team_invite
  set status = 'declined', to_user_id = p_user, decided_at = now()
  where id = p_invite;
  perform public._team_log(v_invite.team_id, p_user, 'member.declined', 'invite', p_invite::text, '{}'::jsonb);
  return query select v_invite.team_id, v_invite.invited_by;
end;
$$;

-- An Owner withdraws an invitation still waiting.
create or replace function public.team_invite_cancel(p_invite uuid, p_by uuid)
returns table (team_id uuid, to_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invite public.team_invite;
begin
  select * into v_invite from public.team_invite where id = p_invite for update;
  if not found then
    perform public._team_fail('invite_not_found');
  end if;
  perform public._team_require(v_invite.team_id, p_by, 'team.members');
  if v_invite.status <> 'pending' then
    perform public._team_fail('invite_not_pending');
  end if;
  update public.team_invite set status = 'cancelled', decided_at = now() where id = p_invite;
  perform public._team_log(v_invite.team_id, p_by, 'member.invite_cancelled', 'invite', p_invite::text, '{}'::jsonb);
  return query select v_invite.team_id, v_invite.to_user_id;
end;
$$;

-- Invitations nobody answered in time.
create or replace function public.team_invite_expire_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with ended as (
    update public.team_invite
    set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at <= now()
    returning id, team_id
  ),
  logged as (
    insert into public.team_activity (team_id, actor_user_id, action, subject_kind, subject_id)
    select team_id, null, 'member.invite_expired', 'invite', id::text from ended
    returning 1
  )
  select count(*)::integer into v_count from logged;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Members: roles, removing, leaving
-- ---------------------------------------------------------------------------

create or replace function public.team_member_set_role(p_team uuid, p_by uuid, p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_role not in ('owner', 'finance', 'manager', 'content', 'door', 'front_desk') then
    perform public._team_fail('bad_role');
  end if;
  perform public._team_require(p_team, p_by, 'team.members');
  select role into v_old from public.team_member
  where team_id = p_team and user_id = p_user and status = 'active'
  for update;
  if v_old is null then
    perform public._team_fail('not_member');
  end if;
  if v_old = p_role then
    return v_old;
  end if;
  -- A team always has an Owner.
  if v_old = 'owner' and public._team_active_owners(p_team) <= 1 then
    perform public._team_fail('last_owner');
  end if;
  update public.team_member set role = p_role, updated_at = now()
  where team_id = p_team and user_id = p_user;
  perform public._team_log(p_team, p_by, 'member.role_changed', 'member', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role));
  return v_old;
end;
$$;

create or replace function public.team_member_remove(p_team uuid, p_by uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  perform public._team_require(p_team, p_by, 'team.members');
  if p_user = p_by then
    perform public._team_fail('remove_self');
  end if;
  select role into v_role from public.team_member
  where team_id = p_team and user_id = p_user and status = 'active'
  for update;
  if v_role is null then
    perform public._team_fail('not_member');
  end if;
  if v_role = 'owner' and public._team_active_owners(p_team) <= 1 then
    perform public._team_fail('last_owner');
  end if;
  update public.team_member
  set status = 'removed', ended_at = now(), ended_by = p_by, updated_at = now()
  where team_id = p_team and user_id = p_user;
  perform public._team_log(p_team, p_by, 'member.removed', 'member', p_user::text,
    jsonb_build_object('role', v_role));
  return v_role;
end;
$$;

-- A member leaves. The last Owner names another Owner first.
create or replace function public.team_member_leave(p_team uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  perform 1 from public.team where account_id = p_team for update;
  select role into v_role from public.team_member
  where team_id = p_team and user_id = p_user and status = 'active'
  for update;
  if v_role is null then
    perform public._team_fail('not_member');
  end if;
  if v_role = 'owner' and public._team_active_owners(p_team) <= 1 then
    perform public._team_fail('last_owner');
  end if;
  update public.team_member
  set status = 'left', ended_at = now(), ended_by = p_user, updated_at = now()
  where team_id = p_team and user_id = p_user;
  perform public._team_log(p_team, p_user, 'member.left', 'member', p_user::text,
    jsonb_build_object('role', v_role));
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. A member's account closes, is suspended or is banned
-- ---------------------------------------------------------------------------

-- They leave every team (the plan's edge cases); their past actions keep
-- naming them. A team left with no Owner is frozen, so nobody can act for
-- it until staff settle who runs it. Open invitations to them end.
create or replace function public.team_forget_member(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select team_id, role from public.team_member
    where user_id = p_user and status = 'active'
    for update
  loop
    update public.team_member
    set status = 'removed', ended_at = now(), ended_by = null, updated_at = now()
    where team_id = r.team_id and user_id = p_user;
    perform public._team_log(r.team_id, null, 'member.account_closed', 'member', p_user::text,
      jsonb_build_object('role', r.role, 'reason', p_reason));
    if r.role = 'owner' and public._team_active_owners(r.team_id) = 0 then
      update public.team
      set status = 'frozen', status_reason = 'no_owner', updated_at = now()
      where account_id = r.team_id and status = 'active';
      perform public._team_log(r.team_id, null, 'team.frozen', 'team', r.team_id::text,
        jsonb_build_object('reason', 'no_owner'));
    end if;
  end loop;
  update public.team_invite
  set status = 'cancelled', decided_at = now()
  where to_user_id = p_user and status = 'pending';
end;
$$;

create or replace function public.team_on_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_kind = 'person' then
    perform public.team_forget_member(
      new.id,
      case new.status_id when 4 then 'deleted' when 3 then 'banned' else 'suspended' end
    );
  end if;
  return null;
end;
$$;

create trigger user_info_team_forget
  after update of status_id on public.user_info
  for each row
  when (new.status_id in (2, 3, 4) and old.status_id is distinct from new.status_id)
  execute function public.team_on_member_status_change();

-- ---------------------------------------------------------------------------
-- 11. Grants and the job
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._team_fail(text)',
    'public._team_log(uuid, uuid, text, text, text, jsonb)',
    'public._team_active_owners(uuid)',
    'public._team_require(uuid, uuid, text)',
    'public._team_person_ok(uuid)',
    'public.team_finalize_create(uuid, uuid, text, text, smallint)',
    'public.team_rename(uuid, uuid, text)',
    'public.team_invite_send(uuid, uuid, text, uuid, text, smallint, smallint)',
    'public.team_invite_accept(uuid, uuid, smallint)',
    'public.team_invite_decline(uuid, uuid)',
    'public.team_invite_cancel(uuid, uuid)',
    'public.team_invite_expire_due()',
    'public.team_member_set_role(uuid, uuid, uuid, text)',
    'public.team_member_remove(uuid, uuid, uuid)',
    'public.team_member_leave(uuid, uuid)',
    'public.team_forget_member(uuid, text)',
    'public.team_on_member_status_change()',
    'public.team_activity_append_only()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- The role matrix and acts_for are what later access rules call, so the
-- signed-in role may execute them (acts_for reads membership with the
-- definer's rights and answers only for the caller).
revoke all on function public.team_role_can(text, text) from public, anon;
grant execute on function public.team_role_can(text, text) to authenticated, service_role;
revoke all on function public.acts_for(uuid, text) from public, anon;
grant execute on function public.acts_for(uuid, text) to authenticated, service_role;

select cron.schedule(
  'team-invites-expire',
  '*/15 * * * *',
  $$select public.team_invite_expire_due();$$
);

-- ---------------------------------------------------------------------------
-- 12. Admin permissions (Admin › Teams)
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('teams.view',      'View teams',
     'See team accounts, their members, invitations and activity, and the programme settings.'),
  ('teams.configure', 'Configure teams',
     'Switch team accounts on or off, choose the audience and set the limits. Requires step-up.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',    'teams.view'),
  ('operations',    'teams.configure'),
  ('support_admin', 'teams.view'),
  ('moderator',     'teams.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 13. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.team_member', 'select') then
    raise exception 'migration check: team tables must be service-role only';
  end if;
  if has_function_privilege('authenticated',
       'public.team_invite_accept(uuid, uuid, smallint)', 'execute') then
    raise exception 'migration check: team functions must be service-role only';
  end if;
  if not public.team_role_can('owner', 'payout.manage')
     or public.team_role_can('finance', 'payout.manage')
     or public.team_role_can('door', 'attendees.view')
     or not public.team_role_can('door', 'checkin.scan') then
    raise exception 'migration check: team_role_can does not match the role table';
  end if;
  if (select enabled from public.team_program_setting where id = 1) then
    raise exception 'migration check: teams must ship switched off';
  end if;
end;
$$;
