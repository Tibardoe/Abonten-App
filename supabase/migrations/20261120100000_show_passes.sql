-- Passes for several shows of a run (docs/architecture/show-passes.md;
-- Part 4 of docs/specifications/shows-seats-and-pricing.md, decision Y10).
--
-- A pass is a ticket type of a run of shows (event.series_id) that carries
-- pass_shows = N. It is sold on every show of the run, at the pass price:
-- the ticket bought is an ordinary ticket for that show (it admits there
-- and its money settles with that show, 48 hours after it), and it lets
-- its holder choose N - 1 other shows of the run. Each choice is a ticket
-- for the chosen show, of that show's pass type (out of its stock and
-- seats, seated like any other), written as a 'paid' checkout of price 0
-- whose pass_ticket_id names the ticket bought. No money moves on a
-- choice.
--
--  * A chosen ticket that is cancelled (its show was cancelled, or the
--    holder gave it back) frees its choice.
--  * When the ticket bought is cancelled or refunded, the chosen tickets for
--    shows still to come are cancelled with it (ticket_pass_host_cancelled).
--    A buyer cannot cancel it once one of its chosen shows has started
--    (@abonten/services tickets/buyerCancelGate).

begin;

alter table public.ticket_type
  add column if not exists pass_shows smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_type_pass_shows_range') then
    alter table public.ticket_type
      add constraint ticket_type_pass_shows_range
        check (pass_shows is null or (pass_shows between 2 and 30 and admits = 1));
  end if;
end;
$$;

comment on column public.ticket_type.pass_shows is
  'A pass: the number of shows of the run it covers (this show and pass_shows - 1 the holder chooses). Null for an ordinary ticket type.';

-- No foreign key on purpose: a second relationship between ticket and
-- ticket_checkout would make every unhinted embed between them ambiguous
-- for the Data API. Written only by ticket_pass_claim.
alter table public.ticket_checkout
  add column if not exists pass_ticket_id uuid;
alter table public.ticket_checkout
  drop constraint if exists ticket_checkout_pass_ticket_id_fkey;

comment on column public.ticket_checkout.pass_ticket_id is
  'A show chosen with a pass: the pass ticket that was bought. Price 0, no payment.';

create index if not exists ticket_checkout_pass_ticket_idx
  on public.ticket_checkout (pass_ticket_id)
  where pass_ticket_id is not null;

-- ---------------------------------------------------------------------------
-- 1. Selling a pass on every show of a run still to come
-- ---------------------------------------------------------------------------
-- Service role only: the caller (@abonten/services passes/showPassCore) has
-- checked that the person acts for the run's organizer. A show that already
-- has a ticket type of that name, or whose capacity cannot take the passes,
-- is skipped and counted.
create or replace function public.event_series_add_pass(
  p_event_id  uuid,
  p_name      text,
  p_shows     integer,
  p_price     numeric,
  p_quantity  integer
)
returns table (added integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src      public.event%rowtype;
  v_name     text := btrim(coalesce(p_name, ''));
  v_show     record;
  v_added    integer := 0;
  v_skipped  integer := 0;
  v_upcoming integer;
begin
  select * into v_src from public.event where id = p_event_id;
  if not found or v_src.series_id is null then
    raise exception 'A pass needs a run of shows. Add shows first.'
      using errcode = 'check_violation';
  end if;
  if length(v_name) < 1 or length(v_name) > 60
     or upper(v_name) in ('FREE', 'SINGLE TICKET') then
    raise exception 'Give the pass a name of up to 60 characters.'
      using errcode = 'check_violation';
  end if;
  if p_shows is null or p_shows < 2 or p_shows > 30 then
    raise exception 'A pass covers from 2 to 30 shows.'
      using errcode = 'check_violation';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'A pass needs a price.'
      using errcode = 'check_violation';
  end if;
  if v_src.currency is not null
     and public.money_round(p_price, v_src.currency) <> p_price then
    raise exception 'A % price can''t have more than % decimal places',
      v_src.currency, public.currency_minor_units(v_src.currency)
      using errcode = 'check_violation';
  end if;
  if p_quantity is not null and p_quantity < 1 then
    raise exception 'Give each show at least one pass, or leave the number empty.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_upcoming
  from public.event e
  where e.series_id = v_src.series_id
    and e.status = 'published'
    and e.starts_at > now();
  if v_upcoming < p_shows then
    raise exception 'The run has only % shows still to come.', v_upcoming
      using errcode = 'check_violation';
  end if;

  for v_show in
    select e.id, e.currency
    from public.event e
    where e.series_id = v_src.series_id
      and e.status = 'published'
      and e.starts_at > now()
    order by e.starts_at, e.id
  loop
    if exists (
      select 1 from public.ticket_type t
      where t.event_id = v_show.id and lower(t.type) = lower(v_name)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      insert into public.ticket_type (event_id, type, price, currency, quantity, admits, pass_shows)
      values (v_show.id, v_name, p_price, v_show.currency, p_quantity, 1, p_shows);
      -- The capacity rule runs at commit; asked here so a show that cannot
      -- take the passes is skipped instead of failing the whole run.
      perform public.event_capacity_check(v_show.id);
      v_added := v_added + 1;
    exception when check_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_added, v_skipped;
end;
$$;

revoke all on function public.event_series_add_pass(uuid, text, integer, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.event_series_add_pass(uuid, text, integer, numeric, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. What a pass holds
-- ---------------------------------------------------------------------------
-- Null unless p_pass_ticket is a pass held by p_holder. The run's shows
-- still to come, plus any show already chosen, each with the ticket the
-- pass holds for it and the passes it has left (null = no limit, 0 = none;
-- has_pass = false when the show does not sell this pass).
create or replace function public.ticket_pass_state(
  p_pass_ticket uuid,
  p_holder      uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host   public.ticket%rowtype;
  v_type   public.ticket_type%rowtype;
  v_event  public.event%rowtype;
  v_used   integer;
  v_shows  jsonb;
begin
  select * into v_host from public.ticket where id = p_pass_ticket;
  if not found or v_host.user_id is distinct from p_holder then
    return null;
  end if;
  select * into v_type from public.ticket_type where id = v_host.ticket_type_id;
  if v_type.pass_shows is null then
    return null;
  end if;
  select * into v_event from public.event where id = v_type.event_id;

  select count(*) into v_used
  from public.ticket_checkout c
  join public.ticket t on t.ticket_checkout_id = c.id
  where c.pass_ticket_id = v_host.id and t.status in ('active', 'used');

  with claims as (
    select c.event_id, t.id as ticket_id, t.status
    from public.ticket_checkout c
    join public.ticket t on t.ticket_checkout_id = c.id
    where c.pass_ticket_id = v_host.id and t.status in ('active', 'used')
  ),
  shows as (
    select e.*
    from public.event e
    where v_event.series_id is not null
      and e.series_id = v_event.series_id
      and (
        e.id = v_event.id
        or e.id in (select event_id from claims)
        or (e.status = 'published' and e.archived_at is null
            and coalesce(e.ends_at, e.starts_at) > now())
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', s.id,
           'event_code', s.event_code,
           'starts_at', s.starts_at,
           'ends_at', s.ends_at,
           'timezone', s.timezone,
           'status', s.status,
           'is_bought_show', s.id = v_event.id,
           'ticket_id', case when s.id = v_event.id then v_host.id else cl.ticket_id end,
           'ticket_status', case when s.id = v_event.id then v_host.status else cl.status end,
           'has_pass', pt.id is not null,
           'passes_left', pt.quantity,
           'started', s.starts_at <= now()
         ) order by s.starts_at, s.id), '[]'::jsonb)
  into v_shows
  from shows s
  left join claims cl on cl.event_id = s.id
  left join lateral (
    select t.id, t.quantity
    from public.ticket_type t
    where t.event_id = s.id and lower(t.type) = lower(v_type.type) and t.pass_shows is not null
    order by t.created_at
    limit 1
  ) pt on true;

  return jsonb_build_object(
    'pass_ticket_id', v_host.id,
    'pass_status', v_host.status,
    'name', v_type.type,
    'shows_total', v_type.pass_shows,
    'shows_used', 1 + v_used,
    'bought_event_id', v_event.id,
    'shows', v_shows
  );
end;
$$;

revoke all on function public.ticket_pass_state(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ticket_pass_state(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Choosing a show with a pass
-- ---------------------------------------------------------------------------
-- Service role only: the caller made the ticket's code and QR. Returns the
-- new ticket's id.
create or replace function public.ticket_pass_claim(
  p_pass_ticket uuid,
  p_holder      uuid,
  p_event_id    uuid,
  p_expires_at  timestamptz,
  p_ticket      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host      public.ticket%rowtype;
  v_host_type public.ticket_type%rowtype;
  v_series    uuid;
  v_target    public.event%rowtype;
  v_type      public.ticket_type%rowtype;
  v_used      integer;
  v_checkout  uuid;
  v_ticket    uuid;
begin
  -- One choice at a time per pass.
  select * into v_host from public.ticket where id = p_pass_ticket for update;
  if not found or v_host.user_id is distinct from p_holder
     or v_host.status not in ('active', 'used') then
    raise exception 'This pass is not yours to use.'
      using errcode = 'check_violation';
  end if;
  select * into v_host_type from public.ticket_type where id = v_host.ticket_type_id;
  if v_host_type.pass_shows is null then
    raise exception 'This ticket is not a pass.'
      using errcode = 'check_violation';
  end if;
  select e.series_id into v_series from public.event e where e.id = v_host_type.event_id;

  select * into v_target from public.event where id = p_event_id;
  if not found or v_series is null or v_target.series_id is distinct from v_series
     or v_target.id = v_host_type.event_id
     or exists (select 1 from public.event_occurrence o where o.event_id = v_target.id) then
    raise exception 'Choose another show of this run.'
      using errcode = 'check_violation';
  end if;
  if v_target.status is distinct from 'published' or v_target.starts_at <= now() then
    raise exception 'This show can no longer be chosen.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.ticket_checkout c
    join public.ticket t on t.ticket_checkout_id = c.id
    where c.pass_ticket_id = v_host.id and c.event_id = p_event_id
      and t.status in ('active', 'used')
  ) then
    raise exception 'This pass already has a ticket for that show.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_used
  from public.ticket_checkout c
  join public.ticket t on t.ticket_checkout_id = c.id
  where c.pass_ticket_id = v_host.id and t.status in ('active', 'used');
  if 1 + v_used >= v_host_type.pass_shows then
    raise exception 'Every show of this pass has been chosen.'
      using errcode = 'check_violation';
  end if;

  select * into v_type
  from public.ticket_type t
  where t.event_id = p_event_id
    and lower(t.type) = lower(v_host_type.type)
    and t.pass_shows is not null
  order by t.created_at
  limit 1
  for update;
  if not found then
    raise exception 'This show does not take this pass.'
      using errcode = 'check_violation';
  end if;

  update public.ticket_type
  set quantity = quantity - 1
  where id = v_type.id and (quantity is null or quantity >= 1);
  if not found then
    raise exception 'This show has no places left for passes.'
      using errcode = 'check_violation';
  end if;

  insert into public.ticket_checkout (
    checkout_session_id, user_id, event_id, ticket_type_id, quantity, admits,
    unit_price, discount, discounted_units, total_price, status,
    completed_at, pass_ticket_id
  ) values (
    gen_random_uuid(), p_holder, p_event_id, v_type.id, 1, 1,
    0, 0, 0, 0, 'paid',
    now(), v_host.id
  )
  returning id into v_checkout;

  insert into public.ticket (
    user_id, ticket_type_id, ticket_checkout_id,
    qr_public_id, qr_version, ticket_code, expires_at,
    transaction_id, metadata, status
  ) values (
    p_holder, v_type.id, v_checkout,
    p_ticket->>'qr_public_id', p_ticket->>'qr_version', p_ticket->>'ticket_code', p_expires_at,
    null, jsonb_build_object('pass', v_host.id), 'active'
  )
  returning id into v_ticket;

  insert into public.attendance (
    user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
  ) values (
    p_holder, p_event_id, v_type.id, v_ticket, 'attending', 1
  );

  return v_ticket;
end;
$$;

revoke all on function public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. A cancelled pass takes its chosen shows still to come with it
-- ---------------------------------------------------------------------------
create or replace function public.ticket_pass_host_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select t.id, t.ticket_type_id, t.ticket_checkout_id
    from public.ticket_checkout c
    join public.ticket t on t.ticket_checkout_id = c.id
    join public.event e on e.id = c.event_id
    where c.pass_ticket_id = new.id
      and t.status = 'active'
      and e.starts_at > now()
  loop
    update public.ticket set status = 'cancelled'
    where id = r.id and status = 'active';
    if found then
      update public.attendance set status = 'cancelled'
      where ticket_id = r.id and status = 'attending';
      update public.ticket_type set quantity = quantity + 1
      where id = r.ticket_type_id and quantity is not null;
      update public.ticket_checkout set status = 'cancelled'
      where id = r.ticket_checkout_id and status = 'paid';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.ticket_pass_host_cancelled() from public, anon, authenticated;

drop trigger if exists trg_ticket_pass_host_cancelled on public.ticket;
create trigger trg_ticket_pass_host_cancelled
  after update of status on public.ticket
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.ticket_pass_host_cancelled();

-- ---------------------------------------------------------------------------
-- 5. New shows of a run sell its passes too
-- ---------------------------------------------------------------------------
-- event_add_show copies the source's ticket types; it now carries
-- pass_shows. Rewritten in place (pg_get_functiondef + replace), so nothing
-- else in it can drift; each replacement must apply.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_add_show';
  if position('tt.pass_shows' in v_def) > 0 then
    return;  -- already carries pass_shows
  end if;

  v_new := replace(v_def,
$a$    event_id, type, price, currency, quantity, admits, available_from, available_until
  )$a$,
$b$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows
  )$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show passes): the ticket type columns were not found';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
$a$    tt.available_from + v_shift,
    tt.available_until + v_shift
  from public.ticket_type tt$a$,
$b$    tt.available_from + v_shift,
    tt.available_until + v_shift,
    tt.pass_shows
  from public.ticket_type tt$b$);
  if v_new = v_def then
    raise exception 'migration rewrite (show passes): the ticket type values were not found';
  end if;

  execute v_new;
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.ticket_pass_state(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.event_series_add_pass(uuid, text, integer, numeric, integer)', 'execute') then
    raise exception 'migration check: passes are run by the server only';
  end if;
end;
$$;

commit;
