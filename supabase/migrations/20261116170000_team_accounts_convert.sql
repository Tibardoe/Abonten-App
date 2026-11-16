-- Team accounts: "make this a team" (Tickets, entry and teams plan, Part 2;
-- docs/architecture/team-accounts.md §4f; decision X8).
--
-- A person who runs events or places turns that work into a team account
-- without losing anything people know it by: the new team takes their
-- handle, name, photo and bio, their events and places (with their
-- reviews, promo codes and Verified places), their followers and alert
-- subscribers, the conversations about those events and places, the
-- organizer money (ledger, payouts and payout accounts) and the organizer
-- badge. The person becomes the team's first Owner and gets a new handle,
-- marked as generated, so the account-setup reminder asks them to choose
-- one. Their tickets, credit, Spotlights and Stories, direct messages and
-- ID check stay with them.
--
-- Refused while something could not move cleanly: a payout being processed,
-- or a verification request still open (organizer or place). Everything
-- happens in one transaction; the service created the team's auth user
-- beforehand and deletes it if this fails.
--
-- Nothing here is reachable until a team exists, and teams ship switched
-- off (team_program_setting).

-- ---------------------------------------------------------------------------
-- 1. A place moved by "make this a team" keeps its Verified badge
-- ---------------------------------------------------------------------------
-- An owner change normally withdraws open requests and revokes the badge
-- (someone else runs the place now). Turning one's own account into a team
-- is not someone else: team_convert_account names the team in a
-- transaction-local setting, and the move to that team keeps the badge.
-- (It refuses to run while a request is open, so only approved cases move.)

create or replace function public.verification_on_place_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if coalesce(current_setting('abonten.team_conversion', true), '') = new.owner_id::text then
    return null;
  end if;

  for r in
    select id from public.verification_case
    where place_id = new.id and status in ('draft', 'pending_review', 'needs_info')
  loop
    perform public.verification_transition(r.id, null, 'system', 'withdraw', 'owner_changed', null);
  end loop;

  if old.verified then
    for r in
      select id from public.verification_case where place_id = new.id and status = 'approved'
    loop
      perform public.verification_transition(r.id, null, 'system', 'revoke', 'owner_changed', null);
    end loop;
    -- legacy verified flag with no case behind it
    update public.place
       set verified = false, verified_at = null, verification_case_id = null
     where id = new.id and verified;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Make this a team
-- ---------------------------------------------------------------------------

create or replace function public.team_convert_account(
  p_account     uuid,
  p_person      uuid,
  p_name        text,
  p_max_created smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person   public.user_info;
  v_handle   text;
  v_new      text;
  v_attempt  integer := 0;
  v_events   integer;
  v_places   integer;
  v_follows  integer;
  v_alerts   integer;
  v_convs    integer;
  v_ledger   integer;
  v_payouts  integer;
  v_accounts integer;
begin
  select * into v_person from public.user_info where id = p_person for update;
  if not found or v_person.account_kind <> 'person' or v_person.status_id <> 1 then
    perform public._team_fail('creator_unavailable');
  end if;
  if not exists (select 1 from public.event e where e.organizer_id = p_person)
     and not exists (select 1 from public.place p where p.owner_id = p_person) then
    perform public._team_fail('nothing_to_move');
  end if;
  if exists (
    select 1 from public.payout po
    where po.organizer_id = p_person and po.status = 'processing'
  ) then
    perform public._team_fail('payout_in_progress');
  end if;
  if exists (
    select 1 from public.verification_case vc
    where vc.status in ('draft', 'pending_review', 'needs_info')
      and (vc.organizer_user_id = p_person
           or vc.place_id in (select p.id from public.place p where p.owner_id = p_person))
  ) then
    perform public._team_fail('verification_open');
  end if;

  -- The handle moves to the team; the person gets a new one, marked as
  -- generated so the account-setup reminder asks them to choose.
  v_handle := v_person.username;
  loop
    v_attempt := v_attempt + 1;
    v_new := left(coalesce(nullif(v_handle, ''), 'user'), 15) || '_'
             || lpad(floor(random() * 10000)::text, 4, '0');
    exit when not exists (select 1 from public.user_info u where u.username = v_new);
    if v_attempt >= 20 then
      v_new := 'user' || lpad(floor(random() * 100000000)::text, 8, '0');
      exit when not exists (select 1 from public.user_info u where u.username = v_new);
    end if;
    if v_attempt >= 40 then
      perform public._team_fail('username_taken');
    end if;
  end loop;
  update public.user_info
     set username = v_new, username_is_generated = true, updated_at = now()
   where id = p_person;

  perform public.team_finalize_create(p_account, p_person, p_name, v_handle, p_max_created);

  -- The public face: photo, bio, website; the organizer badge.
  if v_person.avatar_public_id is not null then
    insert into public.user_image_history (user_id, public_id, version)
    values (p_account, v_person.avatar_public_id, coalesce(v_person.avatar_version, '1'));
  end if;
  update public.user_info
     set avatar_public_id = v_person.avatar_public_id,
         avatar_version = v_person.avatar_version,
         bio = v_person.bio,
         website = v_person.website,
         organizer_verified = v_person.organizer_verified,
         organizer_verified_at = v_person.organizer_verified_at,
         organizer_verification_case_id = v_person.organizer_verification_case_id,
         updated_at = now()
   where id = p_account;
  update public.user_info
     set organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null
   where id = p_person
     and (organizer_verified or organizer_verification_case_id is not null);
  update public.verification_case
     set organizer_user_id = p_account
   where organizer_user_id = p_person;

  -- Events and places (their reviews, promo codes, ticket types, plans and
  -- promotions follow them by id). A place keeps its badge (section 1).
  perform set_config('abonten.team_conversion', p_account::text, true);
  update public.event set organizer_id = p_account where organizer_id = p_person;
  get diagnostics v_events = row_count;
  update public.place set owner_id = p_account where owner_id = p_person;
  get diagnostics v_places = row_count;
  perform set_config('abonten.team_conversion', '', true);
  update public.drafts set user_id = p_account
   where user_id = p_person and draft_type in ('event', 'place');

  -- Followers and alert subscribers (X8). follow_count is kept by the
  -- insert and delete triggers.
  insert into public.follow (follower_id, target_kind, target_id, created_at)
  select f.follower_id, f.target_kind, p_account, f.created_at
    from public.follow f
   where f.target_kind = 'organizer' and f.target_id = p_person
     and f.follower_id <> p_person
  on conflict (follower_id, target_kind, target_id) do nothing;
  get diagnostics v_follows = row_count;
  delete from public.follow where target_kind = 'organizer' and target_id = p_person;
  update public.notification_subscription
     set target_id = p_account
   where kind = 'organizer' and target_id = p_person and user_id <> p_person;
  get diagnostics v_alerts = row_count;

  -- The conversations about those events and places: the team answers
  -- them now (its Owners, and Content and messages).
  update public.conversation_participant cp
     set user_id = p_account
   where cp.user_id = p_person
     and cp.conversation_id in (
       select c.id from public.conversation c
       where c.event_id in (select e.id from public.event e where e.organizer_id = p_account)
          or c.place_id in (select p.id from public.place p where p.owner_id = p_account)
     );
  get diagnostics v_convs = row_count;
  update public.conversation_block cb
     set blocker_id = p_account
   where cb.blocker_id = p_person
     and cb.conversation_id in (
       select cp.conversation_id from public.conversation_participant cp
       where cp.user_id = p_account
     );

  -- Organizer money: the history, the payouts and where they go.
  update public.organizer_ledger_entry set organizer_id = p_account where organizer_id = p_person;
  get diagnostics v_ledger = row_count;
  update public.payout set organizer_id = p_account where organizer_id = p_person;
  get diagnostics v_payouts = row_count;
  update public.payout_account set organizer_id = p_account where organizer_id = p_person;
  get diagnostics v_accounts = row_count;

  perform public._team_log(p_account, p_person, 'team.converted', 'team', p_account::text,
    jsonb_build_object('events', v_events, 'places', v_places, 'followers', v_follows));

  return jsonb_build_object(
    'events', v_events, 'places', v_places, 'followers', v_follows,
    'alerts', v_alerts, 'conversations', v_convs, 'ledger_entries', v_ledger,
    'payouts', v_payouts, 'payout_accounts', v_accounts,
    'person_username', v_new, 'team_username', v_handle
  );
end;
$$;

revoke all on function public.team_convert_account(uuid, uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.team_convert_account(uuid, uuid, text, smallint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.team_convert_account(uuid, uuid, text, smallint)', 'execute')
     or has_function_privilege('anon', 'public.team_convert_account(uuid, uuid, text, smallint)', 'execute') then
    raise exception 'migration check: clients may convert an account';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'verification_on_place_owner_change'
      and p.prosrc like '%abonten.team_conversion%'
  ) then
    raise exception 'migration check: the place owner-change rule does not know conversions';
  end if;
end;
$$;
