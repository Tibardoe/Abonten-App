-- A notification must never be able to undo a money decision.
--
-- _fieldops_notify inserts straight into `notification`, which has a FK to
-- auth.users. If that insert fails -- the commonest cause being a member
-- whose account was deleted between the work and the sweep -- the error
-- propagates out of the notify call and rolls back everything the sweep (or
-- the payout function) did for that row in the same statement: the status
-- transition, the commission approval, the payout stamp. The sweep's
-- per-row handler then just counts it as `failed` and moves on, so the row
-- sits `verified` forever and nobody is paid.
--
-- Found by the Field Ops integration suite, where a previous run's deleted
-- test user left exactly that FK violation behind. The fix is to make the
-- notice best-effort: skip a recipient who no longer exists, and swallow
-- anything else that goes wrong writing it. Losing a notice is a nuisance;
-- losing a payment decision is not.

create or replace function public._fieldops_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_route text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  -- A deleted account has nothing to tell.
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return;
  end if;

  begin
    insert into public.notification (user_id, type, title, body, link, data)
    values (p_user_id, p_type, p_title, p_body, p_route,
            jsonb_build_object('kind', 'fieldops', 'fieldOpsRoute', p_route));
  exception when others then
    -- Best effort by design: never let a notice roll back the decision
    -- that triggered it.
    raise warning 'fieldops notify failed for %: %', p_user_id, sqlerrm;
  end;
end;
$$;

revoke all on function public._fieldops_notify(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public._fieldops_notify(uuid, text, text, text, text) to service_role;

-- Rollback: restore the 20260911223818 definition.
