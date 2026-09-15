-- Discovery search: find places by what they offer (place_service).
--
-- A place's services and amenities ("swimming pool", "private room",
-- "braids") live in place_service, one row per service, so the place's own
-- generated search_tsv could not include them (a generated column cannot
-- read another table). Searching "pool" found only places with the word in
-- their name, address or description.
--
-- Adds:
--   * place_service.search_tsv  generated (name A; description C), with a GIN
--                               index. Rows are few per place, so this stays
--                               small next to place.search_tsv.
--   * _search_place_pool        a third UNION branch for places whose
--                               services match. Such a place scores below a
--                               name or category match: its text term uses
--                               the best service rank at 60%, and its
--                               exact-match term is 0.30 (a category match
--                               is 0.35). The trigram fallback skips places
--                               a service already matched, as it already
--                               skips text and category matches.
--
-- search_places and search_suggest read the pool, so result pages and
-- type-ahead both gain service matches. Only published, visible places are
-- returned, exactly as before. Signature and grants are unchanged.

alter table public.place_service
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, left(coalesce(description, ''), 500)), 'C')
  ) stored;

comment on column public.place_service.search_tsv is
  'Search document (service name A; description C). Generated; read by _search_place_pool so places are found by what they offer.';

create index if not exists idx_place_service_search_tsv
  on public.place_service using gin (search_tsv);

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
  with svc as materialized (
    select s.place_id,
           max(pg_catalog.ts_rank_cd('{0.1,0.2,0.4,1.0}'::float4[], s.search_tsv,
                                     coalesce(v_prefix, v_web), 32)) as rank
    from public.place_service s
    where s.search_tsv @@ v_prefix or s.search_tsv @@ v_web
    group by s.place_id
  ),
  matched as (
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
    union
    select svc.place_id from svc
  )
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
    )::double precision as text_score
  from matched m
  join public.place p on p.id = m.id
  left join svc on svc.place_id = p.id
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
    and not exists (
      select 1 from public.place_service s
      where s.place_id = p.id
        and (s.search_tsv @@ v_prefix or s.search_tsv @@ v_web))
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit greatest(p_limit - v_found, 0);
end;
$$;
