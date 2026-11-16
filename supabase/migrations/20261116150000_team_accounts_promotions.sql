-- Team accounts, stage 4b: featuring a team's events and places, and the
-- team's credit (Tickets, entry and teams plan, Part 2;
-- docs/architecture/team-accounts.md §4d).
--
-- Owners and Finance feature the team's events and places. The member pays
-- the cash part with their own card or wallet, as before; the credit part
-- comes from the TEAM's credit (organizer and venue rebates and place-visit
-- credit already go to the account that runs the event or place, which for
-- a team is the team). A promotion checkout keeps who pays (owner_id, the
-- member) and, new here, which account it was bought for (account_id, the
-- team; null when someone features their own listing). Checkouts stay
-- server-write-only, so nobody can name an account they do not act for:
-- the service checks the member's role before it writes one, and again
-- before it spends the team's credit.
--
-- Nothing here is reachable until a team exists, and teams ship switched
-- off (team_program_setting).

-- ---------------------------------------------------------------------------
-- 1. Finance features listings (Owners can do everything)
-- ---------------------------------------------------------------------------

create or replace function public.team_role_can(p_role text, p_capability text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then true
    when 'finance' then p_capability in (
      'money.view', 'refunds.issue', 'payout.view', 'payout.request',
      'promotions.buy'
    )
    when 'manager' then p_capability in (
      'events.manage', 'places.manage', 'promo.manage', 'bookings.manage',
      'attendees.view', 'checkin.scan'
    )
    when 'content' then p_capability in ('messages.reply', 'content.post', 'reviews.reply')
    when 'door' then p_capability in ('checkin.scan')
    when 'front_desk' then p_capability in ('bookings.manage', 'visit.show')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The account a promotion was bought for
-- ---------------------------------------------------------------------------

alter table public.event_promotion_checkout
  add column if not exists account_id uuid
    references public.user_info (id) on delete set null;
alter table public.place_promotion_checkout
  add column if not exists account_id uuid
    references public.user_info (id) on delete set null;

create index if not exists event_promotion_checkout_account_id_idx
  on public.event_promotion_checkout (account_id) where account_id is not null;
create index if not exists place_promotion_checkout_account_id_idx
  on public.place_promotion_checkout (account_id) where account_id is not null;

comment on column public.event_promotion_checkout.account_id is
  'The team this promotion was bought for, by owner_id acting for it (its credit pays the credit part); null = the payer''s own event. Written by the server only.';
comment on column public.place_promotion_checkout.account_id is
  'The team this promotion was bought for, by owner_id acting for it (its credit pays the credit part); null = the payer''s own place. Written by the server only.';

-- ---------------------------------------------------------------------------
-- 3. "Your event is now featured" reaches the members who buy features
-- ---------------------------------------------------------------------------

create or replace function public.team_notice_capability(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'place_booking_%' then 'bookings.manage'
    when p_type in ('review_received', 'review_reply') then 'reviews.reply'
    when p_type = 'message' then 'messages.reply'
    when p_type like 'content_%' then 'content.post'
    when p_type like 'refund_%' then 'refunds.issue'
    when p_type like 'payout_%' then 'payout.view'
    when p_type like 'ticket_plan_%' then 'money.view'
    when p_type = 'promotion_started' then 'promotions.buy'
    when p_type in (
      'promotion_credit_earned', 'milestone_reached', 'loyalty_reward',
      'reward_available', 'reward_pending', 'reward_reversed',
      'commission_pending', 'welcome_credit'
    ) then 'money.view'
    else 'team.profile'
  end;
$$;

-- A notice about the team's credit (a rebate, visit credit) links to
-- /rewards, the reader's OWN credit page; the members' copies open the
-- team's Finances instead, where the team's promotion credit is shown.
create or replace function public.notification_fan_out_to_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap text;
  v_name text;
  v_username text;
begin
  if not exists (
    select 1 from public.team t
    where t.account_id = new.user_id and t.status = 'active'
  ) then
    return null;
  end if;

  v_cap := public.team_notice_capability(new.type);
  select full_name, username into v_name, v_username
  from public.user_info where id = new.user_id;

  with copies as (
    insert into public.notification
      (user_id, type, title, body, link, data, image_public_id, image_version)
    select m.user_id, new.type, new.title, new.body,
           case when new.link = '/rewards' then '/finances' else new.link end,
           new.data || jsonb_build_object(
             'team_id', new.user_id,
             'team_name', coalesce(v_name, v_username),
             'source_notification_id', new.id
           ),
           new.image_public_id, new.image_version
    from public.team_member m
    where m.team_id = new.user_id
      and m.status = 'active'
      and public.team_role_can(m.role, v_cap)
    returning id, user_id, type
  )
  insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
  select c.id, c.user_id, 'push', 'app', c.type = 'event_cancelled'
  from copies c
  on conflict (notification_id, channel) do nothing;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A team is in the Rewards audience when one of its Owners is
-- ---------------------------------------------------------------------------
-- The audience lists people (staff, beta testers). A team cannot be either,
-- so while Rewards is open to staff or beta only, a team's credit would be
-- out of reach of the very people testing it. A team counts as in the
-- audience when an active Owner of the active team is; at 'all' nothing
-- changes.

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
        or exists (
          select 1
          from public.team t
          join public.team_member m
            on m.team_id = t.account_id and m.role = 'owner' and m.status = 'active'
          where t.account_id = p_user_id
            and t.status = 'active'
            and (
              exists (select 1 from public.admin_user au
                      where au.user_id = m.user_id and au.status = 'active')
              or (s.audience = 'beta' and m.user_id = any (s.beta_user_ids))
            )
        )
      )
    from public.reward_program_setting s
    where s.id = 1
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 5. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if not public.team_role_can('finance', 'promotions.buy')
     or not public.team_role_can('owner', 'promotions.buy')
     or public.team_role_can('manager', 'promotions.buy')
     or public.team_role_can('content', 'promotions.buy')
     or not public.team_role_can('finance', 'payout.request')
     or public.team_role_can('finance', 'payout.manage') then
    raise exception 'migration check: team_role_can does not match the role table';
  end if;
  if public.team_notice_capability('promotion_started') <> 'promotions.buy'
     or public.team_notice_capability('place_booking_requested') <> 'bookings.manage'
     or public.team_notice_capability('promotion_credit_earned') <> 'money.view' then
    raise exception 'migration check: team_notice_capability is wrong';
  end if;
  if has_column_privilege('authenticated', 'public.event_promotion_checkout', 'account_id', 'insert')
     or has_column_privilege('authenticated', 'public.event_promotion_checkout', 'account_id', 'update')
     or has_column_privilege('authenticated', 'public.place_promotion_checkout', 'account_id', 'insert')
     or has_column_privilege('authenticated', 'public.place_promotion_checkout', 'account_id', 'update') then
    raise exception 'migration check: clients must not write promotion checkouts';
  end if;
end;
$$;
