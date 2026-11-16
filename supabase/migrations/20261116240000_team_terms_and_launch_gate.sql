-- Team accounts: the team terms an Owner accepts for the team (legal item
-- N4, "how Owners accept for the team"), and the gate before team accounts
-- open to everyone (N4, N5, N9, K7 approved by counsel).
--
-- Nothing changes for anyone until staff publish a version of the team
-- terms in Admin › Teams (team_program_setting.terms_version): while it is
-- null no one is asked to accept anything. Once it is set:
--   * whoever makes a team, or makes their account a team, accepts that
--     version for the team as they do it (the services refuse otherwise);
--   * the team page asks every Owner who has not accepted the current
--     version to do so;
--   * a team's money does not leave (payout requests, payout account
--     changes) until at least one active Owner has accepted the current
--     version (team_terms_accepted, checked by the services).
-- Each acceptance is kept: who, for which team, which version, when, in
-- which language it was shown.
--
-- The gate itself (audience "Everyone" needs a published terms version and
-- a recorded counsel clearance) is enforced by the admin service
-- (updateTeamSettingsCore), like the G1 confirmation for recommendation
-- email; the clearance is stored here and audited.
--
-- Docs: docs/architecture/team-accounts.md §4m, docs/admin/teams.md.

-- 1. Settings ------------------------------------------------------------

alter table public.team_program_setting
  add column if not exists terms_version     text,
  add column if not exists terms_path        text not null default '/legal/terms',
  add column if not exists launch_cleared_at timestamptz,
  add column if not exists launch_cleared_by uuid references public.user_info(id) on delete set null,
  add column if not exists launch_clearance  jsonb;

alter table public.team_program_setting
  drop constraint if exists team_program_setting_terms_version_check;
alter table public.team_program_setting
  add constraint team_program_setting_terms_version_check
  check (terms_version is null or (length(btrim(terms_version)) between 1 and 40));

alter table public.team_program_setting
  drop constraint if exists team_program_setting_terms_path_check;
alter table public.team_program_setting
  add constraint team_program_setting_terms_path_check
  check (terms_path ~ '^/[A-Za-z0-9/_#.-]{0,200}$');

comment on column public.team_program_setting.terms_version is
  'The team terms Owners accept for their team (N4). Null: none published, nobody is asked.';
comment on column public.team_program_setting.terms_path is
  'Where the team terms are read on the website (a path, e.g. /legal/terms#team-accounts).';
comment on column public.team_program_setting.launch_cleared_at is
  'When staff recorded that counsel approved N4, N5, N9 and K7 (needed for audience all).';

-- 2. Acceptances ----------------------------------------------------------

create table if not exists public.team_terms_acceptance (
  team_id        uuid        not null references public.team(account_id) on delete cascade,
  user_id        uuid        not null references public.user_info(id) on delete cascade,
  terms_version  text        not null,
  accepted_at    timestamptz not null default now(),
  -- The language the terms and the statement were shown in.
  locale         text,
  primary key (team_id, user_id, terms_version)
);

create index if not exists team_terms_acceptance_user_idx
  on public.team_terms_acceptance (user_id);

alter table public.team_terms_acceptance enable row level security;
revoke all on table public.team_terms_acceptance from anon, authenticated;
grant all on table public.team_terms_acceptance to service_role;

comment on table public.team_terms_acceptance is
  'Who accepted which team terms for which team (N4). Service role only; kept as evidence.';

-- An acceptance is evidence: it is never changed, only added.
create or replace function public.team_terms_acceptance_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

revoke all on function public.team_terms_acceptance_append_only() from public, anon, authenticated;

drop trigger if exists team_terms_acceptance_append_only on public.team_terms_acceptance;
create trigger team_terms_acceptance_append_only
  before update on public.team_terms_acceptance
  for each row execute function public.team_terms_acceptance_append_only();

-- 3. Has the team accepted the current terms? -----------------------------
-- True while no terms are published; otherwise when at least one active
-- Owner of the team accepted the current version.

create or replace function public.team_terms_accepted(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.terms_version is null
              or exists (
                select 1
                from public.team_terms_acceptance a
                join public.team_member m
                  on m.team_id = a.team_id and m.user_id = a.user_id
                where a.team_id = p_team
                  and a.terms_version = s.terms_version
                  and m.role = 'owner'
                  and m.status = 'active')
     from public.team_program_setting s
     where s.id = 1),
    true);
$$;

revoke all on function public.team_terms_accepted(uuid) from public, anon, authenticated;
grant execute on function public.team_terms_accepted(uuid) to service_role;

-- 4. Checks ----------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.team_terms_acceptance', 'select')
     or has_function_privilege('authenticated', 'public.team_terms_accepted(uuid)', 'execute') then
    raise exception 'migration check: team terms must be service role only';
  end if;
  if not public.team_terms_accepted('00000000-0000-0000-0000-000000000000'::uuid)
     and (select terms_version from public.team_program_setting where id = 1) is null then
    raise exception 'migration check: with no terms published every team counts as accepted';
  end if;
end;
$$;
