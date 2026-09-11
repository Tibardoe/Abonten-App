-- Field Ops Phase 3: the commission ledger and the eligibility sweep.
--
-- A team lead's verification starts a holding period and records a PENDING
-- commission at the rule's amount. Nothing else happens until the sweep
-- runs: every 15 minutes it re-checks, from records the team cannot
-- fabricate, that the onboarding still deserves the money (the listing is
-- still published, unmoderated and owned by the OTP-verified owner; the
-- photos, description, contact and position are still what was claimed; no
-- older listing is the same business). Pass -> the commission is APPROVED
-- and the onboarding SUCCEEDED. Fail -> FLAGGED for an admin, or REJECTED
-- outright for a hard failure. The lead's decision is necessary, never
-- sufficient: only this function (and an admin deciding a flag) approves.
--
-- The ledger copies the credit-ledger posture: minor units, an idempotency
-- key per posting, an immutability trigger that allows only status and its
-- stamps to change, no DELETE grant even to service_role, an append-only
-- event trail, and reversal by a negative offset row rather than an edit.
-- Commission money is neither organizer money (organizer_ledger_entry) nor
-- user credit (credit_*) and never touches either.

-- ---------------------------------------------------------------------
-- fieldops_commission
-- ---------------------------------------------------------------------

create table public.fieldops_commission (
  id                      uuid        primary key default gen_random_uuid(),
  campaign_id             uuid        not null references public.fieldops_campaign (id) on delete restrict,
  team_id                 uuid        not null references public.fieldops_team (id) on delete restrict,
  member_id               uuid        not null references public.fieldops_team_member (id) on delete restrict,
  -- No FK: the financial record outlives a deleted account.
  member_user_id          uuid        not null,
  -- Exactly one earning basis, unless this row is a reversal offset.
  onboarding_id           uuid        references public.fieldops_onboarding (id) on delete restrict,
  -- Phase 6 adds fieldops_content_submission and the FK; the column exists
  -- now so the "one basis" CHECK never has to change.
  content_submission_id   uuid,
  period_start            date,
  activity_key            text        not null,
  -- The exact terms earned under, frozen at verification.
  rule_id                 uuid        references public.fieldops_commission_rule (id) on delete restrict,
  rule_version            integer,
  amount_minor            bigint      not null,
  currency                char(3)     not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  status                  text        not null default 'pending' check (status in (
                            'pending', 'approved', 'in_payout', 'paid', 'rejected', 'reversed')),
  -- onboarding:<id> | content:<id> | stipend:<member>:<yyyy-mm> | reverse:<id>
  idempotency_key         text        not null unique,
  reverses_commission_id  uuid        references public.fieldops_commission (id) on delete restrict,
  earned_at               timestamptz not null default now(),
  approved_at             timestamptz,
  -- NULL when the sweep approved it; set when an admin decided a flag.
  approved_by             uuid,
  -- Phase 4 adds fieldops_payout_item and the FK.
  payout_item_id          uuid,
  paid_at                 timestamptz,
  rejected_at             timestamptz,
  rejection_reason        text        check (rejection_reason is null or length(rejection_reason) <= 2000),
  reversed_at             timestamptz,
  reversed_by             uuid,
  reversal_reason         text        check (reversal_reason is null or length(reversal_reason) <= 2000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint fieldops_commission_one_basis check (
    reverses_commission_id is not null
    or num_nonnulls(onboarding_id, content_submission_id, period_start) = 1),
  -- An earning is never negative; an offset is never positive.
  constraint fieldops_commission_sign check (
    (reverses_commission_id is null and amount_minor >= 0)
    or (reverses_commission_id is not null and amount_minor <= 0))
);

comment on table public.fieldops_commission is
  'Field Ops: one earned commission (or one negative reversal offset). Immutable except status and its stamps; approved only by fieldops_run_eligibility_sweep or an admin deciding a flag.';

-- One live commission per onboarding (the idempotency key enforces it too;
-- this states the intent and indexes the lookup).
create unique index fieldops_commission_one_per_onboarding
  on public.fieldops_commission (onboarding_id)
  where onboarding_id is not null and reverses_commission_id is null;

create index idx_fieldops_commission_campaign on public.fieldops_commission (campaign_id, status, earned_at desc);
create index idx_fieldops_commission_member on public.fieldops_commission (member_id, status);
create index idx_fieldops_commission_member_user on public.fieldops_commission (member_user_id, status);
create index idx_fieldops_commission_team on public.fieldops_commission (team_id, status);
create index idx_fieldops_commission_rule on public.fieldops_commission (rule_id);
create index idx_fieldops_commission_reverses on public.fieldops_commission (reverses_commission_id);
create index idx_fieldops_commission_payout_item on public.fieldops_commission (payout_item_id);
create index idx_fieldops_commission_onboarding on public.fieldops_commission (onboarding_id);

create trigger fieldops_commission_touch before update on public.fieldops_commission
  for each row execute function public.fieldops_touch_updated_at();

-- Only status and its stamps may change, and only along the lifecycle.
create function public.fieldops_commission_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable text[] := array[
    'status', 'approved_at', 'approved_by', 'payout_item_id', 'paid_at',
    'rejected_at', 'rejection_reason', 'reversed_at', 'reversed_by',
    'reversal_reason', 'updated_at'];
  v_allowed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'fieldops_commission rows cannot be deleted; reverse them instead'
      using errcode = 'insufficient_privilege';
  end if;

  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'fieldops_commission rows are immutable except their status'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'pending'   then new.status in ('approved', 'rejected')
      when 'approved'  then new.status in ('in_payout', 'rejected', 'reversed')
      when 'in_payout' then new.status in ('paid', 'approved', 'reversed')
      when 'paid'      then new.status in ('reversed')
      else false
    end;
    if not v_allowed then
      raise exception 'A commission that is % cannot move to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.fieldops_commission_guard() from public, anon, authenticated;

create trigger fieldops_commission_immutable
  before update or delete on public.fieldops_commission
  for each row execute function public.fieldops_commission_guard();

-- ---------------------------------------------------------------------
-- fieldops_commission_event: append-only status trail
-- ---------------------------------------------------------------------

create table public.fieldops_commission_event (
  id             bigint      generated always as identity primary key,
  commission_id  uuid        not null references public.fieldops_commission (id) on delete restrict,
  from_status    text,
  to_status      text        not null,
  actor_user_id  uuid,
  actor_kind     text        not null check (actor_kind in ('system', 'lead', 'admin')),
  reason         text        check (reason is null or length(reason) <= 2000),
  details        jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index idx_fieldops_commission_event_commission on public.fieldops_commission_event (commission_id, id);

create function public.fieldops_commission_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'fieldops_commission_event is append-only' using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.fieldops_commission_event_guard() from public, anon, authenticated;

create trigger fieldops_commission_event_append_only
  before update or delete on public.fieldops_commission_event
  for each row execute function public.fieldops_commission_event_guard();

-- ---------------------------------------------------------------------
-- fieldops_job_run: one row per sweep / housekeeping run, so health can
-- see lag and failures without a separate outbox.
-- ---------------------------------------------------------------------

create table public.fieldops_job_run (
  id           bigint      generated always as identity primary key,
  job          text        not null check (job in ('eligibility_sweep', 'housekeeping')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  processed    integer     not null default 0,
  succeeded    integer     not null default 0,
  flagged      integer     not null default 0,
  rejected     integer     not null default 0,
  failed       integer     not null default 0,
  details      jsonb       not null default '{}'::jsonb,
  last_error   text
);

create index idx_fieldops_job_run_job on public.fieldops_job_run (job, started_at desc);

-- ---------------------------------------------------------------------
-- Notifications written from SQL (the sweep has no service layer above it)
-- ---------------------------------------------------------------------

create function public._fieldops_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_route text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification (user_id, type, title, body, link, data)
  select p_user_id, p_type, p_title, p_body, p_route,
         jsonb_build_object('kind', 'fieldops', 'fieldOpsRoute', p_route)
  where p_user_id is not null;
$$;

-- ---------------------------------------------------------------------
-- fieldops_evaluate_onboarding: THE objective checks (plan §8.2). The
-- TypeScript copy in @abonten/core/fieldOps/eligibility drives the review
-- checklist; this one moves the money, so it is the authority. Returns
-- { hard: [...], soft: [...], pass, details }.
-- ---------------------------------------------------------------------

create function public.fieldops_evaluate_onboarding(p_onboarding_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o            public.fieldops_onboarding;
  s            public.fieldops_program_setting;
  v_rule       public.fieldops_commission_rule;
  v_elig       jsonb := '{}'::jsonb;
  v_place      public.place;
  v_hard       text[] := '{}';
  v_soft       text[] := '{}';
  v_details    jsonb := '{}'::jsonb;
  v_photos     integer := 0;
  v_hours      integer := 0;
  v_owner_ok   boolean;
  v_dup        boolean := false;
  v_dup_of     uuid;
  v_lat        double precision;
  v_lng        double precision;
  v_radius     integer;
  v_simthresh  numeric;
  v_min_photos integer;
  v_min_chars  integer;
  v_max_dist   integer;
  v_allowance  integer;
begin
  select * into o from public.fieldops_onboarding where id = p_onboarding_id;
  if o.id is null then
    raise exception 'Onboarding not found' using errcode = 'P0002';
  end if;
  select * into s from public.fieldops_program_setting where id = 1;

  if o.rule_id is not null then
    select * into v_rule from public.fieldops_commission_rule where id = o.rule_id;
    v_elig := coalesce(v_rule.eligibility, '{}'::jsonb);
  end if;

  v_radius     := coalesce(s.duplicate_radius_m, 300);
  v_simthresh  := greatest(coalesce(s.duplicate_name_similarity, 0.45), 0.6);
  v_min_photos := coalesce((v_elig ->> 'min_photos')::integer, 2);
  v_min_chars  := coalesce((v_elig ->> 'min_description_chars')::integer, 80);
  v_max_dist   := coalesce((v_elig ->> 'max_distance_m')::integer, s.offline_max_distance_m, 200);

  -- 1. Owner: a real, phone-verified account that is not on any team.
  if coalesce((v_elig ->> 'require_owner_phone_verified')::boolean, true) then
    select o.owner_user_id is not null and u.phone_confirmed_at is not null
      into v_owner_ok
    from auth.users u where u.id = o.owner_user_id;
    if not coalesce(v_owner_ok, false) then
      v_hard := v_hard || 'owner_verified';
    end if;
  end if;
  if o.owner_phone_e164 is not null
     and public.fieldops_phone_belongs_to_member(o.owner_phone_e164) then
    v_hard := v_hard || 'owner_not_member';
  end if;

  -- 2. The entity is still a live listing owned by that owner.
  if o.place_id is null then
    v_hard := v_hard || 'place_published';
  else
    select * into v_place from public.place where id = o.place_id;
    if v_place.id is null then
      v_hard := v_hard || 'place_published';
    else
      if v_place.status <> 'published' then
        v_hard := v_hard || 'place_published';
      end if;
      if coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed') then
        v_hard := v_hard || 'place_not_moderated';
      end if;
      if v_place.owner_id is distinct from o.owner_user_id then
        v_hard := v_hard || 'owner_matches';
      end if;
      if v_place.client_request_id is distinct from o.client_request_id then
        v_hard := v_hard || 'entity_not_from_this_onboarding';
      end if;

      -- 3. Completeness.
      select count(*) into v_photos from public.place_photo ph where ph.place_id = v_place.id;
      v_photos := v_photos + 1; -- the cover
      if v_photos < v_min_photos then v_soft := v_soft || 'photos'; end if;
      if length(coalesce(v_place.description, '')) < v_min_chars then
        v_soft := v_soft || 'description';
      end if;
      if v_place.category_id is null then v_soft := v_soft || 'category'; end if;
      if coalesce((v_elig ->> 'require_contact')::boolean, true)
         and v_place.phone is null and v_place.whatsapp is null then
        v_soft := v_soft || 'contact';
      end if;
      if coalesce((v_elig ->> 'require_opening_hours')::boolean, true) then
        select count(*) into v_hours from public.place_opening_hours h where h.place_id = v_place.id;
        if v_hours = 0 then v_soft := v_soft || 'opening_hours'; end if;
      end if;

      -- 4. Not a duplicate of an OLDER listing (re-run now, not the
      -- snapshot the member saw: a match may have appeared since).
      v_lat := extensions.st_y(v_place.location::extensions.geometry);
      v_lng := extensions.st_x(v_place.location::extensions.geometry);
      select f.id into v_dup_of
      from public.fieldops_find_similar_places(
             v_place.name, v_lat, v_lng, v_place.phone, v_place.whatsapp,
             v_radius, coalesce(s.duplicate_name_similarity, 0.45), 25) f
      join public.place p2 on p2.id = f.id
      where f.id <> v_place.id
        and p2.created_at < v_place.created_at
        and (f.phone_match or (f.distance_m <= v_radius and f.similarity >= v_simthresh))
      limit 1;
      if v_dup_of is not null then
        v_dup := true;
        v_soft := v_soft || 'not_duplicate';
        v_details := v_details || jsonb_build_object('duplicate_of', v_dup_of);
      end if;
    end if;
  end if;

  -- 5. Location.
  if coalesce((v_elig ->> 'require_inside_territory')::boolean, true)
     and o.territory_id is not null
     and o.inside_territory is not true then
    v_soft := v_soft || 'inside_territory';
  end if;
  if o.mode = 'offline' then
    v_allowance := least(coalesce(o.submission_accuracy_m, 0), 100);
    if o.submission_distance_m is null
       or o.submission_distance_m > v_max_dist + v_allowance then
      v_soft := v_soft || 'on_site';
    end if;
  end if;

  -- 6. The lead's verification.
  if o.status not in ('verified', 'flagged', 'succeeded') then
    v_hard := v_hard || 'lead_verified';
  end if;

  return jsonb_build_object(
    'hard', to_jsonb(v_hard),
    'soft', to_jsonb(v_soft),
    'pass', cardinality(v_hard) = 0 and cardinality(v_soft) = 0,
    'details', v_details || jsonb_build_object(
      'photos', v_photos,
      'description_chars', length(coalesce(v_place.description, '')),
      'duplicate', v_dup,
      'submission_distance_m', o.submission_distance_m,
      'inside_territory', o.inside_territory)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_record_pending_commission: called by the lead's verification
-- (and defensively by the sweep). Idempotent on the onboarding.
-- ---------------------------------------------------------------------

create function public.fieldops_record_pending_commission(p_onboarding_id uuid)
returns public.fieldops_commission
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.fieldops_onboarding;
  v_rule     public.fieldops_commission_rule;
  v_row      public.fieldops_commission;
  s          public.fieldops_program_setting;
begin
  select * into o from public.fieldops_onboarding where id = p_onboarding_id for update;
  if o.id is null then
    raise exception 'Onboarding not found' using errcode = 'P0002';
  end if;

  select * into v_row from public.fieldops_commission
  where onboarding_id = o.id and reverses_commission_id is null;
  if v_row.id is not null then
    return v_row;
  end if;

  if o.status not in ('verified', 'flagged') then
    raise exception 'Only a verified onboarding earns a commission' using errcode = 'check_violation';
  end if;
  if o.rule_id is null then
    -- Verified while no rule was live: nothing is payable, and nothing is
    -- silently invented later. The sweep records this as a flag.
    return null;
  end if;

  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.commission_generation_enabled, false) then
    return null;
  end if;

  select * into v_rule from public.fieldops_commission_rule where id = o.rule_id;

  insert into public.fieldops_commission (
    campaign_id, team_id, member_id, member_user_id, onboarding_id, activity_key,
    rule_id, rule_version, amount_minor, currency, status, idempotency_key, earned_at)
  values (
    o.campaign_id, o.team_id, o.member_id, o.member_user_id, o.id,
    coalesce(o.activity_key, v_rule.activity_key),
    v_rule.id, v_rule.version, v_rule.amount_minor, v_rule.currency,
    'pending', 'onboarding:' || o.id::text, coalesce(o.reviewed_at, now()))
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.fieldops_commission
    where idempotency_key = 'onboarding:' || o.id::text;
    return v_row;
  end if;

  insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_user_id, actor_kind, reason, details)
  values (v_row.id, null, 'pending', o.reviewed_by, 'lead', 'Verified by the team lead',
          jsonb_build_object('rule_id', v_rule.id, 'rule_version', v_rule.version,
                             'holding_until', o.holding_until));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- The sweep. Every 15 minutes: verified onboardings whose holding period
-- has elapsed get every objective check re-run.
-- ---------------------------------------------------------------------

create function public.fieldops_run_eligibility_sweep(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.fieldops_program_setting;
  v_run_id     bigint;
  o            record;
  v_eval       jsonb;
  v_hard       text[];
  v_soft       text[];
  v_comm       public.fieldops_commission;
  v_rule       public.fieldops_commission_rule;
  v_policy     text;
  v_processed  integer := 0;
  v_succeeded  integer := 0;
  v_flagged    integer := 0;
  v_rejected   integer := 0;
  v_failed     integer := 0;
  v_committed  bigint;
  v_cap        bigint;
  v_spot       boolean;
  v_flag       text;
  v_last_error text;
begin
  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.program_enabled, false)
     or not coalesce(s.commission_generation_enabled, false) then
    return jsonb_build_object('skipped', true, 'reason', 'programme off');
  end if;

  insert into public.fieldops_job_run (job) values ('eligibility_sweep') returning id into v_run_id;

  for o in
    select ob.id, ob.campaign_id, ob.member_user_id, ob.business_name, ob.team_id,
           ob.rule_id, ob.flags, ob.reviewed_by
    from public.fieldops_onboarding ob
    join public.fieldops_campaign c on c.id = ob.campaign_id
    where ob.status = 'verified'
      and ob.holding_until is not null
      and ob.holding_until <= now()
      and c.status in ('active', 'winding_down', 'completed')
      and not (ob.flags && array['awaiting_release_policy'])
    order by ob.holding_until
    limit greatest(1, least(p_limit, 2000))
    for update of ob skip locked
  loop
    begin
      v_processed := v_processed + 1;

      -- Phases 5/6 own the other release policies; until then such a row
      -- is parked with a flag rather than paid on a holding period.
      v_policy := 'holding_period';
      if o.rule_id is not null then
        select * into v_rule from public.fieldops_commission_rule where id = o.rule_id;
        v_policy := coalesce(v_rule.eligibility ->> 'release_policy', 'holding_period');
      end if;
      if v_policy <> 'holding_period' then
        update public.fieldops_onboarding
        set flags = array(select distinct unnest(flags || 'awaiting_release_policy')),
            flag_details = flag_details || jsonb_build_object('release_policy', v_policy)
        where id = o.id;
        continue;
      end if;

      -- The commission exists from verification; create it if the row was
      -- verified before this phase shipped.
      v_comm := public.fieldops_record_pending_commission(o.id);

      v_eval := public.fieldops_evaluate_onboarding(o.id);
      v_hard := array(select jsonb_array_elements_text(v_eval -> 'hard'));
      v_soft := array(select jsonb_array_elements_text(v_eval -> 'soft'));

      if cardinality(v_hard) > 0 then
        -- Hard failure: the record itself no longer supports the claim.
        perform public.fieldops_transition_onboarding(
          o.id, 'rejected', null, 'system',
          'Automatic check failed: ' || array_to_string(v_hard, ', '),
          v_eval);
        update public.fieldops_onboarding
        set flags = array(select distinct unnest(flags || v_hard)),
            flag_details = flag_details || (v_eval -> 'details')
        where id = o.id;
        if v_comm.id is not null and v_comm.status = 'pending' then
          update public.fieldops_commission
          set status = 'rejected', rejected_at = now(),
              rejection_reason = 'Automatic check failed: ' || array_to_string(v_hard, ', ')
          where id = v_comm.id;
          insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_kind, reason, details)
          values (v_comm.id, 'pending', 'rejected', 'system', 'Eligibility sweep', v_eval);
        end if;
        v_rejected := v_rejected + 1;
        perform public._fieldops_notify(o.member_user_id, 'fieldops_submission_reviewed',
          'Not eligible: ' || coalesce(o.business_name, 'your onboarding'),
          'An automatic check after the holding period did not pass. Open it to see why.',
          '/field/submissions/' || o.id::text);
        continue;
      end if;

      if v_comm.id is null then
        -- Verified while nothing was live to pay. An admin decides.
        update public.fieldops_onboarding
        set flags = array(select distinct unnest(flags || 'no_rule')),
            flag_details = flag_details || (v_eval -> 'details')
        where id = o.id;
        perform public.fieldops_transition_onboarding(
          o.id, 'flagged', null, 'system', 'No commission rule was live at verification', v_eval);
        v_flagged := v_flagged + 1;
        continue;
      end if;

      -- Budget: leave it pending rather than approving over the cap.
      select c.budget_cap_minor into v_cap from public.fieldops_campaign c where c.id = o.campaign_id;
      if v_cap is not null then
        select coalesce(sum(amount_minor), 0) into v_committed
        from public.fieldops_commission
        where campaign_id = o.campaign_id
          and status in ('approved', 'in_payout', 'paid');
        if v_committed + v_comm.amount_minor > v_cap then
          update public.fieldops_onboarding
          set flags = array(select distinct unnest(flags || 'budget_exhausted')),
              flag_details = flag_details || jsonb_build_object(
                'budget_cap_minor', v_cap, 'committed_minor', v_committed)
          where id = o.id;
          continue;
        end if;
      end if;

      -- Soft failure or a spot-check sample: an admin looks first.
      v_spot := coalesce(s.spot_check_bps, 0) > 0
                and (abs(hashtext(o.id::text)) % 10000) < coalesce(s.spot_check_bps, 0);
      if cardinality(v_soft) > 0 or v_spot then
        v_flag := case when cardinality(v_soft) > 0 then 'eligibility' else 'spot_check' end;
        update public.fieldops_onboarding
        set flags = array(select distinct unnest(flags || v_soft || v_flag)),
            flag_details = flag_details || (v_eval -> 'details')
        where id = o.id;
        perform public.fieldops_transition_onboarding(
          o.id, 'flagged', null, 'system',
          case when cardinality(v_soft) > 0
               then 'Checks to review: ' || array_to_string(v_soft, ', ')
               else 'Routine spot check' end,
          v_eval);
        v_flagged := v_flagged + 1;
        -- The lead sees it; the member is not told a flag exists.
        perform public._fieldops_notify(m.user_id, 'fieldops_flag_raised',
          'Needs a look: ' || coalesce(o.business_name, 'an onboarding'),
          'An automatic check flagged this submission for an admin.',
          '/field/lead/review/' || o.id::text)
        from public.fieldops_team_member m
        where m.team_id = o.team_id and m.role = 'team_lead' and m.status = 'active'
          and m.user_id is not null;
        continue;
      end if;

      -- Everything holds: the money is earned.
      perform public.fieldops_transition_onboarding(o.id, 'succeeded', null, 'system', null, v_eval);
      update public.fieldops_commission
      set status = 'approved', approved_at = now(), approved_by = null
      where id = v_comm.id and status = 'pending';
      insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_kind, reason, details)
      values (v_comm.id, 'pending', 'approved', 'system', 'Eligibility sweep passed', v_eval);
      v_succeeded := v_succeeded + 1;
      perform public._fieldops_notify(o.member_user_id, 'fieldops_commission_approved',
        'Confirmed: ' || coalesce(o.business_name, 'your onboarding'),
        'Your commission is confirmed and waiting for the next payout.',
        '/field/earnings');
    exception when others then
      v_failed := v_failed + 1;
      v_last_error := sqlerrm;
    end;
  end loop;

  update public.fieldops_job_run
  set finished_at = now(), processed = v_processed, succeeded = v_succeeded,
      flagged = v_flagged, rejected = v_rejected, failed = v_failed,
      last_error = v_last_error
  where id = v_run_id;

  return jsonb_build_object(
    'processed', v_processed, 'succeeded', v_succeeded, 'flagged', v_flagged,
    'rejected', v_rejected, 'failed', v_failed);
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_decide_flag: an admin resolves a flagged onboarding.
-- ---------------------------------------------------------------------

create function public.fieldops_decide_flag(
  p_onboarding_id uuid,
  p_admin uuid,
  p_decision text,
  p_note text default null
)
returns public.fieldops_onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  o      public.fieldops_onboarding;
  v_comm public.fieldops_commission;
begin
  if p_decision not in ('succeeded', 'rejected') then
    raise exception 'Decide a flag as succeeded or rejected' using errcode = 'check_violation';
  end if;
  select * into o from public.fieldops_onboarding where id = p_onboarding_id for update;
  if o.id is null then
    raise exception 'Onboarding not found' using errcode = 'P0002';
  end if;
  if o.status <> 'flagged' then
    raise exception 'This onboarding is not flagged' using errcode = 'check_violation';
  end if;
  if p_admin is not null and p_admin = o.reviewed_by then
    raise exception 'The admin who verified it cannot also decide its flag'
      using errcode = 'check_violation';
  end if;
  if p_decision = 'rejected' and coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'A rejection needs a reason' using errcode = 'check_violation';
  end if;

  select * into v_comm from public.fieldops_commission
  where onboarding_id = o.id and reverses_commission_id is null;

  select * into o from public.fieldops_transition_onboarding(
    p_onboarding_id, p_decision, p_admin, 'admin', p_note, '{}'::jsonb);

  if v_comm.id is not null and v_comm.status = 'pending' then
    if p_decision = 'succeeded' then
      update public.fieldops_commission
      set status = 'approved', approved_at = now(), approved_by = p_admin
      where id = v_comm.id;
      insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
      values (v_comm.id, 'pending', 'approved', p_admin, 'admin', p_note);
    else
      update public.fieldops_commission
      set status = 'rejected', rejected_at = now(), rejection_reason = p_note
      where id = v_comm.id;
      insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
      values (v_comm.id, 'pending', 'rejected', p_admin, 'admin', p_note);
    end if;
  end if;

  perform public._fieldops_notify(o.member_user_id, 'fieldops_submission_reviewed',
    case when p_decision = 'succeeded'
         then 'Confirmed: ' || coalesce(o.business_name, 'your onboarding')
         else 'Not accepted: ' || coalesce(o.business_name, 'your onboarding') end,
    case when p_decision = 'succeeded'
         then 'Your commission is confirmed and waiting for the next payout.'
         else p_note end,
    case when p_decision = 'succeeded' then '/field/earnings'
         else '/field/submissions/' || o.id::text end);

  return o;
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_reverse_commission: money already committed is taken back by
-- appending a negative offset, never by editing the original row.
-- ---------------------------------------------------------------------

create function public.fieldops_reverse_commission(
  p_commission_id uuid,
  p_admin uuid,
  p_reason text
)
returns public.fieldops_commission
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.fieldops_commission;
  v_was   text;
  v_off   public.fieldops_commission;
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'A reversal needs a reason' using errcode = 'check_violation';
  end if;
  select * into c from public.fieldops_commission where id = p_commission_id for update;
  if c.id is null then
    raise exception 'Commission not found' using errcode = 'P0002';
  end if;
  if c.reverses_commission_id is not null then
    raise exception 'A reversal offset cannot itself be reversed' using errcode = 'check_violation';
  end if;
  if c.status not in ('approved', 'in_payout', 'paid') then
    raise exception 'A commission that is % cannot be reversed', c.status
      using errcode = 'check_violation';
  end if;
  v_was := c.status;

  -- Money that actually left keeps its paid row and gets a negative offset
  -- beside it, so the payout reconciliation still balances.
  if v_was = 'paid' then
    insert into public.fieldops_commission (
      campaign_id, team_id, member_id, member_user_id, activity_key, rule_id, rule_version,
      amount_minor, currency, status, idempotency_key, reverses_commission_id,
      earned_at, paid_at, reversed_by, reversal_reason)
    values (
      c.campaign_id, c.team_id, c.member_id, c.member_user_id, c.activity_key,
      c.rule_id, c.rule_version, -c.amount_minor, c.currency, 'paid',
      'reverse:' || c.id::text, c.id, now(), now(), p_admin, p_reason)
    on conflict (idempotency_key) do nothing
    returning * into v_off;
  end if;

  update public.fieldops_commission
  set status = 'reversed', reversed_at = now(), reversed_by = p_admin, reversal_reason = p_reason
  where id = c.id
  returning * into c;

  insert into public.fieldops_commission_event (commission_id, from_status, to_status, actor_user_id, actor_kind, reason, details)
  values (c.id, v_was, 'reversed', p_admin, 'admin', p_reason,
          jsonb_build_object('offset_commission_id', v_off.id));

  if c.onboarding_id is not null then
    update public.fieldops_onboarding
    set flags = array(select distinct unnest(flags || 'reversed'))
    where id = c.onboarding_id;
  end if;

  return c;
end;
$$;

-- ---------------------------------------------------------------------
-- Housekeeping (daily): close reviews left open after a campaign ended,
-- purge the evidence of rejected/withdrawn onboardings past retention.
-- ---------------------------------------------------------------------

create function public.fieldops_run_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.fieldops_program_setting;
  v_run_id   bigint;
  o          record;
  v_closed   integer := 0;
  v_purged   integer := 0;
begin
  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.program_enabled, false) then
    return jsonb_build_object('skipped', true, 'reason', 'programme off');
  end if;

  insert into public.fieldops_job_run (job) values ('housekeeping') returning id into v_run_id;

  -- Reviews still waiting after a completed campaign's grace period.
  for o in
    select ob.id
    from public.fieldops_onboarding ob
    join public.fieldops_campaign c on c.id = ob.campaign_id
    where ob.status in ('submitted', 'needs_changes')
      and c.status in ('completed', 'archived')
      and c.completed_at is not null
      and c.completed_at < now() - make_interval(days => coalesce(s.review_grace_days, 14))
    limit 500
  loop
    perform public.fieldops_transition_onboarding(
      o.id, 'rejected', null, 'system', 'The campaign closed before this was reviewed', '{}'::jsonb);
    v_closed := v_closed + 1;
  end loop;

  -- Evidence metadata of rejected/withdrawn work past retention. The
  -- storage objects themselves are removed by the service that reads this
  -- list (Storage has no SQL delete); the row is marked so it is not
  -- offered again.
  select count(*) into v_purged
  from public.fieldops_onboarding_evidence e
  join public.fieldops_onboarding ob on ob.id = e.onboarding_id
  where ob.status in ('rejected', 'withdrawn')
    and e.created_at < now() - make_interval(days => coalesce(s.evidence_retention_days, 365));

  update public.fieldops_job_run
  set finished_at = now(), processed = v_closed, details = jsonb_build_object(
        'reviews_closed', v_closed, 'evidence_due_for_purge', v_purged)
  where id = v_run_id;

  return jsonb_build_object('reviews_closed', v_closed, 'evidence_due_for_purge', v_purged);
end;
$$;

-- ---------------------------------------------------------------------
-- Health + reconciliation
-- ---------------------------------------------------------------------

create function public.fieldops_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select s.program_enabled from public.fieldops_program_setting s where s.id = 1), false),
    'sweep_lag_seconds', coalesce((
      select extract(epoch from now() - max(j.finished_at))::integer
      from public.fieldops_job_run j where j.job = 'eligibility_sweep' and j.finished_at is not null), 0),
    'sweep_failures', coalesce((
      select j.failed from public.fieldops_job_run j
      where j.job = 'eligibility_sweep' and j.finished_at is not null
      order by j.started_at desc limit 1), 0),
    'due_not_swept', (
      select count(*) from public.fieldops_onboarding ob
      join public.fieldops_campaign c on c.id = ob.campaign_id
      where ob.status = 'verified' and ob.holding_until < now() - interval '1 hour'
        and c.status in ('active', 'winding_down', 'completed')
        and not (ob.flags && array['awaiting_release_policy', 'budget_exhausted'])),
    'stuck_reviews', (
      select count(*) from public.fieldops_onboarding
      where status = 'submitted' and submitted_at < now() - interval '3 days'),
    'stale_flags', (
      select count(*) from public.fieldops_onboarding
      where status = 'flagged' and updated_at < now() - interval '7 days'),
    'succeeded_without_commission', (
      select count(*) from public.fieldops_onboarding ob
      where ob.status = 'succeeded'
        and not exists (select 1 from public.fieldops_commission c
                        where c.onboarding_id = ob.id and c.reverses_commission_id is null)),
    'approved_without_rule', (
      select count(*) from public.fieldops_commission
      where status in ('approved', 'in_payout', 'paid')
        and reverses_commission_id is null and rule_id is null),
    'pending_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'pending'), 0),
    'approved_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'approved'), 0)
  );
$$;


-- The app-push queue already covers review and cancellation notices; the
-- two Field Ops types the sweep writes join them so a worker's phone rings
-- when their money is confirmed. (Listed in the module removal checklist.)
drop trigger if exists trg_notification_queue_app_push on public.notification;
create trigger trg_notification_queue_app_push
  after insert on public.notification
  for each row when (new.type in (
    'review_received', 'event_cancelled',
    'fieldops_commission_approved', 'fieldops_commission_paid'))
  execute function public._notification_queue_app_push();

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------

alter table public.fieldops_commission enable row level security;
alter table public.fieldops_commission_event enable row level security;
alter table public.fieldops_job_run enable row level security;

revoke all on table
  public.fieldops_commission, public.fieldops_commission_event, public.fieldops_job_run
  from anon, authenticated;

-- No DELETE even for service_role: reverse, never erase.
grant select, insert, update on table public.fieldops_commission to service_role;
grant select, insert on table public.fieldops_commission_event to service_role;
grant all on table public.fieldops_job_run to service_role;
grant usage, select on sequence public.fieldops_commission_event_id_seq to service_role;
grant usage, select on sequence public.fieldops_job_run_id_seq to service_role;

-- A member reads their own commissions; a lead reads their team's, without
-- the payout plumbing columns.
grant select (id, campaign_id, team_id, member_id, member_user_id, onboarding_id,
              activity_key, rule_version, amount_minor, currency, status,
              reverses_commission_id, earned_at, approved_at, paid_at,
              rejected_at, rejection_reason, reversed_at, reversal_reason,
              created_at, updated_at)
  on public.fieldops_commission to authenticated;

create policy fieldops_commission_self_or_lead_select on public.fieldops_commission
  for select to authenticated
  using (member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(team_id));

grant select on table public.fieldops_commission_event to authenticated;

create policy fieldops_commission_event_select on public.fieldops_commission_event
  for select to authenticated
  using (exists (
    select 1 from public.fieldops_commission c
    where c.id = fieldops_commission_event.commission_id
      and (c.member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(c.team_id))));

create policy service_role_only on public.fieldops_job_run
  for all to service_role using (true) with check (true);

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fieldops_evaluate_onboarding(uuid)',
    'public.fieldops_record_pending_commission(uuid)',
    'public.fieldops_run_eligibility_sweep(integer)',
    'public.fieldops_decide_flag(uuid, uuid, text, text)',
    'public.fieldops_reverse_commission(uuid, uuid, text)',
    'public.fieldops_run_housekeeping()',
    'public.fieldops_health()',
    'public._fieldops_notify(uuid, text, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Jobs. Both are no-ops while the programme is switched off.
-- ---------------------------------------------------------------------

select cron.unschedule('fieldops-eligibility-sweep')
where exists (select 1 from cron.job where jobname = 'fieldops-eligibility-sweep');
select cron.unschedule('fieldops-housekeeping')
where exists (select 1 from cron.job where jobname = 'fieldops-housekeeping');

select cron.schedule('fieldops-eligibility-sweep', '*/15 * * * *',
  $cron$select public.fieldops_run_eligibility_sweep(200);$cron$);
select cron.schedule('fieldops-housekeeping', '25 2 * * *',
  $cron$select public.fieldops_run_housekeeping();$cron$);

-- Rollback: unschedule the two jobs, drop the three tables and the seven
-- functions, restore run_financial_reconciliation and the app-push trigger
-- to their 20260911163306 / 20260910193728 definitions.
