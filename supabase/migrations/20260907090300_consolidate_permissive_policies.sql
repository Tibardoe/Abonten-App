-- Perf advisor 0006_multiple_permissive_policies (153 warnings): every table
-- below had 2-3 PERMISSIVE policies for the same command, which Postgres
-- OR-combines and evaluates one after another for every row. Collapsing each
-- set into a single policy whose predicate is the OR of the originals is
-- semantically identical (permissive policies already combine with OR for
-- both USING and WITH CHECK) — just one policy to plan instead of several.
--
-- No access change. All sets are role PUBLIC except place_claim_document
-- (authenticated). All quals already use the (select auth.uid()) initplan form.

-- ── attendance ────────────────────────────────────────────────────────────
drop policy if exists attendance_owner_select on public.attendance;
drop policy if exists attendance_organizer_select on public.attendance;
create policy attendance_select on public.attendance for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from event e where e.id = attendance.event_id and e.organizer_id = (select auth.uid())))
);

drop policy if exists attendance_owner_update on public.attendance;
drop policy if exists attendance_organizer_update on public.attendance;
create policy attendance_update on public.attendance for update
using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from event e where e.id = attendance.event_id and e.organizer_id = (select auth.uid())))
)
with check (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from event e where e.id = attendance.event_id and e.organizer_id = (select auth.uid())))
);

-- ── event ─────────────────────────────────────────────────────────────────
drop policy if exists event_organizer_select on public.event;
drop policy if exists event_public_select on public.event;
create policy event_select on public.event for select using (
  ((select auth.uid()) = organizer_id)
  or ((status)::text = any (array['published'::text, 'canceled'::text]))
);

-- ── event_review ──────────────────────────────────────────────────────────
drop policy if exists event_review_organizer_select on public.event_review;
drop policy if exists event_review_public_select on public.event_review;
drop policy if exists event_review_reviewer_select on public.event_review;
create policy event_review_select on public.event_review for select using (
  (exists (select 1 from event e where e.id = event_review.event_id and e.organizer_id = (select auth.uid())))
  or (status = 'approved'::text)
  or ((select auth.uid()) = reviewer_id)
);

drop policy if exists event_review_organizer_update on public.event_review;
drop policy if exists event_review_reviewer_update on public.event_review;
create policy event_review_update on public.event_review for update
using (
  (exists (select 1 from event e where e.id = event_review.event_id and e.organizer_id = (select auth.uid())))
  or ((select auth.uid()) = reviewer_id)
)
with check (
  (exists (select 1 from event e where e.id = event_review.event_id and e.organizer_id = (select auth.uid())))
  or ((select auth.uid()) = reviewer_id)
);

-- ── media_audit ───────────────────────────────────────────────────────────
drop policy if exists media_audit_admin_select on public.media_audit;
drop policy if exists media_audit_owner_select on public.media_audit;
create policy media_audit_select on public.media_audit for select using (
  is_admin() or ((select auth.uid()) = user_id)
);

-- ── place ─────────────────────────────────────────────────────────────────
drop policy if exists place_owner_select on public.place;
drop policy if exists place_public_select on public.place;
create policy place_select on public.place for select using (
  ((select auth.uid()) = owner_id) or (status = 'published'::text)
);

drop policy if exists place_admin_update on public.place;
drop policy if exists place_owner_update on public.place;
create policy place_update on public.place for update
using (is_admin() or ((select auth.uid()) = owner_id))
with check (is_admin() or ((select auth.uid()) = owner_id));

-- ── place_booking ─────────────────────────────────────────────────────────
drop policy if exists place_booking_customer_select on public.place_booking;
drop policy if exists place_booking_owner_select on public.place_booking;
create policy place_booking_select on public.place_booking for select using (
  ((select auth.uid()) = customer_id)
  or (exists (select 1 from place p where p.id = place_booking.place_id and p.owner_id = (select auth.uid())))
);

drop policy if exists place_booking_customer_update on public.place_booking;
drop policy if exists place_booking_owner_update on public.place_booking;
create policy place_booking_update on public.place_booking for update
using (
  ((select auth.uid()) = customer_id)
  or (exists (select 1 from place p where p.id = place_booking.place_id and p.owner_id = (select auth.uid())))
)
with check (
  ((select auth.uid()) = customer_id)
  or (exists (select 1 from place p where p.id = place_booking.place_id and p.owner_id = (select auth.uid())))
);

-- ── place_claim_document (role: authenticated) ────────────────────────────
drop policy if exists place_claim_document_admin_select on public.place_claim_document;
drop policy if exists place_claim_document_claimant_select on public.place_claim_document;
create policy place_claim_document_select on public.place_claim_document for select to authenticated using (
  is_admin()
  or (exists (select 1 from place_claim_request r where r.id = place_claim_document.claim_request_id and r.claimant_id = (select auth.uid())))
);

-- ── place_claim_request ───────────────────────────────────────────────────
drop policy if exists place_claim_request_admin_select on public.place_claim_request;
drop policy if exists place_claim_request_claimant_select on public.place_claim_request;
create policy place_claim_request_select on public.place_claim_request for select using (
  is_admin() or ((select auth.uid()) = claimant_id)
);

-- ── place_report ──────────────────────────────────────────────────────────
drop policy if exists place_report_admin_select on public.place_report;
drop policy if exists place_report_reporter_select on public.place_report;
create policy place_report_select on public.place_report for select using (
  is_admin() or ((select auth.uid()) = reporter_id)
);

-- ── place_review ──────────────────────────────────────────────────────────
drop policy if exists place_review_owner_select on public.place_review;
drop policy if exists place_review_public_select on public.place_review;
drop policy if exists place_review_reviewer_select on public.place_review;
create policy place_review_select on public.place_review for select using (
  (exists (select 1 from place p where p.id = place_review.place_id and p.owner_id = (select auth.uid())))
  or (status = 'approved'::text)
  or ((select auth.uid()) = reviewer_id)
);

drop policy if exists place_review_owner_update on public.place_review;
drop policy if exists place_review_reviewer_update on public.place_review;
create policy place_review_update on public.place_review for update
using (
  (exists (select 1 from place p where p.id = place_review.place_id and p.owner_id = (select auth.uid())))
  or ((select auth.uid()) = reviewer_id)
)
with check (
  (exists (select 1 from place p where p.id = place_review.place_id and p.owner_id = (select auth.uid())))
  or ((select auth.uid()) = reviewer_id)
);

-- ── promo_code_usage ──────────────────────────────────────────────────────
drop policy if exists promo_code_usage_organizer_select on public.promo_code_usage;
drop policy if exists promo_code_usage_owner_select on public.promo_code_usage;
create policy promo_code_usage_select on public.promo_code_usage for select using (
  (exists (select 1 from event e where e.id = promo_code_usage.event_id and e.organizer_id = (select auth.uid())))
  or ((select auth.uid()) = user_id)
);

-- ── review ────────────────────────────────────────────────────────────────
drop policy if exists review_public_select on public.review;
drop policy if exists review_reviewer_select on public.review;
create policy review_select on public.review for select using (
  ((status)::text = 'approved'::text) or ((select auth.uid()) = reviewer_id)
);

-- ── ticket ────────────────────────────────────────────────────────────────
drop policy if exists ticket_organizer_select on public.ticket;
drop policy if exists ticket_owner_select on public.ticket;
create policy ticket_select on public.ticket for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from ticket_type tt join event e on e.id = tt.event_id
              where tt.id = ticket.ticket_type_id and e.organizer_id = (select auth.uid())))
);

drop policy if exists ticket_organizer_update on public.ticket;
drop policy if exists ticket_owner_update on public.ticket;
create policy ticket_update on public.ticket for update
using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from ticket_type tt join event e on e.id = tt.event_id
              where tt.id = ticket.ticket_type_id and e.organizer_id = (select auth.uid())))
)
with check (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from ticket_type tt join event e on e.id = tt.event_id
              where tt.id = ticket.ticket_type_id and e.organizer_id = (select auth.uid())))
);

-- ── ticket_checkout ───────────────────────────────────────────────────────
drop policy if exists ticket_checkout_organizer_select on public.ticket_checkout;
drop policy if exists ticket_checkout_owner_select on public.ticket_checkout;
create policy ticket_checkout_select on public.ticket_checkout for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from event e where e.id = ticket_checkout.event_id and e.organizer_id = (select auth.uid())))
);

-- ── user_info ─────────────────────────────────────────────────────────────
drop policy if exists user_info_admin_update on public.user_info;
drop policy if exists user_info_self_update on public.user_info;
create policy user_info_update on public.user_info for update
using (is_admin() or ((select auth.uid()) = id))
with check (is_admin() or ((select auth.uid()) = id));
