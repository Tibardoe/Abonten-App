-- Moving an event to a new date after tickets were sold (2026-11-20,
-- docs/architecture/event-reschedule.md; owner's defaults: the service fee
-- comes back too, a refund window of 7 days ending no later than 48 hours
-- before the new date, no text messages, at most two moves per event).
--
-- Until now the dates locked at the first confirmed ticket and the only way
-- out was cancelling (everyone refunded, the service fee kept) and making a
-- new event. Now the organizer moves the event with a message:
--
--   event_reschedule()         moves a published single-date event that has
--                              not started, records the move, moves every
--                              live ticket's validity and every running Pay
--                              small small plan with it, and writes one notice
--                              per person holding a ticket or a plan (pushed
--                              through the delivery queue). Service role only.
--   event_reschedule           the record of each move (old and new dates,
--                              the message, the refund window). Service role.
--   event_reschedule_choice    "keep" / "refund" per person. Service role.
--   get_event_reschedule()     the latest move of a public event, for the
--                              "Moved from …" line on its page.
--
-- A holder who chooses a refund gives back their tickets through the usual
-- cancel path; those tickets carry ticket.refund_includes_fee, and
-- refund_prepare adds their share of the payment's service fee to the refund
-- (transaction_refund.fee_amount), which the fee audit row then records as
-- fee revenue given back. Cash payments refunded ticket by ticket only:
-- payments with Abonten Credit or Pay small small keep their whole-payment
-- path and its rules.
--
-- refund_prepare and _refund_fee_adjustment are replaced whole: production
-- holds them with Windows line endings, so their bodies are checked against
-- the repository's (line endings ignored) before anything changes.

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints: the money functions replaced below must be the ones this
-- migration was written against.
do $fp$
declare
  v_md5 text;
begin
  select md5(replace(prosrc, E'\r', '')) into v_md5
  from pg_proc where oid = 'public.refund_prepare(uuid)'::regprocedure;
  if v_md5 is distinct from 'cf4348e122f409eca34ef361c649f14b'
     and position('refund_includes_fee' in (select prosrc from pg_proc where oid = 'public.refund_prepare(uuid)'::regprocedure)) = 0 then
    raise exception 'migration check: refund_prepare is not the version this migration replaces (%)', v_md5;
  end if;
  select md5(replace(prosrc, E'\r', '')) into v_md5
  from pg_proc where oid = 'public._refund_fee_adjustment(uuid)'::regprocedure;
  if v_md5 is distinct from '8af83c11dfe1c9de5602bc081de14f9a'
     and position('fee_amount' in (select prosrc from pg_proc where oid = 'public._refund_fee_adjustment(uuid)'::regprocedure)) = 0 then
    raise exception 'migration check: _refund_fee_adjustment is not the version this migration replaces (%)', v_md5;
  end if;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- Records

create table if not exists public.event_reschedule (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.event(id) on delete cascade,
  moved_by           uuid references public.user_info(id) on delete set null,
  previous_starts_at timestamptz not null,
  previous_ends_at   timestamptz,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  message            text not null check (length(btrim(message)) between 1 and 1000),
  refund_until       timestamptz not null,
  holders            integer not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists event_reschedule_event_idx
  on public.event_reschedule (event_id, created_at desc);

create table if not exists public.event_reschedule_choice (
  reschedule_id uuid not null references public.event_reschedule(id) on delete cascade,
  user_id       uuid not null references public.user_info(id) on delete cascade,
  choice        text not null check (choice in ('keep', 'refund')),
  decided_at    timestamptz not null default now(),
  primary key (reschedule_id, user_id)
);

alter table public.event_reschedule enable row level security;
alter table public.event_reschedule_choice enable row level security;
revoke all on table public.event_reschedule from anon, authenticated;
revoke all on table public.event_reschedule_choice from anon, authenticated;
grant all on table public.event_reschedule to service_role;
grant all on table public.event_reschedule_choice to service_role;

comment on table public.event_reschedule is
  'Each time an organizer moved an event with tickets to a new date: old and new dates, their message to holders, and until when holders may give their tickets back for a full refund. Written by event_reschedule() only.';
comment on table public.event_reschedule_choice is
  'What a holder chose after a move: keep their tickets or give them back. Service role only.';

-- A ticket given back after its event moved: its refund includes its share
-- of the service fee. Set by the service with the cancellation; clients
-- cannot write it (guard_ticket_client_update compares every other column).
alter table public.ticket
  add column if not exists refund_includes_fee boolean not null default false;

-- How much of a refund was service fee (0 for every refund before this).
alter table public.transaction_refund
  add column if not exists fee_amount numeric not null default 0 check (fee_amount >= 0);

-- ---------------------------------------------------------------------------
-- The service fee share of tickets: the payment's fee times their share of
-- its ticket revenue, never more than the fee not yet given back.

create or replace function public._refund_fee_share(
  p_transaction_id uuid,
  p_ticket_ids     uuid[]
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select greatest(least(
             public.money_round(
               f.fee * public._refund_amount(p_transaction_id, p_ticket_ids)
                 / nullif(f.revenue, 0),
               f.currency),
             f.fee - coalesce((
               select sum(r.fee_amount)
               from public.transaction_refund r
               where r.transaction_id = p_transaction_id and r.status <> 'failed'
             ), 0)
           ), 0)
    from (
      select sum(e.service_fee) as fee,
             sum(e.ticket_revenue) as revenue,
             max(e.currency) as currency
      from public.platform_fee_entry e
      where e.transaction_id = p_transaction_id and e.entry_type = 'fee'
      having count(*) > 0
    ) f
  ), 0);
$$;

-- What giving these tickets back after a move returns now: their price and
-- their share of the fee, never more than the charge has left.
create or replace function public.refund_quote_amount_with_fee(
  p_transaction_id uuid,
  p_ticket_ids     uuid[]
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(least(
           public._refund_amount(p_transaction_id, p_ticket_ids)
             + public._refund_fee_share(p_transaction_id, p_ticket_ids),
           t.amount - coalesce((
             select sum(r.amount)
             from public.transaction_refund r
             where r.transaction_id = p_transaction_id and r.status <> 'failed'
           ), 0)
         ), 0)
  from public.transaction t
  where t.id = p_transaction_id;
$$;

-- refund_prepare, as before, plus the fee share of tickets given back after
-- their event moved.
create or replace function public.refund_prepare(p_transaction_id uuid)
returns setof public.transaction_refund
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn           public.transaction%rowtype;
  v_new           uuid[];
  v_with_fee      uuid[];
  v_all_cancelled boolean;
  v_has_lines     boolean;
  v_before        numeric;
  v_amount        numeric;
  v_fee           numeric := 0;
  v_refund        public.transaction_refund%rowtype;
begin
  select * into v_txn from public.transaction where id = p_transaction_id for update;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if v_txn.status <> 'successful' then
    return;
  end if;
  if coalesce(v_txn.credit_amount, 0) > 0 or v_txn.provider = 'abonten_plan' then
    raise exception 'This payment is refunded as a whole' using errcode = '22023';
  end if;

  -- One refund at a time per payment. A refund left 'preparing' for longer
  -- was abandoned mid-request (the caller never came back): it covers its
  -- tickets no more, as the whole-payment claim expired after two minutes.
  if exists (
    select 1 from public.transaction_refund r
    where r.transaction_id = p_transaction_id
      and r.status = 'preparing'
      and r.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'A refund for this payment is being requested' using errcode = '55P03';
  end if;
  update public.transaction_refund
  set status = 'failed',
      failed_at = now(),
      failure_detail = 'abandoned before the provider answered'
  where transaction_id = p_transaction_id and status = 'preparing';

  select coalesce(array_agg(t.id order by t.id), '{}'::uuid[]),
         coalesce(array_agg(t.id order by t.id) filter (where t.refund_includes_fee), '{}'::uuid[])
    into v_new, v_with_fee
  from public.ticket t
  where t.transaction_id = p_transaction_id
    and t.status = 'cancelled'
    and not exists (
      select 1
      from public.transaction_refund_ticket rt
      join public.transaction_refund r on r.id = rt.refund_id
      where rt.ticket_id = t.id and r.status <> 'failed'
    );
  if cardinality(v_new) = 0 then
    return;
  end if;

  select not exists (
    select 1 from public.ticket t
    where t.transaction_id = p_transaction_id and t.status <> 'cancelled'
  ) into v_all_cancelled;
  select exists (
    select 1 from public.ticket t
    where t.transaction_id = p_transaction_id and t.ticket_checkout_id is not null
  ) into v_has_lines;
  select coalesce(sum(r.amount), 0) into v_before
  from public.transaction_refund r
  where r.transaction_id = p_transaction_id and r.status <> 'failed';

  v_amount := public._refund_amount(p_transaction_id, v_new);
  -- Tickets with no checkout line (early data) have no price of their own:
  -- the whole payment comes back, as the whole-payment path did.
  if v_all_cancelled and not v_has_lines then
    v_amount := v_txn.amount - v_before;
  elsif cardinality(v_with_fee) > 0 then
    -- Given back after their event moved: their share of the fee too.
    v_fee := public._refund_fee_share(p_transaction_id, v_with_fee);
    v_amount := v_amount + v_fee;
  end if;
  -- Never more than the charge took.
  v_amount := greatest(least(v_amount, v_txn.amount - v_before), 0);
  v_fee := least(v_fee, v_amount);

  insert into public.transaction_refund (
    transaction_id, user_id, currency, amount, completes_payment, fee_amount
  ) values (
    p_transaction_id, v_txn.user_id, v_txn.currency, v_amount, v_all_cancelled, v_fee
  )
  returning * into v_refund;

  insert into public.transaction_refund_ticket (refund_id, ticket_id)
  select v_refund.id, x from unnest(v_new) as x;

  -- The last tickets: the payment reads as being refunded (and, should the
  -- provider refuse, as a failed refund with Retry) exactly as before.
  if v_all_cancelled then
    update public.transaction
    set refund_requested_at = coalesce(refund_requested_at, now()),
        updated_at = now()
    where id = p_transaction_id;
  end if;

  return next v_refund;
  return;
end;
$$;

-- Audit row once the money is back: the ticket revenue returned and, for a
-- refund after a move, the service fee given back (fee revenue down by it).
create or replace function public._refund_fee_adjustment(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.transaction_refund%rowtype;
  v_fee    public.platform_fee_entry%rowtype;
begin
  select * into v_refund from public.transaction_refund where id = p_refund_id;
  if not found or v_refund.amount <= 0 then
    return;
  end if;
  select * into v_fee
  from public.platform_fee_entry
  where transaction_id = v_refund.transaction_id and entry_type = 'fee';
  if not found then
    return;
  end if;

  insert into public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency, refund_id
  ) values (
    v_refund.transaction_id, v_fee.event_id, 'fee_refund_adjustment',
    -1 * (v_refund.amount - v_refund.fee_amount),
    -1 * v_refund.fee_amount,
    -1 * v_refund.amount,
    0,
    -1 * v_refund.fee_amount,
    v_fee.fee_rate, v_fee.currency, p_refund_id
  )
  on conflict (refund_id)
    where entry_type = 'fee_refund_adjustment' and refund_id is not null
    do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moving the event

create or replace function public.event_reschedule(
  p_event_id  uuid,
  p_actor     uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_message   text
)
returns table (reschedule_id uuid, holders integer, refund_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   public.event%rowtype;
  v_message text := btrim(coalesce(p_message, ''));
  v_shift   interval;
  v_until   timestamptz;
  v_id      uuid;
  v_holders integer;
begin
  select * into v_event from public.event where id = p_event_id for update;
  if not found then
    raise exception 'event_reschedule: no such event' using errcode = 'no_data_found';
  end if;
  if v_event.status is distinct from 'published' then
    raise exception 'Only a published event can be moved.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.event_occurrence o where o.event_id = p_event_id) then
    raise exception 'An event with several dates can''t be moved yet.'
      using errcode = 'check_violation';
  end if;
  if v_event.starts_at is null or v_event.starts_at <= now() then
    raise exception 'This event has already started, so it can''t be moved.'
      using errcode = 'check_violation';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'A show needs a start and an end after it.'
      using errcode = 'check_violation';
  end if;
  if p_starts_at <= now() + interval '2 hours' then
    raise exception 'The new date must be at least two hours from now.'
      using errcode = 'check_violation';
  end if;
  if p_starts_at = v_event.starts_at and p_ends_at is not distinct from v_event.ends_at then
    raise exception 'Choose a different date or time.'
      using errcode = 'check_violation';
  end if;
  if length(v_message) = 0 or length(v_message) > 1000 then
    raise exception 'Write a message for your ticket holders (up to 1,000 characters).'
      using errcode = 'check_violation';
  end if;
  if (select count(*) from public.event_reschedule r where r.event_id = p_event_id) >= 2 then
    raise exception 'This event has already been moved twice.'
      using errcode = 'check_violation';
  end if;
  if v_event.series_id is not null and exists (
    select 1 from public.event e
    where e.series_id = v_event.series_id and e.id <> p_event_id
      and e.starts_at = p_starts_at
      and e.status = 'published' and e.archived_at is null
  ) then
    raise exception 'This run already has a show at that time.'
      using errcode = 'unique_violation';
  end if;

  -- Holders may give their tickets back for a full refund for 7 days, and
  -- no later than 48 hours before the new date; never less than a day
  -- (nor past the new start) when the new date is close.
  v_until := least(now() + interval '7 days', p_starts_at - interval '48 hours');
  if v_until < least(now() + interval '24 hours', p_starts_at) then
    v_until := least(now() + interval '24 hours', p_starts_at);
  end if;
  v_shift := p_starts_at - v_event.starts_at;

  insert into public.event_reschedule (
    event_id, moved_by, previous_starts_at, previous_ends_at,
    starts_at, ends_at, message, refund_until
  ) values (
    p_event_id, p_actor, v_event.starts_at, v_event.ends_at,
    p_starts_at, p_ends_at, v_message, v_until
  )
  returning id into v_id;

  update public.event
  set starts_at = p_starts_at,
      ends_at = p_ends_at
  where id = p_event_id;

  -- Live tickets stay valid until the new end.
  update public.ticket t
  set expires_at = p_ends_at,
      updated_at = now()
  from public.ticket_type tt
  where tt.id = t.ticket_type_id
    and tt.event_id = p_event_id
    and t.status = 'active';

  -- Running Pay small small plans keep the same distance to the date.
  update public.ticket_plan p
  set event_starts_at = p_starts_at,
      deadline_at = p.deadline_at + v_shift
  where p.event_id = p_event_id
    and p.status in ('awaiting_payment', 'active');
  update public.ticket_checkout c
  set expires_at = c.expires_at + v_shift
  where c.event_id = p_event_id
    and c.status = 'on_plan'
    and c.expires_at is not null;

  -- One notice per person holding a ticket or a running plan; pushed
  -- through the delivery queue (trg_notification_queue_app_push).
  with people as (
    select t.user_id, min(t.id::text)::uuid as ticket_id
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where tt.event_id = p_event_id and t.status = 'active' and t.user_id is not null
    group by t.user_id
    union
    select p.user_id, null::uuid
    from public.ticket_plan p
    where p.event_id = p_event_id
      and p.status in ('awaiting_payment', 'active')
      and not exists (
        select 1 from public.ticket t
        join public.ticket_type tt on tt.id = t.ticket_type_id
        where tt.event_id = p_event_id and t.status = 'active' and t.user_id = p.user_id
      )
  ),
  inserted as (
    insert into public.notification (user_id, type, title, body, link, data)
    select pe.user_id,
           'event_rescheduled',
           v_event.title || ' has moved',
           'Open your ticket to keep it or get a full refund.',
           '/manage/my-events',
           jsonb_strip_nulls(jsonb_build_object(
             'kind', 'ticket',
             'eventId', p_event_id,
             'ticketId', pe.ticket_id,
             'ticketsSection', 'active',
             'rescheduleId', v_id,
             'notice', jsonb_build_object(
               'id', 'event_rescheduled',
               'params', jsonb_build_object(
                 'title', v_event.title,
                 'startsAt', to_char(p_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'timezone', v_event.timezone
               )
             )
           ))
    from people pe
    returning 1
  )
  select count(*) into v_holders from inserted;

  update public.event_reschedule set holders = v_holders where id = v_id;

  return query select v_id, v_holders, v_until;
end;
$$;

comment on function public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text) is
  'Moves a published single-date event that has not started to a new date, with a message to every holder (docs/architecture/event-reschedule.md). Service role only; the caller has checked the organizer.';

-- The latest move of a public event, for the "Moved from …" line.
create or replace function public.get_event_reschedule(p_event_id uuid)
returns table (
  previous_starts_at timestamptz,
  starts_at          timestamptz,
  moved_at           timestamptz,
  message            text,
  refund_until       timestamptz,
  moves              integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.previous_starts_at, r.starts_at, r.created_at, r.message, r.refund_until,
         (select count(*)::integer from public.event_reschedule x where x.event_id = r.event_id)
  from public.event_reschedule r
  join public.event e on e.id = r.event_id
  where r.event_id = p_event_id
    and e.status::text in ('published', 'canceled')
    and e.moderation_state is distinct from 'removed'
  order by r.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- The notice goes out as a push, urgent like a cancellation.

create or replace function public._notification_queue_app_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
  values (new.id, new.user_id, 'push', 'app',
          new.type in ('event_cancelled', 'event_rescheduled'))
  on conflict (notification_id, channel) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notification_queue_app_push on public.notification;
create trigger trg_notification_queue_app_push
  after insert on public.notification
  for each row
  when (new.type = any (array[
    'review_received', 'event_cancelled', 'event_rescheduled',
    'fieldops_commission_approved', 'fieldops_commission_paid',
    'event_reminder']))
  execute function public._notification_queue_app_push();

-- ---------------------------------------------------------------------------
-- Grants

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public._refund_fee_share(uuid, uuid[])',
    'public._refund_fee_adjustment(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.refund_prepare(uuid)',
    'public.refund_quote_amount_with_fee(uuid, uuid[])',
    'public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

revoke all on function public.get_event_reschedule(uuid) from public;
grant execute on function public.get_event_reschedule(uuid) to anon, authenticated, service_role;

do $check$
begin
  if has_function_privilege('authenticated', 'public.event_reschedule(uuid, uuid, timestamptz, timestamptz, text)', 'execute')
     or has_function_privilege('authenticated', 'public.refund_prepare(uuid)', 'execute')
     or has_function_privilege('anon', 'public.refund_quote_amount_with_fee(uuid, uuid[])', 'execute') then
    raise exception 'migration check: the reschedule and refund functions must stay service role only';
  end if;
end;
$check$;

commit;
