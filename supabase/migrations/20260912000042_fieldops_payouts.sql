-- Field Ops Phase 4: paying the team.
--
-- Approved commissions are grouped per member into a batch, a SECOND admin
-- approves it (a DB CHECK, not a convention), the money is sent by mobile
-- money outside the system, and each transfer's reference is recorded
-- against its item. Items move the commissions behind them: approved ->
-- in_payout -> paid, and back to approved if a transfer fails, so nothing
-- is ever stranded.
--
-- Same posture as the commission ledger: amounts in minor units, no client
-- writes at all, no DELETE even for service_role, an immutability guard
-- that allows only the lifecycle columns to change, and every amount
-- computed in SQL from rows the client cannot touch.

-- ---------------------------------------------------------------------
-- fieldops_payout_batch
-- ---------------------------------------------------------------------

create table public.fieldops_payout_batch (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        not null references public.fieldops_campaign (id) on delete restrict,
  label           text        not null check (length(label) between 2 and 80),
  currency        char(3)     not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  status          text        not null default 'draft' check (status in (
                    'draft', 'approved', 'paid', 'cancelled')),
  total_minor     bigint      not null default 0 check (total_minor >= 0),
  item_count      integer     not null default 0 check (item_count >= 0),
  payment_method  text        not null default 'momo_manual' check (payment_method in (
                    'momo_manual', 'bank_manual', 'paystack_transfer')),
  created_by      uuid        not null,
  approved_by     uuid,
  approved_at     timestamptz,
  paid_by         uuid,
  paid_at         timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text        check (cancel_reason is null or length(cancel_reason) <= 2000),
  notes           text        check (notes is null or length(notes) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Separation of duties: whoever built the batch cannot approve it.
  constraint fieldops_payout_batch_two_admins
    check (approved_by is null or approved_by <> created_by)
);

comment on table public.fieldops_payout_batch is
  'Field Ops: approved commissions grouped for one payout run. Built by one admin, approved by a different one (DB CHECK), paid by hand outside the system with the references recorded per item.';

create index idx_fieldops_payout_batch_campaign
  on public.fieldops_payout_batch (campaign_id, status, created_at desc);

create trigger fieldops_payout_batch_touch before update on public.fieldops_payout_batch
  for each row execute function public.fieldops_touch_updated_at();

-- ---------------------------------------------------------------------
-- fieldops_payout_item: one member's share of one batch
-- ---------------------------------------------------------------------

create table public.fieldops_payout_item (
  id                    uuid        primary key default gen_random_uuid(),
  batch_id              uuid        not null references public.fieldops_payout_batch (id) on delete restrict,
  campaign_id           uuid        not null references public.fieldops_campaign (id) on delete restrict,
  member_id             uuid        not null references public.fieldops_team_member (id) on delete restrict,
  -- No FK: the payment record outlives a deleted account.
  member_user_id        uuid        not null,
  amount_minor          bigint      not null check (amount_minor > 0),
  currency              char(3)     not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  commission_count      integer     not null default 0 check (commission_count >= 0),
  -- Where the money was sent, as it stood when the batch was built. The
  -- number is stored MASKED: the full value lives on the team-member row
  -- and is only ever read by an admin with users.view_pii.
  destination_snapshot  jsonb       not null default '{}'::jsonb,
  status                text        not null default 'pending' check (status in (
                          'pending', 'paid', 'failed')),
  payment_reference     text        check (payment_reference is null or length(payment_reference) <= 200),
  -- Paystack Transfers, if the flag is ever turned on (§23.14b).
  transfer_code         text,
  failure_reason        text        check (failure_reason is null or length(failure_reason) <= 2000),
  paid_at               timestamptz,
  paid_by               uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint fieldops_payout_item_one_per_member unique (batch_id, member_id)
);

create index idx_fieldops_payout_item_batch on public.fieldops_payout_item (batch_id, status);
create index idx_fieldops_payout_item_member on public.fieldops_payout_item (member_id, status);
create index idx_fieldops_payout_item_member_user on public.fieldops_payout_item (member_user_id, status);
create index idx_fieldops_payout_item_campaign on public.fieldops_payout_item (campaign_id);
create unique index fieldops_payout_item_transfer_code
  on public.fieldops_payout_item (transfer_code) where transfer_code is not null;

create trigger fieldops_payout_item_touch before update on public.fieldops_payout_item
  for each row execute function public.fieldops_touch_updated_at();

-- Now the FK the commission table reserved a column for in Phase 3.
alter table public.fieldops_commission
  add constraint fieldops_commission_payout_item_fkey
  foreign key (payout_item_id) references public.fieldops_payout_item (id) on delete restrict;

-- ---------------------------------------------------------------------
-- Immutability: only the lifecycle columns move, and only forwards.
-- ---------------------------------------------------------------------

create function public.fieldops_payout_batch_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable text[] := array[
    'status', 'total_minor', 'item_count', 'approved_by', 'approved_at',
    'paid_by', 'paid_at', 'cancelled_at', 'cancel_reason', 'notes', 'updated_at'];
  v_allowed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'fieldops_payout_batch rows cannot be deleted; cancel them instead'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'A payout batch cannot be re-pointed at a different campaign or method'
      using errcode = 'insufficient_privilege';
  end if;
  -- Totals are only ever recomputed while the batch is still a draft.
  if old.status <> 'draft'
     and (new.total_minor is distinct from old.total_minor
          or new.item_count is distinct from old.item_count) then
    raise exception 'A batch that has left draft cannot change its total'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'draft'    then new.status in ('approved', 'cancelled')
      when 'approved' then new.status in ('paid', 'cancelled')
      else false
    end;
    if not v_allowed then
      raise exception 'A payout batch that is % cannot move to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_payout_batch_guard() from public, anon, authenticated;

create trigger fieldops_payout_batch_immutable
  before update or delete on public.fieldops_payout_batch
  for each row execute function public.fieldops_payout_batch_guard();

create function public.fieldops_payout_item_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable text[] := array[
    'status', 'payment_reference', 'transfer_code', 'failure_reason',
    'paid_at', 'paid_by', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    -- A draft batch is rebuilt by cancelling it, not by deleting rows.
    if exists (select 1 from public.fieldops_payout_batch b
               where b.id = old.batch_id and b.status = 'draft') then
      return old;
    end if;
    raise exception 'A payout item can only be removed while its batch is a draft'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'A payout item cannot change who or how much it pays'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'pending' and new.status in ('paid', 'failed'))
     and not (old.status = 'failed' and new.status = 'pending') then
    raise exception 'A payout item that is % cannot move to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_payout_item_guard() from public, anon, authenticated;

create trigger fieldops_payout_item_immutable
  before update or delete on public.fieldops_payout_item
  for each row execute function public.fieldops_payout_item_guard();

-- ---------------------------------------------------------------------
-- fieldops_build_payout_batch: gather every approved commission in a
-- campaign into one draft batch, grouped per member.
-- ---------------------------------------------------------------------

create function public.fieldops_build_payout_batch(
  p_campaign_id uuid,
  p_label text,
  p_admin uuid,
  p_method text default 'momo_manual'
)
returns public.fieldops_payout_batch
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.fieldops_program_setting;
  v_camp    public.fieldops_campaign;
  v_batch   public.fieldops_payout_batch;
  v_total   bigint := 0;
  v_count   integer := 0;
  r         record;
  v_item_id uuid;
begin
  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.program_enabled, false) then
    raise exception 'The programme is switched off' using errcode = 'check_violation';
  end if;
  if not coalesce(s.payouts_enabled, false) then
    raise exception 'Payouts are switched off' using errcode = 'check_violation';
  end if;

  select * into v_camp from public.fieldops_campaign where id = p_campaign_id;
  if v_camp.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  -- One open batch per campaign: finish or cancel the last one first, so
  -- two admins can never split the same commissions between two batches.
  if exists (
    select 1 from public.fieldops_payout_batch b
    where b.campaign_id = p_campaign_id and b.status in ('draft', 'approved')
  ) then
    raise exception 'This campaign already has a batch waiting to be approved or paid'
      using errcode = 'unique_violation';
  end if;

  insert into public.fieldops_payout_batch (
    campaign_id, label, currency, payment_method, created_by)
  values (p_campaign_id, p_label, v_camp.currency, p_method, p_admin)
  returning * into v_batch;

  -- Group the approved commissions per member. A member with no payout
  -- destination on file is skipped: the money stays `approved` and goes
  -- into the next batch once they have filled it in.
  for r in
    select c.member_id,
           c.member_user_id,
           sum(c.amount_minor) as amount_minor,
           count(*)            as commission_count
    from public.fieldops_commission c
    join public.fieldops_team_member m on m.id = c.member_id
    where c.campaign_id = p_campaign_id
      and c.status = 'approved'
      and c.amount_minor > 0
      and m.payout_momo_number is not null
    -- member_user_id is fixed per membership, so grouping by both is the
    -- same grouping; uuid has no min() aggregate to fall back on.
    group by c.member_id, c.member_user_id
    having sum(c.amount_minor) > 0
  loop
    insert into public.fieldops_payout_item (
      batch_id, campaign_id, member_id, member_user_id, amount_minor, currency,
      commission_count, destination_snapshot)
    select v_batch.id, p_campaign_id, r.member_id, r.member_user_id,
           r.amount_minor, v_camp.currency, r.commission_count,
           jsonb_build_object(
             'network', m.payout_momo_network,
             'holderName', m.payout_holder_name,
             -- Masked on purpose: the full number is read from the member
             -- row by an admin with users.view_pii, never copied here.
             'numberMasked', '****' || right(m.payout_momo_number, 4))
    from public.fieldops_team_member m
    where m.id = r.member_id
    returning id into v_item_id;

    update public.fieldops_commission
    set status = 'in_payout', payout_item_id = v_item_id
    where campaign_id = p_campaign_id
      and member_id = r.member_id
      and status = 'approved'
      and amount_minor > 0;

    insert into public.fieldops_commission_event (
      commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
    select c.id, 'approved', 'in_payout', p_admin, 'admin',
           'Added to payout batch ' || p_label
    from public.fieldops_commission c
    where c.payout_item_id = v_item_id;

    v_total := v_total + r.amount_minor;
    v_count := v_count + 1;
  end loop;

  update public.fieldops_payout_batch
  set total_minor = v_total, item_count = v_count
  where id = v_batch.id
  returning * into v_batch;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_approve_payout_batch: the second admin's signature.
-- ---------------------------------------------------------------------

create function public.fieldops_approve_payout_batch(
  p_batch_id uuid,
  p_admin uuid
)
returns public.fieldops_payout_batch
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.fieldops_payout_batch;
begin
  select * into v_batch from public.fieldops_payout_batch where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'Only a draft batch can be approved' using errcode = 'check_violation';
  end if;
  if v_batch.created_by = p_admin then
    raise exception 'The admin who built a batch cannot approve it'
      using errcode = 'check_violation';
  end if;
  if v_batch.item_count = 0 then
    raise exception 'There is nothing to pay in this batch' using errcode = 'check_violation';
  end if;

  update public.fieldops_payout_batch
  set status = 'approved', approved_by = p_admin, approved_at = now()
  where id = p_batch_id
  returning * into v_batch;
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_mark_payout_item: record one transfer's outcome.
-- ---------------------------------------------------------------------

create function public.fieldops_mark_payout_item(
  p_item_id uuid,
  p_admin uuid,
  p_status text,
  p_reference text default null,
  p_failure text default null
)
returns public.fieldops_payout_item
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  public.fieldops_payout_item;
  v_batch public.fieldops_payout_batch;
  v_open  integer;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'An item is marked paid or failed' using errcode = 'check_violation';
  end if;
  select * into v_item from public.fieldops_payout_item where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'Payout item not found' using errcode = 'P0002';
  end if;
  select * into v_batch from public.fieldops_payout_batch where id = v_item.batch_id for update;
  if v_batch.status <> 'approved' then
    raise exception 'The batch has not been approved yet' using errcode = 'check_violation';
  end if;
  if v_item.status = 'paid' then
    raise exception 'This item is already paid' using errcode = 'check_violation';
  end if;
  if p_status = 'paid' and coalesce(length(trim(p_reference)), 0) < 3 then
    raise exception 'Record the transfer reference' using errcode = 'check_violation';
  end if;
  if p_status = 'failed' and coalesce(length(trim(p_failure)), 0) < 3 then
    raise exception 'Say why the transfer failed' using errcode = 'check_violation';
  end if;

  if p_status = 'paid' then
    update public.fieldops_payout_item
    set status = 'paid', payment_reference = p_reference, failure_reason = null,
        paid_at = now(), paid_by = p_admin
    where id = p_item_id
    returning * into v_item;

    update public.fieldops_commission
    set status = 'paid', paid_at = now()
    where payout_item_id = p_item_id and status = 'in_payout';

    insert into public.fieldops_commission_event (
      commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
    select c.id, 'in_payout', 'paid', p_admin, 'admin', 'Reference ' || p_reference
    from public.fieldops_commission c
    where c.payout_item_id = p_item_id and c.status = 'paid';

    perform public._fieldops_notify(v_item.member_user_id, 'fieldops_commission_paid',
      'You have been paid',
      'Your Field Ops earnings have been sent to your mobile money number.',
      '/field/earnings');
  else
    -- A failed transfer returns the money to the pool so the next batch
    -- picks it up; nothing is stranded in `in_payout`. The trail is
    -- written first, while the rows can still be found by their item.
    insert into public.fieldops_commission_event (
      commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
    select c.id, 'in_payout', 'approved', p_admin, 'admin',
           'Transfer failed: ' || p_failure
    from public.fieldops_commission c
    where c.payout_item_id = p_item_id and c.status = 'in_payout';

    update public.fieldops_commission
    set status = 'approved', payout_item_id = null
    where payout_item_id = p_item_id and status = 'in_payout';

    update public.fieldops_payout_item
    set status = 'failed', failure_reason = p_failure, payment_reference = null
    where id = p_item_id
    returning * into v_item;
  end if;

  -- The batch closes once nothing is still pending.
  select count(*) into v_open
  from public.fieldops_payout_item i
  where i.batch_id = v_item.batch_id and i.status = 'pending';
  if v_open = 0 then
    update public.fieldops_payout_batch
    set status = 'paid', paid_by = p_admin, paid_at = now()
    where id = v_item.batch_id;
  end if;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_cancel_payout_batch: unwind a batch, returning its money.
-- ---------------------------------------------------------------------

create function public.fieldops_cancel_payout_batch(
  p_batch_id uuid,
  p_admin uuid,
  p_reason text
)
returns public.fieldops_payout_batch
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.fieldops_payout_batch;
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'A cancellation needs a reason' using errcode = 'check_violation';
  end if;
  select * into v_batch from public.fieldops_payout_batch where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('draft', 'approved') then
    raise exception 'A batch that is % cannot be cancelled', v_batch.status
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.fieldops_payout_item i
             where i.batch_id = p_batch_id and i.status = 'paid') then
    raise exception 'Some of this batch has already been paid; mark the rest failed instead'
      using errcode = 'check_violation';
  end if;

  -- Every commission goes back to `approved` and waits for the next batch.
  insert into public.fieldops_commission_event (
    commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
  select c.id, 'in_payout', 'approved', p_admin, 'admin', 'Batch cancelled: ' || p_reason
  from public.fieldops_commission c
  join public.fieldops_payout_item i on i.id = c.payout_item_id
  where i.batch_id = p_batch_id and c.status = 'in_payout';

  update public.fieldops_commission c
  set status = 'approved', payout_item_id = null
  from public.fieldops_payout_item i
  where i.id = c.payout_item_id and i.batch_id = p_batch_id and c.status = 'in_payout';

  update public.fieldops_payout_item
  set status = 'failed', failure_reason = 'Batch cancelled: ' || p_reason
  where batch_id = p_batch_id and status = 'pending';

  update public.fieldops_payout_batch
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  where id = p_batch_id
  returning * into v_batch;
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------
-- Reconciliation: paid commissions must equal paid payout items. The
-- negative reversal offsets are excluded from both sides -- they record
-- money that left and was later clawed back, and have no payout item.
-- ---------------------------------------------------------------------

create or replace function public.fieldops_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select s.program_enabled from public.fieldops_program_setting s where s.id = 1), false),
    'sweep_lag_seconds', coalesce((
      select extract(epoch from now() - max(j.finished_at))::integer
      from public.fieldops_job_run j where j.job = 'eligibility_sweep' and j.finished_at is not null), 0),
    'sweep_failures', coalesce((
      select j.failed from public.fieldops_job_run j
      where j.job = 'eligibility_sweep' and j.finished_at is not null
      order by j.started_at desc limit 1), 0),
    'due_not_swept', (
      select count(*) from public.fieldops_onboarding ob
      join public.fieldops_campaign c on c.id = ob.campaign_id
      where ob.status = 'verified' and ob.holding_until < now() - interval '1 hour'
        and c.status in ('active', 'winding_down', 'completed')
        and not (ob.flags && array['awaiting_release_policy', 'budget_exhausted'])),
    'stuck_reviews', (
      select count(*) from public.fieldops_onboarding
      where status = 'submitted' and submitted_at < now() - interval '3 days'),
    'stale_flags', (
      select count(*) from public.fieldops_onboarding
      where status = 'flagged' and updated_at < now() - interval '7 days'),
    'succeeded_without_commission', (
      select count(*) from public.fieldops_onboarding ob
      where ob.status = 'succeeded'
        and not exists (select 1 from public.fieldops_commission c
                        where c.onboarding_id = ob.id and c.reverses_commission_id is null)),
    'approved_without_rule', (
      select count(*) from public.fieldops_commission
      where status in ('approved', 'in_payout', 'paid')
        and reverses_commission_id is null and rule_id is null),
    'pending_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'pending'), 0),
    'approved_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'approved'), 0),
    -- Phase 4: what has been disbursed, and whether the two sides agree.
    -- "Disbursed" is read from the payout item, not the commission status,
    -- so a commission reversed AFTER it was paid still counts as money that
    -- left -- which is exactly what its negative offset row records.
    'paid_minor', coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'payout_drift_minor', coalesce((
      select sum(c.amount_minor)
      from public.fieldops_commission c
      join public.fieldops_payout_item i on i.id = c.payout_item_id
      where i.status = 'paid' and c.reverses_commission_id is null), 0)
      - coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'stuck_in_payout', (
      select count(*) from public.fieldops_commission c
      where c.status = 'in_payout'
        and (c.payout_item_id is null
             or not exists (select 1 from public.fieldops_payout_batch b
                            join public.fieldops_payout_item i on i.batch_id = b.id
                            where i.id = c.payout_item_id and b.status in ('draft', 'approved'))))
  );
$$;

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------

alter table public.fieldops_payout_batch enable row level security;
alter table public.fieldops_payout_item enable row level security;

revoke all on table public.fieldops_payout_batch, public.fieldops_payout_item
  from anon, authenticated;
-- No DELETE: cancel a batch, never erase it.
grant select, insert, update on table public.fieldops_payout_batch to service_role;
grant select, insert, update, delete on table public.fieldops_payout_item to service_role;

-- Batches are an office matter; a member only ever sees their own line,
-- and never the destination snapshot or anyone else's amount.
create policy service_role_only on public.fieldops_payout_batch
  for all to service_role using (true) with check (true);

grant select (id, batch_id, campaign_id, member_id, member_user_id, amount_minor,
              currency, commission_count, status, payment_reference, paid_at, created_at)
  on public.fieldops_payout_item to authenticated;

create policy fieldops_payout_item_self_select on public.fieldops_payout_item
  for select to authenticated
  using (member_user_id = (select auth.uid()));

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fieldops_build_payout_batch(uuid, text, uuid, text)',
    'public.fieldops_approve_payout_batch(uuid, uuid)',
    'public.fieldops_mark_payout_item(uuid, uuid, text, text, text)',
    'public.fieldops_cancel_payout_batch(uuid, uuid, text)',
    'public.fieldops_health()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- One more reconciliation invariant: what the ledger says was paid must
-- equal what the payout items say was sent.
-- ---------------------------------------------------------------------

create function public.fieldops_payout_reconciliation()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'fieldops_payout_drift_minor',
      coalesce((
        select sum(c.amount_minor)
        from public.fieldops_commission c
        join public.fieldops_payout_item i on i.id = c.payout_item_id
        where i.status = 'paid' and c.reverses_commission_id is null), 0)
      - coalesce((
        select sum(amount_minor) from public.fieldops_payout_item
        where status = 'paid'), 0),
    'fieldops_stranded_in_payout', (
      select count(*) from public.fieldops_commission c
      where c.status = 'in_payout'
        and (c.payout_item_id is null
             or not exists (
               select 1 from public.fieldops_payout_item i
               join public.fieldops_payout_batch b on b.id = i.batch_id
               where i.id = c.payout_item_id and b.status in ('draft', 'approved')))),
    'fieldops_paid_without_reference', (
      select count(*) from public.fieldops_payout_item
      where status = 'paid' and coalesce(payment_reference, '') = '')
  );
$$;

revoke all on function public.fieldops_payout_reconciliation() from public, anon, authenticated;
grant execute on function public.fieldops_payout_reconciliation() to service_role;

-- Rollback: drop the two tables, the five functions and the commission FK,
-- and restore fieldops_health() to its 20260911223818 definition.

-- ---------------------------------------------------------------------
-- Correction to the Phase 3 reversal, now that payouts exist to check it
-- against. Reversing a commission that was already PAID was doing two
-- things at once: moving the original to `reversed` AND adding a negative
-- offset, which took the money off the member's balance twice. A payment
-- that really happened stays `paid` -- that is what the payout item says --
-- and the offset alone records the claw-back. Only money that had not left
-- yet (approved / in_payout) simply becomes `reversed`.
-- ---------------------------------------------------------------------

create or replace function public.fieldops_reverse_commission(
  p_commission_id uuid,
  p_admin uuid,
  p_reason text
)
returns public.fieldops_commission
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.fieldops_commission;
  v_was   text;
  v_off   public.fieldops_commission;
begin
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'A reversal needs a reason' using errcode = 'check_violation';
  end if;
  select * into c from public.fieldops_commission where id = p_commission_id for update;
  if c.id is null then
    raise exception 'Commission not found' using errcode = 'P0002';
  end if;
  if c.reverses_commission_id is not null then
    raise exception 'A reversal offset cannot itself be reversed' using errcode = 'check_violation';
  end if;
  if c.reversed_at is not null
     or exists (select 1 from public.fieldops_commission o
                where o.reverses_commission_id = c.id) then
    raise exception 'This commission has already been reversed' using errcode = 'check_violation';
  end if;
  if c.status not in ('approved', 'in_payout', 'paid') then
    raise exception 'A commission that is % cannot be reversed', c.status
      using errcode = 'check_violation';
  end if;
  v_was := c.status;

  if v_was = 'paid' then
    -- The money left. The row stays `paid` so it still matches its payout
    -- item, and a negative offset beside it records the claw-back.
    insert into public.fieldops_commission (
      campaign_id, team_id, member_id, member_user_id, activity_key, rule_id, rule_version,
      amount_minor, currency, status, idempotency_key, reverses_commission_id,
      earned_at, paid_at, reversed_by, reversal_reason)
    values (
      c.campaign_id, c.team_id, c.member_id, c.member_user_id, c.activity_key,
      c.rule_id, c.rule_version, -c.amount_minor, c.currency, 'paid',
      'reverse:' || c.id::text, c.id, now(), now(), p_admin, p_reason)
    returning * into v_off;

    update public.fieldops_commission
    set reversed_at = now(), reversed_by = p_admin, reversal_reason = p_reason
    where id = c.id
    returning * into c;
  else
    -- Nothing had been sent yet, so there is no payment to offset.
    update public.fieldops_commission
    set status = 'reversed', reversed_at = now(), reversed_by = p_admin,
        reversal_reason = p_reason
    where id = c.id
    returning * into c;
  end if;

  insert into public.fieldops_commission_event (
    commission_id, from_status, to_status, actor_user_id, actor_kind, reason, details)
  values (c.id, v_was, case when v_was = 'paid' then 'paid' else 'reversed' end,
          p_admin, 'admin', p_reason,
          jsonb_build_object('reversed', true, 'offset_commission_id', v_off.id));

  if c.onboarding_id is not null then
    update public.fieldops_onboarding
    set flags = array(select distinct unnest(array_append(flags, 'reversed')))
    where id = c.onboarding_id;
  end if;

  return c;
end;
$$;

revoke all on function public.fieldops_reverse_commission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fieldops_reverse_commission(uuid, uuid, text) to service_role;
