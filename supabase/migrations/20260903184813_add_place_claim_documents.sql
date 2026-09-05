-- §12 Claim-a-Place: supporting-document attachments.
--
-- Claim documents are sensitive business records (proof of ownership /
-- authorization letters). Unlike every other upload in this app -- which
-- goes to Cloudinary as a public delivery URL -- these live in a PRIVATE
-- Supabase Storage bucket, readable only by the claimant who uploaded them
-- and by admin reviewers (public.is_admin()). Nothing is ever public.
--
-- Applied live via the Supabase MCP on 2026-09-03 (project sderrexhawjbmsugndcq),
-- verified with get_advisors (security). This file is the source-of-truth
-- copy and folds in the follow-up EXECUTE-grant fix noted at the bottom.

-- 1. Private bucket -----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'place-claim-documents',
  'place-claim-documents',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

-- 2. storage.objects RLS for this bucket ------------------------------
-- Object key layout: <claimant_id>/<claim_request_id>/<uuid>.<ext>
-- so (storage.foldername(name))[1] is the owning claimant's uid.
create policy "place_claim_docs_claimant_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'place-claim-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "place_claim_docs_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'place-claim-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

create policy "place_claim_docs_claimant_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'place-claim-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'place-claim-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "place_claim_docs_claimant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'place-claim-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 3. place_claim_document metadata table -----------------------------
create table public.place_claim_document (
  id                uuid primary key default extensions.uuid_generate_v4(),
  claim_request_id  uuid not null references public.place_claim_request(id) on delete cascade,
  storage_path      text not null,
  file_name         text,
  mime_type         text,
  size_bytes        integer,
  created_at        timestamptz not null default now()
);

create index idx_place_claim_document_request
  on public.place_claim_document (claim_request_id);

grant select, insert, delete on public.place_claim_document to authenticated;
grant all on public.place_claim_document to service_role;

alter table public.place_claim_document enable row level security;

-- Claimant may add / read / (before review) remove their own claim's docs.
create policy place_claim_document_claimant_insert on public.place_claim_document
  for insert to authenticated
  with check (
    exists (
      select 1 from public.place_claim_request r
      where r.id = claim_request_id and r.claimant_id = (select auth.uid())
    )
  );

create policy place_claim_document_claimant_select on public.place_claim_document
  for select to authenticated
  using (
    exists (
      select 1 from public.place_claim_request r
      where r.id = claim_request_id and r.claimant_id = (select auth.uid())
    )
  );

create policy place_claim_document_admin_select on public.place_claim_document
  for select to authenticated
  using (public.is_admin());

create policy place_claim_document_claimant_delete on public.place_claim_document
  for delete to authenticated
  using (
    exists (
      select 1 from public.place_claim_request r
      where r.id = claim_request_id
        and r.claimant_id = (select auth.uid())
        and r.status = 'pending'
    )
  );

-- 4. Retention: purge docs for long-since-reviewed claims ------------
-- §12 "do not store sensitive documents longer than required". Deletes the
-- stored bytes AND the metadata rows for claims approved/rejected more than
-- p_older_than ago. service_role only; wire to pg_cron later.
create function public.purge_reviewed_claim_documents(p_older_than interval default '30 days')
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_deleted integer;
begin
  delete from storage.objects o
  using public.place_claim_document d
    join public.place_claim_request r on r.id = d.claim_request_id
  where o.bucket_id = 'place-claim-documents'
    and o.name = d.storage_path
    and r.status in ('approved','rejected')
    and r.reviewed_at is not null
    and r.reviewed_at < now() - p_older_than;

  delete from public.place_claim_document d
  using public.place_claim_request r
  where r.id = d.claim_request_id
    and r.status in ('approved','rejected')
    and r.reviewed_at is not null
    and r.reviewed_at < now() - p_older_than;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- Supabase auto-grants EXECUTE on new public functions to anon +
-- authenticated via ALTER DEFAULT PRIVILEGES, so a plain `revoke from
-- public` isn't enough -- revoke the roles explicitly.
revoke execute on function public.purge_reviewed_claim_documents(interval) from anon;
revoke execute on function public.purge_reviewed_claim_documents(interval) from authenticated;
revoke execute on function public.purge_reviewed_claim_documents(interval) from public;
grant execute on function public.purge_reviewed_claim_documents(interval) to service_role;
