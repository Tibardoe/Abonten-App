-- Abonten Rewards, Phase 1: admin operations on credit.
--
--   credit_adjustment_request  every manual adjustment is recorded as a
--     request first. Below reward_program_setting.dual_approval_threshold_minor
--     (GH₵ 500) the requesting admin executes it straight away; at or above
--     it, a DIFFERENT admin must approve it (maker-checker). The request row
--     is the audit trail of who asked, who approved and which journal moved
--     the money; admin_audit_log records the console actions on top.
--   credit_grant_goodwill  support goodwill credit, capped per user per
--     calendar month (support_goodwill_monthly_cap_minor, GH₵ 50). The cap is
--     checked under the account lock so two agents can't both squeeze in.
--   admin_rewards_overview  the Rewards dashboard aggregates in one call, so
--     the console never sums the ledger client-side.
--
-- All service_role only; the admin service layer re-checks permissions
-- (finance.adjust, rewards.goodwill, rewards.view) and the transport adds
-- step-up re-authentication for adjustments.

create table public.credit_adjustment_request (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null,
  direction        text        not null check (direction in ('credit', 'debit')),
  amount_minor     bigint      not null check (amount_minor > 0),
  spend_scope      text        not null default 'any'
                     check (spend_scope in ('any', 'tickets', 'promotions')),
  expires_at       timestamptz,
  -- A debit may take the balance below zero (e.g. recovering credit that was
  -- already spent). Only an explicit choice, never the default.
  allow_negative   boolean     not null default false,
  reason           text        not null check (length(reason) between 3 and 1000),
  user_label       text        check (user_label is null or length(user_label) <= 120),
  status           text        not null default 'pending'
                     check (status in ('pending', 'executed', 'rejected', 'cancelled')),
  requires_second_approver boolean not null default false,
  requested_by     uuid        not null,
  requested_at     timestamptz not null default now(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  journal_id       uuid        references public.credit_journal (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_credit_adjustment_request_user on public.credit_adjustment_request (user_id, created_at desc);
create index idx_credit_adjustment_request_pending on public.credit_adjustment_request (requested_at)
  where status = 'pending';
create index idx_credit_adjustment_request_journal on public.credit_adjustment_request (journal_id)
  where journal_id is not null;

alter table public.credit_adjustment_request enable row level security;
revoke all on table public.credit_adjustment_request from anon, authenticated, service_role;
grant select on table public.credit_adjustment_request to service_role;

-- Creates an adjustment request. Returns the request id and whether it
-- still needs a second approver.
create or replace function public.credit_request_adjustment(
  p_user_id        uuid,
  p_direction      text,
  p_amount_minor   bigint,
  p_reason         text,
  p_requested_by   uuid,
  p_spend_scope    text        default 'any',
  p_expires_at     timestamptz default null,
  p_allow_negative boolean     default false,
  p_user_label     text        default null
)
returns table (request_id uuid, requires_second_approver boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_threshold bigint;
  v_needs     boolean;
  v_id        uuid;
begin
  if p_requested_by is null then
    raise exception 'The requesting admin is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_info u where u.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select s.dual_approval_threshold_minor into v_threshold
  from public.reward_program_setting s where s.id = 1;
  v_needs := p_amount_minor >= coalesce(v_threshold, 0);

  insert into public.credit_adjustment_request (
    user_id, direction, amount_minor, spend_scope, expires_at, allow_negative,
    reason, user_label, requires_second_approver, requested_by
  ) values (
    p_user_id, p_direction, p_amount_minor, coalesce(p_spend_scope, 'any'), p_expires_at,
    coalesce(p_allow_negative, false), p_reason, p_user_label, v_needs, p_requested_by
  )
  returning id into v_id;

  return query select v_id, v_needs;
end;
$$;

-- Executes a pending request. A request that needs a second approver can
-- only be executed by a different admin than the one who asked. Idempotent
-- via the journal key 'adjust:<request id>'.
create or replace function public.credit_execute_adjustment(
  p_request_id uuid,
  p_approver   uuid,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req     public.credit_adjustment_request;
  v_journal uuid;
begin
  select * into v_req from public.credit_adjustment_request r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Adjustment request not found' using errcode = 'P0002';
  end if;
  if v_req.status = 'executed' then
    return v_req.journal_id;
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This adjustment request is already %', v_req.status using errcode = '55000';
  end if;
  if p_approver is null then
    raise exception 'The approving admin is required' using errcode = '22023';
  end if;
  if v_req.requires_second_approver and p_approver = v_req.requested_by then
    raise exception 'This adjustment needs a second admin to approve it' using errcode = '42501';
  end if;

  if v_req.direction = 'credit' then
    select g.journal_id into v_journal
    from public.credit_grant(
      v_req.user_id, v_req.amount_minor, 'adjust.credit', 'adjustment', v_req.spend_scope,
      'adjust:' || v_req.id, 'admin', p_approver,
      coalesce(v_req.user_label, 'Credit adjustment'), v_req.reason, v_req.expires_at,
      null, false, null, 'adjustment_request', v_req.id::text, null
    ) g;
  else
    select d.journal_id into v_journal
    from public.credit_debit_available(
      v_req.user_id, v_req.amount_minor, 'adjust.debit', 'adjust:' || v_req.id,
      v_req.allow_negative, null, 'admin', p_approver,
      coalesce(v_req.user_label, 'Credit adjustment'), v_req.reason,
      'adjustment_request', v_req.id::text, null
    ) d;
  end if;

  update public.credit_adjustment_request r
  set status        = 'executed',
      decided_by    = p_approver,
      decided_at    = now(),
      decision_note = p_note,
      journal_id    = v_journal,
      updated_at    = now()
  where r.id = p_request_id;

  return v_journal;
end;
$$;

create or replace function public.credit_reject_adjustment(
  p_request_id uuid,
  p_admin      uuid,
  p_note       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.credit_adjustment_request r
  set status        = case when p_admin = r.requested_by then 'cancelled' else 'rejected' end,
      decided_by    = p_admin,
      decided_at    = now(),
      decision_note = p_note,
      updated_at    = now()
  where r.id = p_request_id and r.status = 'pending';

  if not found then
    raise exception 'No pending adjustment request with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- Goodwill credit from support, capped per user per calendar month (UTC =
-- Africa/Accra, so month boundaries are local).
create or replace function public.credit_grant_goodwill(
  p_user_id         uuid,
  p_amount_minor    bigint,
  p_admin_id        uuid,
  p_reason          text,
  p_idempotency_key text,
  p_expires_at      timestamptz default null
)
returns table (journal_id uuid, lot_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cap  bigint;
  v_used bigint;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Credit amount must be positive' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_info u where u.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform public._credit_ensure_account(p_user_id);
  perform 1 from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;

  if exists (select 1 from public.credit_journal j where j.idempotency_key = p_idempotency_key) then
    return query
      select j.id, j.lot_id, false from public.credit_journal j
      where j.idempotency_key = p_idempotency_key;
    return;
  end if;

  select s.support_goodwill_monthly_cap_minor into v_cap
  from public.reward_program_setting s where s.id = 1;

  select coalesce(sum(j.user_delta_minor), 0) into v_used
  from public.credit_journal j
  where j.user_id = p_user_id
    and j.journal_type = 'bonus.grant'
    and j.source_type = 'goodwill'
    and j.created_at >= date_trunc('month', now());

  if v_used + p_amount_minor > coalesce(v_cap, 0) then
    raise exception 'Goodwill limit reached for this user this month (used %, limit %)', v_used, coalesce(v_cap, 0)
      using errcode = '23514';
  end if;

  return query
    select g.journal_id, g.lot_id, g.created
    from public.credit_grant(
      p_user_id, p_amount_minor, 'bonus.grant', 'bonus', 'any', p_idempotency_key,
      'admin', p_admin_id, 'Goodwill credit from Abonten', p_reason,
      coalesce(p_expires_at, now() + interval '90 days'), null, false, null,
      'goodwill', null, null
    ) g;
end;
$$;

-- Rewards dashboard aggregates. Balances are point-in-time; flows are for
-- [p_from, p_to).
create or replace function public.admin_rewards_overview(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'balances', (
      select jsonb_build_object(
        'accounts', count(*),
        'frozen_accounts', count(*) filter (where a.status = 'frozen'),
        'in_debt_accounts', count(*) filter (where a.available_minor < 0),
        'available_minor', coalesce(sum(greatest(a.available_minor, 0)), 0),
        'debt_minor', coalesce(sum(least(a.available_minor, 0)), 0),
        'pending_minor', coalesce(sum(a.pending_minor), 0),
        'reserved_minor', coalesce(sum(a.reserved_minor), 0),
        'frozen_minor', coalesce(sum(a.frozen_minor), 0),
        'withdrawing_minor', coalesce(sum(a.withdrawing_minor), 0),
        'lifetime_earned_minor', coalesce(sum(a.lifetime_earned_minor), 0),
        'lifetime_spent_minor', coalesce(sum(a.lifetime_spent_minor), 0),
        'lifetime_expired_minor', coalesce(sum(a.lifetime_expired_minor), 0),
        'lifetime_reversed_minor', coalesce(sum(a.lifetime_reversed_minor), 0)
      )
      from public.credit_account a
      where a.status <> 'closed'
    ),
    'promotion_only_minor', (
      select coalesce(sum(l.remaining_minor - l.held_minor), 0)
      from public.credit_lot l
      where l.status = 'active' and l.spend_scope = 'promotions'
    ),
    'flows', (
      select coalesce(jsonb_object_agg(x.journal_type, x.total_minor), '{}'::jsonb)
      from (
        select j.journal_type, sum(abs(j.user_delta_minor)) as total_minor
        from public.credit_journal j
        where j.created_at >= p_from and j.created_at < p_to
        group by j.journal_type
      ) x
    ),
    'pending_adjustments', (
      select count(*) from public.credit_adjustment_request r where r.status = 'pending'
    ),
    'open_disputes', (
      select count(*) from public.payment_dispute d where d.resolved_at is null
    )
  );
$$;

revoke all on function public.credit_request_adjustment(uuid, text, bigint, text, uuid, text, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.credit_execute_adjustment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_reject_adjustment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_grant_goodwill(uuid, bigint, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_rewards_overview(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.credit_request_adjustment(uuid, text, bigint, text, uuid, text, timestamptz, boolean, text) to service_role;
grant execute on function public.credit_execute_adjustment(uuid, uuid, text) to service_role;
grant execute on function public.credit_reject_adjustment(uuid, uuid, text) to service_role;
grant execute on function public.credit_grant_goodwill(uuid, bigint, uuid, text, text, timestamptz) to service_role;
grant execute on function public.admin_rewards_overview(timestamptz, timestamptz) to service_role;
