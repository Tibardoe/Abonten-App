-- Global markets, part 6: a person's home market is server-owned.
--
-- user_info.country_code (20260924100100) decides which market's rules apply
-- to a person where no listing decides it — the currency their Abonten
-- Credit opens in, which mobile money rails their wallet is checked
-- against. A signed-in client could write it directly through the owner's
-- UPDATE policy, so a person could pick a market that is not open, or keep
-- flipping it. It now changes only through @abonten/services (the
-- service-role client), which checks the market is open. The preference
-- columns next to it — display currency, locale, distance unit — stay
-- client-writable: they change what a screen shows, never what is charged.
--
-- The guard function is the existing one with one more column in its list.

create or replace function public.protect_user_info_privileged_columns()
  returns trigger
  language plpgsql
  set search_path to ''
as $function$
begin
  -- signed-in platform admin (unchanged)
  if public.is_admin() then
    return new;
  end if;

  -- trusted server contexts: the service-role key (admin console / backend
  -- services), or a superuser / the postgres role (migrations, dashboard,
  -- SECURITY DEFINER maintenance such as verification_transition).
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id
     or new.organizer_verified is distinct from old.organizer_verified
     or new.organizer_verified_at is distinct from old.organizer_verified_at
     or new.organizer_verification_case_id is distinct from old.organizer_verification_case_id
     or new.country_code is distinct from old.country_code then
    raise exception 'Not authorized to modify this field' using errcode = '42501';
  end if;

  return new;
end;
$function$;
