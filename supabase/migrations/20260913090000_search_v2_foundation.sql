-- Discovery: unified search foundation (events, places, organizers).
--
-- Adds, all additive:
--   * retires the `refresh_search` pg_cron job, which has refreshed a
--     materialized view (event_search) that no migration ever created and has
--     failed every 15 minutes in production
--   * stored generated tsvector columns on event, place and user_info
--     ('simple' config: no stemming, so Twi/Ga/Ewe names are never mangled;
--     recall comes from last-token prefix matching plus pg_trgm)
--   * partial GIN / trigram / prefix indexes matching the public visibility
--     predicate, so drafts, hidden, removed and archived rows are never even
--     candidates
--   * query helpers: _search_normalize, _search_like_escape,
--     _search_prefix_tsquery, _search_web_tsquery
--   * candidate-pool helpers (stage 1): _search_event_pool, _search_place_pool,
--     _search_organizer_pool
--   * ranked RPCs (stage 2): search_events, search_places, search_organizers,
--     and the type-ahead search_suggest
--   * get_event_suggestions / get_place_suggestions keep their signatures but
--     now apply the full visibility predicate (they showed hidden, removed and
--     archived rows in autocomplete) and escape LIKE metacharacters
--
-- Ranking weights are documented in
-- docs/architecture/discovery-search-and-recommendations.md. Changing a
-- weight is a migration.
--
-- Access: every public RPC is SECURITY DEFINER with search_path = '' and
-- fully qualified names, executable by anon/authenticated/service_role. They
-- only ever select rows that satisfy the public visibility predicate and
-- only return public profile columns. Row limits are clamped inside SQL
-- because the mobile app calls search_suggest directly. The role-level
-- statement_timeout (anon 3s, authenticated 8s) bounds a runaway call; a
-- function-level SET statement_timeout would not apply to the statement
-- already running, so none is set here.

-- ---------------------------------------------------------------------
-- 0. Retire the failing matview refresh job
-- ---------------------------------------------------------------------
select cron.unschedule('refresh_search')
where exists (select 1 from cron.job where jobname = 'refresh_search');

-- ---------------------------------------------------------------------
-- 1. Searchable documents
-- ---------------------------------------------------------------------
alter table public.event
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig,
      coalesce(event_category, '') || ' ' || coalesce(event_type, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(address ->> 'full_address', '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, left(coalesce(description, ''), 2000)), 'C')
  ) stored;

alter table public.place
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(address ->> 'full_address', '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, left(coalesce(description, ''), 2000)), 'C')
  ) stored;

alter table public.user_info
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig,
      coalesce(username::text, '') || ' ' || coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, left(coalesce(bio, ''), 500)), 'C')
  ) stored;

comment on column public.event.search_tsv is
  'Search document (title A; category, type, address B; description C). Generated; read by search_* RPCs.';
comment on column public.place.search_tsv is
  'Search document (name A; address B; description C). Generated; read by search_* RPCs.';
comment on column public.user_info.search_tsv is
  'Search document (username + full name A; bio C). Generated; read by search_organizers / search_suggest.';

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_event_search_tsv
  on public.event using gin (search_tsv)
  where status = 'published'
    and archived_at is null
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index if not exists idx_event_organizer_discoverable
  on public.event (organizer_id)
  where status = 'published'
    and archived_at is null
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index if not exists idx_place_search_tsv
  on public.place using gin (search_tsv)
  where status = 'published'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index if not exists idx_user_info_search_tsv
  on public.user_info using gin (search_tsv)
  where status_id = 1;

create index if not exists idx_user_info_username_trgm
  on public.user_info using gin ((username::text) extensions.gin_trgm_ops)
  where status_id = 1;

create index if not exists idx_user_info_full_name_trgm
  on public.user_info using gin (full_name extensions.gin_trgm_ops)
  where status_id = 1;

create index if not exists idx_user_info_username_prefix
  on public.user_info (lower(username::text) text_pattern_ops)
  where status_id = 1;

create index if not exists idx_place_visit_place_visited
  on public.place_visit (place_id, visited_on);

-- ---------------------------------------------------------------------
-- 3. Query helpers
-- ---------------------------------------------------------------------
create or replace function public._search_normalize(p_query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select left(
    btrim(regexp_replace(
      lower(regexp_replace(coalesce(p_query, ''), '[[:cntrl:]]+', ' ', 'g')),
      '\s+', ' ', 'g')),
    120);
$$;

create or replace function public._search_like_escape(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function public._search_prefix_tsquery(p_norm text)
returns tsquery
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_tokens text[];
begin
  select array_agg(t order by ord)
    into v_tokens
  from (
    select t, ord
    from unnest(regexp_split_to_array(coalesce(p_norm, ''), '[^[:alnum:]]+'))
      with ordinality as u(t, ord)
    where t <> ''
    order by ord
    limit 8
  ) s;

  if v_tokens is null or cardinality(v_tokens) = 0 then
    return null;
  end if;

  return to_tsquery('simple'::regconfig, array_to_string(v_tokens, ' & ') || ':*');
end;
$$;

create or replace function public._search_web_tsquery(p_norm text)
returns tsquery
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v tsquery;
begin
  if coalesce(p_norm, '') = '' then
    return null;
  end if;
  v := websearch_to_tsquery('simple'::regconfig, p_norm);
  if numnode(v) = 0 then
    return null;
  end if;
  return v;
end;
$$;

-- Trigram thresholds for the <% and % operators used by the pools. Loading
-- pg_trgm first (similarity()) makes the settings real USERSET parameters
-- rather than placeholders; set for the current transaction only.
create or replace function public._search_trgm_thresholds()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform extensions.similarity('', '');
  perform pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.45', true);
  perform pg_catalog.set_config('pg_trgm.similarity_threshold', '0.3', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Stage 1: candidate pools
-- ---------------------------------------------------------------------
create or replace function public._search_event_pool(
  p_norm         text,
  p_organizer_id uuid,
  p_category     text,
  p_origin       extensions.geography,
  p_radius_km    double precision,
  p_as_of        timestamptz,
  p_limit        integer
)
returns table (id uuid, text_score double precision)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prefix  tsquery := public._search_prefix_tsquery(p_norm);
  v_web     tsquery := public._search_web_tsquery(p_norm);
  v_like_p  text := public._search_like_escape(p_norm) || '%';
  v_like_w  text := '% ' || public._search_like_escape(p_norm) || '%';
  v_trigram boolean := length(coalesce(p_norm, '')) >= 3;
  v_cat     text := nullif(btrim(coalesce(p_category, '')), '');
begin
  perform public._search_trgm_thresholds();
  if coalesce(p_norm, '') = '' then
    if p_organizer_id is null and v_cat is null then
      return;
    end if;
    return query
    select e.id, 0::double precision
    from public.event e
    where e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and (
        exists (select 1 from public.event_occurrence o
                where o.event_id = e.id and o.ends_at > p_as_of)
        or (
          not exists (select 1 from public.event_occurrence o where o.event_id = e.id)
          and (e.ends_at > p_as_of or (e.ends_at is null and e.starts_at > p_as_of))
        )
      )
    order by e.starts_at asc nulls last, e.id
    limit p_limit;
    return;
  end if;

  return query
  select e.id,
    (
      0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], e.search_tsv,
                                   coalesce(v_prefix, v_web), 32)
      + 0.30 * (case
                  when lower(e.title) = p_norm then 1.0
                  when lower(e.title) like v_like_p escape '\' then 0.7
                  when lower(e.title) like v_like_w escape '\' then 0.4
                  else 0.0
                end)
      + 0.20 * extensions.similarity(e.title, p_norm)
    )::double precision as text_score
  from public.event e
  where e.status = 'published'
    and e.archived_at is null
    and e.moderation_state is distinct from 'hidden'
    and e.moderation_state is distinct from 'removed'
    and (
      e.search_tsv @@ v_prefix
      or e.search_tsv @@ v_web
      or (v_trigram and p_norm operator(extensions.<%) e.title)
    )
    and (p_organizer_id is null or e.organizer_id = p_organizer_id)
    and (v_cat is null or lower(e.event_category) = lower(v_cat))
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
    and (
      exists (select 1 from public.event_occurrence o
              where o.event_id = e.id and o.ends_at > p_as_of)
      or (
        not exists (select 1 from public.event_occurrence o where o.event_id = e.id)
        and (e.ends_at > p_as_of or (e.ends_at is null and e.starts_at > p_as_of))
      )
    )
  order by text_score desc, e.starts_at asc nulls last, e.id
  limit p_limit;
end;
$$;

create or replace function public._search_place_pool(
  p_norm        text,
  p_category_id smallint,
  p_origin      extensions.geography,
  p_radius_km   double precision,
  p_limit       integer
)
returns table (id uuid, text_score double precision)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prefix  tsquery := public._search_prefix_tsquery(p_norm);
  v_web     tsquery := public._search_web_tsquery(p_norm);
  v_like_p  text := public._search_like_escape(p_norm) || '%';
  v_like_w  text := '% ' || public._search_like_escape(p_norm) || '%';
  v_trigram boolean := length(coalesce(p_norm, '')) >= 3;
  v_cat_ids smallint[];
begin
  perform public._search_trgm_thresholds();
  if coalesce(p_norm, '') = '' then
    if p_category_id is null then
      return;
    end if;
    return query
    select p.id, 0::double precision
    from public.place p
    where p.status = 'published'
      and p.moderation_state is distinct from 'hidden'
      and p.moderation_state is distinct from 'removed'
      and p.temporary_status is distinct from 'permanently_closed'
      and p.category_id = p_category_id
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
    order by p.created_at desc, p.id
    limit p_limit;
    return;
  end if;

  -- A query naming a category ("gym", "night club") matches its places too.
  select coalesce(array_agg(c.id), '{}')
    into v_cat_ids
  from public.place_category c
  where lower(c.name) like '%' || public._search_like_escape(p_norm) || '%' escape '\'
     or (v_trigram and p_norm operator(extensions.<%) c.name);

  return query
  select p.id,
    (
      0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], p.search_tsv,
                                   coalesce(v_prefix, v_web), 32)
      + 0.30 * (case
                  when lower(p.name) = p_norm then 1.0
                  when lower(p.name) like v_like_p escape '\' then 0.7
                  when lower(p.name) like v_like_w escape '\' then 0.4
                  when p.category_id = any (v_cat_ids) then 0.35
                  else 0.0
                end)
      + 0.20 * extensions.similarity(coalesce(p.name, ''), p_norm)
    )::double precision as text_score
  from public.place p
  where p.status = 'published'
    and p.moderation_state is distinct from 'hidden'
    and p.moderation_state is distinct from 'removed'
    and p.temporary_status is distinct from 'permanently_closed'
    and (
      p.search_tsv @@ v_prefix
      or p.search_tsv @@ v_web
      or (v_trigram and p_norm operator(extensions.<%) p.name)
      or p.category_id = any (v_cat_ids)
    )
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit p_limit;
end;
$$;

-- Organizer = an active account with at least one discoverable event or one
-- published, visible place. p_handle set = "@handle" mode.
create or replace function public._search_organizer_pool(
  p_norm   text,
  p_handle text,
  p_limit  integer
)
returns table (id uuid, text_score double precision)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prefix  tsquery := public._search_prefix_tsquery(p_norm);
  v_web     tsquery := public._search_web_tsquery(p_norm);
  v_handle  text := nullif(lower(coalesce(p_handle, '')), '');
  v_like_h  text := public._search_like_escape(lower(coalesce(p_handle, ''))) || '%';
  v_like_hw text := '% ' || public._search_like_escape(lower(coalesce(p_handle, ''))) || '%';
  v_trigram boolean;
begin
  perform public._search_trgm_thresholds();
  if v_handle is not null then
    v_trigram := length(v_handle) >= 3;
    return query
    select u.id,
      (case
         when lower(u.username::text) = v_handle then 1.0
         when lower(u.username::text) like v_like_h escape '\' then 0.8
         when lower(coalesce(u.full_name, '')) like v_like_h escape '\'
           or lower(coalesce(u.full_name, '')) like v_like_hw escape '\' then 0.6
         else 0.5 * extensions.similarity(u.username::text, v_handle)
       end)::double precision as text_score
    from public.user_info u
    where u.status_id = 1
      and (
        lower(u.username::text) like v_like_h escape '\'
        or (v_trigram and (
              u.username::text operator(extensions.%) v_handle
              or lower(coalesce(u.full_name, '')) like v_like_h escape '\'
              or lower(coalesce(u.full_name, '')) like v_like_hw escape '\'))
      )
      and (
        exists (select 1 from public.event e
                where e.organizer_id = u.id
                  and e.status = 'published' and e.archived_at is null
                  and e.moderation_state is distinct from 'hidden'
                  and e.moderation_state is distinct from 'removed')
        or exists (select 1 from public.place p
                   where p.owner_id = u.id
                     and p.status = 'published'
                     and p.moderation_state is distinct from 'hidden'
                     and p.moderation_state is distinct from 'removed')
      )
    order by text_score desc, u.username
    limit p_limit;
    return;
  end if;

  if coalesce(p_norm, '') = '' then
    return;
  end if;
  v_trigram := length(p_norm) >= 3;

  return query
  select u.id,
    (
      0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], u.search_tsv,
                                   coalesce(v_prefix, v_web), 32)
      + 0.30 * (case
                  when lower(u.username::text) = p_norm or lower(coalesce(u.full_name, '')) = p_norm then 1.0
                  when lower(u.username::text) like public._search_like_escape(p_norm) || '%' escape '\'
                    or lower(coalesce(u.full_name, '')) like public._search_like_escape(p_norm) || '%' escape '\' then 0.7
                  else 0.0
                end)
      + 0.20 * greatest(extensions.similarity(u.username::text, p_norm),
                        extensions.similarity(coalesce(u.full_name, ''), p_norm))
    )::double precision as text_score
  from public.user_info u
  where u.status_id = 1
    and (
      u.search_tsv @@ v_prefix
      or u.search_tsv @@ v_web
      or (v_trigram and (p_norm operator(extensions.<%) u.username::text
                         or p_norm operator(extensions.<%) u.full_name))
    )
    and (
      exists (select 1 from public.event e
              where e.organizer_id = u.id
                and e.status = 'published' and e.archived_at is null
                and e.moderation_state is distinct from 'hidden'
                and e.moderation_state is distinct from 'removed')
      or exists (select 1 from public.place p
                 where p.owner_id = u.id
                   and p.status = 'published'
                   and p.moderation_state is distinct from 'hidden'
                   and p.moderation_state is distinct from 'removed')
    )
  order by text_score desc, u.id
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Stage 2: ranked results
-- ---------------------------------------------------------------------
create or replace function public.search_events(
  p_query        text,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_radius_km    double precision default null,
  p_category     text default null,
  p_types        text[] default null,
  p_min_price    numeric default null,
  p_max_price    numeric default null,
  p_start_date   timestamptz default null,
  p_end_date     timestamptz default null,
  p_min_rating   numeric default null,
  p_organizer_id uuid default null,
  p_as_of        timestamptz default null,
  p_cursor_score numeric default null,
  p_cursor_id    uuid default null,
  p_page_size    integer default 20
)
returns table (
  id                 uuid,
  title              text,
  starts_at          timestamptz,
  ends_at            timestamptz,
  address            jsonb,
  min_price          numeric,
  currency           text,
  avg_rating         numeric,
  event_code         text,
  distance_km        double precision,
  flyer_public_id    text,
  flyer_version      character varying,
  capacity           integer,
  attendance_count   bigint,
  created_at         timestamptz,
  occurrences        json,
  location           extensions.geography,
  event_category     text,
  status             character varying,
  organizer_id       uuid,
  organizer_username text,
  organizer_verified boolean,
  is_new             boolean,
  score              numeric,
  as_of              timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_norm   text := public._search_normalize(p_query);
  v_as_of  timestamptz := least(greatest(coalesce(p_as_of, now()), now() - interval '10 minutes'),
                                now() + interval '10 minutes');
  v_origin extensions.geography;
  v_size   integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_types  text[] := case when p_types is null or cardinality(p_types) = 0 then null else p_types end;
  v_narrow boolean := p_min_price is not null or p_max_price is not null or p_start_date is not null
                      or p_end_date is not null or p_min_rating is not null or v_types is not null;
begin
  if left(v_norm, 1) = '@' then
    return;
  end if;
  if length(v_norm) = 1 then
    v_norm := '';
  end if;
  if p_lat is not null and p_lng is not null then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  return query
  with pool as (
    select * from public._search_event_pool(
      v_norm, p_organizer_id, p_category, v_origin, p_radius_km, v_as_of,
      case when v_narrow then 2000 else 400 end)
  ),
  scored as (
    select
      e.id, e.title,
      coalesce(occ.next_starts_at, e.starts_at) as starts_at,
      coalesce(occ.next_ends_at, e.ends_at) as ends_at,
      e.address, tk.min_price, tk.currency,
      coalesce(rv.avg_rating, 0)::numeric as avg_rating,
      e.event_code,
      case when v_origin is null then null
           else extensions.st_distance(e.location, v_origin) / 1000 end as distance_km,
      e.flyer_public_id, e.flyer_version, e.capacity,
      coalesce(att.attendance_count, 0)::bigint as attendance_count,
      e.created_at, occ.occurrences, e.location, e.event_category, e.status, e.organizer_id,
      u.username::text as organizer_username,
      coalesce(u.organizer_verified and u.status_id = 1, false) as organizer_verified,
      (e.created_at > v_as_of - interval '14 days') as is_new,
      round((
        0.45 * pool.text_score
        + 0.15 * (case
                    when coalesce(occ.next_starts_at, e.starts_at) is null then 0.0
                    when coalesce(occ.next_starts_at, e.starts_at) <= v_as_of then 1.0
                    else exp(greatest(-50.0, -0.693147 * extract(epoch from (coalesce(occ.next_starts_at, e.starts_at) - v_as_of)) / 3600.0 / 168.0))
                  end)
        + 0.15 * (case when v_origin is null then 0.5
                       else exp(greatest(-50.0, -0.693147 * (extensions.st_distance(e.location, v_origin) / 1000) / 10.0)) end)
        + 0.10 * (0.6 * least(1.0, ln(1 + coalesce(att.attendance_count, 0) + 2 * coalesce(fv.favorite_count, 0)) / ln(501))
                  + 0.4 * (((coalesce(rv.rating_sum, 0) + 5 * 3.8) / (coalesce(rv.review_count, 0) + 5)) - 1) / 4)
        + 0.05 * (0.5 * (e.flyer_public_id is not null)::int + 0.5 * (length(coalesce(e.description, '')) >= 80)::int)
        + 0.03 * coalesce(u.organizer_verified and u.status_id = 1, false)::int
        + 0.08 * greatest(0.0, 1 - extract(epoch from (v_as_of - e.created_at)) / 86400.0 / 14.0)
      )::numeric, 6) as score
    from pool
    join public.event e on e.id = pool.id
    left join public.user_info u on u.id = e.organizer_id
    left join lateral (
      select
        min(o.starts_at) filter (where o.ends_at > v_as_of) as next_starts_at,
        (array_agg(o.ends_at order by o.starts_at) filter (where o.ends_at > v_as_of))[1] as next_ends_at,
        case when count(*) > 0 then
          json_agg(json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
                   order by o.starts_at asc)
        else
          json_build_array(json_build_object('id', null, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        end as occurrences
      from public.event_occurrence o
      where o.event_id = e.id
    ) occ on true
    left join lateral (
      select min(tt.price) as min_price, min(tt.currency) as currency,
             bool_or(tt.price between coalesce(p_min_price, 0) and coalesce(p_max_price, 1e12)) as in_price_range
      from public.ticket_type tt
      where tt.event_id = e.id
    ) tk on true
    left join lateral (
      select avg(r.rating) as avg_rating, sum(r.rating) as rating_sum, count(*) as review_count
      from public.event_review r
      where r.event_id = e.id
        and r.status = 'approved'
        and r.moderation_state is distinct from 'hidden'
        and r.moderation_state is distinct from 'removed'
    ) rv on true
    left join lateral (
      select sum(a.number_of_tickets) as attendance_count
      from public.attendance a
      where a.event_id = e.id and a.status = 'attending'
    ) att on true
    left join lateral (
      select count(*) as favorite_count
      from public.favorite f
      where f.event_id = e.id and f.deleted_at is null
    ) fv on true
    where
      ((p_min_price is null and p_max_price is null)
        or coalesce(tk.in_price_range, coalesce(p_min_price, 0) <= 0))
      and (p_start_date is null or coalesce(occ.next_starts_at, e.starts_at) >= p_start_date)
      and (p_end_date is null or coalesce(occ.next_starts_at, e.starts_at) <= p_end_date)
      and (p_min_rating is null or coalesce(rv.avg_rating, 0) >= p_min_rating)
      and (v_types is null
           or exists (select 1 from unnest(v_types) t
                      where e.event_type ilike '%' || public._search_like_escape(t) || '%' escape '\'))
  )
  select
    s.id, s.title, s.starts_at, s.ends_at, s.address, s.min_price, s.currency, s.avg_rating,
    s.event_code, s.distance_km, s.flyer_public_id, s.flyer_version, s.capacity,
    s.attendance_count, s.created_at, s.occurrences, s.location, s.event_category, s.status,
    s.organizer_id, s.organizer_username, s.organizer_verified, s.is_new, s.score, v_as_of
  from scored s
  where p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id)
  order by s.score desc, s.id asc
  limit v_size + 1;
end;
$$;

create or replace function public.search_places(
  p_query        text,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_radius_km    double precision default null,
  p_category_id  smallint default null,
  p_open_now     boolean default null,
  p_min_rating   numeric default null,
  p_as_of        timestamptz default null,
  p_cursor_score numeric default null,
  p_cursor_id    uuid default null,
  p_page_size    integer default 20
)
returns table (
  id               uuid,
  owner_id         uuid,
  name             text,
  slug             text,
  description      text,
  category_id      smallint,
  category_name    text,
  category_slug    text,
  location         extensions.geography,
  address          jsonb,
  website_url      text,
  phone            text,
  whatsapp         text,
  cover_public_id  text,
  cover_version    character varying,
  status           text,
  temporary_status text,
  claimed          boolean,
  verified         boolean,
  created_at       timestamptz,
  avg_rating       numeric,
  review_count     bigint,
  is_open          boolean,
  distance_km      double precision,
  is_new           boolean,
  score            numeric,
  as_of            timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_norm   text := public._search_normalize(p_query);
  v_as_of  timestamptz := least(greatest(coalesce(p_as_of, now()), now() - interval '10 minutes'),
                                now() + interval '10 minutes');
  v_origin extensions.geography;
  v_size   integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_narrow boolean := coalesce(p_open_now, false) or p_min_rating is not null;
begin
  if left(v_norm, 1) = '@' then
    return;
  end if;
  if length(v_norm) = 1 then
    v_norm := '';
  end if;
  if p_lat is not null and p_lng is not null then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  return query
  with pool as (
    select * from public._search_place_pool(
      v_norm, p_category_id, v_origin, p_radius_km,
      case when v_narrow then 2000 else 400 end)
  ),
  base as (
    select
      p.*, pool.text_score, pc.name as category_name, pc.slug as category_slug,
      rv.avg_rating, coalesce(rv.review_count, 0) as review_count, rv.rating_sum,
      coalesce(fv.favorite_count, 0) as favorite_count,
      coalesce(vs.visitor_count, 0) as visitor_count,
      coalesce(public.place_is_open_now(p.id, v_as_of), false) as is_open,
      case when v_origin is null then null
           else extensions.st_distance(p.location, v_origin) / 1000 end as distance_km
    from pool
    join public.place p on p.id = pool.id
    join public.place_category pc on pc.id = p.category_id
    left join lateral (
      select avg(r.rating)::numeric as avg_rating, sum(r.rating) as rating_sum, count(*) as review_count
      from public.place_review r
      where r.place_id = p.id
        and r.status = 'approved'
        and r.moderation_state is distinct from 'hidden'
        and r.moderation_state is distinct from 'removed'
    ) rv on true
    left join lateral (
      select count(*) as favorite_count from public.favorite_place f where f.place_id = p.id
    ) fv on true
    left join lateral (
      select count(distinct v.user_id) as visitor_count
      from public.place_visit v
      where v.place_id = p.id and v.visited_on > (v_as_of - interval '90 days')::date
    ) vs on true
  ),
  scored as (
    select b.*,
      (b.created_at > v_as_of - interval '14 days') as is_new,
      round((
        0.50 * b.text_score
        + 0.15 * (case when b.distance_km is null then 0.5 else exp(greatest(-50.0, -0.693147 * b.distance_km / 10.0)) end)
        + 0.12 * (0.6 * least(1.0, ln(1 + b.favorite_count + b.visitor_count + 2 * b.review_count) / ln(301))
                  + 0.4 * (((coalesce(b.rating_sum, 0) + 5 * 3.8) / (b.review_count + 5)) - 1) / 4)
        + 0.05 * coalesce(b.is_open, false)::int
        + 0.05 * (0.5 * (b.cover_public_id is not null)::int + 0.5 * (length(coalesce(b.description, '')) >= 80)::int)
        + 0.05 * coalesce(b.verified, false)::int
        + 0.08 * greatest(0.0, 1 - extract(epoch from (v_as_of - b.created_at)) / 86400.0 / 14.0)
        - 0.10 * (b.temporary_status is not distinct from 'temporarily_closed')::int
      )::numeric, 6) as score
    from base b
    where (p_open_now is not true or b.is_open)
      and (p_min_rating is null or coalesce(b.avg_rating, 0) >= p_min_rating)
  )
  select
    s.id, s.owner_id, s.name, s.slug, s.description, s.category_id, s.category_name, s.category_slug,
    s.location, s.address, s.website_url, s.phone, s.whatsapp, s.cover_public_id, s.cover_version,
    s.status, s.temporary_status, s.claimed, s.verified, s.created_at, s.avg_rating,
    s.review_count::bigint, s.is_open, s.distance_km, s.is_new, s.score, v_as_of
  from scored s
  where p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id)
  order by s.score desc, s.id asc
  limit v_size + 1;
end;
$$;

create or replace function public.search_organizers(
  p_query        text,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_as_of        timestamptz default null,
  p_cursor_score numeric default null,
  p_cursor_id    uuid default null,
  p_page_size    integer default 20
)
returns table (
  id                 uuid,
  username           text,
  full_name          text,
  avatar_public_id   text,
  avatar_version     text,
  bio                text,
  organizer_verified boolean,
  event_count        bigint,
  upcoming_count     bigint,
  place_count        bigint,
  avg_rating         numeric,
  rating_count       bigint,
  is_new             boolean,
  score              numeric,
  as_of              timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_raw    text := public._search_normalize(p_query);
  v_handle text;
  v_norm   text;
  v_as_of  timestamptz := least(greatest(coalesce(p_as_of, now()), now() - interval '10 minutes'),
                                now() + interval '10 minutes');
  v_origin extensions.geography;
  v_size   integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
begin
  if left(v_raw, 1) = '@' then
    v_handle := substring(v_raw from '^@([[:alnum:]_]{1,30})');
    if v_handle is null then
      return;
    end if;
  else
    v_norm := v_raw;
    if length(v_norm) < 2 then
      return;
    end if;
  end if;
  if p_lat is not null and p_lng is not null then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  return query
  with pool as (
    select * from public._search_organizer_pool(v_norm, v_handle, 400)
  ),
  base as (
    select
      u.id, u.username::text as username, u.full_name, u.avatar_public_id, u.avatar_version, u.bio,
      coalesce(u.organizer_verified, false) as organizer_verified,
      pool.text_score,
      coalesce(ev.event_count, 0) as event_count,
      coalesce(ev.upcoming_count, 0) as upcoming_count,
      coalesce(ev.first_created_at, u.created_at) as first_created_at,
      ev.nearest_km,
      coalesce(pl.place_count, 0) as place_count,
      rt.avg_rating, rt.rating_sum, coalesce(rt.rating_count, 0) as rating_count
    from pool
    join public.user_info u on u.id = pool.id
    left join lateral (
      select
        count(*) as event_count,
        count(*) filter (where
          exists (select 1 from public.event_occurrence o where o.event_id = e.id and o.ends_at > v_as_of)
          or (not exists (select 1 from public.event_occurrence o where o.event_id = e.id)
              and (e.ends_at > v_as_of or (e.ends_at is null and e.starts_at > v_as_of)))
        ) as upcoming_count,
        min(e.created_at) as first_created_at,
        case when v_origin is null then null
             else min(extensions.st_distance(e.location, v_origin)) / 1000 end as nearest_km
      from public.event e
      where e.organizer_id = u.id
        and e.status = 'published' and e.archived_at is null
        and e.moderation_state is distinct from 'hidden'
        and e.moderation_state is distinct from 'removed'
    ) ev on true
    left join lateral (
      select count(*) as place_count
      from public.place p
      where p.owner_id = u.id and p.status = 'published'
        and p.moderation_state is distinct from 'hidden'
        and p.moderation_state is distinct from 'removed'
    ) pl on true
    left join lateral (
      select avg(r.rating)::numeric as avg_rating, sum(r.rating) as rating_sum, count(*) as rating_count
      from public.review r
      where r.reviewed_id = u.id
        and r.status = 'approved'
        and r.moderation_state is distinct from 'hidden'
        and r.moderation_state is distinct from 'removed'
    ) rt on true
  ),
  scored as (
    select b.*,
      (b.first_created_at > v_as_of - interval '14 days') as is_new,
      round((
        0.55 * b.text_score
        + 0.20 * (0.7 * least(1.0, ln(1 + b.upcoming_count) / ln(21)) + 0.3 * least(1.0, ln(1 + b.event_count) / ln(51)))
        + 0.10 * (((coalesce(b.rating_sum, 0) + 5 * 3.8) / (b.rating_count + 5)) - 1) / 4
        + 0.05 * (case when b.nearest_km is null then 0.5 else exp(greatest(-50.0, -0.693147 * b.nearest_km / 25.0)) end)
        + 0.05 * (0.5 * (b.avatar_public_id is not null)::int + 0.5 * (length(coalesce(b.bio, '')) >= 40)::int)
        + 0.05 * b.organizer_verified::int
        + 0.08 * greatest(0.0, 1 - extract(epoch from (v_as_of - b.first_created_at)) / 86400.0 / 14.0)
      )::numeric, 6) as score
    from base b
  )
  select
    s.id, s.username, s.full_name, s.avatar_public_id, s.avatar_version, s.bio, s.organizer_verified,
    s.event_count::bigint, s.upcoming_count::bigint, s.place_count::bigint,
    s.avg_rating, s.rating_count::bigint, s.is_new, s.score, v_as_of
  from scored s
  where p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id)
  order by s.score desc, s.id asc
  limit v_size + 1;
end;
$$;

-- Type-ahead: text mode -> up to 6 events, 4 places, 3 organizers; "@" mode
-- -> up to 8 organizers. Stage-1 scoring only (no aggregates).
create or replace function public.search_suggest(
  p_query text,
  p_lat   double precision default null,
  p_lng   double precision default null,
  p_types text[] default null
)
returns table (
  entity_type     text,
  id              uuid,
  label           text,
  sublabel        text,
  image_public_id text,
  image_version   text,
  slug            text,
  event_code      text,
  starts_at       timestamptz,
  distance_km     double precision,
  verified        boolean,
  score           double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_raw    text := public._search_normalize(p_query);
  v_handle text;
  v_origin extensions.geography;
  v_now    timestamptz := now();
  v_types  text[] := coalesce(nullif(p_types, '{}'), array['event', 'place', 'organizer']);
begin
  if p_lat is not null and p_lng is not null then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  if left(v_raw, 1) = '@' then
    v_handle := substring(v_raw from '^@([[:alnum:]_]{1,30})');
    if v_handle is null or not ('organizer' = any (v_types)) then
      return;
    end if;
    return query
    select 'organizer'::text, u.id, u.username::text, u.full_name, u.avatar_public_id, u.avatar_version,
           u.username::text, null::text, null::timestamptz, null::double precision,
           coalesce(u.organizer_verified, false), pool.text_score
    from public._search_organizer_pool(null, v_handle, 8) pool
    join public.user_info u on u.id = pool.id
    order by pool.text_score desc, u.username;
    return;
  end if;

  if length(v_raw) < 2 then
    return;
  end if;

  if 'event' = any (v_types) then
    return query
    select 'event'::text, e.id, e.title,
           e.event_category,
           e.flyer_public_id, e.flyer_version::text, e.slug, e.event_code,
           coalesce((select min(o.starts_at) from public.event_occurrence o
                     where o.event_id = e.id and o.ends_at > v_now), e.starts_at),
           case when v_origin is null then null else extensions.st_distance(e.location, v_origin) / 1000 end,
           coalesce(u.organizer_verified and u.status_id = 1, false),
           pool.text_score
    from public._search_event_pool(v_raw, null, null, null, null, v_now, 6) pool
    join public.event e on e.id = pool.id
    left join public.user_info u on u.id = e.organizer_id
    order by pool.text_score desc, e.starts_at asc nulls last;
  end if;

  if 'place' = any (v_types) then
    return query
    select 'place'::text, p.id, p.name, pc.name, p.cover_public_id, p.cover_version::text, p.slug,
           null::text, null::timestamptz,
           case when v_origin is null then null else extensions.st_distance(p.location, v_origin) / 1000 end,
           coalesce(p.verified, false), pool.text_score
    from public._search_place_pool(v_raw, null, null, null, 4) pool
    join public.place p on p.id = pool.id
    join public.place_category pc on pc.id = p.category_id
    order by pool.text_score desc, p.name;
  end if;

  if 'organizer' = any (v_types) then
    return query
    select 'organizer'::text, u.id, u.username::text, u.full_name, u.avatar_public_id, u.avatar_version,
           u.username::text, null::text, null::timestamptz, null::double precision,
           coalesce(u.organizer_verified, false), pool.text_score
    from public._search_organizer_pool(v_raw, null, 3) pool
    join public.user_info u on u.id = pool.id
    order by pool.text_score desc, u.username;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Legacy suggestion RPCs: same signatures, full visibility predicate
-- ---------------------------------------------------------------------
create or replace function public.get_event_suggestions(
  p_search_text text,
  p_limit       integer default 5
)
returns table (
  id              uuid,
  title           text,
  slug            text,
  event_code      text,
  event_category  text,
  flyer_public_id text,
  flyer_version   character varying,
  starts_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_norm text := public._search_normalize(p_search_text);
begin
  if length(v_norm) < 2 or left(v_norm, 1) = '@' then
    return;
  end if;
  return query
  select e.id, e.title, e.slug, e.event_code, e.event_category,
         e.flyer_public_id, e.flyer_version, e.starts_at
  from public._search_event_pool(v_norm, null, null, null, null, now(),
         least(greatest(coalesce(p_limit, 5), 1), 20)) pool
  join public.event e on e.id = pool.id
  order by pool.text_score desc, e.starts_at asc nulls last;
end;
$$;

create or replace function public.get_place_suggestions(
  p_search_text text,
  p_limit       integer default 4
)
returns table (
  id              uuid,
  name            text,
  slug            text,
  category_id     smallint,
  cover_public_id text,
  cover_version   character varying
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_norm text := public._search_normalize(p_search_text);
begin
  if length(v_norm) < 2 or left(v_norm, 1) = '@' then
    return;
  end if;
  return query
  select p.id, p.name, p.slug, p.category_id, p.cover_public_id, p.cover_version
  from public._search_place_pool(v_norm, null, null, null,
         least(greatest(coalesce(p_limit, 4), 1), 20)) pool
  join public.place p on p.id = pool.id
  order by pool.text_score desc, p.name;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._search_normalize(text)',
    'public._search_like_escape(text)',
    'public._search_prefix_tsquery(text)',
    'public._search_web_tsquery(text)',
    'public._search_trgm_thresholds()',
    'public._search_event_pool(text, uuid, text, extensions.geography, double precision, timestamptz, integer)',
    'public._search_place_pool(text, smallint, extensions.geography, double precision, integer)',
    'public._search_organizer_pool(text, text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;

  foreach fn in array array[
    'public.search_events(text, double precision, double precision, double precision, text, text[], numeric, numeric, timestamptz, timestamptz, numeric, uuid, timestamptz, numeric, uuid, integer)',
    'public.search_places(text, double precision, double precision, double precision, smallint, boolean, numeric, timestamptz, numeric, uuid, integer)',
    'public.search_organizers(text, double precision, double precision, timestamptz, numeric, uuid, integer)',
    'public.search_suggest(text, double precision, double precision, text[])',
    'public.get_event_suggestions(text, integer)',
    'public.get_place_suggestions(text, integer)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end;
$$;
