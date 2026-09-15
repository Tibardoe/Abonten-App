-- Push delivery: Expo push receipts, and web push subscriptions.
--
-- 1. Expo push receipts. Sending to Expo returns a *ticket* per message; the
--    real outcome from Apple or Google (DeviceNotRegistered, a bad APNs
--    credential, MessageTooBig...) is only in the *receipt*, fetched later
--    from Expo's getReceipts endpoint, and kept by Expo for about a day.
--    Until now only tickets were read, so a token Apple or Google had
--    retired was retried forever. push_receipt holds each accepted ticket
--    until its receipt is read:
--      * @abonten/services/notifications/sendPushNotification writes a row
--        per accepted ticket (check_after = 15 minutes later, as Expo
--        advises);
--      * run_notification_delivery (pg_cron, every minute) now also calls
--        the web app when a receipt is due, and drops rows older than a day;
--      * POST /api/notifications/deliver reads due receipts
--        (pushReceiptsCore), deletes tokens Expo reports as
--        DeviceNotRegistered, logs other errors, and pushes rows with no
--        receipt yet another 15 minutes back.
--
-- 2. Web push. Browsers that support the Push API (Chrome, Edge, Firefox,
--    Safari 16.4+; iOS only from a home-screen web app) give a subscription:
--    an endpoint on the browser vendor's push service plus two keys.
--    web_push_subscription stores one row per browser. Written only by
--    @abonten/services/notifications/webPushCore after the web session is
--    checked; the endpoint host must be a known push service, so the sender
--    can never be pointed at an arbitrary URL. A 404/410 from the push
--    service deletes the row.
--
-- 3. anonymize_deleted_account also deletes web push subscriptions (it
--    already deleted Expo device tokens). Body otherwise unchanged from
--    production.
--
-- 4. run_notification_delivery: a queued recommendation *email* goes stale
--    after one day like a push (a day-old "picks for you" is not useful);
--    reward emails keep seven days. Nothing queues recommendation email
--    until 20260915100300.
--
-- Access: both tables RLS on, no anon/authenticated privileges.

-- ---------------------------------------------------------------------
-- 1. Expo push receipts
-- ---------------------------------------------------------------------
create table if not exists public.push_receipt (
  ticket_id   text        primary key check (length(ticket_id) between 1 and 100),
  token       text        not null check (length(token) <= 300),
  created_at  timestamptz not null default now(),
  check_after timestamptz not null default now() + interval '15 minutes'
);

comment on table public.push_receipt is
  'Expo push tickets waiting for their receipt (DeviceNotRegistered and other provider errors). Service role only; rows live at most a day.';

create index if not exists idx_push_receipt_check_after
  on public.push_receipt (check_after);

alter table public.push_receipt enable row level security;
revoke all on table public.push_receipt from anon, authenticated;
grant select, insert, update, delete on table public.push_receipt to service_role;

-- ---------------------------------------------------------------------
-- 2. Web push subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.web_push_subscription (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  endpoint        text        not null unique
                              check (endpoint like 'https://%' and length(endpoint) <= 1024),
  p256dh          text        not null check (length(p256dh) between 16 and 200),
  auth            text        not null check (length(auth) between 8 and 100),
  user_agent      text        check (user_agent is null or length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_success_at timestamptz
);

comment on table public.web_push_subscription is
  'Browser push subscriptions (Push API endpoint + keys), one per browser. Written only by @abonten/services/notifications/webPushCore; service role only.';

create index if not exists idx_web_push_subscription_user
  on public.web_push_subscription (user_id, last_seen_at desc);

alter table public.web_push_subscription enable row level security;
revoke all on table public.web_push_subscription from anon, authenticated;
grant select, insert, update, delete on table public.web_push_subscription to service_role;

-- ---------------------------------------------------------------------
-- 3. Account deletion removes web push subscriptions too
-- ---------------------------------------------------------------------
create or replace function public.anonymize_deleted_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suffix          text := replace(left(p_user_id::text, 13), '-', '');
  r                 record;
  v_events_cancelled integer := 0;
  v_events_archived  integer := 0;
  v_drafts_deleted   integer := 0;
  v_places_unclaimed integer := 0;
  v_claims_deleted   integer := 0;
  v_cases_closed     integer := 0;
begin
  if not exists (select 1 from public.user_info where id = p_user_id) then
    raise exception 'anonymize_deleted_account: unknown user %', p_user_id;
  end if;

  for r in
    select id, status from public.verification_case
    where requester_id = p_user_id
      and status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_cases_closed := v_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'account_deleted'
  from public.place_claim_document d
  join public.place_claim_request cr on cr.id = d.claim_request_id
  where cr.claimant_id = p_user_id and cr.status = 'pending'
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_request
  where claimant_id = p_user_id and status = 'pending';
  get diagnostics v_claims_deleted = row_count;

  delete from public.event
  where organizer_id = p_user_id and status = 'draft';
  get diagnostics v_drafts_deleted = row_count;

  update public.event e
     set status = 'canceled'
   where e.organizer_id = p_user_id
     and e.status = 'published'
     and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
     and not exists (
       select 1
       from public.ticket t
       join public.ticket_type tt on tt.id = t.ticket_type_id
       where tt.event_id = e.id and t.status in ('active', 'used'));
  get diagnostics v_events_cancelled = row_count;

  update public.event e
     set archived_at = coalesce(e.archived_at, now())
   where e.organizer_id = p_user_id
     and e.archived_at is null;
  get diagnostics v_events_archived = row_count;

  update public.place
     set claimed = false,
         verified = false,
         verified_at = null,
         verification_case_id = null,
         updated_at = now()
   where owner_id = p_user_id
     and (claimed or verified or verification_case_id is not null);
  get diagnostics v_places_unclaimed = row_count;

  delete from public.device_token where user_id = p_user_id;
  delete from public.web_push_subscription where user_id = p_user_id;
  delete from public.favorite where user_id = p_user_id;
  delete from public.favorite_place where user_id = p_user_id;
  delete from public.event_reminder where user_id = p_user_id;
  delete from public.notification where user_id = p_user_id;
  delete from public.notification_preference where user_id = p_user_id;
  delete from public.notification_subscription where user_id = p_user_id;
  delete from public.user_image_history where user_id = p_user_id;
  delete from public.receiving_account where user_id = p_user_id;
  delete from public.highlight where user_id = p_user_id;
  delete from public.drafts where user_id = p_user_id;

  update public.payment_method
     set status = 'removed',
         is_default = false,
         details = jsonb_strip_nulls(jsonb_build_object(
           'scrubbed', true,
           'brand',   details ->> 'brand',
           'last4',   details ->> 'last4',
           'network', details ->> 'network',
           'bank',    details ->> 'bank')),
         updated_at = now()
   where user_id = p_user_id;

  update public.payout_account
     set status = 'removed',
         is_default = false,
         account_holder_name = 'Deleted user',
         account_number = 'removed',
         updated_at = now()
   where organizer_id = p_user_id;

  update public.user_info
     set full_name = 'Deleted user',
         username = ('deleted_' || v_suffix)::extensions.citext,
         username_is_generated = true,
         avatar_public_id = null,
         avatar_version = null,
         bio = null,
         website = null,
         organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null,
         status_id = 4,
         updated_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'events_cancelled', v_events_cancelled,
    'events_archived',  v_events_archived,
    'drafts_deleted',   v_drafts_deleted,
    'places_unclaimed', v_places_unclaimed,
    'claims_deleted',   v_claims_deleted,
    'cases_closed',     v_cases_closed
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The every-minute delivery tick also wakes the web app for receipts
-- ---------------------------------------------------------------------
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

  -- Too late to be useful. Recommendation email is as perishable as a push.
  update public.notification_delivery d
  set status = 'skipped', detail = 'stale', finished_at = now()
  where d.status = 'queued'
    and d.created_at < now() - case
      when d.channel = 'push' or d.source = 'recommendations' then interval '1 day'
      else interval '7 days'
    end;

  -- Expo keeps receipts for about a day.
  delete from public.push_receipt r
  where r.created_at < now() - interval '1 day';

  select * into v_cfg from public.notification_delivery_config where id = true;
  if v_cfg.dispatch_url is null
     or not (
       exists (select 1 from public._notification_delivery_due(1))
       or exists (select 1 from public.push_receipt r where r.check_after <= now())
     ) then
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

revoke all on function public.run_notification_delivery() from public, anon, authenticated, service_role;
revoke all on function public.anonymize_deleted_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_deleted_account(uuid) to service_role;
