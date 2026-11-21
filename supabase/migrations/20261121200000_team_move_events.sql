-- Team accounts: move your own events into a team you run
-- (docs/architecture/team-accounts.md, "Move events into a team").
--
-- An organizer who made a team after listing events (Roverman Productions
-- made its team, then published twelve shows on the founder's personal
-- account) had no way to hand those listings to the team short of deleting
-- and recreating them. An Owner of a team may now move their own events
-- into it: a whole run of shows at once, with its seating plan and the
-- conversations about those events. Only listings nobody has bought or
-- registered for move: money already earned stays with the account that
-- earned it (no tickets, no checkout paid, pending or held by a plan, no
-- ledger entry). Places stay as they are (a place's owner change has
-- verification consequences; "make this a team" covers a whole account).
--
-- Also: "make this a team" now moves the person's runs of shows
-- (event_series) and seating plans, which were added after it was written,
-- so a converted organizer can still edit them.

begin;

-- ---------------------------------------------------------------------------
-- 1. "Make this a team" also moves runs and seating plans
-- ---------------------------------------------------------------------------
-- The body is the live one (20261116190000_team_accounts_verification, same
-- source fingerprint as production on 2026-11-21) plus the two updates.

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
  v_badge_type text;
  v_review   boolean := false;
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
  -- The case moves whole: the team is now both its subject and its
  -- requester; the person stays on it as the one who asked.
  update public.verification_case
     set organizer_user_id = p_account,
         requester_id = p_account,
         requested_by = coalesce(requested_by, p_person),
         updated_at = now()
   where organizer_user_id = p_person;

  -- Events and places (their reviews, promo codes, ticket types, plans and
  -- promotions follow them by id). A place keeps its badge (section 1).
  perform set_config('abonten.team_conversion', p_account::text, true);
  update public.event set organizer_id = p_account where organizer_id = p_person;
  get diagnostics v_events = row_count;
  update public.place set owner_id = p_account where owner_id = p_person;
  get diagnostics v_places = row_count;
  perform set_config('abonten.team_conversion', '', true);
  -- Runs of shows and seating plans (made after this function was first
  -- written) belong to whoever runs the events: they move too.
  update public.event_series set organizer_id = p_account where organizer_id = p_person;
  update public.seating_plan set owner_id = p_account, updated_at = now()
   where owner_id = p_person;
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

  -- X42: the badge names a business. One granted to an individual, or moved
  -- to a team under another name, goes back to review.
  if v_person.organizer_verified then
    select organizer_type into v_badge_type
    from public.verification_case
    where organizer_user_id = p_account and status = 'approved'
    limit 1;
    if coalesce(v_badge_type, 'individual') not in ('business', 'organisation')
       or p_name is distinct from v_person.full_name then
      perform public.verification_team_back_to_review(p_account, 'team_conversion', v_person.full_name, p_name);
      v_review := true;
    end if;
  end if;

  perform public._team_log(p_account, p_person, 'team.converted', 'team', p_account::text,
    jsonb_build_object('events', v_events, 'places', v_places, 'followers', v_follows,
                       'badge_back_in_review', v_review));

  return jsonb_build_object(
    'events', v_events, 'places', v_places, 'followers', v_follows,
    'alerts', v_alerts, 'conversations', v_convs, 'ledger_entries', v_ledger,
    'payouts', v_payouts, 'payout_accounts', v_accounts,
    'person_username', v_new, 'team_username', v_handle,
    'badge_back_in_review', v_review
  );
end;
$$;

revoke all on function public.team_convert_account(uuid, uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.team_convert_account(uuid, uuid, text, smallint) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Move events into a team
-- ---------------------------------------------------------------------------

create or replace function public.team_move_events(
  p_team      uuid,
  p_person    uuid,
  p_event_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids    uuid[];
  v_status text;
  v_events integer;
  v_runs   integer;
  v_plans  integer;
  v_convs  integer;
begin
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) as x
   where x is not null;
  if cardinality(v_ids) = 0 then
    perform public._team_fail('nothing_to_move');
  end if;

  select t.status into v_status
    from public.team t
   where t.account_id = p_team
     for update;
  if not found then
    perform public._team_fail('not_found');
  end if;
  if v_status <> 'active' then
    perform public._team_fail('team_frozen');
  end if;
  -- Owners only: the listings' future money becomes the team's.
  if not exists (
    select 1 from public.team_member m
     where m.team_id = p_team and m.user_id = p_person
       and m.status = 'active' and m.role = 'owner'
  ) then
    perform public._team_fail('not_allowed');
  end if;

  perform 1 from public.event e where e.id = any (v_ids) order by e.id for update;
  if (select count(*) from public.event e
       where e.id = any (v_ids) and e.organizer_id = p_person) <> cardinality(v_ids) then
    perform public._team_fail('not_yours');
  end if;

  -- A run moves whole: buyers see its shows as one listing.
  if exists (
    select 1 from public.event e
     where e.series_id in (
             select s.series_id from public.event s
              where s.id = any (v_ids) and s.series_id is not null)
       and not (e.id = any (v_ids))
  ) then
    perform public._team_fail('whole_run');
  end if;

  -- Nobody has bought or registered yet.
  if exists (
       select 1 from public.ticket t
         join public.ticket_type tt on tt.id = t.ticket_type_id
        where tt.event_id = any (v_ids))
     or exists (
       select 1 from public.ticket_checkout c
        where c.event_id = any (v_ids)
          and c.status in ('pending', 'on_plan', 'paid'))
     or exists (
       select 1 from public.organizer_ledger_entry l
        where l.event_id = any (v_ids))
  then
    perform public._team_fail('has_sales');
  end if;

  -- A seating plan goes with its events, unless an event that stays uses it.
  if exists (
    select 1 from public.event_seating es
     where es.plan_id in (
             select m.plan_id from public.event_seating m
              where m.event_id = any (v_ids))
       and not (es.event_id = any (v_ids))
  ) then
    perform public._team_fail('seating_shared');
  end if;

  update public.event set organizer_id = p_team where id = any (v_ids);
  get diagnostics v_events = row_count;
  update public.event_series s
     set organizer_id = p_team
   where s.id in (
           select e.series_id from public.event e
            where e.id = any (v_ids) and e.series_id is not null);
  get diagnostics v_runs = row_count;
  update public.seating_plan sp
     set owner_id = p_team, updated_at = now()
   where sp.owner_id = p_person
     and sp.id in (
           select es.plan_id from public.event_seating es
            where es.event_id = any (v_ids));
  get diagnostics v_plans = row_count;

  -- The conversations about these events: the team answers them now.
  update public.conversation_participant cp
     set user_id = p_team
   where cp.user_id = p_person
     and cp.conversation_id in (
           select c.id from public.conversation c where c.event_id = any (v_ids))
     and not exists (
           select 1 from public.conversation_participant o
            where o.conversation_id = cp.conversation_id and o.user_id = p_team);
  get diagnostics v_convs = row_count;
  update public.conversation_block cb
     set blocker_id = p_team
   where cb.blocker_id = p_person
     and cb.conversation_id in (
           select c.id from public.conversation c where c.event_id = any (v_ids));

  perform public._team_log(p_team, p_person, 'events.moved_in', 'team', p_team::text,
    jsonb_build_object('events', v_events, 'runs', v_runs,
                       'seating_plans', v_plans, 'conversations', v_convs));

  return jsonb_build_object('events', v_events, 'runs', v_runs,
                            'seating_plans', v_plans, 'conversations', v_convs);
end;
$$;

comment on function public.team_move_events(uuid, uuid, uuid[]) is
  'An Owner moves their own events (whole runs, no sales yet) into the team, with seating plans and the conversations about them. Service role only.';

revoke all on function public.team_move_events(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.team_move_events(uuid, uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.team_move_events(uuid, uuid, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.team_move_events(uuid, uuid, uuid[])', 'execute') then
    raise exception 'migration check: clients may move events into a team';
  end if;
  if has_function_privilege('authenticated', 'public.team_convert_account(uuid, uuid, text, smallint)', 'execute')
     or has_function_privilege('anon', 'public.team_convert_account(uuid, uuid, text, smallint)', 'execute') then
    raise exception 'migration check: clients may convert an account';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'team_convert_account'
      and p.prosrc like '%update public.event_series set organizer_id = p_account%'
      and p.prosrc like '%badge_back_in_review%'
  ) then
    raise exception 'migration check: make-this-a-team does not move runs';
  end if;
end;
$$;

commit;
