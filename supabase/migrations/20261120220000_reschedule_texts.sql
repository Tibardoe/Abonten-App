-- Text messages when an event moves or is postponed (2026-11-20,
-- docs/architecture/event-reschedule.md §1; decision RS3 changed at the
-- founder's request: "do all of Not in this version").
--
-- Every person told by the in-app notice who has a verified phone gets one
-- short text as well (in their language, with the link to their tickets):
--
--   event_reschedule_text           the outbox, one row per person per move
--                                   (unique), written by
--                                   event_reschedule_queue_texts() right after
--                                   the move. Service role only; it holds no
--                                   phone number (read at send time).
--   event_reschedule_claim_texts()  claims due rows with row locks, so an
--                                   overlapping call cannot text anyone twice.
--   run_reschedule_text_dispatch()  pg_cron reschedule-texts (every minute),
--                                   only while something is due: POSTs to
--                                   /api/jobs/reschedule-texts on the host of
--                                   the notification-delivery route, with its
--                                   token (no new configuration).
--
-- The web and app transports also start a short dispatch right after the
-- move; the job finishes what that did not. Which numbers can be texted
-- (a market whose text rail is Hubtel), the cap per move and the kill
-- switch (RESCHEDULE_TEXTS_KILL_SWITCH) are the service's.

begin;

create table if not exists public.event_reschedule_text (
  id              bigint generated always as identity primary key,
  reschedule_id   uuid not null references public.event_reschedule(id) on delete cascade,
  user_id         uuid not null references public.user_info(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  provider_ref    text,
  detail          text check (detail is null or length(detail) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (reschedule_id, user_id)
);

create index if not exists event_reschedule_text_due_idx
  on public.event_reschedule_text (next_attempt_at)
  where status = 'pending';

alter table public.event_reschedule_text enable row level security;
revoke all on table public.event_reschedule_text from anon, authenticated;
grant all on table public.event_reschedule_text to service_role;

comment on table public.event_reschedule_text is
  'Texts to holders when an event moves or is postponed: one row per person per move, sent by the reschedule-texts job (docs/architecture/event-reschedule.md). Service role only; holds no phone number.';

-- Who gets a text for a move: every person its notice went to who has a
-- verified phone and an active account. Returns how many were queued.
create or replace function public.event_reschedule_queue_texts(p_reschedule_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with people as (
    select distinct n.user_id
    from public.notification n
    where n.type = 'event_rescheduled'
      and n.data ->> 'rescheduleId' = p_reschedule_id::text
  ),
  inserted as (
    insert into public.event_reschedule_text (reschedule_id, user_id)
    select p_reschedule_id, p.user_id
    from people p
    join public.user_info ui on ui.id = p.user_id and ui.status_id = 1
    join auth.users u on u.id = p.user_id
    where u.phone is not null and u.phone <> '' and u.phone_confirmed_at is not null
    on conflict (reschedule_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

-- Due rows, claimed with row locks; a row stuck in 'sending' for five
-- minutes (a dispatcher that died) is due again.
create or replace function public.event_reschedule_claim_texts(p_limit integer default 50)
returns setof public.event_reschedule_text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_reschedule_text t
  set status = 'pending', claimed_at = null, updated_at = now()
  where t.status = 'sending'
    and t.claimed_at < now() - interval '5 minutes';

  return query
  with c as (
    select t.id
    from public.event_reschedule_text t
    where t.status = 'pending'
      and t.next_attempt_at <= now()
    order by t.next_attempt_at, t.id
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    for update skip locked
  )
  update public.event_reschedule_text t
  set status = 'sending', claimed_at = now(), attempts = t.attempts + 1, updated_at = now()
  from c
  where t.id = c.id
  returning t.*;
end;
$$;

create or replace function public.event_reschedule_texts_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_reschedule_text t
    where (t.status = 'pending' and t.next_attempt_at <= now())
       or (t.status = 'sending' and t.claimed_at < now() - interval '5 minutes')
  );
$$;

-- pg_cron reschedule-texts, every minute, only while something is due.
create or replace function public.run_reschedule_text_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.notification_delivery_config;
  v_url text;
begin
  if not public.event_reschedule_texts_due() then
    return;
  end if;

  select * into v_cfg from public.notification_delivery_config where id = true;
  if v_cfg.dispatch_url is null then
    return;
  end if;
  v_url := regexp_replace(v_cfg.dispatch_url, '/api/notifications/deliver/?$', '/api/jobs/reschedule-texts');
  if v_url = v_cfg.dispatch_url then
    return;
  end if;

  perform net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-delivery-token', v_cfg.token),
    timeout_milliseconds := 30000
  );
end;
$$;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.event_reschedule_queue_texts(uuid)',
    'public.event_reschedule_claim_texts(integer)',
    'public.event_reschedule_texts_due()',
    'public.run_reschedule_text_dispatch()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'reschedule-texts';

select cron.schedule('reschedule-texts', '* * * * *',
  $cron$select public.run_reschedule_text_dispatch();$cron$);

do $check$
begin
  if has_table_privilege('authenticated', 'public.event_reschedule_text', 'select')
     or has_table_privilege('anon', 'public.event_reschedule_text', 'select')
     or has_function_privilege('authenticated', 'public.event_reschedule_queue_texts(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.run_reschedule_text_dispatch()', 'execute') then
    raise exception 'migration check: reschedule texts are service role only';
  end if;
  if not exists (select 1 from cron.job where jobname = 'reschedule-texts' and active) then
    raise exception 'migration check: the reschedule-texts job is not scheduled';
  end if;
end;
$check$;

commit;
