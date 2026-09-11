-- Field Ops (regional promotion & field operations programme), Phase 0:
-- programme settings, regions, territories, campaigns, teams, team
-- memberships, versioned commission rules, the admin permissions for the
-- module and the membership helpers the later phases and RLS build on.
--
-- Everything ships OFF: program_enabled = false, every commission rule
-- inactive, no campaign. Nothing here records an onboarding or moves money;
-- those arrive with fieldops_onboarding (Phase 2) and fieldops_commission
-- (Phase 3).
--
-- Naming: every object is prefixed fieldops_ so the module can be found,
-- switched off and removed as one unit. "promotion", "campaign" and
-- "commission" already mean other things in this schema (event_promotion /
-- place_promotion, reward_campaign, event_promoter_commission).
--
-- Money is bigint minor units (pesewas for GHS); a campaign carries its own
-- currency so nothing here hard-codes Ghana.
--
-- Roles: team leads and workers are ordinary Abonten accounts with a
-- fieldops_team_member row. They are never admin_user rows -- that would
-- flip user_info.is_admin and hand them the staff bypasses in
-- guard_staff_managed_columns / place_admin_update / approve_place_claim.

-- ---------------------------------------------------------------------
-- updated_at helper (module-owned, like touch_report_updated_at)
-- ---------------------------------------------------------------------

create function public.fieldops_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.fieldops_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- fieldops_program_setting: one row of switches and defaults
-- ---------------------------------------------------------------------

create table public.fieldops_program_setting (
  id                             smallint    primary key default 1 check (id = 1),
  -- Master switch: off = /field is a 404, the sweep is a no-op, every
  -- member/lead write is refused. The admin module stays readable.
  program_enabled                boolean     not null default false,
  worker_ui_enabled              boolean     not null default true,
  commission_generation_enabled  boolean     not null default true,
  payouts_enabled                boolean     not null default true,
  -- Members must have a verified phone before they can be activated (it is
  -- also what lets the owner-phone <> member-phone fraud check work).
  require_member_phone_verified  boolean     not null default true,
  default_holding_days           integer     not null default 7  check (default_holding_days between 0 and 90),
  duplicate_radius_m             integer     not null default 300 check (duplicate_radius_m between 10 and 5000),
  -- pg_trgm similarity threshold for "same business name", 0..1.
  duplicate_name_similarity      numeric(3,2) not null default 0.45 check (duplicate_name_similarity between 0 and 1),
  offline_max_distance_m         integer     not null default 200 check (offline_max_distance_m between 10 and 5000),
  daily_submission_cap           integer     not null default 8  check (daily_submission_cap between 1 and 200),
  -- Share of passing onboardings sent to an admin spot-check before the
  -- commission is approved (basis points, 500 = 5%).
  spot_check_bps                 integer     not null default 500 check (spot_check_bps between 0 and 10000),
  -- Days after a campaign completes before still-open reviews auto-close.
  review_grace_days              integer     not null default 14 check (review_grace_days between 0 and 90),
  evidence_retention_days        integer     not null default 365 check (evidence_retention_days between 30 and 3650),
  notify_push_enabled            boolean     not null default true,
  updated_at                     timestamptz not null default now(),
  updated_by                     uuid
);

comment on table public.fieldops_program_setting is
  'Field Ops programme switches and defaults (one row). Edited only from Admin > Field Ops > Settings (step-up + audit).';

insert into public.fieldops_program_setting (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- fieldops_region / fieldops_territory
-- ---------------------------------------------------------------------

create table public.fieldops_region (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null check (length(name) between 2 and 80),
  country_code  char(2)     not null default 'GH' check (country_code ~ '^[A-Z]{2}$'),
  -- ISO 3166-2 subdivision when known (e.g. GH-AH for Ashanti).
  admin_code    text        check (admin_code is null or admin_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  centre        extensions.geography(Point, 4326),
  -- Plain readable coordinates for PostgREST clients (the geography column
  -- comes back as hex WKB otherwise). Written through `centre` only.
  centre_lat    double precision generated always as (extensions.st_y(centre::extensions.geometry)) stored,
  centre_lng    double precision generated always as (extensions.st_x(centre::extensions.geometry)) stored,
  status        text        not null default 'active' check (status in ('active', 'retired')),
  notes         text        check (notes is null or length(notes) <= 2000),
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fieldops_region_country_name_key unique (country_code, name)
);

create trigger fieldops_region_touch before update on public.fieldops_region
  for each row execute function public.fieldops_touch_updated_at();

create table public.fieldops_territory (
  id                   uuid        primary key default gen_random_uuid(),
  region_id            uuid        not null references public.fieldops_region (id) on delete restrict,
  parent_territory_id  uuid        references public.fieldops_territory (id) on delete set null,
  name                 text        not null check (length(name) between 2 and 80),
  kind                 text        not null default 'town' check (kind in ('town', 'area')),
  -- Point + radius is the default model; a polygon, when present, wins.
  centre               extensions.geography(Point, 4326) not null,
  centre_lat           double precision generated always as (extensions.st_y(centre::extensions.geometry)) stored,
  centre_lng           double precision generated always as (extensions.st_x(centre::extensions.geometry)) stored,
  radius_m             integer     not null default 5000 check (radius_m between 100 and 50000),
  boundary             extensions.geography(Polygon, 4326),
  boundary_geojson     jsonb       generated always as (extensions.st_asgeojson(boundary)::jsonb) stored,
  status               text        not null default 'active' check (status in ('active', 'completed', 'retired')),
  priority             smallint    not null default 0 check (priority between -100 and 100),
  notes                text        check (notes is null or length(notes) <= 2000),
  created_by           uuid        references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint fieldops_territory_region_name_key unique (region_id, name),
  constraint fieldops_territory_not_own_parent check (parent_territory_id is distinct from id)
);

create index idx_fieldops_territory_region on public.fieldops_territory (region_id, status);
create index idx_fieldops_territory_parent on public.fieldops_territory (parent_territory_id);
create index idx_fieldops_territory_centre on public.fieldops_territory using gist (centre);
create index idx_fieldops_territory_boundary on public.fieldops_territory using gist (boundary);

create trigger fieldops_territory_touch before update on public.fieldops_territory
  for each row execute function public.fieldops_touch_updated_at();

-- The single containment rule: polygon when set, else the circle.
create function public.fieldops_territory_contains(
  p_territory_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when t.boundary is not null then
        extensions.st_covers(
          t.boundary,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
      else
        extensions.st_dwithin(
          t.centre,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          t.radius_m)
    end
    from public.fieldops_territory t
    where t.id = p_territory_id
  ), false);
$$;

-- ---------------------------------------------------------------------
-- fieldops_campaign: one region run
-- ---------------------------------------------------------------------

create table public.fieldops_campaign (
  id                     uuid        primary key default gen_random_uuid(),
  region_id              uuid        not null references public.fieldops_region (id) on delete restrict,
  name                   text        not null check (length(name) between 2 and 120),
  slug                   text        not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status                 text        not null default 'draft' check (status in (
                           'draft', 'active', 'paused', 'winding_down', 'completed', 'archived')),
  currency               char(3)     not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  starts_on              date,
  ends_on                date,
  budget_cap_minor       bigint      check (budget_cap_minor is null or budget_cap_minor >= 0),
  holding_days_override  integer     check (holding_days_override is null or holding_days_override between 0 and 90),
  description            text        check (description is null or length(description) <= 4000),
  status_changed_at      timestamptz not null default now(),
  status_changed_by      uuid        references auth.users (id) on delete set null,
  activated_at           timestamptz,
  completed_at           timestamptz,
  archived_at            timestamptz,
  created_by             uuid        references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint fieldops_campaign_slug_key unique (slug),
  constraint fieldops_campaign_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- One live campaign per region at a time.
create unique index fieldops_campaign_one_live_per_region
  on public.fieldops_campaign (region_id)
  where status in ('active', 'paused', 'winding_down');

create index idx_fieldops_campaign_status on public.fieldops_campaign (status, created_at desc);

create trigger fieldops_campaign_touch before update on public.fieldops_campaign
  for each row execute function public.fieldops_touch_updated_at();

-- ---------------------------------------------------------------------
-- fieldops_team / fieldops_team_member
-- ---------------------------------------------------------------------

create table public.fieldops_team (
  id           uuid        primary key default gen_random_uuid(),
  campaign_id  uuid        not null references public.fieldops_campaign (id) on delete restrict,
  name         text        not null check (length(name) between 2 and 80),
  created_at   timestamptz not null default now(),
  constraint fieldops_team_campaign_name_key unique (campaign_id, name)
);

create table public.fieldops_team_member (
  id                   uuid        primary key default gen_random_uuid(),
  team_id              uuid        not null references public.fieldops_team (id) on delete restrict,
  campaign_id          uuid        not null references public.fieldops_campaign (id) on delete restrict,
  -- No FK: the row (and the commissions that hang off it) must outlive a
  -- deleted account, like the credit tables. NULL while invited by phone.
  user_id              uuid,
  invited_phone_e164   text        check (invited_phone_e164 is null or invited_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  full_name_snapshot   text        check (full_name_snapshot is null or length(full_name_snapshot) <= 120),
  role                 text        not null check (role in (
                         'team_lead', 'content_creator', 'offline_member', 'online_member')),
  status               text        not null default 'invited' check (status in (
                         'invited', 'active', 'suspended', 'left')),
  joined_at            timestamptz,
  left_at              timestamptz,
  suspended_reason     text        check (suspended_reason is null or length(suspended_reason) <= 1000),
  -- Payout destination for manual MoMo payouts (Phase 4). Column-level
  -- SELECT is revoked from clients below; only service code reads these.
  payout_momo_number   text        check (payout_momo_number is null or payout_momo_number ~ '^\+?[0-9]{9,15}$'),
  payout_momo_network  text        check (payout_momo_network is null or length(payout_momo_network) <= 40),
  payout_holder_name   text        check (payout_holder_name is null or length(payout_holder_name) <= 120),
  payout_updated_at    timestamptz,
  added_by             uuid        references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint fieldops_team_member_identity_check check (user_id is not null or invited_phone_e164 is not null)
);

-- One membership per person per campaign (until they leave).
create unique index fieldops_team_member_one_per_campaign
  on public.fieldops_team_member (campaign_id, user_id)
  where user_id is not null and status <> 'left';

-- One open phone invitation per campaign.
create unique index fieldops_team_member_one_invite_per_phone
  on public.fieldops_team_member (campaign_id, invited_phone_e164)
  where user_id is null and status = 'invited';

-- One active team lead per team.
create unique index fieldops_team_member_one_lead_per_team
  on public.fieldops_team_member (team_id)
  where role = 'team_lead' and status = 'active';

create index idx_fieldops_team_member_user on public.fieldops_team_member (user_id, status);
create index idx_fieldops_team_member_team on public.fieldops_team_member (team_id, status);
create index idx_fieldops_team_member_campaign on public.fieldops_team_member (campaign_id, status);

create trigger fieldops_team_member_touch before update on public.fieldops_team_member
  for each row execute function public.fieldops_touch_updated_at();

-- The team belongs to the campaign the member row says it does.
create function public.fieldops_team_member_check_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.fieldops_team t
    where t.id = new.team_id and t.campaign_id = new.campaign_id
  ) then
    raise exception 'Team % does not belong to campaign %', new.team_id, new.campaign_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_team_member_check_team() from public, anon, authenticated;

create trigger fieldops_team_member_team_matches_campaign
  before insert or update of team_id, campaign_id on public.fieldops_team_member
  for each row execute function public.fieldops_team_member_check_team();

-- ---------------------------------------------------------------------
-- fieldops_commission_rule: versioned, immutable (reward_rule pattern).
-- A change is a NEW version row; only is_active may flip, so every
-- commission records exactly the terms it was earned under.
-- ---------------------------------------------------------------------

create table public.fieldops_commission_rule (
  id              uuid        primary key default gen_random_uuid(),
  -- NULL = programme default; a campaign row overrides it for that campaign.
  campaign_id     uuid        references public.fieldops_campaign (id) on delete restrict,
  activity_key    text        not null check (activity_key in (
                    'place_onboarding_offline', 'place_onboarding_online',
                    'event_onboarding_offline', 'event_onboarding_online',
                    'existing_place_claim_assist',
                    'content_deliverable', 'content_monthly_stipend', 'team_lead_monthly_stipend')),
  version         integer     not null check (version > 0),
  is_active       boolean     not null default false,
  amount_minor    bigint      not null check (amount_minor >= 0),
  currency        char(3)     not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  -- holding_days, min_photos, require_owner_phone_verified,
  -- require_inside_territory, max_distance_m, min_description_chars,
  -- require_opening_hours, require_contact, release_policy.
  eligibility     jsonb       not null default '{}'::jsonb,
  effective_from  timestamptz not null default now(),
  note            text        check (note is null or length(note) <= 500),
  created_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint fieldops_commission_rule_key_version_key
    unique nulls not distinct (campaign_id, activity_key, version)
);

create unique index fieldops_commission_rule_one_active
  on public.fieldops_commission_rule (campaign_id, activity_key) nulls not distinct
  where is_active;

create index idx_fieldops_commission_rule_lookup
  on public.fieldops_commission_rule (activity_key, campaign_id, is_active);

create function public.fieldops_commission_rule_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'fieldops_commission_rule versions cannot be deleted; deactivate them instead'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
    raise exception 'fieldops_commission_rule versions are immutable; publish a new version instead'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_commission_rule_guard() from public, anon, authenticated;

create trigger fieldops_commission_rule_immutable
  before update or delete on public.fieldops_commission_rule
  for each row execute function public.fieldops_commission_rule_guard();

-- Make one version live for (campaign, activity), or switch it off with
-- p_rule_id null. The partial unique index above makes two live versions
-- impossible even under concurrent calls.
create function public.fieldops_commission_rule_set_active(
  p_campaign_id uuid,
  p_activity_key text,
  p_rule_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rule_id is not null and not exists (
    select 1 from public.fieldops_commission_rule r
    where r.id = p_rule_id
      and r.activity_key = p_activity_key
      and r.campaign_id is not distinct from p_campaign_id
  ) then
    raise exception 'Rule version not found' using errcode = 'P0002';
  end if;

  update public.fieldops_commission_rule r
  set is_active = false
  where r.activity_key = p_activity_key
    and r.campaign_id is not distinct from p_campaign_id
    and r.is_active
    and r.id is distinct from p_rule_id;

  if p_rule_id is not null then
    update public.fieldops_commission_rule r
    set is_active = true
    where r.id = p_rule_id and not r.is_active;
  end if;
end;
$$;

-- Launch defaults (owner decision 2026-09-11: GH₵ 5 per successful place or
-- event onboarding; claim assistance and content pay are placeholders). All
-- inactive: an admin makes a version live from Admin > Field Ops > Rules.
insert into public.fieldops_commission_rule (campaign_id, activity_key, version, is_active, amount_minor, currency, eligibility, note) values
  (null, 'place_onboarding_offline', 1, false, 500, 'GHS',
   '{"holding_days": 7, "min_photos": 2, "require_owner_phone_verified": true, "require_inside_territory": true, "max_distance_m": 200, "min_description_chars": 80, "require_opening_hours": true, "require_contact": true, "release_policy": "holding_period"}'::jsonb,
   'Launch default: GH₵ 5 per successful place onboarding by an offline (field) member.'),
  (null, 'place_onboarding_online', 1, false, 500, 'GHS',
   '{"holding_days": 7, "min_photos": 2, "require_owner_phone_verified": true, "require_inside_territory": true, "min_description_chars": 80, "require_opening_hours": true, "require_contact": true, "release_policy": "holding_period"}'::jsonb,
   'Launch default: GH₵ 5 per successful place onboarding by an online member.'),
  (null, 'event_onboarding_offline', 1, false, 500, 'GHS',
   '{"require_owner_phone_verified": true, "require_inside_territory": true, "min_days_before_start": 3, "release_policy": "event_started"}'::jsonb,
   'Launch default: GH₵ 5 per published event onboarded by an offline member, paid once the event has started.'),
  (null, 'event_onboarding_online', 1, false, 500, 'GHS',
   '{"require_owner_phone_verified": true, "require_inside_territory": true, "min_days_before_start": 3, "release_policy": "event_started"}'::jsonb,
   'Launch default: GH₵ 5 per published event onboarded by an online member, paid once the event has started.'),
  (null, 'existing_place_claim_assist', 1, false, 200, 'GHS',
   '{"require_owner_phone_verified": true, "release_policy": "claim_approved"}'::jsonb,
   'Launch default: GH₵ 2 for helping the real owner claim a place already on Abonten, paid when an admin approves the claim.'),
  (null, 'content_deliverable', 1, false, 0, 'GHS', '{}'::jsonb,
   'Placeholder: pay per approved content deliverable (Phase 6). Publish a version with an amount before making it live.'),
  (null, 'content_monthly_stipend', 1, false, 0, 'GHS', '{}'::jsonb,
   'Placeholder: monthly stipend for the content creator (Phase 6).'),
  (null, 'team_lead_monthly_stipend', 1, false, 0, 'GHS', '{}'::jsonb,
   'Placeholder: monthly stipend for the team lead (Phase 6).')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Membership helpers (self-only from a session; explicit id for services)
-- ---------------------------------------------------------------------

create function public.fieldops_memberships_for(p_user_id uuid)
returns table (
  membership_id   uuid,
  campaign_id     uuid,
  team_id         uuid,
  region_id       uuid,
  role            text,
  status          text,
  campaign_status text,
  campaign_name   text,
  currency        text,
  joined_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.campaign_id, m.team_id, c.region_id, m.role, m.status,
         c.status, c.name, c.currency::text, m.joined_at
  from public.fieldops_team_member m
  join public.fieldops_campaign c on c.id = m.campaign_id
  where m.user_id = p_user_id
    and m.status in ('active', 'suspended')
  order by c.created_at desc;
$$;

create function public.fieldops_my_memberships()
returns table (
  membership_id   uuid,
  campaign_id     uuid,
  team_id         uuid,
  region_id       uuid,
  role            text,
  status          text,
  campaign_status text,
  campaign_name   text,
  currency        text,
  joined_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.fieldops_memberships_for(auth.uid());
$$;

-- RLS helpers. Both answer only for the caller.
create function public.fieldops_is_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fieldops_team_member m
    where m.campaign_id = p_campaign_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create function public.fieldops_is_lead_of_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fieldops_team_member m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.role = 'team_lead'
      and m.status = 'active'
  );
$$;

-- Bind phone invitations to the person who now owns that phone. Called by
-- the service after it has identified the caller (never with a client
-- value). Returns the number of memberships bound.
create function public.fieldops_bind_invited_memberships(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_name  text;
  v_count integer := 0;
begin
  select u.phone into v_phone from auth.users u where u.id = p_user_id and u.phone_confirmed_at is not null;
  if v_phone is null then
    return 0;
  end if;
  select ui.full_name into v_name from public.user_info ui where ui.id = p_user_id;

  with bound as (
    update public.fieldops_team_member m
    set user_id = p_user_id,
        status = 'active',
        joined_at = now(),
        full_name_snapshot = coalesce(m.full_name_snapshot, v_name)
    where m.user_id is null
      and m.status = 'invited'
      and replace(m.invited_phone_e164, '+', '') = replace(v_phone, '+', '')
      -- Never bind a second membership in a campaign the person is already in.
      and not exists (
        select 1 from public.fieldops_team_member x
        where x.campaign_id = m.campaign_id and x.user_id = p_user_id and x.status <> 'left')
    returning 1
  )
  select count(*) into v_count from bound;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Campaign lifecycle: the SQL is authoritative, the TS copy
-- (@abonten/core/fieldOps/campaignLifecycle) drives the UI.
-- ---------------------------------------------------------------------

create function public.fieldops_set_campaign_status(
  p_campaign_id uuid,
  p_status text,
  p_actor uuid
)
returns public.fieldops_campaign
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.fieldops_campaign;
  v_allowed  boolean;
begin
  select * into v_campaign from public.fieldops_campaign where id = p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  v_allowed := case v_campaign.status
    when 'draft'        then p_status in ('active', 'archived')
    when 'active'       then p_status in ('paused', 'winding_down')
    when 'paused'       then p_status in ('active', 'winding_down', 'completed')
    when 'winding_down' then p_status in ('completed')
    when 'completed'    then p_status in ('archived')
    else false
  end;
  if not v_allowed then
    raise exception 'A % campaign cannot move to %', v_campaign.status, p_status
      using errcode = 'check_violation';
  end if;

  if p_status = 'active' and v_campaign.status = 'draft' then
    if not exists (select 1 from public.fieldops_territory t
                   where t.region_id = v_campaign.region_id and t.status = 'active') then
      raise exception 'Add at least one active territory to the region before activating'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.fieldops_team_member m
                   where m.campaign_id = v_campaign.id and m.role = 'team_lead' and m.status = 'active') then
      raise exception 'The campaign needs an active team lead before it can be activated'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.fieldops_campaign c
               where c.region_id = v_campaign.region_id and c.id <> v_campaign.id
                 and c.status in ('active', 'paused', 'winding_down')) then
      raise exception 'Another campaign is already running in this region'
        using errcode = 'unique_violation';
    end if;
  end if;

  update public.fieldops_campaign
  set status = p_status,
      status_changed_at = now(),
      status_changed_by = p_actor,
      activated_at = case when p_status = 'active' and activated_at is null then now() else activated_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      archived_at  = case when p_status = 'archived' then now() else archived_at end
  where id = p_campaign_id
  returning * into v_campaign;

  return v_campaign;
end;
$$;

-- Whether the programme is switched on (service-side; the web deploy flag
-- FIELD_OPS_KILL_SWITCH overrides this in code).
create function public.fieldops_program_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.program_enabled from public.fieldops_program_setting s where s.id = 1), false);
$$;

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------

alter table public.fieldops_program_setting enable row level security;
alter table public.fieldops_region enable row level security;
alter table public.fieldops_territory enable row level security;
alter table public.fieldops_campaign enable row level security;
alter table public.fieldops_team enable row level security;
alter table public.fieldops_team_member enable row level security;
alter table public.fieldops_commission_rule enable row level security;

revoke all on table
  public.fieldops_program_setting, public.fieldops_region, public.fieldops_territory,
  public.fieldops_campaign, public.fieldops_team, public.fieldops_team_member,
  public.fieldops_commission_rule
  from anon, authenticated;

grant all on table
  public.fieldops_program_setting, public.fieldops_region, public.fieldops_territory,
  public.fieldops_campaign, public.fieldops_team, public.fieldops_team_member,
  public.fieldops_commission_rule
  to service_role;

-- Service-role only (deny-all policy makes the intent legible, LOW-009).
create policy service_role_only on public.fieldops_program_setting
  for all to public using (false) with check (false);
create policy service_role_only on public.fieldops_commission_rule
  for all to public using (false) with check (false);

-- Members read the campaign, region, territories and team they belong to.
-- No client INSERT/UPDATE/DELETE anywhere: every write goes through
-- @abonten/services/fieldOps on the service role after it has resolved the
-- caller's membership.
grant select on table
  public.fieldops_region, public.fieldops_territory, public.fieldops_campaign, public.fieldops_team
  to authenticated;

create policy fieldops_campaign_member_select on public.fieldops_campaign
  for select to authenticated
  using (public.fieldops_is_member(id));

create policy fieldops_region_member_select on public.fieldops_region
  for select to authenticated
  using (exists (
    select 1 from public.fieldops_campaign c
    where c.region_id = fieldops_region.id and public.fieldops_is_member(c.id)));

create policy fieldops_territory_member_select on public.fieldops_territory
  for select to authenticated
  using (exists (
    select 1 from public.fieldops_campaign c
    where c.region_id = fieldops_territory.region_id and public.fieldops_is_member(c.id)));

create policy fieldops_team_member_select on public.fieldops_team
  for select to authenticated
  using (public.fieldops_is_member(campaign_id));

-- Own row, or the lead's team. Payout columns are excluded at the column
-- level, so no client ever reads a MoMo number.
grant select (id, team_id, campaign_id, user_id, full_name_snapshot, role, status,
              joined_at, left_at, created_at, updated_at)
  on public.fieldops_team_member to authenticated;

create policy fieldops_team_member_self_or_lead_select on public.fieldops_team_member
  for select to authenticated
  using (user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(team_id));

-- Functions
revoke all on function public.fieldops_territory_contains(uuid, double precision, double precision) from public, anon;
grant execute on function public.fieldops_territory_contains(uuid, double precision, double precision) to authenticated, service_role;

revoke all on function public.fieldops_memberships_for(uuid) from public, anon, authenticated;
grant execute on function public.fieldops_memberships_for(uuid) to service_role;

revoke all on function public.fieldops_my_memberships() from public, anon;
grant execute on function public.fieldops_my_memberships() to authenticated, service_role;

revoke all on function public.fieldops_is_member(uuid) from public, anon;
grant execute on function public.fieldops_is_member(uuid) to authenticated, service_role;

revoke all on function public.fieldops_is_lead_of_team(uuid) from public, anon;
grant execute on function public.fieldops_is_lead_of_team(uuid) to authenticated, service_role;

revoke all on function public.fieldops_bind_invited_memberships(uuid) from public, anon, authenticated;
grant execute on function public.fieldops_bind_invited_memberships(uuid) to service_role;

revoke all on function public.fieldops_set_campaign_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fieldops_set_campaign_status(uuid, text, uuid) to service_role;

revoke all on function public.fieldops_commission_rule_set_active(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fieldops_commission_rule_set_active(uuid, text, uuid) to service_role;

revoke all on function public.fieldops_program_enabled() from public, anon, authenticated;
grant execute on function public.fieldops_program_enabled() to service_role;

-- ---------------------------------------------------------------------
-- Admin permissions + role for the Field Ops module
-- ---------------------------------------------------------------------
-- super_admin receives every permission through resolveAdminContext (its
-- admin_role_permission rows are immutable), so only non-super seeds here.

insert into public.admin_permission (key, label, description) values
  ('fieldops.view',                 'View Field Ops',            'See campaigns, territories, teams, onboardings, commissions and payouts.'),
  ('fieldops.manage',               'Manage Field Ops',          'Create and edit campaigns, regions, territories, teams and members; change campaign status; edit programme settings.'),
  ('fieldops.rules',                'Configure commission rules','Publish and activate Field Ops commission rule versions.'),
  ('fieldops.verify',               'Verify onboardings',        'Decide flagged and spot-checked onboardings and override a team lead''s review.'),
  ('fieldops.commissions.approve',  'Approve commissions',       'Reverse commissions and build or approve payout batches.'),
  ('fieldops.commissions.pay',      'Pay commissions',           'Mark payout batches and items paid and record payment references.')
on conflict (key) do nothing;

insert into public.admin_role (key, label, description) values
  ('field_ops_manager', 'Field Ops Manager', 'Runs the regional promotion programme: campaigns, teams, verification, commissions and payouts.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('field_ops_manager', 'dashboard.view'),
  ('field_ops_manager', 'fieldops.view'),
  ('field_ops_manager', 'fieldops.manage'),
  ('field_ops_manager', 'fieldops.rules'),
  ('field_ops_manager', 'fieldops.verify'),
  ('field_ops_manager', 'fieldops.commissions.approve'),
  ('field_ops_manager', 'fieldops.commissions.pay'),
  ('field_ops_manager', 'users.view'),
  ('field_ops_manager', 'places.view'),
  ('field_ops_manager', 'events.view'),
  ('field_ops_manager', 'organizers.view'),
  ('field_ops_manager', 'audit.view'),
  ('operations',        'fieldops.view'),
  ('operations',        'fieldops.manage'),
  ('operations',        'fieldops.verify'),
  ('finance_admin',     'fieldops.view'),
  ('finance_admin',     'fieldops.commissions.approve'),
  ('finance_admin',     'fieldops.commissions.pay'),
  ('analyst',           'fieldops.view')
on conflict do nothing;
