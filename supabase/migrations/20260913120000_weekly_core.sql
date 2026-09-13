-- Abonten Weekly: a recurring, editorial edition of events and places per
-- geographic scope (Ghana, then regional scopes such as Accra).
--
-- Model:
--   weekly_scope    where an edition applies: the whole country (centre null)
--                   or a centre point + radius. Ghana is seeded; regional
--                   scopes are added from the admin console, never hard-coded.
--   weekly_edition  one per scope per ISO week (week_start is a Monday;
--                   Ghana is UTC+0 with no DST, so an Accra calendar day is a
--                   UTC calendar day). draft -> scheduled -> published ->
--                   archived, with unpublish back to draft.
--   weekly_section  ordered sections of an edition (kind = template hint,
--                   layout = how clients render it).
--   weekly_item     ordered references to live event / place rows. Nothing
--                   about the event or place is copied: the document is
--                   assembled at read time and every item is re-checked, so a
--                   cancelled, hidden, archived, ended or permanently closed
--                   listing disappears from a published edition on the next
--                   read without any sync job.
--
-- Access: every table has RLS on and no anon/authenticated privileges. Every
-- function is service_role only. Public pages read through @abonten/services,
-- which checks weekly_program_setting (enabled + audience) and the
-- WEEKLY_KILL_SWITCH env flag before calling weekly_edition_view(). Admin
-- edits go through @abonten/services/admin/weekly with permission checks,
-- step-up for publish/configure, optimistic version checks
-- (weekly_claim_edit) and admin_audit_log entries.
--
-- Ships OFF: weekly_program_setting.enabled = false, audience 'staff'.
--
-- Jobs: weekly-publish-due (*/5, publishes scheduled editions whose time has
-- come; a failed validation opens an incident instead), weekly-housekeeping
-- (02:45 daily: drops items whose listing no longer exists, archives editions
-- older than edition_retention_weeks).

-- ---------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------
create table public.weekly_program_setting (
  id                            smallint    primary key default 1 check (id = 1),
  enabled                       boolean     not null default false,
  -- staff: active admin_user rows · beta: staff + beta_user_ids · all: everyone
  audience                      text        not null default 'staff'
                                  check (audience in ('staff', 'beta', 'all')),
  beta_user_ids                 uuid[]      not null default '{}',
  -- Show the "Abonten Weekly" teaser on Explore (web and app).
  teaser_enabled                boolean     not null default true,
  -- Default time offered when scheduling (Accra local hour on the week's Monday).
  default_publish_hour_local    smallint    not null default 6  check (default_publish_hour_local between 0 and 23),
  max_items_per_section         smallint    not null default 12 check (max_items_per_section between 1 and 30),
  -- Editor warnings (never block publishing).
  max_per_organizer_per_section smallint    not null default 1  check (max_per_organizer_per_section between 1 and 10),
  exposure_lookback_editions    smallint    not null default 2  check (exposure_lookback_editions between 0 and 12),
  edition_retention_weeks       integer     not null default 104 check (edition_retention_weeks between 4 and 520),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid
);

comment on table public.weekly_program_setting is
  'Abonten Weekly switches (one row). Ships off. Edited only from the admin console (service role); WEEKLY_KILL_SWITCH on the web deployment wins over it.';

insert into public.weekly_program_setting (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Scopes
-- ---------------------------------------------------------------------
create table public.weekly_scope (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique
                  check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'
                         and slug not in ('preview', 'archive', 'new')),
  name          text        not null check (length(btrim(name)) between 2 and 60),
  country_code  char(2)     not null default 'GH',
  -- null = the whole country
  centre        extensions.geography(Point, 4326),
  centre_lat    double precision generated always as (extensions.st_y(centre::extensions.geometry)) stored,
  centre_lng    double precision generated always as (extensions.st_x(centre::extensions.geometry)) stored,
  radius_km     numeric,
  status        text        not null default 'active' check (status in ('active', 'retired')),
  position      smallint    not null default 100,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint weekly_scope_shape check (
    (centre is null and radius_km is null)
    or (centre is not null and radius_km between 1 and 300)
  )
);

create unique index weekly_scope_one_national_per_country
  on public.weekly_scope (country_code) where centre is null;

comment on table public.weekly_scope is
  'Where an Abonten Weekly edition applies: a whole country (centre null) or a centre + radius. National scopes cannot be retired.';

insert into public.weekly_scope (slug, name, country_code, position)
values ('ghana', 'Ghana', 'GH', 0)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 3. Editions, sections, items
-- ---------------------------------------------------------------------
create table public.weekly_edition (
  id                          uuid        primary key default gen_random_uuid(),
  scope_id                    uuid        not null references public.weekly_scope (id) on delete restrict,
  week_start                  date        not null check (extract(isodow from week_start) = 1),
  status                      text        not null default 'draft'
                                check (status in ('draft', 'scheduled', 'published', 'archived')),
  title                       text        not null check (length(btrim(title)) between 1 and 80),
  subtitle                    text        check (length(subtitle) <= 160),
  intro                       text        check (length(intro) <= 600),
  scheduled_for               timestamptz,
  published_at                timestamptz,
  published_by                uuid,
  unpublished_at              timestamptz,
  archived_at                 timestamptz,
  duplicated_from_edition_id  uuid        references public.weekly_edition (id) on delete set null,
  -- Optimistic concurrency: every admin write claims the next version first
  -- (weekly_claim_edit) and is refused if someone else saved in between.
  version                     integer     not null default 1,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (scope_id, week_start),
  constraint weekly_edition_scheduled_has_time check (status <> 'scheduled' or scheduled_for is not null),
  constraint weekly_edition_published_has_time check (status <> 'published' or published_at is not null)
);

create index idx_weekly_edition_scope_status_week
  on public.weekly_edition (scope_id, status, week_start desc);
create index idx_weekly_edition_scheduled
  on public.weekly_edition (scheduled_for) where status = 'scheduled';

create table public.weekly_section (
  id             uuid        primary key default gen_random_uuid(),
  edition_id     uuid        not null references public.weekly_edition (id) on delete cascade,
  position       smallint    not null check (position >= 0),
  kind           text        not null default 'curated'
                   check (kind in ('editorial', 'curated', 'this_week', 'weekend', 'new', 'free',
                                   'trending', 'hidden_gems', 'nearby', 'category',
                                   'top_places', 'new_places', 'for_you')),
  subject_scope  text        not null default 'mixed' check (subject_scope in ('events', 'places', 'mixed')),
  layout         text        not null default 'carousel'
                   check (layout in ('hero', 'carousel', 'grid', 'list', 'editorial')),
  title          text        not null check (length(btrim(title)) between 1 and 80),
  subtitle       text        check (length(subtitle) <= 160),
  -- Clients map the key to an icon or emoji; no emoji is stored or hard-coded in SQL.
  icon_key       text        check (icon_key ~ '^[a-z_]{1,32}$'),
  -- Plain text for editorial sections. Never rendered as HTML.
  body           text        check (length(body) <= 1200),
  config         jsonb       not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  is_visible     boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint weekly_section_position_unique unique (edition_id, position) deferrable initially deferred
);

create index idx_weekly_section_edition on public.weekly_section (edition_id);

create table public.weekly_item (
  id            uuid        primary key default gen_random_uuid(),
  section_id    uuid        not null references public.weekly_section (id) on delete cascade,
  -- Denormalised for exposure and duplicate checks across an edition.
  edition_id    uuid        not null references public.weekly_edition (id) on delete cascade,
  position      smallint    not null check (position >= 0),
  -- 'organizer' is accepted by the schema for a later phase; clients ignore it.
  subject_type  text        not null check (subject_type in ('event', 'place', 'organizer')),
  -- No foreign key: the subject is polymorphic. Validity is computed at read
  -- time and weekly_housekeeping() removes items whose listing is gone.
  subject_id    uuid        not null,
  source        text        not null default 'manual' check (source in ('manual', 'suggested', 'auto')),
  pinned        boolean     not null default false,
  headline      text        check (length(headline) <= 80),
  blurb         text        check (length(blurb) <= 200),
  -- Internal ranking data (automated phases). Never returned to clients.
  score         numeric,
  score_breakdown jsonb,
  added_by      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint weekly_item_subject_once_per_section unique (section_id, subject_type, subject_id),
  constraint weekly_item_position_unique unique (section_id, position) deferrable initially deferred
);

create index idx_weekly_item_edition_subject on public.weekly_item (edition_id, subject_type, subject_id);
create index idx_weekly_item_subject on public.weekly_item (subject_type, subject_id);

comment on table public.weekly_edition is 'Abonten Weekly edition: one per scope per ISO week (Monday). Service role only.';
comment on table public.weekly_section is 'Ordered sections of an Abonten Weekly edition. Service role only.';
comment on table public.weekly_item is 'Ordered references to live events/places inside a weekly section. Nothing is copied from the listing. Service role only.';

do $$
declare
  t text;
begin
  foreach t in array array['weekly_program_setting', 'weekly_scope', 'weekly_edition', 'weekly_section', 'weekly_item'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

-- updated_at on every write
create or replace function public._weekly_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_weekly_scope_touch before update on public.weekly_scope
  for each row execute function public._weekly_touch_updated_at();
create trigger trg_weekly_edition_touch before update on public.weekly_edition
  for each row execute function public._weekly_touch_updated_at();
create trigger trg_weekly_section_touch before update on public.weekly_section
  for each row execute function public._weekly_touch_updated_at();
create trigger trg_weekly_item_touch before update on public.weekly_item
  for each row execute function public._weekly_touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Validity: why a listing must not appear right now (null = fine)
-- ---------------------------------------------------------------------
-- Reuses the same visibility rule as the discovery RPCs (published, not
-- archived, not hidden/removed, a session that has not ended) and the
-- moderation contract that 'restricted' content is not eligible for featuring.
-- p_allow_ended keeps ended events in editions whose week is over, so a
-- shared link to a past edition still reads as a record of that week.
create or replace function public.weekly_subject_validity(
  p_subject_type text,
  p_subject_id   uuid,
  p_as_of        timestamptz default now(),
  p_allow_ended  boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_place record;
  v_live  boolean;
begin
  if p_subject_type = 'event' then
    select e.status, e.archived_at, e.moderation_state, e.starts_at, e.ends_at
      into v_event
    from public.event e
    where e.id = p_subject_id;

    if not found then return 'missing'; end if;
    if v_event.status = 'canceled' then return 'canceled'; end if;
    if v_event.moderation_state = 'removed' then return 'removed'; end if;
    if v_event.moderation_state = 'hidden' then return 'hidden'; end if;
    if v_event.moderation_state = 'restricted' then return 'restricted'; end if;
    if v_event.archived_at is not null then return 'archived'; end if;
    if v_event.status = 'completed' then
      return case when p_allow_ended then null else 'ended' end;
    end if;
    if v_event.status <> 'published' then return 'not_published'; end if;

    if not p_allow_ended then
      select
        exists (select 1 from public.event_occurrence o
                where o.event_id = p_subject_id and o.ends_at > p_as_of)
        or (
          not exists (select 1 from public.event_occurrence o where o.event_id = p_subject_id)
          and (v_event.ends_at > p_as_of or (v_event.ends_at is null and v_event.starts_at > p_as_of))
        )
      into v_live;
      if not v_live then return 'ended'; end if;
    end if;
    return null;

  elsif p_subject_type = 'place' then
    select p.status, p.moderation_state, p.temporary_status
      into v_place
    from public.place p
    where p.id = p_subject_id;

    if not found then return 'missing'; end if;
    if v_place.moderation_state = 'removed' then return 'removed'; end if;
    if v_place.moderation_state = 'hidden' then return 'hidden'; end if;
    if v_place.moderation_state = 'restricted' then return 'restricted'; end if;
    if v_place.status = 'archived' then return 'archived'; end if;
    if v_place.status <> 'published' then return 'not_published'; end if;
    if v_place.temporary_status = 'permanently_closed' then return 'permanently_closed'; end if;
    return null;
  end if;

  return 'unsupported';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. The edition document
-- ---------------------------------------------------------------------
-- One call assembles the whole edition: two set-based reads (events, places)
-- regardless of how many items there are. Event and place objects use the
-- same column names as get_nearby_events / get_nearby_places so the existing
-- cards render them unchanged.
--
-- p_admin = false (public): hidden and for_you sections are dropped, invalid
-- items are dropped, sections left with nothing to show are dropped, and no
-- internal field (source, pinned, validity, scores, actor ids) is returned.
-- p_admin = true: everything, with each item's validity reason.
create or replace function public.weekly_edition_document(
  p_edition_id uuid,
  p_admin      boolean default false,
  p_as_of      timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ed          record;
  v_week_over   boolean;
  v_sections    jsonb;
begin
  select ed.*, s.slug as scope_slug, s.name as scope_name, (s.centre is null) as scope_is_national,
         s.centre_lat as scope_lat, s.centre_lng as scope_lng, s.radius_km as scope_radius_km
    into v_ed
  from public.weekly_edition ed
  join public.weekly_scope s on s.id = ed.scope_id
  where ed.id = p_edition_id;

  if not found then
    return null;
  end if;

  v_week_over := ((v_ed.week_start + 7)::timestamp at time zone 'Africa/Accra') <= p_as_of;

  with items as (
    select i.*,
           public.weekly_subject_validity(i.subject_type, i.subject_id, p_as_of, v_week_over) as validity
    from public.weekly_item i
    where i.edition_id = p_edition_id
  ),
  ev as (
    select e.id,
      jsonb_build_object(
        'id', e.id,
        'organizer_id', e.organizer_id,
        'event_category', e.event_category,
        'event_type', e.event_type,
        'title', e.title,
        'slug', e.slug,
        'address', e.address,
        'website_url', e.website_url,
        'capacity', e.capacity,
        'flyer_public_id', e.flyer_public_id,
        'flyer_version', e.flyer_version,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'status', e.status,
        'created_at', e.created_at,
        'event_code', e.event_code,
        'min_price', tickets.min_price,
        'currency', tickets.currency,
        'ticket_types', coalesce(tickets.ticket_types, '[]'::jsonb),
        'occurrences', occ.occurrences,
        'featured', e.featured,
        'attendance_count', coalesce(att.attendance_count, 0),
        'organizer_username', u.username,
        'organizer_verified', coalesce(u.organizer_verified, false)
      ) as data
    from public.event e
    left join public.user_info u on u.id = e.organizer_id
    left join lateral (
      select min(tt.price) as min_price,
             min(tt.currency) as currency,
             jsonb_agg(jsonb_build_object('price', tt.price, 'currency', tt.currency, 'quantity', tt.quantity)
                       order by tt.price asc) as ticket_types
      from public.ticket_type tt
      where tt.event_id = e.id
    ) tickets on true
    left join lateral (
      select sum(a.number_of_tickets) as attendance_count
      from public.attendance a
      where a.event_id = e.id and a.status = 'attending'
    ) att on true
    left join lateral (
      select case
               when count(*) > 0 then
                 jsonb_agg(jsonb_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
                           order by o.starts_at asc)
               else
                 jsonb_build_array(jsonb_build_object('id', null, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
             end as occurrences
      from public.event_occurrence o
      where o.event_id = e.id
    ) occ on true
    where e.id in (select it.subject_id from items it where it.subject_type = 'event')
  ),
  pl as (
    select p.id,
      jsonb_build_object(
        'id', p.id,
        'owner_id', p.owner_id,
        'name', p.name,
        'slug', p.slug,
        'category_id', p.category_id,
        'category_name', pc.name,
        'category_slug', pc.slug,
        'address', p.address,
        'cover_public_id', p.cover_public_id,
        'cover_version', p.cover_version,
        'status', p.status,
        'temporary_status', p.temporary_status,
        'claimed', p.claimed,
        'verified', p.verified,
        'created_at', p.created_at,
        'avg_rating', reviews.avg_rating,
        'review_count', coalesce(reviews.review_count, 0),
        'is_open', public.place_is_open_now(p.id, p_as_of)
      ) as data
    from public.place p
    join public.place_category pc on pc.id = p.category_id
    left join lateral (
      select avg(r.rating)::numeric(3, 2) as avg_rating, count(*) as review_count
      from public.place_review r
      where r.place_id = p.id
        and r.status = 'approved'
        and r.moderation_state is distinct from 'hidden'
        and r.moderation_state is distinct from 'removed'
    ) reviews on true
    where p.id in (select it.subject_id from items it where it.subject_type = 'place')
  ),
  item_json as (
    select it.section_id, it.position,
      jsonb_build_object(
        'id', it.id,
        'position', it.position,
        'subjectType', it.subject_type,
        'subjectId', it.subject_id,
        'headline', it.headline,
        'blurb', it.blurb,
        'event', ev.data,
        'place', pl.data
      )
      || case when p_admin then jsonb_build_object(
           'source', it.source,
           'pinned', it.pinned,
           'validity', it.validity,
           'score', it.score,
           'createdAt', it.created_at
         ) else '{}'::jsonb end as j
    from items it
    left join ev on it.subject_type = 'event' and ev.id = it.subject_id
    left join pl on it.subject_type = 'place' and pl.id = it.subject_id
    where p_admin
       or (it.validity is null and it.subject_type in ('event', 'place') and coalesce(ev.data, pl.data) is not null)
  ),
  sec as (
    select s.position, s.kind, s.body,
      (select count(*) from item_json ij where ij.section_id = s.id) as item_count,
      jsonb_build_object(
        'id', s.id,
        'position', s.position,
        'kind', s.kind,
        'subjectScope', s.subject_scope,
        'layout', s.layout,
        'title', s.title,
        'subtitle', s.subtitle,
        'iconKey', s.icon_key,
        'body', s.body,
        'items', coalesce((select jsonb_agg(ij.j order by ij.position) from item_json ij where ij.section_id = s.id), '[]'::jsonb)
      )
      || case when p_admin then jsonb_build_object(
           'isVisible', s.is_visible,
           'config', s.config,
           'updatedAt', s.updated_at
         ) else '{}'::jsonb end as j
    from public.weekly_section s
    where s.edition_id = p_edition_id
      and (p_admin or (s.is_visible and s.kind <> 'for_you'))
  )
  select coalesce(jsonb_agg(sec.j order by sec.position), '[]'::jsonb)
    into v_sections
  from sec
  where p_admin
     or sec.item_count > 0
     or (sec.kind = 'editorial' and nullif(btrim(coalesce(sec.body, '')), '') is not null);

  return jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_ed.id,
      'scopeSlug', v_ed.scope_slug,
      'scopeName', v_ed.scope_name,
      'scopeIsNational', v_ed.scope_is_national,
      'weekStart', v_ed.week_start,
      'weekEnd', v_ed.week_start + 6,
      'title', v_ed.title,
      'subtitle', v_ed.subtitle,
      'intro', v_ed.intro,
      'publishedAt', v_ed.published_at,
      'weekIsOver', v_week_over
    )
    || case when p_admin then jsonb_build_object(
         'scopeId', v_ed.scope_id,
         'scopeLat', v_ed.scope_lat,
         'scopeLng', v_ed.scope_lng,
         'scopeRadiusKm', v_ed.scope_radius_km,
         'status', v_ed.status,
         'scheduledFor', v_ed.scheduled_for,
         'unpublishedAt', v_ed.unpublished_at,
         'archivedAt', v_ed.archived_at,
         'version', v_ed.version,
         'duplicatedFromEditionId', v_ed.duplicated_from_edition_id,
         'createdAt', v_ed.created_at,
         'updatedAt', v_ed.updated_at
       ) else '{}'::jsonb end,
    'sections', v_sections
  );
end;
$$;

-- Does a public document have anything to show?
create or replace function public._weekly_document_has_content(p_doc jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_doc is not null
     and exists (
       select 1 from jsonb_array_elements(p_doc -> 'sections') s
       where jsonb_array_length(s -> 'items') > 0
     );
$$;

-- ---------------------------------------------------------------------
-- 6. Reading an edition (called by @abonten/services after the programme,
--    audience and kill-switch checks)
-- ---------------------------------------------------------------------
-- p_week_start given: exactly that published edition of that scope (no
-- fallback), or null.
-- p_week_start null ("current"): the first candidate with something to show,
-- in this order: the scope this week, the national scope this week, the scope
-- last week, the national scope last week. The result says which one it is,
-- so a regional page never labels national picks as local.
create or replace function public.weekly_edition_view(
  p_scope_slug  text,
  p_week_start  date default null,
  p_as_of       timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today     date := (p_as_of at time zone 'Africa/Accra')::date;
  v_monday    date := v_today - (extract(isodow from v_today)::int - 1);
  v_scope     public.weekly_scope;
  v_national  public.weekly_scope;
  v_edition   uuid;
  v_doc       jsonb;
  v_candidate record;
begin
  -- A null slug means the national scope. An unknown or retired slug returns
  -- null (the page says the edition is unavailable) rather than quietly
  -- serving national picks under a regional address.
  if p_scope_slug is not null then
    select * into v_scope from public.weekly_scope
    where slug = lower(btrim(p_scope_slug)) and status = 'active';
    if v_scope.id is null then
      return null;
    end if;
  else
    select * into v_scope from public.weekly_scope
    where centre is null and status = 'active' and country_code = 'GH';
  end if;

  if p_week_start is not null then
    if v_scope.id is null then
      return null;
    end if;
    select ed.id into v_edition
    from public.weekly_edition ed
    where ed.scope_id = v_scope.id and ed.week_start = p_week_start and ed.status = 'published';
    if v_edition is null then
      return null;
    end if;
    v_doc := public.weekly_edition_document(v_edition, false, p_as_of);
    if not public._weekly_document_has_content(v_doc) then
      return null;
    end if;
    return v_doc || jsonb_build_object(
      'requestedScope', v_scope.slug, 'isFallbackScope', false, 'isPreviousWeek', false, 'isCurrent', p_week_start = v_monday);
  end if;

  select * into v_national from public.weekly_scope
  where centre is null and status = 'active'
    and country_code = coalesce(v_scope.country_code, 'GH')
  limit 1;

  for v_candidate in
    select c.scope_id, c.week_start, c.is_fallback, c.is_previous
    from (values
      (v_scope.id,    v_monday,     false, false, 1),
      (v_national.id, v_monday,     true,  false, 2),
      (v_scope.id,    v_monday - 7, false, true,  3),
      (v_national.id, v_monday - 7, true,  true,  4)
    ) as c(scope_id, week_start, is_fallback, is_previous, ord)
    where c.scope_id is not null
    order by c.ord
  loop
    -- The national scope asked for directly is not a fallback.
    continue when v_candidate.is_fallback and v_candidate.scope_id = v_scope.id;

    select ed.id into v_edition
    from public.weekly_edition ed
    where ed.scope_id = v_candidate.scope_id
      and ed.week_start = v_candidate.week_start
      and ed.status = 'published';

    if v_edition is not null then
      v_doc := public.weekly_edition_document(v_edition, false, p_as_of);
      if public._weekly_document_has_content(v_doc) then
        return v_doc || jsonb_build_object(
          'requestedScope', coalesce(v_scope.slug, v_national.slug),
          'isFallbackScope', v_candidate.is_fallback and v_scope.id is not null and v_scope.id <> v_national.id,
          'isPreviousWeek', v_candidate.is_previous,
          'isCurrent', true);
      end if;
    end if;
    v_edition := null;
  end loop;

  return null;
end;
$$;

-- Smallest active regional scope containing the point, else the national one.
create or replace function public.weekly_resolve_scope(
  p_lat double precision,
  p_lng double precision
)
returns table (slug text, name text, is_national boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, s.name, s.centre is null
  from public.weekly_scope s
  where s.status = 'active'
    and (
      s.centre is null
      or (
        p_lat is not null and p_lng is not null
        and extensions.st_dwithin(
          s.centre,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          s.radius_km * 1000)
      )
    )
  order by (s.centre is null) asc, s.radius_km asc nulls last, s.position asc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 7. Editing
-- ---------------------------------------------------------------------
-- Claim the next version of an edition before changing it. Returns the new
-- version, or raises 'weekly_version_conflict' (P0001 with that message) when
-- someone saved in between, or 'weekly_edition_archived' for archived ones.
create or replace function public.weekly_claim_edit(
  p_edition_id        uuid,
  p_expected_version  integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status  text;
  v_version integer;
begin
  select status, version into v_status, v_version
  from public.weekly_edition where id = p_edition_id
  for update;

  if not found then
    raise exception 'weekly_edition_not_found';
  end if;
  if v_version <> p_expected_version then
    raise exception 'weekly_version_conflict';
  end if;
  if v_status = 'archived' then
    raise exception 'weekly_edition_archived';
  end if;

  update public.weekly_edition
  set version = version + 1
  where id = p_edition_id
  returning version into v_version;

  return v_version;
end;
$$;

-- Create an edition, optionally copying another edition's sections and
-- items (pins are cleared, sources kept) in one transaction.
create or replace function public.weekly_edition_create(
  p_actor           uuid,
  p_scope_id        uuid,
  p_week_start      date,
  p_title           text,
  p_subtitle        text default null,
  p_intro           text default null,
  p_duplicate_from  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_section record;
  v_new_sec uuid;
begin
  if not exists (select 1 from public.weekly_scope where id = p_scope_id and status = 'active') then
    raise exception 'weekly_scope_inactive';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'weekly_week_not_monday';
  end if;
  if exists (select 1 from public.weekly_edition where scope_id = p_scope_id and week_start = p_week_start) then
    raise exception 'weekly_edition_exists';
  end if;
  if p_duplicate_from is not null
     and not exists (select 1 from public.weekly_edition where id = p_duplicate_from) then
    raise exception 'weekly_edition_not_found';
  end if;

  insert into public.weekly_edition (scope_id, week_start, title, subtitle, intro, created_by, duplicated_from_edition_id)
  values (p_scope_id, p_week_start, btrim(p_title), nullif(btrim(p_subtitle), ''), nullif(btrim(p_intro), ''),
          p_actor, p_duplicate_from)
  returning id into v_id;

  if p_duplicate_from is not null then
    for v_section in
      select * from public.weekly_section where edition_id = p_duplicate_from order by position
    loop
      insert into public.weekly_section (edition_id, position, kind, subject_scope, layout, title, subtitle,
                                         icon_key, body, config, is_visible)
      values (v_id, v_section.position, v_section.kind, v_section.subject_scope, v_section.layout,
              v_section.title, v_section.subtitle, v_section.icon_key, v_section.body, v_section.config,
              v_section.is_visible)
      returning id into v_new_sec;

      insert into public.weekly_item (section_id, edition_id, position, subject_type, subject_id, source,
                                      pinned, headline, blurb, added_by)
      select v_new_sec, v_id, i.position, i.subject_type, i.subject_id, i.source, false, i.headline, i.blurb, p_actor
      from public.weekly_item i
      where i.section_id = v_section.id;
    end loop;
  end if;

  return v_id;
end;
$$;

-- Renumber sections of an edition to exactly the given order (all of them).
create or replace function public.weekly_sections_reorder(
  p_edition_id  uuid,
  p_section_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.weekly_section where edition_id = p_edition_id;
  if v_count <> coalesce(array_length(p_section_ids, 1), 0)
     or v_count <> (select count(distinct x) from unnest(p_section_ids) x)
     or exists (select 1 from unnest(p_section_ids) x
                where not exists (select 1 from public.weekly_section s where s.id = x and s.edition_id = p_edition_id)) then
    raise exception 'weekly_reorder_mismatch';
  end if;

  update public.weekly_section s
  set position = (o.ord - 1)::smallint
  from unnest(p_section_ids) with ordinality as o(id, ord)
  where s.id = o.id and s.edition_id = p_edition_id;
end;
$$;

-- Renumber items of a section to exactly the given order (all of them).
create or replace function public.weekly_items_reorder(
  p_section_id uuid,
  p_item_ids   uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.weekly_item where section_id = p_section_id;
  if v_count <> coalesce(array_length(p_item_ids, 1), 0)
     or v_count <> (select count(distinct x) from unnest(p_item_ids) x)
     or exists (select 1 from unnest(p_item_ids) x
                where not exists (select 1 from public.weekly_item i where i.id = x and i.section_id = p_section_id)) then
    raise exception 'weekly_reorder_mismatch';
  end if;

  update public.weekly_item i
  set position = (o.ord - 1)::smallint
  from unnest(p_item_ids) with ordinality as o(id, ord)
  where i.id = o.id and i.section_id = p_section_id;
end;
$$;

-- Move an item to another section of the same edition (appended at the end).
create or replace function public.weekly_item_move(
  p_item_id        uuid,
  p_to_section_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.weekly_item;
  v_edition uuid;
  v_next    smallint;
begin
  select * into v_item from public.weekly_item where id = p_item_id for update;
  if not found then raise exception 'weekly_item_not_found'; end if;

  select edition_id into v_edition from public.weekly_section where id = p_to_section_id;
  if v_edition is distinct from v_item.edition_id then
    raise exception 'weekly_section_not_in_edition';
  end if;
  if v_item.section_id = p_to_section_id then
    return;
  end if;
  if exists (select 1 from public.weekly_item
             where section_id = p_to_section_id and subject_type = v_item.subject_type and subject_id = v_item.subject_id) then
    raise exception 'weekly_item_duplicate';
  end if;

  select coalesce(max(position) + 1, 0) into v_next from public.weekly_item where section_id = p_to_section_id;

  update public.weekly_item set section_id = p_to_section_id, position = v_next where id = p_item_id;

  -- Close the gap in the section it left.
  update public.weekly_item i
  set position = (r.rn - 1)::smallint
  from (select id, row_number() over (order by position, created_at) as rn
        from public.weekly_item where section_id = v_item.section_id) r
  where i.id = r.id and i.position <> (r.rn - 1);
end;
$$;

-- Everything an editor needs to know before publishing. Blocking problems go
-- in "errors"; the rest are "warnings" (never block).
create or replace function public.weekly_edition_validation(
  p_edition_id uuid,
  p_as_of      timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ed          record;
  v_settings    public.weekly_program_setting;
  v_week_over   boolean;
  v_errors      jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_valid_items integer;
  v_invalid     jsonb;
  v_dupes       jsonb;
  v_org         jsonb;
  v_exposure    jsonb;
  v_empty       jsonb;
begin
  select ed.*, s.status as scope_status, s.id as sid
    into v_ed
  from public.weekly_edition ed join public.weekly_scope s on s.id = ed.scope_id
  where ed.id = p_edition_id;
  if not found then
    return null;
  end if;

  select * into v_settings from public.weekly_program_setting where id = 1;
  v_week_over := ((v_ed.week_start + 7)::timestamp at time zone 'Africa/Accra') <= p_as_of;

  if v_ed.scope_status <> 'active' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'scope_retired'));
  end if;
  if v_week_over then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'week_over'));
  end if;

  with items as (
    select i.*, s.is_visible, s.kind,
           public.weekly_subject_validity(i.subject_type, i.subject_id, p_as_of, false) as validity
    from public.weekly_item i
    join public.weekly_section s on s.id = i.section_id
    where i.edition_id = p_edition_id
  )
  select
    (select count(*) from items where validity is null and is_visible and kind <> 'for_you'
        and subject_type in ('event', 'place')),
    coalesce((select jsonb_agg(jsonb_build_object('itemId', id, 'sectionId', section_id, 'subjectType', subject_type,
                                                  'subjectId', subject_id, 'reason', validity))
              from items where validity is not null), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('subjectType', subject_type, 'subjectId', subject_id, 'sections', n))
              from (select subject_type, subject_id, count(*) as n from items
                    group by subject_type, subject_id having count(*) > 1) d), '[]'::jsonb)
  into v_valid_items, v_invalid, v_dupes;

  if v_valid_items = 0 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'no_valid_items'));
  end if;
  if jsonb_array_length(v_invalid) > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'invalid_items', 'items', v_invalid));
  end if;
  if jsonb_array_length(v_dupes) > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'duplicate_subjects', 'subjects', v_dupes));
  end if;

  -- More events from one organizer in a section than the setting allows.
  select coalesce(jsonb_agg(jsonb_build_object('sectionId', section_id, 'organizerId', organizer_id, 'events', n)), '[]'::jsonb)
    into v_org
  from (
    select i.section_id, e.organizer_id, count(*) as n
    from public.weekly_item i
    join public.event e on i.subject_type = 'event' and e.id = i.subject_id
    where i.edition_id = p_edition_id
    group by i.section_id, e.organizer_id
    having count(*) > coalesce(v_settings.max_per_organizer_per_section, 1)
  ) o;
  if jsonb_array_length(v_org) > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'organizer_concentration', 'groups', v_org));
  end if;

  -- Listings that were in this scope's recent editions.
  if coalesce(v_settings.exposure_lookback_editions, 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('subjectType', x.subject_type, 'subjectId', x.subject_id, 'editions', x.n)), '[]'::jsonb)
      into v_exposure
    from (
      select i.subject_type, i.subject_id, count(distinct prev.id) as n
      from public.weekly_item i
      join public.weekly_item pi on pi.subject_type = i.subject_type and pi.subject_id = i.subject_id
      join (
        select ed.id from public.weekly_edition ed
        where ed.scope_id = v_ed.scope_id
          and ed.week_start < v_ed.week_start
          and ed.status in ('published', 'archived')
        order by ed.week_start desc
        limit v_settings.exposure_lookback_editions
      ) prev on prev.id = pi.edition_id
      where i.edition_id = p_edition_id
      group by i.subject_type, i.subject_id
    ) x;
    if jsonb_array_length(v_exposure) > 0 then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'recently_featured', 'subjects', v_exposure));
    end if;
  end if;

  select coalesce(jsonb_agg(s.id), '[]'::jsonb) into v_empty
  from public.weekly_section s
  where s.edition_id = p_edition_id
    and s.is_visible
    and s.kind <> 'editorial'
    and not exists (select 1 from public.weekly_item i where i.section_id = s.id);
  if jsonb_array_length(v_empty) > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'empty_sections', 'sectionIds', v_empty));
  end if;

  return jsonb_build_object(
    'canPublish', jsonb_array_length(v_errors) = 0,
    'validItems', v_valid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
end;
$$;

-- The one state machine for editions. Actions:
--   schedule   draft -> scheduled      (validation must pass; time in the future)
--   unschedule scheduled -> draft
--   publish    draft|scheduled -> published (validation must pass)
--   unpublish  published -> draft
--   archive    draft|scheduled|published -> archived
--   restore    archived -> draft
-- p_expected_version null is used only by the scheduler (it has no page open).
-- Writes one admin_audit_log row per successful transition.
create or replace function public.weekly_edition_transition(
  p_actor             uuid,
  p_actor_roles       text[],
  p_edition_id        uuid,
  p_action            text,
  p_expected_version  integer,
  p_scheduled_for     timestamptz default null,
  p_reason            text default null,
  p_request_meta      jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ed          public.weekly_edition;
  v_validation  jsonb;
  v_new_status  text;
begin
  select * into v_ed from public.weekly_edition where id = p_edition_id for update;
  if not found then
    raise exception 'weekly_edition_not_found';
  end if;
  if p_expected_version is not null and v_ed.version <> p_expected_version then
    raise exception 'weekly_version_conflict';
  end if;

  v_new_status := case p_action
    when 'schedule'   then case when v_ed.status = 'draft' then 'scheduled' end
    when 'unschedule' then case when v_ed.status = 'scheduled' then 'draft' end
    when 'publish'    then case when v_ed.status in ('draft', 'scheduled') then 'published' end
    when 'unpublish'  then case when v_ed.status = 'published' then 'draft' end
    when 'archive'    then case when v_ed.status in ('draft', 'scheduled', 'published') then 'archived' end
    when 'restore'    then case when v_ed.status = 'archived' then 'draft' end
  end;

  if v_new_status is null then
    raise exception 'weekly_invalid_transition';
  end if;

  if p_action in ('schedule', 'publish') then
    v_validation := public.weekly_edition_validation(p_edition_id);
    if not (v_validation ->> 'canPublish')::boolean then
      return jsonb_build_object('ok', false, 'validation', v_validation, 'version', v_ed.version, 'status', v_ed.status);
    end if;
  end if;

  if p_action = 'schedule' and (p_scheduled_for is null or p_scheduled_for <= now()) then
    raise exception 'weekly_schedule_in_past';
  end if;

  update public.weekly_edition
  set status         = v_new_status,
      version        = version + 1,
      scheduled_for  = case when p_action = 'schedule' then p_scheduled_for
                            when v_new_status in ('draft', 'archived') then null
                            else scheduled_for end,
      published_at   = case when p_action = 'publish' then now() else published_at end,
      published_by   = case when p_action = 'publish' then p_actor else published_by end,
      unpublished_at = case when p_action = 'unpublish' then now() else unpublished_at end,
      archived_at    = case when p_action = 'archive' then now() when p_action = 'restore' then null else archived_at end
  where id = p_edition_id
  returning * into v_ed;

  insert into public.admin_audit_log (actor_id, actor_roles, action, target_type, target_id, summary, reason,
                                      before, after, request_meta)
  values (
    p_actor,
    coalesce(p_actor_roles, case when p_actor is null then array['system'] else '{}'::text[] end),
    'weekly.edition.' || p_action,
    'weekly_edition',
    p_edition_id::text,
    format('Abonten Weekly %s (%s): %s', p_action, v_ed.week_start, v_ed.title),
    nullif(btrim(p_reason), ''),
    null,
    jsonb_build_object('status', v_ed.status, 'scheduledFor', v_ed.scheduled_for, 'version', v_ed.version),
    p_request_meta
  );

  return jsonb_build_object('ok', true, 'validation', v_validation, 'version', v_ed.version, 'status', v_ed.status);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Jobs
-- ---------------------------------------------------------------------
-- Publish scheduled editions whose time has come. An edition that fails
-- validation at that moment stays scheduled and opens (or keeps open) an
-- incident, which Admin > Monitoring shows.
create or replace function public.weekly_publish_due()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ed        record;
  v_result    jsonb;
  v_published integer := 0;
  v_failed    integer := 0;
  v_title     text;
begin
  for v_ed in
    select ed.id, ed.week_start, ed.title, s.name as scope_name
    from public.weekly_edition ed
    join public.weekly_scope s on s.id = ed.scope_id
    where ed.status = 'scheduled' and ed.scheduled_for <= now()
    order by ed.scheduled_for
    limit 50
  loop
    begin
      v_result := public.weekly_edition_transition(null, null, v_ed.id, 'publish', null, null,
                                                   'Scheduled publication', null);
    exception when others then
      v_result := jsonb_build_object('ok', false, 'error', sqlerrm);
    end;

    if (v_result ->> 'ok')::boolean then
      v_published := v_published + 1;
    else
      v_failed := v_failed + 1;
      v_title := format('Abonten Weekly did not publish: %s, week of %s', v_ed.scope_name, v_ed.week_start);
      if not exists (select 1 from public.incident where title = v_title and status <> 'resolved') then
        insert into public.incident (title, severity, component, summary)
        values (v_title, 'medium', 'weekly',
                format('The scheduled edition "%s" failed its checks and is still scheduled. Open Admin > Weekly to fix it. Details: %s',
                       v_ed.title, coalesce(v_result -> 'validation' ->> 'errors', v_result ->> 'error')));
      end if;
    end if;
  end loop;

  return jsonb_build_object('published', v_published, 'failed', v_failed);
end;
$$;

-- Daily: remove items whose listing was deleted, archive old editions.
create or replace function public.weekly_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orphans  integer;
  v_archived integer;
  v_weeks    integer;
begin
  delete from public.weekly_item i
  where (i.subject_type = 'event' and not exists (select 1 from public.event e where e.id = i.subject_id))
     or (i.subject_type = 'place' and not exists (select 1 from public.place p where p.id = i.subject_id))
     or (i.subject_type = 'organizer' and not exists (select 1 from public.user_info u where u.id = i.subject_id));
  get diagnostics v_orphans = row_count;

  select edition_retention_weeks into v_weeks from public.weekly_program_setting where id = 1;

  update public.weekly_edition
  set status = 'archived', archived_at = now(), scheduled_for = null, version = version + 1
  where status in ('draft', 'published')
    and week_start < (now() at time zone 'Africa/Accra')::date - (coalesce(v_weeks, 104) * 7);
  get diagnostics v_archived = row_count;

  return jsonb_build_object('orphanItemsRemoved', v_orphans, 'editionsArchived', v_archived);
end;
$$;

-- For Admin > Monitoring (the "weekly" health check). A switched-off
-- programme is healthy by definition. When it is on, it is unhealthy if a
-- scheduled edition is more than 15 minutes late (the job failed or refused
-- it), or if no Ghana-wide edition is published for this week by 09:00 Accra
-- on Monday.
create or replace function public.weekly_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with now_accra as (
    select (now() at time zone 'Africa/Accra') as ts
  ), wk as (
    select ts::date - (extract(isodow from ts)::int - 1) as monday,
           extract(epoch from ts - date_trunc('week', ts)) / 3600 as hours_into_week
    from now_accra
  )
  select jsonb_build_object(
    'enabled', coalesce((select s.enabled from public.weekly_program_setting s where s.id = 1), false),
    'audience', (select s.audience from public.weekly_program_setting s where s.id = 1),
    'week_start', (select monday from wk),
    'hours_into_week', round((select hours_into_week from wk)::numeric, 1),
    'national_published', exists (
      select 1 from public.weekly_edition e
      join public.weekly_scope s on s.id = e.scope_id
      where s.centre is null and s.status = 'active'
        and e.week_start = (select monday from wk)
        and e.status = 'published'),
    'scheduled_overdue', (
      select count(*) from public.weekly_edition e
      where e.status = 'scheduled' and e.scheduled_for < now() - interval '15 minutes'),
    'open_incidents', (
      select count(*) from public.incident i
      where i.component = 'weekly' and i.status <> 'resolved')
  );
$$;

-- ---------------------------------------------------------------------
-- 9. Grants, permissions, schedules
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._weekly_touch_updated_at()',
    'public._weekly_document_has_content(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;

  foreach fn in array array[
    'public.weekly_subject_validity(text, uuid, timestamptz, boolean)',
    'public.weekly_edition_document(uuid, boolean, timestamptz)',
    'public.weekly_edition_view(text, date, timestamptz)',
    'public.weekly_resolve_scope(double precision, double precision)',
    'public.weekly_claim_edit(uuid, integer)',
    'public.weekly_edition_create(uuid, uuid, date, text, text, text, uuid)',
    'public.weekly_sections_reorder(uuid, uuid[])',
    'public.weekly_items_reorder(uuid, uuid[])',
    'public.weekly_item_move(uuid, uuid)',
    'public.weekly_edition_validation(uuid, timestamptz)',
    'public.weekly_edition_transition(uuid, text[], uuid, text, integer, timestamptz, text, jsonb)',
    'public.weekly_publish_due()',
    'public.weekly_housekeeping()',
    'public.weekly_health()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

insert into public.admin_permission (key, label, description) values
  ('weekly.view',      'View Abonten Weekly',
     'See editions, sections, items, scopes and settings.'),
  ('weekly.edit',      'Edit Abonten Weekly',
     'Create, duplicate and edit editions, sections and items; archive and restore editions.'),
  ('weekly.publish',   'Publish Abonten Weekly',
     'Schedule, publish and unpublish editions. Requires step-up.'),
  ('weekly.configure', 'Configure Abonten Weekly',
     'Turn Abonten Weekly on or off, choose the audience, manage scopes and limits. Requires step-up.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',        'weekly.view'),
  ('operations',        'weekly.edit'),
  ('operations',        'weekly.publish'),
  ('operations',        'weekly.configure'),
  ('moderator',         'weekly.view'),
  ('moderator',         'weekly.edit'),
  ('support_admin',     'weekly.view'),
  ('analyst',           'weekly.view'),
  ('field_ops_manager', 'weekly.view')
on conflict do nothing;

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('weekly-publish-due', 'weekly-housekeeping');

select cron.schedule('weekly-publish-due', '*/5 * * * *',
  $cron$select public.weekly_publish_due();$cron$);
select cron.schedule('weekly-housekeeping', '45 2 * * *',
  $cron$select public.weekly_housekeeping();$cron$);
