-- Abonten Safety: trusted contacts, SOS, check-ins and live location
-- (PROJECT.md §65, docs/architecture/safety.md).
--
-- A person names up to five trusted contacts. From the app or the website
-- they can then
--   * press SOS: every contact is texted at once with a link to a live page
--     (where the person is, their note, the event they are at, a button to
--     call them and the local emergency number);
--   * ask Abonten to check in on them: nothing is sent unless they fail to
--     tap "I'm safe" by a time they chose, then the same alert goes out;
--   * share their live location for a few hours, without an alarm.
-- Contacts answer from the page ("on my way", "calling", "can't help") and
-- the person sees it.
--
--   safety_program_setting   switches and limits (ships OFF, audience staff)
--   market.safety_config     emergency numbers per market (Ghana seeded)
--   safety_contact           trusted contacts (pending/accepted/declined)
--   safety_contact_optout    numbers that asked not to be texted
--   safety_session           one SOS / check-in / share; one open per person
--   safety_location          positions while a session is open
--   safety_recipient         who was told about a session, their answer
--   safety_message           outbox of texts, emails and pushes to send
--   safety_session_event     the session's timeline
--
--   safety_record_locations()        positions from the app/website
--   safety_escalate_due_check_ins()  a missed check-in becomes an alert
--   safety_claim_check_in_reminders() "time to check in" pushes due
--   safety_claim_messages()          outbox rows to send now
--   safety_expire_sessions()         ends shares and old alerts
--   run_safety_dispatch()            pg_cron safety-dispatch (every minute)
--   safety_housekeeping()            pg_cron safety-housekeeping (daily)
--
-- Every table has RLS on and no anon/authenticated privileges; every
-- function is service_role only. All writes go through
-- @abonten/services/safety with the service-role client after the
-- transport has proved who is asking. Abonten never contacts an emergency
-- service; it shows and dials the market's numbers.
--
-- Ships OFF: safety_program_setting.enabled = false, audience 'staff',
-- event-team alerts off. SAFETY_KILL_SWITCH on the web deployment wins.

-- ---------------------------------------------------------------------------
-- 1. Programme switches and limits
-- ---------------------------------------------------------------------------

create table public.safety_program_setting (
  id                        smallint primary key default 1 check (id = 1),
  enabled                   boolean not null default false,
  -- staff: active admin_user rows · beta: staff + beta_user_ids · all: everyone
  audience                  text not null default 'staff'
                            check (audience in ('staff', 'beta', 'all')),
  beta_user_ids             uuid[] not null default '{}',
  check_in_enabled          boolean not null default true,
  share_enabled             boolean not null default true,
  -- "Tell the event team" (legal item I4).
  event_team_alerts_enabled boolean not null default false,
  max_contacts              integer not null default 5 check (max_contacts between 1 and 10),
  -- Alerts per person per 24 hours that may send texts; beyond it the
  -- alert still goes by push/email and the app offers the person's own SMS.
  alerts_with_sms_per_day   integer not null default 6 check (alerts_with_sms_per_day between 1 and 50),
  invites_per_day           integer not null default 10 check (invites_per_day between 1 and 50),
  check_in_grace_minutes    integer not null default 5 check (check_in_grace_minutes between 1 and 30),
  -- How long an alert stays open without "I'm safe".
  alert_hours               integer not null default 24 check (alert_hours between 1 and 72),
  share_max_hours           integer not null default 12 check (share_max_hours between 1 and 24),
  location_retention_days   integer not null default 7 check (location_retention_days between 1 and 90),
  session_retention_days    integer not null default 180 check (session_retention_days between 30 and 730),
  updated_at                timestamptz not null default now(),
  updated_by                uuid
);
comment on table public.safety_program_setting is
  'Abonten Safety switches and limits. Ships off (audience staff). Edited only from the admin console (service role); SAFETY_KILL_SWITCH on the web deployment wins over it. Switching off hides the entry points; open sessions keep working until they end.';
insert into public.safety_program_setting (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Emergency numbers per market
-- ---------------------------------------------------------------------------

alter table public.market
  add column safety_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safety_config) = 'object');
comment on column public.market.safety_config is
  'Abonten Safety per market: {"emergencyNumbers":[{"service":"all|police|ambulance|fire","number":"112"}]}. Shown and dialled on every SOS screen; Abonten never calls them itself.';

-- Government of Canada travel advice for Ghana (modified 2026-03-18):
-- 112 for every emergency, police 191 (or 18555), ambulance 193, fire 192.
-- Operational decision J3: confirm with Ghana's services.
update public.market
set safety_config = jsonb_build_object('emergencyNumbers', jsonb_build_array(
      jsonb_build_object('service', 'all', 'number', '112'),
      jsonb_build_object('service', 'police', 'number', '191'),
      jsonb_build_object('service', 'ambulance', 'number', '193'),
      jsonb_build_object('service', 'fire', 'number', '192')))
where country_code = 'GH';

-- ---------------------------------------------------------------------------
-- 3. Trusted contacts
-- ---------------------------------------------------------------------------

create table public.safety_contact (
  id                uuid primary key,
  user_id           uuid not null references public.user_info (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  phone_e164        text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email             text check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  relationship      text not null default 'other'
                    check (relationship in ('family', 'partner', 'friend', 'roommate', 'colleague', 'other')),
  -- The language the texts to this contact are written in.
  locale            text not null default 'en' check (locale in ('en', 'fr', 'es', 'de', 'pt', 'ak')),
  position          smallint not null default 0,
  status            text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  -- The contact's own account: linked only when they accept while signed in.
  contact_user_id   uuid references public.user_info (id) on delete set null,
  -- sha256 of the invite link token (an HMAC of the id; never stored plain).
  invite_token_hash text not null unique,
  invited_at        timestamptz,
  invite_count      smallint not null default 0 check (invite_count between 0 and 10),
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, phone_e164),
  check (contact_user_id is null or contact_user_id <> user_id)
);
create index safety_contact_user_idx on public.safety_contact (user_id, position, created_at);
create index safety_contact_linked_idx on public.safety_contact (contact_user_id) where contact_user_id is not null;
comment on table public.safety_contact is
  'Trusted contacts for Abonten Safety. Written only by @abonten/services/safety (service role). Alerts go to pending and accepted contacts, never declined ones or numbers in safety_contact_optout.';

create table public.safety_contact_optout (
  id          bigint generated always as identity primary key,
  phone_e164  text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- The person this number never wants texts about; null = anyone.
  user_id     uuid references public.user_info (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index safety_contact_optout_one_idx
  on public.safety_contact_optout (phone_e164, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on table public.safety_contact_optout is
  'Numbers that asked Abonten Safety not to text them: about one person (user_id) or anyone (user_id null). Checked before every invite and alert text.';

create or replace function public._safety_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger safety_contact_touch
  before update on public.safety_contact
  for each row execute function public._safety_touch_updated_at();

-- The service checks the limit first; this keeps two parallel requests
-- from both getting under it.
create or replace function public._safety_contact_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('safety_contact:' || new.user_id::text, 0));
  select s.max_contacts into v_max from public.safety_program_setting s where s.id = 1;
  select count(*) into v_count from public.safety_contact c where c.user_id = new.user_id;
  if v_count >= coalesce(v_max, 5) then
    raise exception 'You can have at most % trusted contacts.', coalesce(v_max, 5)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger safety_contact_limit
  before insert on public.safety_contact
  for each row execute function public._safety_contact_limit();

-- ---------------------------------------------------------------------------
-- 4. Sessions, positions, recipients, outbox, timeline
-- ---------------------------------------------------------------------------

create table public.safety_session (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.user_info (id) on delete cascade,
  kind                   text not null check (kind in ('sos', 'check_in', 'share')),
  -- sos starts alerting; check_in is active until due_at + grace, then
  -- alerting; share is active until ends_at. resolved: the person closed
  -- it. expired: it ran out.
  status                 text not null check (status in ('active', 'alerting', 'resolved', 'expired')),
  -- Made once per button press by the app/website: a retried start is a no-op.
  client_request_id      uuid not null,
  started_at             timestamptz not null default now(),
  due_at                 timestamptz,
  reminded_at            timestamptz,
  ends_at                timestamptz not null,
  alerted_at             timestamptz,
  alert_reason           text check (alert_reason in ('sos', 'check_in_missed')),
  resolved_at            timestamptz,
  resolution             text check (resolution in ('safe', 'false_alarm', 'ended', 'expired')),
  note                   text check (char_length(note) <= 280),
  event_id               uuid references public.event (id) on delete set null,
  place_id               uuid references public.place (id) on delete set null,
  event_team_notified_at timestamptz,
  -- The market whose emergency numbers the contact page shows.
  country_code           char(2) check (country_code ~ '^[A-Z]{2}$'),
  last_lat               double precision check (last_lat between -90 and 90),
  last_lng               double precision check (last_lng between -180 and 180),
  last_accuracy_m        real check (last_accuracy_m >= 0),
  last_located_at        timestamptz,
  location_count         integer not null default 0,
  created_via            text not null default 'app' check (created_via in ('app', 'web')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, client_request_id),
  check (kind <> 'check_in' or due_at is not null),
  check ((status in ('resolved', 'expired')) = (resolved_at is not null)),
  check ((status = 'alerting') <= (alerted_at is not null)),
  check ((alerted_at is null) = (alert_reason is null))
);
-- One open session per person: SOS during a check-in or a share turns that
-- session into the alert.
create unique index safety_session_one_open_idx
  on public.safety_session (user_id) where status in ('active', 'alerting');
create index safety_session_user_idx on public.safety_session (user_id, started_at desc);
create index safety_session_due_idx on public.safety_session (due_at)
  where kind = 'check_in' and status = 'active';
create index safety_session_open_ends_idx on public.safety_session (ends_at)
  where status in ('active', 'alerting');
create index safety_session_closed_idx on public.safety_session (resolved_at)
  where status in ('resolved', 'expired');
comment on table public.safety_session is
  'An SOS, a check-in or a location share. One open (active/alerting) per person. Written only by @abonten/services/safety and the safety_* functions (service role).';

create trigger safety_session_touch
  before update on public.safety_session
  for each row execute function public._safety_touch_updated_at();

create table public.safety_location (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.safety_session (id) on delete cascade,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real check (accuracy_m >= 0),
  source      text not null default 'device' check (source in ('device', 'last_known', 'browser'))
);
create index safety_location_session_idx on public.safety_location (session_id, recorded_at desc);
comment on table public.safety_location is
  'Positions sent while a safety session is open. Deleted location_retention_days after the session closes (safety_housekeeping).';

create table public.safety_recipient (
  id                uuid primary key,
  session_id        uuid not null references public.safety_session (id) on delete cascade,
  kind              text not null check (kind in ('contact', 'event_team')),
  contact_id        uuid references public.safety_contact (id) on delete set null,
  -- A linked contact's account, or the event's organizer.
  recipient_user_id uuid references public.user_info (id) on delete set null,
  name              text not null check (char_length(name) between 1 and 120),
  phone_e164        text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email             text check (email is null or char_length(email) <= 254),
  locale            text not null default 'en' check (locale in ('en', 'fr', 'es', 'de', 'pt', 'ak')),
  -- sha256 of the page token (an HMAC of the id; never stored plain).
  view_token_hash   text not null unique,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer not null default 0,
  acknowledgement   text check (acknowledgement in ('on_my_way', 'calling', 'cant_help')),
  acknowledged_at   timestamptz,
  created_at        timestamptz not null default now(),
  check ((acknowledgement is null) = (acknowledged_at is null))
);
-- A plain unique key (nulls are distinct, so event-team rows never clash):
-- the service inserts recipients with ON CONFLICT DO NOTHING through it.
alter table public.safety_recipient
  add constraint safety_recipient_contact_key unique (session_id, contact_id);
create unique index safety_recipient_event_team_idx
  on public.safety_recipient (session_id) where kind = 'event_team';
create index safety_recipient_session_idx on public.safety_recipient (session_id, created_at);
comment on table public.safety_recipient is
  'Who was told about a safety session (a trusted contact or the event team), a snapshot of how to reach them, whether they opened it and what they answered.';

create table public.safety_message (
  id                  bigint generated always as identity primary key,
  -- Whose Safety sent it (limits, retention).
  user_id             uuid not null references public.user_info (id) on delete cascade,
  -- An invite belongs to a contact; everything else to a session recipient.
  contact_id          uuid references public.safety_contact (id) on delete cascade,
  recipient_id        uuid references public.safety_recipient (id) on delete cascade,
  invite_round        smallint,
  purpose             text not null check (purpose in
                        ('invite', 'share', 'alert', 'check_in_missed', 'safe', 'false_alarm', 'event_team')),
  channel             text not null check (channel in ('sms', 'email', 'push')),
  status              text not null default 'pending'
                      check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            smallint not null default 0,
  provider_message_id text,
  last_error          text check (char_length(last_error) <= 500),
  next_attempt_at     timestamptz not null default now(),
  claimed_at          timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  check ((contact_id is not null) <> (recipient_id is not null)),
  check ((purpose = 'invite') = (contact_id is not null)),
  check ((invite_round is not null) = (contact_id is not null))
);
-- Plain unique keys (nulls are distinct, so an invite never clashes with a
-- session message): the service queues with ON CONFLICT DO NOTHING.
alter table public.safety_message
  add constraint safety_message_recipient_key unique (recipient_id, purpose, channel),
  add constraint safety_message_invite_key unique (contact_id, channel, invite_round);
create index safety_message_due_idx on public.safety_message (next_attempt_at) where status = 'pending';
create index safety_message_sending_idx on public.safety_message (claimed_at) where status = 'sending';
create index safety_message_user_idx on public.safety_message (user_id, created_at desc);
comment on table public.safety_message is
  'Outbox of Abonten Safety texts, emails and pushes. Rows are claimed by safety_claim_messages() and finished by @abonten/services/safety/safetyNotifyCore; unique keys make every send idempotent.';

create table public.safety_session_event (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.safety_session (id) on delete cascade,
  at           timestamptz not null default now(),
  kind         text not null check (kind in
                 ('started', 'alerted', 'note', 'extended', 'event_team', 'viewed',
                  'acknowledged', 'resolved', 'expired', 'reminded')),
  recipient_id uuid references public.safety_recipient (id) on delete set null,
  detail       jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object')
);
create index safety_session_event_session_idx on public.safety_session_event (session_id, at);
comment on table public.safety_session_event is
  'Timeline of a safety session, shown on the contact page and in Admin › Safety. Never holds a position.';

-- ---------------------------------------------------------------------------
-- 5. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'safety_program_setting', 'safety_contact', 'safety_contact_optout',
    'safety_session', 'safety_location', 'safety_recipient',
    'safety_message', 'safety_session_event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------------

-- Positions from the app or the website, oldest first. Points closer than
-- 5 seconds to the previous one are dropped; a point more than 15 minutes
-- before the session started is dropped (a stale last-known fix); a point
-- from the future is taken as now. After 5,000 points only the session's
-- last position moves.
create or replace function public.safety_record_locations(
  p_session_id uuid,
  p_user_id uuid,
  p_points jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session   public.safety_session;
  v_point     jsonb;
  v_at        timestamptz;
  v_lat       double precision;
  v_lng       double precision;
  v_acc       real;
  v_source    text;
  v_last      timestamptz;
  v_accepted  integer := 0;
  v_new_lat   double precision;
  v_new_lng   double precision;
  v_new_acc   real;
  v_moved     boolean := false;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_session
  from public.safety_session s
  where s.id = p_session_id and s.user_id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_session.status not in ('active', 'alerting') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_last := v_session.last_located_at;

  for v_point in
    select value
    from jsonb_array_elements(p_points)
    where jsonb_typeof(value) = 'object'
    order by value ->> 'at'
    limit 20
  loop
    begin
      v_at := least((v_point ->> 'at')::timestamptz, now());
      v_lat := (v_point ->> 'lat')::double precision;
      v_lng := (v_point ->> 'lng')::double precision;
      v_acc := nullif(v_point ->> 'accuracyM', '')::real;
      v_source := coalesce(v_point ->> 'source', 'device');
    exception when others then
      continue;
    end;
    if v_at is null or v_lat is null or v_lng is null
       or v_lat not between -90 and 90 or v_lng not between -180 and 180
       or (v_acc is not null and v_acc < 0)
       or v_source not in ('device', 'last_known', 'browser') then
      continue;
    end if;
    if v_at < v_session.started_at - interval '15 minutes' then
      continue;
    end if;
    if v_last is not null and v_at < v_last + interval '5 seconds' then
      continue;
    end if;

    if v_session.location_count + v_accepted < 5000 then
      insert into public.safety_location (session_id, recorded_at, lat, lng, accuracy_m, source)
      values (p_session_id, v_at, v_lat, v_lng, v_acc, v_source);
      v_accepted := v_accepted + 1;
    end if;
    v_last := v_at;
    v_new_lat := v_lat;
    v_new_lng := v_lng;
    v_new_acc := v_acc;
    v_moved := true;
  end loop;

  if v_moved then
    update public.safety_session s
    set last_lat = v_new_lat,
        last_lng = v_new_lng,
        last_accuracy_m = v_new_acc,
        last_located_at = v_last,
        location_count = s.location_count + v_accepted
    where s.id = p_session_id;
  end if;

  return jsonb_build_object('ok', true, 'accepted', v_accepted, 'lastLocatedAt', v_last);
end;
$$;

-- Check-ins whose time plus the grace has passed become alerts. Row-locked
-- with skip locked, so two dispatcher runs can never both escalate one.
create or replace function public.safety_escalate_due_check_ins()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace integer;
  v_hours integer;
begin
  select s.check_in_grace_minutes, s.alert_hours into v_grace, v_hours
  from public.safety_program_setting s where s.id = 1;
  v_grace := coalesce(v_grace, 5);
  v_hours := coalesce(v_hours, 24);

  return query
  with due as (
    select s.id
    from public.safety_session s
    where s.kind = 'check_in'
      and s.status = 'active'
      and s.due_at + make_interval(mins => v_grace) <= now()
    for update skip locked
  ), escalated as (
    update public.safety_session s
    set status = 'alerting',
        alerted_at = now(),
        alert_reason = 'check_in_missed',
        ends_at = now() + make_interval(hours => v_hours)
    from due
    where s.id = due.id
    returning s.id
  ), logged as (
    insert into public.safety_session_event (session_id, kind, detail)
    select e.id, 'alerted', jsonb_build_object('reason', 'check_in_missed')
    from escalated e
    returning session_id
  )
  select l.session_id from logged l;
end;
$$;

-- Check-ins whose time has come: the person gets one "time to check in"
-- push. Marked as they are claimed, so it goes once.
create or replace function public.safety_claim_check_in_reminders()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.id
    from public.safety_session s
    where s.kind = 'check_in'
      and s.status = 'active'
      and s.reminded_at is null
      and s.due_at <= now()
    for update skip locked
  )
  update public.safety_session s
  set reminded_at = now()
  from due
  where s.id = due.id
  returning s.id;
end;
$$;

-- Outbox rows to send now (or exactly p_ids, when the request that wrote
-- them sends them itself). A claim that never finished goes back after five
-- minutes.
create or replace function public.safety_claim_messages(
  p_limit integer default 100,
  p_ids bigint[] default null
)
returns setof bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.safety_message m
  set status = 'pending', claimed_at = null
  where m.status = 'sending'
    and m.claimed_at < now() - interval '5 minutes';

  return query
  with c as (
    select m.id
    from public.safety_message m
    where m.status = 'pending'
      and (
        (p_ids is not null and m.id = any (p_ids))
        or (p_ids is null and m.next_attempt_at <= now())
      )
    order by m.next_attempt_at, m.id
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
    for update skip locked
  )
  update public.safety_message m
  set status = 'sending', claimed_at = now(), attempts = m.attempts + 1
  from c
  where m.id = c.id
  returning m.id;
end;
$$;

-- Shares and alerts whose time is up. A check-in that is still waiting to be
-- escalated is left to the dispatcher (escalation comes first).
create or replace function public.safety_expire_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with done as (
    select s.id, s.kind, s.status
    from public.safety_session s
    where s.status in ('active', 'alerting')
      and s.ends_at <= now()
      and not (s.kind = 'check_in' and s.status = 'active')
    for update skip locked
  ), closed as (
    update public.safety_session s
    set status = 'expired',
        resolved_at = now(),
        resolution = case when done.status = 'active' then 'ended' else 'expired' end
    from done
    where s.id = done.id
    returning s.id
  ), logged as (
    insert into public.safety_session_event (session_id, kind)
    select c.id, 'expired' from closed c
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

create or replace function public.safety_dispatch_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.safety_session s
           where s.kind = 'check_in' and s.status = 'active' and s.due_at <= now()
             and (s.reminded_at is null
                  or s.due_at + make_interval(mins => coalesce(
                       (select p.check_in_grace_minutes from public.safety_program_setting p where p.id = 1), 5))
                     <= now()))
      or exists (
           select 1 from public.safety_message m
           where m.status = 'pending' and m.next_attempt_at <= now())
      or exists (
           select 1 from public.safety_message m
           where m.status = 'sending' and m.claimed_at < now() - interval '5 minutes');
$$;

-- pg_cron safety-dispatch, every minute. The route lives on the same host
-- as the notification-delivery route and takes the same token, so no
-- environment needs new configuration.
create or replace function public.run_safety_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.notification_delivery_config;
  v_url text;
begin
  perform public.safety_expire_sessions();

  if not public.safety_dispatch_due() then
    return;
  end if;

  select * into v_cfg from public.notification_delivery_config where id = true;
  if v_cfg.dispatch_url is null then
    return;
  end if;
  v_url := regexp_replace(v_cfg.dispatch_url, '/api/notifications/deliver/?$', '/api/safety/dispatch');
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

-- pg_cron safety-housekeeping, daily: positions go location_retention_days
-- after a session closes, sessions (with their recipients, outbox and
-- timeline) session_retention_days after, old invite rows with them.
create or replace function public.safety_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc_days     integer;
  v_session_days integer;
  v_points       integer;
  v_cleared      integer;
  v_sessions     integer;
  v_invites      integer;
begin
  select s.location_retention_days, s.session_retention_days
  into v_loc_days, v_session_days
  from public.safety_program_setting s where s.id = 1;
  v_loc_days := coalesce(v_loc_days, 7);
  v_session_days := coalesce(v_session_days, 180);

  delete from public.safety_location l
  using public.safety_session s
  where l.session_id = s.id
    and s.status in ('resolved', 'expired')
    and s.resolved_at < now() - make_interval(days => v_loc_days);
  get diagnostics v_points = row_count;

  update public.safety_session s
  set last_lat = null, last_lng = null, last_accuracy_m = null
  where s.status in ('resolved', 'expired')
    and s.resolved_at < now() - make_interval(days => v_loc_days)
    and s.last_lat is not null;
  get diagnostics v_cleared = row_count;

  delete from public.safety_session s
  where s.status in ('resolved', 'expired')
    and s.resolved_at < now() - make_interval(days => v_session_days);
  get diagnostics v_sessions = row_count;

  delete from public.safety_message m
  where m.contact_id is not null
    and m.created_at < now() - make_interval(days => v_session_days);
  get diagnostics v_invites = row_count;

  return jsonb_build_object('points', v_points, 'positionsCleared', v_cleared,
                            'sessions', v_sessions, 'invites', v_invites, 'at', now());
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._safety_touch_updated_at()',
    'public._safety_contact_limit()',
    'public.safety_record_locations(uuid, uuid, jsonb)',
    'public.safety_escalate_due_check_ins()',
    'public.safety_claim_check_in_reminders()',
    'public.safety_claim_messages(integer, bigint[])',
    'public.safety_expire_sessions()',
    'public.safety_dispatch_due()',
    'public.run_safety_dispatch()',
    'public.safety_housekeeping()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Admin permissions
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('safety.view',      'View Abonten Safety',
     'See safety sessions, who was told and whether texts arrived (never where anyone was), and the settings.'),
  ('safety.configure', 'Configure Abonten Safety',
     'Turn Abonten Safety on or off, choose the audience and change its limits. Requires step-up.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',    'safety.view'),
  ('operations',    'safety.configure'),
  ('support_admin', 'safety.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Jobs
-- ---------------------------------------------------------------------------

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('safety-dispatch', 'safety-housekeeping');

select cron.schedule('safety-dispatch', '* * * * *',
  $cron$select public.run_safety_dispatch();$cron$);
select cron.schedule('safety-housekeeping', '50 3 * * *',
  $cron$select public.safety_housekeeping();$cron$);

-- ---------------------------------------------------------------------------
-- 9. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'safety_program_setting', 'safety_contact', 'safety_contact_optout',
    'safety_session', 'safety_location', 'safety_recipient',
    'safety_message', 'safety_session_event'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert') then
      raise exception 'migration check: % is reachable from the apps', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.safety_record_locations(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.safety_record_locations(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.run_safety_dispatch()', 'execute') then
    raise exception 'migration check: a safety function is callable by the apps';
  end if;
  if (select enabled from public.safety_program_setting where id = 1) then
    raise exception 'migration check: Abonten Safety must ship switched off';
  end if;
  if not exists (select 1 from cron.job where jobname = 'safety-dispatch' and active)
     or not exists (select 1 from cron.job where jobname = 'safety-housekeeping' and active) then
    raise exception 'migration check: the safety jobs are not scheduled';
  end if;
end;
$$;
