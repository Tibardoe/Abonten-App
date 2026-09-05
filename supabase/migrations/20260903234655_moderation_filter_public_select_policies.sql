-- Admin Console Phase 1 follow-up — hide staff-moderated content on EVERY
-- public read path, not just the 7 PostGIS discovery RPCs (which migration
-- 20260907090800 already handled).
--
-- Approach: tighten the single public SELECT policy on each moderatable
-- table so the PUBLIC branch (anon / any signed-in non-owner) also requires
-- moderation_state NOT IN ('hidden','removed'). The owner / organizer /
-- reviewer branch is left untouched, so:
--   - an organizer still sees their own hidden event on management pages
--   - a place owner still sees a hidden review of their place
--   - the review's author still sees their own hidden review
--   - the Admin Console (service-role) bypasses RLS entirely
--
-- `restricted` stays visible (it only affects featuring). NULL = never
-- moderated = visible, hence IS DISTINCT FROM rather than NOT IN (which
-- would drop the NULL rows). Mirrors the discovery-RPC predicate exactly.
--
-- auth.uid() is wrapped in (select …) to keep the auth_rls_initplan advisor
-- clean, matching the existing policy bodies.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq). Verified:
-- flipping a real published event to moderation_state='hidden' inside a
-- rolled-back transaction made it invisible to the `anon` role while the
-- owner branch still returned it.

alter policy "event_select" on public.event
  using (
    ((select auth.uid()) = organizer_id)
    or (
      (status)::text = any (array['published'::text, 'canceled'::text])
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
  );

alter policy "place_select" on public.place
  using (
    ((select auth.uid()) = owner_id)
    or (
      status = 'published'::text
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
  );

alter policy "event_review_select" on public.event_review
  using (
    (exists (
      select 1 from public.event e
      where e.id = event_review.event_id
        and e.organizer_id = (select auth.uid())
    ))
    or (
      status = 'approved'::text
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
    or ((select auth.uid()) = reviewer_id)
  );

alter policy "place_review_select" on public.place_review
  using (
    (exists (
      select 1 from public.place p
      where p.id = place_review.place_id
        and p.owner_id = (select auth.uid())
    ))
    or (
      status = 'approved'::text
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
    or ((select auth.uid()) = reviewer_id)
  );

alter policy "review_select" on public.review
  using (
    (
      (status)::text = 'approved'::text
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
    or ((select auth.uid()) = reviewer_id)
  );

alter policy "highlight_public_select" on public.highlight
  using (
    (
      moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
    or ((select auth.uid()) = user_id)
  );
