-- Production gate 2026-09-25: discovery checks market visibility once per
-- query instead of once per row.
--
-- 20260925100300 (global_markets_paused_listings) added
-- `public.listing_market_visible(x.country_code)` to every discovery
-- function. It is SECURITY DEFINER with a fixed search_path, so Postgres can
-- never inline it: it runs as a separate function call with its own
-- sub-query for every candidate row. Measured on the local stack with the
-- scripts/perf catalogue (100,000 events near Accra): 5.6 µs a row, 560 ms
-- of get_events_in_window's 870 ms, and the same tax in the nearby,
-- filtered, similar, promoted and search pools.
--
-- The hidden countries are the same for the whole query, so they are read
-- once, as an init-plan: `x.country_code <> all ((select
-- public.hidden_listing_countries())::text[])` (the cast keeps Postgres
-- from reading `all ((select …))` as a row sub-query). Equivalent to the
-- old check because
-- event.country_code and place.country_code are NOT NULL and constrained to
-- ^[A-Z]{2}$ (the old function upper-cased and treated a missing market row
-- as visible; both still hold).
--
-- The function bodies are rewritten in place (pg_get_functiondef keeps each
-- one's SECURITY DEFINER, search_path and grants). listing_market_visible()
-- stays for anything else that calls it; new discovery code should use the
-- array form.

create or replace function public.hidden_listing_countries()
  returns text[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(m.country_code), '{}'::text[])
  from public.market m
  where m.status not in ('live', 'maintenance');
$$;
revoke all on function public.hidden_listing_countries() from public;
-- The same audience as listing_market_visible(), which already answers the
-- question country by country.
grant execute on function public.hidden_listing_countries() to anon, authenticated, service_role;

do $$
declare
  f record;
  v_def text;
  v_new text;
  v_rewritten integer := 0;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosrc like '%public.listing_market_visible(%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(
      v_def,
      'public\.listing_market_visible\(([a-z_]+)\.country_code\)',
      '(\1.country_code <> all ((select public.hidden_listing_countries())::text[]))',
      'g'
    );
    if v_new like '%listing_market_visible(%' then
      raise exception 'market visibility rewrite: % still calls listing_market_visible in a form this migration does not know', f.sig;
    end if;
    execute v_new;
    v_rewritten := v_rewritten + 1;
  end loop;
  if v_rewritten = 0 then
    raise exception 'market visibility rewrite: no discovery function called listing_market_visible';
  end if;
  raise notice 'market visibility rewrite: % function(s)', v_rewritten;
end $$;
