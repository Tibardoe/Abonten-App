-- Abonten Rewards, Phase 1: the credit ledger core.
--
-- One credit account per person (user_info.id), whatever their role. Credit
-- is a promotional liability, NOT money owed to organizers -- it never
-- touches organizer_ledger_entry, and organizer earnings never become credit.
--
-- Model (see docs/architecture/rewards-ledger.md):
--   credit_journal  one immutable row per business transaction, with a
--                   required UNIQUE idempotency_key.
--   credit_entry    immutable signed lines (pesewas). Each journal's lines sum
--                   to zero (deferred constraint trigger).
--   credit_ledger_account  double-entry accounts: per-user buckets
--                   (pending/available/reserved/frozen/withdrawing) and
--                   system accounts (reward_expense, breakage, ...).
--   credit_lot      one row per grant, tracking what is left of it, its
--                   expiry and what it may be spent on.
--   credit_account  per-user header with CACHED bucket balances, only ever
--                   updated by the functions below in the same transaction
--                   as the entries. The ledger is the source of truth;
--                   reconciliation checks the cache against it.
--
-- Sign convention: amount_minor > 0 credits an account, < 0 debits it. User
-- buckets are liabilities, so a positive entry raises the user's balance.
--
-- Amounts are bigint pesewas. Rate-based rewards produce fractions of a
-- pesewa; existing money columns are numeric(12,2) cedis and conversion
-- happens only at the service boundary.
--
-- Security: every mutating function is SECURITY DEFINER, search_path = '',
-- and executable by service_role only. Internal helpers (prefixed _credit_)
-- are executable by nobody but their owner. No client role can write any
-- credit table; service_role gets SELECT only on the ledger tables, so even
-- the backend key can move credit only through these functions.
--
-- History outlives the auth user: credit tables deliberately carry the user
-- id WITHOUT a foreign key to user_info (a hard account delete cascades from
-- auth.users and would otherwise either destroy financial history or be
-- blocked by the append-only triggers). deleteAccountCore calls
-- credit_close_account() first, which forfeits the balance and marks the
-- account closed.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.credit_account (
  user_id                  uuid        not null,
  currency                 varchar(3)  not null default 'GHS',
  status                   text        not null default 'active'
                             check (status in ('active', 'frozen', 'closed')),
  status_reason            text,
  status_changed_at        timestamptz,
  status_changed_by        uuid,
  pending_minor            bigint      not null default 0 check (pending_minor >= 0),
  -- May go negative only through a clawback / admin debit ("in debt"). A
  -- negative available balance blocks spending and withdrawal, and the
  -- next grant repays it first.
  available_minor          bigint      not null default 0,
  reserved_minor           bigint      not null default 0 check (reserved_minor >= 0),
  frozen_minor             bigint      not null default 0 check (frozen_minor >= 0),
  withdrawing_minor        bigint      not null default 0 check (withdrawing_minor >= 0),
  lifetime_earned_minor    bigint      not null default 0,
  lifetime_spent_minor     bigint      not null default 0,
  lifetime_withdrawn_minor bigint      not null default 0,
  lifetime_expired_minor   bigint      not null default 0,
  lifetime_reversed_minor  bigint      not null default 0,
  version                  bigint      not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (user_id, currency),
  -- GHS only for now; the currency column exists so other currencies can be
  -- added without reshaping every table.
  constraint credit_account_currency_check check (currency = 'GHS')
);

create index idx_credit_account_updated on public.credit_account (updated_at);
create index idx_credit_account_status on public.credit_account (status) where status <> 'active';

create table public.credit_ledger_account (
  id            uuid        primary key default gen_random_uuid(),
  owner_user_id uuid,
  code          text        not null,
  currency      varchar(3)  not null default 'GHS',
  created_at    timestamptz not null default now(),
  constraint credit_ledger_account_code_check check (
    (owner_user_id is not null
      and code in ('pending', 'available', 'reserved', 'frozen', 'withdrawing'))
    or
    (owner_user_id is null
      and code in ('reward_contingent', 'reward_expense', 'campaign_expense',
                   'redemption_tickets', 'redemption_promotions',
                   'withdrawals_payable', 'cash_disbursed',
                   'withdrawal_fee_income', 'breakage', 'admin_adjustments'))
  )
);

create unique index credit_ledger_account_user_bucket_key
  on public.credit_ledger_account (owner_user_id, code, currency)
  where owner_user_id is not null;
create unique index credit_ledger_account_system_key
  on public.credit_ledger_account (code, currency)
  where owner_user_id is null;

insert into public.credit_ledger_account (owner_user_id, code, currency)
select null, c, 'GHS'
from unnest(array['reward_contingent', 'reward_expense', 'campaign_expense',
                  'redemption_tickets', 'redemption_promotions',
                  'withdrawals_payable', 'cash_disbursed',
                  'withdrawal_fee_income', 'breakage', 'admin_adjustments']) as c
on conflict do nothing;

create table public.credit_lot (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null,
  currency         varchar(3)  not null default 'GHS',
  kind             text        not null
                     check (kind in ('reward', 'promotion', 'welcome', 'bonus', 'refund', 'adjustment')),
  spend_scope      text        not null
                     check (spend_scope in ('any', 'tickets', 'promotions', 'first_order')),
  status           text        not null
                     check (status in ('pending', 'active', 'exhausted', 'expired',
                                       'voided', 'clawed_back', 'forfeited')),
  -- The system account that funded this lot, so a clawback reverses the
  -- right expense line.
  funding_code     text        not null
                     check (funding_code in ('reward_contingent', 'campaign_expense',
                                             'admin_adjustments', 'redemption_tickets',
                                             'redemption_promotions')),
  original_minor   bigint      not null check (original_minor > 0),
  -- What the user still owns from this lot (in any bucket). Only ever
  -- decreases; a refund of spent credit creates a NEW lot.
  remaining_minor  bigint      not null check (remaining_minor >= 0),
  -- The part of remaining_minor sitting in reserved/frozen/withdrawing.
  held_minor       bigint      not null default 0 check (held_minor >= 0),
  released_minor   bigint,
  withdrawable     boolean     not null default false,
  withdrawable_at  timestamptz,
  expires_at       timestamptz,
  -- For pending lots: when the reward is expected to unlock (display only;
  -- the engine decides the real release).
  release_at       timestamptz,
  released_at      timestamptz,
  closed_at        timestamptz,
  source_type      text,
  source_id        text,
  reward_event_id  uuid,
  label            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint credit_lot_held_le_remaining check (held_minor <= remaining_minor),
  constraint credit_lot_remaining_le_original check (remaining_minor <= original_minor)
);

create index idx_credit_lot_user_status on public.credit_lot (user_id, status);
create index idx_credit_lot_expiry on public.credit_lot (expires_at)
  where status = 'active' and expires_at is not null;
create index idx_credit_lot_reward_event on public.credit_lot (reward_event_id)
  where reward_event_id is not null;

create table public.credit_journal (
  id                  uuid        primary key default gen_random_uuid(),
  journal_type        text        not null check (journal_type in (
                        'reward.accrue', 'reward.release', 'reward.void', 'reward.clawback',
                        'bonus.grant', 'adjust.credit', 'adjust.debit',
                        'redeem.reserve', 'redeem.release', 'redeem.capture', 'redeem.refund',
                        'hold.freeze', 'hold.unfreeze',
                        'withdraw.request', 'withdraw.complete', 'withdraw.fail',
                        'expire', 'account.close')),
  idempotency_key     text        not null,
  currency            varchar(3)  not null default 'GHS',
  -- The account holder this journal concerns (null only for system-only
  -- journals, of which there are none today).
  user_id             uuid,
  -- Signed effect as the user sees it on their activity feed.
  user_delta_minor    bigint      not null default 0,
  visible_to_user     boolean     not null default true,
  lot_id              uuid        references public.credit_lot (id),
  source_type         text,
  source_id           text,
  reward_event_id     uuid,
  reverses_journal_id uuid        references public.credit_journal (id),
  actor_type          text        not null check (actor_type in ('system', 'user', 'admin')),
  actor_id            uuid,
  user_label          text,
  memo                text,
  created_at          timestamptz not null default now(),
  constraint credit_journal_idempotency_key_key unique (idempotency_key)
);

create index idx_credit_journal_user_activity
  on public.credit_journal (user_id, created_at desc, id desc)
  where visible_to_user;
create index idx_credit_journal_lot on public.credit_journal (lot_id) where lot_id is not null;
create index idx_credit_journal_source on public.credit_journal (source_type, source_id)
  where source_id is not null;
create index idx_credit_journal_reverses on public.credit_journal (reverses_journal_id)
  where reverses_journal_id is not null;
create index idx_credit_journal_created on public.credit_journal using brin (created_at);

create table public.credit_entry (
  id                bigint      generated always as identity primary key,
  journal_id        uuid        not null references public.credit_journal (id),
  ledger_account_id uuid        not null references public.credit_ledger_account (id),
  lot_id            uuid        references public.credit_lot (id),
  amount_minor      bigint      not null check (amount_minor <> 0),
  currency          varchar(3)  not null default 'GHS',
  created_at        timestamptz not null default now()
);

create index idx_credit_entry_journal on public.credit_entry (journal_id);
create index idx_credit_entry_account on public.credit_entry (ledger_account_id, created_at desc);
create index idx_credit_entry_lot on public.credit_entry (lot_id) where lot_id is not null;
create index idx_credit_entry_created on public.credit_entry using brin (created_at);

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------

-- Every journal must balance to zero and have at least two lines. Deferred,
-- so it runs at COMMIT after all of a journal's lines are inserted.
create or replace function public.credit_assert_journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sum   bigint;
  v_lines integer;
begin
  select coalesce(sum(amount_minor), 0), count(*)
    into v_sum, v_lines
  from public.credit_entry
  where journal_id = new.journal_id;

  if v_sum <> 0 then
    raise exception 'credit journal % is unbalanced (sum %)', new.journal_id, v_sum
      using errcode = 'check_violation';
  end if;
  if v_lines < 2 then
    raise exception 'credit journal % has fewer than two lines', new.journal_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger credit_entry_balanced
  after insert on public.credit_entry
  deferrable initially deferred
  for each row execute function public.credit_assert_journal_balanced();

-- A journal with no lines at all would slip past the entry trigger.
create or replace function public.credit_assert_journal_has_entries()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.credit_entry where journal_id = new.id) then
    raise exception 'credit journal % has no lines', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger credit_journal_has_entries
  after insert on public.credit_journal
  deferrable initially deferred
  for each row execute function public.credit_assert_journal_has_entries();

-- Append-only, same approach as admin_audit_log.
create or replace function public.credit_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger credit_journal_append_only
  before update or delete on public.credit_journal
  for each row execute function public.credit_forbid_mutation();
create trigger credit_journal_no_truncate
  before truncate on public.credit_journal
  for each statement execute function public.credit_forbid_mutation();
create trigger credit_entry_append_only
  before update or delete on public.credit_entry
  for each row execute function public.credit_forbid_mutation();
create trigger credit_entry_no_truncate
  before truncate on public.credit_entry
  for each statement execute function public.credit_forbid_mutation();

-- ---------------------------------------------------------------------
-- Internal helpers (no grants: callable only from the definer functions)
-- ---------------------------------------------------------------------

create or replace function public._credit_ensure_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_account (user_id, currency)
  values (p_user_id, 'GHS')
  on conflict do nothing;

  insert into public.credit_ledger_account (owner_user_id, code, currency)
  select p_user_id, c, 'GHS'
  from unnest(array['pending', 'available', 'reserved', 'frozen', 'withdrawing']) as c
  on conflict do nothing;
end;
$$;

create or replace function public._credit_user_ledger_id(p_user_id uuid, p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.credit_ledger_account
  where owner_user_id = p_user_id and code = p_code and currency = 'GHS';
$$;

create or replace function public._credit_system_ledger_id(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.credit_ledger_account
  where owner_user_id is null and code = p_code and currency = 'GHS';
$$;

create or replace function public._credit_entry(
  p_journal_id   uuid,
  p_ledger_id    uuid,
  p_lot_id       uuid,
  p_amount_minor bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ledger_id is null then
    raise exception 'credit ledger account missing for journal %', p_journal_id;
  end if;
  if p_amount_minor = 0 then
    return;
  end if;
  insert into public.credit_entry (journal_id, ledger_account_id, lot_id, amount_minor)
  values (p_journal_id, p_ledger_id, p_lot_id, p_amount_minor);
end;
$$;

-- Consumes up to p_amount_minor of the user's FREE (unheld) balance from
-- their active lots and returns the per-lot breakdown. Order: an optional
-- preferred lot first, then credit that can't be withdrawn, then the
-- soonest-expiring, then the oldest -- best for the user (nothing expires
-- unused) and for Abonten (withdrawable credit is spent last). A lot drawn
-- to zero takes p_terminal_status (only the preferred lot when one is
-- given; any other lot becomes 'exhausted'). The caller must already hold
-- the credit_account row lock and writes the entries.
create or replace function public._credit_draw_lots(
  p_user_id         uuid,
  p_amount_minor    bigint,
  p_preferred_lot   uuid,
  p_scopes          text[],
  p_terminal_status text
)
returns table (lot_id uuid, drawn_minor bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_left bigint := p_amount_minor;
  v_take bigint;
  r      record;
begin
  for r in
    select l.id, l.remaining_minor - l.held_minor as free_minor
    from public.credit_lot l
    where l.user_id = p_user_id
      and l.status = 'active'
      and l.remaining_minor > l.held_minor
      and (p_scopes is null or l.spend_scope = any (p_scopes))
    order by (l.id = p_preferred_lot) desc nulls last,
             l.withdrawable asc,
             l.expires_at asc nulls last,
             l.created_at asc,
             l.id asc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.free_minor);

    update public.credit_lot l
    set remaining_minor = l.remaining_minor - v_take,
        status = case
                   when l.remaining_minor - v_take = 0 and l.held_minor = 0
                     then case when p_preferred_lot is null or l.id = p_preferred_lot
                                 then p_terminal_status else 'exhausted' end
                   else l.status
                 end,
        closed_at = case
                      when l.remaining_minor - v_take = 0 and l.held_minor = 0 then now()
                      else l.closed_at
                    end,
        updated_at = now()
    where l.id = r.id;

    lot_id := r.id;
    drawn_minor := v_take;
    return next;
    v_left := v_left - v_take;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Mutating functions (service_role only)
-- ---------------------------------------------------------------------

-- Grants credit as a new lot. 'reward.accrue' creates a PENDING lot funded
-- by reward_contingent (released later by credit_release_lot);
-- 'bonus.grant' (campaigns, goodwill) and 'adjust.credit' (admin) create an
-- AVAILABLE lot. Idempotent on p_idempotency_key: a replay returns the
-- original journal with created = false and changes nothing.
create or replace function public.credit_grant(
  p_user_id          uuid,
  p_amount_minor     bigint,
  p_journal_type     text,
  p_lot_kind         text,
  p_spend_scope      text,
  p_idempotency_key  text,
  p_actor_type       text        default 'system',
  p_actor_id         uuid        default null,
  p_label            text        default null,
  p_memo             text        default null,
  p_expires_at       timestamptz default null,
  p_release_at       timestamptz default null,
  p_withdrawable     boolean     default false,
  p_withdrawable_at  timestamptz default null,
  p_source_type      text        default null,
  p_source_id        text        default null,
  p_reward_event_id  uuid        default null
)
returns table (journal_id uuid, lot_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_funding       text;
  v_state         text;
  v_acct          public.credit_account;
  v_existing      record;
  v_repay         bigint := 0;
  v_lot_remaining bigint;
  v_lot           uuid;
  v_journal       uuid;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Credit amount must be positive' using errcode = '22023';
  end if;
  if coalesce(length(p_idempotency_key), 0) = 0 then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;

  v_funding := case p_journal_type
                 when 'reward.accrue' then 'reward_contingent'
                 when 'bonus.grant'   then 'campaign_expense'
                 when 'adjust.credit' then 'admin_adjustments'
               end;
  if v_funding is null then
    raise exception 'Unsupported grant type %', p_journal_type using errcode = '22023';
  end if;
  v_state := case when p_journal_type = 'reward.accrue' then 'pending' else 'available' end;

  if not exists (select 1 from public.user_info u where u.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform public._credit_ensure_account(p_user_id);

  select * into v_acct
  from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;

  -- Re-checked under the account lock so two concurrent calls with the
  -- same key can't both post.
  select j.id, j.lot_id into v_existing
  from public.credit_journal j
  where j.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.lot_id, false;
    return;
  end if;

  if v_acct.status = 'closed' then
    raise exception 'Credit account is closed' using errcode = '55000';
  end if;

  -- An account in debt repays the debt from new available credit first.
  if v_state = 'available' and v_acct.available_minor < 0 then
    v_repay := least(p_amount_minor, -v_acct.available_minor);
  end if;
  v_lot_remaining := p_amount_minor - v_repay;

  insert into public.credit_lot (
    user_id, kind, spend_scope, status, funding_code,
    original_minor, remaining_minor, released_minor,
    withdrawable, withdrawable_at, expires_at, release_at, released_at, closed_at,
    source_type, source_id, reward_event_id, label
  ) values (
    p_user_id, p_lot_kind, p_spend_scope,
    case when v_state = 'pending' then 'pending'
         when v_lot_remaining = 0 then 'exhausted'
         else 'active' end,
    v_funding,
    p_amount_minor, v_lot_remaining,
    case when v_state = 'available' then p_amount_minor end,
    coalesce(p_withdrawable, false), p_withdrawable_at, p_expires_at, p_release_at,
    case when v_state = 'available' then now() end,
    case when v_state = 'available' and v_lot_remaining = 0 then now() end,
    p_source_type, p_source_id, p_reward_event_id, p_label
  )
  returning id into v_lot;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, reward_event_id, actor_type, actor_id,
    user_label, memo
  ) values (
    p_journal_type, p_idempotency_key, p_user_id, p_amount_minor, true,
    v_lot, p_source_type, p_source_id, p_reward_event_id, p_actor_type, p_actor_id,
    p_label, p_memo
  )
  returning id into v_journal;

  perform public._credit_entry(v_journal, public._credit_system_ledger_id(v_funding), null, -p_amount_minor);
  perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, v_state), v_lot, p_amount_minor);

  update public.credit_account a
  set pending_minor         = a.pending_minor + case when v_state = 'pending' then p_amount_minor else 0 end,
      available_minor       = a.available_minor + case when v_state = 'available' then p_amount_minor else 0 end,
      lifetime_earned_minor = a.lifetime_earned_minor + case when v_state = 'available' then p_amount_minor else 0 end,
      version               = a.version + 1,
      updated_at            = now()
  where a.user_id = p_user_id and a.currency = 'GHS';

  return query select v_journal, v_lot, true;
end;
$$;

-- Voids a PENDING lot entirely (the sale was refunded, the event cancelled,
-- a fraud decision). Nothing was ever spendable, so nothing is clawed back.
create or replace function public.credit_void_lot(
  p_lot_id          uuid,
  p_idempotency_key text,
  p_actor_type      text default 'system',
  p_actor_id        uuid default null,
  p_memo            text default null
)
returns table (journal_id uuid, voided_minor bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user     uuid;
  v_lot      public.credit_lot;
  v_existing uuid;
  v_journal  uuid;
begin
  select l.user_id into v_user from public.credit_lot l where l.id = p_lot_id;
  if v_user is null then
    raise exception 'Credit lot not found' using errcode = 'P0002';
  end if;

  perform 1 from public.credit_account a
  where a.user_id = v_user and a.currency = 'GHS'
  for update;

  select j.id into v_existing from public.credit_journal j
  where j.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing, 0::bigint, false;
    return;
  end if;

  select * into v_lot from public.credit_lot l where l.id = p_lot_id for update;
  if v_lot.status <> 'pending' then
    raise exception 'Only a pending credit lot can be voided (lot is %)', v_lot.status
      using errcode = '55000';
  end if;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, reward_event_id, actor_type, actor_id, memo
  ) values (
    'reward.void', p_idempotency_key, v_user, -v_lot.remaining_minor, false,
    p_lot_id, v_lot.source_type, v_lot.source_id, v_lot.reward_event_id,
    p_actor_type, p_actor_id, p_memo
  )
  returning id into v_journal;

  perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'pending'), p_lot_id, -v_lot.remaining_minor);
  perform public._credit_entry(v_journal, public._credit_system_ledger_id(v_lot.funding_code), null, v_lot.remaining_minor);

  update public.credit_lot l
  set status = 'voided', remaining_minor = 0, closed_at = now(), updated_at = now()
  where l.id = p_lot_id;

  update public.credit_account a
  set pending_minor = a.pending_minor - v_lot.remaining_minor,
      version       = a.version + 1,
      updated_at    = now()
  where a.user_id = v_user and a.currency = 'GHS';

  return query select v_journal, v_lot.remaining_minor, true;
end;
$$;

-- Releases a PENDING lot to available. p_release_minor < the pending amount
-- releases part of it (pro rata, e.g. some of the referred tickets were
-- cancelled) and voids the rest in a second journal. Recognizes the reward
-- expense at release: pending is only a contingent liability until then.
create or replace function public.credit_release_lot(
  p_lot_id          uuid,
  p_idempotency_key text,
  p_release_minor   bigint default null,
  p_actor_type      text   default 'system',
  p_actor_id        uuid   default null,
  p_memo            text   default null
)
returns table (journal_id uuid, released_minor bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user     uuid;
  v_acct     public.credit_account;
  v_lot      public.credit_lot;
  v_existing uuid;
  v_release  bigint;
  v_void     bigint;
  v_repay    bigint := 0;
  v_journal  uuid;
  v_void_j   uuid;
begin
  select l.user_id into v_user from public.credit_lot l where l.id = p_lot_id;
  if v_user is null then
    raise exception 'Credit lot not found' using errcode = 'P0002';
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = v_user and a.currency = 'GHS'
  for update;

  select j.id into v_existing from public.credit_journal j
  where j.idempotency_key = p_idempotency_key;
  if found then
    return query
      select v_existing, l.released_minor, false
      from public.credit_lot l where l.id = p_lot_id;
    return;
  end if;

  select * into v_lot from public.credit_lot l where l.id = p_lot_id for update;
  if v_lot.status <> 'pending' then
    raise exception 'Only a pending credit lot can be released (lot is %)', v_lot.status
      using errcode = '55000';
  end if;

  v_release := coalesce(p_release_minor, v_lot.remaining_minor);
  if v_release < 0 or v_release > v_lot.remaining_minor then
    raise exception 'Release amount % is outside 0..%', v_release, v_lot.remaining_minor
      using errcode = '22023';
  end if;
  v_void := v_lot.remaining_minor - v_release;

  if v_release = 0 then
    return query
      select v.journal_id, 0::bigint, v.created
      from public.credit_void_lot(p_lot_id, p_idempotency_key, p_actor_type, p_actor_id, p_memo) v;
    return;
  end if;

  if v_acct.available_minor < 0 then
    v_repay := least(v_release, -v_acct.available_minor);
  end if;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, reward_event_id, actor_type, actor_id, memo
  ) values (
    'reward.release', p_idempotency_key, v_user, v_release, false,
    p_lot_id, v_lot.source_type, v_lot.source_id, v_lot.reward_event_id,
    p_actor_type, p_actor_id, p_memo
  )
  returning id into v_journal;

  perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'pending'), p_lot_id, -v_release);
  perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'available'), p_lot_id, v_release);
  perform public._credit_entry(v_journal, public._credit_system_ledger_id('reward_expense'), null, -v_release);
  perform public._credit_entry(v_journal, public._credit_system_ledger_id('reward_contingent'), null, v_release);

  if v_void > 0 then
    insert into public.credit_journal (
      journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
      lot_id, source_type, source_id, reward_event_id, reverses_journal_id,
      actor_type, actor_id, memo
    ) values (
      'reward.void', p_idempotency_key || ':remainder', v_user, -v_void, false,
      p_lot_id, v_lot.source_type, v_lot.source_id, v_lot.reward_event_id, null,
      p_actor_type, p_actor_id, 'Unreleased remainder voided'
    )
    returning id into v_void_j;

    perform public._credit_entry(v_void_j, public._credit_user_ledger_id(v_user, 'pending'), p_lot_id, -v_void);
    perform public._credit_entry(v_void_j, public._credit_system_ledger_id('reward_contingent'), null, v_void);
  end if;

  update public.credit_lot l
  set status          = case when v_release - v_repay = 0 then 'exhausted' else 'active' end,
      remaining_minor = v_release - v_repay,
      released_minor  = v_release,
      released_at     = now(),
      closed_at       = case when v_release - v_repay = 0 then now() else l.closed_at end,
      updated_at      = now()
  where l.id = p_lot_id;

  update public.credit_account a
  set pending_minor           = a.pending_minor - v_lot.remaining_minor,
      available_minor         = a.available_minor + v_release,
      lifetime_earned_minor   = a.lifetime_earned_minor + v_release,
      version                 = a.version + 1,
      updated_at              = now()
  where a.user_id = v_user and a.currency = 'GHS';

  return query select v_journal, v_release, true;
end;
$$;

-- Debits the user's available credit: an admin debit ('adjust.debit') or a
-- clawback of released reward credit after a chargeback / confirmed fraud
-- ('reward.clawback'). Draws from the preferred lot first, then the normal
-- order. With p_allow_negative the balance may go below zero (the account
-- is then "in debt": spending and withdrawal are blocked and the next grant
-- repays it); without it, an amount above the available balance is refused.
create or replace function public.credit_debit_available(
  p_user_id         uuid,
  p_amount_minor    bigint,
  p_journal_type    text,
  p_idempotency_key text,
  p_allow_negative  boolean default false,
  p_preferred_lot   uuid    default null,
  p_actor_type      text    default 'system',
  p_actor_id        uuid    default null,
  p_label           text    default null,
  p_memo            text    default null,
  p_source_type     text    default null,
  p_source_id       text    default null,
  p_reward_event_id uuid    default null
)
returns table (journal_id uuid, debited_minor bigint, shortfall_minor bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_acct      public.credit_account;
  v_existing  uuid;
  v_funding   text;
  v_journal   uuid;
  v_drawn     bigint := 0;
  v_shortfall bigint;
  r           record;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Debit amount must be positive' using errcode = '22023';
  end if;
  v_funding := case p_journal_type
                 when 'adjust.debit'    then 'admin_adjustments'
                 when 'reward.clawback' then 'reward_expense'
               end;
  if v_funding is null then
    raise exception 'Unsupported debit type %', p_journal_type using errcode = '22023';
  end if;

  perform public._credit_ensure_account(p_user_id);

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;

  select j.id into v_existing from public.credit_journal j
  where j.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing, 0::bigint, 0::bigint, false;
    return;
  end if;

  if not p_allow_negative and v_acct.available_minor < p_amount_minor then
    raise exception 'Insufficient credit (available %, requested %)',
      v_acct.available_minor, p_amount_minor
      using errcode = '23514';
  end if;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, reward_event_id, actor_type, actor_id,
    user_label, memo
  ) values (
    p_journal_type, p_idempotency_key, p_user_id, -p_amount_minor, true,
    p_preferred_lot, p_source_type, p_source_id, p_reward_event_id,
    p_actor_type, p_actor_id, p_label, p_memo
  )
  returning id into v_journal;

  for r in
    select d.lot_id, d.drawn_minor
    from public._credit_draw_lots(
      p_user_id, p_amount_minor, p_preferred_lot, null,
      case when p_journal_type = 'reward.clawback' then 'clawed_back' else 'exhausted' end
    ) d
  loop
    perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), r.lot_id, -r.drawn_minor);
    v_drawn := v_drawn + r.drawn_minor;
  end loop;

  v_shortfall := p_amount_minor - v_drawn;
  if v_shortfall > 0 then
    perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), null, -v_shortfall);
  end if;
  perform public._credit_entry(v_journal, public._credit_system_ledger_id(v_funding), null, p_amount_minor);

  update public.credit_account a
  set available_minor         = a.available_minor - p_amount_minor,
      lifetime_reversed_minor = a.lifetime_reversed_minor + p_amount_minor,
      version                 = a.version + 1,
      updated_at              = now()
  where a.user_id = p_user_id and a.currency = 'GHS';

  return query select v_journal, p_amount_minor, v_shortfall, true;
end;
$$;

-- Expires the free part of one lot. Safe to re-run: it recomputes from the
-- locked lot and does nothing when nothing is due.
create or replace function public._credit_expire_lot(p_lot_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid;
  v_lot     public.credit_lot;
  v_free    bigint;
  v_journal uuid;
begin
  select l.user_id into v_user from public.credit_lot l where l.id = p_lot_id;
  if v_user is null then
    return 0;
  end if;

  perform 1 from public.credit_account a
  where a.user_id = v_user and a.currency = 'GHS'
  for update;

  select * into v_lot from public.credit_lot l where l.id = p_lot_id for update;
  v_free := v_lot.remaining_minor - v_lot.held_minor;
  if v_lot.status <> 'active' or v_lot.expires_at is null
     or v_lot.expires_at > now() or v_free <= 0 then
    return 0;
  end if;

  -- remaining_minor strictly decreases with every expiry, so this key is
  -- unique per expiry of the same lot.
  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, actor_type, user_label
  ) values (
    'expire', 'expire:' || p_lot_id || ':' || v_lot.remaining_minor || ':' || v_lot.held_minor,
    v_user, -v_free, true, p_lot_id, v_lot.source_type, v_lot.source_id, 'system',
    v_lot.label
  )
  returning id into v_journal;

  perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_user, 'available'), p_lot_id, -v_free);
  perform public._credit_entry(v_journal, public._credit_system_ledger_id('breakage'), null, v_free);

  update public.credit_lot l
  set remaining_minor = l.remaining_minor - v_free,
      status          = case when l.held_minor = 0 then 'expired' else l.status end,
      closed_at       = case when l.held_minor = 0 then now() else l.closed_at end,
      updated_at      = now()
  where l.id = p_lot_id;

  update public.credit_account a
  set available_minor        = a.available_minor - v_free,
      lifetime_expired_minor = a.lifetime_expired_minor + v_free,
      version                = a.version + 1,
      updated_at             = now()
  where a.user_id = v_user and a.currency = 'GHS';

  return v_free;
end;
$$;

create or replace function public.credit_expire_due_lots(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r       record;
begin
  for r in
    select l.id
    from public.credit_lot l
    where l.status = 'active'
      and l.expires_at <= now()
      and l.remaining_minor > l.held_minor
    order by l.expires_at
    limit greatest(coalesce(p_limit, 500), 1)
  loop
    if public._credit_expire_lot(r.id) > 0 then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Freezes / unfreezes an account. A frozen account keeps earning but can't
-- spend, reserve or withdraw. Status only -- no money moves.
create or replace function public.credit_set_account_status(
  p_user_id  uuid,
  p_status   text,
  p_reason   text,
  p_actor_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  if p_status not in ('active', 'frozen') then
    raise exception 'Unsupported credit account status %', p_status using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_info u where u.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform public._credit_ensure_account(p_user_id);

  select a.status into v_previous from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;

  if v_previous = 'closed' then
    raise exception 'Credit account is closed' using errcode = '55000';
  end if;

  update public.credit_account a
  set status            = p_status,
      status_reason     = p_reason,
      status_changed_at = now(),
      status_changed_by = p_actor_id,
      version           = a.version + 1,
      updated_at        = now()
  where a.user_id = p_user_id and a.currency = 'GHS';

  return v_previous;
end;
$$;

-- Called before an account is deleted: voids pending lots, forfeits the
-- available balance to breakage (or writes off a debt), and marks the
-- account closed. Idempotent.
create or replace function public.credit_close_account(
  p_user_id    uuid,
  p_actor_type text default 'system',
  p_actor_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct    public.credit_account;
  v_journal uuid;
  r         record;
begin
  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS'
  for update;
  if not found or v_acct.status = 'closed' then
    return;
  end if;

  for r in
    select l.id from public.credit_lot l
    where l.user_id = p_user_id and l.status = 'pending'
  loop
    perform public.credit_void_lot(r.id, 'close:void:' || r.id, p_actor_type, p_actor_id, 'Account closed');
  end loop;

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS';

  if v_acct.available_minor <> 0 then
    insert into public.credit_journal (
      journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
      actor_type, actor_id, memo
    ) values (
      'account.close', 'close:' || p_user_id, p_user_id, -v_acct.available_minor, false,
      p_actor_type, p_actor_id, 'Account closed: balance forfeited'
    )
    returning id into v_journal;

    if v_acct.available_minor > 0 then
      for r in
        select d.lot_id, d.drawn_minor
        from public._credit_draw_lots(p_user_id, v_acct.available_minor, null, null, 'forfeited') d
      loop
        perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), r.lot_id, -r.drawn_minor);
      end loop;
      perform public._credit_entry(v_journal, public._credit_system_ledger_id('breakage'), null, v_acct.available_minor);
    else
      -- A debt the user never repaid is written off.
      perform public._credit_entry(v_journal, public._credit_user_ledger_id(p_user_id, 'available'), null, -v_acct.available_minor);
      perform public._credit_entry(v_journal, public._credit_system_ledger_id('admin_adjustments'), null, v_acct.available_minor);
    end if;
  end if;

  update public.credit_account a
  set status                 = 'closed',
      status_reason          = 'Account deleted',
      status_changed_at      = now(),
      status_changed_by      = p_actor_id,
      available_minor        = 0,
      lifetime_expired_minor = a.lifetime_expired_minor + greatest(v_acct.available_minor, 0),
      version                = a.version + 1,
      updated_at             = now()
  where a.user_id = p_user_id and a.currency = 'GHS';
end;
$$;

-- ---------------------------------------------------------------------
-- Read functions (the signed-in user's own data only)
-- ---------------------------------------------------------------------

create or replace function public.get_my_credit_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_acct public.credit_account;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = v_uid and a.currency = 'GHS';

  return jsonb_build_object(
    'currency', 'GHS',
    'status', coalesce(v_acct.status, 'active'),
    'available_minor', coalesce(v_acct.available_minor, 0),
    'pending_minor', coalesce(v_acct.pending_minor, 0),
    'on_hold_minor', coalesce(v_acct.reserved_minor + v_acct.frozen_minor + v_acct.withdrawing_minor, 0),
    'in_debt', coalesce(v_acct.available_minor, 0) < 0,
    'lifetime', jsonb_build_object(
      'earned_minor', coalesce(v_acct.lifetime_earned_minor, 0),
      'spent_minor', coalesce(v_acct.lifetime_spent_minor, 0),
      'withdrawn_minor', coalesce(v_acct.lifetime_withdrawn_minor, 0),
      'expired_minor', coalesce(v_acct.lifetime_expired_minor, 0),
      'reversed_minor', coalesce(v_acct.lifetime_reversed_minor, 0)
    ),
    'by_scope', coalesce((
      select jsonb_object_agg(s.spend_scope, s.free_minor)
      from (
        select l.spend_scope, sum(l.remaining_minor - l.held_minor) as free_minor
        from public.credit_lot l
        where l.user_id = v_uid and l.status = 'active' and l.remaining_minor > l.held_minor
        group by l.spend_scope
      ) s
    ), '{}'::jsonb),
    'withdrawable_minor', coalesce((
      select sum(l.remaining_minor - l.held_minor)
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'active' and l.withdrawable
        and (l.withdrawable_at is null or l.withdrawable_at <= now())
    ), 0),
    'expiring_soon', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'amount_minor', sum(l.remaining_minor - l.held_minor),
        'expires_at', min(l.expires_at)
      ) end
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'active'
        and l.remaining_minor > l.held_minor
        and l.expires_at <= now() + interval '14 days'
    ),
    'next_release', (
      select jsonb_build_object(
        'amount_minor', l.remaining_minor,
        'release_at', l.release_at,
        'label', l.label
      )
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'pending' and l.release_at is not null
      order by l.release_at asc
      limit 1
    )
  );
end;
$$;

-- The user's activity feed, newest first, keyset-paginated on
-- (created_at, id) like get_organizer_ledger_transactions. Grant-type lines
-- carry their lot's CURRENT status, so a reward shows as pending and later
-- as available on the same line.
create or replace function public.get_my_credit_activity(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             integer     default 20
)
returns table (
  id              uuid,
  journal_type    text,
  amount_minor    bigint,
  label           text,
  source_type     text,
  source_id       text,
  lot_kind        text,
  lot_status      text,
  lot_expires_at  timestamptz,
  lot_release_at  timestamptz,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.journal_type, j.user_delta_minor, j.user_label, j.source_type, j.source_id,
         l.kind, l.status, l.expires_at, l.release_at, j.created_at
  from public.credit_journal j
  left join public.credit_lot l on l.id = j.lot_id
  where j.user_id = auth.uid()
    and j.visible_to_user
    and (p_cursor_created_at is null
         or j.created_at < p_cursor_created_at
         or (j.created_at = p_cursor_created_at and j.id < p_cursor_id))
  order by j.created_at desc, j.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- ---------------------------------------------------------------------
-- Reconciliation (the credit invariants; run_financial_reconciliation
-- opens incidents from these counts)
-- ---------------------------------------------------------------------

create or replace function public.credit_reconciliation_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unbalanced   integer;
  v_cache_drift  integer;
  v_lot_drift    integer;
  v_lot_invalid  integer;
begin
  -- 1. Journals whose lines don't sum to zero (the deferred trigger should
  -- make this impossible; this catches it being dropped or bypassed).
  -- Recent window keeps the 30-minute run cheap at scale.
  select count(*) into v_unbalanced
  from (
    select e.journal_id
    from public.credit_entry e
    where e.created_at > now() - interval '2 days'
    group by e.journal_id
    having sum(e.amount_minor) <> 0 or count(*) < 2
  ) x;

  -- 2. Cached bucket balances that don't equal the sum of their entries.
  select count(*) into v_cache_drift
  from public.credit_account a
  left join lateral (
    select
      coalesce(sum(e.amount_minor) filter (where la.code = 'pending'), 0)     as pending,
      coalesce(sum(e.amount_minor) filter (where la.code = 'available'), 0)   as available,
      coalesce(sum(e.amount_minor) filter (where la.code = 'reserved'), 0)    as reserved,
      coalesce(sum(e.amount_minor) filter (where la.code = 'frozen'), 0)      as frozen,
      coalesce(sum(e.amount_minor) filter (where la.code = 'withdrawing'), 0) as withdrawing
    from public.credit_ledger_account la
    join public.credit_entry e on e.ledger_account_id = la.id
    where la.owner_user_id = a.user_id and la.currency = a.currency
  ) s on true
  where a.updated_at > now() - interval '2 days'
    and (a.pending_minor <> s.pending
         or a.available_minor <> s.available
         or a.reserved_minor <> s.reserved
         or a.frozen_minor <> s.frozen
         or a.withdrawing_minor <> s.withdrawing);

  -- 3. Lots that don't add up to the account buckets.
  select count(*) into v_lot_drift
  from public.credit_account a
  left join lateral (
    select
      coalesce(sum(l.remaining_minor) filter (where l.status = 'pending'), 0)                  as pending,
      coalesce(sum(l.remaining_minor - l.held_minor) filter (where l.status = 'active'), 0)    as free,
      coalesce(sum(l.held_minor) filter (where l.status in ('active', 'expired')), 0)          as held
    from public.credit_lot l
    where l.user_id = a.user_id and l.currency = a.currency
  ) s on true
  where a.updated_at > now() - interval '2 days'
    and a.status <> 'closed'
    and (a.pending_minor <> s.pending
         or greatest(a.available_minor, 0) <> s.free
         or (a.reserved_minor + a.frozen_minor + a.withdrawing_minor) <> s.held);

  -- 4. Lots in an impossible state.
  select count(*) into v_lot_invalid
  from public.credit_lot l
  where (l.status in ('exhausted', 'expired', 'voided', 'clawed_back', 'forfeited')
         and l.remaining_minor > l.held_minor)
     or (l.status = 'pending' and l.held_minor > 0);

  return jsonb_build_object(
    'credit_unbalanced_journals', v_unbalanced,
    'credit_balance_cache_drift', v_cache_drift,
    'credit_lot_bucket_drift', v_lot_drift,
    'credit_lot_invalid_state', v_lot_invalid
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------

alter table public.credit_account enable row level security;
alter table public.credit_ledger_account enable row level security;
alter table public.credit_lot enable row level security;
alter table public.credit_journal enable row level security;
alter table public.credit_entry enable row level security;

create policy credit_account_owner_select on public.credit_account
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy credit_lot_owner_select on public.credit_lot
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- credit_ledger_account / credit_journal / credit_entry: no client policy.
-- They carry system accounts and internal memos; users read their activity
-- through get_my_credit_activity().

revoke all on table public.credit_account, public.credit_ledger_account,
  public.credit_lot, public.credit_journal, public.credit_entry
  from anon, authenticated, service_role;

grant select on table public.credit_account, public.credit_lot to authenticated;
-- SELECT only, even for the backend key: credit moves through the functions
-- below and nowhere else.
grant select on table public.credit_account, public.credit_ledger_account,
  public.credit_lot, public.credit_journal, public.credit_entry
  to service_role;

revoke all on function public.credit_assert_journal_balanced() from public, anon, authenticated;
revoke all on function public.credit_assert_journal_has_entries() from public, anon, authenticated;
revoke all on function public.credit_forbid_mutation() from public, anon, authenticated;

revoke all on function public._credit_ensure_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public._credit_user_ledger_id(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._credit_system_ledger_id(text) from public, anon, authenticated, service_role;
revoke all on function public._credit_entry(uuid, uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public._credit_draw_lots(uuid, bigint, uuid, text[], text) from public, anon, authenticated, service_role;
revoke all on function public._credit_expire_lot(uuid) from public, anon, authenticated, service_role;

revoke all on function public.credit_grant(uuid, bigint, text, text, text, text, text, uuid, text, text, timestamptz, timestamptz, boolean, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_void_lot(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_release_lot(uuid, text, bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.credit_debit_available(uuid, bigint, text, text, boolean, uuid, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_expire_due_lots(integer) from public, anon, authenticated;
revoke all on function public.credit_set_account_status(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_close_account(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_reconciliation_checks() from public, anon, authenticated;

grant execute on function public.credit_grant(uuid, bigint, text, text, text, text, text, uuid, text, text, timestamptz, timestamptz, boolean, timestamptz, text, text, uuid) to service_role;
grant execute on function public.credit_void_lot(uuid, text, text, uuid, text) to service_role;
grant execute on function public.credit_release_lot(uuid, text, bigint, text, uuid, text) to service_role;
grant execute on function public.credit_debit_available(uuid, bigint, text, text, boolean, uuid, text, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.credit_expire_due_lots(integer) to service_role;
grant execute on function public.credit_set_account_status(uuid, text, text, uuid) to service_role;
grant execute on function public.credit_close_account(uuid, text, uuid) to service_role;
grant execute on function public.credit_reconciliation_checks() to service_role;

revoke all on function public.get_my_credit_summary() from public, anon;
revoke all on function public.get_my_credit_activity(timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_my_credit_summary() to authenticated, service_role;
grant execute on function public.get_my_credit_activity(timestamptz, uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Scheduled expiry (daily, 02:00 UTC = Accra)
-- ---------------------------------------------------------------------

select cron.schedule(
  'credit-expire-lots',
  '0 2 * * *',
  $cron$select public.credit_expire_due_lots(5000);$cron$
);
