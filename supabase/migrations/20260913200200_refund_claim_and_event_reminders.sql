-- Two money/attendance fixes from the 2026-09-13 platform audit.
--
-- 1. claim_transaction_refund(): one refund request per transaction at a
--    time. issueRefundCore asked Paystack for the refund BEFORE
--    record_refund_hold moved the transaction to refund_pending, so two
--    callers arriving together (a double-tapped "Cancel ticket", or a
--    customer cancelling while an admin refunds the same order) could both
--    read status = 'successful' and both send Paystack a partial refund.
--    Because the service fee is retained, each partial refund is smaller
--    than the charge, and Paystack accepts several partial refunds up to
--    the full amount -- so the customer could be paid back twice. The
--    claim below is an atomic compare-and-set on refund_requested_at; the
--    second caller gets false and stops.
--
-- 2. Event reminders. Ticket holders got no reminder from Abonten at all
--    unless they set one themselves in the app. The hourly
--    `event-reminders` job now writes a "Tomorrow: <event>" notice (in-app
--    plus a push through the delivery queue) to everyone holding an active
--    ticket for a session starting in 23-25 hours, once per person per
--    session, skipping people who already set their own reminder for that
--    event in the app. Cancelled, hidden and archived events, and accounts
--    that are not active, are left alone.

-- ---------------------------------------------------------------------------
-- 1. Refund claim
-- ---------------------------------------------------------------------------
create or replace function public.claim_transaction_refund(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.transaction t
     set refund_requested_at = now(),
         updated_at = now()
   where t.id = p_transaction_id
     and t.status = 'successful'
     and (t.refund_requested_at is null
          or t.refund_requested_at < now() - interval '2 minutes')
  returning t.id into v_id;
  return v_id is not null;
end;
$$;

comment on function public.claim_transaction_refund(uuid) is
  'Compare-and-set before asking Paystack for a refund: true when this caller now owns the request, false when another request is in flight (or the transaction is not refundable). A failed attempt can be retried after two minutes.';

revoke all on function public.claim_transaction_refund(uuid) from public, anon, authenticated;
grant execute on function public.claim_transaction_refund(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Event reminders
-- ---------------------------------------------------------------------------
create table public.event_reminder_sent (
  user_id           uuid not null references public.user_info (id) on delete cascade,
  event_id          uuid not null references public.event (id) on delete cascade,
  session_starts_at timestamptz not null,
  kind              text not null check (kind in ('day_before')),
  sent_at           timestamptz not null default now(),
  primary key (user_id, event_id, session_starts_at, kind)
);

comment on table public.event_reminder_sent is
  'One row per reminder Abonten sent a ticket holder for an event session, so the hourly job never repeats one.';

alter table public.event_reminder_sent enable row level security;
revoke all on table public.event_reminder_sent from anon, authenticated, service_role;
grant select on table public.event_reminder_sent to service_role;

create or replace function public.event_reminders_enqueue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent integer := 0;
begin
  with sessions as (
    select
      t.user_id,
      e.id as event_id,
      e.title,
      e.address ->> 'full_address' as full_address,
      coalesce(o.starts_at, e.starts_at) as starts_at,
      min(t.id::text)::uuid as ticket_id
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    join public.event e on e.id = tt.event_id
    join public.user_info ui on ui.id = t.user_id
    left join public.event_occurrence o on o.id = t.occurrence_id
    where t.status = 'active'
      and ui.status_id = 1
      and e.status = 'published'
      and e.archived_at is null
      and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')
      and coalesce(o.starts_at, e.starts_at) >= now() + interval '23 hours'
      and coalesce(o.starts_at, e.starts_at) <  now() + interval '25 hours'
      -- People who set their own reminder in the app already get one.
      and not exists (
        select 1 from public.event_reminder r
        where r.user_id = t.user_id and r.event_id = e.id)
    group by t.user_id, e.id, e.title, e.address, o.starts_at, e.starts_at
  ), fresh as (
    insert into public.event_reminder_sent (user_id, event_id, session_starts_at, kind)
    select s.user_id, s.event_id, s.starts_at, 'day_before'
    from sessions s
    on conflict do nothing
    returning user_id, event_id, session_starts_at
  )
  insert into public.notification (user_id, type, title, body, link, data)
  select
    s.user_id,
    'event_reminder',
    'Tomorrow: ' || s.title,
    'Starts ' || to_char(s.starts_at at time zone 'Africa/Accra', 'FMDay HH24:MI')
      || case when coalesce(s.full_address, '') <> '' then ' at ' || s.full_address else '' end
      || '. Your ticket is in My Events.',
    '/manage/my-events',
    jsonb_build_object('kind', 'ticket', 'eventId', s.event_id, 'ticketId', s.ticket_id)
  from fresh f
  join sessions s
    on s.user_id = f.user_id
   and s.event_id = f.event_id
   and s.starts_at = f.session_starts_at;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.event_reminders_enqueue() from public, anon, authenticated;
grant execute on function public.event_reminders_enqueue() to service_role;

-- The app-push trigger on notification lists the SQL-written types that
-- go out as a push through the delivery queue; reminders join that list
-- (not urgent: they wait out the night like the rest).
drop trigger if exists trg_notification_queue_app_push on public.notification;
create trigger trg_notification_queue_app_push
  after insert on public.notification
  for each row
  when (new.type = any (array[
    'review_received', 'event_cancelled',
    'fieldops_commission_approved', 'fieldops_commission_paid',
    'event_reminder']))
  execute function public._notification_queue_app_push();

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'event-reminders';

select cron.schedule('event-reminders', '7 * * * *',
  $$select public.event_reminders_enqueue();$$);
