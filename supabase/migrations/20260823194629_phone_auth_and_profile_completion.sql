-- Phone OTP sign-in repair + profile completion tracking.
--
-- 1. username_is_generated: lets profile-completion tracking tell a
--    system-assigned username ("user12345678") apart from one the user
--    actually chose via Edit Profile. Flipped to false in
--    src/actions/updateUserDetails.ts whenever the user saves the profile
--    form (the only place a username change happens).
--
-- 2. Rewritten on_auth_user_created trigger function: adds a
--    collision-resistant random-digit username generator for phone
--    sign-ups. The previous version fell back to
--    raw_user_meta_data->>'phone', a key that is never actually populated
--    (the real sign-in flow sets auth.users.phone directly via the Admin
--    API, not user metadata) -- so every phone sign-up would have produced
--    'user_' || uuid. It also had *no* uniqueness handling at all: two
--    Google sign-ups deriving the same username from full_name/email would
--    make the whole auth.users insert fail. Both are fixed here with a
--    bounded collision-retry loop.
--
-- 3. get_auth_user_id_by_phone(): the trusted server-side phone sign-in
--    action (src/actions/verifyPhoneSignIn.ts) needs to find an existing
--    user by phone after Hubtel confirms an OTP. supabase-js's admin
--    listUsers() has no phone filter, and the auth schema isn't exposed
--    over PostgREST -- this SECURITY DEFINER function is the narrow,
--    service_role-only door for that one lookup.
--
-- 4. notification_profile_completion_unique: DB-level backstop so the
--    "Complete your profile" notification (src/actions/
--    ensureProfileCompletionNotification.ts) can never be duplicated even
--    under a race, on top of the app-level pre-check.

alter table public.user_info
  add column username_is_generated boolean not null default true;

create or replace function public.create_user_info_if_not_exists()
returns trigger
language plpgsql
security definer
as $function$
declare
  candidate_username text;
  derived_from_metadata text;
  attempt int := 0;
begin
  if exists (select 1 from public.user_info where id = new.id) then
    return new;
  end if;

  derived_from_metadata := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'email'
  );

  if derived_from_metadata is not null and length(derived_from_metadata) > 0 then
    candidate_username := left(
      regexp_replace(derived_from_metadata, '[^a-zA-Z0-9_]', '_', 'g'),
      20
    );

    while exists (select 1 from public.user_info where username = candidate_username) and attempt < 20 loop
      candidate_username := left(candidate_username, 15) || '_' || lpad(floor(random() * 10000)::text, 4, '0');
      attempt := attempt + 1;
    end loop;
  else
    -- Phone sign-up (no name/email in metadata): generate a
    -- collision-resistant default like "user12345678".
    loop
      candidate_username := 'user' || lpad(floor(random() * 100000000)::text, 8, '0');
      exit when not exists (select 1 from public.user_info where username = candidate_username);
      attempt := attempt + 1;
      exit when attempt > 20;
    end loop;
  end if;

  -- Last-resort fallback if 20 attempts still collided or the derived name
  -- ended up too short/blank for the username_check constraint.
  if candidate_username is null
     or length(candidate_username) < 3
     or exists (select 1 from public.user_info where username = candidate_username) then
    candidate_username := 'user_' || replace(new.id::text, '-', '');
  end if;

  insert into public.user_info (
    id, status_id, username, full_name,
    avatar_public_id, avatar_version, bio, updated_at, username_is_generated
  )
  values (
    new.id,
    1,
    candidate_username,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    null, null, null, now(), true
  );

  return new;
end;
$function$;

create or replace function public.get_auth_user_id_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = public, auth
as $function$
  select id from auth.users where phone = p_phone limit 1;
$function$;

revoke all on function public.get_auth_user_id_by_phone(text) from public;
revoke all on function public.get_auth_user_id_by_phone(text) from anon;
revoke all on function public.get_auth_user_id_by_phone(text) from authenticated;
grant execute on function public.get_auth_user_id_by_phone(text) to service_role;

create unique index notification_profile_completion_unique
  on public.notification (user_id)
  where type = 'profile_completion';
