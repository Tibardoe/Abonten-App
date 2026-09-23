-- "Finish setting up your account" reminder: when it was last put away.
--
-- The reminder card (name, username, photo, email, phone) is dismissible.
-- A dismissal has to hold on every device the person uses — putting it away
-- on the phone and meeting it again on the website the same afternoon is the
-- nagging this is meant to avoid — so it is stored here rather than on the
-- device. What is complete is never stored: it is computed from the live
-- profile and auth fields on every read (@abonten/core/profileCompletion).
--
-- The quiet period after each dismissal grows (7, then 30, then 90 days —
-- @abonten/core/accountSetupPrompt) and is decided in shared code, not here;
-- this table only records the facts it needs.

create table public.account_setup_prompt_state (
  user_id       uuid        primary key references public.user_info (id) on delete cascade,
  dismiss_count smallint    not null default 0 check (dismiss_count >= 0),
  dismissed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

comment on table public.account_setup_prompt_state is
  'When a person last dismissed the account-setup reminder, and how many times. Written only by account_setup_prompt_dismiss(); readable by its owner.';

alter table public.account_setup_prompt_state enable row level security;
revoke all on table public.account_setup_prompt_state from anon, authenticated;
grant select on table public.account_setup_prompt_state to authenticated;
grant all on table public.account_setup_prompt_state to service_role;

create policy account_setup_prompt_state_own_select on public.account_setup_prompt_state
  for select to authenticated
  using (user_id = (select auth.uid()));

create function public.account_setup_prompt_dismiss()
  returns table (dismiss_count smallint, dismissed_at timestamptz)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return query
  insert into public.account_setup_prompt_state as s (user_id, dismiss_count, dismissed_at, updated_at)
  values (v_uid, 1, now(), now())
  on conflict (user_id) do update
     set dismiss_count = least(s.dismiss_count + 1, 1000)::smallint,
         dismissed_at  = now(),
         updated_at    = now()
  returning s.dismiss_count, s.dismissed_at;
end;
$$;
revoke all on function public.account_setup_prompt_dismiss() from public, anon;
grant execute on function public.account_setup_prompt_dismiss() to authenticated, service_role;
