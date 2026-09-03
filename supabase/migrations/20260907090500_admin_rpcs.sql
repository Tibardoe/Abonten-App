-- Admin Console Phase 1 — privileged administrative RPCs.
--
-- All are SECURITY DEFINER and EXECUTE-granted to service_role ONLY
-- (matching this repo's record_* convention). They are invoked by
-- @abonten/services/admin/** after resolveAdminContext() has already
-- authorized the caller in application code; each RPC ALSO re-checks
-- is_staff / the specific permission itself (defence in depth), and each is
-- idempotent so an accidental double-submit has no extra effect.
--
-- Audit-logging is the caller's responsibility (recordAdminAudit) — these
-- functions stay focused on the atomic state change, like record_*.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- apply_moderation_action
-- ============================================================

create function public.apply_moderation_action(
  p_actor_id        uuid,
  p_target_type     text,
  p_target_id       uuid,
  p_action          text,
  p_reason          text,
  p_report_id       uuid,
  p_idempotency_key text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_existing   public.moderation_action%rowtype;
  v_new_state  text;
  v_table      text;
  v_action_id  uuid;
begin
  if not public.is_staff(p_actor_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- idempotency: replay returns the original outcome, no new side effects
  select * into v_existing
  from public.moderation_action
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'applied', false, 'idempotent_replay', true,
      'moderation_action_id', v_existing.id, 'action', v_existing.action
    );
  end if;

  v_new_state := case p_action
    when 'hide'       then 'hidden'
    when 'unhide'     then 'visible'
    when 'remove'     then 'removed'
    when 'restore'    then 'visible'
    when 'restrict'   then 'restricted'
    when 'unrestrict' then 'visible'
    else null
  end;
  if v_new_state is null then
    raise exception 'Unknown moderation action: %', p_action using errcode = '22023';
  end if;

  v_table := case p_target_type
    when 'event'         then 'public.event'
    when 'place'         then 'public.place'
    when 'highlight'     then 'public.highlight'
    when 'event_review'  then 'public.event_review'
    when 'place_review'  then 'public.place_review'
    when 'user_review'   then 'public.review'
    else null
  end;
  if v_table is null then
    raise exception 'target_type % is not moderatable via this RPC (use user status actions for users)', p_target_type
      using errcode = '22023';
  end if;

  insert into public.moderation_action (
    actor_id, target_type, target_id, action, reason, report_id, idempotency_key
  )
  values (p_actor_id, p_target_type, p_target_id, p_action, p_reason, p_report_id, p_idempotency_key)
  returning id into v_action_id;

  execute format(
    'update %s set moderation_state = $1, moderated_at = now(), moderated_by = $2, moderation_reason = $3 where id = $4',
    v_table
  ) using v_new_state, p_actor_id, p_reason, p_target_id;

  if p_report_id is not null then
    insert into public.report_event (report_id, actor_id, kind, data)
    values (
      p_report_id, p_actor_id, 'action_taken',
      jsonb_build_object('action', p_action, 'target_type', p_target_type,
                         'target_id', p_target_id, 'new_state', v_new_state)
    );
  end if;

  return jsonb_build_object(
    'applied', true, 'idempotent_replay', false,
    'moderation_action_id', v_action_id, 'new_state', v_new_state
  );
end;
$function$;

-- ============================================================
-- resolve_report
-- ============================================================

create function public.resolve_report(
  p_report_id  uuid,
  p_actor_id   uuid,
  p_status     text,
  p_resolution text,
  p_action     text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_current text;
begin
  if not public.is_staff(p_actor_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_status not in ('resolved','dismissed','false_report') then
    raise exception 'Invalid terminal status: %', p_status using errcode = '22023';
  end if;

  select status into v_current from public.report where id = p_report_id for update;
  if v_current is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  -- idempotent: already terminal -> no-op
  if v_current in ('resolved','dismissed','false_report') then
    return jsonb_build_object('resolved', false, 'noop', true, 'status', v_current);
  end if;

  update public.report set
    status            = p_status,
    resolution        = p_resolution,
    resolution_action = p_action,
    resolved_by       = p_actor_id,
    resolved_at       = now()
  where id = p_report_id;

  insert into public.report_event (report_id, actor_id, kind, data)
  values (p_report_id, p_actor_id, 'resolved',
          jsonb_build_object('status', p_status, 'action', p_action));

  return jsonb_build_object('resolved', true, 'noop', false, 'status', p_status);
end;
$function$;

-- ============================================================
-- admin role / status management (admins.manage)
-- ============================================================

create function public.grant_admin_role(
  p_actor_id     uuid,
  p_target_user  uuid,
  p_role_key     text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  if not public.admin_has_permission('admins.manage', p_actor_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.admin_role where key = p_role_key) then
    raise exception 'Unknown role: %', p_role_key using errcode = '22023';
  end if;

  insert into public.admin_user (user_id, status, created_by)
  values (p_target_user, 'active', p_actor_id)
  on conflict (user_id) do update set status = 'active', updated_at = now();

  insert into public.admin_user_role (user_id, role_key, granted_by)
  values (p_target_user, p_role_key, p_actor_id)
  on conflict (user_id, role_key) do nothing;
end;
$function$;

create function public.revoke_admin_role(
  p_actor_id     uuid,
  p_target_user  uuid,
  p_role_key     text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  if not public.admin_has_permission('admins.manage', p_actor_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.admin_user_role
  where user_id = p_target_user and role_key = p_role_key;
end;
$function$;

create function public.set_admin_user_status(
  p_actor_id    uuid,
  p_target_user uuid,
  p_status      text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
begin
  if not public.admin_has_permission('admins.manage', p_actor_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('active','disabled') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;
  update public.admin_user set
    status      = p_status,
    disabled_at = case when p_status = 'disabled' then now() else null end,
    disabled_by = case when p_status = 'disabled' then p_actor_id else null end,
    updated_at  = now()
  where user_id = p_target_user;
end;
$function$;

-- ============================================================
-- lock down EXECUTE to service_role only
-- ============================================================

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.apply_moderation_action(uuid,text,uuid,text,text,uuid,text)',
    'public.resolve_report(uuid,uuid,text,text,text)',
    'public.grant_admin_role(uuid,uuid,text)',
    'public.revoke_admin_role(uuid,uuid,text)',
    'public.set_admin_user_status(uuid,uuid,text)'
  ]
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
