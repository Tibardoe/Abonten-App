-- Admin Console Phase 1 — tighten the authorization helpers.
--
-- The first cut of is_staff / admin_effective_permissions /
-- admin_has_permission took an optional p_user_id. Because they are
-- SECURITY DEFINER and reachable at /rest/v1/rpc/*, that let any
-- authenticated (or anon) caller ask about ANOTHER user's staff status /
-- permissions — an information-disclosure vector flagged by get_advisors.
--
-- Fix: drop the parameter. These are now strictly self-answering
-- (auth.uid() only), exactly like the existing public.is_admin(). The
-- privileged RPCs that needed an actor check now inline the lookup (they
-- are already SECURITY DEFINER + service_role-only, so there is no
-- disclosure surface there).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ---- self-only helpers -------------------------------------------------

-- 3 policies depend on public.is_staff(uuid); drop them, swap the function,
-- recreate them against the new no-arg signature.
drop policy if exists report_reporter_select      on public.report;
drop policy if exists report_attachment_select    on public.report_attachment;
drop policy if exists "report_attachments_read"   on storage.objects;

drop function if exists public.is_staff(uuid);
drop function if exists public.admin_effective_permissions(uuid);
drop function if exists public.admin_has_permission(text, uuid);

create function public.is_staff()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists(
    select 1 from public.admin_user au
    where au.user_id = auth.uid() and au.status = 'active'
  );
$function$;

create function public.admin_effective_permissions()
  returns text[]
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select coalesce(array_agg(distinct rp.permission_key), array[]::text[])
  from public.admin_user au
  join public.admin_user_role ur on ur.user_id = au.user_id
  join public.admin_role_permission rp on rp.role_key = ur.role_key
  where au.user_id = auth.uid() and au.status = 'active';
$function$;

create function public.admin_has_permission(p_permission text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists(
    select 1
    from public.admin_user au
    join public.admin_user_role ur on ur.user_id = au.user_id
    join public.admin_role_permission rp on rp.role_key = ur.role_key
    where au.user_id = auth.uid()
      and au.status = 'active'
      and rp.permission_key = p_permission
  );
$function$;

revoke execute on function public.is_staff() from public;
revoke execute on function public.admin_effective_permissions() from public;
revoke execute on function public.admin_has_permission(text) from public;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.admin_effective_permissions() to authenticated, service_role;
grant execute on function public.admin_has_permission(text) to authenticated, service_role;

-- recreate the policies dropped above, now against public.is_staff()
create policy report_reporter_select on public.report
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());

create policy report_attachment_select on public.report_attachment
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.report r
      where r.id = report_id and r.reporter_id = (select auth.uid())
    )
  );

create policy "report_attachments_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

-- ---- lock down trigger functions from RPC exposure --------------------

revoke execute on function public.sync_is_admin_from_admin_user() from public, anon, authenticated;
revoke execute on function public.app_error_event_rollup()        from public, anon, authenticated;
revoke execute on function public.touch_report_updated_at()       from public, anon, authenticated;
revoke execute on function public.admin_note_is_immutable()       from public, anon, authenticated;
revoke execute on function public.admin_audit_log_is_append_only() from public, anon, authenticated;

-- ---- re-create the privileged RPCs with inlined actor checks ---------
-- (signatures unchanged; only the is_staff(p_actor_id) / admin_has_permission(..)
--  calls are replaced with direct lookups.)

create or replace function public.apply_moderation_action(
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
  if not exists (
    select 1 from public.admin_user au
    where au.user_id = p_actor_id and au.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

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
    raise exception 'target_type % is not moderatable via this RPC', p_target_type
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

create or replace function public.resolve_report(
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
  if not exists (
    select 1 from public.admin_user au
    where au.user_id = p_actor_id and au.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_status not in ('resolved','dismissed','false_report') then
    raise exception 'Invalid terminal status: %', p_status using errcode = '22023';
  end if;

  select status into v_current from public.report where id = p_report_id for update;
  if v_current is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

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

create or replace function public.grant_admin_role(
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
  if not exists (
    select 1
    from public.admin_user au
    join public.admin_user_role ur on ur.user_id = au.user_id
    join public.admin_role_permission rp on rp.role_key = ur.role_key
    where au.user_id = p_actor_id and au.status = 'active'
      and rp.permission_key = 'admins.manage'
  ) then
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

create or replace function public.revoke_admin_role(
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
  if not exists (
    select 1
    from public.admin_user au
    join public.admin_user_role ur on ur.user_id = au.user_id
    join public.admin_role_permission rp on rp.role_key = ur.role_key
    where au.user_id = p_actor_id and au.status = 'active'
      and rp.permission_key = 'admins.manage'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.admin_user_role
  where user_id = p_target_user and role_key = p_role_key;
end;
$function$;

create or replace function public.set_admin_user_status(
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
  if not exists (
    select 1
    from public.admin_user au
    join public.admin_user_role ur on ur.user_id = au.user_id
    join public.admin_role_permission rp on rp.role_key = ur.role_key
    where au.user_id = p_actor_id and au.status = 'active'
      and rp.permission_key = 'admins.manage'
  ) then
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

-- signatures unchanged, but re-assert the lock-down
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
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
