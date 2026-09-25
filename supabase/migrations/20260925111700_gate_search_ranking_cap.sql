-- Production gate 2026-09-25: a broad search never ranks an unbounded
-- number of listings.
--
-- On the scripts/perf catalogue (100,000 events and 20,000 places near
-- Accra) a word found in nearly every listing ("accra") made each ranking
-- branch of _search_event_pool / _search_place_pool score every match:
-- 91,661 rows per branch, three branches, then a disk sort to de-duplicate
-- — 2.6 s for one search_events call and 1.0 s for search_suggest, and the
-- PostgREST pool timed out at 50 concurrent searches. Most of the cost is
-- per matching row (the time-window check and the text rank), so the fix
-- bounds the number of rows each branch evaluates:
--
--   every ranking branch (precise, dated, related, relaxed, trigram, and
--   the place-service matches) now takes at most v_cap = greatest(p_limit,
--   1500) matching rows and ranks those. The LIMIT sits after every filter
--   (market, moderation, radius, date window, category, organizer), so a
--   location- or date-restricted search is never cut short by listings
--   outside its area or window.
--
-- Below the cap the results are exactly the same as before (compared on the
-- perf catalogue for rare, mid-frequency, located, typo and place queries).
-- Above it, the best-ranked of the first v_cap matches are returned — the
-- trade-off for bounded work; it only arises when more than 1,500 listings
-- match every filter. Measured: search_events "accra music" 2.6 s → 115 ms,
-- "accra" 38 ms, search_suggest "acc" 1.0 s → 38 ms, search_places "accra"
-- 28 ms.

create or replace function public._search_event_pool(p_norm text, p_organizer_id uuid, p_category text, p_origin geography, p_radius_km double precision, p_as_of timestamp with time zone, p_limit integer)
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
  -- Ranking work is bounded: each branch scores at most this many matching
  -- rows (migration 20260925111700). Below it, results are exactly what
  -- they were; above it, the best of the first v_cap matches are returned.
  v_cap     integer := greatest(coalesce(p_limit, 0), 1500);
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
      and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
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
    (select e.id,
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
      and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
      and (e.search_tsv @@ v_prefix or e.search_tsv @@ v_web)
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
    limit v_cap)

    union all
    -- 1b. the whole query, date words included, as text (dated queries only)
    (select e.id,
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
      and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
      and (e.search_tsv @@ v_fprefix or e.search_tsv @@ v_fweb)
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, p_as_of, null)
    limit v_cap)

    union all
    -- 2. related (concept vocabulary)
    (select e.id,
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
      and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
      and e.search_tsv @@ v_related
      and (p_organizer_id is null or e.organizer_id = p_organizer_id)
      and (v_cat is null or lower(e.event_category) = lower(v_cat))
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
      and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
    limit v_cap)
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
        select m0.id, m0.s from (
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
          and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
          and e.search_tsv @@ v_relaxed
          and e.id <> all (v_ids)
          and (p_organizer_id is null or e.organizer_id = p_organizer_id)
          and (v_cat is null or lower(e.event_category) = lower(v_cat))
          and (p_origin is null or p_radius_km is null
               or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
          and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
        limit v_cap
        ) m0
        order by 2 desc, m0.id
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
  select t.id, t.text_score from (
  select e.id,
    (
      0.30 * (case
                when lower(e.title) like public._search_like_escape(p_norm) || '%' escape '\' then 0.7
                when lower(e.title) like '% ' || public._search_like_escape(p_norm) || '%' escape '\' then 0.4
                else 0.0
              end)
      + 0.50 * extensions.word_similarity(p_norm, e.title)
      + 0.20 * extensions.similarity(e.title, p_norm)
    )::double precision as text_score,
    e.starts_at
  from public.event e
  where e.status = 'published'
    and e.archived_at is null
    and e.moderation_state is distinct from 'hidden'
    and e.moderation_state is distinct from 'removed'
    and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
    and p_norm operator(extensions.<%) e.title
    and e.id <> all (v_ids)
    and (p_organizer_id is null or e.organizer_id = p_organizer_id)
    and (v_cat is null or lower(e.event_category) = lower(v_cat))
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
    and public._search_event_in_window(e.id, e.starts_at, e.ends_at, p_as_of, null)
  limit v_cap
  ) t
  order by t.text_score desc, t.starts_at asc nulls last, t.id
  limit greatest(p_limit - v_found, 0);
end;
$function$

;

create or replace function public._search_place_pool(p_norm text, p_category_id smallint, p_origin geography, p_radius_km double precision, p_limit integer)
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
  -- Ranking work is bounded: each branch scores at most this many matching
  -- rows (migration 20260925111700). Below it, results are exactly what
  -- they were; above it, the best of the first v_cap matches are returned.
  v_cap     integer := greatest(coalesce(p_limit, 0), 1500);
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
      and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
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
    from (select s0.place_id, s0.search_tsv
            from public.place_service s0
           where s0.search_tsv @@ v_prefix or s0.search_tsv @@ v_web
           limit v_cap) s
    group by s.place_id
  ),
  related_svc as materialized (
    select s.place_id
    from (select s0.place_id
            from public.place_service s0
           where v_related is not null and s0.search_tsv @@ v_related
           limit v_cap) s
    group by s.place_id
  ),
  cand as (
    -- 1. precise: text, category name, services (as before)
    (select p.id,
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
      and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
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
    limit v_cap)

    union all
    -- 2. related: vocabulary words in the place or its services
    (select p.id,
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
      and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
      and p.temporary_status is distinct from 'permanently_closed'
      and (p.search_tsv @@ v_related or rs.place_id is not null)
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
    limit v_cap)
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
        select m0.id, m0.s from (
        select p.id,
          (0.35 * (
            0.50 * pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], p.search_tsv, v_relaxed, 32)
            + 0.20 * extensions.similarity(coalesce(p.name, ''), p_norm)
          ))::double precision as s
        from public.place p
        where p.status = 'published'
          and p.moderation_state is distinct from 'hidden'
          and p.moderation_state is distinct from 'removed'
          and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
          and p.temporary_status is distinct from 'permanently_closed'
          and p.search_tsv @@ v_relaxed
          and p.id <> all (v_ids)
          and (p_category_id is null or p.category_id = p_category_id)
          and (p_origin is null or p_radius_km is null
               or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
        limit v_cap
        ) m0
        order by 2 desc, m0.id
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
  select t.id, t.text_score from (
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
    and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
    and p.temporary_status is distinct from 'permanently_closed'
    and p_norm operator(extensions.<%) p.name
    and p.id <> all (v_ids)
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  limit v_cap
  ) t
  order by t.text_score desc, t.id
  limit greatest(p_limit - v_found, 0);
end;
$function$

;
