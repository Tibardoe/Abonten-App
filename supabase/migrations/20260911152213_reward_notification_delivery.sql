-- Abonten Rewards: push notifications and emails for reward notices.
--
-- Every reward notice is written by the SQL engine through
-- _reward_notify(), so none of them ever went through
-- createNotificationCore's mobile push -- they were in-app only. This adds
-- a small delivery queue:
--
--   * _reward_notify() now also queues a push for every reward notice, and
--     an email for the ones about credit someone can use now (credit ready,
--     welcome credit, promotion credit earned).
--   * The `notification-delivery` pg_cron job (every minute) pokes
--     POST /api/notifications/deliver on the web app, only while something
--     is due. The route claims the rows (notification_delivery_claim), sends
--     them -- Expo push, Resend email -- and records the outcome
--     (notification_delivery_finish). Several notices for one person in the
--     same run go out as one push / one email.
--   * Pushes wait out the night (21:00-08:00 Accra time); a person gets at
--     most one reward email every 12 hours (later notices wait and go in the
--     next one). A push still waiting after a day, or an email after a week,
--     is dropped as stale.
--   * Two program switches (Admin > Rewards > Program settings) turn each
--     channel off; anything queued for a switched-off channel is skipped.
--
-- The cron call is authenticated with a random token kept in
-- notification_delivery_config (service role only); the route compares it
-- with the row, so no new environment variable is needed. dispatch_url
-- ships NULL (nothing is dispatched) and is set per environment after
-- deploy.

create extension if not exists pg_net;

alter table public.reward_program_setting
  add column if not exists notify_push_enabled boolean not null default true,
  add column if not exists notify_email_enabled boolean not null default true;

create table public.notification_delivery (
  id              bigint generated always as identity primary key,
  notification_id uuid not null references public.notification (id) on delete cascade,
  user_id         uuid not null references public.user_info (id) on delete cascade,
  channel         text not null check (channel in ('push', 'email')),
  status          text not null default 'queued'
                  check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts        integer not null default 0,
  detail          text,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  finished_at     timestamptz,
  unique (notification_id, channel)
);

comment on table public.notification_delivery is
  'Push / email delivery queue for notifications written in SQL (reward notices). Written only by _reward_notify and the notification_delivery_* functions.';

create index notification_delivery_open_idx
  on public.notification_delivery (id) where status in ('queued', 'sending');
create index notification_delivery_user_email_idx
  on public.notification_delivery (user_id, finished_at) where channel = 'email' and status = 'sent';

create table public.notification_delivery_config (
  id                 boolean primary key default true check (id),
  dispatch_url       text,
  token              text not null
                     default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  last_dispatched_at timestamptz,
  updated_at         timestamptz not null default now()
);

insert into public.notification_delivery_config (id) values (true);

alter table public.notification_delivery enable row level security;
alter table public.notification_delivery_config enable row level security;
revoke all on table public.notification_delivery, public.notification_delivery_config
  from anon, authenticated, service_role;
grant select on table public.notification_delivery, public.notification_delivery_config
  to service_role;

-- Rows that can be sent now, oldest first.
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
        extract(hour from (now() at time zone 'Africa/Accra')) between 8 and 20
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

create or replace function public._reward_notify(p_user_id uuid, p_type text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notification (user_id, type, title, body, link, data)
  values (p_user_id, p_type, p_title, p_body, '/rewards', jsonb_build_object('kind', 'rewards'))
  returning id into v_id;

  insert into public.notification_delivery (notification_id, user_id, channel)
  values (v_id, p_user_id, 'push');

  -- Email only for credit the person can use now.
  if p_type in ('reward_available', 'welcome_credit', 'promotion_credit_earned') then
    insert into public.notification_delivery (notification_id, user_id, channel)
    values (v_id, p_user_id, 'email');
  end if;
end;
$$;

-- Claims up to p_limit due rows (marks them `sending`) and returns them with
-- the notification text. Rows for a switched-off channel are skipped first.
create or replace function public.notification_delivery_claim(p_limit integer default 200)
returns table (
  delivery_id     bigint,
  notification_id uuid,
  user_id         uuid,
  channel         text,
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
  update public.notification_delivery d
  set status = 'skipped', detail = 'channel_off', finished_at = now()
  from public.reward_program_setting s
  where s.id = 1
    and d.status = 'queued'
    and ((d.channel = 'push' and not s.notify_push_enabled)
      or (d.channel = 'email' and not s.notify_email_enabled));

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
    returning d.id, d.notification_id, d.user_id, d.channel
  )
  select c.id, c.notification_id, c.user_id, c.channel,
         n.type, n.title, n.body, n.link, n.data, n.created_at
  from claimed c
  join public.notification n on n.id = c.notification_id
  order by c.id;
$$;

-- Records the outcome of claimed rows. 'queued' = a temporary failure: the
-- row goes back in the queue, and fails for good after 5 attempts.
create or replace function public.notification_delivery_finish(
  p_ids bigint[], p_status text, p_detail text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_status not in ('sent', 'skipped', 'failed', 'queued') then
    raise exception 'notification_delivery_finish: unknown status %', p_status;
  end if;

  update public.notification_delivery d
  set status = case when p_status = 'queued' and d.attempts >= 5 then 'failed' else p_status end,
      detail = left(p_detail, 500),
      finished_at = case when p_status = 'queued' and d.attempts < 5 then null else now() end
  where d.id = any (p_ids)
    and d.status = 'sending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- pg_cron, every minute: tidy the queue, then poke the web app if anything
-- is due.
create or replace function public.run_notification_delivery()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.notification_delivery_config;
begin
  -- A claim that never finished (the route timed out or crashed) goes back
  -- in the queue.
  update public.notification_delivery d
  set status = case when d.attempts >= 5 then 'failed' else 'queued' end,
      detail = 'claim_expired',
      finished_at = case when d.attempts >= 5 then now() end
  where d.status = 'sending'
    and d.claimed_at < now() - interval '5 minutes';

  -- Too late to be useful.
  update public.notification_delivery d
  set status = 'skipped', detail = 'stale', finished_at = now()
  where d.status = 'queued'
    and d.created_at < now() - case when d.channel = 'push' then interval '1 day' else interval '7 days' end;

  select * into v_cfg from public.notification_delivery_config where id = true;
  if v_cfg.dispatch_url is null
     or not exists (select 1 from public._notification_delivery_due(1)) then
    return;
  end if;

  perform net.http_post(
    url                  := v_cfg.dispatch_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-delivery-token', v_cfg.token),
    timeout_milliseconds := 30000
  );

  update public.notification_delivery_config
  set last_dispatched_at = now()
  where id = true;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._notification_delivery_due(integer)',
    'public._reward_notify(uuid, text, text, text)',
    'public.run_notification_delivery()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.notification_delivery_claim(integer)',
    'public.notification_delivery_finish(bigint[], text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

select cron.schedule('notification-delivery', '* * * * *',
  $cron$select public.run_notification_delivery();$cron$);
