-- Perf advisor 0006 (round 2): seven child tables each pair a `FOR ALL`
-- owner/reviewer policy with a `FOR SELECT` public policy — the advisor
-- counts that as two permissive SELECT policies. Split the FOR ALL into
-- explicit INSERT/UPDATE/DELETE (so it no longer touches SELECT) and fold
-- the owner's read access into a single consolidated SELECT policy.
-- Semantic no-op: permissive policies already OR-combine.
--
-- promo_code is deliberately left alone — its buyer-writable times_used
-- policy (claimPromoUsage) needs an individual review.

-- ── event_occurrence ─────────────────────────────────────────────────────
drop policy if exists event_occurrence_organizer_all on public.event_occurrence;
drop policy if exists event_occurrence_public_select on public.event_occurrence;
create policy event_occurrence_select on public.event_occurrence for select using (
  (exists (select 1 from event e where e.id = event_occurrence.event_id and e.organizer_id = (select auth.uid())))
  or (exists (select 1 from event e where e.id = event_occurrence.event_id and (e.status)::text = any (array['published'::text,'canceled'::text])))
);
create policy event_occurrence_organizer_insert on public.event_occurrence for insert with check (
  exists (select 1 from event e where e.id = event_occurrence.event_id and e.organizer_id = (select auth.uid()))
);
create policy event_occurrence_organizer_update on public.event_occurrence for update
using (exists (select 1 from event e where e.id = event_occurrence.event_id and e.organizer_id = (select auth.uid())))
with check (exists (select 1 from event e where e.id = event_occurrence.event_id and e.organizer_id = (select auth.uid())));
create policy event_occurrence_organizer_delete on public.event_occurrence for delete
using (exists (select 1 from event e where e.id = event_occurrence.event_id and e.organizer_id = (select auth.uid())));

-- ── event_review_photo ───────────────────────────────────────────────────
drop policy if exists event_review_photo_reviewer_all on public.event_review_photo;
drop policy if exists event_review_photo_public_select on public.event_review_photo;
create policy event_review_photo_select on public.event_review_photo for select using (
  (exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.reviewer_id = (select auth.uid())))
  or (exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.status = 'approved'::text))
);
create policy event_review_photo_reviewer_insert on public.event_review_photo for insert with check (
  exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.reviewer_id = (select auth.uid()))
);
create policy event_review_photo_reviewer_update on public.event_review_photo for update
using (exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.reviewer_id = (select auth.uid())))
with check (exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.reviewer_id = (select auth.uid())));
create policy event_review_photo_reviewer_delete on public.event_review_photo for delete
using (exists (select 1 from event_review r where r.id = event_review_photo.event_review_id and r.reviewer_id = (select auth.uid())));

-- ── place_opening_hours ──────────────────────────────────────────────────
drop policy if exists place_opening_hours_owner_all on public.place_opening_hours;
drop policy if exists place_opening_hours_public_select on public.place_opening_hours;
create policy place_opening_hours_select on public.place_opening_hours for select using (
  (exists (select 1 from place p where p.id = place_opening_hours.place_id and p.owner_id = (select auth.uid())))
  or (exists (select 1 from place p where p.id = place_opening_hours.place_id and p.status = 'published'::text))
);
create policy place_opening_hours_owner_insert on public.place_opening_hours for insert with check (
  exists (select 1 from place p where p.id = place_opening_hours.place_id and p.owner_id = (select auth.uid()))
);
create policy place_opening_hours_owner_update on public.place_opening_hours for update
using (exists (select 1 from place p where p.id = place_opening_hours.place_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from place p where p.id = place_opening_hours.place_id and p.owner_id = (select auth.uid())));
create policy place_opening_hours_owner_delete on public.place_opening_hours for delete
using (exists (select 1 from place p where p.id = place_opening_hours.place_id and p.owner_id = (select auth.uid())));

-- ── place_photo ──────────────────────────────────────────────────────────
drop policy if exists place_photo_owner_all on public.place_photo;
drop policy if exists place_photo_public_select on public.place_photo;
create policy place_photo_select on public.place_photo for select using (
  (exists (select 1 from place p where p.id = place_photo.place_id and p.owner_id = (select auth.uid())))
  or (exists (select 1 from place p where p.id = place_photo.place_id and p.status = 'published'::text))
);
create policy place_photo_owner_insert on public.place_photo for insert with check (
  exists (select 1 from place p where p.id = place_photo.place_id and p.owner_id = (select auth.uid()))
);
create policy place_photo_owner_update on public.place_photo for update
using (exists (select 1 from place p where p.id = place_photo.place_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from place p where p.id = place_photo.place_id and p.owner_id = (select auth.uid())));
create policy place_photo_owner_delete on public.place_photo for delete
using (exists (select 1 from place p where p.id = place_photo.place_id and p.owner_id = (select auth.uid())));

-- ── place_review_photo ───────────────────────────────────────────────────
drop policy if exists place_review_photo_reviewer_all on public.place_review_photo;
drop policy if exists place_review_photo_public_select on public.place_review_photo;
create policy place_review_photo_select on public.place_review_photo for select using (
  (exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.reviewer_id = (select auth.uid())))
  or (exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.status = 'approved'::text))
);
create policy place_review_photo_reviewer_insert on public.place_review_photo for insert with check (
  exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.reviewer_id = (select auth.uid()))
);
create policy place_review_photo_reviewer_update on public.place_review_photo for update
using (exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.reviewer_id = (select auth.uid())))
with check (exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.reviewer_id = (select auth.uid())));
create policy place_review_photo_reviewer_delete on public.place_review_photo for delete
using (exists (select 1 from place_review r where r.id = place_review_photo.place_review_id and r.reviewer_id = (select auth.uid())));

-- ── place_service ────────────────────────────────────────────────────────
drop policy if exists place_service_owner_all on public.place_service;
drop policy if exists place_service_public_select on public.place_service;
create policy place_service_select on public.place_service for select using (
  (exists (select 1 from place p where p.id = place_service.place_id and p.owner_id = (select auth.uid())))
  or (exists (select 1 from place p where p.id = place_service.place_id and p.status = 'published'::text))
);
create policy place_service_owner_insert on public.place_service for insert with check (
  exists (select 1 from place p where p.id = place_service.place_id and p.owner_id = (select auth.uid()))
);
create policy place_service_owner_update on public.place_service for update
using (exists (select 1 from place p where p.id = place_service.place_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from place p where p.id = place_service.place_id and p.owner_id = (select auth.uid())));
create policy place_service_owner_delete on public.place_service for delete
using (exists (select 1 from place p where p.id = place_service.place_id and p.owner_id = (select auth.uid())));

-- ── ticket_type ──────────────────────────────────────────────────────────
-- NOTE: the buyer-facing inventory decrement (reserveTicketQuantity) runs
-- with the service-role client, which bypasses RLS — so ticket_type writes
-- only ever need the organizer path here.
drop policy if exists ticket_type_organizer_all on public.ticket_type;
drop policy if exists ticket_type_public_select on public.ticket_type;
create policy ticket_type_select on public.ticket_type for select using (
  (exists (select 1 from event e where e.id = ticket_type.event_id and e.organizer_id = (select auth.uid())))
  or (exists (select 1 from event e where e.id = ticket_type.event_id and (e.status)::text = any (array['published'::text,'canceled'::text])))
);
create policy ticket_type_organizer_insert on public.ticket_type for insert with check (
  exists (select 1 from event e where e.id = ticket_type.event_id and e.organizer_id = (select auth.uid()))
);
create policy ticket_type_organizer_update on public.ticket_type for update
using (exists (select 1 from event e where e.id = ticket_type.event_id and e.organizer_id = (select auth.uid())))
with check (exists (select 1 from event e where e.id = ticket_type.event_id and e.organizer_id = (select auth.uid())));
create policy ticket_type_organizer_delete on public.ticket_type for delete
using (exists (select 1 from event e where e.id = ticket_type.event_id and e.organizer_id = (select auth.uid())));
