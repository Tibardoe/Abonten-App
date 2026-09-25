-- Full-system audit 2026-09-25: data a signed-in account could read or
-- remove that isn't theirs.
--
-- 1. promo_code was readable by every signed-in account (USING true), so
--    anyone could list every discount code on every event straight from
--    the Data API — around the per-user rate limit the checkout lookup
--    applies against guessing. Codes are now readable by their event's
--    organizer (and staff); buyers' lookups go through the service
--    (getPromoCodeCore after its rate limit; the checkout paths that
--    release a code the buyer already applied).
-- 2. message-attachments: any participant could delete any attachment in a
--    conversation, including the other person's — evidence a report may
--    need. A participant may now delete only what they uploaded.

drop policy if exists promo_code_select on public.promo_code;
create policy promo_code_select on public.promo_code
  for select to authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = promo_code.event_id
        and e.organizer_id = (select auth.uid())
    )
    or public.is_admin()
  );

drop policy if exists message_attachments_participant_delete on storage.objects;
create policy message_attachments_participant_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and owner_id = (select auth.uid())::text
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );
