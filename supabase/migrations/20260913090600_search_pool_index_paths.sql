-- Discovery search: index-friendly candidate matching.
--
-- Measured with the synthetic harness in scripts/perf (100,000 events,
-- 20,000 places, 50,000 accounts). Two stage-1 predicates defeated the
-- indexes, so Postgres read every row:
--   * places: "text matches OR category_id = any(category ids)" planned as a
--     sequential scan of place, even when no category name matched;
--   * organizers: an OR of two trigram tests (username, full name) and a
--     LIKE on lower(full_name) planned as sequential scans of user_info,
--     about 105 ms at 50,000 accounts and growing with every sign-up.
-- Each OR becomes a UNION of branches that can each use their own index
-- (partial GIN on search_tsv, the category btree, the two trigram GINs, the
-- username prefix btree). Display-name word starts in "@" mode are found
-- through the A-weighted lexemes of search_tsv and confirmed with the same
-- LIKE as before, so what matches and how it scores is unchanged.
-- _search_event_pool already used its indexes and is not redefined.
-- Signatures and grants are unchanged.

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
      and p.temporary_status is distinct from 'permanently_closed'
      and p.category_id = p_category_id
      and (p_origin is null or p_radius_km is null
           or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
    order by p.created_at desc, p.id
    limit p_limit;
    return;
  end if;

  select coalesce(array_agg(c.id), '{}')
    into v_cat_ids
  from public.place_category c
  where lower(c.name) like '%' || public._search_like_escape(p_norm) || '%' escape '\'
     or c.slug = replace(p_norm, ' ', '-');

  return query
  with matched as (
    select p.id
    from public.place p
    where p.status = 'published'
      and p.moderation_state is distinct from 'hidden'
      and p.moderation_state is distinct from 'removed'
      and (p.search_tsv @@ v_prefix or p.search_tsv @@ v_web)
    union
    select p.id
    from public.place p
    where p.category_id = any (v_cat_ids)
  )
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
  from matched m
  join public.place p on p.id = m.id
  where p.status = 'published'
    and p.moderation_state is distinct from 'hidden'
    and p.moderation_state is distinct from 'removed'
    and p.temporary_status is distinct from 'permanently_closed'
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit p_limit;
  get diagnostics v_found = row_count;

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
    and p.temporary_status is distinct from 'permanently_closed'
    and p_norm operator(extensions.<%) p.name
    and not coalesce(p.search_tsv @@ v_prefix, false)
    and not coalesce(p.search_tsv @@ v_web, false)
    and not (p.category_id = any (v_cat_ids))
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit greatest(p_limit - v_found, 0);
end;
$$;

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
  v_like_n  text := public._search_like_escape(coalesce(p_norm, '')) || '%';
  v_name_tsq tsquery;
  v_trigram boolean;
  v_found   integer := 0;
begin
  perform public._search_trgm_thresholds();

  if v_handle is not null then
    v_trigram := length(v_handle) >= 3;
    -- Word starts in the display name: the A-weighted lexemes of search_tsv
    -- narrow the rows through the index, the LIKE keeps the exact rule.
    select pg_catalog.to_tsquery('simple', string_agg(t.tok || ':*A', ' & '))
      into v_name_tsq
    from regexp_split_to_table(v_handle, '[^[:alnum:]]+') as t(tok)
    where t.tok <> '';

    return query
    with matched as (
      select u2.id
      from public.user_info u2
      where u2.status_id = 1
        and lower(u2.username::text) like v_like_h escape '\'
      union
      select u2.id
      from public.user_info u2
      where u2.status_id = 1
        and v_name_tsq is not null
        and u2.search_tsv @@ v_name_tsq
        and (lower(coalesce(u2.full_name, '')) like v_like_h escape '\'
             or lower(coalesce(u2.full_name, '')) like v_like_hw escape '\')
    )
    select u.id,
      (case
         when lower(u.username::text) = v_handle then 1.0
         when lower(u.username::text) like v_like_h escape '\' then 0.8
         else 0.6
       end)::double precision as text_score
    from matched m
    join public.user_info u on u.id = m.id
    where (
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
    get diagnostics v_found = row_count;

    if not v_trigram or v_found >= least(5, p_limit) then
      return;
    end if;

    return query
    select u.id,
      (0.5 * extensions.similarity(u.username::text, v_handle))::double precision as text_score
    from public.user_info u
    where u.status_id = 1
      and u.username::text operator(extensions.%) v_handle
      and not (lower(u.username::text) like v_like_h escape '\')
      and not (lower(coalesce(u.full_name, '')) like v_like_h escape '\')
      and not (lower(coalesce(u.full_name, '')) like v_like_hw escape '\')
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
    limit greatest(p_limit - v_found, 0);
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
                  when lower(u.username::text) like v_like_n escape '\'
                    or lower(coalesce(u.full_name, '')) like v_like_n escape '\' then 0.7
                  else 0.0
                end)
      + 0.20 * greatest(extensions.similarity(u.username::text, p_norm),
                        extensions.similarity(coalesce(u.full_name, ''), p_norm))
    )::double precision as text_score
  from public.user_info u
  where u.status_id = 1
    and (u.search_tsv @@ v_prefix or u.search_tsv @@ v_web)
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
  get diagnostics v_found = row_count;

  if not v_trigram or v_found >= least(5, p_limit) then
    return;
  end if;

  return query
  select u.id,
    (
      0.50 * greatest(extensions.word_similarity(p_norm, u.username::text),
                      extensions.word_similarity(p_norm, coalesce(u.full_name, '')))
      + 0.20 * greatest(extensions.similarity(u.username::text, p_norm),
                        extensions.similarity(coalesce(u.full_name, ''), p_norm))
    )::double precision as text_score
  from (
    select u2.id from public.user_info u2
    where u2.status_id = 1 and p_norm operator(extensions.<%) u2.username::text
    union
    select u2.id from public.user_info u2
    where u2.status_id = 1 and p_norm operator(extensions.<%) u2.full_name
  ) m
  join public.user_info u on u.id = m.id
  where u.status_id = 1
    and not coalesce(u.search_tsv @@ v_prefix, false)
    and not coalesce(u.search_tsv @@ v_web, false)
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
  limit greatest(p_limit - v_found, 0);
end;
$$;
