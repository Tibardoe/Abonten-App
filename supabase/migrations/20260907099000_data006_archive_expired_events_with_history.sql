-- DATA-006 (docs/audit/01-limitations-register.md): the cleanupExpiredEvents
-- cron's hard `delete from event` silently fails for any event with real
-- transaction history, and always has:
--   1. organizer_ledger_entry.event_id is `ON DELETE SET NULL`, but
--      organizer_ledger_entry_earning_check requires event_id NOT NULL for
--      entry_type='earning' -- so an event with even one earning row makes
--      Postgres try to null it out and then immediately reject that null.
--   2. event_promotion_checkout is `ON DELETE CASCADE` from event, but
--      payment_attempt.event_promotion_checkout_id is `ON DELETE RESTRICT`
--      -- so an event that ever ran a paid promotion blocks its own cascade.
-- Both are permanent, silent failures (the edge function only console.errors
-- them) -- no event that ever sold a ticket or ran a paid promotion has ever
-- actually been deleted by this job.
--
-- Product decision (owner, 2026-09-04): soft-delete instead. An event with
-- real financial history is archived (hidden from discovery/browse), not
-- destroyed -- its ledger/payment/ticket rows must stay intact and
-- addressable for receipts, refunds, and finance reporting. An event with
-- no financial history still gets a genuine hard delete, exactly as before.
--
-- This does not touch RLS or grant any new privilege: the function is
-- SECURITY DEFINER, service_role-only, called from the same edge function
-- that already ran with full delete rights.

alter table public.event
  add column if not exists archived_at timestamptz;

comment on column public.event.archived_at is
  'Set by archive_or_delete_expired_event() when a hard delete is blocked by '
  'real financial history (ledger earnings or a paid promotion checkout). '
  'The event keeps all its data (tickets, ledger, receipts) but should be '
  'excluded from discovery/browse -- not a moderation state, see '
  'moderation_state for that.';

create index if not exists event_archived_at_idx
  on public.event (archived_at)
  where archived_at is not null;

create or replace function public.archive_or_delete_expired_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean := false;
begin
  begin
    delete from public.event where id = p_event_id;
    v_deleted := found;
  exception
    when check_violation or foreign_key_violation then
      update public.event
      set archived_at = coalesce(archived_at, now())
      where id = p_event_id;
      v_deleted := false;
  end;

  return jsonb_build_object(
    'event_id', p_event_id,
    'hard_deleted', v_deleted,
    'archived', not v_deleted
  );
end;
$$;

revoke all on function public.archive_or_delete_expired_event(uuid) from public, anon, authenticated;
grant execute on function public.archive_or_delete_expired_event(uuid) to service_role;
