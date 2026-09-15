-- approve_place_claim decided who was an admin from an argument.
--
-- The function is the only path that reassigns a place's owner. Its
-- authorization check was:
--
--     select is_admin into v_is_admin from user_info where id = p_admin_id;
--
-- — the admin id is whatever the caller passed, not who the caller is. And
-- EXECUTE was granted to PUBLIC (its sibling approve_place_claim_and_verify
-- is correctly service_role-only), so any signed-in user could call it with a
-- real admin's id and walk straight past the check. `user_info.is_admin` is
-- readable by anyone through user_info_public_select, so finding an id to
-- pass takes one query.
--
-- Confirmed against production from a non-admin account: the call got past
-- the admin check and failed only at the next statement, where RLS on
-- place_claim_request hid the row from SELECT ... FOR UPDATE. So nothing was
-- taken over — but the function's own gate contributed nothing, and the whole
-- defence rested on one RLS policy on a table the function also updates. Widen
-- that policy, or make this function SECURITY DEFINER the way its sibling is,
-- and it becomes a place takeover.
--
-- Two changes, no behaviour change for the real caller:
--
--   * EXECUTE is revoked from PUBLIC and granted to service_role only, which
--     matches approve_place_claim_and_verify and is how the admin console
--     actually calls it (claimsAdminCore uses a service-role client with a
--     pre-resolved AdminContext).
--   * When there IS a caller — auth.uid() is not null — p_admin_id must be
--     that caller. Passing someone else's admin id is now refused. A
--     service-role call has no auth.uid() and still passes p_admin_id purely
--     to record who approved it, which is what the audit trail needs.

create or replace function public.approve_place_claim(p_request_id uuid, p_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_is_admin boolean;
  v_place_id uuid;
  v_claimant uuid;
  v_status text;
begin
  -- A caller may only act as themselves. service_role and pg_cron have no
  -- auth.uid() and keep passing p_admin_id to record who approved.
  if auth.uid() is not null and auth.uid() <> p_admin_id then
    raise exception 'Not authorized: caller may only approve as themselves'
      using errcode = '42501';
  end if;

  select is_admin into v_is_admin from user_info where id = p_admin_id;
  if v_is_admin is not true then
    raise exception 'Not authorized: caller is not an admin'
      using errcode = '42501';
  end if;

  select place_id, claimant_id, status into v_place_id, v_claimant, v_status
  from place_claim_request where id = p_request_id for update;

  if v_place_id is null then
    raise exception 'Claim request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Claim request already reviewed';
  end if;

  update place
  set owner_id = v_claimant, claimed = true, updated_at = now()
  where id = v_place_id;

  update place_claim_request
  set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_request_id;
end;
$function$;

revoke all on function public.approve_place_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_place_claim(uuid, uuid) to service_role;
