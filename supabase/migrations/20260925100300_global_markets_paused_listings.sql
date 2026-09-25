-- Global markets, part 13: a paused market's listings leave discovery.
--
-- Found in the hardening audit: pausing a market stopped nothing people
-- could see. Its events and places stayed in Explore, search, suggestions,
-- the map, "similar events" and Featured, and a buyer could reach checkout
-- before the payment step refused them. A market's status now decides:
--   live, maintenance   -> listings are shown (maintenance takes no new
--                          sales, which the checkout enforces);
--   draft, preparing,
--   ready, paused       -> listings are not shown anywhere in discovery.
-- A listing whose country has no market row (only possible for rows older
-- than the market model) stays visible.
--
-- listing_market_visible() is added next to every existing moderation
-- filter of the discovery functions — the same functions, rewritten from
-- their current definitions with only that line added.
--
-- Also removes the seeded `markets.browse_abroad` flag: nothing ever read
-- it, and an inert switch in Admin reads as a control that works.

create or replace function public.listing_market_visible(p_country_code text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select not exists (
    select 1 from public.market m
    where m.country_code = upper(p_country_code)
      and m.status not in ('live', 'maintenance')
  );
$$;
revoke all on function public.listing_market_visible(text) from public;
grant execute on function public.listing_market_visible(text) to anon, authenticated, service_role;

delete from public.feature_flag where key = 'markets.browse_abroad';

-- _search_event_pool: 6 listing filter(s)
CREATE OR REPLACE FUNCTION public._search_event_pool(p_norm text, p_organizer_id uuid, p_category text, p_origin geography, p_radius_km double precision, p_as_of timestamp with time zone, p_limit integer)
 RETURNS TABLE(id uuid, text_score double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_cat     text := nullif(btrim(coalesce(p_category, '')), '');
  v_time    record;
  v_text    text;
  v_from    timestamptz := p_as_of;
  v_to      timestamptz;
  v_dated   boolean := false;
  v_prefix  tsquery;
  v_web     tsquery;
  v_fprefix tsquery;
  v_fweb    tsquery;
  v_related tsquery;
  v_relaxed tsquery;
  v_like_p  text;
  v_like_w  text;
  v_ids     uuid[] := '{}';
  v_scores  double precision[] := '{}';
  v_found   integer := 0;
begin
  perform public._search_trgm_thresholds();

  select * into v_time from public._search_temporal(p_norm, p_as_of, public.market_timezone_at(p_origin));
  v_text := coalesce(v_time.rest, '');
  if v_time.date_from is not null then
    v_dated := true;
    v_from := greatest(p_as_of, v_time.date_from);
    v_to := v_time.date_to;
  end if;

  -- Nothing to match on: browse by organizer / category / date window.
  if v_text = '' then
    if p_organizer_id is null and v_cat is null and not v_dated then
      return;
    end if;
    return query
    select e.id, 0::double precision
    from public.event e
    where e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and public.listing_market_visible(e.country_code)
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
    order by e.starts_at asc nulls last, e.id
    limit p_limit;
    return;
  end if;

  v_prefix  := public._search_prefix_tsquery(v_text);
  v_web     := public._search_web_tsquery(v_text);
  v_related := public._search_related_tsquery(v_text, 'event');
  v_like_p  := public._search_like_escape(v_text) || '%';
  v_like_w  := '% ' || public._search_like_escape(v_text) || '%';
  if v_dated then
    -- The date words themselves, matched literally, outside the window
    -- ("December to Remember" is still found by "december").
    v_fprefix := public._search_prefix_tsquery(p_norm);
    v_fweb := public._search_web_tsquery(p_norm);
  end if;

  with cand as (
    -- 1. precise
    select e.id,
      (
        0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], e.search_tsv,
                                     coalesce(v_prefix, v_web), 32)
        + 0.30 * (case
                    when lower(e.title) = v_text then 1.0
                    when lower(e.title) like v_like_p escape '\' then 0.7
                    when lower(e.title) like v_like_w escape '\' then 0.4
                    else 0.0
                  end)
        + 0.20 * extensions.similarity(e.title, v_text)
      )::double precision as s
    from public.event e
    where e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and public.listing_market_visible(e.country_code)
      and (e.search_tsv @@ v_prefix or e.search_tsv @@ v_web)
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)

    union all
    -- 1b. the whole query, date words included, as text (dated queries only)
    select e.id,
      (0.9 * (
        0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], e.search_tsv,
                                     coalesce(v_fprefix, v_fweb), 32)
        + 0.20 * extensions.similarity(e.title, p_norm)
      ))::double precision
    from public.event e
    where v_dated
      and e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and public.listing_market_visible(e.country_code)
      and (e.search_tsv @@ v_fprefix or e.search_tsv @@ v_fweb)
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, p_as_of, null)

    union all
    -- 2. related (concept vocabulary)
    select e.id,
      (0.6 * (
        0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], e.search_tsv, v_related, 32)
        + 0.15
      ))::double precision
    from public.event e
    where v_related is not null
      and e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and public.listing_market_visible(e.country_code)
      and e.search_tsv @@ v_related
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
  ),
  best as (
    select c.id, max(c.s) as s
    from cand c
    group by c.id
    order by 2 desc, c.id
    limit p_limit
  )
  select coalesce(array_agg(b.id order by b.s desc, b.id), '{}'),
         coalesce(array_agg(b.s order by b.s desc, b.id), '{}')
    into v_ids, v_scores
  from best b;
  v_found := cardinality(v_ids);

  -- 3. relaxed: any word, or the words run together — only when thin.
  if v_found < least(5, p_limit) then
    v_relaxed := public._search_relaxed_tsquery(v_text);
    if v_relaxed is not null then
      with more as (
        select e.id,
          (0.35 * (
            0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], e.search_tsv, v_relaxed, 32)
            + 0.20 * extensions.similarity(e.title, v_text)
          ))::double precision as s
        from public.event e
        where e.status = 'published'
          and e.archived_at is null
          and e.moderation_state is distinct from 'hidden'
          and e.moderation_state is distinct from 'removed'
          and public.listing_market_visible(e.country_code)
          and e.search_tsv @@ v_relaxed
          and e.id <> all (v_ids)
          and (p_organizer_id is null or e.organizer_id = p_organizer_id)
          and (v_cat is null or lower(e.event_category) = lower(v_cat))
          and (p_origin is null or p_radius_km is null
               or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
          and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
        order by 2 desc, e.id
        limit greatest(p_limit - v_found, 0)
      )
      select v_ids || coalesce(array_agg(m.id order by m.s desc, m.id), '{}'),
             v_scores || coalesce(array_agg(m.s order by m.s desc, m.id), '{}')
        into v_ids, v_scores
      from more m;
      v_found := cardinality(v_ids);
    end if;
  end if;

  return query
  select u.id, u.s
  from unnest(v_ids, v_scores) as u(id, s);

  -- 4. trigram typo fallback, as before. A typo is matched against the
  -- title as typed — date words included, and without the date window —
  -- because "weekend" or "december" may simply be part of the title.
  if length(p_norm) < 3 or v_found >= least(5, p_limit) then
    return;
  end if;

  return query
  select e.id,
    (
      0.30 * (case
                when lower(e.title) like public._search_like_escape(p_norm) || '%' escape '\' then 0.7
                when lower(e.title) like '% ' || public._search_like_escape(p_norm) || '%' escape '\' then 0.4
                else 0.0
              end)
      + 0.50 * extensions.word_similarity(p_norm, e.title)
      + 0.20 * extensions.similarity(e.title, p_norm)
    )::double precision as text_score
  from public.event e
  where e.status = 'published'
    and e.archived_at is null
    and e.moderation_state is distinct from 'hidden'
    and e.moderation_state is distinct from 'removed'
    and public.listing_market_visible(e.country_code)
    and p_norm operator(extensions.<%) e.title
    and e.id <> all (v_ids)
    and (p_organizer_id is null or e.organizer_id = p_organizer_id)
    and (v_cat is null or lower(e.event_category) = lower(v_cat))
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
    and public._search_event_in_window(e.id, e.starts_at, e.ends_at, p_as_of, null)
  order by text_score desc, e.starts_at asc nulls last, e.id
  limit greatest(p_limit - v_found, 0);
end;
$function$;

-- _search_place_pool: 5 listing filter(s)
CREATE OR REPLACE FUNCTION public._search_place_pool(p_norm text, p_category_id smallint, p_origin geography, p_radius_km double precision, p_limit integer)
 RETURNS TABLE(id uuid, text_score double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_prefix  tsquery := public._search_prefix_tsquery(p_norm);
  v_web     tsquery := public._search_web_tsquery(p_norm);
  v_related tsquery := public._search_related_tsquery(p_norm, 'place');
  v_relaxed tsquery;
  v_like_p  text := public._search_like_escape(p_norm) || '%';
  v_like_w  text := '% ' || public._search_like_escape(p_norm) || '%';
  v_trigram boolean := length(coalesce(p_norm, '')) >= 3;
  v_cat_ids smallint[];
  v_ids     uuid[] := '{}';
  v_scores  double precision[] := '{}';
  v_found   integer := 0;
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
      and public.listing_market_visible(p.country_code)
      and p.temporary_status is distinct from 'permanently_closed'
      and p.category_id = p_category_id
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
    order by p.created_at desc, p.id
    limit p_limit;
    return;
  end if;

  -- Category names the query (or a related term) points at.
  select coalesce(array_agg(c.id), '{}')
    into v_cat_ids
  from public.place_category c
  where lower(c.name) like '%' || public._search_like_escape(p_norm) || '%' escape '\'
     or c.slug = replace(p_norm, ' ', '-')
     or (v_related is not null
         and to_tsvector('simple'::regconfig, c.name) @@ v_related);

  with svc as materialized (
    select s.place_id,
           max(pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], s.search_tsv,
                                     coalesce(v_prefix, v_web), 32)) as rank
    from public.place_service s
    where s.search_tsv @@ v_prefix or s.search_tsv @@ v_web
    group by s.place_id
  ),
  related_svc as materialized (
    select s.place_id
    from public.place_service s
    where v_related is not null and s.search_tsv @@ v_related
    group by s.place_id
  ),
  cand as (
    -- 1. precise: text, category name, services (as before)
    select p.id,
      (
        0.50 * greatest(
                 pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], p.search_tsv,
                                       coalesce(v_prefix, v_web), 32),
                 0.6 * coalesce(svc.rank, 0))
        + 0.30 * (case
                    when lower(p.name) = p_norm then 1.0
                    when lower(p.name) like v_like_p escape '\' then 0.7
                    when lower(p.name) like v_like_w escape '\' then 0.4
                    when p.category_id = any (v_cat_ids) then 0.35
                    when svc.place_id is not null then 0.30
                    else 0.0
                  end)
        + 0.20 * extensions.similarity(coalesce(p.name, ''), p_norm)
      )::double precision as s
    from public.place p
    left join svc on svc.place_id = p.id
    where p.status = 'published'
      and p.moderation_state is distinct from 'hidden'
      and p.moderation_state is distinct from 'removed'
      and public.listing_market_visible(p.country_code)
      and p.temporary_status is distinct from 'permanently_closed'
      and (
        p.search_tsv @@ v_prefix
        or p.search_tsv @@ v_web
        or p.category_id = any (v_cat_ids)
        or svc.place_id is not null
      )
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))

    union all
    -- 2. related: vocabulary words in the place or its services
    select p.id,
      (0.6 * (
        0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], p.search_tsv, v_related, 32)
        + 0.15
      ))::double precision
    from public.place p
    left join related_svc rs on rs.place_id = p.id
    where v_related is not null
      and p.status = 'published'
      and p.moderation_state is distinct from 'hidden'
      and p.moderation_state is distinct from 'removed'
      and public.listing_market_visible(p.country_code)
      and p.temporary_status is distinct from 'permanently_closed'
      and (p.search_tsv @@ v_related or rs.place_id is not null)
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  ),
  best as (
    select c.id, max(c.s) as s
    from cand c
    group by c.id
    order by 2 desc, c.id
    limit p_limit
  )
  select coalesce(array_agg(b.id order by b.s desc, b.id), '{}'),
         coalesce(array_agg(b.s order by b.s desc, b.id), '{}')
    into v_ids, v_scores
  from best b;
  v_found := cardinality(v_ids);

  if v_found < least(5, p_limit) then
    v_relaxed := public._search_relaxed_tsquery(p_norm);
    if v_relaxed is not null then
      with more as (
        select p.id,
          (0.35 * (
            0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], p.search_tsv, v_relaxed, 32)
            + 0.20 * extensions.similarity(coalesce(p.name, ''), p_norm)
          ))::double precision as s
        from public.place p
        where p.status = 'published'
          and p.moderation_state is distinct from 'hidden'
          and p.moderation_state is distinct from 'removed'
          and public.listing_market_visible(p.country_code)
          and p.temporary_status is distinct from 'permanently_closed'
          and p.search_tsv @@ v_relaxed
          and p.id <> all (v_ids)
          and (p_category_id is null or p.category_id = p_category_id)
          and (p_origin is null or p_radius_km is null
               or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
        order by 2 desc, p.id
        limit greatest(p_limit - v_found, 0)
      )
      select v_ids || coalesce(array_agg(m.id order by m.s desc, m.id), '{}'),
             v_scores || coalesce(array_agg(m.s order by m.s desc, m.id), '{}')
        into v_ids, v_scores
      from more m;
      v_found := cardinality(v_ids);
    end if;
  end if;

  return query
  select u.id, u.s
  from unnest(v_ids, v_scores) as u(id, s);

  if not v_trigram or v_found >= least(5, p_limit) then
    return;
  end if;

  return query
  select p.id,
    (
      0.30 * (case
                when lower(p.name) like v_like_p escape '\' then 0.7
                when lower(p.name) like v_like_w escape '\' then 0.4
                else 0.0
              end)
      + 0.50 * extensions.word_similarity(p_norm, coalesce(p.name, ''))
      + 0.20 * extensions.similarity(coalesce(p.name, ''), p_norm)
    )::double precision as text_score
  from public.place p
  where p.status = 'published'
    and p.moderation_state is distinct from 'hidden'
    and p.moderation_state is distinct from 'removed'
    and public.listing_market_visible(p.country_code)
    and p.temporary_status is distinct from 'permanently_closed'
    and p_norm operator(extensions.<%) p.name
    and p.id <> all (v_ids)
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit greatest(p_limit - v_found, 0);
end;
$function$;

-- get_events_in_window: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, timezone text, country_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
      e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
      e.status, e.created_at, e.event_code,
      ticket_data.min_price, e.currency::text AS currency,
      occ_data.occurrences, e.featured, e.timezone::text AS timezone, e.country_code::text AS country_code,
      win.window_starts_at, win.window_ends_at
    FROM event e
    JOIN LATERAL (
      SELECT candidate.starts_at AS window_starts_at, candidate.ends_at AS window_ends_at
      FROM (
        SELECT o.starts_at, o.ends_at
        FROM event_occurrence o
        WHERE o.event_id = e.id
        UNION ALL
        SELECT e.starts_at, e.ends_at
        WHERE NOT EXISTS (SELECT 1 FROM event_occurrence o2 WHERE o2.event_id = e.id)
      ) candidate
      WHERE candidate.starts_at BETWEEN p_window_start AND p_window_end
      ORDER BY candidate.starts_at ASC
      LIMIT 1
    ) win ON TRUE
    LEFT JOIN LATERAL (
      SELECT MIN(tt.price) AS min_price, MIN(tt.currency) AS currency
      FROM ticket_type tt WHERE tt.event_id = e.id
    ) ticket_data ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN COUNT(*) > 0 THEN
            json_agg(json_build_object('id', occ.id, 'starts_at', occ.starts_at, 'ends_at', occ.ends_at) ORDER BY occ.starts_at ASC)
          ELSE
            json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        END AS occurrences
      FROM event_occurrence occ WHERE occ.event_id = e.id
    ) occ_data ON TRUE
    WHERE
      e.status = 'published'
      AND e.archived_at IS NULL
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
      AND public.listing_market_visible(e.country_code)
      AND (
        p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_radius_km * 1000)
      )
  )
  SELECT
    m.id, m.organizer_id, m.event_category, m.event_type, m.title, m.slug, m.description,
    m.location, m.address, m.website_url, m.capacity, m.flyer_public_id, m.flyer_version,
    m.window_starts_at AS starts_at, m.window_ends_at AS ends_at, m.status, m.created_at,
    m.event_code, m.min_price, m.currency, m.occurrences, m.featured, m.timezone, m.country_code
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.window_starts_at, m.id) > (p_cursor_starts_at, p_cursor_id)
  ORDER BY m.window_starts_at ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- get_filtered_events: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_distance_km double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location geography, event_category text, status character varying, organizer_id uuid, timezone text, country_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id,
      e.title,
      COALESCE(occ.next_starts_at, e.starts_at) AS starts_at,
      COALESCE(occ.next_ends_at, e.ends_at) AS ends_at,
      e.address,
      tk.min_price,
      e.currency::text AS currency,
      COALESCE(rv.avg_rating, 0) AS avg_rating,
      e.event_code,
      ST_Distance(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography) / 1000 AS distance_km,
      e.flyer_public_id,
      e.flyer_version,
      e.capacity,
      COALESCE(att.attendance_count, 0)::bigint AS attendance_count,
      e.created_at,
      occ.occurrences,
      e.location,
      e.event_category,
      e.status,
      e.organizer_id,
      e.timezone::text AS timezone,
      e.country_code::text AS country_code
    FROM event e
    -- One pass over the occurrences: next future slot, whether any future
    -- slot exists, and the JSON list the cards render.
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total,
        bool_or(o.ends_at > now()) AS has_future,
        MIN(o.starts_at) FILTER (WHERE o.ends_at > now()) AS next_starts_at,
        (array_agg(o.ends_at ORDER BY o.starts_at) FILTER (WHERE o.ends_at > now()))[1] AS next_ends_at,
        CASE
          WHEN COUNT(*) > 0 THEN
            json_agg(
              json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
              ORDER BY o.starts_at ASC
            )
          ELSE
            json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        END AS occurrences
      FROM event_occurrence o
      WHERE o.event_id = e.id
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT
        MIN(tt.price) AS min_price,
        MIN(tt.currency) AS currency,
        bool_or(tt.price BETWEEN p_min_price AND p_max_price) AS in_price_range
      FROM ticket_type tt
      WHERE tt.event_id = e.id
    ) tk ON true
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating) AS avg_rating
      FROM event_review r
      WHERE r.event_id = e.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
    ) rv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(a.number_of_tickets) AS attendance_count
      FROM attendance a
      WHERE a.event_id = e.id AND a.status = 'attending'
    ) att ON true
    WHERE
      e.status = 'published'
      AND e.archived_at IS NULL
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
      AND public.listing_market_visible(e.country_code)
      AND (p_min_price IS NULL OR p_max_price IS NULL OR tk.in_price_range)
      AND (
        p_start_date IS NULL OR p_end_date IS NULL
        OR COALESCE(occ.next_starts_at, e.starts_at) BETWEEN p_start_date AND p_end_date
      )
      AND (
        p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_max_distance_km * 1000)
      )
      AND (
        p_search_text IS NULL OR p_search_text = '' OR
        e.title ILIKE '%' || p_search_text || '%' OR
        e.description ILIKE '%' || p_search_text || '%' OR
        e.event_category ILIKE '%' || p_search_text || '%' OR
        e.event_type ILIKE '%' || p_search_text || '%' OR
        e.slug ILIKE '%' || p_search_text || '%' OR
        (e.address->>'name') ILIKE '%' || p_search_text || '%'
      )
      AND (p_event_category IS NULL OR e.event_category ILIKE '%' || p_event_category || '%')
      AND (
        p_event_type IS NULL OR array_length(p_event_type, 1) IS NULL
        OR EXISTS (SELECT 1 FROM unnest(p_event_type) t WHERE e.event_type ILIKE '%' || t || '%')
      )
      AND (p_min_rating IS NULL OR COALESCE(rv.avg_rating, 0) >= p_min_rating)
      AND (
        COALESCE(occ.has_future, false)
        OR (
          COALESCE(occ.total, 0) = 0
          AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
        )
      )
  )
  SELECT
    m.id, m.title, m.starts_at, m.ends_at, m.address, m.min_price, m.currency, m.avg_rating,
    m.event_code, m.distance_km, m.flyer_public_id, m.flyer_version, m.capacity,
    m.attendance_count, m.created_at, m.occurrences,
    m.location, m.event_category, m.status, m.organizer_id, m.timezone, m.country_code
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.starts_at, COALESCE(m.distance_km, 1e18::double precision), m.id)
       > (p_cursor_starts_at, COALESCE(p_cursor_distance_km, 1e18::double precision), p_cursor_id)
  ORDER BY
    m.starts_at ASC,
    COALESCE(m.distance_km, 1e18::double precision) ASC,
    m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- get_similar_events: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_similar_events(input_category text, input_location geography, input_radius_km numeric)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, require_registration boolean, ticket_price numeric, ticket_currency text, occurrences json, timezone text, country_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code, e.require_registration,
    tt.price, e.currency::text, occ.occurrences, e.timezone::text, e.country_code::text
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency FROM ticket_type
    WHERE ticket_type.event_id = e.id ORDER BY price ASC LIMIT 1
  ) tt ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      bool_or(o.ends_at > now()) AS has_future,
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at) ORDER BY o.starts_at ASC)
        ELSE
          json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
      END AS occurrences
    FROM event_occurrence o WHERE o.event_id = e.id
  ) occ ON true
  WHERE e.status = 'published'
    AND e.archived_at IS NULL
    AND e.moderation_state IS DISTINCT FROM 'hidden'
    AND e.moderation_state IS DISTINCT FROM 'removed'
    AND public.listing_market_visible(e.country_code)
    AND lower(e.event_category) = lower(input_category)
    AND ST_DWithin(e.location::geography, input_location, input_radius_km * 1000)
    AND (
      COALESCE(occ.has_future, false)
      OR (
        COALESCE(occ.total, 0) = 0
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    );
END;
$function$;

-- get_nearby_events: 2 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_nearby_events(user_lat double precision, user_lng double precision, search_radius double precision)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code,
    ticket_data.min_price, ticket_data.currency,
    occ_data.occurrences, e.featured
  FROM event e
  LEFT JOIN LATERAL (
    SELECT MIN(tt.price) AS min_price, MIN(tt.currency) AS currency
    FROM ticket_type tt WHERE tt.event_id = e.id
  ) ticket_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(json_build_object('id', occ.id, 'starts_at', occ.starts_at, 'ends_at', occ.ends_at) ORDER BY occ.starts_at ASC)
        ELSE
          json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
      END AS occurrences
    FROM event_occurrence occ WHERE occ.event_id = e.id
  ) occ_data ON TRUE
  WHERE
    e.status = 'published'
    AND e.moderation_state IS DISTINCT FROM 'hidden'
    AND e.moderation_state IS DISTINCT FROM 'removed'
    AND public.listing_market_visible(e.country_code)
    AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326), search_radius)
    AND (
      EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id AND o.ends_at > now())
      OR (
        NOT EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    )
  ORDER BY
    (SELECT MIN(o2.starts_at) FROM event_occurrence o2 WHERE o2.event_id = e.id AND o2.ends_at > now()) NULLS LAST,
    e.starts_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_nearby_events(user_lat double precision, user_lng double precision, search_radius double precision, p_cursor_sort_key timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, cursor_sort_key timestamp with time zone, attendance_count bigint, ticket_types json, organizer_avg_rating numeric, organizer_rating_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  return query
  with candidate as (
    select
      e.id,
      coalesce(fo.next_start, 'infinity'::timestamptz) as sort_key
    from event e
    left join lateral (
      select
        min(o.starts_at) filter (where o.ends_at > now()) as next_start,
        count(*) as total
      from event_occurrence o
      where o.event_id = e.id
    ) fo on true
    where
      e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and public.listing_market_visible(e.country_code)
      and st_dwithin(
        e.location,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326),
        search_radius
      )
      and (
        fo.next_start is not null
        or (
          coalesce(fo.total, 0) = 0
          and (
            e.ends_at > now()
            or (e.ends_at is null and e.starts_at > now())
          )
        )
      )
  ),
  page as (
    select c.id, c.sort_key
    from candidate c
    where
      p_cursor_id is null
      or (c.sort_key, c.id) > (p_cursor_sort_key, p_cursor_id)
    order by c.sort_key asc, c.id asc
    limit p_page_size + 1
  ),
  -- One pass over `review` for the page's distinct organizers (same
  -- predicate as get_user_rating), not one per event row.
  organizer_rating as (
    select
      r.reviewed_id,
      avg(r.rating)::numeric as avg_rating,
      count(*)::integer as rating_count
    from review r
    where r.reviewed_id in (
      select distinct e2.organizer_id from page p2 join event e2 on e2.id = p2.id
    )
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
    group by r.reviewed_id
  )
  select
    e.id,
    e.organizer_id,
    e.event_category,
    e.event_type,
    e.title,
    e.slug,
    e.location,
    e.address,
    e.website_url,
    e.capacity,
    e.flyer_public_id,
    e.flyer_version,
    e.starts_at,
    e.ends_at,
    e.status,
    e.created_at,
    e.event_code,
    ticket_data.min_price,
    ticket_data.currency,
    occ_data.occurrences,
    e.featured,
    p.sort_key as cursor_sort_key,
    coalesce(att.attendance_count, 0)::bigint as attendance_count,
    ticket_data.ticket_types,
    coalesce(orr.avg_rating, 0)::numeric as organizer_avg_rating,
    coalesce(orr.rating_count, 0)::integer as organizer_rating_count
  from page p
  join event e on e.id = p.id
  left join organizer_rating orr on orr.reviewed_id = e.organizer_id
  left join lateral (
    select
      min(tt.price) as min_price,
      min(tt.currency) as currency,
      json_agg(
        json_build_object('price', tt.price, 'currency', tt.currency, 'quantity', tt.quantity)
        order by tt.price asc
      ) as ticket_types
    from ticket_type tt
    where tt.event_id = e.id
  ) ticket_data on true
  left join lateral (
    select sum(a.number_of_tickets) as attendance_count
    from attendance a
    where a.event_id = e.id and a.status = 'attending'
  ) att on true
  left join lateral (
    select
      case
        when count(*) > 0 then
          json_agg(
            json_build_object(
              'id', occ.id,
              'starts_at', occ.starts_at,
              'ends_at', occ.ends_at
            )
            order by occ.starts_at asc
          )
        else
          json_build_array(
            json_build_object(
              'id', null,
              'starts_at', e.starts_at,
              'ends_at', e.ends_at
            )
          )
      end as occurrences
    from event_occurrence occ
    where occ.event_id = e.id
  ) occ_data on true
  order by p.sort_key asc, p.id asc;
end;
$function$;

-- get_filtered_places: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_filtered_places(p_search_text text DEFAULT NULL::text, p_category_id smallint DEFAULT NULL::smallint, p_min_rating numeric DEFAULT NULL::numeric, p_open_now boolean DEFAULT NULL::boolean, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
      pc.name AS category_name, pc.slug AS category_slug,
      p.location, p.address, p.website_url, p.phone, p.whatsapp,
      p.cover_public_id, p.cover_version, p.status, p.temporary_status,
      p.claimed, p.verified, p.created_at,
      review_data.avg_rating, review_data.review_count,
      public.place_is_open_now(p.id) AS is_open,
      CASE
        WHEN p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)) / 1000.0
        ELSE NULL
      END AS distance_km
    FROM place p
    JOIN place_category pc ON pc.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
      FROM place_review r
      WHERE r.place_id = p.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
    ) review_data ON TRUE
    WHERE
      p.status = 'published'
      AND p.moderation_state IS DISTINCT FROM 'hidden'
      AND p.moderation_state IS DISTINCT FROM 'removed'
      AND public.listing_market_visible(p.country_code)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search_text IS NULL OR p_search_text = '' OR p.name ILIKE '%' || p_search_text || '%' OR p.description ILIKE '%' || p_search_text || '%')
      AND (p_min_rating IS NULL OR COALESCE(review_data.avg_rating, 0) >= p_min_rating)
      AND (p_open_now IS NOT TRUE OR public.place_is_open_now(p.id))
      AND (
        p_max_distance_km IS NULL OR p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326), p_max_distance_km * 1000)
      )
  )
  SELECT
    m.id, m.owner_id, m.name, m.slug, m.description, m.category_id,
    m.category_name, m.category_slug, m.location, m.address, m.website_url,
    m.phone, m.whatsapp, m.cover_public_id, m.cover_version, m.status,
    m.temporary_status, m.claimed, m.verified, m.created_at,
    m.avg_rating, m.review_count, m.is_open, m.distance_km,
    COALESCE(m.distance_km, 0) AS cursor_distance_km
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (COALESCE(m.distance_km, 0), m.id) > (p_cursor_distance, p_cursor_id)
  ORDER BY COALESCE(m.distance_km, 0) ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- get_nearby_places: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_nearby_places(user_lat double precision, user_lng double precision, search_radius double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
      pc.name AS category_name, pc.slug AS category_slug,
      p.location, p.address, p.website_url, p.phone, p.whatsapp,
      p.cover_public_id, p.cover_version, p.status, p.temporary_status,
      p.claimed, p.verified, p.created_at,
      review_data.avg_rating, review_data.review_count,
      public.place_is_open_now(p.id) AS is_open,
      ST_Distance(p.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)) / 1000.0 AS distance_km
    FROM place p
    JOIN place_category pc ON pc.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
      FROM place_review r
      WHERE r.place_id = p.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
    ) review_data ON TRUE
    WHERE
      p.status = 'published'
      AND p.moderation_state IS DISTINCT FROM 'hidden'
      AND p.moderation_state IS DISTINCT FROM 'removed'
      AND public.listing_market_visible(p.country_code)
      AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326), search_radius)
  )
  SELECT
    m.id, m.owner_id, m.name, m.slug, m.description, m.category_id,
    m.category_name, m.category_slug, m.location, m.address, m.website_url,
    m.phone, m.whatsapp, m.cover_public_id, m.cover_version, m.status,
    m.temporary_status, m.claimed, m.verified, m.created_at,
    m.avg_rating, m.review_count, m.is_open, m.distance_km,
    m.distance_km AS cursor_distance_km
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.distance_km, m.id) > (p_cursor_distance, p_cursor_id)
  ORDER BY m.distance_km ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- get_active_place_promotions: 1 listing filter(s)
CREATE OR REPLACE FUNCTION public.get_active_place_promotions(p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, promotion_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_promo AS (
    SELECT DISTINCT ON (place_id) place_id, ends_at
    FROM place_promotion
    WHERE ends_at > now()
    ORDER BY place_id, ends_at DESC
  )
  SELECT
    p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
    pc.name AS category_name, pc.slug AS category_slug,
    p.location, p.address, p.website_url, p.phone, p.whatsapp,
    p.cover_public_id, p.cover_version, p.status, p.temporary_status,
    p.claimed, p.verified, p.created_at,
    review_data.avg_rating, review_data.review_count,
    public.place_is_open_now(p.id) AS is_open,
    CASE
      WHEN p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)) / 1000.0
      ELSE NULL
    END AS distance_km,
    ap.ends_at AS promotion_ends_at
  FROM active_promo ap
  JOIN place p ON p.id = ap.place_id
  JOIN place_category pc ON pc.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
    FROM place_review r
    WHERE r.place_id = p.id
      AND r.status = 'approved'
      AND r.moderation_state IS DISTINCT FROM 'hidden'
      AND r.moderation_state IS DISTINCT FROM 'removed'
  ) review_data ON TRUE
  WHERE
    p.status = 'published'
    AND p.moderation_state IS DISTINCT FROM 'hidden'
    AND p.moderation_state IS DISTINCT FROM 'removed'
    AND public.listing_market_visible(p.country_code)
    AND (
      p_max_distance_km IS NULL OR p_user_lat IS NULL OR p_user_lng IS NULL
      OR ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326), p_max_distance_km * 1000)
    )
  -- The whole point of this RPC: a real, per-request random ordering so no
  -- single advertiser can buy the top slot and permanently keep it.
  ORDER BY random()
  LIMIT p_limit;
END;
$function$;

-- search_organizers: 2 listing filter(s)
CREATE OR REPLACE FUNCTION public.search_organizers(p_query text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_as_of timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_score numeric DEFAULT NULL::numeric, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, username text, full_name text, avatar_public_id text, avatar_version text, bio text, organizer_verified boolean, event_count bigint, upcoming_count bigint, place_count bigint, avg_rating numeric, rating_count bigint, is_new boolean, score numeric, as_of timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and public.listing_market_visible(e.country_code)
    ) ev on true
    left join lateral (
      select count(*) as place_count
      from public.place p
      where p.owner_id = u.id and p.status = 'published'
        and p.moderation_state is distinct from 'hidden'
        and p.moderation_state is distinct from 'removed'
        and public.listing_market_visible(p.country_code)
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
$function$;
