-- Follow-ups to the reward notice delivery queue (20260911152213):
--
-- 1. People can stop reward emails. notification_preference holds the
--    choice (server-written only: the Rewards page switch, the app, and the
--    signed unsubscribe link in every reward email). The delivery claim
--    skips a queued email for someone who opted out ('opted_out').
--
-- 2. The two other notices written in SQL now reach the phone too: "New
--    review" (the review triggers) and "Event cancelled"
--    (cancel_event_and_release_tickets). Rather than copy those functions,
--    an AFTER INSERT trigger on notification queues a push for exactly these
--    two types (source 'app'); nothing else is affected, and the notices
--    createNotificationCore writes already push on their own. An event
--    cancellation is urgent (it goes out at night too); a review waits for
--    the morning like reward pushes. A BEFORE INSERT trigger gives the
--    cancellation notice `data = {kind: 'ticket', ticketsSection}` so a tap
--    (push or in-app list) opens the app's Tickets tab on Refunds (paid) or
--    Cancelled (free) -- the same tab its web link opens, which had no app
--    route.
--
-- The program's push / email switches (Admin > Rewards > Program settings)
-- only apply to reward notices (source 'rewards').

create table public.notification_preference (
  user_id       uuid primary key references public.user_info (id) on delete cascade,
  reward_emails boolean not null default true,
  updated_at    timestamptz not null default now()
);

comment on table public.notification_preference is
  'Per-person notification choices. Written only by @abonten/services (service role) after it has identified the person.';

alter table public.notification_preference enable row level security;
revoke all on table public.notification_preference from anon, authenticated, service_role;
grant select, insert, update on table public.notification_preference to service_role;

alter table public.notification_delivery
  add column source text not null default 'rewards' check (source in ('rewards', 'app')),
  add column urgent boolean not null default false;

create or replace function public._notification_delivery_due(p_limit integer)
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.notification_delivery d
  where d.status = 'queued'
    and case d.channel
      when 'push' then
        d.urgent or extract(hour from (now() at time zone 'Africa/Accra')) between 8 and 20
      else not exists (
        select 1 from public.notification_delivery s
        where s.user_id = d.user_id
          and s.channel = 'email'
          and s.status = 'sent'
          and s.finished_at > now() - interval '12 hours'
      )
    end
  order by d.id
  limit greatest(p_limit, 0);
$$;

-- The return type gains `source`, so the function is recreated.
drop function public.notification_delivery_claim(integer);

create function public.notification_delivery_claim(p_limit integer default 200)
returns table (
  delivery_id     bigint,
  notification_id uuid,
  user_id         uuid,
  channel         text,
  source          text,
  type            text,
  title           text,
  body            text,
  link            text,
  data            jsonb,
  created_at      timestamptz
)
language sql
security definer
set search_path = ''
as $$
  -- The program switches cover reward notices only.
  update public.notification_delivery d
  set status = 'skipped', detail = 'channel_off', finished_at = now()
  from public.reward_program_setting s
  where s.id = 1
    and d.status = 'queued'
    and d.source = 'rewards'
    and ((d.channel = 'push' and not s.notify_push_enabled)
      or (d.channel = 'email' and not s.notify_email_enabled));

  update public.notification_delivery d
  set status = 'skipped', detail = 'opted_out', finished_at = now()
  where d.status = 'queued'
    and d.channel = 'email'
    and exists (
      select 1 from public.notification_preference p
      where p.user_id = d.user_id and not p.reward_emails
    );

  with due as (
    select d.id
    from public.notification_delivery d
    where d.id in (select public._notification_delivery_due(least(greatest(p_limit, 1), 500)))
    for update skip locked
  ), claimed as (
    update public.notification_delivery d
    set status = 'sending', attempts = d.attempts + 1, claimed_at = now()
    from due
    where d.id = due.id
    returning d.id, d.notification_id, d.user_id, d.channel, d.source
  )
  select c.id, c.notification_id, c.user_id, c.channel, c.source,
         n.type, n.title, n.body, n.link, n.data, n.created_at
  from claimed c
  join public.notification n on n.id = c.notification_id
  order by c.id;
$$;

create or replace function public._notification_route_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data is null or new.data = '{}'::jsonb then
    new.data := jsonb_build_object(
      'kind', 'ticket',
      'ticketsSection', case when new.link like '%tab=refunds%' then 'refunds' else 'cancelled' end);
  end if;
  return new;
end;
$$;

create or replace function public._notification_queue_app_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
  values (new.id, new.user_id, 'push', 'app', new.type = 'event_cancelled')
  on conflict (notification_id, channel) do nothing;
  return new;
end;
$$;

create trigger trg_notification_route_cancelled
  before insert on public.notification
  for each row when (new.type = 'event_cancelled')
  execute function public._notification_route_cancelled();

create trigger trg_notification_queue_app_push
  after insert on public.notification
  for each row when (new.type in ('review_received', 'event_cancelled'))
  execute function public._notification_queue_app_push();

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._notification_delivery_due(integer)',
    'public._notification_route_cancelled()',
    'public._notification_queue_app_push()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  execute 'revoke all on function public.notification_delivery_claim(integer) from public, anon, authenticated';
  execute 'grant execute on function public.notification_delivery_claim(integer) to service_role';
end;
$$;
