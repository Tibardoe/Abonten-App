-- Discovery search: related terms, dates and multi-word recall.
--
-- The search documents (search_v2_foundation) index titles, categories,
-- types, addresses and descriptions with the 'simple' configuration, and a
-- query had to match every word of it, literally (last word as a prefix).
-- That left natural queries with nothing:
--   * "gob3", "food", "chop bar" — the relationship between a dish or a kind
--     of place and the words listings actually use (beans, plantain,
--     restaurant, eatery) was not represented anywhere;
--   * "december", "this weekend" — dates are not words in a document;
--   * "afro wave" — a title spelled "Afrowave", or a listing that has one of
--     the words but not both.
--
-- Adds, all additive (signatures and grants of the public RPCs unchanged):
--
--   * search_concept — a curated vocabulary: a term people type and the
--     words that express it in listings, per result type. Data, not code:
--     rows are added or switched off without a deploy, and nothing here
--     special-cases a query. Seeded with a Ghana-focused starter set.
--     Service-role only (RLS on, no policies, no client grants).
--   * _search_temporal(query, as_of) — reads month names and today /
--     tonight / tomorrow / weekend out of a query as an Africa/Accra date
--     window and returns the remaining words.
--   * _search_related_tsquery(query, scope) — concept expansion, both ways
--     (a term finds its words; one of the words finds the term).
--   * _search_relaxed_tsquery(query) — for multi-word queries only: any of
--     the meaningful words, plus the words run together ("afro wave" ->
--     "afrowave").
--   * _search_event_in_window(...) — "has an occurrence overlapping this
--     window", the upcoming-event rule generalised to a date range.
--   * _search_event_pool / _search_place_pool rebuilt as tiers, each scored
--     below the one before, so a precise match always outranks a related
--     one:
--        1. precise   full text (all words; last word as prefix)   as before
--        2. related   concept expansion                            x 0.6
--        3. relaxed   any word / run-together, only when 1+2 found
--                     fewer than five                              x 0.35
--        4. trigram   typo fallback, only when still fewer than
--                     five                                         as before
--     Events also take the date window from the query: "jazz december"
--     finds jazz events in December; "december" alone lists December's
--     events; a title that literally says "December" still matches.
--   * search_spotlight gains the same concept expansion for captions and
--     hashtags.
--
-- Cost: tiers 2 and 3 are GIN index scans on the existing partial indexes;
-- tier 3 runs only when the earlier tiers came back thin. Measure with
-- scripts/perf/ before widening any pool.

-- ---------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------
create table if not exists public.search_concept (
  id          bigint generated always as identity primary key,
  term        text        not null,
  expands_to  text[]      not null,
  applies_to  text[]      not null default array['event', 'place', 'spotlight'],
  enabled     boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint search_concept_term_unique unique (term),
  constraint search_concept_term_normalized check (term = lower(btrim(term)) and term <> ''),
  constraint search_concept_expands_nonempty check (cardinality(expands_to) between 1 and 30),
  constraint search_concept_scope_check check (
    applies_to <@ array['event', 'place', 'spotlight'] and cardinality(applies_to) >= 1
  )
);

comment on table public.search_concept is
  'Search vocabulary: a term people type (lower case) and the words that express it in listings. Read only by the search_* functions (SECURITY DEFINER). Edit with SQL / the admin tools; no client access.';

create index if not exists idx_search_concept_expands
  on public.search_concept using gin (expands_to);

alter table public.search_concept enable row level security;
revoke all on table public.search_concept from anon, authenticated;
grant all on table public.search_concept to service_role;

insert into public.search_concept (term, expands_to, applies_to, note) values
  -- Food and drink (Ghanaian dishes and the words menus and listings use)
  ('food', array['restaurant', 'chop bar', 'eatery', 'dining', 'cuisine', 'kitchen', 'grill', 'buffet', 'catering', 'food court'], array['event', 'place', 'spotlight'], 'Generic food intent'),
  ('chop bar', array['local food', 'waakye', 'banku', 'fufu', 'kenkey', 'restaurant', 'eatery'], array['place', 'spotlight'], null),
  ('restaurant', array['eatery', 'dining', 'chop bar', 'bistro', 'grill', 'kitchen', 'cafe'], array['event', 'place', 'spotlight'], null),
  ('gob3', array['gobe', 'beans', 'plantain', 'gari', 'red red', 'palm oil'], array['event', 'place', 'spotlight'], 'Beans and plantain'),
  ('gobe', array['gob3', 'beans', 'plantain', 'gari', 'red red'], array['event', 'place', 'spotlight'], null),
  ('red red', array['beans', 'plantain', 'gob3', 'gobe'], array['event', 'place', 'spotlight'], null),
  ('waakye', array['rice and beans', 'wakye', 'shito', 'gari', 'spaghetti'], array['event', 'place', 'spotlight'], null),
  ('kelewele', array['spicy plantain', 'plantain', 'kelewele'], array['event', 'place', 'spotlight'], null),
  ('jollof', array['jollof rice', 'rice', 'party rice'], array['event', 'place', 'spotlight'], null),
  ('banku', array['tilapia', 'okro', 'pepper', 'chop bar'], array['event', 'place', 'spotlight'], null),
  ('fufu', array['light soup', 'groundnut soup', 'palm nut soup', 'goat', 'chop bar'], array['event', 'place', 'spotlight'], null),
  ('kenkey', array['fried fish', 'shito', 'ga kenkey', 'fante kenkey'], array['event', 'place', 'spotlight'], null),
  ('kebab', array['khebab', 'chichinga', 'suya', 'grill', 'barbecue', 'bbq'], array['event', 'place', 'spotlight'], null),
  ('suya', array['kebab', 'khebab', 'chichinga', 'grill'], array['event', 'place', 'spotlight'], null),
  ('sobolo', array['bissap', 'hibiscus', 'drinks', 'juice'], array['event', 'place', 'spotlight'], null),
  ('drinks', array['bar', 'cocktails', 'lounge', 'pub', 'beer', 'wine', 'spot'], array['event', 'place', 'spotlight'], null),
  ('brunch', array['breakfast', 'cafe', 'buffet', 'restaurant'], array['event', 'place', 'spotlight'], null),
  ('coffee', array['cafe', 'coffee shop', 'espresso', 'bakery'], array['event', 'place', 'spotlight'], null),
  ('pizza', array['pizzeria', 'italian', 'restaurant'], array['event', 'place', 'spotlight'], null),

  -- Nights out and music
  ('party', array['club', 'rave', 'jam', 'jams', 'dj', 'night', 'turn up', 'celebration'], array['event', 'spotlight'], null),
  ('jams', array['party', 'jam', 'dj', 'club', 'rave'], array['event', 'spotlight'], null),
  ('club', array['nightclub', 'night club', 'lounge', 'dj', 'party'], array['event', 'place', 'spotlight'], null),
  ('nightlife', array['club', 'nightclub', 'lounge', 'bar', 'party', 'dj'], array['event', 'place', 'spotlight'], null),
  ('afrobeats', array['afrobeat', 'afro', 'afropop', 'afro pop', 'afro fusion', 'afrowave'], array['event', 'spotlight'], null),
  ('amapiano', array['piano', 'log drum', 'afro house'], array['event', 'spotlight'], null),
  ('hiplife', array['highlife', 'hip hop', 'ghana music'], array['event', 'spotlight'], null),
  ('highlife', array['hiplife', 'live band', 'palm wine music'], array['event', 'spotlight'], null),
  ('concert', array['live music', 'live show', 'gig', 'performance', 'live band', 'tour'], array['event', 'spotlight'], null),
  ('live music', array['concert', 'live band', 'gig', 'acoustic', 'performance'], array['event', 'place', 'spotlight'], null),
  ('karaoke', array['sing along', 'open mic', 'lounge'], array['event', 'place', 'spotlight'], null),
  ('comedy', array['stand up', 'standup', 'comedian', 'comic', 'laugh'], array['event', 'spotlight'], null),

  -- Faith, culture, family
  ('gospel', array['worship', 'praise', 'church', 'choir', 'crusade'], array['event', 'spotlight'], null),
  ('church', array['worship', 'service', 'gospel', 'praise', 'prayer'], array['event', 'place', 'spotlight'], null),
  ('festival', array['fest', 'carnival', 'fair', 'durbar', 'celebration'], array['event', 'spotlight'], null),
  ('culture', array['cultural', 'heritage', 'tradition', 'durbar', 'art', 'museum'], array['event', 'place', 'spotlight'], null),
  ('art', array['gallery', 'exhibition', 'painting', 'artist', 'craft'], array['event', 'place', 'spotlight'], null),
  ('kids', array['children', 'family', 'kid friendly', 'playground', 'fun fair'], array['event', 'place', 'spotlight'], null),
  ('family', array['kids', 'children', 'family friendly', 'picnic'], array['event', 'place', 'spotlight'], null),

  -- Places and activities
  ('beach', array['seaside', 'shore', 'coast', 'resort', 'beach party'], array['event', 'place', 'spotlight'], null),
  ('hotel', array['lodge', 'guest house', 'guesthouse', 'inn', 'resort', 'apartment'], array['place', 'spotlight'], null),
  ('bar', array['pub', 'lounge', 'drinking spot', 'spot', 'cocktails'], array['place', 'spotlight'], null),
  ('gym', array['fitness', 'workout', 'training', 'crossfit', 'aerobics'], array['event', 'place', 'spotlight'], null),
  ('fitness', array['gym', 'workout', 'aerobics', 'keep fit', 'yoga', 'run'], array['event', 'place', 'spotlight'], null),
  ('salon', array['hair', 'braids', 'barber', 'beauty', 'nails', 'spa'], array['place', 'spotlight'], null),
  ('spa', array['massage', 'wellness', 'beauty', 'salon'], array['place', 'spotlight'], null),
  ('shopping', array['mall', 'market', 'shop', 'boutique', 'store'], array['event', 'place', 'spotlight'], null),
  ('football', array['soccer', 'match', 'viewing centre', 'sports'], array['event', 'place', 'spotlight'], null),
  ('movies', array['cinema', 'film', 'movie', 'screening'], array['event', 'place', 'spotlight'], null),
  ('cinema', array['movies', 'movie', 'film', 'screening'], array['event', 'place', 'spotlight'], null),
  ('conference', array['summit', 'seminar', 'workshop', 'forum', 'talk', 'networking'], array['event', 'spotlight'], null),
  ('workshop', array['training', 'class', 'masterclass', 'seminar', 'bootcamp'], array['event', 'spotlight'], null)
on conflict (term) do nothing;

-- ---------------------------------------------------------------------
-- 2. Query helpers
-- ---------------------------------------------------------------------

-- Words that carry no meaning on their own; ignored by the relaxed tier so
-- "party in accra" does not match every listing that says "in".
create or replace function public._search_is_stopword(p_word text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_word = any (array[
    'a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
    'by', 'or', 'my', 'me', 'near', 'around', 'best', 'top', 'this', 'next',
    'is', 'are', 'from', 'events', 'event', 'place', 'places'
  ]);
$$;

/**
 * A date window read out of a query, in Africa/Accra time:
 *   month names (and 3-letter forms except "mar"/"may", which are ordinary
 *   words too) -> that month, this year or next if it has passed;
 *   today / tonight -> the rest of today; tomorrow -> tomorrow;
 *   weekend -> Friday 17:00 to Monday 00:00, this week's or, from Monday,
 *   the coming one.
 * Returns the query without those words (and without "this", "next", "in",
 * "on" once a date was found), or the query unchanged with a null window.
 */
create or replace function public._search_temporal(
  p_norm  text,
  p_as_of timestamptz
)
returns table (rest text, date_from timestamptz, date_to timestamptz)
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  v_tokens text[] := regexp_split_to_array(btrim(coalesce(p_norm, '')), '\s+');
  v_now    timestamp := coalesce(p_as_of, now()) at time zone 'Africa/Accra';
  v_today  date := v_now::date;
  v_keep   text[] := '{}';
  v_found  boolean := false;
  v_from   timestamp;
  v_to     timestamp;
  v_month  integer;
  v_year   integer;
  v_dow    integer;
  t        text;
begin
  if coalesce(btrim(p_norm), '') = '' then
    return query select coalesce(p_norm, ''), null::timestamptz, null::timestamptz;
    return;
  end if;

  foreach t in array v_tokens loop
    v_month := case t
      when 'january' then 1 when 'jan' then 1
      when 'february' then 2 when 'feb' then 2
      when 'march' then 3
      when 'april' then 4 when 'apr' then 4
      when 'june' then 6 when 'jun' then 6
      when 'july' then 7 when 'jul' then 7
      when 'august' then 8 when 'aug' then 8
      when 'september' then 9 when 'sept' then 9 when 'sep' then 9
      when 'october' then 10 when 'oct' then 10
      when 'november' then 11 when 'nov' then 11
      when 'december' then 12 when 'dec' then 12
      else null
    end;

    if not v_found and v_month is not null then
      v_year := extract(year from v_today)::integer;
      if v_month < extract(month from v_today)::integer then
        v_year := v_year + 1;
      end if;
      v_from := make_timestamp(v_year, v_month, 1, 0, 0, 0);
      v_to := v_from + interval '1 month';
      v_found := true;
    elsif not v_found and t in ('today', 'tonight') then
      v_from := v_now;
      v_to := (v_today + 1)::timestamp;
      v_found := true;
    elsif not v_found and t = 'tomorrow' then
      v_from := (v_today + 1)::timestamp;
      v_to := (v_today + 2)::timestamp;
      v_found := true;
    elsif not v_found and t in ('weekend', 'weekends') then
      -- isodow: Monday 1 ... Sunday 7
      v_dow := extract(isodow from v_today)::integer;
      v_from := (v_today + (5 - v_dow))::timestamp + interval '17 hours';
      if v_dow = 1 then
        v_from := (v_today + 4)::timestamp + interval '17 hours';
      end if;
      v_from := greatest(v_from, v_now);
      v_to := (v_today + (8 - v_dow))::timestamp;
      v_found := true;
    else
      v_keep := v_keep || t;
    end if;
  end loop;

  if not v_found then
    return query select p_norm, null::timestamptz, null::timestamptz;
    return;
  end if;

  select coalesce(string_agg(k, ' ' order by ord), '')
    into t
  from unnest(v_keep) with ordinality as u(k, ord)
  where k not in ('this', 'next', 'in', 'on', 'for', 'during');

  return query select
    t,
    (v_from at time zone 'Africa/Accra'),
    (v_to at time zone 'Africa/Accra');
end;
$$;

/**
 * The vocabulary's alternatives for one word or phrase, as an OR of
 * phrases (null when there are none). Both directions: a row whose term it
 * is contributes its words; a row that lists it contributes its term.
 */
create or replace function public._search_concept_alternatives(
  p_phrase text,
  p_scope  text
)
returns tsquery
language plpgsql
stable
parallel safe
security definer
set search_path = ''
as $$
declare
  v_q    tsquery;
  v_part tsquery;
  v_term text;
begin
  for v_term in
    select distinct x
    from (
      select unnest(c.expands_to) as x
      from public.search_concept c
      where c.enabled and p_scope = any (c.applies_to) and c.term = p_phrase
      union
      select c.term
      from public.search_concept c
      where c.enabled and p_scope = any (c.applies_to) and p_phrase = any (c.expands_to)
    ) s
    where x is not null and x <> p_phrase
  loop
    v_part := phraseto_tsquery('simple'::regconfig, v_term);
    if numnode(v_part) = 0 then
      continue;
    end if;
    v_q := case when v_q is null then v_part else v_q || v_part end;
  end loop;
  return v_q;
end;
$$;

/**
 * The query with each word (or two-word phrase) that the vocabulary knows
 * widened to its alternatives, the other words kept as they are:
 *   "gob3"            -> gob3:* | gobe | beans | plantain | ...
 *   "gob3 osu"        -> (gob3 | beans | plantain | ...) & osu:*
 *   "chop bar accra"  -> (chop <-> bar | waakye | banku | ...) & accra:*
 * Every word still has to be matched (by itself or an alternative), so an
 * expansion never turns a specific query into a broad one. Null when no
 * word has alternatives — then there is nothing beyond the precise tier.
 */
create or replace function public._search_related_tsquery(
  p_norm  text,
  p_scope text
)
returns tsquery
language plpgsql
stable
parallel safe
security definer
set search_path = ''
as $$
declare
  v_words    text[];
  v_n        integer;
  v_i        integer := 1;
  v_q        tsquery;
  v_part     tsquery;
  v_alt      tsquery;
  v_expanded boolean := false;
begin
  if coalesce(btrim(p_norm), '') = '' then
    return null;
  end if;
  select coalesce(array_agg(t order by ord), '{}')
    into v_words
  from (
    select t, ord
    from unnest(regexp_split_to_array(p_norm, '[^[:alnum:]]+'))
      with ordinality as u(t, ord)
    where t <> ''
    order by ord
    limit 8
  ) s;
  v_n := cardinality(v_words);
  if v_n = 0 then
    return null;
  end if;

  while v_i <= v_n loop
    v_alt := null;
    -- A two-word phrase the vocabulary knows ("chop bar", "red red").
    if v_i < v_n then
      v_alt := public._search_concept_alternatives(
        v_words[v_i] || ' ' || v_words[v_i + 1], p_scope);
      if v_alt is not null then
        v_part := phraseto_tsquery('simple'::regconfig,
                                   v_words[v_i] || ' ' || v_words[v_i + 1]) || v_alt;
        v_i := v_i + 2;
      end if;
    end if;
    if v_alt is null then
      -- The last word is a prefix, as in the precise tier.
      v_part := to_tsquery('simple'::regconfig,
                           v_words[v_i] || (case when v_i = v_n then ':*' else '' end));
      if length(v_words[v_i]) >= 3 and not public._search_is_stopword(v_words[v_i]) then
        v_alt := public._search_concept_alternatives(v_words[v_i], p_scope);
      end if;
      if v_alt is not null then
        v_part := v_part || v_alt;
      end if;
      v_i := v_i + 1;
    end if;
    if v_alt is not null then
      v_expanded := true;
    end if;
    v_q := case when v_q is null then v_part else v_q && v_part end;
  end loop;

  if not v_expanded then
    return null;
  end if;
  return v_q;
end;
$$;

/**
 * Multi-word queries only: any meaningful word (as a prefix), or the words
 * run together as one ("afro wave" -> "afrowave:*"). Null for one word.
 */
create or replace function public._search_relaxed_tsquery(p_norm text)
returns tsquery
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_all   text[];
  v_words text[];
  v_q     tsquery;
  w       text;
begin
  select coalesce(array_agg(t order by ord), '{}')
    into v_all
  from unnest(regexp_split_to_array(coalesce(p_norm, ''), '[^[:alnum:]]+'))
    with ordinality as u(t, ord)
  where t <> '';

  if cardinality(v_all) < 2 then
    return null;
  end if;

  select coalesce(array_agg(t), '{}')
    into v_words
  from unnest(v_all) t
  where length(t) >= 3 and not public._search_is_stopword(t);

  foreach w in array v_words loop
    v_q := case
      when v_q is null then to_tsquery('simple'::regconfig, w || ':*')
      else v_q || to_tsquery('simple'::regconfig, w || ':*')
    end;
  end loop;

  if cardinality(v_all) <= 3 then
    v_q := case
      when v_q is null then to_tsquery('simple'::regconfig, array_to_string(v_all, '') || ':*')
      else v_q || to_tsquery('simple'::regconfig, array_to_string(v_all, '') || ':*')
    end;
  end if;
  return v_q;
end;
$$;

/**
 * Whether an event is on (or still to come) inside [p_from, p_to): an
 * occurrence that overlaps the window, or — for an event without
 * occurrences — its own start/end. p_to null = open-ended (the usual
 * "upcoming" rule).
 */
create or replace function public._search_event_in_window(
  p_event_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_from      timestamptz,
  p_to        timestamptz
)
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when exists (select 1 from public.event_occurrence o where o.event_id = p_event_id) then
      exists (
        select 1 from public.event_occurrence o
        where o.event_id = p_event_id
          and o.ends_at > p_from
          and (p_to is null or o.starts_at < p_to)
      )
    else
      coalesce(p_ends_at, p_starts_at) > p_from
      and (p_to is null or p_starts_at < p_to)
  end;
$$;

revoke execute on function public._search_concept_alternatives(text, text) from public, anon, authenticated;
grant execute on function public._search_concept_alternatives(text, text) to service_role;
revoke execute on function public._search_related_tsquery(text, text) from public, anon, authenticated;
revoke execute on function public._search_temporal(text, timestamptz) from public, anon, authenticated;
revoke execute on function public._search_relaxed_tsquery(text) from public, anon, authenticated;
revoke execute on function public._search_event_in_window(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public._search_is_stopword(text) from public, anon, authenticated;
grant execute on function public._search_related_tsquery(text, text) to service_role;
grant execute on function public._search_temporal(text, timestamptz) to service_role;
grant execute on function public._search_relaxed_tsquery(text) to service_role;
grant execute on function public._search_event_in_window(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public._search_is_stopword(text) to service_role;

-- ---------------------------------------------------------------------
-- 3. Event pool (tiers + date window)
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

  select * into v_time from public._search_temporal(p_norm, p_as_of);
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
$$;

-- ---------------------------------------------------------------------
-- 4. Place pool (tiers)
-- ---------------------------------------------------------------------
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
    and p.temporary_status is distinct from 'permanently_closed'
    and p_norm operator(extensions.<%) p.name
    and p.id <> all (v_ids)
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  order by text_score desc, p.id
  limit greatest(p_limit - v_found, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Spotlight captions and hashtags
-- ---------------------------------------------------------------------
create or replace function public.search_spotlight(
  p_query  text,
  p_viewer uuid,
  p_limit  integer default 20
)
returns table (post_id uuid, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select
      websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq,
      public._search_related_tsquery(public._search_normalize(p_query), 'spotlight') as related,
      lower(regexp_replace(coalesce(p_query, ''), '^#', '')) as tag
  )
  select p.id,
         (
           (case when p.search_tsv @@ q.tsq then ts_rank(p.search_tsv, q.tsq) else 0 end)
           + (case when q.related is not null and p.search_tsv @@ q.related
                   then 0.6 * ts_rank(p.search_tsv, q.related) else 0 end)
           + (case when q.tag = any (p.hashtags) then 1.0 else 0 end)
           + least(p.trending_score, 1) * 0.2
         )::real as rank
  from public.content_post p, q
  where p.kind = 'spotlight'
    and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
    and p.moderation_state = 'visible'
    and (
      p.search_tsv @@ q.tsq
      or q.tag = any (p.hashtags)
      or (q.related is not null and p.search_tsv @@ q.related)
    )
    and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
    and not public.content_users_blocked(p_viewer, p.author_id)
  order by rank desc, p.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
