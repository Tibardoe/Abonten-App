-- Promotion reach estimates: the audience left by a location target now
-- depends on the distance chosen.
--
-- 20260916130000 applied one share (location_audience_share_bps, 30 %) to
-- every radius, so "within 5 km" and "within 50 km" estimated the same
-- reach. It is replaced by one share per radius offered to advertisers
-- (RADIUS_OPTIONS_KM in @abonten/validation/contentSchemas). The defaults
-- keep 30 % at 25 km, the value used so far, and scale around it. Like the
-- other estimate figures they are uncalibrated assumptions (decision S2),
-- editable in Admin › Spotlight & Stories › Settings.
--
-- Estimates only: delivery already filters by the real distance
-- (content_sponsored_candidates), and no campaign stores this figure.

alter table public.content_promotion_pricing
  add column location_audience_share_by_radius jsonb not null
    default '{"5": 1000, "10": 1800, "25": 3000, "50": 4500}'::jsonb
    check (jsonb_typeof(location_audience_share_by_radius) = 'object');

comment on column public.content_promotion_pricing.location_audience_share_by_radius is
  'Share of the Spotlight audience (basis points) assumed to be within each advertiser-selectable radius, keyed by kilometres. Used for reach estimates only.';

alter table public.content_promotion_pricing
  drop column location_audience_share_bps;

-- The estimate model changed, so estimates from here on carry a new version.
update public.content_promotion_pricing
set version = version + 1, updated_at = now()
where id = 1;
