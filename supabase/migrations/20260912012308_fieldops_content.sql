-- Field Ops Phase 6: the content creator.
--
-- One member of each team makes the posts, reels and photos that carry the
-- campaign. Two records: a BRIEF (what the campaign wants made) and a
-- SUBMISSION (what was made, and where it was posted). A submission is
-- reviewed by a human exactly as an onboarding is, and the money then waits
-- out a short holding period before the sweep confirms it -- the same
-- shape, so there is still only one thing in the system that turns work
-- into payable money.
--
-- Engagement numbers are whatever the platform showed the creator. They are
-- stored as SELF-REPORTED and labelled that way in every UI; nothing is
-- paid on them, because nothing about them can be verified from here.

create table public.fieldops_content_brief (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.fieldops_campaign (id) on delete restrict,
  title               text        not null check (length(title) between 3 and 150),
  description         text        check (description is null or length(description) <= 4000),
  platforms           text[]      not null default '{}',
  assigned_member_id  uuid        references public.fieldops_team_member (id) on delete set null,
  due_on              date,
  status              text        not null default 'open' check (status in ('open', 'closed')),
  created_by          uuid        references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.fieldops_content_brief is
  'Field Ops: a piece of content the campaign wants made. Written by the team lead or an admin; the content creator works from it.';

create index idx_fieldops_content_brief_campaign
  on public.fieldops_content_brief (campaign_id, status, due_on);
create index idx_fieldops_content_brief_member
  on public.fieldops_content_brief (assigned_member_id);

create trigger fieldops_content_brief_touch before update on public.fieldops_content_brief
  for each row execute function public.fieldops_touch_updated_at();

create table public.fieldops_content_submission (
  id                     uuid        primary key default gen_random_uuid(),
  campaign_id            uuid        not null references public.fieldops_campaign (id) on delete restrict,
  team_id                uuid        not null references public.fieldops_team (id) on delete restrict,
  brief_id               uuid        references public.fieldops_content_brief (id) on delete set null,
  member_id              uuid        not null references public.fieldops_team_member (id) on delete restrict,
  -- No FK: the record outlives a deleted account, like the ledger.
  member_user_id         uuid        not null,
  platform               text        not null check (platform in (
                           'tiktok', 'instagram', 'facebook', 'x', 'youtube', 'whatsapp', 'other')),
  -- Postgres caps a bounded regex repetition at 255, so the length lives
  -- in its own check rather than inside the pattern.
  url                    text        not null check (
                           url ~ '^https?://' and length(url) between 12 and 500),
  caption                text        check (caption is null or length(caption) <= 2000),
  posted_at              timestamptz,
  -- Whatever the platform showed the creator. Never paid on.
  self_reported_metrics  jsonb       not null default '{}'::jsonb,
  status                 text        not null default 'submitted' check (status in (
                           'submitted', 'approved', 'rejected')),
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  review_note            text        check (review_note is null or length(review_note) <= 2000),
  rule_id                uuid        references public.fieldops_commission_rule (id) on delete restrict,
  holding_until          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A creator cannot approve their own work.
  constraint fieldops_content_reviewer_not_member
    check (reviewed_by is null or reviewed_by <> member_user_id)
);

comment on table public.fieldops_content_submission is
  'Field Ops: one posted piece of content. Reviewed by a lead or admin; the commission is confirmed by the sweep after a short holding period, like an onboarding.';

-- The same post cannot be claimed twice, by anyone.
create unique index fieldops_content_submission_url_once
  on public.fieldops_content_submission (lower(url))
  where status <> 'rejected';

create index idx_fieldops_content_submission_campaign
  on public.fieldops_content_submission (campaign_id, status, created_at desc);
create index idx_fieldops_content_submission_member
  on public.fieldops_content_submission (member_id, status);
create index idx_fieldops_content_submission_member_user
  on public.fieldops_content_submission (member_user_id, status);
create index idx_fieldops_content_submission_team
  on public.fieldops_content_submission (team_id, status);
create index idx_fieldops_content_submission_brief
  on public.fieldops_content_submission (brief_id);
create index idx_fieldops_content_submission_holding
  on public.fieldops_content_submission (holding_until) where status = 'approved';
create index idx_fieldops_content_submission_rule
  on public.fieldops_content_submission (rule_id);

create trigger fieldops_content_submission_touch before update on public.fieldops_content_submission
  for each row execute function public.fieldops_touch_updated_at();

-- Only the content creator submits, and only into their own team.
create function public.fieldops_content_submission_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member public.fieldops_team_member;
begin
  select * into v_member from public.fieldops_team_member m where m.id = new.member_id;
  if v_member.id is null then
    raise exception 'Member not found' using errcode = 'foreign_key_violation';
  end if;
  if v_member.team_id <> new.team_id or v_member.campaign_id <> new.campaign_id then
    raise exception 'Member % is not on team % of campaign %', new.member_id, new.team_id, new.campaign_id
      using errcode = 'check_violation';
  end if;
  if v_member.user_id is null or v_member.user_id <> new.member_user_id then
    raise exception 'member_user_id does not match the membership' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if v_member.status <> 'active' then
      raise exception 'Only an active member can submit content' using errcode = 'check_violation';
    end if;
    if v_member.role <> 'content_creator' then
      raise exception 'Only the content creator submits content' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_content_submission_check() from public, anon, authenticated;

create trigger fieldops_content_submission_integrity
  before insert or update of member_id, member_user_id, team_id, campaign_id
  on public.fieldops_content_submission
  for each row execute function public.fieldops_content_submission_check();

-- Phase 3 reserved this column for exactly this.
alter table public.fieldops_commission
  add constraint fieldops_commission_content_submission_fkey
  foreign key (content_submission_id)
  references public.fieldops_content_submission (id) on delete restrict;

create unique index fieldops_commission_one_per_content
  on public.fieldops_commission (content_submission_id)
  where content_submission_id is not null and reverses_commission_id is null;

-- ---------------------------------------------------------------------
-- Reviewing a deliverable. Approval snapshots the live rule and starts the
-- holding period; the sweep still decides whether it is payable.
-- ---------------------------------------------------------------------

create function public.fieldops_review_content(
  p_submission_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_note text default null
)
returns public.fieldops_content_submission
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub    public.fieldops_content_submission;
  v_rule   public.fieldops_commission_rule;
  s        public.fieldops_program_setting;
  v_days   integer;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'A deliverable is approved or rejected' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.fieldops_content_submission
  where id = p_submission_id for update;
  if v_sub.id is null then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if v_sub.status <> 'submitted' then
    raise exception 'This deliverable has already been decided' using errcode = 'check_violation';
  end if;
  if p_reviewer = v_sub.member_user_id then
    raise exception 'You cannot review your own content' using errcode = 'check_violation';
  end if;
  if p_decision = 'rejected' and coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'Say what was wrong with it' using errcode = 'check_violation';
  end if;

  if p_decision = 'approved' then
    select * into s from public.fieldops_program_setting where id = 1;
    -- The campaign's own version wins over the programme default.
    select * into v_rule from public.fieldops_commission_rule r
    where r.activity_key = 'content_deliverable'
      and r.is_active
      and r.campaign_id is not distinct from v_sub.campaign_id;
    if v_rule.id is null then
      select * into v_rule from public.fieldops_commission_rule r
      where r.activity_key = 'content_deliverable'
        and r.is_active and r.campaign_id is null;
    end if;
    v_days := coalesce((v_rule.eligibility ->> 'holding_days')::integer,
                       s.default_holding_days, 7);
  end if;

  update public.fieldops_content_submission
  set status = p_decision,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = p_note,
      rule_id = case when p_decision = 'approved' then v_rule.id else null end,
      holding_until = case when p_decision = 'approved'
                           then now() + make_interval(days => v_days) else null end
  where id = p_submission_id
  returning * into v_sub;

  if p_decision = 'approved' and v_rule.id is not null then
    -- Pending, exactly like a verified onboarding.
    insert into public.fieldops_commission (
      campaign_id, team_id, member_id, member_user_id, content_submission_id,
      activity_key, rule_id, rule_version, amount_minor, currency, status,
      idempotency_key, earned_at)
    values (
      v_sub.campaign_id, v_sub.team_id, v_sub.member_id, v_sub.member_user_id,
      v_sub.id, 'content_deliverable', v_rule.id, v_rule.version,
      v_rule.amount_minor, v_rule.currency, 'pending',
      'content:' || v_sub.id::text, now())
    on conflict (idempotency_key) do nothing;

    insert into public.fieldops_commission_event (
      commission_id, from_status, to_status, actor_user_id, actor_kind, reason, details)
    select c.id, null, 'pending', p_reviewer, 'lead', 'Deliverable approved',
           jsonb_build_object('rule_id', v_rule.id, 'holding_until', v_sub.holding_until)
    from public.fieldops_commission c
    where c.idempotency_key = 'content:' || v_sub.id::text;
  end if;

  perform public._fieldops_notify(v_sub.member_user_id,
    'fieldops_content_reviewed',
    case when p_decision = 'approved' then 'Content approved' else 'Content not accepted' end,
    case when p_decision = 'approved'
         then 'Your post was approved. The commission is confirmed after the holding period.'
         else p_note end,
    '/field/content');

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------
-- The sweep also confirms content. Nothing about a post on someone else's
-- platform can be checked from here, so what the holding period buys is
-- the chance for a human to retract the approval before the money is real.
-- ---------------------------------------------------------------------

create function public.fieldops_sweep_content(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s           public.fieldops_program_setting;
  r           record;
  v_comm      public.fieldops_commission;
  v_processed integer := 0;
  v_approved  integer := 0;
  v_rejected  integer := 0;
begin
  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.program_enabled, false)
     or not coalesce(s.commission_generation_enabled, false) then
    return jsonb_build_object('skipped', true);
  end if;

  for r in
    select sub.id, sub.member_id, sub.member_user_id, sub.campaign_id
    from public.fieldops_content_submission sub
    join public.fieldops_campaign c on c.id = sub.campaign_id
    join public.fieldops_team_member m on m.id = sub.member_id
    where sub.status = 'approved'
      and sub.holding_until is not null
      and sub.holding_until <= now()
      and c.status in ('active', 'winding_down', 'completed')
      and exists (
        select 1 from public.fieldops_commission cc
        where cc.content_submission_id = sub.id and cc.status = 'pending')
    order by sub.holding_until
    limit greatest(1, least(p_limit, 2000))
    for update of sub skip locked
  loop
    v_processed := v_processed + 1;
    select * into v_comm from public.fieldops_commission
    where content_submission_id = r.id and reverses_commission_id is null;

    -- The only thing left to check is that the creator is still on the
    -- team; a member who left mid-holding is decided by an admin instead.
    if exists (select 1 from public.fieldops_team_member m
               where m.id = r.member_id and m.status in ('active', 'suspended')) then
      update public.fieldops_commission
      set status = 'approved', approved_at = now(), approved_by = null
      where id = v_comm.id and status = 'pending';
      insert into public.fieldops_commission_event (
        commission_id, from_status, to_status, actor_kind, reason)
      values (v_comm.id, 'pending', 'approved', 'system', 'Content holding period elapsed');
      v_approved := v_approved + 1;
      perform public._fieldops_notify(r.member_user_id, 'fieldops_commission_approved',
        'Content commission confirmed',
        'Your approved post is confirmed and waiting for the next payout.',
        '/field/earnings');
    else
      update public.fieldops_commission
      set status = 'rejected', rejected_at = now(),
          rejection_reason = 'The creator left the team before the holding period ended'
      where id = v_comm.id and status = 'pending';
      insert into public.fieldops_commission_event (
        commission_id, from_status, to_status, actor_kind, reason)
      values (v_comm.id, 'pending', 'rejected', 'system', 'Creator left the team');
      v_rejected := v_rejected + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed', v_processed, 'approved', v_approved, 'rejected', v_rejected);
end;
$$;

-- ---------------------------------------------------------------------
-- Monthly stipends. A stipend is not earned per item -- it is a payroll
-- line for being on the team that month -- so an admin authorises the run
-- and it is approved on the spot, with the admin recorded. Idempotent per
-- member per month, so running it twice pays nobody twice.
-- ---------------------------------------------------------------------

create function public.fieldops_run_monthly_stipends(
  p_campaign_id uuid,
  p_period_start date,
  p_admin uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.fieldops_program_setting;
  v_camp     public.fieldops_campaign;
  r          record;
  v_rule     public.fieldops_commission_rule;
  v_created  integer := 0;
  v_total    bigint := 0;
  v_period   date := date_trunc('month', p_period_start)::date;
begin
  select * into s from public.fieldops_program_setting where id = 1;
  if not coalesce(s.program_enabled, false)
     or not coalesce(s.commission_generation_enabled, false) then
    raise exception 'The programme is switched off' using errcode = 'check_violation';
  end if;
  if v_period > date_trunc('month', now())::date then
    raise exception 'That month has not started yet' using errcode = 'check_violation';
  end if;
  select * into v_camp from public.fieldops_campaign where id = p_campaign_id;
  if v_camp.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  for r in
    select m.id as member_id, m.user_id, m.role
    from public.fieldops_team_member m
    where m.campaign_id = p_campaign_id
      and m.status = 'active'
      and m.user_id is not null
      and m.role in ('content_creator', 'team_lead')
      -- On the team before the month ended.
      and (m.joined_at is null or m.joined_at < (v_period + interval '1 month'))
  loop
    select * into v_rule from public.fieldops_commission_rule cr
    where cr.activity_key = case r.role
                              when 'content_creator' then 'content_monthly_stipend'
                              else 'team_lead_monthly_stipend' end
      and cr.is_active
      and cr.campaign_id is not distinct from p_campaign_id;
    if v_rule.id is null then
      select * into v_rule from public.fieldops_commission_rule cr
      where cr.activity_key = case r.role
                                when 'content_creator' then 'content_monthly_stipend'
                                else 'team_lead_monthly_stipend' end
        and cr.is_active and cr.campaign_id is null;
    end if;
    if v_rule.id is null or v_rule.amount_minor = 0 then
      continue;
    end if;

    insert into public.fieldops_commission (
      campaign_id, team_id, member_id, member_user_id, period_start,
      activity_key, rule_id, rule_version, amount_minor, currency, status,
      idempotency_key, earned_at, approved_at, approved_by)
    select p_campaign_id, m.team_id, r.member_id, r.user_id, v_period,
           v_rule.activity_key, v_rule.id, v_rule.version, v_rule.amount_minor,
           v_rule.currency, 'approved',
           'stipend:' || r.member_id::text || ':' || to_char(v_period, 'YYYY-MM'),
           now(), now(), p_admin
    from public.fieldops_team_member m where m.id = r.member_id
    on conflict (idempotency_key) do nothing;

    if found then
      insert into public.fieldops_commission_event (
        commission_id, from_status, to_status, actor_user_id, actor_kind, reason)
      select c.id, null, 'approved', p_admin, 'admin',
             'Monthly stipend for ' || to_char(v_period, 'FMMonth YYYY')
      from public.fieldops_commission c
      where c.idempotency_key =
            'stipend:' || r.member_id::text || ':' || to_char(v_period, 'YYYY-MM');
      v_created := v_created + 1;
      v_total := v_total + v_rule.amount_minor;
      perform public._fieldops_notify(r.user_id, 'fieldops_commission_approved',
        'Monthly stipend added',
        'Your stipend for ' || to_char(v_period, 'FMMonth YYYY')
          || ' is ready for the next payout.',
        '/field/earnings');
    end if;
  end loop;

  return jsonb_build_object(
    'period', to_char(v_period, 'YYYY-MM'),
    'created', v_created,
    'total_minor', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------

alter table public.fieldops_content_brief enable row level security;
alter table public.fieldops_content_submission enable row level security;

revoke all on table
  public.fieldops_content_brief, public.fieldops_content_submission
  from anon, authenticated;
grant all on table
  public.fieldops_content_brief, public.fieldops_content_submission
  to service_role;

-- Everyone on the campaign can read the briefs: they are the campaign's
-- ask, not anyone's private work.
grant select on table public.fieldops_content_brief to authenticated;

create policy fieldops_content_brief_select on public.fieldops_content_brief
  for select to authenticated
  using (public.fieldops_is_member(campaign_id));

-- A creator reads their own submissions; the lead reads the team's.
grant select (id, campaign_id, team_id, brief_id, member_id, member_user_id,
              platform, url, caption, posted_at, self_reported_metrics, status,
              reviewed_at, review_note, holding_until, created_at, updated_at)
  on public.fieldops_content_submission to authenticated;

create policy fieldops_content_submission_self_or_lead_select
  on public.fieldops_content_submission
  for select to authenticated
  using (member_user_id = (select auth.uid())
         or public.fieldops_is_lead_of_team(team_id));

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fieldops_review_content(uuid, uuid, text, text)',
    'public.fieldops_sweep_content(integer)',
    'public.fieldops_run_monthly_stipends(uuid, date, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- The content holding periods run on the same 15-minute cadence as the
-- onboarding sweep, in the same job.
select cron.unschedule('fieldops-eligibility-sweep')
where exists (select 1 from cron.job where jobname = 'fieldops-eligibility-sweep');

select cron.schedule('fieldops-eligibility-sweep', '*/15 * * * *',
  $cron$select public.fieldops_run_eligibility_sweep(200), public.fieldops_sweep_content(200);$cron$);

-- Rollback: unschedule/restore the sweep job, drop the two tables, the
-- three functions, the commission FK and its unique index.
