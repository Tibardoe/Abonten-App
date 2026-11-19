-- Runs of shows and copying a listing (docs/architecture/show-runs.md;
-- Parts 2 and 6 of docs/specifications/shows-seats-and-pricing.md).
--
-- A run (a play on Friday 4pm, Saturday 4pm and 8pm, Sunday ...) is a
-- SERIES of ordinary events, one per show. Each show is a whole event, so
-- everything that already works per event works per show with nothing
-- changed on the money path: its own seats and ticket stock, its own door
-- list, its own payout 48 hours after it (is_event_settled), its own
-- cancellation and refunds, its own numbers. What is new:
--
--   * event_series and event.series_id: the shows of one run;
--   * event_add_show(): a new show (or a separate copy) made from an
--     existing listing in one transaction: the listing's details, venue,
--     ticket types (their full stock, sale windows moved with the date),
--     group prices, refund policy, promo codes still running, promoter
--     commission and promoters, Pay small small and sending switches;
--   * get_event_shows(): a run's upcoming shows with seats left, for the
--     show picker on the event page (public);
--   * every list shows a run once: the shared Explore rule
--     (_explore_event_candidates), search (search_events) and search
--     suggestions (search_suggest) keep, per run, the earliest show that
--     matches what was asked.
--
-- The older "several dates on one listing" (event_occurrence, one ticket
-- for a chosen date, seats shared by the dates) stays as it is.

begin;

-- ---------------------------------------------------------------------------
-- 1. Series
-- ---------------------------------------------------------------------------

create table if not exists public.event_series (
  id            uuid        primary key default gen_random_uuid(),
  organizer_id  uuid        not null references public.user_info(id) on delete cascade,
  created_at    timestamptz not null default now()
);

comment on table public.event_series is
  'A run of shows: the events that share series_id. Written by the service role only (event_add_show).';

alter table public.event_series enable row level security;
revoke all on table public.event_series from anon, authenticated;
grant all on table public.event_series to service_role;

alter table public.event
  add column if not exists series_id uuid references public.event_series(id) on delete set null;

create index if not exists event_series_id_idx
  on public.event (series_id, starts_at)
  where series_id is not null;

comment on column public.event.series_id is
  'The run this show belongs to (event_series), or null. Set by the service role only.';

-- Clients never place an event in a run: the service does.
create or replace function public.guard_event_series_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.series_id is not null)
     or (tg_op = 'UPDATE' and new.series_id is distinct from old.series_id) then
    raise exception 'The shows of a run are managed by Abonten.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_event_series_column on public.event;
create trigger trg_guard_event_series_column
  before insert or update of series_id on public.event
  for each row execute function public.guard_event_series_column();

-- ---------------------------------------------------------------------------
-- 2. A new show from an existing listing
-- ---------------------------------------------------------------------------
-- Service role only: the caller (@abonten/services events/eventShowsCore)
-- has checked that the person acts for the listing's owner, that the
-- account may sell tickets, and the dates. Idempotent on the client
-- request id, like create_event.

create or replace function public.event_add_show(
  p_source            uuid,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_event_code        text,
  p_slug              text,
  p_client_request_id uuid,
  p_in_series         boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src     public.event%rowtype;
  v_series  uuid;
  v_new     uuid;
  v_shift   interval;
begin
  if p_client_request_id is null then
    raise exception 'event_add_show: a client request id is required';
  end if;

  select id into v_new from public.event where client_request_id = p_client_request_id;
  if v_new is not null then
    return v_new;
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'A show needs a start and an end after it.'
      using errcode = 'check_violation';
  end if;
  if p_starts_at <= now() then
    raise exception 'A new show must start in the future.'
      using errcode = 'check_violation';
  end if;

  select * into v_src from public.event where id = p_source for update;
  if not found then
    raise exception 'event_add_show: no such listing' using errcode = 'no_data_found';
  end if;
  if v_src.status is distinct from 'published' then
    raise exception 'Only a published listing can be copied.'
      using errcode = 'check_violation';
  end if;

  -- Sale windows and promo code expiries move with the date.
  v_shift := p_starts_at - coalesce(
    (select min(o.starts_at) from public.event_occurrence o where o.event_id = v_src.id),
    v_src.starts_at,
    p_starts_at);

  if p_in_series then
    v_series := v_src.series_id;
    if v_series is null then
      insert into public.event_series (organizer_id)
      values (v_src.organizer_id)
      returning id into v_series;
      update public.event set series_id = v_series where id = v_src.id;
    end if;
    if exists (
      select 1 from public.event e
      where e.series_id = v_series and e.starts_at = p_starts_at
        and e.status = 'published' and e.archived_at is null
    ) then
      raise exception 'This run already has a show at that time.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.event (
    client_request_id, organizer_id, title, slug, description, event_code,
    event_category, event_type, location, address, capacity, website_url,
    flyer_public_id, flyer_version, starts_at, ends_at, status,
    require_registration, featured, place_id, created_at,
    country_code, timezone, currency, refund_policy, refund_cutoff_hours,
    series_id
  ) values (
    p_client_request_id, v_src.organizer_id, v_src.title, p_slug, v_src.description, p_event_code,
    v_src.event_category, v_src.event_type, v_src.location, v_src.address, v_src.capacity, v_src.website_url,
    v_src.flyer_public_id, v_src.flyer_version, p_starts_at, p_ends_at, 'published',
    v_src.require_registration, false, v_src.place_id, now(),
    v_src.country_code, v_src.timezone, v_src.currency, v_src.refund_policy, v_src.refund_cutoff_hours,
    v_series
  )
  returning id into v_new;

  -- Ticket types with their full stock: what is left plus what was sold or
  -- is being bought (a cancelled ticket was put back already).
  insert into public.ticket_type (
    event_id, type, price, currency, quantity, admits, available_from, available_until
  )
  select
    v_new, tt.type, tt.price, tt.currency,
    case when tt.quantity is null then null
         else tt.quantity
              + (select count(*) from public.ticket t
                 where t.ticket_type_id = tt.id and t.status in ('active', 'used'))::integer
              + coalesce((select sum(tc.quantity) from public.ticket_checkout tc
                          where tc.ticket_type_id = tt.id
                            and tc.status in ('pending', 'on_plan')), 0)::integer
    end,
    tt.admits,
    tt.available_from + v_shift,
    tt.available_until + v_shift
  from public.ticket_type tt
  where tt.event_id = v_src.id
  order by tt.created_at;

  insert into public.event_group_discount (event_id, min_tickets, percent_off)
  select v_new, g.min_tickets, g.percent_off
  from public.event_group_discount g
  where g.event_id = v_src.id;

  insert into public.promo_code (event_id, promo_code, discount_percentage, expires_at, max_uses, is_active)
  select v_new, p.promo_code, p.discount_percentage, p.expires_at + v_shift, p.max_uses, true
  from public.promo_code p
  where p.event_id = v_src.id
    and p.is_active
    and (p.expires_at is null or p.expires_at + v_shift > now());

  insert into public.event_promoter_commission (event_id, rate_bps, is_active, updated_by, invited_only)
  select v_new, c.rate_bps, c.is_active, c.updated_by, c.invited_only
  from public.event_promoter_commission c
  where c.event_id = v_src.id;

  insert into public.event_promoter (event_id, promoter_id, rate_bps, added_by)
  select v_new, p.promoter_id, p.rate_bps, p.added_by
  from public.event_promoter p
  where p.event_id = v_src.id and p.removed_at is null;

  insert into public.event_ticket_plan_setting (event_id, enabled, updated_by)
  select v_new, s.enabled, s.updated_by
  from public.event_ticket_plan_setting s
  where s.event_id = v_src.id;

  insert into public.event_ticket_transfer_setting (event_id, enabled, updated_by)
  select v_new, s.enabled, s.updated_by
  from public.event_ticket_transfer_setting s
  where s.event_id = v_src.id;

  return v_new;
end;
$$;

revoke all on function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. A run's upcoming shows, for the show picker
-- ---------------------------------------------------------------------------

create or replace function public.get_event_shows(p_event_id uuid)
returns table (
  id          uuid,
  event_code  text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  timezone    text,
  status      text,
  seats_left  integer,
  sold_out    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select e.series_id from public.event e where e.id = p_event_id
  ),
  shows as (
    select e.*
    from public.event e, me
    where me.series_id is not null
      and e.series_id = me.series_id
      and e.status in ('published', 'canceled')
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and e.country_code <> all ((select public.hidden_listing_countries())::text[])
      and coalesce(e.ends_at, e.starts_at) > now()
  ),
  counts as (
    select s.id,
           s.capacity
             - coalesce((select sum(a.number_of_tickets) from public.attendance a
                         where a.event_id = s.id and a.status = 'attending'), 0)
             - coalesce((select sum(c.quantity) from public.ticket_checkout c
                         where c.event_id = s.id and c.status in ('pending', 'on_plan')), 0)
             as capacity_left,
           -- Stock limits only bind when every type has one.
           case when bool_and(tt.quantity is not null) then sum(greatest(tt.quantity, 0)) end as stock_left,
           bool_and(tt.quantity is not null and tt.quantity < tt.admits) as types_out,
           count(tt.id) as type_count
    from shows s
    left join public.ticket_type tt on tt.event_id = s.id
    group by s.id, s.capacity
  )
  select s.id, s.event_code, s.starts_at, s.ends_at, s.timezone::text, s.status::text,
         case
           when c.capacity_left is null then c.stock_left::integer
           when c.stock_left is null then greatest(c.capacity_left, 0)::integer
           else least(greatest(c.capacity_left, 0), c.stock_left)::integer
         end,
         s.status = 'canceled'
           or (c.capacity_left is not null and c.capacity_left <= 0)
           or (c.type_count > 0 and c.types_out)
  from shows s
  join counts c on c.id = s.id
  order by s.starts_at, s.id;
$$;

revoke all on function public.get_event_shows(uuid) from public;
grant execute on function public.get_event_shows(uuid) to anon, authenticated, service_role;

comment on function public.get_event_shows(uuid) is
  'The upcoming shows of the run an event belongs to (none when it is not in a run), with seats left; for the show picker.';

-- ---------------------------------------------------------------------------
-- 4. Lists show a run once
-- ---------------------------------------------------------------------------
-- The three bodies are rewritten in place (pg_get_functiondef + replace),
-- so nothing else in them can drift; each replacement must apply once.

do $$
declare
  v_def text;
  v_new text;
begin
  -- 4a. The shared Explore rule: per run, the earliest show that matches.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_explore_event_candidates';

  v_new := replace(v_def,
$a$  return query
  select
    e.id,
    e.organizer_id,
    occ.total > 0,
    case when occ.total > 0 then occ.next_start else e.starts_at end,$a$,
$b$  return query
  select c.c_id, c.c_organizer, c.c_multi, c.c_start, c.c_distance
  from (
  select
    e.id as c_id,
    e.organizer_id as c_organizer,
    occ.total > 0 as c_multi,
    case when occ.total > 0 then occ.next_start else e.starts_at end as c_start,$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): the Explore rule select was not found';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
$a$         then round(st_distance(e.location, v_point) * 1000) / 1000000 end
  from event e$a$,
$b$         then round(st_distance(e.location, v_point) * 1000) / 1000000 end as c_distance,
    -- A run (event_series) is listed once: its earliest show that matches.
    row_number() over (
      partition by coalesce(e.series_id, e.id)
      order by case when occ.total > 0 then occ.next_start else e.starts_at end, e.id
    ) as c_rank
  from event e$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): the Explore rule distance was not found';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
$a$               and (v_to is null or e.starts_at <= v_to)
        end;
end;$a$,
$b$               and (v_to is null or e.starts_at <= v_to)
        end
  ) c
  where c.c_rank = 1;
end;$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): the Explore rule end was not found';
  end if;
  execute v_new;

  -- 4b. Search: the same, kept over the whole ranked set so pages stay
  -- stable (the cursor applies after).
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_events';

  v_new := replace(v_def,
$a$    select
      e.id, e.title,$a$,
$b$    select
      e.id, e.series_id, e.title,$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): search_events select was not found';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
$a$  from scored s
  where p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id)$a$,
$b$  from (
    -- A run (event_series) is listed once: its earliest show found.
    select sc.*,
           row_number() over (partition by coalesce(sc.series_id, sc.id)
                              order by sc.starts_at nulls last, sc.id) as series_rank
    from scored sc
  ) s
  where s.series_rank = 1
    and (p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id))$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): search_events cursor was not found';
  end if;
  execute v_new;

  -- 4c. Suggestions: up to six listings, a run once.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_suggest';

  v_new := replace(v_def,
$a$    select 'event'::text, e.id, e.title,
           e.event_category,
           e.flyer_public_id, e.flyer_version::text, e.slug, e.event_code,
           coalesce((select min(o.starts_at) from public.event_occurrence o
                     where o.event_id = e.id and o.ends_at > v_now), e.starts_at),
           case when v_origin is null then null else extensions.st_distance(e.location, v_origin) / 1000 end,
           coalesce(u.organizer_verified and u.status_id = 1, false),
           pool.text_score
    from public._search_event_pool(v_raw, null, null, null, null, v_now, 6) pool
    join public.event e on e.id = pool.id
    left join public.user_info u on u.id = e.organizer_id
    order by pool.text_score desc, e.starts_at asc nulls last;$a$,
$b$    select x.kind, x.eid, x.title, x.category, x.pid, x.pver, x.slug, x.code,
           x.next_start, x.distance, x.verified, x.score
    from (
      select 'event'::text as kind, e.id as eid, e.title as title,
             e.event_category as category,
             e.flyer_public_id as pid, e.flyer_version::text as pver, e.slug as slug, e.event_code as code,
             coalesce((select min(o.starts_at) from public.event_occurrence o
                       where o.event_id = e.id and o.ends_at > v_now), e.starts_at) as next_start,
             case when v_origin is null then null else extensions.st_distance(e.location, v_origin) / 1000 end as distance,
             coalesce(u.organizer_verified and u.status_id = 1, false) as verified,
             pool.text_score as score,
             -- A run (event_series) is suggested once: its earliest show.
             row_number() over (partition by coalesce(e.series_id, e.id)
                                order by e.starts_at asc nulls last, e.id) as series_rank
      from public._search_event_pool(v_raw, null, null, null, null, v_now, 30) pool
      join public.event e on e.id = pool.id
      left join public.user_info u on u.id = e.organizer_id
    ) x
    where x.series_rank = 1
    order by x.score desc, x.next_start asc nulls last
    limit 6;$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show runs): search_suggest events block was not found';
  end if;
  execute v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.event_series', 'select') then
    raise exception 'migration check: event_series is service role only';
  end if;
  if has_function_privilege('authenticated', 'public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean)', 'execute') then
    raise exception 'migration check: event_add_show is service role only';
  end if;
  if not has_function_privilege('anon', 'public.get_event_shows(uuid)', 'execute') then
    raise exception 'migration check: the show picker is public';
  end if;
  if position('c_rank' in (select prosrc from pg_proc where proname = '_explore_event_candidates')) = 0
     or position('series_rank' in (select prosrc from pg_proc where proname = 'search_events')) = 0
     or position('series_rank' in (select prosrc from pg_proc where proname = 'search_suggest')) = 0 then
    raise exception 'migration check: a list does not show a run once';
  end if;
end;
$$;

commit;
