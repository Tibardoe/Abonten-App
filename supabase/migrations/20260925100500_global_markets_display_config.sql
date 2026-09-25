-- Global markets, part 15: per-market display settings.
--
-- Found in the hardening audit: the price filters were sized for cedis. The
-- Explore slider ran 0–999 and the search chips were "Under 50" / "Under
-- 200" in every currency, so in Nigeria (₦999 is under a dollar) or Japan
-- the price filter could only ever exclude almost everything. Worse, the
-- /search URL treated any upper bound of 999 or more as "Any price", so a
-- ₦5,000 cap was silently ignored.
--
-- market.display_config holds how a market's prices are presented:
--   { "priceScale": 100 }  -> slider 0–₦99,900, chips "Under ₦5,000" / "Under ₦20,000".
-- Empty means scale 1 (the cedi-sized defaults). Readiness warns when a
-- market in another currency has not set it. Display only: nothing here
-- changes a price or a charge.

alter table public.market
  add column if not exists display_config jsonb not null default '{}'::jsonb;

alter table public.market
  drop constraint if exists market_display_config_shape;
alter table public.market
  add constraint market_display_config_shape check (
    jsonb_typeof(display_config) = 'object'
    and (
      not (display_config ? 'priceScale')
      or (jsonb_typeof(display_config -> 'priceScale') = 'number'
          and (display_config ->> 'priceScale')::numeric > 0
          and (display_config ->> 'priceScale')::numeric <= 100000)
    )
  );

comment on column public.market.display_config is
  'How this market''s prices are presented (display only): {"priceScale": n} sizes the price filters (1 = cedi-sized steps).';
