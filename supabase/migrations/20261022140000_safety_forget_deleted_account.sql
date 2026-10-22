-- Abonten Safety when an account is deleted.
--
-- Deleting an account keeps the user_info row, scrubbed and marked Deleted
-- (status 4, 20260913200100_account_deletion_preserves_records), so the
-- "on delete cascade" of the Safety tables never fires. A deleted person's
-- trusted contacts (other people's names and numbers), their sessions, the
-- positions in them and the texts still queued stayed behind. From now on,
-- the moment an account becomes Deleted its Safety data is removed, and any
-- link to it as someone else's contact is dropped (the contact row itself
-- belongs to the other person and stays). Accounts deleted before this
-- migration are cleaned up below.

create or replace function public.safety_forget_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sessions take their positions, recipients, timeline and texts with them.
  delete from public.safety_session where user_id = p_user_id;
  -- Invites and anything else still queued for this person's contacts.
  delete from public.safety_message where user_id = p_user_id;
  delete from public.safety_contact where user_id = p_user_id;
  -- A contact's "stop texts from this person"; a "stop all" (no user) stays.
  delete from public.safety_contact_optout where user_id = p_user_id;
  update public.safety_contact
     set contact_user_id = null
   where contact_user_id = p_user_id;
  update public.safety_recipient
     set recipient_user_id = null
   where recipient_user_id = p_user_id;
end;
$$;
revoke all on function public.safety_forget_account(uuid) from public, anon, authenticated;
grant execute on function public.safety_forget_account(uuid) to service_role;

create or replace function public.safety_forget_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.safety_forget_account(new.id);
  return null;
end;
$$;
revoke all on function public.safety_forget_deleted_account() from public, anon, authenticated;

drop trigger if exists user_info_safety_forget on public.user_info;
create trigger user_info_safety_forget
  after update of status_id on public.user_info
  for each row
  when (new.status_id = 4 and old.status_id is distinct from 4)
  execute function public.safety_forget_deleted_account();

-- Accounts deleted before today.
do $$
declare
  r record;
begin
  for r in select id from public.user_info where status_id = 4 loop
    perform public.safety_forget_account(r.id);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_info_safety_forget'
      and tgrelid = 'public.user_info'::regclass
  ) then
    raise exception 'migration check: the Safety clean-up trigger is missing';
  end if;
  if has_function_privilege('authenticated', 'public.safety_forget_account(uuid)', 'execute')
     or has_function_privilege('anon', 'public.safety_forget_account(uuid)', 'execute') then
    raise exception 'migration check: safety_forget_account must be service-role only';
  end if;
end;
$$;
