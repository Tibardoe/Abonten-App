-- Audit 2026-09-26: days and months in the market's own calendar.
--
-- The readiness check refused to let a market outside UTC+0 go live because
-- four things still counted days in UTC (report 08 §9). This migration fixes
-- the two that live in SQL; the app fixes the other two (the organizer
-- dashboard's and the transactions page's "today" / "this month", computed
-- in the viewer's zone, and promo-code expiry, computed in the event's zone).
--
--   * get_organizer_sales_timeline and get_organizer_dashboard take the
--     viewer's zone (p_timezone) and put each sale in that zone's hour, day
--     or month. Without it: the default market's zone (Africa/Accra, which
--     is UTC — the answer every caller got before).
--   * rewards_run_monthly_rebates counts an event in the month it settled in
--     ITS OWN calendar, and decides the place-visits reward only once the
--     month is over in every zone.
--
-- Also public.money_text(minor, currency): an amount in a currency's own
-- symbol and decimals ("GH₵ 5.00", "¥ 500", "KD 1.250"), for the reward
-- notices rewritten in 20260926100300.
--
-- The three function bodies replaced here are the production definitions
-- (fingerprints checked against the live project on 2026-09-26) with only the
-- described changes.

create or replace function public.money_text(p_minor numeric, p_currency text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.symbol, v.code) || ' ' ||
         pg_catalog.to_char(
           public.minor_to_major(coalesce(p_minor, 0), v.code),
           'FM999999999990' ||
           case when coalesce(c.minor_units, 2) > 0
                then '.' || pg_catalog.repeat('0', coalesce(c.minor_units, 2))
                else '' end)
  from (select upper(coalesce(nullif(p_currency, ''),
                              public.default_market_currency()::text)) as code) v
  left join public.currency c on c.code = v.code;
$$;

revoke all on function public.money_text(numeric, text) from public, anon, authenticated;
grant execute on function public.money_text(numeric, text) to service_role;

-- A zone name the viewer's device reported, or the default market's when it
-- is missing or not a zone Postgres knows.
create or replace function public.calendar_zone(p_zone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_zone is null or p_zone = '' then
    return public.default_market_timezone();
  end if;
  perform pg_catalog.now() at time zone p_zone;
  return p_zone;
exception when invalid_parameter_value then
  return public.default_market_timezone();
end;
$$;

revoke all on function public.calendar_zone(text) from public, anon;
grant execute on function public.calendar_zone(text) to authenticated, service_role;

drop function if exists public.get_organizer_sales_timeline(timestamptz, timestamptz, text, text);

create function public.get_organizer_sales_timeline(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text,
  p_currency text default null,
  p_timezone text default null
)
returns table (bucket_start timestamptz, gross numeric, orders bigint)
language plpgsql
set search_path = ''
as $function$
DECLARE
  -- One currency per series: an organizer selling in two markets never sees
  -- cedis and pounds added together. Default: the currency they sell most in.
  v_currency text := upper(coalesce(p_currency, (
    select tt.currency::text
    from public.ticket_checkout tc
    join public.ticket_type tt on tt.id = tc.ticket_type_id
    join public.event e on e.id = tc.event_id
    where e.organizer_id = auth.uid() and tc.status = 'paid'
    group by tt.currency
    order by count(*) filter (
               where (p_start is null or coalesce(tc.completed_at, tc.created_at) >= p_start)
                 and (p_end is null or coalesce(tc.completed_at, tc.created_at) <= p_end)) desc,
             count(*) desc, tt.currency
    limit 1
  ), public.default_market_currency()::text));
  -- Buckets follow the viewer's calendar: an hour, day or month starts at
  -- local midnight / the local hour, not UTC's.
  v_zone text := public.calendar_zone(p_timezone);
BEGIN
  IF p_bucket NOT IN ('hour', 'day', 'month') THEN
    RAISE EXCEPTION 'invalid bucket: %', p_bucket;
  END IF;

  -- Open-ended window: nothing to generate a series between, so return only
  -- the buckets that have data (the original behaviour).
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN QUERY
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0),
      COUNT(*)
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = auth.uid()
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone)
    ORDER BY bucket_start;

    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    -- The series is generated on the local clock and converted back, so a
    -- day is always one calendar day even where it lasts 23 or 25 hours.
    SELECT (g AT TIME ZONE v_zone) AS bucket_start
    FROM generate_series(
      date_trunc(p_bucket, p_start AT TIME ZONE v_zone),
      date_trunc(p_bucket, p_end AT TIME ZONE v_zone),
      ('1 ' || p_bucket)::interval
    ) AS g
  ),
  sales AS (
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0) AS gross,
      COUNT(*) AS orders
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = auth.uid()
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND COALESCE(tc.completed_at, tc.created_at) >= p_start
      AND COALESCE(tc.completed_at, tc.created_at) <= p_end
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone)
  )
  SELECT
    b.bucket_start,
    COALESCE(s.gross, 0)::numeric,
    COALESCE(s.orders, 0)::bigint
  FROM buckets b
  LEFT JOIN sales s ON s.bucket_start = b.bucket_start
  ORDER BY b.bucket_start;
END;
$function$;

revoke all on function public.get_organizer_sales_timeline(timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.get_organizer_sales_timeline(timestamptz, timestamptz, text, text, text) to authenticated, service_role;

drop function if exists public.get_organizer_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, text);

create function public.get_organizer_dashboard(
  p_start timestamptz,
  p_end timestamptz,
  p_prev_start timestamptz,
  p_prev_end timestamptz,
  p_bucket text,
  p_timezone text default null
)
returns jsonb
language sql
set search_path = ''
as $function$
  SELECT jsonb_build_object(
    'overview_current',
      (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
       FROM public.get_organizer_dashboard_overview(p_start, p_end) o),
    'overview_previous',
      CASE WHEN p_prev_start IS NULL OR p_prev_end IS NULL THEN NULL
      ELSE (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
            FROM public.get_organizer_dashboard_overview(p_prev_start, p_prev_end) o)
      END,
    'timeline',
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.bucket_start), '[]'::jsonb)
       FROM public.get_organizer_sales_timeline(p_start, p_end, p_bucket, null, p_timezone) t),
    'performance',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_event_performance(p_start, p_end, 'revenue', 10) r),
    'upcoming',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_upcoming_events(5) r),
    'attention',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_needs_attention(7) r),
    'activity',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_recent_activity(8) r)
  );
$function$;

revoke all on function public.get_organizer_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.get_organizer_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, text, text) to authenticated, service_role;

-- rewards_run_monthly_rebates (body generated from the production definition)
CREATE OR REPLACE FUNCTION public.rewards_run_monthly_rebates(p_period_start date DEFAULT NULL::date, p_triggered_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_period    date := coalesce(p_period_start, (date_trunc('month', now()) - interval '1 month')::date);
  v_end       timestamptz;
  v_settings  public.reward_program_setting;
  v_run       uuid;
  v_ids       uuid[] := '{}';
  v_id        uuid;
  v_events    integer := 0;
  v_places    integer := 0;
  v_errors    integer := 0;
  v_last_err  text;
  v_stats     jsonb;
  v_event_id  uuid;
  v_place_id  uuid;
  v_month_over boolean;
  rec         record;
begin
  if extract(day from v_period) <> 1 then
    raise exception 'A period starts on the first day of a month' using errcode = '22023';
  end if;
  if v_period > now()::date then
    raise exception 'That month hasn''t started yet' using errcode = '22023';
  end if;

  -- One run at a time.
  perform pg_advisory_xact_lock(hashtext('rewards_run_monthly_rebates'));

  v_end := least((v_period + interval '1 month')::timestamptz, now());
  -- A visits reward counts a whole month, so it waits until that month is
  -- over in every zone ('Etc/GMT+12' is UTC-12, the last to finish).
  v_month_over := ((v_period + interval '1 month')::timestamp at time zone 'Etc/GMT+12') <= now();
  select * into v_settings from public.reward_program_setting where id = 1;
  insert into public.reward_rebate_run (period_start, triggered_by, shadow_mode)
  values (v_period, p_triggered_by, v_settings.shadow_mode)
  returning id into v_run;

  if not exists (select 1 from public.reward_rule r
                 where r.is_active
                   and r.rule_key in ('organizer_rebate', 'venue_rebate', 'organizer_milestone', 'place_visits')) then
    v_stats := jsonb_build_object('skipped', 'no_live_rules', 'events', 0);
    update public.reward_rebate_run
    set finished_at = now(), stats = v_stats where id = v_run;
    return v_stats || jsonb_build_object('run_id', v_run, 'period_start', v_period);
  end if;

  for v_event_id in
    select e.id
    from public.event e
    where e.status in ('published', 'completed')
      and e.id in (select tc.event_id from public.ticket_checkout tc
                   where tc.status = 'paid' and tc.total_price > 0)
      -- The month in the event's own calendar (was UTC: right for Ghana,
      -- hours off for any other zone).
      and public._event_settles_at(e.id)
            >= (v_period::timestamp at time zone coalesce(e.timezone::text, public.default_market_timezone()))
      and public._event_settles_at(e.id)
            < least(((v_period + interval '1 month')::timestamp
                       at time zone coalesce(e.timezone::text, public.default_market_timezone())),
                    now())
    order by public._event_settles_at(e.id), e.id
  loop
    v_events := v_events + 1;
    begin
      v_id := public._reward_rebate_evaluate('organizer_rebate', v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
      v_id := public._reward_rebate_evaluate('venue_rebate', v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
      v_id := public._reward_milestone_evaluate(v_event_id, v_period);
      if v_id is not null then v_ids := v_ids || v_id; end if;
    exception when others then
      v_errors := v_errors + 1;
      v_last_err := format('event %s: %s', v_event_id, left(sqlerrm, 300));
      raise warning 'monthly rebate for event % failed: %', v_event_id, sqlerrm;
    end;
  end loop;

  -- A visits reward counts the whole month, so it's decided only after it.
  if v_month_over then
    for v_place_id in
      select distinct v.place_id
      from public.place_visit v
      join public.place p on p.id = v.place_id and p.verified
      where v.visited_on >= v_period and v.visited_on < (v_period + interval '1 month')::date
      order by v.place_id
    loop
      v_places := v_places + 1;
      begin
        v_id := public._reward_place_visits_evaluate(v_place_id, v_period);
        if v_id is not null then v_ids := v_ids || v_id; end if;
      exception when others then
        v_errors := v_errors + 1;
        v_last_err := format('place %s: %s', v_place_id, left(sqlerrm, 300));
        raise warning 'monthly visits reward for place % failed: %', v_place_id, sqlerrm;
      end;
    end loop;
  end if;

  -- One notification per person for what was released now (live only).
  for rec in
    select e.beneficiary_user_id as user_id,
           max(e.currency) as currency,
           sum(e.released_minor) filter (where e.rule_key in ('organizer_rebate', 'venue_rebate')) as rebate_minor,
           sum(e.released_minor) filter (where e.rule_key = 'organizer_milestone') as milestone_minor,
           max(e.basis ->> 'unique_buyers') filter (where e.rule_key = 'organizer_milestone') as buyers,
           sum(e.released_minor) filter (where e.rule_key = 'place_visits') as visits_minor,
           sum((e.basis ->> 'counted_visitors')::integer) filter (where e.rule_key = 'place_visits') as visitors
    from public.reward_event e
    where e.id = any (v_ids) and not e.is_shadow and e.status = 'released'
    group by e.beneficiary_user_id
  loop
    if coalesce(rec.rebate_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'promotion_credit_earned', 'You earned promotion credit',
        format('%s of promotion credit from events that ended in %s. Use it to feature an event or place.',
               public.money_text(rec.rebate_minor, rec.currency), trim(to_char(v_period, 'Month'))));
    end if;
    if coalesce(rec.milestone_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'milestone_reached', format('%s people bought tickets to your event', rec.buyers),
        format('Here''s %s of promotion credit to feature your next event.',
               public.money_text(rec.milestone_minor, rec.currency)));
    end if;
    if coalesce(rec.visits_minor, 0) > 0 then
      perform public._reward_notify(
        rec.user_id, 'promotion_credit_earned', 'Visitors earned you promotion credit',
        format('%s verified %s checked in at your place in %s. Here''s %s of promotion credit to feature it.',
               rec.visitors, case when rec.visitors = 1 then 'visitor' else 'visitors' end,
               trim(to_char(v_period, 'Month')), public.money_text(rec.visits_minor, rec.currency)));
    end if;
  end loop;

  select jsonb_build_object(
    'events', v_events,
    'places', v_places,
    'visits_decided', v_month_over,
    'errors', v_errors,
    'rewards', coalesce(jsonb_object_agg(x.rule_key, x.detail), '{}'::jsonb))
    into v_stats
  from (
    select e.rule_key,
           jsonb_build_object(
             'decided', count(*),
             'released', count(*) filter (where e.status = 'released'),
             'held', count(*) filter (where e.status in ('held', 'pending', 'deferred')),
             'rejected', count(*) filter (where e.status = 'rejected'),
             'shadow', count(*) filter (where e.is_shadow),
             'amount_minor', coalesce(sum(case when e.status = 'released' then e.released_minor
                                                else e.amount_minor end), 0)) as detail
    from public.reward_event e
    where e.id = any (v_ids)
    group by e.rule_key
  ) x;
  if v_last_err is not null then
    v_stats := v_stats || jsonb_build_object('last_error', v_last_err);
  end if;

  update public.reward_rebate_run
  set finished_at = now(), stats = v_stats where id = v_run;

  if v_errors > 0 then
    perform public.open_reconciliation_incident(
      'rewards.rebate_run',
      'Monthly rebates: some events failed',
      format('The rebate run for %s failed on %s event(s) or place(s). Last error: %s. Fix the cause, then run the month again from Admin › Rewards › Rebates (decided ones are skipped).',
             to_char(v_period, 'YYYY-MM'), v_errors, v_last_err),
      'medium');
  end if;

  return v_stats || jsonb_build_object('run_id', v_run, 'period_start', v_period);
end;
$function$;

