-- Production gate 2026-09-25: the organizer dashboard answered 500 in
-- production ("permission denied for table market").
--
-- global_markets_per_currency_reports (production 08:51 UTC) made
-- get_organizer_sales_timeline — reached through get_organizer_dashboard —
-- fall back to default_market_currency(). That helper, like its two
-- siblings, is SECURITY INVOKER and reads the service-only market table, so
-- although `authenticated` was granted EXECUTE on it, it failed inside for
-- every organizer: the dashboard, web and mobile, stopped loading.
--
-- The three helpers answer one public fact each (the default market's
-- country, currency and time zone), so they now run as their owner with a
-- fixed search path, and the market table stays service-only. Grants are
-- unchanged (CREATE OR REPLACE keeps them). Found by the production release
-- check; reproduced in session-rpc-reachability.integration.test.ts.

create or replace function public.default_market_country()
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.country_code::text from public.market m where m.is_default limit 1;
$$;

create or replace function public.default_market_currency()
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.default_currency::text from public.market m where m.is_default limit 1;
$$;

create or replace function public.default_market_timezone()
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.default_timezone from public.market m where m.is_default limit 1;
$$;
