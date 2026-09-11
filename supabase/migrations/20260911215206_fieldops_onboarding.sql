-- Field Ops Phase 2: the onboarding record (from wizard start to a lead's
-- review), its evidence photos and append-only timeline, the duplicate
-- search, and the owner phone OTP purpose.
--
-- The onboarded business is an ORDINARY place created through the existing
-- create_place RPC (via postPlaceCore on the service role) and owned by the
-- business owner from the first second -- proven by an OTP the owner
-- entered. fieldops_onboarding only records how it was acquired, by whom,
-- with what evidence, and what the team lead decided. Commissions arrive
-- with Phase 3 (they hang off `verified` onboardings + holding_until).
--
-- Clients (members, leads) only SELECT these tables, scoped to their own
-- rows / their team; every write goes through @abonten/services/fieldOps on
-- the service role. Evidence lives in a private bucket read and written
-- only through service-issued signed URLs (no storage policies at all).

-- ---------------------------------------------------------------------
-- Owner OTP purpose
-- ---------------------------------------------------------------------
-- phone_otp_state.purpose was CHECK-locked to sign-in / phone-update. The
-- business owner's consent code uses its own purpose so it can never be
-- replayed as a sign-in and vice versa.

alter table public.phone_otp_state drop constraint if exists phone_otp_state_purpose_check;
alter table public.phone_otp_state
  add constraint phone_otp_state_purpose_check
  check (purpose in ('sign-in', 'phone-update', 'fieldops-owner'));

-- ---------------------------------------------------------------------
-- fieldops_onboarding
-- ---------------------------------------------------------------------

create table public.fieldops_onboarding (
  id                         uuid        primary key default gen_random_uuid(),
  -- Also handed to create_place, so a retried submission can never create
  -- a second place: place.client_request_id = this value.
  client_request_id          uuid        not null unique default gen_random_uuid(),
  campaign_id                uuid        not null references public.fieldops_campaign (id) on delete restrict,
  team_id                    uuid        not null references public.fieldops_team (id) on delete restrict,
  member_id                  uuid        not null references public.fieldops_team_member (id) on delete restrict,
  member_user_id             uuid        not null,
  assignment_id              uuid        references public.fieldops_assignment (id) on delete set null,
  territory_id               uuid        references public.fieldops_territory (id) on delete set null,
  prospect_id                uuid        references public.fieldops_prospect (id) on delete set null,
  mode                       text        not null check (mode in ('offline', 'online')),
  kind                       text        not null default 'place' check (kind in ('place', 'event')),
  -- Derived at submission from kind + mode (or claim assistance, Phase 5).
  activity_key               text        check (activity_key is null or activity_key in (
                               'place_onboarding_offline', 'place_onboarding_online',
                               'event_onboarding_offline', 'event_onboarding_online',
                               'existing_place_claim_assist')),
  -- The business and its owner.
  business_name              text        check (business_name is null or length(business_name) <= 150),
  business_phone_e164        text        check (business_phone_e164 is null or business_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  business_whatsapp_e164     text        check (business_whatsapp_e164 is null or business_whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  owner_full_name            text        check (owner_full_name is null or length(owner_full_name) <= 120),
  owner_phone_e164           text        check (owner_phone_e164 is null or owner_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- The OTP-resolved auth.users id (no FK: history outlives the account).
  owner_user_id              uuid,
  owner_phone_verified_at    timestamptz,
  owner_is_new_account       boolean,
  owner_prior_places         integer     not null default 0,
  owner_prior_events         integer     not null default 0,
  -- The real entity.
  place_id                   uuid        references public.place (id) on delete set null,
  event_id                   uuid        references public.event (id) on delete set null,
  entity_created_at          timestamptz,
  -- Where the member was when they submitted (offline mode).
  submission_location        extensions.geography(Point, 4326),
  submission_lat             double precision generated always as (extensions.st_y(submission_location::extensions.geometry)) stored,
  submission_lng             double precision generated always as (extensions.st_x(submission_location::extensions.geometry)) stored,
  submission_accuracy_m      integer     check (submission_accuracy_m is null or submission_accuracy_m between 0 and 100000),
  -- Metres between the member's position and the place pin.
  submission_distance_m      integer     check (submission_distance_m is null or submission_distance_m >= 0),
  inside_territory           boolean,
  -- Duplicate guard: what the similarity search returned at submission and
  -- whether the member said "none of these".
  similar_matches            jsonb       not null default '[]'::jsonb check (jsonb_typeof(similar_matches) = 'array'),
  duplicate_acknowledged     boolean     not null default false,
  owner_duplicate_waived_by  uuid,
  owner_duplicate_waived_at  timestamptz,
  -- Lifecycle.
  status                     text        not null default 'draft' check (status in (
                               'draft', 'submitted', 'needs_changes', 'verified', 'flagged',
                               'succeeded', 'rejected', 'withdrawn')),
  submitted_at               timestamptz,
  resubmission_count         integer     not null default 0,
  reviewed_by                uuid,
  reviewed_at                timestamptz,
  review_decision            text        check (review_decision is null or review_decision in (
                               'verified', 'needs_changes', 'rejected')),
  review_note                text        check (review_note is null or length(review_note) <= 2000),
  overridden_by              uuid        references auth.users (id) on delete set null,
  overridden_at              timestamptz,
  override_note              text        check (override_note is null or length(override_note) <= 2000),
  -- Set at verification: the rule in force and when the holding period ends.
  rule_id                    uuid        references public.fieldops_commission_rule (id) on delete restrict,
  holding_until              timestamptz,
  flags                      text[]      not null default '{}',
  flag_details               jsonb       not null default '{}'::jsonb,
  succeeded_at               timestamptz,
  rejected_at                timestamptz,
  rejection_reason           text        check (rejection_reason is null or length(rejection_reason) <= 2000),
  withdrawn_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- The worker can never be the owner, and never their own reviewer.
  constraint fieldops_onboarding_owner_not_member check (owner_user_id is null or owner_user_id <> member_user_id),
  constraint fieldops_onboarding_reviewer_not_member check (reviewed_by is null or reviewed_by <> member_user_id),
  constraint fieldops_onboarding_one_entity check (
    (kind = 'place' and event_id is null) or (kind = 'event' and place_id is null))
);

comment on table public.fieldops_onboarding is
  'Field Ops: one onboarding of a business/event by a team member, from wizard start to review and (Phase 3) commission. The place/event itself is an ordinary row owned by the OTP-verified owner.';

-- A place or event is onboarded at most once (programme-wide).
create unique index fieldops_onboarding_place_once
  on public.fieldops_onboarding (place_id)
  where place_id is not null and status not in ('rejected', 'withdrawn');
create unique index fieldops_onboarding_event_once
  on public.fieldops_onboarding (event_id)
  where event_id is not null and status not in ('rejected', 'withdrawn');
-- One live onboarding per owner per campaign unless an admin waived it.
create unique index fieldops_onboarding_owner_once_per_campaign
  on public.fieldops_onboarding (campaign_id, owner_user_id)
  where owner_user_id is not null
    and status not in ('rejected', 'withdrawn')
    and owner_duplicate_waived_by is null;

create index idx_fieldops_onboarding_campaign_status on public.fieldops_onboarding (campaign_id, status, submitted_at desc);
create index idx_fieldops_onboarding_member on public.fieldops_onboarding (member_id, status);
create index idx_fieldops_onboarding_member_user on public.fieldops_onboarding (member_user_id, status);
create index idx_fieldops_onboarding_team on public.fieldops_onboarding (team_id, status);
create index idx_fieldops_onboarding_territory on public.fieldops_onboarding (territory_id, status);
create index idx_fieldops_onboarding_holding on public.fieldops_onboarding (holding_until) where status = 'verified';
create index idx_fieldops_onboarding_owner_phone on public.fieldops_onboarding (owner_phone_e164) where owner_phone_e164 is not null;
create index idx_fieldops_onboarding_owner_user on public.fieldops_onboarding (owner_user_id) where owner_user_id is not null;
create index idx_fieldops_onboarding_assignment on public.fieldops_onboarding (assignment_id);
create index idx_fieldops_onboarding_prospect on public.fieldops_onboarding (prospect_id);
create index idx_fieldops_onboarding_place on public.fieldops_onboarding (place_id);
create index idx_fieldops_onboarding_event on public.fieldops_onboarding (event_id);
create index idx_fieldops_onboarding_rule on public.fieldops_onboarding (rule_id);
create index idx_fieldops_onboarding_overridden_by on public.fieldops_onboarding (overridden_by);

create trigger fieldops_onboarding_touch before update on public.fieldops_onboarding
  for each row execute function public.fieldops_touch_updated_at();

-- Same membership integrity as assignments/prospects.
create function public.fieldops_onboarding_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member public.fieldops_team_member;
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
      raise exception 'Only an active member can onboard' using errcode = 'check_violation';
    end if;
    if v_member.role not in ('offline_member', 'online_member') then
      raise exception 'Only offline and online members onboard businesses' using errcode = 'check_violation';
    end if;
    if (v_member.role = 'offline_member') <> (new.mode = 'offline') then
      raise exception 'Onboarding mode must match the member''s role' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_onboarding_check() from public, anon, authenticated;

create trigger fieldops_onboarding_integrity
  before insert or update of member_id, member_user_id, team_id, campaign_id
  on public.fieldops_onboarding
  for each row execute function public.fieldops_onboarding_check();

-- A prospect that became an onboarding.
alter table public.fieldops_prospect
  add column onboarding_id uuid references public.fieldops_onboarding (id) on delete set null;
create index idx_fieldops_prospect_onboarding on public.fieldops_prospect (onboarding_id);

-- ---------------------------------------------------------------------
-- fieldops_onboarding_evidence: photos in the private fieldops-evidence
-- bucket (storefront, interior, owner consent). Key layout:
-- <campaign_id>/<onboarding_id>/<uuid>.<ext>
-- ---------------------------------------------------------------------

create table public.fieldops_onboarding_evidence (
  id                 uuid        primary key default gen_random_uuid(),
  onboarding_id      uuid        not null references public.fieldops_onboarding (id) on delete cascade,
  kind               text        not null check (kind in ('storefront', 'interior', 'owner_consent', 'other')),
  storage_path       text        not null unique,
  mime_type          text        check (mime_type is null or length(mime_type) <= 100),
  size_bytes         integer     check (size_bytes is null or size_bytes >= 0),
  captured_at        timestamptz,
  captured_location  extensions.geography(Point, 4326),
  captured_lat       double precision generated always as (extensions.st_y(captured_location::extensions.geometry)) stored,
  captured_lng       double precision generated always as (extensions.st_x(captured_location::extensions.geometry)) stored,
  accuracy_m         integer     check (accuracy_m is null or accuracy_m between 0 and 100000),
  uploaded_by        uuid        not null,
  -- Set once the service has seen the object in the bucket.
  uploaded_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_fieldops_onboarding_evidence_onboarding on public.fieldops_onboarding_evidence (onboarding_id, kind);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fieldops-evidence',
  'fieldops-evidence',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;
-- No storage.objects policies on purpose: uploads use service-issued signed
-- upload URLs, reads use short signed URLs, both minted only after the
-- service has checked the caller's membership.

-- ---------------------------------------------------------------------
-- fieldops_onboarding_event: append-only timeline
-- ---------------------------------------------------------------------

create table public.fieldops_onboarding_event (
  id             bigint      generated always as identity primary key,
  onboarding_id  uuid        not null references public.fieldops_onboarding (id) on delete cascade,
  from_status    text,
  to_status      text        not null,
  actor_user_id  uuid,
  actor_kind     text        not null check (actor_kind in ('member', 'lead', 'admin', 'system')),
  note           text        check (note is null or length(note) <= 2000),
  details        jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index idx_fieldops_onboarding_event_onboarding on public.fieldops_onboarding_event (onboarding_id, id);

create function public.fieldops_onboarding_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'fieldops_onboarding_event is append-only' using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.fieldops_onboarding_event_guard() from public, anon, authenticated;

create trigger fieldops_onboarding_event_append_only
  before update or delete on public.fieldops_onboarding_event
  for each row execute function public.fieldops_onboarding_event_guard();

-- ---------------------------------------------------------------------
-- fieldops_transition_onboarding: the one way a status changes. Locks the
-- row, checks the move against the lifecycle table, stamps the matching
-- timestamp, appends the timeline row. Business fields are written by the
-- service before calling this.
-- ---------------------------------------------------------------------

create function public.fieldops_transition_onboarding(
  p_onboarding_id uuid,
  p_to text,
  p_actor uuid,
  p_actor_kind text,
  p_note text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.fieldops_onboarding
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.fieldops_onboarding;
  v_from    text;
  v_allowed boolean;
begin
  select * into v_row from public.fieldops_onboarding where id = p_onboarding_id for update;
  if v_row.id is null then
    raise exception 'Onboarding not found' using errcode = 'P0002';
  end if;
  v_from := v_row.status;

  v_allowed := case v_from
    when 'draft'         then p_to in ('submitted', 'withdrawn')
    when 'submitted'     then p_to in ('verified', 'rejected', 'needs_changes', 'withdrawn')
    when 'needs_changes' then p_to in ('submitted', 'withdrawn')
    when 'verified'      then p_to in ('succeeded', 'flagged', 'rejected')
    when 'flagged'       then p_to in ('succeeded', 'rejected')
    else false
  end;
  if not v_allowed then
    raise exception 'An onboarding that is % cannot move to %', v_from, p_to
      using errcode = 'check_violation';
  end if;

  if p_to = 'submitted' and v_row.owner_user_id is null then
    raise exception 'The owner has not verified their phone yet' using errcode = 'check_violation';
  end if;
  if p_to in ('verified', 'rejected', 'needs_changes') and v_from = 'submitted'
     and p_actor = v_row.member_user_id then
    raise exception 'A member cannot review their own onboarding' using errcode = 'check_violation';
  end if;

  update public.fieldops_onboarding
  set status = p_to,
      submitted_at = case when p_to = 'submitted' then now() else submitted_at end,
      resubmission_count = case when p_to = 'submitted' and v_from = 'needs_changes'
                                then resubmission_count + 1 else resubmission_count end,
      reviewed_by = case when p_to in ('verified', 'rejected', 'needs_changes') and v_from = 'submitted'
                         then p_actor else reviewed_by end,
      reviewed_at = case when p_to in ('verified', 'rejected', 'needs_changes') and v_from = 'submitted'
                         then now() else reviewed_at end,
      review_decision = case when p_to in ('verified', 'rejected', 'needs_changes') and v_from = 'submitted'
                             then p_to else review_decision end,
      review_note = case when p_to in ('verified', 'rejected', 'needs_changes') and v_from = 'submitted'
                         then p_note else review_note end,
      succeeded_at = case when p_to = 'succeeded' then now() else succeeded_at end,
      rejected_at = case when p_to = 'rejected' then now() else rejected_at end,
      rejection_reason = case when p_to = 'rejected' then p_note else rejection_reason end,
      withdrawn_at = case when p_to = 'withdrawn' then now() else withdrawn_at end
  where id = p_onboarding_id
  returning * into v_row;

  insert into public.fieldops_onboarding_event (onboarding_id, from_status, to_status, actor_user_id, actor_kind, note, details)
  values (p_onboarding_id, v_from, p_to, p_actor, p_actor_kind, p_note, coalesce(p_details, '{}'::jsonb));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- fieldops_find_similar_places: existing listings that look like the
-- business being onboarded -- trigram name similarity within a radius, or
-- an exact phone / WhatsApp match anywhere.
-- ---------------------------------------------------------------------

create function public.fieldops_find_similar_places(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_phone text default null,
  p_whatsapp text default null,
  p_radius_m integer default 300,
  p_similarity numeric default 0.45,
  p_limit integer default 8
)
returns table (
  id          uuid,
  name        text,
  slug        text,
  status      text,
  owner_id    uuid,
  distance_m  integer,
  similarity  numeric,
  phone_match boolean,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with pt as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  digits as (
    select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as phone,
           nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '') as whatsapp
  )
  select p.id, p.name, p.slug, p.status, p.owner_id,
         extensions.st_distance(p.location, pt.g)::integer as distance_m,
         round(extensions.similarity(lower(p.name), lower(p_name))::numeric, 3) as similarity,
         (
           (d.phone is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.phone
                                     or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.phone))
           or (d.whatsapp is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.whatsapp
                                           or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.whatsapp))
         ) as phone_match,
         p.created_at
  from public.place p, pt, digits d
  where p.status <> 'archived'
    and (
      (extensions.st_dwithin(p.location, pt.g, p_radius_m)
       and extensions.similarity(lower(p.name), lower(p_name)) >= p_similarity)
      or (d.phone is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.phone
                                   or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.phone))
      or (d.whatsapp is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.whatsapp
                                      or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.whatsapp))
    )
  order by phone_match desc, similarity desc, distance_m asc
  limit greatest(1, least(p_limit, 25));
$$;

-- Whether a phone belongs to anyone on a Field Ops team (any campaign):
-- an "owner" with a team member's phone is the worker-owns-the-listing
-- fraud the programme refuses outright.
create function public.fieldops_phone_belongs_to_member(p_phone_e164 text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select regexp_replace(p_phone_e164, '\D', '', 'g') as digits)
  select exists (
    select 1
    from public.fieldops_team_member m, d
    where m.status in ('invited', 'active', 'suspended')
      and (
        regexp_replace(coalesce(m.invited_phone_e164, ''), '\D', '', 'g') = d.digits
        or exists (select 1 from auth.users u where u.id = m.user_id
                   and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = d.digits)
      )
  );
$$;

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------

alter table public.fieldops_onboarding enable row level security;
alter table public.fieldops_onboarding_evidence enable row level security;
alter table public.fieldops_onboarding_event enable row level security;

revoke all on table
  public.fieldops_onboarding, public.fieldops_onboarding_evidence, public.fieldops_onboarding_event
  from anon, authenticated;
grant all on table
  public.fieldops_onboarding, public.fieldops_onboarding_evidence
  to service_role;
grant select, insert on table public.fieldops_onboarding_event to service_role;
grant usage, select on sequence public.fieldops_onboarding_event_id_seq to service_role;

-- Members read their own onboardings (owner phone/user columns excluded:
-- after verification the owner's number is masked in the UI and the raw
-- value is only ever read by services), leads their team's.
grant select (id, client_request_id, campaign_id, team_id, member_id, member_user_id, assignment_id,
              territory_id, prospect_id, mode, kind, activity_key, business_name,
              owner_full_name, owner_is_new_account, place_id, event_id, entity_created_at,
              submission_lat, submission_lng, submission_accuracy_m, submission_distance_m,
              inside_territory, similar_matches, duplicate_acknowledged, status, submitted_at,
              resubmission_count, reviewed_at, review_decision, review_note, holding_until,
              flags, succeeded_at, rejected_at, rejection_reason, withdrawn_at, created_at, updated_at)
  on public.fieldops_onboarding to authenticated;

create policy fieldops_onboarding_self_or_lead_select on public.fieldops_onboarding
  for select to authenticated
  using (member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(team_id));

grant select (id, onboarding_id, kind, mime_type, size_bytes, captured_at, captured_lat, captured_lng,
              accuracy_m, uploaded_at, created_at)
  on public.fieldops_onboarding_evidence to authenticated;

create policy fieldops_onboarding_evidence_select on public.fieldops_onboarding_evidence
  for select to authenticated
  using (exists (
    select 1 from public.fieldops_onboarding o
    where o.id = fieldops_onboarding_evidence.onboarding_id
      and (o.member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(o.team_id))));

grant select on table public.fieldops_onboarding_event to authenticated;

create policy fieldops_onboarding_event_select on public.fieldops_onboarding_event
  for select to authenticated
  using (exists (
    select 1 from public.fieldops_onboarding o
    where o.id = fieldops_onboarding_event.onboarding_id
      and (o.member_user_id = (select auth.uid()) or public.fieldops_is_lead_of_team(o.team_id))));

revoke all on function public.fieldops_transition_onboarding(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fieldops_transition_onboarding(uuid, text, uuid, text, text, jsonb) to service_role;

revoke all on function public.fieldops_find_similar_places(text, double precision, double precision, text, text, integer, numeric, integer) from public, anon, authenticated;
grant execute on function public.fieldops_find_similar_places(text, double precision, double precision, text, text, integer, numeric, integer) to service_role;

revoke all on function public.fieldops_phone_belongs_to_member(text) from public, anon, authenticated;
grant execute on function public.fieldops_phone_belongs_to_member(text) to service_role;

-- Rollback (while nothing references these rows): drop the three tables,
-- the three functions, the prospect column, the bucket row, and restore
-- the two-value purpose CHECK.
