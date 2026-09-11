-- Fix for 20260911223818: appending a bare string literal to a text[] is
-- ambiguous in Postgres. `flags || 'budget_exhausted'` resolves to the
-- anyarray || anyarray operator, which then tries to parse the literal as
-- an array and fails with `malformed array literal`. Every check the
-- evaluator recorded and every flag the sweep raised hit this, so the
-- sweep's per-row exception handler swallowed the error and left the row
-- `verified` forever. array_append() takes an element and is unambiguous.
--
-- Caught by the fieldops-sweep integration suite before the programme was
-- ever switched on; no row has been swept in production.

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
      v_hard := array_append(v_hard, 'owner_verified');
    end if;
  end if;
  if o.owner_phone_e164 is not null
     and public.fieldops_phone_belongs_to_member(o.owner_phone_e164) then
    v_hard := array_append(v_hard, 'owner_not_member');
  end if;

  -- 2. The entity is still a live listing owned by that owner.
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

      -- 3. Completeness.
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
        v_soft := array_append(v_soft, 'not_duplicate');
        v_details := v_details || jsonb_build_object('duplicate_of', v_dup_of);
      end if;
    end if;
  end if;

  -- 5. Location.
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

  -- 6. The lead's verification.
  if o.status not in ('verified', 'flagged', 'succeeded') then
    v_hard := array_append(v_hard, 'lead_verified');
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
        set flags = array(select distinct unnest(array_append(flags, 'awaiting_release_policy'))),
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

create or replace function public.fieldops_reverse_commission(
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
    set flags = array(select distinct unnest(array_append(flags, 'reversed')))
    where id = c.onboarding_id;
  end if;

  return c;
end;
$$;
