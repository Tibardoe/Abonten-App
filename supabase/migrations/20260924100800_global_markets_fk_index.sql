-- Global markets, part 9: index market.updated_by.
--
-- The advisor lists every new foreign key without a covering index. The
-- one that can matter is market.updated_by → auth.users (ON DELETE SET
-- NULL): deleting an admin account would otherwise scan market. The
-- foreign keys onto public.currency(code) are left unindexed on purpose:
-- currency codes are never updated or deleted (ISO codes; no ON DELETE
-- action), so the parent-side check never runs, and a low-cardinality
-- index on every money table would only slow down writes.

create index if not exists market_updated_by_idx on public.market (updated_by) where updated_by is not null;
