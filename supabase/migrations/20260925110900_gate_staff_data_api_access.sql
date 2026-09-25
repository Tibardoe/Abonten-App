-- Production gate 2026-09-25: staff accounts no longer carry blanket
-- powers on the Data API.
--
-- Every active admin_user — whatever its role, a view-only analyst
-- included — has user_info.is_admin = true (sync_is_admin_from_admin_user),
-- and is_admin() / is_staff() were written into write policies and column
-- guards as a bypass. Reproduced with an analyst session straight against
-- the Data API: ban or unban anyone, grant is_admin to any account, rewrite
-- any place (verified, claimed, moderation), and read every private
-- message, report and claim document — with no permission check, no
-- step-up and no audit entry. The admin console never needed any of it: it
-- works through the service role after resolveAdminContext() checks the
-- permission.
--
-- Now:
--   * write policies are owner-only (place, user_info); the claim-request
--     staff UPDATE policy is gone (claims are decided in the console);
--   * staff reads of other people's private data need the matching
--     permission (admin_has_permission), not just being staff;
--   * the column guards no longer let a signed-in admin through — only the
--     service role, SECURITY DEFINER functions and migrations.

-- Write policies --------------------------------------------------------

drop policy if exists user_info_update on public.user_info;
create policy user_info_update on public.user_info
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists place_update on public.place;
create policy place_update on public.place
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists place_claim_request_admin_update on public.place_claim_request;

-- Staff reads: by permission ---------------------------------------------

drop policy if exists message_participant_select on public.message;
create policy message_participant_select on public.message
  for select to authenticated
  using (
    (public.is_conversation_participant(conversation_id) and moderation_state = 'visible')
    or sender_id = (select auth.uid())
    or (select public.admin_has_permission('support.view'))
  );

drop policy if exists conversation_participant_select on public.conversation;
create policy conversation_participant_select on public.conversation
  for select to authenticated
  using (
    public.is_conversation_participant(id)
    or (select public.admin_has_permission('support.view'))
  );

drop policy if exists conv_participant_select on public.conversation_participant;
create policy conv_participant_select on public.conversation_participant
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    or (select public.admin_has_permission('support.view'))
  );

drop policy if exists message_attachment_select on public.message_attachment;
create policy message_attachment_select on public.message_attachment
  for select to authenticated
  using (
    exists (
      select 1 from public.message m
      where m.id = message_attachment.message_id
        and (
          (public.is_conversation_participant(m.conversation_id) and m.moderation_state = 'visible')
          or m.sender_id = (select auth.uid())
          or (select public.admin_has_permission('support.view'))
        )
    )
  );

drop policy if exists conversation_block_own_select on public.conversation_block;
create policy conversation_block_own_select on public.conversation_block
  for select to authenticated
  using (
    blocker_id = (select auth.uid())
    or (select public.admin_has_permission('users.view'))
  );

drop policy if exists report_reporter_select on public.report;
create policy report_reporter_select on public.report
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (select public.admin_has_permission('reports.view'))
  );

drop policy if exists report_attachment_select on public.report_attachment;
create policy report_attachment_select on public.report_attachment
  for select to authenticated
  using (
    (select public.admin_has_permission('reports.view'))
    or exists (
      select 1 from public.report r
      where r.id = report_attachment.report_id
        and r.reporter_id = (select auth.uid())
    )
  );

drop policy if exists place_claim_request_select on public.place_claim_request;
create policy place_claim_request_select on public.place_claim_request
  for select to authenticated
  using (
    (select auth.uid()) = claimant_id
    or (select public.admin_has_permission('claims.view'))
  );

drop policy if exists place_claim_document_select on public.place_claim_document;
create policy place_claim_document_select on public.place_claim_document
  for select to authenticated
  using (
    (select public.admin_has_permission('claims.view'))
    or exists (
      select 1 from public.place_claim_request r
      where r.id = place_claim_document.claim_request_id
        and r.claimant_id = (select auth.uid())
    )
  );

drop policy if exists media_audit_select on public.media_audit;
create policy media_audit_select on public.media_audit
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.admin_has_permission('users.view'))
  );

drop policy if exists promo_code_select on public.promo_code;
create policy promo_code_select on public.promo_code
  for select to authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = promo_code.event_id
        and e.organizer_id = (select auth.uid())
    )
    or (select public.admin_has_permission('events.view'))
  );

drop policy if exists place_claim_docs_read on storage.objects;
create policy place_claim_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'place-claim-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.admin_has_permission('claims.view'))
    )
  );

drop policy if exists report_attachments_read on storage.objects;
create policy report_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.admin_has_permission('reports.view'))
    )
  );

drop policy if exists message_attachments_participant_read on storage.objects;
create policy message_attachments_participant_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
      or (select public.admin_has_permission('support.view'))
    )
  );

-- Column guards: no signed-in admin bypass --------------------------------

create or replace function public.protect_user_info_privileged_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Trusted server contexts only: the service-role key (admin console,
  -- backend services) or a superuser / the postgres role (migrations,
  -- SECURITY DEFINER maintenance such as verification_transition). A
  -- signed-in staff account is not one of them: staff change these fields
  -- through the console, which checks the permission, asks for step-up
  -- where required and writes the audit entry.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id
     or new.organizer_verified is distinct from old.organizer_verified
     or new.organizer_verified_at is distinct from old.organizer_verified_at
     or new.organizer_verification_case_id is distinct from old.organizer_verification_case_id
     or new.country_code is distinct from old.country_code then
    raise exception 'Not authorized to modify this field' using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_staff_managed_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Only direct client writes are checked. SECURITY DEFINER functions run as
  -- their owner and the backend as service_role, so current_user is neither.
  -- Signed-in staff are clients too: moderation goes through the console.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.moderation_state  is distinct from old.moderation_state
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at      is distinct from old.moderated_at
    or new.moderated_by      is distinct from old.moderated_by) then
    raise exception 'Only Abonten staff can change moderation status'
      using errcode = '42501';
  end if;

  -- Fields of `place` only (plpgsql resolves NEW.verified at run time, so
  -- the other tables never evaluate it).
  if tg_table_name = 'place' then
    if (tg_op = 'INSERT' and (new.verified or new.claimed
                              or new.verified_at is not null
                              or new.verification_case_id is not null))
       or (tg_op = 'UPDATE' and (new.verified is distinct from old.verified
                                 or new.claimed is distinct from old.claimed
                                 or new.verified_at is distinct from old.verified_at
                                 or new.verification_case_id is distinct from old.verification_case_id)) then
      raise exception 'Only Abonten staff can mark a place as verified or claimed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;
