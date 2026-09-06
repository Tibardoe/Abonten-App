-- Automated payout transfers (Paystack Transfers API).
-- Additive / nullable / defaulted — with PAYSTACK_TRANSFERS_ENABLED unset the
-- columns stay at their defaults and the manual settlement flow is unchanged.
-- Applied live via Supabase MCP 2026-09-06 (version 20260906125504).

alter table public.payout
  add column if not exists transfer_code text,
  add column if not exists transfer_recipient_code text,
  add column if not exists transfer_status text not null default 'none',
  add column if not exists transfer_failure_reason text,
  add column if not exists transfer_initiated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_transfer_status_check'
  ) then
    alter table public.payout
      add constraint payout_transfer_status_check
      check (transfer_status in ('none', 'pending', 'success', 'failed', 'reversed'));
  end if;
end $$;

create unique index if not exists payout_transfer_code_key
  on public.payout (transfer_code)
  where transfer_code is not null;

comment on column public.payout.transfer_code is
  'Paystack transfer code once an automated transfer has been initiated for this payout (PAYSTACK_TRANSFERS_ENABLED=true). NULL means the payout is settled manually by an admin.';
comment on column public.payout.transfer_status is
  'none = no automated transfer attached (manual settlement). pending = transfer initiated, awaiting Paystack webhook. success/failed/reversed = terminal, set from transfer.* webhook events.';
