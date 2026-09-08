-- Make place-promotion RLS reproducible from this repository.
--
-- 20260825105513_enable_rls_places_batch3.sql enables RLS + policies on
-- place_promotion, place_promotion_checkout and place_promotion_tier -- but
-- those tables are not created until 20260826090000_add_place_promotions.sql,
-- a day later. Production got the RLS anyway (the batch was re-run by hand
-- after the tables existed), so production is correct; a from-scratch replay
-- of this repo is NOT: scripts/test-db/setup-local-test-db.mjs has to
-- neutralize that block to get the stack up, leaving all three tables with
-- RLS DISABLED. A brand-new environment built from this repo therefore
-- shipped place-promotion tables with no row-level security at all.
--
-- Forward-only correction rather than editing the historical file, matching
-- how this repo has handled every other irreducible-ordering case: this runs
-- AFTER the tables exist, so it replays cleanly, and it is a no-op against
-- production, which already has exactly these policies.
--
-- Policy bodies below are copied verbatim from production's own pg_policy
-- (pg_get_expr of polqual / polwithcheck), so replay and production converge.
-- drop-then-create because Postgres has no CREATE POLICY IF NOT EXISTS; both
-- statements run inside the migration's transaction, so production is never
-- left without a policy.

alter table public.place_promotion            enable row level security;
alter table public.place_promotion_checkout   enable row level security;
alter table public.place_promotion_tier       enable row level security;

-- ---- place_promotion -------------------------------------------------
drop policy if exists place_promotion_public_select on public.place_promotion;
create policy place_promotion_public_select on public.place_promotion
  for select using (true);

drop policy if exists place_promotion_owner_insert on public.place_promotion;
create policy place_promotion_owner_insert on public.place_promotion
  for insert with check (
    exists (
      select 1 from public.place_promotion_checkout ppc
      where ppc.id = place_promotion.promotion_checkout_id
        and ppc.owner_id = (select auth.uid())
    )
  );

-- ---- place_promotion_checkout ---------------------------------------
drop policy if exists place_promotion_checkout_owner_select on public.place_promotion_checkout;
create policy place_promotion_checkout_owner_select on public.place_promotion_checkout
  for select using ((select auth.uid()) = owner_id);

drop policy if exists place_promotion_checkout_owner_insert on public.place_promotion_checkout;
create policy place_promotion_checkout_owner_insert on public.place_promotion_checkout
  for insert with check ((select auth.uid()) = owner_id);

drop policy if exists place_promotion_checkout_owner_update on public.place_promotion_checkout;
create policy place_promotion_checkout_owner_update on public.place_promotion_checkout
  for update using ((select auth.uid()) = owner_id)
              with check ((select auth.uid()) = owner_id);

-- ---- place_promotion_tier (public catalogue) ------------------------
drop policy if exists place_promotion_tier_public_select on public.place_promotion_tier;
create policy place_promotion_tier_public_select on public.place_promotion_tier
  for select using (true);
