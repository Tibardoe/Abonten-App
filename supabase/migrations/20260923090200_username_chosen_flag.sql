-- "Choose a username" completes the same way on every platform.
--
-- user_info.username_is_generated tells the account-setup checklist whether
-- the handle is still the placeholder given at sign-up. Until now each client
-- had to clear it itself: the web profile action did, the mobile app never
-- did — so choosing a username in the app left "Choose a username" undone
-- forever — and any client could flip the flag without changing anything.
--
-- The database now owns it: a signed-in person changing their username marks
-- it chosen, and the flag can't be changed on its own. Service-role writes
-- (account deletion sets a new placeholder and the flag back to true) are
-- left exactly as written.

create function public.user_info_mark_username_chosen()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.username is distinct from old.username then
    new.username_is_generated := false;
  else
    new.username_is_generated := old.username_is_generated;
  end if;
  return new;
end;
$$;
revoke all on function public.user_info_mark_username_chosen() from public, anon, authenticated;

create trigger user_info_username_chosen
  before update on public.user_info
  for each row execute function public.user_info_mark_username_chosen();

-- One-time repair for accounts that chose a username in the mobile app
-- before this trigger existed: the flag is cleared where the username can't
-- be one the sign-up trigger generates (on_auth_user_created: the name or
-- email with non-word characters replaced, cut to 20 characters, possibly
-- with a _NNNN collision suffix; "user" + 8 digits; "user_" + the id; or a
-- deleted account's placeholder). Runs as the migration owner, so the
-- trigger above leaves it alone.
update public.user_info ui
   set username_is_generated = false
  from auth.users au
 where au.id = ui.id
   and ui.username_is_generated
   and not (
        ui.username::text = left(regexp_replace(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'email', ''), '[^a-zA-Z0-9_]', '_', 'g'), 20)
     or ui.username::text ~ '^user[0-9]{8}$'
     or ui.username::text = 'user_' || replace(ui.id::text, '-', '')
     or (ui.username::text ~ '_[0-9]{4}$'
         and left(ui.username::text, length(ui.username::text) - 5)
             = left(regexp_replace(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'email', ''), '[^a-zA-Z0-9_]', '_', 'g'), 15))
     or (ui.status_id = 4 and ui.username::text like 'deleted\_%')
   );
