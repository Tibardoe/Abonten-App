-- Team accounts: staff tools for paused teams and disputes (Tickets, entry
-- and teams plan, Part 2, stage 5; docs/admin/teams.md).
--
-- A team pauses itself when its last Owner's account closes or is banned
-- (team_forget_member), and until now nothing could bring it back. Staff
-- (Admin › Teams, permission teams.manage, fresh sign-in, a reason, audited)
-- can now:
--   * pause a team during a dispute, or for a staff reason, so nobody acts
--     for it while it is sorted out (admin_team_set_status → frozen);
--   * resume it once it has an Owner again (→ active; refused without one);
--   * make a current or former member, whose own account is in good
--     standing, an Owner (admin_team_appoint_owner); a team paused only for
--     having no Owner resumes at once.
-- Every step is in the team's activity (no member is named as the actor:
-- staff did it) and in the admin audit log (the service writes that).
--
-- Also: a team carrying the organizer badge (it came with "make this a
-- team") keeps its name until teams can be verified (decision X42 sends a
-- renamed Verified team back to review; review for teams comes later).
--
-- Nothing here is reachable until a team exists, and teams ship switched
-- off (team_program_setting).

-- ---------------------------------------------------------------------------
-- 1. Pause and resume
-- ---------------------------------------------------------------------------

create or replace function public.admin_team_set_status(
  p_team   uuid,
  p_to     text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.team;
begin
  select * into v_team from public.team where account_id = p_team for update;
  if not found then
    perform public._team_fail('not_found');
  end if;

  if p_to = 'frozen' then
    if p_reason is null or p_reason not in ('dispute', 'staff') then
      perform public._team_fail('bad_reason');
    end if;
    if v_team.status <> 'active' then
      perform public._team_fail('team_frozen');
    end if;
    update public.team
       set status = 'frozen', status_reason = p_reason, updated_at = now()
     where account_id = p_team;
    perform public._team_log(p_team, null, 'team.frozen', 'team', p_team::text,
      jsonb_build_object('reason', p_reason, 'by', 'staff'));
    return 'frozen';
  elsif p_to = 'active' then
    if v_team.status <> 'frozen' then
      perform public._team_fail('not_paused');
    end if;
    if public._team_active_owners(p_team) = 0 then
      perform public._team_fail('no_owner');
    end if;
    update public.team
       set status = 'active', status_reason = null, updated_at = now()
     where account_id = p_team;
    perform public._team_log(p_team, null, 'team.resumed', 'team', p_team::text,
      jsonb_build_object('by', 'staff'));
    return 'active';
  end if;
  perform public._team_fail('bad_status');
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Make a member an Owner
-- ---------------------------------------------------------------------------

create or replace function public.admin_team_appoint_owner(
  p_team uuid,
  p_user uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team    public.team;
  v_member  public.team_member;
  v_resumed boolean := false;
begin
  select * into v_team from public.team where account_id = p_team for update;
  if not found or v_team.status = 'closed' then
    perform public._team_fail('not_found');
  end if;
  if not exists (
    select 1 from public.user_info u
    where u.id = p_user and u.account_kind = 'person' and u.status_id = 1
  ) then
    perform public._team_fail('receiver_unavailable');
  end if;
  select * into v_member from public.team_member
   where team_id = p_team and user_id = p_user
   for update;
  if not found then
    perform public._team_fail('not_member');
  end if;
  if v_member.status = 'active' and v_member.role = 'owner' then
    perform public._team_fail('already_member');
  end if;

  update public.team_member
     set role = 'owner', status = 'active', ended_at = null, ended_by = null,
         updated_at = now()
   where team_id = p_team and user_id = p_user;
  perform public._team_log(p_team, null, 'member.role_changed', 'member', p_user::text,
    jsonb_build_object('from', case when v_member.status = 'active' then v_member.role end,
                       'to', 'owner', 'by', 'staff'));

  if v_team.status = 'frozen' and v_team.status_reason = 'no_owner' then
    update public.team
       set status = 'active', status_reason = null, updated_at = now()
     where account_id = p_team;
    perform public._team_log(p_team, null, 'team.resumed', 'team', p_team::text,
      jsonb_build_object('by', 'staff'));
    v_resumed := true;
  end if;
  return case when v_resumed then 'resumed' else 'appointed' end;
end;
$$;

revoke all on function public.admin_team_set_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_team_appoint_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_team_set_status(uuid, text, text) to service_role;
grant execute on function public.admin_team_appoint_owner(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. A Verified team keeps its name (X42, until teams can be reviewed)
-- ---------------------------------------------------------------------------

create or replace function public.team_rename_guard_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_kind = 'team'
     and old.organizer_verified
     and new.full_name is distinct from old.full_name then
    perform public._team_fail('verified_name_locked');
  end if;
  return new;
end;
$$;

drop trigger if exists team_rename_guard_verified on public.user_info;
create trigger team_rename_guard_verified
  before update of full_name on public.user_info
  for each row
  when (old.account_kind = 'team')
  execute function public.team_rename_guard_verified();

-- ---------------------------------------------------------------------------
-- 4. Admin permission
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('teams.manage', 'Manage teams',
     'Pause or resume a team, and make a current or former member an Owner (a paused team with no Owner, a dispute). Requires step-up.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('operations', 'teams.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.admin_team_set_status(uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_team_appoint_owner(uuid, uuid)', 'execute') then
    raise exception 'migration check: clients may run a staff team tool';
  end if;
  if not exists (select 1 from public.admin_permission where key = 'teams.manage') then
    raise exception 'migration check: teams.manage is missing';
  end if;
end;
$$;
