-- Security: columns only Abonten staff may change.
--
-- 1. user_info.is_admin / status_id -- a signed-in user could make
--    THEMSELVES a platform admin (or lift their own suspension/ban).
--    protect_user_info_privileged_columns() (20260903231755) lets the write
--    through when current_user is 'postgres', meant for migrations. But the
--    function is SECURITY DEFINER, and inside a definer function
--    current_user is always its owner (postgres) -- so the guard passed for
--    everyone. Reproduced on the local stack: an ordinary user's
--    `update user_info set is_admin = true where id = auth.uid()` succeeded.
--    Production: no abuse found (the only is_admin user is the owner, who is
--    also an active admin_user; no user_info row is suspended/banned).
--    Fix: run the guard as the CALLER (security invoker). A browser session
--    is then 'authenticated' and is refused; the service-role backend,
--    migrations and SECURITY DEFINER maintenance (sync_is_admin_from_
--    admin_user, owned by postgres) still pass exactly as intended.
--
-- 2. Content owners could undo moderation and self-verify places. The owner
--    UPDATE policies on event / place / highlight / review / event_review /
--    place_review check only who owns the row, and `authenticated` has
--    UPDATE on every column -- so an organizer could set a hidden or removed
--    event back to visible, and a place owner could mark their own place
--    `verified` / `claimed` (also on INSERT). Verification now matters for
--    money: the venue rebate (Rewards Phase 6) only pays verified places,
--    and every reward re-checks moderation. Production: no place is verified
--    or claimed, nothing has been moderated yet, so nothing to repair.
--    Fix: a BEFORE trigger refuses those column changes from a direct client
--    write (roles authenticated / anon) unless the caller is a platform
--    admin (is_admin). The admin console (service role), approve_place_claim
--    (an admin's session) and apply_moderation_action (SECURITY DEFINER) are
--    unaffected, and a client write that leaves these columns unchanged
--    still works.

alter function public.protect_user_info_privileged_columns() security invoker;

create or replace function public.guard_staff_managed_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only direct client writes are checked. SECURITY DEFINER functions run as
  -- their owner and the backend as service_role, so current_user is neither.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_user = 'authenticated' and public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.moderation_state  is distinct from old.moderation_state
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at      is distinct from old.moderated_at
    or new.moderated_by      is distinct from old.moderated_by) then
    raise exception 'Only Abonten staff can change moderation status'
      using errcode = '42501';
  end if;

  -- Fields of `place` only (plpgsql resolves NEW.verified at run time, so
  -- the other tables never evaluate it).
  if tg_table_name = 'place' then
    if (tg_op = 'INSERT' and (new.verified or new.claimed))
       or (tg_op = 'UPDATE' and (new.verified is distinct from old.verified
                                 or new.claimed is distinct from old.claimed)) then
      raise exception 'Only Abonten staff can mark a place as verified or claimed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_staff_managed_columns() from public, anon, authenticated;

drop trigger if exists guard_staff_columns on public.place;
create trigger guard_staff_columns
  before insert or update on public.place
  for each row execute function public.guard_staff_managed_columns();

do $$
declare
  t text;
begin
  foreach t in array array['event', 'highlight', 'review', 'event_review', 'place_review'] loop
    execute format('drop trigger if exists guard_staff_columns on public.%I', t);
    execute format(
      'create trigger guard_staff_columns before update on public.%I
         for each row execute function public.guard_staff_managed_columns()', t);
  end loop;
end;
$$;
