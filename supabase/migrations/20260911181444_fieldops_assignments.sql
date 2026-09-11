-- Field Ops Phase 1: the daily unit of work (assignments) and the discovery
-- funnel (prospects) for team leads and members.
--
-- An assignment is one member working one territory for a date range
-- (a single day when starts_on = ends_on). Reassignment is cancel + a new
-- row, so "who owned this town when" stays answerable. A prospect is a
-- business or organizer a member identified in a territory; it feeds the
-- territory funnel metrics and, from Phase 2, the onboarding wizard.
--
-- Clients (members, leads) only ever SELECT these tables, scoped to their
-- own rows or their team's. Every write goes through
-- @abonten/services/fieldOps on the service role after the service has
-- resolved the caller's membership and role.

-- ---------------------------------------------------------------------
-- fieldops_assignment
-- ---------------------------------------------------------------------

create table public.fieldops_assignment (
  id                uuid        primary key default gen_random_uuid(),
  campaign_id       uuid        not null references public.fieldops_campaign (id) on delete restrict,
  team_id           uuid        not null references public.fieldops_team (id) on delete restrict,
  member_id         uuid        not null references public.fieldops_team_member (id) on delete restrict,
  -- Snapshot of the member's user id (no FK, like fieldops_team_member):
  -- the RLS self-select key, and it survives a deleted account.
  member_user_id    uuid        not null,
  territory_id      uuid        not null references public.fieldops_territory (id) on delete restrict,
  mode              text        not null check (mode in ('offline', 'online')),
  starts_on         date        not null,
  ends_on           date        not null,
  status            text        not null default 'assigned' check (status in (
                      'assigned', 'started', 'completed', 'cancelled')),
  started_at        timestamptz,
  -- Offline members check in with the device's GPS when they start.
  -- Informational: the lead sees the distance; nothing is refused on it.
  start_location    extensions.geography(Point, 4326),
  start_lat         double precision generated always as (extensions.st_y(start_location::extensions.geometry)) stored,
  start_lng         double precision generated always as (extensions.st_x(start_location::extensions.geometry)) stored,
  start_accuracy_m  integer     check (start_accuracy_m is null or start_accuracy_m between 0 and 100000),
  start_distance_m  integer     check (start_distance_m is null or start_distance_m >= 0),
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text        check (cancel_reason is null or length(cancel_reason) <= 1000),
  -- The lead (or admin) who created it. No FK: leads are ordinary accounts.
  assigned_by       uuid,
  notes             text        check (notes is null or length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fieldops_assignment_dates_check check (ends_on >= starts_on)
);

comment on table public.fieldops_assignment is
  'Field Ops: one member working one territory over a date range. Reassignment = cancel + new row.';

-- One open assignment per member per territory.
create unique index fieldops_assignment_one_open_per_member_territory
  on public.fieldops_assignment (member_id, territory_id)
  where status in ('assigned', 'started');

create index idx_fieldops_assignment_campaign_dates on public.fieldops_assignment (campaign_id, starts_on, ends_on);
create index idx_fieldops_assignment_member on public.fieldops_assignment (member_id, status);
create index idx_fieldops_assignment_member_user on public.fieldops_assignment (member_user_id, status);
create index idx_fieldops_assignment_territory on public.fieldops_assignment (territory_id, status);
create index idx_fieldops_assignment_team on public.fieldops_assignment (team_id);
create index idx_fieldops_assignment_assigned_by on public.fieldops_assignment (assigned_by);

create trigger fieldops_assignment_touch before update on public.fieldops_assignment
  for each row execute function public.fieldops_touch_updated_at();

-- Referential sanity the FKs alone can't express: the member belongs to
-- the team and campaign on the row, is an active field member whose role
-- matches the mode, the user id is theirs, and the territory is an active
-- one in the campaign's region.
create function public.fieldops_assignment_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member public.fieldops_team_member;
  v_region uuid;
begin
  select * into v_member from public.fieldops_team_member m where m.id = new.member_id;
  if v_member.id is null then
    raise exception 'Member not found' using errcode = 'foreign_key_violation';
  end if;
  if v_member.team_id <> new.team_id or v_member.campaign_id <> new.campaign_id then
    raise exception 'Member % is not on team % of campaign %', new.member_id, new.team_id, new.campaign_id
      using errcode = 'check_violation';
  end if;
  if v_member.user_id is null or v_member.user_id <> new.member_user_id then
    raise exception 'member_user_id does not match the membership' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if v_member.status <> 'active' then
      raise exception 'Only an active member can be assigned' using errcode = 'check_violation';
    end if;
    if v_member.role not in ('offline_member', 'online_member') then
      raise exception 'Only offline and online members take assignments' using errcode = 'check_violation';
    end if;
    if (v_member.role = 'offline_member') <> (new.mode = 'offline') then
      raise exception 'Assignment mode must match the member''s role' using errcode = 'check_violation';
    end if;
    select c.region_id into v_region from public.fieldops_campaign c where c.id = new.campaign_id;
    if not exists (
      select 1 from public.fieldops_territory t
      where t.id = new.territory_id and t.region_id = v_region and t.status = 'active'
    ) then
      raise exception 'Territory is not an active territory of this campaign''s region'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_assignment_check() from public, anon, authenticated;

create trigger fieldops_assignment_integrity
  before insert or update of member_id, member_user_id, team_id, campaign_id, territory_id
  on public.fieldops_assignment
  for each row execute function public.fieldops_assignment_check();

-- ---------------------------------------------------------------------
-- fieldops_prospect
-- ---------------------------------------------------------------------

create table public.fieldops_prospect (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.fieldops_campaign (id) on delete restrict,
  team_id             uuid        not null references public.fieldops_team (id) on delete restrict,
  territory_id        uuid        not null references public.fieldops_territory (id) on delete restrict,
  member_id           uuid        not null references public.fieldops_team_member (id) on delete restrict,
  member_user_id      uuid        not null,
  kind                text        not null check (kind in ('place', 'event', 'organizer')),
  name                text        not null check (length(name) between 2 and 120),
  contact_name        text        check (contact_name is null or length(contact_name) <= 120),
  contact_phone_e164  text        check (contact_phone_e164 is null or contact_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  contact_channel     text        check (contact_channel is null or contact_channel in (
                        'in_person', 'phone', 'whatsapp', 'social', 'email')),
  status              text        not null default 'identified' check (status in (
                        'identified', 'contacted', 'interested', 'declined', 'converted')),
  -- [{at, channel, outcome, note}] appended by the member; never edited.
  contact_attempts    jsonb       not null default '[]'::jsonb check (jsonb_typeof(contact_attempts) = 'array'),
  -- Set when the business turns out to be on Abonten already (Phase 2
  -- routes it to claim assistance instead of a new listing).
  matched_place_id    uuid        references public.place (id) on delete set null,
  notes               text        check (notes is null or length(notes) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.fieldops_prospect is
  'Field Ops: a business/organizer a member identified in a territory (identified → contacted → interested/declined/converted).';

create index idx_fieldops_prospect_territory on public.fieldops_prospect (campaign_id, territory_id, status);
create index idx_fieldops_prospect_member on public.fieldops_prospect (member_id, status);
create index idx_fieldops_prospect_member_user on public.fieldops_prospect (member_user_id);
create index idx_fieldops_prospect_team on public.fieldops_prospect (team_id);
create index idx_fieldops_prospect_matched_place on public.fieldops_prospect (matched_place_id);
create index idx_fieldops_prospect_phone on public.fieldops_prospect (contact_phone_e164) where contact_phone_e164 is not null;

create trigger fieldops_prospect_touch before update on public.fieldops_prospect
  for each row execute function public.fieldops_touch_updated_at();

create function public.fieldops_prospect_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member public.fieldops_team_member;
  v_region uuid;
begin
  select * into v_member from public.fieldops_team_member m where m.id = new.member_id;
  if v_member.id is null then
    raise exception 'Member not found' using errcode = 'foreign_key_violation';
  end if;
  if v_member.team_id <> new.team_id or v_member.campaign_id <> new.campaign_id then
    raise exception 'Member % is not on team % of campaign %', new.member_id, new.team_id, new.campaign_id
      using errcode = 'check_violation';
  end if;
  if v_member.user_id is null or v_member.user_id <> new.member_user_id then
    raise exception 'member_user_id does not match the membership' using errcode = 'check_violation';
  end if;
  select c.region_id into v_region from public.fieldops_campaign c where c.id = new.campaign_id;
  if not exists (
    select 1 from public.fieldops_territory t
    where t.id = new.territory_id and t.region_id = v_region
  ) then
    raise exception 'Territory is not in this campaign''s region' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_prospect_check() from public, anon, authenticated;

create trigger fieldops_prospect_integrity
  before insert or update of member_id, member_user_id, team_id, campaign_id, territory_id
  on public.fieldops_prospect
  for each row execute function public.fieldops_prospect_check();

-- ---------------------------------------------------------------------
-- Privileges + RLS: own rows, or the lead's team. No client writes.
-- ---------------------------------------------------------------------

alter table public.fieldops_assignment enable row level security;
alter table public.fieldops_prospect enable row level security;

revoke all on table public.fieldops_assignment, public.fieldops_prospect from anon, authenticated;
grant all on table public.fieldops_assignment, public.fieldops_prospect to service_role;
grant select on table public.fieldops_assignment, public.fieldops_prospect to authenticated;

create policy fieldops_assignment_self_or_lead_select on public.fieldops_assignment
  for select to authenticated
  using (member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(team_id));

create policy fieldops_prospect_self_or_lead_select on public.fieldops_prospect
  for select to authenticated
  using (member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(team_id));

-- Rollback (safe while nothing references these rows):
--   drop table public.fieldops_prospect; drop table public.fieldops_assignment;
--   drop function public.fieldops_prospect_check(); drop function public.fieldops_assignment_check();
