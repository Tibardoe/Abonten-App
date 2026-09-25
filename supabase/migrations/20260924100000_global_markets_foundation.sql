-- Global platform, part 1: markets as configuration.
--
-- Abonten was built for Ghana with GHS, Paystack, +233 and Accra written
-- into the code. From here on a COUNTRY IS A ROW: the `market` table and
-- its children describe everything that makes the product local — currency,
-- payment provider accounts, the payment methods people use, payout rails,
-- tax, locale, address rules, regions — and the application reads them.
-- Adding a country is an operational exercise in Admin › Markets, not a
-- code change. Ghana is seeded live as the default market with exactly the
-- configuration that was hard-coded before, so nothing changes for it.
--
-- Also here: the ISO 4217 `currency` table (every money column validates
-- against it from part 2 on), `feature_flag` with country/platform/percent
-- targeting, and `exchange_rate` for display-only estimates.
--
-- Every table is service-role only (RLS on, no policies, client grants
-- revoked): the apps read markets through @abonten/services, which serves
-- the public subset.

-- ---------------------------------------------------------------------------
-- 1. Currencies
-- ---------------------------------------------------------------------------

create table public.currency (
  code        char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name        text not null,
  minor_units smallint not null check (minor_units in (0, 2, 3)),
  symbol      text not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.currency is
  'ISO 4217 currencies the platform can price, charge, settle or display in. minor_units is the ISO exponent (GHS 2, XOF 0, KWD 3).';

insert into public.currency (code, name, minor_units, symbol) values
  ('GHS', 'Ghanaian cedi', 2, 'GH₵'),
  ('NGN', 'Nigerian naira', 2, '₦'),
  ('KES', 'Kenyan shilling', 2, 'KSh'),
  ('ZAR', 'South African rand', 2, 'R'),
  ('XOF', 'West African CFA franc', 0, 'CFA'),
  ('XAF', 'Central African CFA franc', 0, 'FCFA'),
  ('USD', 'US dollar', 2, '$'),
  ('GBP', 'British pound', 2, '£'),
  ('EUR', 'Euro', 2, '€'),
  ('CAD', 'Canadian dollar', 2, '$'),
  ('AUD', 'Australian dollar', 2, '$'),
  ('RWF', 'Rwandan franc', 0, 'RF'),
  ('UGX', 'Ugandan shilling', 0, 'USh'),
  ('TZS', 'Tanzanian shilling', 2, 'TSh'),
  ('ETB', 'Ethiopian birr', 2, 'Br'),
  ('EGP', 'Egyptian pound', 2, 'E£'),
  ('MAD', 'Moroccan dirham', 2, 'MAD'),
  ('SLE', 'Sierra Leonean leone', 2, 'Le'),
  ('LRD', 'Liberian dollar', 2, 'L$'),
  ('GMD', 'Gambian dalasi', 2, 'D'),
  ('BWP', 'Botswana pula', 2, 'P'),
  ('ZMW', 'Zambian kwacha', 2, 'ZK'),
  ('NAD', 'Namibian dollar', 2, 'N$'),
  ('AED', 'UAE dirham', 2, 'AED'),
  ('INR', 'Indian rupee', 2, '₹'),
  ('CHF', 'Swiss franc', 2, 'CHF'),
  ('SEK', 'Swedish krona', 2, 'kr'),
  ('NOK', 'Norwegian krone', 2, 'kr'),
  ('DKK', 'Danish krone', 2, 'kr'),
  ('BRL', 'Brazilian real', 2, 'R$'),
  ('JMD', 'Jamaican dollar', 2, 'J$'),
  ('JPY', 'Japanese yen', 0, '¥'),
  ('KWD', 'Kuwaiti dinar', 3, 'KD');

-- ---------------------------------------------------------------------------
-- 2. Markets
-- ---------------------------------------------------------------------------

create table public.market (
  country_code         char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  name                 text not null,
  status               text not null default 'draft'
                         check (status in ('draft', 'preparing', 'ready', 'live', 'paused', 'maintenance')),
  is_default           boolean not null default false,
  default_currency     char(3) not null references public.currency(code),
  supported_currencies char(3)[] not null default '{}',
  default_timezone     text not null,
  default_locale       text not null,
  supported_locales    text[] not null default '{}',
  distance_unit        text not null default 'km' check (distance_unit in ('km', 'mi')),
  dial_code            text not null check (dial_code ~ '^\+[0-9]{1,4}$'),
  address_schema       jsonb,
  tax_config           jsonb not null default '{"mode": "none", "rateBps": 0, "label": ""}'::jsonb,
  fee_config           jsonb not null default '{"serviceFeeBps": null}'::jsonb,
  otp_provider         text check (otp_provider in ('hubtel', 'twilio')),
  legal_config         jsonb not null default '{}'::jsonb,
  centre_lat           double precision,
  centre_lng           double precision,
  launched_at          timestamptz,
  version              integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null,
  constraint market_default_currency_supported
    check (default_currency = any (supported_currencies)),
  constraint market_default_locale_supported
    check (default_locale = any (supported_locales))
);
comment on table public.market is
  'One row per country Abonten operates in (or is preparing). Status drives visibility: only live/maintenance markets are resolvable by the apps.';
create unique index market_single_default on public.market ((true)) where is_default;

create table public.market_payment_provider (
  country_code         char(2) not null references public.market(country_code) on delete cascade,
  provider             text not null check (provider in ('paystack', 'stripe')),
  enabled              boolean not null default false,
  secret_key_env       text not null,
  webhook_secret_env   text not null,
  public_key_env       text,
  settlement_currency  char(3) not null references public.currency(code),
  priority             smallint not null default 1,
  provider_account_ref text,
  currencies           char(3)[] not null default '{}',
  payouts_enabled      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (country_code, provider)
);
comment on table public.market_payment_provider is
  'A payment provider ACCOUNT for a market. Holds the NAMES of the environment variables carrying its secrets, never values.';

create table public.market_payment_method (
  id                uuid primary key default gen_random_uuid(),
  country_code      char(2) not null references public.market(country_code) on delete cascade,
  provider          text not null,
  method            text not null check (method in ('card', 'mobile_money', 'bank_transfer', 'bank_redirect', 'apple_pay', 'google_pay', 'ussd', 'qr', 'eft', 'wallet')),
  enabled           boolean not null default false,
  currencies        char(3)[] not null default '{}',
  platforms         text[] not null default '{}',
  recommended       boolean not null default false,
  label             text,
  provider_channels text[] not null default '{}',
  sort_order        smallint not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (country_code, provider, method),
  foreign key (country_code, provider) references public.market_payment_provider(country_code, provider) on delete cascade
);

create table public.market_payout_method (
  id           uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.market(country_code) on delete cascade,
  method       text not null check (method in ('mobile_money', 'bank')),
  provider     text check (provider in ('paystack', 'stripe')),
  enabled      boolean not null default false,
  currency     char(3) not null references public.currency(code),
  fields       jsonb not null default '[]'::jsonb,
  automated    boolean not null default false,
  label        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (country_code, method, currency)
);

create table public.market_region (
  id           uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.market(country_code) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name         text not null,
  kind         text not null default 'city' check (kind in ('city', 'region')),
  centre_lat   double precision not null check (centre_lat between -90 and 90),
  centre_lng   double precision not null check (centre_lng between -180 and 180),
  radius_km    numeric(6,1) not null default 25 check (radius_km > 0),
  status       text not null default 'active' check (status in ('active', 'inactive')),
  position     smallint not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (country_code, slug)
);
comment on table public.market_region is
  'Cities/regions a market advertises: discovery fallback centres, the "popular areas" list, and the default map view.';

create table public.market_event (
  id           uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.market(country_code) on delete cascade,
  action       text not null,
  from_status  text,
  to_status    text,
  actor_id     uuid,
  reason       text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index market_event_country_idx on public.market_event (country_code, created_at desc);

create table public.market_readiness_run (
  id           uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.market(country_code) on delete cascade,
  ran_by       uuid,
  ran_at       timestamptz not null default now(),
  can_activate boolean not null,
  report       jsonb not null
);
create index market_readiness_run_idx on public.market_readiness_run (country_code, ran_at desc);

-- ---------------------------------------------------------------------------
-- 3. Feature flags
-- ---------------------------------------------------------------------------

create table public.feature_flag (
  key         text primary key check (key ~ '^[a-z0-9_.-]{2,80}$'),
  description text not null default '',
  enabled     boolean not null default false,
  rules       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
comment on table public.feature_flag is
  'Targeted flags: rules {countries, platforms, cohorts, percent, minAppVersion, allowSubjects}. Evaluated by @abonten/core/flags; an unknown flag is off.';

-- ---------------------------------------------------------------------------
-- 4. Exchange rates (display estimates only)
-- ---------------------------------------------------------------------------

create table public.exchange_rate (
  base         char(3) not null references public.currency(code),
  quote        char(3) not null references public.currency(code),
  rate         numeric(20,10) not null check (rate > 0),
  source       text not null,
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now(),
  primary key (base, quote)
);
comment on table public.exchange_rate is
  'Units of quote per 1 base, for display conversion only. Never used to price or charge.';

create table public.exchange_rate_config (
  id                boolean primary key default true check (id),
  provider          text not null default 'off' check (provider in ('openexchangerates', 'manual', 'off')),
  base              char(3) not null default 'USD' references public.currency(code),
  app_id_env        text not null default 'OPEN_EXCHANGE_RATES_APP_ID',
  refresh_url       text,
  token             text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  refresh_every     interval not null default interval '6 hours',
  last_refreshed_at timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);
insert into public.exchange_rate_config (id) values (true);

-- ---------------------------------------------------------------------------
-- 5. Functions
-- ---------------------------------------------------------------------------

create or replace function public.default_market_currency()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select m.default_currency::text from public.market m where m.is_default limit 1;
$$;

create or replace function public.default_market_country()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select m.country_code::text from public.market m where m.is_default limit 1;
$$;

create or replace function public.market_currency_for_country(p_country_code text)
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(
    (select m.default_currency::text from public.market m where m.country_code = upper(p_country_code)),
    public.default_market_currency()
  );
$$;

create or replace function public.market_timezone_for_country(p_country_code text)
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(
    (select m.default_timezone from public.market m where m.country_code = upper(p_country_code)),
    (select m.default_timezone from public.market m where m.is_default limit 1)
  );
$$;

create or replace function public.touch_market_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_market_updated_at() from public, anon, authenticated;

create trigger market_touch before update on public.market
  for each row execute function public.touch_market_updated_at();
create trigger market_payment_provider_touch before update on public.market_payment_provider
  for each row execute function public.touch_market_updated_at();
create trigger market_payment_method_touch before update on public.market_payment_method
  for each row execute function public.touch_market_updated_at();
create trigger market_payout_method_touch before update on public.market_payout_method
  for each row execute function public.touch_market_updated_at();
create trigger market_region_touch before update on public.market_region
  for each row execute function public.touch_market_updated_at();

-- The only way a market changes status. Mirrors @abonten/core/market/transitions.
create or replace function public.market_transition(
  p_country_code text,
  p_transition   text,
  p_actor_id     uuid,
  p_reason       text default null,
  p_readiness_ok boolean default false
)
  returns public.market
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_market public.market;
  v_from   text;
  v_to     text;
  v_from_ok boolean;
begin
  select * into v_market from public.market where country_code = upper(p_country_code) for update;
  if not found then
    raise exception 'Market % not found', p_country_code using errcode = 'P0002';
  end if;

  v_to := case p_transition
    when 'prepare'           then 'preparing'
    when 'mark_ready'        then 'ready'
    when 'activate'          then 'live'
    when 'pause'             then 'paused'
    when 'resume'            then 'live'
    when 'enter_maintenance' then 'maintenance'
    when 'exit_maintenance'  then 'live'
    when 'back_to_draft'     then 'draft'
  end;
  if v_to is null then
    raise exception 'Unknown market transition %', p_transition using errcode = '22023';
  end if;

  v_from_ok := case p_transition
    when 'prepare'           then v_market.status in ('draft', 'ready')
    when 'mark_ready'        then v_market.status = 'preparing'
    when 'activate'          then v_market.status in ('ready', 'paused')
    when 'pause'             then v_market.status in ('live', 'maintenance')
    when 'resume'            then v_market.status = 'paused'
    when 'enter_maintenance' then v_market.status = 'live'
    when 'exit_maintenance'  then v_market.status = 'maintenance'
    when 'back_to_draft'     then v_market.status in ('preparing', 'ready', 'paused')
  end;
  if not v_from_ok then
    raise exception 'Market % cannot % from status %', v_market.country_code, p_transition, v_market.status
      using errcode = 'check_violation';
  end if;

  if p_transition in ('mark_ready', 'activate', 'resume') and not coalesce(p_readiness_ok, false) then
    raise exception 'Market % has not passed its readiness checks', v_market.country_code
      using errcode = 'check_violation';
  end if;

  if v_market.is_default and v_to in ('draft', 'paused') then
    raise exception 'The default market cannot be paused or returned to draft'
      using errcode = 'check_violation';
  end if;

  v_from := v_market.status;

  update public.market
  set status      = v_to,
      launched_at = case when v_to = 'live' then coalesce(launched_at, now()) else launched_at end,
      version     = version + 1,
      updated_by  = p_actor_id
  where country_code = v_market.country_code
  returning * into v_market;

  insert into public.market_event (country_code, action, from_status, to_status, actor_id, reason)
  values (v_market.country_code, p_transition, v_from, v_to, p_actor_id, p_reason);

  return v_market;
end;
$$;
revoke all on function public.market_transition(text, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.market_transition(text, text, uuid, text, boolean) to service_role;

-- Exchange-rate refresh: pg_cron asks the web app to fetch fresh rates the
-- same way notification delivery is dispatched (a config row holds the URL
-- and a token; the route verifies the token).
create or replace function public.run_exchange_rate_refresh()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_cfg public.exchange_rate_config;
begin
  select * into v_cfg from public.exchange_rate_config where id = true;
  if v_cfg.provider <> 'openexchangerates' or v_cfg.refresh_url is null then
    return;
  end if;
  if v_cfg.last_refreshed_at is not null
     and v_cfg.last_refreshed_at > now() - v_cfg.refresh_every then
    return;
  end if;
  perform net.http_post(
    url                  := v_cfg.refresh_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-refresh-token', v_cfg.token),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.run_exchange_rate_refresh() from public, anon, authenticated;

select cron.schedule('exchange-rates-refresh', '15 * * * *', 'select public.run_exchange_rate_refresh();');

-- ---------------------------------------------------------------------------
-- 6. Access: service-role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'currency', 'market', 'market_payment_provider', 'market_payment_method',
    'market_payout_method', 'market_region', 'market_event', 'market_readiness_run',
    'feature_flag', 'exchange_rate', 'exchange_rate_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end
$$;

revoke all on function public.default_market_currency() from public, anon, authenticated;
revoke all on function public.default_market_country() from public, anon, authenticated;
revoke all on function public.market_currency_for_country(text) from public, anon, authenticated;
revoke all on function public.market_timezone_for_country(text) from public, anon, authenticated;
grant execute on function public.default_market_currency() to service_role;
grant execute on function public.default_market_country() to service_role;
grant execute on function public.market_currency_for_country(text) to service_role;
grant execute on function public.market_timezone_for_country(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Admin permissions
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('markets.view',     'View markets',     'See market configuration, readiness reports and feature flags'),
  ('markets.manage',   'Manage markets',   'Edit market configuration, providers, methods, regions and flags'),
  ('markets.activate', 'Activate markets', 'Activate, pause and resume markets (step-up required)')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations', 'markets.view'),
  ('operations', 'markets.manage'),
  ('finance_admin', 'markets.view'),
  ('analyst', 'markets.view'),
  ('support_admin', 'markets.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Seed: Ghana live (exactly what the code assumed), target markets in draft
-- ---------------------------------------------------------------------------

insert into public.market (
  country_code, name, status, is_default, default_currency, supported_currencies,
  default_timezone, default_locale, supported_locales, distance_unit, dial_code,
  otp_provider, legal_config, centre_lat, centre_lng, launched_at
) values
  ('GH', 'Ghana', 'live', true, 'GHS', '{GHS}', 'Africa/Accra', 'en-GH', '{en-GH,en,fr,ak}', 'km', '+233',
   'hubtel', jsonb_build_object('supportEmail', 'support@abontenhub.com', 'acknowledgedAt', now(), 'termsVersion', 'draft'),
   5.6037, -0.187, now()),
  ('NG', 'Nigeria', 'draft', false, 'NGN', '{NGN}', 'Africa/Lagos', 'en-NG', '{en-NG,en}', 'km', '+234',
   'twilio', '{}'::jsonb, 6.5244, 3.3792, null),
  ('KE', 'Kenya', 'draft', false, 'KES', '{KES}', 'Africa/Nairobi', 'en-KE', '{en-KE,en}', 'km', '+254',
   'twilio', '{}'::jsonb, -1.2921, 36.8219, null),
  ('ZA', 'South Africa', 'draft', false, 'ZAR', '{ZAR}', 'Africa/Johannesburg', 'en-ZA', '{en-ZA,en}', 'km', '+27',
   'twilio', '{}'::jsonb, -26.2041, 28.0473, null),
  ('CI', 'Côte d''Ivoire', 'draft', false, 'XOF', '{XOF}', 'Africa/Abidjan', 'fr-CI', '{fr-CI,fr,en}', 'km', '+225',
   'twilio', '{}'::jsonb, 5.3600, -4.0083, null),
  ('GB', 'United Kingdom', 'draft', false, 'GBP', '{GBP}', 'Europe/London', 'en-GB', '{en-GB,en}', 'mi', '+44',
   'twilio', '{}'::jsonb, 51.5074, -0.1278, null),
  ('US', 'United States', 'draft', false, 'USD', '{USD}', 'America/New_York', 'en-US', '{en-US,en,es}', 'mi', '+1',
   'twilio', '{}'::jsonb, 40.7128, -74.0060, null),
  ('FR', 'France', 'draft', false, 'EUR', '{EUR}', 'Europe/Paris', 'fr-FR', '{fr-FR,fr,en}', 'km', '+33',
   'twilio', '{}'::jsonb, 48.8566, 2.3522, null),
  ('DE', 'Germany', 'draft', false, 'EUR', '{EUR}', 'Europe/Berlin', 'de-DE', '{de-DE,de,en}', 'km', '+49',
   'twilio', '{}'::jsonb, 52.5200, 13.4050, null);

-- Provider accounts. Ghana keeps the original environment variable names.
insert into public.market_payment_provider (country_code, provider, enabled, secret_key_env, webhook_secret_env, public_key_env, settlement_currency, priority, currencies, payouts_enabled) values
  ('GH', 'paystack', true,  'PAYSTACK_SECRET_KEY',    'PAYSTACK_WEBHOOK_SECRET',    'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY',    'GHS', 1, '{GHS,USD}', false),
  ('NG', 'paystack', false, 'PAYSTACK_NG_SECRET_KEY', 'PAYSTACK_NG_WEBHOOK_SECRET', 'NEXT_PUBLIC_PAYSTACK_NG_PUBLIC_KEY', 'NGN', 1, '{NGN,USD}', false),
  ('KE', 'paystack', false, 'PAYSTACK_KE_SECRET_KEY', 'PAYSTACK_KE_WEBHOOK_SECRET', 'NEXT_PUBLIC_PAYSTACK_KE_PUBLIC_KEY', 'KES', 1, '{KES,USD}', false),
  ('ZA', 'paystack', false, 'PAYSTACK_ZA_SECRET_KEY', 'PAYSTACK_ZA_WEBHOOK_SECRET', 'NEXT_PUBLIC_PAYSTACK_ZA_PUBLIC_KEY', 'ZAR', 1, '{ZAR,USD}', false),
  ('CI', 'paystack', false, 'PAYSTACK_CI_SECRET_KEY', 'PAYSTACK_CI_WEBHOOK_SECRET', 'NEXT_PUBLIC_PAYSTACK_CI_PUBLIC_KEY', 'XOF', 1, '{XOF}', false),
  ('GB', 'stripe',   false, 'STRIPE_SECRET_KEY_GB',   'STRIPE_WEBHOOK_SECRET_GB',   'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_GB', 'GBP', 1, '{GBP,EUR,USD}', false),
  ('US', 'stripe',   false, 'STRIPE_SECRET_KEY_US',   'STRIPE_WEBHOOK_SECRET_US',   'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_US', 'USD', 1, '{USD}', false),
  ('FR', 'stripe',   false, 'STRIPE_SECRET_KEY_EU',   'STRIPE_WEBHOOK_SECRET_EU',   'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_EU', 'EUR', 1, '{EUR,GBP,USD}', false),
  ('DE', 'stripe',   false, 'STRIPE_SECRET_KEY_EU',   'STRIPE_WEBHOOK_SECRET_EU',   'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_EU', 'EUR', 1, '{EUR,GBP,USD}', false);

-- Payment methods: what people in each country actually pay with, on the
-- channels the provider documents for that country. Only Ghana's are on.
insert into public.market_payment_method (country_code, provider, method, enabled, currencies, platforms, recommended, provider_channels, sort_order) values
  ('GH', 'paystack', 'mobile_money',  true,  '{GHS}',     '{}', true,  '{mobile_money}',  1),
  ('GH', 'paystack', 'card',          true,  '{GHS,USD}', '{}', false, '{card}',          2),
  ('NG', 'paystack', 'card',          false, '{NGN,USD}', '{}', true,  '{card}',          1),
  ('NG', 'paystack', 'bank_transfer', false, '{NGN}',     '{}', false, '{bank_transfer}', 2),
  ('NG', 'paystack', 'ussd',          false, '{NGN}',     '{}', false, '{ussd}',          3),
  ('NG', 'paystack', 'qr',            false, '{NGN}',     '{}', false, '{qr}',            4),
  ('NG', 'paystack', 'bank_redirect', false, '{NGN}',     '{}', false, '{bank}',          5),
  ('KE', 'paystack', 'mobile_money',  false, '{KES}',     '{}', true,  '{mobile_money}',  1),
  ('KE', 'paystack', 'card',          false, '{KES,USD}', '{}', false, '{card}',          2),
  ('ZA', 'paystack', 'card',          false, '{ZAR,USD}', '{}', true,  '{card}',          1),
  ('ZA', 'paystack', 'eft',           false, '{ZAR}',     '{}', false, '{eft}',           2),
  ('CI', 'paystack', 'mobile_money',  false, '{XOF}',     '{}', true,  '{mobile_money}',  1),
  ('CI', 'paystack', 'card',          false, '{XOF}',     '{}', false, '{card}',          2),
  ('GB', 'stripe',   'card',          false, '{GBP,EUR,USD}', '{}', true, '{card}',       1),
  ('GB', 'stripe',   'apple_pay',     false, '{GBP,EUR,USD}', '{web,ios}', false, '{card}', 2),
  ('GB', 'stripe',   'google_pay',    false, '{GBP,EUR,USD}', '{web,android}', false, '{card}', 3),
  ('US', 'stripe',   'card',          false, '{USD}',     '{}', true,  '{card}',          1),
  ('US', 'stripe',   'apple_pay',     false, '{USD}',     '{web,ios}', false, '{card}',   2),
  ('US', 'stripe',   'google_pay',    false, '{USD}',     '{web,android}', false, '{card}', 3),
  ('FR', 'stripe',   'card',          false, '{EUR}',     '{}', true,  '{card}',          1),
  ('FR', 'stripe',   'apple_pay',     false, '{EUR}',     '{web,ios}', false, '{card}',   2),
  ('FR', 'stripe',   'google_pay',    false, '{EUR}',     '{web,android}', false, '{card}', 3),
  ('DE', 'stripe',   'card',          false, '{EUR}',     '{}', true,  '{card}',          1),
  ('DE', 'stripe',   'apple_pay',     false, '{EUR}',     '{web,ios}', false, '{card}',   2),
  ('DE', 'stripe',   'google_pay',    false, '{EUR}',     '{web,android}', false, '{card}', 3);

-- Payout rails and the account fields each needs.
insert into public.market_payout_method (country_code, method, provider, enabled, currency, automated, fields) values
  ('GH', 'mobile_money', 'paystack', true, 'GHS', false,
   '[{"key":"phone","label":"Mobile money number","required":true},{"key":"network","label":"Network","required":true}]'),
  ('GH', 'bank', 'paystack', true, 'GHS', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"accountNumber","label":"Account number","required":true,"pattern":"^[0-9]{8,20}$"}]'),
  ('NG', 'bank', 'paystack', false, 'NGN', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"accountNumber","label":"NUBAN account number","required":true,"pattern":"^[0-9]{10}$","example":"0123456789"}]'),
  ('KE', 'mobile_money', 'paystack', false, 'KES', false,
   '[{"key":"phone","label":"M-Pesa number","required":true},{"key":"network","label":"Network","required":true}]'),
  ('KE', 'bank', 'paystack', false, 'KES', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"accountNumber","label":"Account number","required":true,"pattern":"^[0-9]{6,20}$"}]'),
  ('ZA', 'bank', 'paystack', false, 'ZAR', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"accountNumber","label":"Account number","required":true,"pattern":"^[0-9]{6,20}$"},{"key":"branchCode","label":"Branch code","required":false,"pattern":"^[0-9]{6}$"}]'),
  ('CI', 'mobile_money', 'paystack', false, 'XOF', false,
   '[{"key":"phone","label":"Numéro mobile money","required":true},{"key":"network","label":"Opérateur","required":true}]'),
  ('CI', 'bank', 'paystack', false, 'XOF', false,
   '[{"key":"bankName","label":"Banque","required":true},{"key":"accountNumber","label":"Numéro de compte","required":true}]'),
  ('GB', 'bank', null, false, 'GBP', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"sortCode","label":"Sort code","required":true,"pattern":"^[0-9]{2}-?[0-9]{2}-?[0-9]{2}$","example":"12-34-56"},{"key":"accountNumber","label":"Account number","required":true,"pattern":"^[0-9]{8}$","example":"12345678"}]'),
  ('US', 'bank', null, false, 'USD', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"routingNumber","label":"Routing number","required":true,"pattern":"^[0-9]{9}$","example":"021000021"},{"key":"accountNumber","label":"Account number","required":true,"pattern":"^[0-9]{4,17}$"}]'),
  ('FR', 'bank', null, false, 'EUR', false,
   '[{"key":"bankName","label":"Banque","required":true},{"key":"iban","label":"IBAN","required":true,"pattern":"^FR[0-9]{2}[0-9A-Z]{23}$","example":"FR7630006000011234567890189"},{"key":"bic","label":"BIC","required":false,"pattern":"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$"}]'),
  ('DE', 'bank', null, false, 'EUR', false,
   '[{"key":"bankName","label":"Bank","required":true},{"key":"iban","label":"IBAN","required":true,"pattern":"^DE[0-9]{20}$","example":"DE89370400440532013000"},{"key":"bic","label":"BIC","required":false,"pattern":"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$"}]');

insert into public.market_region (country_code, slug, name, kind, centre_lat, centre_lng, radius_km, position) values
  ('GH', 'accra', 'Accra', 'city', 5.6037, -0.1870, 30, 1),
  ('GH', 'kumasi', 'Kumasi', 'city', 6.6885, -1.6244, 25, 2),
  ('GH', 'takoradi', 'Takoradi', 'city', 4.8845, -1.7554, 20, 3),
  ('GH', 'tamale', 'Tamale', 'city', 9.4034, -0.8424, 20, 4),
  ('GH', 'cape-coast', 'Cape Coast', 'city', 5.1053, -1.2466, 20, 5),
  ('NG', 'lagos', 'Lagos', 'city', 6.5244, 3.3792, 40, 1),
  ('NG', 'abuja', 'Abuja', 'city', 9.0765, 7.3986, 30, 2),
  ('NG', 'port-harcourt', 'Port Harcourt', 'city', 4.8156, 7.0498, 25, 3),
  ('NG', 'ibadan', 'Ibadan', 'city', 7.3775, 3.9470, 25, 4),
  ('KE', 'nairobi', 'Nairobi', 'city', -1.2921, 36.8219, 30, 1),
  ('KE', 'mombasa', 'Mombasa', 'city', -4.0435, 39.6682, 25, 2),
  ('KE', 'kisumu', 'Kisumu', 'city', -0.0917, 34.7680, 20, 3),
  ('ZA', 'johannesburg', 'Johannesburg', 'city', -26.2041, 28.0473, 40, 1),
  ('ZA', 'cape-town', 'Cape Town', 'city', -33.9249, 18.4241, 40, 2),
  ('ZA', 'durban', 'Durban', 'city', -29.8587, 31.0218, 30, 3),
  ('ZA', 'pretoria', 'Pretoria', 'city', -25.7479, 28.2293, 30, 4),
  ('CI', 'abidjan', 'Abidjan', 'city', 5.3600, -4.0083, 30, 1),
  ('CI', 'bouake', 'Bouaké', 'city', 7.6906, -5.0300, 20, 2),
  ('GB', 'london', 'London', 'city', 51.5074, -0.1278, 40, 1),
  ('GB', 'manchester', 'Manchester', 'city', 53.4808, -2.2426, 25, 2),
  ('GB', 'birmingham', 'Birmingham', 'city', 52.4862, -1.8904, 25, 3),
  ('GB', 'edinburgh', 'Edinburgh', 'city', 55.9533, -3.1883, 20, 4),
  ('US', 'new-york', 'New York', 'city', 40.7128, -74.0060, 40, 1),
  ('US', 'los-angeles', 'Los Angeles', 'city', 34.0522, -118.2437, 50, 2),
  ('US', 'chicago', 'Chicago', 'city', 41.8781, -87.6298, 40, 3),
  ('US', 'houston', 'Houston', 'city', 29.7604, -95.3698, 40, 4),
  ('US', 'atlanta', 'Atlanta', 'city', 33.7490, -84.3880, 40, 5),
  ('FR', 'paris', 'Paris', 'city', 48.8566, 2.3522, 30, 1),
  ('FR', 'lyon', 'Lyon', 'city', 45.7640, 4.8357, 25, 2),
  ('FR', 'marseille', 'Marseille', 'city', 43.2965, 5.3698, 25, 3),
  ('DE', 'berlin', 'Berlin', 'city', 52.5200, 13.4050, 30, 1),
  ('DE', 'munich', 'Munich', 'city', 48.1351, 11.5820, 25, 2),
  ('DE', 'hamburg', 'Hamburg', 'city', 53.5511, 9.9937, 25, 3);

insert into public.market_event (country_code, action, from_status, to_status, reason)
values ('GH', 'seed', null, 'live', 'Ghana is the first market; seeded live with the configuration the code previously assumed.');

insert into public.feature_flag (key, description, enabled, rules) values
  ('currency.display_conversion', 'Show approximate prices in the viewer''s currency when it differs from the listing currency', true, null),
  ('checkout.stripe', 'Allow the Stripe provider to be used at checkout in markets that enable it', true, null),
  ('markets.browse_abroad', 'Let people choose a browsing area in another live market', true, null)
on conflict (key) do nothing;
