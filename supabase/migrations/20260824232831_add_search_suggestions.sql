-- Search autocomplete/suggestions.
--
-- Context: the search bar (FilterSearchBar.tsx) has no live suggestions today
-- -- it's a plain controlled input with no per-keystroke query at all. The
-- existing text-search paths (get_filtered_events / get_filtered_places,
-- called from getQueriedEvents.ts / getQueriedPlaces.ts) are not suitable to
-- call on every keystroke: they do leading-wildcard ILIKE with no supporting
-- index (a sequential scan today), plus LATERAL joins for ratings/prices/
-- occurrences and full-row selects that autocomplete doesn't need.
--
-- This migration is purely additive -- it does not touch get_filtered_events,
-- get_filtered_places, or any existing table/RLS/trigger:
--   1. Enables pg_trgm and adds GIN trigram indexes on event.title and
--      place.name, the two columns a suggestion query actually filters on.
--      A trigram GIN index is what lets '%text%' ILIKE (and pg_trgm's '%'
--      similarity operator, used below for basic typo tolerance) use an
--      index instead of a full scan.
--   2. Adds two new, narrow, read-only functions -- get_event_suggestions and
--      get_place_suggestions -- returning only the columns the dropdown
--      needs (id/title/slug/route-key/thumbnail), ranked exact > prefix >
--      substring > fallback (category/type or trigram-similarity) match, and
--      LIMITed. Same status='published' + "not yet ended" convention as
--      get_filtered_events/get_similar_events, so drafts, canceled events,
--      and past events never appear as suggestions.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_event_title_trgm
  ON public.event USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_place_name_trgm
  ON public.place USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_event_suggestions (
  p_search_text text,
  p_limit       integer DEFAULT 5
)
  RETURNS TABLE (
    id              uuid,
    title           text,
    slug            text,
    event_code      text,
    event_category  text,
    flyer_public_id text,
    flyer_version   character varying,
    starts_at       timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.title, e.slug, e.event_code, e.event_category,
    e.flyer_public_id, e.flyer_version, e.starts_at
  FROM public.event e
  WHERE
    e.status = 'published'
    AND (
      EXISTS (
        SELECT 1 FROM public.event_occurrence o
        WHERE o.event_id = e.id AND o.ends_at > now()
      )
      OR (
        NOT EXISTS (SELECT 1 FROM public.event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    )
    AND (
      e.title ILIKE '%' || p_search_text || '%'
      OR e.title % p_search_text
      OR e.event_category ILIKE '%' || p_search_text || '%'
      OR e.event_type ILIKE '%' || p_search_text || '%'
    )
  ORDER BY
    CASE
      WHEN lower(e.title) = lower(p_search_text) THEN 0
      WHEN lower(e.title) LIKE lower(p_search_text) || '%' THEN 1
      WHEN lower(e.title) LIKE '%' || lower(p_search_text) || '%' THEN 2
      ELSE 3
    END,
    e.starts_at ASC
  LIMIT p_limit;
END;
$function$;

GRANT ALL ON FUNCTION public.get_event_suggestions(text, integer) TO anon;
GRANT ALL ON FUNCTION public.get_event_suggestions(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_event_suggestions(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_place_suggestions (
  p_search_text text,
  p_limit       integer DEFAULT 4
)
  RETURNS TABLE (
    id              uuid,
    name            text,
    slug            text,
    category_id     smallint,
    cover_public_id text,
    cover_version   character varying
  )
  LANGUAGE plpgsql
  STABLE
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.slug, p.category_id, p.cover_public_id, p.cover_version
  FROM public.place p
  WHERE
    p.status = 'published'
    AND (
      p.name ILIKE '%' || p_search_text || '%'
      OR p.name % p_search_text
    )
  ORDER BY
    CASE
      WHEN lower(p.name) = lower(p_search_text) THEN 0
      WHEN lower(p.name) LIKE lower(p_search_text) || '%' THEN 1
      WHEN lower(p.name) LIKE '%' || lower(p_search_text) || '%' THEN 2
      ELSE 3
    END,
    p.name ASC
  LIMIT p_limit;
END;
$function$;

GRANT ALL ON FUNCTION public.get_place_suggestions(text, integer) TO anon;
GRANT ALL ON FUNCTION public.get_place_suggestions(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_place_suggestions(text, integer) TO service_role;
