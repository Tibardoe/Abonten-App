-- Spotlight promotion delivery at a realistic audience size.
--
-- LOCAL TEST STACK ONLY. One transaction, ends in ROLLBACK. Needs three live
-- Spotlight posts (any local seed or integration run leaves them).
--
-- Simulates a 7-day week: a pool of 8,000 viewing devices, about 3,000 of
-- them opening Spotlight each day, one feed page each with two sponsored
-- slots, against three promotions running side by side:
--   A  GH₵ 50,  7 days, everywhere    (small budget: should deliver in full)
--   B  GH₵ 300, 7 days, everywhere    (bigger than this audience can take)
--   C  GH₵ 100, 3 days, everywhere    (short run)
-- The real functions do the work: content_sponsored_candidates (pacing,
-- rotation, per-viewer cap), content_view_ingest (de-duplication, reach),
-- content_campaign_accrue / _tick (spend, completion) and
-- content_campaign_reconcile. Time is simulated by moving each campaign's
-- dates and the day's views back one day after every simulated day.
--
-- Run: cat scripts/perf/promotion-delivery-simulation.sql \
--        | docker exec -i supabase_db_Abonten-App psql -U postgres -v ON_ERROR_STOP=1

\timing off
\pset footer off
begin;

do $$
begin
  if (select count(*) from public.transaction) > 5000
     or (select count(*) from public.user_info) > 5000 then
    raise exception 'Refusing to run: this looks like a real database.';
  end if;
end;
$$;

select setseed(0.42);

-- Only the simulated promotions compete.
update public.content_campaign set status = 'cancelled'
where status in ('active', 'scheduled', 'paused');
update public.content_program_setting
set spotlight_enabled = true, sponsored_delivery_enabled = true
where id = 1;

create temp table sim_campaign (label text primary key, id uuid, post_id uuid, budget_minor bigint, days int);
create temp table sim_day (day int, label text, impressions_today int, impressions int, reach int, spent_minor bigint, allowed_now bigint, status text);

do $$
declare
  v_posts uuid[];
  v_advertiser uuid;
  v_pricing public.content_promotion_pricing%rowtype;
  v_tx uuid;
  v_id uuid;
  r record;
  i int := 0;
begin
  select * into v_pricing from public.content_promotion_pricing where id = 1;
  select array_agg(id) into v_posts from (
    select p.id from public.content_post p
    join public.user_info u on u.id = p.author_id and u.status_id = 1
    where p.kind = 'spotlight' and p.status = 'published' and p.moderation_state = 'visible'
      and p.publisher_place_id is null
    order by p.published_at desc limit 3) t;
  if coalesce(array_length(v_posts, 1), 0) < 3 then
    raise exception 'Need three live Spotlight posts on the local stack.';
  end if;

  for r in select * from (values ('A', 5000::bigint, 7), ('B', 30000::bigint, 7), ('C', 10000::bigint, 3)) as t(label, budget, days) loop
    i := i + 1;
    select author_id into v_advertiser from public.content_post where id = v_posts[i];
    insert into public.transaction (user_id, full_name, email, reason, amount, currency, status, payment_method, provider, provider_reference)
    values (v_advertiser, 'Simulation', 'simulation@example.com', 'Promotion_Purchase', r.budget / 100.0, 'GHS', 'successful', 'paystack', 'paystack', 'SIM-' || gen_random_uuid())
    returning id into v_tx;
    insert into public.content_campaign (
      post_id, advertiser_id, objective, budget_minor, currency, duration_days,
      starts_at, ends_at, status, paid_minor, transaction_id, activated_at, last_accrued_at,
      pricing_version, cpm_minor, impression_goal)
    values (
      v_posts[i], v_advertiser, 'views', r.budget, 'GHS', r.days,
      now() - interval '12 hours', now() - interval '12 hours' + make_interval(days => r.days),
      'active', r.budget, v_tx, now() - interval '12 hours', now() - interval '12 hours',
      v_pricing.version, v_pricing.cpm_minor, floor(r.budget * 1000.0 / v_pricing.cpm_minor))
    returning id into v_id;
    insert into public.content_campaign_ledger (campaign_id, entry_type, amount_minor, currency, transaction_id, idempotency_key, note)
    values (v_id, 'payment', r.budget, 'GHS', v_tx, 'payment:sim:' || v_id, 'Simulation');
    insert into sim_campaign values (r.label, v_id, v_posts[i], r.budget, r.days);
  end loop;
end;
$$;

do $$
declare
  d int;
  v int;
  slot int;
  v_key text;
  v_shown uuid[];
  c record;
  s record;
  v_before jsonb;
begin
  for d in 1..7 loop
    select jsonb_object_agg(sc.label, cc.impression_count) into v_before
    from sim_campaign sc join public.content_campaign cc on cc.id = sc.id;

    for v in 1..8000 loop
      continue when random() >= 0.375;            -- ~3,000 of 8,000 open Spotlight today
      v_key := 'sim-viewer-' || v;
      v_shown := '{}';
      for slot in 1..2 loop                        -- two sponsored slots on their page
        select cand.campaign_id, cand.post_id into c
        from public.content_sponsored_candidates(null, v_key, null, null, 5) cand
        where not (cand.campaign_id = any (v_shown))
        limit 1;
        exit when not found;
        v_shown := v_shown || c.campaign_id;
        perform public.content_view_ingest(null, v_key, jsonb_build_array(jsonb_build_object(
          'kind', 'impression', 'postId', c.post_id, 'campaignId', c.campaign_id, 'surface', 'for_you')));
      end loop;
    end loop;

    -- Snapshot before the day ends (allowed_now is what pacing allowed today).
    for s in
      select sc.label, cc.* from sim_campaign sc join public.content_campaign cc on cc.id = sc.id
    loop
      insert into sim_day values (
        d, s.label, s.impression_count - coalesce((v_before ->> s.label)::int, 0), s.impression_count, s.reach_count,
        s.spent_minor,
        greatest(ceil(s.impression_goal * 0.01), ceil(s.impression_goal * least(1.0,
          extract(epoch from (now() - s.starts_at)) / greatest(extract(epoch from (s.ends_at - s.starts_at)), 1) * 2.0))),
        s.status);
    end loop;

    -- Move the day into the past.
    update public.content_view set created_at = created_at - interval '1 day'
    where viewer_key like 'sim-viewer-%';
    update public.content_campaign cc
    set starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day',
        activated_at = activated_at - interval '1 day', last_accrued_at = last_accrued_at - interval '1 day'
    from sim_campaign sc where sc.id = cc.id;
    perform public.content_campaign_tick();
    update sim_day sd set spent_minor = cc.spent_minor, status = cc.status
    from sim_campaign sc join public.content_campaign cc on cc.id = sc.id
    where sd.day = d and sd.label = sc.label;
  end loop;
end;
$$;

\echo
\echo '== Per day: impressions delivered, pacing allowance at that moment, spend recognised, status after the day =='
select day, label, impressions_today, impressions, allowed_now, reach, spent_minor, status
from sim_day order by label, day;

\echo
\echo '== Per promotion at the end =='
select sc.label, sc.budget_minor, sc.days, cc.impression_goal, cc.impression_count as delivered,
       round(100.0 * cc.impression_count / cc.impression_goal, 1) as delivered_pct,
       cc.reach_count as reach, round(cc.impression_count::numeric / nullif(cc.reach_count, 0), 2) as avg_frequency,
       cc.spent_minor, cc.paid_minor - cc.spent_minor - cc.refunded_minor as unused_minor,
       floor(cc.impression_count * cc.cpm_minor / 1000.0) as expected_spend_minor,
       cc.status, cc.end_reason
from sim_campaign sc join public.content_campaign cc on cc.id = sc.id order by sc.label;

\echo
\echo '== Most sponsored impressions one device received from one promotion in one day (cap = sponsored_daily_cap_per_viewer) =='
select max(n) as max_per_device_per_day
from (select campaign_id, viewer_key, date_trunc('day', created_at), count(*) n
      from public.content_view where viewer_key like 'sim-viewer-%' and kind = 'impression' and valid and campaign_id is not null
      group by 1, 2, 3) t;

\echo
\echo '== Measured audience from the simulated week (feeds the estimator) =='
select public.content_audience_refresh();

\echo
\echo '== Reconciliation (all zeros = ledger and delivery agree) =='
select public.content_campaign_reconcile();

rollback;
