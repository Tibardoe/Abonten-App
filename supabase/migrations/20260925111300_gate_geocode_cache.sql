-- Production gate 2026-09-25: the public location pages cannot run up the
-- Google Geocoding bill.
--
-- /explore/<anything> and /events/location/<anything> are open to signed-out
-- visitors and geocoded the URL text with Google on every uncached request.
-- Next's fetch cache only helps for a string it has seen, so a crawler
-- requesting random slugs was a billed Google call per request, with no
-- limit. The web resolver now answers market cities from market_region,
-- then from this cache (hits and misses both stored), and calls Google only
-- within a per-address and a global hourly budget (geocodeServerSide.ts).
--
-- Service-role only, like the other server caches: RLS on, no policies, no
-- client grants.

create table if not exists public.geocode_cache (
  query_key text primary key
    check (length(query_key) between 1 and 120),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  found boolean not null,
  created_at timestamptz not null default now(),
  check ((found and lat is not null and lng is not null)
         or (not found and lat is null and lng is null))
);

alter table public.geocode_cache enable row level security;
revoke all on table public.geocode_cache from anon, authenticated;
grant select, insert, update, delete on table public.geocode_cache to service_role;

create index if not exists geocode_cache_created_idx
  on public.geocode_cache (created_at);

comment on table public.geocode_cache is
  'Server-side cache of Google Geocoding answers for public location pages (production gate 2026-09-25). Service role only.';
