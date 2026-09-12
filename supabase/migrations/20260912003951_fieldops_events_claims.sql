-- Field Ops Phase 5: events, and helping an owner claim a listing that is
-- already on Abonten.
--
-- Both pay on something other than a plain holding period, which Phase 3
-- parked with an `awaiting_release_policy` flag. That parking is now
-- replaced by the real gates:
--
--   * event_onboarding_*  -> release_policy `event_started`: the commission
--     is only earned once the event has actually started and was neither
--     cancelled nor moderated away. A flyer that never happens pays nothing.
--   * existing_place_claim_assist -> release_policy `claim_approved`: the
--     member files the claim on the owner's behalf and is paid only when an
--     admin approves it through the existing Claims module. A pending claim
--     simply waits; a rejected one rejects the onboarding.
--
-- The completeness checks (photos, description, opening hours) belong to a
-- listing the team created. A claim assist touches someone else's listing,
-- so those are skipped -- what matters there is that the claim was real and
-- was approved.

-- ---------------------------------------------------------------------
-- The claim an onboarding filed, when it is a claim assist.
-- ---------------------------------------------------------------------

alter table public.fieldops_onboarding
  add column claim_request_id uuid references public.place_claim_request (id) on delete set null;

create index idx_fieldops_onboarding_claim on public.fieldops_onboarding (claim_request_id)
  where claim_request_id is not null;

-- A claim assist points at a listing the team did NOT create, so the
-- "onboarded once" index must not stop a later, genuine onboarding of a
-- different business -- but it must still stop two members claiming the
-- same listing. The existing partial unique on place_id already does that.

comment on column public.fieldops_onboarding.claim_request_id is
  'Claim assist: the place_claim_request this onboarding filed for the owner. The commission is earned when an admin approves it.';

-- ---------------------------------------------------------------------
-- Someone disputing a listing the team onboarded is worth a human look.
-- ---------------------------------------------------------------------

create function public.fieldops_flag_on_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a claim by someone OTHER than the onboarding's own owner, and only
  -- on a listing Field Ops is still being paid for.
  update public.fieldops_onboarding ob
  set flags = array(select distinct unnest(array_append(ob.flags, 'ownership_disputed'))),
      flag_details = ob.flag_details || jsonb_build_object(
        'claim_request_id', new.id, 'claimant_id', new.claimant_id)
  where ob.place_id = new.place_id
    and ob.status in ('submitted', 'verified', 'flagged', 'succeeded')
    and ob.owner_user_id is distinct from new.claimant_id
    and ob.claim_request_id is distinct from new.id;
  return null;
end;
$$;

revoke execute on function public.fieldops_flag_on_claim() from public, anon, authenticated;

create trigger fieldops_flag_on_claim_insert
  after insert on public.place_claim_request
  for each row execute function public.fieldops_flag_on_claim();

-- ---------------------------------------------------------------------
-- The evaluator learns about events and claim assists.
-- ---------------------------------------------------------------------

create or replace function public.fieldops_evaluate_onboarding(p_onboarding_id uuid)
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
  v_event      public.event;
  v_claim      public.place_claim_request;
  v_policy     text := 'holding_period';
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
  v_min_days   integer;
begin
  select * into o from public.fieldops_onboarding where id = p_onboarding_id;
  if o.id is null then
    raise exception 'Onboarding not found' using errcode = 'P0002';
  end if;
  select * into s from public.fieldops_program_setting where id = 1;

  if o.rule_id is not null then
    select * into v_rule from public.fieldops_commission_rule where id = o.rule_id;
    v_elig := coalesce(v_rule.eligibility, '{}'::jsonb);
    v_policy := coalesce(v_elig ->> 'release_policy', 'holding_period');
  end if;

  v_radius     := coalesce(s.duplicate_radius_m, 300);
  v_simthresh  := greatest(coalesce(s.duplicate_name_similarity, 0.45), 0.6);
  v_min_photos := coalesce((v_elig ->> 'min_photos')::integer, 2);
  v_min_chars  := coalesce((v_elig ->> 'min_description_chars')::integer, 80);
  v_max_dist   := coalesce((v_elig ->> 'max_distance_m')::integer, s.offline_max_distance_m, 200);
  v_min_days   := coalesce((v_elig ->> 'min_days_before_start')::integer, 0);

  -- 1. Owner: a real, phone-verified account that is not on any team.
  -- True for every activity: it is what makes the work verifiable at all.
  if coalesce((v_elig ->> 'require_owner_phone_verified')::boolean, true) then
    select o.owner_user_id is not null and u.phone_confirmed_at is not null
      into v_owner_ok
    from auth.users u where u.id = o.owner_user_id;
    if not coalesce(v_owner_ok, false) then
      v_hard := array_append(v_hard, 'owner_verified');
    end if;
  end if;
  if o.owner_phone_e164 is not null
     and public.fieldops_phone_belongs_to_member(o.owner_phone_e164) then
    v_hard := array_append(v_hard, 'owner_not_member');
  end if;

  -- 2. The entity, by activity.
  if o.activity_key = 'existing_place_claim_assist' then
    -- The listing is someone else's work; what the member is paid for is
    -- getting the real owner verified and their claim approved.
    if o.claim_request_id is null then
      v_hard := array_append(v_hard, 'claim_filed');
    else
      select * into v_claim from public.place_claim_request where id = o.claim_request_id;
      if v_claim.id is null or v_claim.status = 'rejected' then
        v_hard := array_append(v_hard, 'claim_approved');
      elsif v_claim.status <> 'approved' then
        -- Still waiting on an admin; not a failure, just not due yet.
        v_soft := array_append(v_soft, 'claim_pending');
      end if;
      if v_claim.id is not null
         and v_claim.claimant_id is distinct from o.owner_user_id then
        v_hard := array_append(v_hard, 'claim_is_for_the_owner');
      end if;
    end if;
    if o.place_id is null then
      v_hard := array_append(v_hard, 'place_published');
    else
      select * into v_place from public.place where id = o.place_id;
      if v_place.id is null or v_place.status <> 'published' then
        v_hard := array_append(v_hard, 'place_published');
      end if;
      if coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed') then
        v_hard := array_append(v_hard, 'place_not_moderated');
      end if;
      -- After an approved claim the listing really is theirs.
      if v_claim.status = 'approved'
         and v_place.owner_id is distinct from o.owner_user_id then
        v_hard := array_append(v_hard, 'owner_matches');
      end if;
    end if;

  elsif o.kind = 'event' then
    if o.event_id is null then
      v_hard := array_append(v_hard, 'event_published');
    else
      select * into v_event from public.event where id = o.event_id;
      if v_event.id is null then
        v_hard := array_append(v_hard, 'event_published');
      else
        if v_event.status <> 'published' or v_event.archived_at is not null then
          v_hard := array_append(v_hard, 'event_published');
        end if;
        if coalesce(v_event.moderation_state, 'visible') in ('hidden', 'removed') then
          v_hard := array_append(v_hard, 'event_not_moderated');
        end if;
        if v_event.organizer_id is distinct from o.owner_user_id then
          v_hard := array_append(v_hard, 'owner_matches');
        end if;
        if v_event.client_request_id is distinct from o.client_request_id then
          v_hard := array_append(v_hard, 'entity_not_from_this_onboarding');
        end if;
        -- An event flyered and gone the next day is the easy thing to fake,
        -- so the rule can insist on a real run-up between listing and date.
        if v_min_days > 0
           and v_event.starts_at is not null
           and v_event.starts_at < v_event.created_at + make_interval(days => v_min_days) then
          v_soft := array_append(v_soft, 'too_soon_after_listing');
        end if;
        if length(coalesce(v_event.description, '')) < v_min_chars then
          v_soft := array_append(v_soft, 'description');
        end if;
        v_details := v_details || jsonb_build_object('starts_at', v_event.starts_at);
      end if;
    end if;

  else
    -- A place the team created: the Phase 3 checks, unchanged.
    if o.place_id is null then
      v_hard := array_append(v_hard, 'place_published');
    else
      select * into v_place from public.place where id = o.place_id;
      if v_place.id is null then
        v_hard := array_append(v_hard, 'place_published');
      else
        if v_place.status <> 'published' then
          v_hard := array_append(v_hard, 'place_published');
        end if;
        if coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed') then
          v_hard := array_append(v_hard, 'place_not_moderated');
        end if;
        if v_place.owner_id is distinct from o.owner_user_id then
          v_hard := array_append(v_hard, 'owner_matches');
        end if;
        if v_place.client_request_id is distinct from o.client_request_id then
          v_hard := array_append(v_hard, 'entity_not_from_this_onboarding');
        end if;

        select count(*) into v_photos from public.place_photo ph where ph.place_id = v_place.id;
        v_photos := v_photos + 1; -- the cover
        if v_photos < v_min_photos then
          v_soft := array_append(v_soft, 'photos');
        end if;
        if length(coalesce(v_place.description, '')) < v_min_chars then
          v_soft := array_append(v_soft, 'description');
        end if;
        if v_place.category_id is null then
          v_soft := array_append(v_soft, 'category');
        end if;
        if coalesce((v_elig ->> 'require_contact')::boolean, true)
           and v_place.phone is null and v_place.whatsapp is null then
          v_soft := array_append(v_soft, 'contact');
        end if;
        if coalesce((v_elig ->> 'require_opening_hours')::boolean, true) then
          select count(*) into v_hours from public.place_opening_hours h where h.place_id = v_place.id;
          if v_hours = 0 then
            v_soft := array_append(v_soft, 'opening_hours');
          end if;
        end if;

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
          v_soft := array_append(v_soft, 'not_duplicate');
          v_details := v_details || jsonb_build_object('duplicate_of', v_dup_of);
        end if;
      end if;
    end if;
  end if;

  -- 3. Location. A claim assist has no pin of the team's own to check.
  if o.activity_key is distinct from 'existing_place_claim_assist' then
    if coalesce((v_elig ->> 'require_inside_territory')::boolean, true)
       and o.territory_id is not null
       and o.inside_territory is not true then
      v_soft := array_append(v_soft, 'inside_territory');
    end if;
    if o.mode = 'offline' then
      v_allowance := least(coalesce(o.submission_accuracy_m, 0), 100);
      if o.submission_distance_m is null
         or o.submission_distance_m > v_max_dist + v_allowance then
        v_soft := array_append(v_soft, 'on_site');
      end if;
    end if;
  end if;

  -- 4. The lead's verification.
  if o.status not in ('verified', 'flagged', 'succeeded') then
    v_hard := array_append(v_hard, 'lead_verified');
  end if;

  return jsonb_build_object(
    'hard', to_jsonb(v_hard),
    'soft', to_jsonb(v_soft),
    'pass', cardinality(v_hard) = 0 and cardinality(v_soft) = 0,
    'release_policy', v_policy,
    'details', v_details || jsonb_build_object(
      'photos', v_photos,
      'duplicate', v_dup,
      'submission_distance_m', o.submission_distance_m,
      'inside_territory', o.inside_territory)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- The sweep gains the two other release gates, replacing the Phase 3
-- `awaiting_release_policy` parking. A row that is not due yet is simply
-- left alone and looked at again on the next run -- no flag, no noise.
-- ---------------------------------------------------------------------

create or replace function public.fieldops_run_eligibility_sweep(p_limit integer default 200)
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
  v_event      public.event;
  v_claim      public.place_claim_request;
  v_processed  integer := 0;
  v_succeeded  integer := 0;
  v_flagged    integer := 0;
  v_rejected   integer := 0;
  v_waiting    integer := 0;
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
           ob.rule_id, ob.flags, ob.reviewed_by, ob.event_id, ob.claim_request_id,
           ob.activity_key
    from public.fieldops_onboarding ob
    join public.fieldops_campaign c on c.id = ob.campaign_id
    where ob.status = 'verified'
      and ob.holding_until is not null
      and ob.holding_until <= now()
      and c.status in ('active', 'winding_down', 'completed')
    order by ob.holding_until
    limit greatest(1, least(p_limit, 2000))
    for update of ob skip locked
  loop
    begin
      v_processed := v_processed + 1;

      v_policy := 'holding_period';
      if o.rule_id is not null then
        select * into v_rule from public.fieldops_commission_rule where id = o.rule_id;
        v_policy := coalesce(v_rule.eligibility ->> 'release_policy', 'holding_period');
      end if;

      -- Is this one due yet? The holding period alone is not the gate for
      -- an event (it has to have happened) or a claim assist (an admin has
      -- to have approved it).
      if v_policy = 'event_started' then
        select * into v_event from public.event where id = o.event_id;
        if v_event.id is not null
           and (v_event.starts_at is null or v_event.starts_at > now()) then
          v_waiting := v_waiting + 1;
          continue;
        end if;
      elsif v_policy = 'claim_approved' then
        select * into v_claim from public.place_claim_request where id = o.claim_request_id;
        if v_claim.id is not null and v_claim.status = 'pending' then
          v_waiting := v_waiting + 1;
          continue;
        end if;
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
        set flags = array(select distinct unnest(array_append(flags, 'no_rule'))),
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
          set flags = array(select distinct unnest(array_append(flags, 'budget_exhausted'))),
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
        set flags = array(select distinct unnest(array_append(flags || v_soft, v_flag))),
            flag_details = flag_details || (v_eval -> 'details')
        where id = o.id;
        perform public.fieldops_transition_onboarding(
          o.id, 'flagged', null, 'system',
          case when cardinality(v_soft) > 0
               then 'Checks to review: ' || array_to_string(v_soft, ', ')
               else 'Routine spot check' end,
          v_eval);
        v_flagged := v_flagged + 1;
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
      details = jsonb_build_object('waiting_on_release', v_waiting),
      last_error = v_last_error
  where id = v_run_id;

  return jsonb_build_object(
    'processed', v_processed, 'succeeded', v_succeeded, 'flagged', v_flagged,
    'rejected', v_rejected, 'waiting', v_waiting, 'failed', v_failed);
end;
$$;

-- ---------------------------------------------------------------------
-- Health: "due but not swept" must not count a row that is simply waiting
-- for its event to happen or its claim to be decided.
-- ---------------------------------------------------------------------

create or replace function public.fieldops_health()
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
      left join public.fieldops_commission_rule r on r.id = ob.rule_id
      left join public.event e on e.id = ob.event_id
      left join public.place_claim_request cr on cr.id = ob.claim_request_id
      where ob.status = 'verified' and ob.holding_until < now() - interval '1 hour'
        and c.status in ('active', 'winding_down', 'completed')
        and not (ob.flags && array['budget_exhausted'])
        -- Only rows whose release gate has actually opened.
        and case coalesce(r.eligibility ->> 'release_policy', 'holding_period')
              when 'event_started'  then e.starts_at is not null and e.starts_at <= now()
              when 'claim_approved' then cr.id is null or cr.status <> 'pending'
              else true
            end),
    'waiting_on_release', (
      select count(*) from public.fieldops_onboarding ob
      join public.fieldops_commission_rule r on r.id = ob.rule_id
      left join public.event e on e.id = ob.event_id
      left join public.place_claim_request cr on cr.id = ob.claim_request_id
      where ob.status = 'verified'
        and case coalesce(r.eligibility ->> 'release_policy', 'holding_period')
              when 'event_started'  then e.starts_at is null or e.starts_at > now()
              when 'claim_approved' then cr.status = 'pending'
              else false
            end),
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
      select sum(amount_minor) from public.fieldops_commission where status = 'approved'), 0),
    'paid_minor', coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'payout_drift_minor', coalesce((
      select sum(c.amount_minor)
      from public.fieldops_commission c
      join public.fieldops_payout_item i on i.id = c.payout_item_id
      where i.status = 'paid' and c.reverses_commission_id is null), 0)
      - coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'stuck_in_payout', (
      select count(*) from public.fieldops_commission c
      where c.status = 'in_payout'
        and (c.payout_item_id is null
             or not exists (select 1 from public.fieldops_payout_batch b
                            join public.fieldops_payout_item i on i.batch_id = b.id
                            where i.id = c.payout_item_id and b.status in ('draft', 'approved'))))
  );
$$;

-- Rows parked by the Phase 3 placeholder now have a real gate to wait at.
update public.fieldops_onboarding
set flags = array_remove(flags, 'awaiting_release_policy')
where flags && array['awaiting_release_policy'];

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fieldops_evaluate_onboarding(uuid)',
    'public.fieldops_run_eligibility_sweep(integer)',
    'public.fieldops_health()',
    'public.fieldops_flag_on_claim()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Rollback: drop the claim column and its trigger, and restore
-- fieldops_evaluate_onboarding / _run_eligibility_sweep / _health to their
-- 20260912000042 definitions.
