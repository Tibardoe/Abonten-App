-- Abonten Rewards, Phase 4a: referral link capture and attribution.
--
-- Every signed-in user gets one personal referral code. Share links carry it
-- as ?ref=CODE. A visit through such a link is logged as a referral_touch;
-- for a signed-in visitor the latest touch per event is also kept in
-- referral_attribution, so it survives a device change. When the visitor
-- opens a checkout, the server picks the winning touch (last touch within
-- the attribution window) and stamps the referrer onto the ticket_checkout
-- rows. That stamp is what the reward engine (Phase 4b) evaluates, and it
-- can't be changed afterwards.
--
-- Nothing here pays anyone. Capture only runs while
-- reward_program_setting.referral_capture_enabled is on (ships off).
--
-- Clients can read their own code and nothing else; every write goes
-- through the service-role functions below, after the server has resolved
-- who the caller is. A client-supplied code is only ever a hint.

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------

alter table public.reward_program_setting
  add column if not exists referral_attribution_window_days integer not null default 7
    check (referral_attribution_window_days between 1 and 90);

-- ---------------------------------------------------------------------
-- referral_code: one per user
-- ---------------------------------------------------------------------

-- 7 characters from an alphabet without look-alikes (no I, L, O, 0, 1).
create table if not exists public.referral_code (
  code            text        primary key check (code ~ '^[ABCDEFGHJKMNP-Z2-9]{7}$'),
  user_id         uuid        not null unique references public.user_info (id) on delete cascade,
  created_at      timestamptz not null default now(),
  disabled_at     timestamptz,
  disabled_reason text,
  disabled_by     uuid
);

-- ---------------------------------------------------------------------
-- referral_touch: the click log (90-day retention)
-- ---------------------------------------------------------------------
-- A plain table with a daily purge rather than monthly partitions: at
-- today's volume partitions only add privilege footguns (each new partition
-- is a table PostgREST can see). Partition it once it passes ~50M rows.

create table if not exists public.referral_touch (
  id               uuid        primary key default gen_random_uuid(),
  code             text        not null,
  referrer_user_id uuid        not null references public.user_info (id) on delete cascade,
  event_id         uuid        references public.event (id) on delete set null,
  place_id         uuid        references public.place (id) on delete set null,
  visitor_user_id  uuid        references public.user_info (id) on delete set null,
  install_id       text        check (install_id is null or length(install_id) between 8 and 100),
  -- Salted hashes only; never the raw IP or user agent.
  ip_hash          text,
  ua_hash          text,
  platform         text        not null check (platform in ('web', 'android', 'ios')),
  source           text        not null default 'link'
                     check (source in ('link', 'qr', 'install_referrer')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_referral_touch_code_created
  on public.referral_touch (code, created_at desc);
create index if not exists idx_referral_touch_referrer
  on public.referral_touch (referrer_user_id, created_at desc);
create index if not exists idx_referral_touch_event
  on public.referral_touch (event_id, created_at desc) where event_id is not null;
create index if not exists idx_referral_touch_place
  on public.referral_touch (place_id) where place_id is not null;
create index if not exists idx_referral_touch_visitor
  on public.referral_touch (visitor_user_id) where visitor_user_id is not null;
create index if not exists idx_referral_touch_created
  on public.referral_touch using brin (created_at);

-- ---------------------------------------------------------------------
-- referral_attribution: a signed-in visitor's latest touch per event
-- ---------------------------------------------------------------------

create table if not exists public.referral_attribution (
  user_id          uuid        not null references public.user_info (id) on delete cascade,
  event_id         uuid        not null references public.event (id) on delete cascade,
  referrer_user_id uuid        not null references public.user_info (id) on delete cascade,
  code             text        not null,
  source           text        not null,
  touched_at       timestamptz not null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists idx_referral_attribution_referrer
  on public.referral_attribution (referrer_user_id);
create index if not exists idx_referral_attribution_event
  on public.referral_attribution (event_id);

-- ---------------------------------------------------------------------
-- device_install: which app installs / browsers a user has been seen on.
-- A fraud signal only (the same install on the referrer's and the buyer's
-- account); never used to block a request.
-- ---------------------------------------------------------------------

create table if not exists public.device_install (
  install_id    text        not null check (length(install_id) between 8 and 100),
  user_id       uuid        not null references public.user_info (id) on delete cascade,
  platform      text        not null check (platform in ('web', 'android', 'ios')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (install_id, user_id)
);

create index if not exists idx_device_install_user on public.device_install (user_id);

-- ---------------------------------------------------------------------
-- Existing tables
-- ---------------------------------------------------------------------

-- Share-button intent (analytics; shares are never rewarded).
alter table public.event_share
  add column if not exists channel text,
  add column if not exists referral_code text;

alter table public.ticket_checkout
  add column if not exists referrer_user_id uuid references public.user_info (id) on delete set null,
  add column if not exists referral_code text,
  add column if not exists referral_touched_at timestamptz,
  add column if not exists referral_source text;

create index if not exists idx_ticket_checkout_referrer
  on public.ticket_checkout (referrer_user_id) where referrer_user_id is not null;

-- The attribution is final once stamped.
create or replace function public.ticket_checkout_referral_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.referrer_user_id is not null
     and (new.referrer_user_id, new.referral_code, new.referral_touched_at, new.referral_source)
         is distinct from
         (old.referrer_user_id, old.referral_code, old.referral_touched_at, old.referral_source) then
    raise exception 'A checkout''s referral attribution cannot be changed once stamped'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_checkout_referral_guard on public.ticket_checkout;
create trigger ticket_checkout_referral_guard
  before update on public.ticket_checkout
  for each row
  when (old.referrer_user_id is not null)
  execute function public.ticket_checkout_referral_guard();

-- ---------------------------------------------------------------------
-- Functions (service_role only)
-- ---------------------------------------------------------------------

-- The user's code, created on first use.
create or replace function public.referral_ensure_code(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_bytes    bytea;
  i          integer;
  attempt    integer;
begin
  select rc.code into v_code from public.referral_code rc where rc.user_id = p_user_id;
  if found then
    return v_code;
  end if;

  if not exists (select 1 from public.user_info u where u.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  for attempt in 1..10 loop
    v_bytes := extensions.gen_random_bytes(7);
    v_code := '';
    for i in 0..6 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;

    insert into public.referral_code (code, user_id)
    values (v_code, p_user_id)
    on conflict do nothing;

    select rc.code into v_code from public.referral_code rc where rc.user_id = p_user_id;
    if found then
      return v_code;
    end if;
  end loop;

  raise exception 'Could not allocate a referral code' using errcode = '55000';
end;
$$;

-- Logs one visit through a referral link. Returns 'recorded' or why not.
create or replace function public.referral_record_touch(
  p_code            text,
  p_event_id        uuid,
  p_place_id        uuid,
  p_visitor_user_id uuid,
  p_install_id      text,
  p_ip_hash         text,
  p_ua_hash         text,
  p_platform        text,
  p_source          text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled   boolean;
  v_ref       public.referral_code;
  v_organizer uuid;
begin
  select s.referral_capture_enabled into v_enabled
  from public.reward_program_setting s where s.id = 1;
  if not coalesce(v_enabled, false) then
    return 'capture_off';
  end if;

  select * into v_ref from public.referral_code rc where rc.code = upper(trim(p_code));
  if not found or v_ref.disabled_at is not null then
    return 'unknown_code';
  end if;
  if p_visitor_user_id = v_ref.user_id then
    return 'own_code';
  end if;

  -- Bot floods: a code earns nothing from clicks, but don't let one fill
  -- the table either.
  if (select count(*) from public.referral_touch t
      where t.code = v_ref.code and t.created_at > now() - interval '1 day') >= 500 then
    return 'code_daily_cap';
  end if;

  insert into public.referral_touch (
    code, referrer_user_id, event_id, place_id, visitor_user_id,
    install_id, ip_hash, ua_hash, platform, source
  ) values (
    v_ref.code, v_ref.user_id,
    case when exists (select 1 from public.event e where e.id = p_event_id) then p_event_id end,
    case when exists (select 1 from public.place p where p.id = p_place_id) then p_place_id end,
    p_visitor_user_id, p_install_id, p_ip_hash, p_ua_hash,
    coalesce(p_platform, 'web'), coalesce(p_source, 'link')
  );

  -- Last touch per (visitor, event), for signed-in visitors. Organizers
  -- can share their own events but never earn on them.
  if p_visitor_user_id is not null and p_event_id is not null then
    select e.organizer_id into v_organizer from public.event e where e.id = p_event_id;
    if found and v_organizer is distinct from v_ref.user_id then
      insert into public.referral_attribution as ra (
        user_id, event_id, referrer_user_id, code, source, touched_at
      ) values (
        p_visitor_user_id, p_event_id, v_ref.user_id, v_ref.code,
        coalesce(p_source, 'link'), now()
      )
      on conflict (user_id, event_id) do update
        set referrer_user_id = excluded.referrer_user_id,
            code             = excluded.code,
            source           = excluded.source,
            touched_at       = excluded.touched_at,
            updated_at       = now();
    end if;
  end if;

  return 'recorded';
end;
$$;

-- Stamps the winning referral on a buyer's pending checkout. Every check is
-- made here, whatever the caller passed: the code must be real and live,
-- recent enough, not the buyer's own, not the event organizer's, and the
-- referrer's account must be in good standing. Returns 'stamped' or why not.
create or replace function public.stamp_checkout_referral(
  p_checkout_session_id uuid,
  p_user_id             uuid,
  p_code                text,
  p_touched_at          timestamptz,
  p_source              text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings  public.reward_program_setting;
  v_ref       public.referral_code;
  v_event_id  uuid;
  v_organizer uuid;
  v_status    smallint;
  v_updated   integer;
begin
  select * into v_settings from public.reward_program_setting s where s.id = 1;
  if not coalesce(v_settings.referral_capture_enabled, false) then
    return 'capture_off';
  end if;

  select * into v_ref from public.referral_code rc where rc.code = upper(trim(p_code));
  if not found or v_ref.disabled_at is not null then
    return 'unknown_code';
  end if;
  if v_ref.user_id = p_user_id then
    return 'own_code';
  end if;

  if p_touched_at is null
     or p_touched_at > now() + interval '5 minutes'
     or p_touched_at < now() - make_interval(days => v_settings.referral_attribution_window_days) then
    return 'expired';
  end if;

  select tc.event_id into v_event_id
  from public.ticket_checkout tc
  where tc.checkout_session_id = p_checkout_session_id
    and tc.user_id = p_user_id
    and tc.status = 'pending'
  limit 1;
  if v_event_id is null then
    return 'not_found';
  end if;

  select e.organizer_id into v_organizer from public.event e where e.id = v_event_id;
  -- Organizers can share their own events but never earn on them, and an
  -- organizer buying their own tickets through someone's link isn't a
  -- referral.
  if v_organizer = v_ref.user_id or v_organizer = p_user_id then
    return 'organizer_linked';
  end if;

  select u.status_id into v_status from public.user_info u where u.id = v_ref.user_id;
  if v_status in (2, 3)
     or exists (select 1 from public.credit_account a
                where a.user_id = v_ref.user_id and a.status <> 'active') then
    return 'referrer_restricted';
  end if;

  update public.ticket_checkout tc
  set referrer_user_id    = v_ref.user_id,
      referral_code       = v_ref.code,
      referral_touched_at = p_touched_at,
      referral_source     = coalesce(p_source, 'link')
  where tc.checkout_session_id = p_checkout_session_id
    and tc.user_id = p_user_id
    and tc.status = 'pending'
    and tc.referrer_user_id is null;
  get diagnostics v_updated = row_count;

  return case when v_updated > 0 then 'stamped' else 'not_found' end;
end;
$$;

-- Throttled to one write per hour per (install, user).
create or replace function public.record_device_install(
  p_install_id text,
  p_user_id    uuid,
  p_platform   text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.device_install as d (install_id, user_id, platform)
  values (p_install_id, p_user_id, p_platform)
  on conflict (install_id, user_id) do update
    set last_seen_at = now(), platform = excluded.platform
    where d.last_seen_at < now() - interval '1 hour';
$$;

create or replace function public.referral_purge_old_touches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.referral_touch where created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------

alter table public.referral_code enable row level security;
alter table public.referral_touch enable row level security;
alter table public.referral_attribution enable row level security;
alter table public.device_install enable row level security;

create policy referral_code_owner_select on public.referral_code
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.referral_code, public.referral_touch,
  public.referral_attribution, public.device_install
  from anon, authenticated;
grant select on table public.referral_code to authenticated;
grant all on table public.referral_code, public.referral_touch,
  public.referral_attribution, public.device_install
  to service_role;

revoke all on function public.ticket_checkout_referral_guard() from public, anon, authenticated;
revoke all on function public.referral_ensure_code(uuid) from public, anon, authenticated;
revoke all on function public.referral_record_touch(text, uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.stamp_checkout_referral(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.record_device_install(text, uuid, text) from public, anon, authenticated;
revoke all on function public.referral_purge_old_touches() from public, anon, authenticated;

grant execute on function public.referral_ensure_code(uuid) to service_role;
grant execute on function public.referral_record_touch(text, uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.stamp_checkout_referral(uuid, uuid, text, timestamptz, text) to service_role;
grant execute on function public.record_device_install(text, uuid, text) to service_role;
grant execute on function public.referral_purge_old_touches() to service_role;

select cron.schedule(
  'referral-touch-purge',
  '30 3 * * *',
  $cron$select public.referral_purge_old_touches();$cron$
);
