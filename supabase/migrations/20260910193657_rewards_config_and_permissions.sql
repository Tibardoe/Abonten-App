-- Abonten Rewards, Phase 1: program settings, versioned reward rules,
-- campaigns, monthly budgets, and the admin permissions for the Rewards
-- module. Everything ships switched OFF: rewards_enabled = false, every rule
-- inactive. Nothing here moves credit.
--
-- Rates below are the owner-approved launch defaults (2026-09-10):
--   event referral 1% of ticket revenue, capped at 35% of that sale's net
--   platform revenue; friend referral GH₵ 3 to the referrer + GH₵ 2 welcome
--   credit to the new user; organizer rebate 20% of net revenue as
--   promotion credit; monthly budget ceiling max(GH₵ 1,000, 25% of trailing
--   net revenue); no withdrawals in version 1.
-- All amounts are pesewas (bigint), rates are basis points (1% = 100).

-- ---------------------------------------------------------------------
-- reward_program_setting: one row of switches and thresholds
-- ---------------------------------------------------------------------

create table public.reward_program_setting (
  id                                     smallint    primary key default 1 check (id = 1),
  rewards_enabled                        boolean     not null default false,
  -- staff = active admins only; beta = staff + beta_user_ids; all = everyone.
  audience                               text        not null default 'staff'
                                           check (audience in ('staff', 'beta', 'all')),
  beta_user_ids                          uuid[]      not null default '{}',
  referral_capture_enabled               boolean     not null default false,
  -- The engine evaluates and records decisions without posting credit.
  shadow_mode                            boolean     not null default true,
  redeem_promotions_enabled              boolean     not null default false,
  redeem_tickets_enabled                 boolean     not null default false,
  allow_full_credit_ticket_orders        boolean     not null default false,
  withdrawals_enabled                    boolean     not null default false,
  max_credit_share_of_ticket_order_bps   integer     not null default 10000
                                           check (max_credit_share_of_ticket_order_bps between 0 and 10000),
  -- Paystack can't charge a few pesewas: a part-credit order must leave at
  -- least this much to charge in cash, or be paid fully with credit.
  min_cash_charge_minor                  bigint      not null default 100 check (min_cash_charge_minor >= 0),
  budget_floor_minor                     bigint      not null default 100000 check (budget_floor_minor >= 0),
  budget_net_revenue_share_bps           integer     not null default 2500
                                           check (budget_net_revenue_share_bps between 0 and 10000),
  -- Admin adjustments at or above this need a second approver.
  dual_approval_threshold_minor          bigint      not null default 50000 check (dual_approval_threshold_minor >= 0),
  support_goodwill_monthly_cap_minor     bigint      not null default 5000 check (support_goodwill_monthly_cap_minor >= 0),
  -- Organizer payout held for review when credit paid more than this share
  -- of an event's revenue (Phase 3).
  credit_share_payout_hold_bps           integer     not null default 2000
                                           check (credit_share_payout_hold_bps between 0 and 10000),
  withdrawal_min_minor                   bigint      not null default 10000 check (withdrawal_min_minor >= 0),
  updated_at                             timestamptz not null default now(),
  updated_by                             uuid
);

insert into public.reward_program_setting (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- reward_rule: versioned rules. A change is a NEW version row; old rows are
-- never edited (only is_active flips), so every reward records exactly the
-- terms it was calculated under.
-- ---------------------------------------------------------------------

create table public.reward_rule (
  id                  uuid        primary key default gen_random_uuid(),
  rule_key            text        not null check (rule_key in (
                        'event_referral', 'friend_referral_referrer', 'friend_referral_referee',
                        'organizer_rebate', 'venue_rebate', 'organizer_milestone')),
  version             integer     not null check (version > 0),
  is_active           boolean     not null default false,
  -- Share of the basis (ticket revenue), in basis points.
  rate_bps            integer     check (rate_bps between 0 and 10000),
  -- Hard cap as a share of the sale's attributable NET platform revenue.
  net_share_cap_bps   integer     check (net_share_cap_bps between 0 and 10000),
  flat_minor          bigint      check (flat_minor >= 0),
  min_basis_minor     bigint      not null default 0 check (min_basis_minor >= 0),
  caps                jsonb       not null default '{}'::jsonb,
  release_policy      text        not null check (release_policy in (
                        'event_settled', 'claim_approved_delay', 'monthly', 'immediate')),
  release_delay       interval,
  lot_kind            text        not null check (lot_kind in (
                        'reward', 'promotion', 'welcome', 'bonus')),
  spend_scope         text        not null check (spend_scope in (
                        'any', 'tickets', 'promotions', 'first_order')),
  expiry_days         integer     check (expiry_days > 0),
  withdrawable        boolean     not null default false,
  withdrawable_delay  interval,
  effective_from      timestamptz not null default now(),
  note                text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  constraint reward_rule_key_version_key unique (rule_key, version)
);

create unique index reward_rule_one_active_per_key
  on public.reward_rule (rule_key) where is_active;

create or replace function public.reward_rule_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reward_rule versions cannot be deleted; deactivate them instead'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
    raise exception 'reward_rule versions are immutable; create a new version instead'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger reward_rule_immutable
  before update or delete on public.reward_rule
  for each row execute function public.reward_rule_guard();

insert into public.reward_rule (
  rule_key, version, is_active, rate_bps, net_share_cap_bps, flat_minor, min_basis_minor,
  caps, release_policy, release_delay, lot_kind, spend_scope, expiry_days, withdrawable, note
) values
  ('event_referral', 1, false, 100, 3500, null, 2000,
   '{"per_buyer_event_checkouts": 1, "per_referrer_event_minor": 20000, "per_referrer_month_minor": 50000}'::jsonb,
   'event_settled', null, 'reward', 'any', 365, false,
   'Launch default: 1% of ticket revenue, max 35% of the sale''s net revenue; min ticket order GH₵ 20.'),
  ('friend_referral_referrer', 1, false, null, null, 300, 3000,
   '{"per_referrer_month_count": 10, "lifetime_review_count": 50, "qualify_within_days": 60, "bind_within_days": 7}'::jsonb,
   'event_settled', null, 'reward', 'any', 365, false,
   'Launch default: GH₵ 3 once the friend''s first paid order (min GH₵ 30) settles.'),
  ('friend_referral_referee', 1, false, null, null, 200, 3000,
   '{}'::jsonb,
   'immediate', null, 'welcome', 'first_order', 30, false,
   'Launch default: GH₵ 2 welcome credit for a first ticket order of GH₵ 30 or more, valid 30 days.'),
  ('organizer_rebate', 1, false, null, 2000, null, 0,
   '{"min_account_age_days": 30, "max_event_refund_rate_bps": 1000}'::jsonb,
   'monthly', null, 'promotion', 'promotions', 180, false,
   'Launch default: 20% of net revenue from settled events, as promotion credit.'),
  ('venue_rebate', 1, false, null, 500, null, 0,
   '{"requires_verified_place": true}'::jsonb,
   'monthly', null, 'promotion', 'promotions', 180, false,
   'Launch default: 5% of net revenue from paid events held at a verified place by other organizers.'),
  ('organizer_milestone', 1, false, null, null, 2000, 0,
   '{"unique_paid_attendees": 50}'::jsonb,
   'monthly', null, 'promotion', 'promotions', 180, false,
   'Launch default: GH₵ 20 promotion credit the first time an event reaches 50 unique paid attendees.')
on conflict (rule_key, version) do nothing;

-- ---------------------------------------------------------------------
-- reward_campaign: time-boxed multipliers or bonuses, each with its own
-- budget that is drawn down atomically.
-- ---------------------------------------------------------------------

create table public.reward_campaign (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null check (length(name) between 1 and 120),
  description      text,
  kind             text        not null check (kind in ('multiplier', 'bonus')),
  rule_key         text,
  multiplier_bps   integer     check (multiplier_bps between 10000 and 50000),
  bonus_minor      bigint      check (bonus_minor > 0),
  lot_kind         text        not null default 'bonus'
                     check (lot_kind in ('reward', 'promotion', 'welcome', 'bonus')),
  spend_scope      text        not null default 'any'
                     check (spend_scope in ('any', 'tickets', 'promotions', 'first_order')),
  expiry_days      integer     check (expiry_days > 0),
  target           jsonb       not null default '{}'::jsonb,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  budget_minor     bigint      not null check (budget_minor > 0),
  committed_minor  bigint      not null default 0 check (committed_minor >= 0),
  status           text        not null default 'draft'
                     check (status in ('draft', 'active', 'paused', 'ended')),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint reward_campaign_window_check check (ends_at > starts_at),
  constraint reward_campaign_budget_check check (committed_minor <= budget_minor),
  constraint reward_campaign_kind_fields_check check (
    (kind = 'multiplier' and multiplier_bps is not null and rule_key is not null)
    or (kind = 'bonus' and bonus_minor is not null)
  )
);

create index idx_reward_campaign_status on public.reward_campaign (status, starts_at, ends_at);

-- ---------------------------------------------------------------------
-- reward_budget_period: the monthly ceiling, enforced when rewards are
-- accrued (Phase 4).
-- ---------------------------------------------------------------------

create table public.reward_budget_period (
  period_start    date        primary key check (extract(day from period_start) = 1),
  ceiling_minor   bigint      not null check (ceiling_minor >= 0),
  committed_minor bigint      not null default 0 check (committed_minor >= 0),
  released_minor  bigint      not null default 0 check (released_minor >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Who the program is switched on for
-- ---------------------------------------------------------------------

-- Service-side check (explicit user id), used by @abonten/services.
create or replace function public.rewards_enabled_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.rewards_enabled
      and (
        s.audience = 'all'
        or exists (select 1 from public.admin_user au
                   where au.user_id = p_user_id and au.status = 'active')
        or (s.audience = 'beta' and p_user_id = any (s.beta_user_ids))
      )
    from public.reward_program_setting s
    where s.id = 1
  ), false);
$$;

-- Public, sanitized view of the program for "How to earn" copy. Callable by
-- anyone; `enabled` is evaluated for the caller.
create or replace function public.get_rewards_program_public()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.reward_program_setting where id = 1
  ),
  r as (
    select rule_key, rate_bps, net_share_cap_bps, flat_minor, min_basis_minor,
           expiry_days, release_policy, caps
    from public.reward_rule
    where is_active
  )
  select jsonb_build_object(
    'enabled', public.rewards_enabled_for_user(auth.uid()),
    'event_referral', (
      select jsonb_build_object('rate_bps', rate_bps, 'min_order_minor', min_basis_minor,
                                'expiry_days', expiry_days)
      from r where rule_key = 'event_referral'),
    'friend_referral', (
      select jsonb_build_object(
        'referrer_minor', (select flat_minor from r where rule_key = 'friend_referral_referrer'),
        'referee_minor', (select flat_minor from r where rule_key = 'friend_referral_referee'),
        'min_order_minor', (select min_basis_minor from r where rule_key = 'friend_referral_referrer'),
        'welcome_expiry_days', (select expiry_days from r where rule_key = 'friend_referral_referee'))
      where exists (select 1 from r where rule_key = 'friend_referral_referrer')),
    'organizer_rebate', (
      select jsonb_build_object('net_share_bps', net_share_cap_bps, 'expiry_days', expiry_days)
      from r where rule_key = 'organizer_rebate'),
    'venue_rebate', (
      select jsonb_build_object('net_share_bps', net_share_cap_bps, 'expiry_days', expiry_days)
      from r where rule_key = 'venue_rebate'),
    'redemption', jsonb_build_object(
      'tickets', s.redeem_tickets_enabled,
      'promotions', s.redeem_promotions_enabled,
      'allow_full_credit_ticket_orders', s.allow_full_credit_ticket_orders,
      'min_cash_charge_minor', s.min_cash_charge_minor),
    'withdrawals', jsonb_build_object(
      'enabled', s.withdrawals_enabled,
      'min_minor', s.withdrawal_min_minor)
  )
  from s;
$$;

-- ---------------------------------------------------------------------
-- RLS + privileges: service-role only (admin reads/writes go through
-- @abonten/services/admin with step-up + audit).
-- ---------------------------------------------------------------------

alter table public.reward_program_setting enable row level security;
alter table public.reward_rule enable row level security;
alter table public.reward_campaign enable row level security;
alter table public.reward_budget_period enable row level security;

revoke all on table public.reward_program_setting, public.reward_rule,
  public.reward_campaign, public.reward_budget_period
  from anon, authenticated;
grant all on table public.reward_program_setting, public.reward_rule,
  public.reward_campaign, public.reward_budget_period
  to service_role;

revoke all on function public.reward_rule_guard() from public, anon, authenticated;
revoke all on function public.rewards_enabled_for_user(uuid) from public, anon, authenticated;
grant execute on function public.rewards_enabled_for_user(uuid) to service_role;
revoke all on function public.get_rewards_program_public() from public;
grant execute on function public.get_rewards_program_public() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Admin permissions for the Rewards module
-- ---------------------------------------------------------------------
-- super_admin receives every permission through resolveAdminContext (its
-- admin_role_permission rows are immutable), so only non-super seeds here.
-- Manual adjustments reuse the existing finance.adjust permission.

insert into public.admin_permission (key, label, description) values
  ('rewards.view',        'View rewards',          'See credit accounts, the ledger trace, referrals and reward analytics.'),
  ('rewards.review',      'Review rewards',        'Approve or reject rewards held for review.'),
  ('rewards.freeze',      'Freeze credit accounts','Freeze or unfreeze a user''s credit account.'),
  ('rewards.goodwill',    'Grant goodwill credit', 'Grant small goodwill credit, up to the monthly cap per user.'),
  ('rewards.configure',   'Configure rewards',     'Change reward rules, campaigns, budgets and program switches.'),
  ('rewards.withdrawals', 'Manage withdrawals',    'Review, approve and send credit withdrawals.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('finance_admin', 'rewards.view'),
  ('finance_admin', 'rewards.review'),
  ('finance_admin', 'rewards.freeze'),
  ('finance_admin', 'rewards.goodwill'),
  ('finance_admin', 'rewards.configure'),
  ('finance_admin', 'rewards.withdrawals'),
  ('operations',    'rewards.view'),
  ('operations',    'rewards.review'),
  ('operations',    'rewards.freeze'),
  ('operations',    'rewards.goodwill'),
  ('support_admin', 'rewards.view'),
  ('support_admin', 'rewards.goodwill'),
  ('analyst',       'rewards.view')
on conflict do nothing;
