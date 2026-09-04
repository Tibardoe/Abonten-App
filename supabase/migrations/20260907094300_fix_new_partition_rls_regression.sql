-- Self-caught fix for a regression in 20260907094100_fix_empty_partition_
-- tables.sql: creating a partition of an RLS-enabled parent table does NOT
-- automatically enable RLS on the new partition itself in Postgres. All 11
-- partitions created by that migration (event_media_p0..p3, wallet_p0..p3,
-- event_share_default, story_default, media_audit_default) were left with
-- RLS disabled, meaning a direct PostgREST request naming the partition
-- table (e.g. /rest/v1/wallet_p0) instead of the parent would bypass the
-- parent's RLS-deny-by-default and hit the schema-wide legacy `GRANT ALL`
-- to anon/authenticated from the original pulled schema.
--
-- Caught immediately by re-running the security advisor after applying
-- that migration (rls_disabled_in_public, 11 ERROR-level hits) and fixed
-- before moving on to anything else. See docs/audit/01-limitations-
-- register.md (DATA-003) for the full account.

alter table public.event_media_p0 enable row level security;
alter table public.event_media_p1 enable row level security;
alter table public.event_media_p2 enable row level security;
alter table public.event_media_p3 enable row level security;

alter table public.wallet_p0 enable row level security;
alter table public.wallet_p1 enable row level security;
alter table public.wallet_p2 enable row level security;
alter table public.wallet_p3 enable row level security;

alter table public.event_share_default enable row level security;
alter table public.story_default enable row level security;
alter table public.media_audit_default enable row level security;
