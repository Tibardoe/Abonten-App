-- Team accounts: the business check and badges for teams (Tickets, entry and
-- teams plan, Part 2, stage 5; decision X42; docs/architecture/team-accounts.md
-- §4h and trust-and-verification.md §8a).
--
-- 1. A team asks for verification itself. Its Owners (capability
--    verification.request) open, fill, submit and withdraw the request for
--    the team (organizer subject = the team) or for one of the team's
--    places. The case belongs to the team (requester_id = the team, so every
--    Owner sees and continues it and the notices go to the team's Owners);
--    requested_by records which member asked.
-- 2. The business check for a team needs what the plan says: the team is a
--    registered business or organisation (organizer_type), with its
--    registration certificate and a paper showing the Owner may act for it
--    (a directors listing, new evidence type, or a signed letter).
--    verification_transition() enforces this at submit, checks that a
--    member acting on a case is an Owner of the active team, and that a
--    team's case or place is only submitted or approved while the team is
--    active.
-- 3. X42: a Verified team that changes its name goes back to review. The
--    approved case returns to pending_review (new action return_to_review,
--    system only), the badge comes off until a reviewer approves the new
--    name, and the team's Owners are told. This replaces the interim name
--    lock (team_rename_guard_verified, migration 20261116180000).
-- 4. "Make this a team" (20261116170000) failed for anyone who had ever
--    asked for organizer verification: the case moved to the team while its
--    requester stayed the person, which the check
--    verification_case_organizer_is_requester refuses. The case now moves
--    whole (requester and subject), and a badge granted to an individual,
--    or moved under another name, goes back to review (X42).
-- 5. "ID checked" for a team: shown when at least one active Owner of the
--    active team has a live ID check. One rule for people and teams,
--    public.account_id_checked(), also readable as the computed column
--    user_info.id_checked; get_public_profile says whether the profile is a
--    team.
--
-- Nothing here is reachable until a team exists (teams ship switched off),
-- and verification requests stay behind verification_program_setting.

-- ---------------------------------------------------------------------------
-- 1. Who asked, the new history entry, the new document type
-- ---------------------------------------------------------------------------

alter table public.verification_case
  add column if not exists requested_by uuid
    references public.user_info (id) on delete set null;

create index if not exists idx_verification_case_requested_by
  on public.verification_case (requested_by) where requested_by is not null;

comment on column public.verification_case.requested_by is
  'The member who asked for a team''s verification (requester_id is the team). Null when a person asked for themselves. Written by the server only.';

alter table public.verification_event
  drop constraint if exists verification_event_event_type_check;
alter table public.verification_event
  add constraint verification_event_event_type_check check (event_type in (
    'created', 'evidence_added', 'evidence_removed', 'submitted', 'resubmitted',
    'info_requested', 'approved', 'rejected', 'withdrawn', 'revoked',
    'subject_changed', 'evidence_purged', 'returned_to_review'));

insert into public.verification_evidence_type (key, label, description, applies_to, sort_order) values
  ('director_listing', 'Directors or partners listing',
     'The Registrar General''s record of the business''s directors or partners, showing the person who manages this account.',
     '{place,organizer}', 75)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. May this person act on this account's verification?
-- ---------------------------------------------------------------------------
-- The account itself, or an active member of the active team whose role
-- covers verification.request (Owners).

create or replace function public._verification_actor_ok(p_account uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_account = p_person
      or exists (
        select 1
        from public.team t
        join public.team_member m
          on m.team_id = t.account_id and m.user_id = p_person and m.status = 'active'
        where t.account_id = p_account
          and t.status = 'active'
          and public.team_role_can(m.role, 'verification.request')
      );
$$;

revoke all on function public._verification_actor_ok(uuid, uuid) from public, anon, authenticated;

-- A team account that is paused or closed cannot be submitted or approved.
create or replace function public._verification_team_active(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.team t
    where t.account_id = p_account and t.status <> 'active'
  );
$$;

revoke all on function public._verification_team_active(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The state machine
-- ---------------------------------------------------------------------------
-- As 20260912120000, plus: the member check for user actions, the team's
-- state at submit and approve, the business check's requirements for a
-- team, and return_to_review (system: approved -> pending_review, the badge
-- comes off until it is approved again).

create or replace function public.verification_transition(
  p_case_id         uuid,
  p_actor_id        uuid,
  p_actor_kind      text,
  p_action          text,
  p_reason          text default null,
  p_expected_status text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_subject_type   text;
  v_place_id       uuid;
  v_organizer_id   uuid;
  v_case           public.verification_case%rowtype;
  v_place          public.place%rowtype;
  v_user_status    smallint;
  v_is_team        boolean;
  v_from           text;
  v_to             text;
  v_event          text;
  v_evidence_count integer;
  v_now            timestamptz := now();
begin
  if p_actor_kind not in ('user', 'admin', 'system') then
    raise exception 'verification_invalid_actor';
  end if;

  select subject_type, place_id, organizer_user_id
    into v_subject_type, v_place_id, v_organizer_id
  from public.verification_case where id = p_case_id;
  if not found then
    raise exception 'verification_case_not_found';
  end if;

  -- subject lock first
  if v_subject_type = 'place' then
    perform 1 from public.place where id = v_place_id for update;
  else
    perform 1 from public.user_info where id = v_organizer_id for update;
  end if;

  select * into v_case from public.verification_case where id = p_case_id for update;
  v_from := v_case.status;

  if p_expected_status is not null and v_from <> p_expected_status then
    raise exception 'verification_status_changed';
  end if;

  -- A person acts on their own case, or on their team's as one of its Owners.
  if p_actor_kind = 'user'
     and (p_actor_id is null or not public._verification_actor_ok(v_case.requester_id, p_actor_id)) then
    raise exception 'verification_not_allowed';
  end if;

  v_to := case
    when p_action = 'submit'           and v_from = 'draft'          and p_actor_kind = 'user'               then 'pending_review'
    when p_action = 'resubmit'         and v_from = 'needs_info'     and p_actor_kind = 'user'               then 'pending_review'
    when p_action = 'withdraw'         and v_from in ('draft', 'pending_review', 'needs_info')
                                                                    and p_actor_kind in ('user', 'system')  then 'withdrawn'
    when p_action = 'approve'          and v_from = 'pending_review' and p_actor_kind = 'admin'              then 'approved'
    when p_action = 'reject'           and v_from in ('pending_review', 'needs_info')
                                                                    and p_actor_kind = 'admin'              then 'rejected'
    when p_action = 'request_info'     and v_from = 'pending_review' and p_actor_kind = 'admin'              then 'needs_info'
    when p_action = 'revoke'           and v_from = 'approved'       and p_actor_kind in ('admin', 'system') then 'revoked'
    when p_action = 'return_to_review' and v_from = 'approved'       and p_actor_kind = 'system'             then 'pending_review'
    else null
  end;
  if v_to is null then
    raise exception 'verification_invalid_transition: % -> % by %', v_from, p_action, p_actor_kind;
  end if;

  if p_action in ('reject', 'request_info', 'revoke', 'return_to_review') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'verification_reason_required';
  end if;

  -- The subject must still be eligible when it is submitted and when it is
  -- approved: same owner, published, not moderated away, account active,
  -- and a team that is not paused.
  if p_action in ('submit', 'resubmit', 'approve') then
    if v_subject_type = 'place' then
      select * into v_place from public.place where id = v_place_id;
      if not found
         or v_place.status <> 'published'
         or coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed')
         or v_place.owner_id <> v_case.requester_id
         or not public._verification_team_active(v_place.owner_id) then
        raise exception 'verification_subject_ineligible';
      end if;
    else
      select status_id, account_kind = 'team' into v_user_status, v_is_team
      from public.user_info where id = v_organizer_id;
      if not found or v_user_status <> 1
         or not public._verification_team_active(v_organizer_id) then
        raise exception 'verification_subject_ineligible';
      end if;
    end if;

    if p_action in ('submit', 'resubmit') then
      select count(*) into v_evidence_count
      from public.verification_evidence
      where case_id = p_case_id and status = 'uploaded';
      if v_evidence_count = 0 then
        raise exception 'verification_no_evidence';
      end if;

      -- The business check for a team: a registered business or
      -- organisation, its registration, and a paper showing the Owner may
      -- act for it.
      if v_subject_type = 'organizer' and coalesce(v_is_team, false) then
        if coalesce(v_case.organizer_type, '') not in ('business', 'organisation')
           or not exists (
             select 1 from public.verification_evidence
             where case_id = p_case_id and status = 'uploaded'
               and evidence_type = 'business_registration')
           or not exists (
             select 1 from public.verification_evidence
             where case_id = p_case_id and status = 'uploaded'
               and evidence_type in ('director_listing', 'authorisation_letter')) then
          raise exception 'verification_team_requirements';
        end if;
      end if;
    end if;
  end if;

  v_event := case p_action
    when 'submit'           then 'submitted'
    when 'resubmit'         then 'resubmitted'
    when 'withdraw'         then 'withdrawn'
    when 'approve'          then 'approved'
    when 'reject'           then 'rejected'
    when 'request_info'     then 'info_requested'
    when 'revoke'           then 'revoked'
    when 'return_to_review' then 'returned_to_review'
  end;

  update public.verification_case set
    status            = v_to,
    updated_at        = v_now,
    submitted_at      = case when p_action in ('submit', 'resubmit', 'return_to_review') then v_now else submitted_at end,
    info_requested_at = case when p_action = 'request_info' then v_now else info_requested_at end,
    reviewed_by       = case when p_action in ('approve', 'reject', 'request_info') then p_actor_id else reviewed_by end,
    reviewed_at       = case when p_action in ('approve', 'reject', 'request_info') then v_now else reviewed_at end,
    revoked_by        = case when p_action = 'revoke' then p_actor_id else revoked_by end,
    revoked_at        = case when p_action = 'revoke' then v_now else revoked_at end,
    decision_reason   = case
                          when p_action in ('reject', 'request_info', 'revoke') then btrim(p_reason)
                          when p_action in ('submit', 'resubmit', 'return_to_review') then null
                          else decision_reason
                        end
  where id = p_case_id
  returning * into v_case;

  if p_action = 'approve' then
    if v_subject_type = 'place' then
      update public.place
         set verified = true, verified_at = v_now, verification_case_id = p_case_id, updated_at = v_now
       where id = v_place_id;
    else
      update public.user_info
         set organizer_verified = true, organizer_verified_at = v_now,
             organizer_verification_case_id = p_case_id, updated_at = v_now
       where id = v_organizer_id;
    end if;
  elsif p_action in ('revoke', 'return_to_review') then
    if v_subject_type = 'place' then
      update public.place
         set verified = false, verified_at = null, verification_case_id = null, updated_at = v_now
       where id = v_place_id
         and (verification_case_id = p_case_id or verification_case_id is null);
    else
      update public.user_info
         set organizer_verified = false, organizer_verified_at = null,
             organizer_verification_case_id = null, updated_at = v_now
       where id = v_organizer_id
         and (organizer_verification_case_id = p_case_id or organizer_verification_case_id is null);
    end if;
  end if;

  insert into public.verification_event (case_id, actor_id, actor_kind, event_type, from_status, to_status, reason)
  values (p_case_id, p_actor_id, p_actor_kind, v_event, v_from, v_to,
          case when p_action in ('reject', 'request_info', 'revoke', 'withdraw', 'return_to_review')
               then btrim(p_reason) else null end);

  return to_jsonb(v_case);
end;
$function$;

revoke all on function public.verification_transition(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.verification_transition(uuid, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. X42: a Verified team's badge goes back to review
-- ---------------------------------------------------------------------------
-- p_reason: 'name_changed' (the team renamed itself) or 'team_conversion'
-- (an organizer badge moved to a new team under another name, or one that
-- was granted to an individual rather than a business). The badge comes
-- off at once; a reviewer approves the team as it is now, asks for papers
-- in the new name, or rejects. The team's Owners are told (the notice is
-- written to the team; trg_notification_fan_out_to_team copies it to them
-- and queues their pushes).

create or replace function public.verification_team_back_to_review(
  p_team   uuid,
  p_reason text,
  p_from   text,
  p_to     text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case uuid;
  r      record;
begin
  select id into v_case from public.verification_case
   where organizer_user_id = p_team and status = 'approved'
   limit 1;

  if v_case is null then
    -- A badge with no approved case behind it cannot be reviewed again:
    -- it simply comes off.
    update public.user_info
       set organizer_verified = false, organizer_verified_at = null,
           organizer_verification_case_id = null, updated_at = now()
     where id = p_team and organizer_verified;
    return false;
  end if;

  -- One open case per subject: anything else open is superseded.
  for r in
    select id from public.verification_case
    where organizer_user_id = p_team and id <> v_case
      and status in ('draft', 'pending_review', 'needs_info')
  loop
    perform public.verification_transition(r.id, null, 'system', 'withdraw', 'superseded', null);
  end loop;

  perform public.verification_transition(v_case, null, 'system', 'return_to_review', p_reason, 'approved');

  insert into public.verification_event (case_id, actor_kind, event_type, meta)
  values (v_case, 'system', 'subject_changed',
          jsonb_build_object('field', 'name', 'from', p_from, 'to', p_to, 'reason', p_reason));

  insert into public.notification (user_id, type, title, body, link, data)
  values (
    p_team,
    'verification_back_in_review',
    'Your Verified badge is back in review',
    'The name is now ' || coalesce(p_to, '') || ', so Abonten checks it again. The badge shows again once it is approved.',
    '/manage/verification',
    jsonb_build_object(
      'kind', 'verification',
      'verificationSubject', 'organizer',
      'notice', jsonb_build_object(
        'id', 'verification_back_in_review',
        'params', jsonb_build_object('subject', p_to)
      )
    )
  );
  return true;
end;
$$;

revoke all on function public.verification_team_back_to_review(uuid, text, text, text) from public, anon, authenticated;

drop trigger if exists team_rename_guard_verified on public.user_info;
drop function if exists public.team_rename_guard_verified();

create or replace function public.team_name_back_to_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.verification_team_back_to_review(new.id, 'name_changed', old.full_name, new.full_name);
  return null;
end;
$$;

revoke all on function public.team_name_back_to_review() from public, anon, authenticated;

drop trigger if exists team_name_back_to_review on public.user_info;
create trigger team_name_back_to_review
  after update of full_name on public.user_info
  for each row
  when (old.account_kind = 'team'
        and old.organizer_verified
        and old.full_name is distinct from new.full_name)
  execute function public.team_name_back_to_review();

-- ---------------------------------------------------------------------------
-- 5. Notices about verification go to a team's Owners
-- ---------------------------------------------------------------------------
-- As 20261116150000, plus verification_* -> verification.request (Owners;
-- before, they fell through to team.profile, also Owners only).

create or replace function public.team_notice_capability(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'place_booking_%' then 'bookings.manage'
    when p_type in ('review_received', 'review_reply') then 'reviews.reply'
    when p_type = 'message' then 'messages.reply'
    when p_type like 'content_%' then 'content.post'
    when p_type like 'refund_%' then 'refunds.issue'
    when p_type like 'payout_%' then 'payout.view'
    when p_type like 'ticket_plan_%' then 'money.view'
    when p_type like 'verification_%' then 'verification.request'
    when p_type = 'promotion_started' then 'promotions.buy'
    when p_type in (
      'promotion_credit_earned', 'milestone_reached', 'loyalty_reward',
      'reward_available', 'reward_pending', 'reward_reversed',
      'commission_pending', 'welcome_credit'
    ) then 'money.view'
    else 'team.profile'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 6. "Make this a team": organizer cases move whole; X42 on the way
-- ---------------------------------------------------------------------------
-- As 20261116170000, except: an organizer case moves with its requester (the
-- check verification_case_organizer_is_requester refused it before, so the
-- conversion failed for anyone who had ever asked for organizer
-- verification), the person is kept as requested_by; and a badge that came
-- from an individual's request, or moves under another name, goes back to
-- review.

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
-- 7. "ID checked", for a person or a team
-- ---------------------------------------------------------------------------
-- A person: their own live check while their account is active. A team: at
-- least one active Owner of the active team with a live check. A yes or no;
-- nothing from any document, and never which Owner.

create or replace function public.account_id_checked(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.account_kind = 'team' then
        u.status_id = 1 and exists (
          select 1
          from public.team t
          join public.team_member m
            on m.team_id = t.account_id and m.status = 'active' and m.role = 'owner'
          join public.user_info o on o.id = m.user_id
          where t.account_id = u.id
            and t.status = 'active'
            and o.status_id = 1
            and o.identity_verified
            and o.identity_valid_until > now()
        )
      else u.status_id = 1 and u.identity_verified and u.identity_valid_until > now()
    end
    from public.user_info u
    where u.id = p_account
  ), false);
$$;

revoke all on function public.account_id_checked(uuid) from public;
grant execute on function public.account_id_checked(uuid) to anon, authenticated, service_role;

-- The same answer as a computed column: select id_checked on a user_info
-- row (an event's organizer, a profile) through the Data API.
create or replace function public.id_checked(public.user_info)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.account_id_checked($1.id);
$$;

grant execute on function public.id_checked(public.user_info) to anon, authenticated, service_role;

-- The public profile header: as 20261023100000, with the team rule for
-- "ID checked" and whether the profile is a team (its badges then speak of
-- the team).
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
    'identity_verified', public.account_id_checked(d.user_id),
    'account_kind', coalesce(u.account_kind, 'person'),
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

-- ---------------------------------------------------------------------------
-- 8. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.verification_transition(uuid, uuid, text, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.verification_team_back_to_review(uuid, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._verification_actor_ok(uuid, uuid)', 'execute') then
    raise exception 'migration check: clients may run a verification function';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'team_rename_guard_verified') then
    raise exception 'migration check: the interim name lock is still there';
  end if;
  if not exists (select 1 from public.verification_evidence_type where key = 'director_listing') then
    raise exception 'migration check: director_listing is missing';
  end if;
  if public.team_notice_capability('verification_approved') <> 'verification.request' then
    raise exception 'migration check: verification notices do not go to Owners';
  end if;
end;
$$;
