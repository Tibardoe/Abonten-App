-- Account deletion keeps the financial record and never deletes other
-- people's tickets.
--
-- Until now deleteAccountCore ran auth.admin.deleteUser() and let the
-- ON DELETE CASCADE chain from auth.users -> user_info do the rest. That
-- chain removes the person's transactions, tickets, payment attempts,
-- organizer ledger entries, payouts and platform fee entries (which cascade
-- from transaction) -- and every event they organized, together with every
-- ticket other people bought for those events. After that no refund,
-- payout, reconciliation or tax record could be reconstructed.
--
-- The new path (deleteAccountCore):
--   1. account_deletion_blockers(): the person cannot leave while they
--      still owe attendees an event (upcoming published events with
--      tickets), while a payout is in flight, while Abonten still owes
--      them money, or if they are an admin.
--   2. credit_close_account() as before.
--   3. anonymize_deleted_account(): profile scrubbed to "Deleted user",
--      personal rows removed (devices, favourites, reminders, notices,
--      drafts, highlights, pending claims), saved cards and payout
--      accounts scrubbed (their rows are referenced by payment attempts /
--      payouts, so they stay as shells), places unclaimed, empty upcoming
--      events cancelled, the rest of their events archived, open
--      verification cases withdrawn, status 'Deleted'.
--   4. auth.admin.deleteUser(id, shouldSoftDelete = true): Supabase Auth
--      removes identities, sessions and factors and obfuscates the email
--      and phone, but keeps the auth.users row -- so nothing cascades and
--      the same email or number can sign up again as a new account.
--
-- Money rows (transaction, ticket, ticket_checkout, payment_attempt,
-- organizer_ledger_entry, payout, platform_fee_entry) are untouched: they
-- now point at an anonymised profile, which is what the Privacy Policy
-- describes as "kept as a financial record".

insert into public.user_status (id, name)
values (4, 'Deleted')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- What stops a deletion right now. Every value is a count / amount so the
-- caller can explain which step the person has to take first.
-- ---------------------------------------------------------------------------
create or replace function public.account_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin',
      coalesce((select ui.is_admin from public.user_info ui where ui.id = p_user_id), false),
    'upcoming_events_with_attendees',
      (select count(*)
       from public.event e
       where e.organizer_id = p_user_id
         and e.status = 'published'
         and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
         and exists (
           select 1
           from public.ticket t
           join public.ticket_type tt on tt.id = t.ticket_type_id
           where tt.event_id = e.id and t.status in ('active', 'used'))),
    'payouts_in_flight',
      (select count(*) from public.payout p
       where p.organizer_id = p_user_id and p.status = 'processing'),
    'balance_owed',
      (select coalesce(sum(le.amount), 0)
       from public.organizer_ledger_entry le
       where le.organizer_id = p_user_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Scrub and detach. Runs as the function owner, so the staff-column guards
-- on place / user_info let it through. Returns what it did.
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_deleted_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suffix          text := replace(left(p_user_id::text, 13), '-', '');
  r                 record;
  v_events_cancelled integer := 0;
  v_events_archived  integer := 0;
  v_drafts_deleted   integer := 0;
  v_places_unclaimed integer := 0;
  v_claims_deleted   integer := 0;
  v_cases_closed     integer := 0;
begin
  if not exists (select 1 from public.user_info where id = p_user_id) then
    raise exception 'anonymize_deleted_account: unknown user %', p_user_id;
  end if;

  -- Verification: open cases are withdrawn, an approved one is revoked
  -- (the badge must not outlive the person who earned it). Each transition
  -- is best-effort so one odd case cannot block the deletion.
  for r in
    select id, status from public.verification_case
    where requester_id = p_user_id
      and status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_cases_closed := v_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  -- Pending place claims die with the account; their documents go to the
  -- storage purge queue (the Storage API deletes them).
  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'account_deleted'
  from public.place_claim_document d
  join public.place_claim_request cr on cr.id = d.claim_request_id
  where cr.claimant_id = p_user_id and cr.status = 'pending'
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_request
  where claimant_id = p_user_id and status = 'pending';
  get diagnostics v_claims_deleted = row_count;

  -- Events. Drafts never sold anything: delete. Upcoming published events
  -- with nobody attending: cancel (attended ones block the deletion
  -- upstream). Everything else stays as history, archived so it leaves
  -- discovery and search.
  delete from public.event
  where organizer_id = p_user_id and status = 'draft';
  get diagnostics v_drafts_deleted = row_count;

  update public.event e
     set status = 'canceled'
   where e.organizer_id = p_user_id
     and e.status = 'published'
     and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
     and not exists (
       select 1
       from public.ticket t
       join public.ticket_type tt on tt.id = t.ticket_type_id
       where tt.event_id = e.id and t.status in ('active', 'used'));
  get diagnostics v_events_cancelled = row_count;

  update public.event e
     set archived_at = coalesce(e.archived_at, now())
   where e.organizer_id = p_user_id
     and e.archived_at is null;
  get diagnostics v_events_archived = row_count;

  -- Places are real businesses: the listing stays, unclaimed, so the next
  -- owner can claim it. The badge goes with the owner.
  update public.place
     set claimed = false,
         verified = false,
         verified_at = null,
         verification_case_id = null,
         updated_at = now()
   where owner_id = p_user_id
     and (claimed or verified or verification_case_id is not null);
  get diagnostics v_places_unclaimed = row_count;

  -- Personal rows with no financial meaning.
  delete from public.device_token where user_id = p_user_id;
  delete from public.favorite where user_id = p_user_id;
  delete from public.favorite_place where user_id = p_user_id;
  delete from public.event_reminder where user_id = p_user_id;
  delete from public.notification where user_id = p_user_id;
  delete from public.notification_preference where user_id = p_user_id;
  delete from public.notification_subscription where user_id = p_user_id;
  delete from public.user_image_history where user_id = p_user_id;
  delete from public.receiving_account where user_id = p_user_id;
  delete from public.highlight where user_id = p_user_id;
  delete from public.drafts where user_id = p_user_id;

  -- Saved cards / mobile money: payment attempts reference these rows
  -- (ON DELETE RESTRICT), so they are scrubbed, not deleted. The Paystack
  -- authorization code -- the part that can charge the card -- is gone.
  update public.payment_method
     set status = 'removed',
         is_default = false,
         details = jsonb_strip_nulls(jsonb_build_object(
           'scrubbed', true,
           'brand',   details ->> 'brand',
           'last4',   details ->> 'last4',
           'network', details ->> 'network',
           'bank',    details ->> 'bank')),
         updated_at = now()
   where user_id = p_user_id;

  -- Payout accounts: payouts reference them (ON DELETE RESTRICT).
  update public.payout_account
     set status = 'removed',
         is_default = false,
         account_holder_name = 'Deleted user',
         account_number = 'removed',
         updated_at = now()
   where organizer_id = p_user_id;

  -- The profile itself. The username is unique and must match
  -- ^[a-z0-9_]{3,30}$; the id prefix keeps it unique.
  update public.user_info
     set full_name = 'Deleted user',
         username = ('deleted_' || v_suffix)::extensions.citext,
         username_is_generated = true,
         avatar_public_id = null,
         avatar_version = null,
         bio = null,
         website = null,
         organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null,
         status_id = 4,
         updated_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'events_cancelled', v_events_cancelled,
    'events_archived',  v_events_archived,
    'drafts_deleted',   v_drafts_deleted,
    'places_unclaimed', v_places_unclaimed,
    'claims_deleted',   v_claims_deleted,
    'cases_closed',     v_cases_closed
  );
end;
$$;

revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
revoke all on function public.anonymize_deleted_account(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;
grant execute on function public.anonymize_deleted_account(uuid) to service_role;
