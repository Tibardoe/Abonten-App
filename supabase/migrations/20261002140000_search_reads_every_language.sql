-- Search reads the reader's language.
--
-- The apps speak French, Spanish, German and Portuguese since 2026-10-02,
-- but search still read English only, and letter for letter:
--
--   * "cafe" did not find "Café Kwae", "soiree" did not find "Soirée",
--     "odehyee" did not find "Ɔdehyeɛ" — a title or a query with an accent
--     or a Twi/Ewe/Ga letter only matched its exact spelling;
--   * "demain", "ce week-end", "este fin de semana", "im Dezember" were
--     looked up as words in listings: dates were read in English only;
--   * "plage", "iglesia", "Konzert", "festa" found nothing in a market
--     whose listings are written in English, and the other way round;
--   * the typo fallback of a dated search dropped the date: "afrobeats
--     december" brought in an "Afrobeats Summer Jam" held in June when
--     fewer than five results matched (a title sharing one long word
--     scores above the trigram threshold), and a typo was not forgiven
--     inside the dates ("afrobets december" found nothing in December).
--
-- What this does, all in Postgres, signatures and grants of the public
-- RPCs unchanged:
--
--   1. _search_fold(text): the one rule for "the same letters" — lower
--      case, accents removed (é -> e, ü -> u), letters with no accent form
--      mapped (ɔ -> o, ɛ -> e, ŋ -> n, ø -> o, ß -> ss, œ -> oe …), curly
--      quotes and long dashes made plain. Built-in functions only, no
--      extension, so it gives the same answer on every Postgres version.
--      packages/core/src/search/foldSearchText.ts mirrors it.
--   2. The search documents (search_tsv on event, place, user_info,
--      place_service, content_post) are regenerated from folded text, and
--      event, place and user_info get the folded title / name as a stored
--      column (search_title, search_name) for the exact, prefix and
--      trigram comparisons.
--   3. _search_normalize folds the query, so every search function
--      compares folded with folded.
--   4. Date words are data (search_date_term), in English, French,
--      Spanish, German and Portuguese, with multi-word forms ("ce soir",
--      "fin de semana", "heute abend") and the small words that lead into
--      a date ("en", "ce", "im", "este"), which are dropped only when they
--      stand right before it. English behaves exactly as before.
--   5. Stop words of the four languages join the English ones (relaxed
--      tier only, as before).
--   6. The vocabulary (search_concept) is folded on write and gains the
--      everyday words of the four languages, mapped to the words listings
--      use: "plage" finds a beach. A term now has a direction (two_way).
--      The new words are one way until listings are written in their
--      language: on the 100,000-event catalogue, letting "restaurant"
--      also look for seventeen words no listing contains took a place
--      search from 48 to 71 ms.
--   7. The typo fallback keeps the dates of a dated search: the words
--      without the date are matched inside the dates, and the query as
--      typed is matched outside them only against titles that say the
--      date word themselves ("December to Remember").
--   8. The other places a reader types words compare folded text too:
--      the older search the apps fall back to when unified search is
--      off, the inbox search, and the field team's duplicate check.
--
-- One rule throughout: nothing folds a column for every row of a scan.
-- Text is folded when it is written (the stored columns) or once per
-- search (the query). _search_fold is a few microseconds; a hundred
-- thousand of them is seconds.
--
-- Not read as dates: Portuguese "março" (without its cedilla it is the
-- name Marco) and weekday names in any language (English never had them).
-- The translations of the vocabulary and the date words were not reviewed
-- by a native speaker (decision D3).
--
-- Measure with scripts/perf/ before widening a pool.

-- ---------------------------------------------------------------------
-- 1. Folding
-- ---------------------------------------------------------------------

-- Lower case, then: split letters from their accents (NFD), drop the
-- accents (U+0300..U+036F), put the rest back together (NFC); spell out
-- the letters that are two (ß, œ, æ, þ, ĳ); map the letters that have no
-- accent form to the letter people type instead, in both cases in case
-- the platform's lower() does not know one:
--   ø ł đ ð ı ħ ŧ              -> o l d d i h t
--   ɔ ɛ ɖ ƒ ŋ ʋ ɣ  (Twi, Ewe, Ga) -> o e d f n v g
--   ƙ ɓ ɗ ƴ ə      (Hausa, Fula)  -> k b d y e
--   ’ ‘ ʼ -> '     “ ” -> "     – — -> -
create or replace function public._search_fold(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $function$
  select translate(
    replace(replace(replace(replace(replace(
      normalize(
        regexp_replace(normalize(lower(p_text), NFD), U&'[\0300-\036F]+', '', 'g'),
        NFC),
      U&'\00DF', 'ss'), U&'\0153', 'oe'), U&'\00E6', 'ae'), U&'\00FE', 'th'), U&'\0133', 'ij'),
    U&'\00F8\0142\0111\00F0\0131\0127\0167\0254\025B\0256\0192\014B\028B\0263\0199\0253\0257\01B4\0259\00D8\0141\0110\00D0\0126\0166\0186\0190\0189\0191\014A\01B2\0194\0198\0181\018A\01B3\018F\2019\2018\02BC\201C\201D\2013\2014',
    'olddihtoedfnvgkbdyeolddhtoedfnvgkbdye''''''""--');
$function$;

comment on function public._search_fold(text) is
  'Search folding: lower case, no accents, Twi/Ewe/Ga/Hausa letters as typed on a plain keyboard, plain quotes and dashes. The search documents and every query go through it. Mirrored by @abonten/core/search/foldSearchText.';

-- The search documents call it when a client updates its own row, so the
-- client roles need to run it. It reads nothing.
revoke all on function public._search_fold(text) from public;
grant execute on function public._search_fold(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Search documents, from folded text
-- ---------------------------------------------------------------------
-- A generated column's expression cannot be changed in place before
-- Postgres 17, so each document is dropped and added again (its index goes
-- with it and is created again below). Nothing else depends on them.

alter table public.event
  drop column if exists search_tsv,
  add column if not exists search_title text
    generated always as (public._search_fold(coalesce(title, ''))) stored,
  add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('simple'::regconfig, public._search_fold(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(coalesce(event_category, '') || ' ' || coalesce(event_type, ''))), 'B') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(coalesce(address ->> 'full_address', ''))), 'B') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(left(coalesce(description, ''), 2000))), 'C')
    ) stored;

alter table public.place
  drop column if exists search_tsv,
  add column if not exists search_name text
    generated always as (public._search_fold(coalesce(name, ''))) stored,
  add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('simple'::regconfig, public._search_fold(coalesce(name, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(coalesce(address ->> 'full_address', ''))), 'B') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(left(coalesce(description, ''), 2000))), 'C')
    ) stored;

alter table public.user_info
  drop column if exists search_tsv,
  add column if not exists search_name text
    generated always as (public._search_fold(coalesce(full_name, ''))) stored,
  add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(coalesce(username::text, '') || ' ' || coalesce(full_name, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(left(coalesce(bio, ''), 500))), 'C')
    ) stored;

alter table public.place_service
  drop column if exists search_tsv,
  add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('simple'::regconfig, public._search_fold(coalesce(name, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(left(coalesce(description, ''), 500))), 'C')
    ) stored;

alter table public.content_post
  drop column if exists search_tsv,
  add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('simple'::regconfig, public._search_fold(coalesce(caption, ''))), 'A') ||
      setweight(to_tsvector('simple'::regconfig,
        public._search_fold(public._content_hashtags_text(hashtags))), 'B')
    ) stored;

comment on column public.event.search_tsv is
  'Search document (title A; category, type, address B; description C), folded with _search_fold. Generated; read by search_* RPCs.';
comment on column public.event.search_title is
  'The title as search compares it (folded with _search_fold). Generated.';
comment on column public.place.search_tsv is
  'Search document (name A; address B; description C), folded with _search_fold. Generated; read by search_* RPCs.';
comment on column public.place.search_name is
  'The name as search compares it (folded with _search_fold). Generated.';
comment on column public.user_info.search_tsv is
  'Search document (username + full name A; bio C), folded with _search_fold. Generated; read by search_organizers / search_suggest.';
comment on column public.user_info.search_name is
  'The full name as search compares it (folded with _search_fold). Generated.';
comment on column public.place_service.search_tsv is
  'Search document (service name A; description C), folded with _search_fold. Generated.';
comment on column public.content_post.search_tsv is
  'Search document (caption A; hashtags B), folded with _search_fold. Generated.';

create index if not exists idx_event_search_tsv
  on public.event using gin (search_tsv)
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

create index if not exists idx_place_service_search_tsv
  on public.place_service using gin (search_tsv);

create index if not exists idx_content_post_search
  on public.content_post using gin (search_tsv);

-- Trigram indexes move from the raw title / name to the folded one. The
-- admin console's "contains" filters read the folded columns too, so the
-- raw ones have no reader left.
create index if not exists idx_event_search_title_trgm
  on public.event using gin (search_title extensions.gin_trgm_ops);
create index if not exists idx_place_search_name_trgm
  on public.place using gin (search_name extensions.gin_trgm_ops);
create index if not exists idx_user_info_search_name_trgm
  on public.user_info using gin (search_name extensions.gin_trgm_ops)
  where status_id = 1;

drop index if exists public.idx_event_title_trgm;
drop index if exists public.idx_place_name_trgm;
drop index if exists public.idx_user_info_full_name_trgm;

-- ---------------------------------------------------------------------
-- 3. The query, folded
-- ---------------------------------------------------------------------
create or replace function public._search_normalize(p_query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select left(
    btrim(regexp_replace(
      public._search_fold(regexp_replace(coalesce(p_query, ''), '[[:cntrl:]]+', ' ', 'g')),
      '\s+', ' ', 'g')),
    120);
$function$;

-- ---------------------------------------------------------------------
-- 4. Stop words (relaxed tier only): the four languages join English
-- ---------------------------------------------------------------------
-- Folded, three letters or more (shorter words are skipped by length).
create or replace function public._search_is_stopword(p_word text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select p_word = any (array[
    -- English
    'a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
    'by', 'or', 'my', 'me', 'near', 'around', 'best', 'top', 'this', 'next',
    'is', 'are', 'from', 'events', 'event', 'place', 'places',
    -- French
    'les', 'des', 'une', 'aux', 'pour', 'avec', 'dans', 'sur', 'par', 'chez',
    'pres', 'que', 'qui', 'sans', 'sous', 'vers', 'entre', 'autour',
    'evenements', 'evenement', 'lieux', 'lieu',
    'meilleur', 'meilleurs', 'meilleure', 'meilleures',
    -- Spanish
    'los', 'las', 'del', 'con', 'para', 'por', 'una', 'unos', 'unas', 'cerca',
    'sin', 'sobre', 'desde', 'hasta', 'eventos', 'evento', 'lugares', 'lugar',
    'mejor', 'mejores',
    -- German
    'der', 'die', 'das', 'den', 'dem', 'und', 'mit', 'fur', 'von', 'bei',
    'ein', 'eine', 'einen', 'einem', 'einer', 'auf', 'aus', 'nach', 'nahe',
    'zum', 'zur', 'oder', 'beim', 'vom', 'veranstaltungen', 'veranstaltung',
    'orte', 'ort', 'beste', 'besten',
    -- Portuguese
    'dos', 'com', 'uma', 'uns', 'umas', 'perto', 'nos', 'nas', 'aos', 'sem',
    'melhor', 'melhores'
  ]);
$function$;

-- ---------------------------------------------------------------------
-- 5. Date words, as data
-- ---------------------------------------------------------------------
create table if not exists public.search_date_term (
  term        text        not null,
  locale      text        not null,
  kind        text        not null,
  month       smallint,
  placement   text,
  enabled     boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  constraint search_date_term_pkey primary key (term, locale),
  -- Folded, one to three words of letters and digits, single spaces: the
  -- form a query word takes before it is looked up here.
  constraint search_date_term_term_form check (
    term = public._search_fold(term)
    and term ~ '^[[:alnum:]]+( [[:alnum:]]+){0,2}$'
  ),
  constraint search_date_term_kind_check check (
    kind in ('today', 'tonight', 'tomorrow', 'weekend', 'month', 'filler')
  ),
  constraint search_date_term_month_check check (
    (kind = 'month') = (month is not null)
    and (month is null or month between 1 and 12)
  ),
  constraint search_date_term_placement_check check (
    (kind = 'filler') = (placement is not null)
    and (placement is null or placement in ('anywhere', 'before'))
  )
);

comment on table public.search_date_term is
  'Date words read out of a search ("tomorrow", "ce week-end", "im dezember"): the word or phrase as typed (folded), what it means, and the small words that lead into a date. Read only by _search_temporal. Edit with SQL; no client access.';
comment on column public.search_date_term.kind is
  'today | tonight | tomorrow | weekend | month (see month) | filler (a word dropped from the query once a date was read).';
comment on column public.search_date_term.placement is
  'Fillers only. before: dropped only when it stands right before the date ("en diciembre"). anywhere: dropped wherever it stands (English, as it always was).';

alter table public.search_date_term enable row level security;
revoke all on table public.search_date_term from anon, authenticated;
grant all on table public.search_date_term to service_role;

insert into public.search_date_term (term, locale, kind, month, placement) values
  -- English (what _search_temporal knew before; "may" and "mar" stay out:
  -- they are ordinary words too)
  ('today', 'en', 'today', null, null),
  ('tonight', 'en', 'tonight', null, null),
  ('tomorrow', 'en', 'tomorrow', null, null),
  ('weekend', 'en', 'weekend', null, null),
  ('weekends', 'en', 'weekend', null, null),
  ('week end', 'en', 'weekend', null, null),
  ('january', 'en', 'month', 1, null), ('jan', 'en', 'month', 1, null),
  ('february', 'en', 'month', 2, null), ('feb', 'en', 'month', 2, null),
  ('march', 'en', 'month', 3, null),
  ('april', 'en', 'month', 4, null), ('apr', 'en', 'month', 4, null),
  ('june', 'en', 'month', 6, null), ('jun', 'en', 'month', 6, null),
  ('july', 'en', 'month', 7, null), ('jul', 'en', 'month', 7, null),
  ('august', 'en', 'month', 8, null), ('aug', 'en', 'month', 8, null),
  ('september', 'en', 'month', 9, null), ('sept', 'en', 'month', 9, null),
  ('sep', 'en', 'month', 9, null),
  ('october', 'en', 'month', 10, null), ('oct', 'en', 'month', 10, null),
  ('november', 'en', 'month', 11, null), ('nov', 'en', 'month', 11, null),
  ('december', 'en', 'month', 12, null), ('dec', 'en', 'month', 12, null),
  ('this', 'en', 'filler', null, 'anywhere'),
  ('next', 'en', 'filler', null, 'anywhere'),
  ('in', 'en', 'filler', null, 'anywhere'),
  ('on', 'en', 'filler', null, 'anywhere'),
  ('for', 'en', 'filler', null, 'anywhere'),
  ('during', 'en', 'filler', null, 'anywhere'),

  -- French
  ('aujourd hui', 'fr', 'today', null, null),
  ('ce soir', 'fr', 'tonight', null, null),
  ('cette nuit', 'fr', 'tonight', null, null),
  ('demain', 'fr', 'tomorrow', null, null),
  ('week end', 'fr', 'weekend', null, null),
  ('weekend', 'fr', 'weekend', null, null),
  ('fin de semaine', 'fr', 'weekend', null, null),
  ('janvier', 'fr', 'month', 1, null),
  ('fevrier', 'fr', 'month', 2, null),
  ('mars', 'fr', 'month', 3, null),
  ('avril', 'fr', 'month', 4, null),
  ('mai', 'fr', 'month', 5, null),
  ('juin', 'fr', 'month', 6, null),
  ('juillet', 'fr', 'month', 7, null),
  ('aout', 'fr', 'month', 8, null),
  ('septembre', 'fr', 'month', 9, null),
  ('octobre', 'fr', 'month', 10, null),
  ('novembre', 'fr', 'month', 11, null),
  ('decembre', 'fr', 'month', 12, null),
  ('ce', 'fr', 'filler', null, 'before'),
  ('cet', 'fr', 'filler', null, 'before'),
  ('cette', 'fr', 'filler', null, 'before'),
  ('en', 'fr', 'filler', null, 'before'),
  ('pour', 'fr', 'filler', null, 'before'),
  ('pendant', 'fr', 'filler', null, 'before'),
  ('le', 'fr', 'filler', null, 'before'),
  ('du', 'fr', 'filler', null, 'before'),

  -- Spanish
  ('hoy', 'es', 'today', null, null),
  ('esta noche', 'es', 'tonight', null, null),
  ('manana', 'es', 'tomorrow', null, null),
  ('fin de semana', 'es', 'weekend', null, null),
  ('finde', 'es', 'weekend', null, null),
  ('enero', 'es', 'month', 1, null),
  ('febrero', 'es', 'month', 2, null),
  ('marzo', 'es', 'month', 3, null),
  ('abril', 'es', 'month', 4, null),
  ('mayo', 'es', 'month', 5, null),
  ('junio', 'es', 'month', 6, null),
  ('julio', 'es', 'month', 7, null),
  ('agosto', 'es', 'month', 8, null),
  ('septiembre', 'es', 'month', 9, null),
  ('setiembre', 'es', 'month', 9, null),
  ('octubre', 'es', 'month', 10, null),
  ('noviembre', 'es', 'month', 11, null),
  ('diciembre', 'es', 'month', 12, null),
  ('este', 'es', 'filler', null, 'before'),
  ('esta', 'es', 'filler', null, 'before'),
  ('en', 'es', 'filler', null, 'before'),
  ('para', 'es', 'filler', null, 'before'),
  ('durante', 'es', 'filler', null, 'before'),
  ('el', 'es', 'filler', null, 'before'),

  -- German
  ('heute', 'de', 'today', null, null),
  ('heute abend', 'de', 'tonight', null, null),
  ('heute nacht', 'de', 'tonight', null, null),
  ('morgen', 'de', 'tomorrow', null, null),
  ('wochenende', 'de', 'weekend', null, null),
  ('januar', 'de', 'month', 1, null),
  ('februar', 'de', 'month', 2, null),
  ('marz', 'de', 'month', 3, null),
  ('april', 'de', 'month', 4, null),
  ('mai', 'de', 'month', 5, null),
  ('juni', 'de', 'month', 6, null),
  ('juli', 'de', 'month', 7, null),
  ('august', 'de', 'month', 8, null),
  ('september', 'de', 'month', 9, null),
  ('oktober', 'de', 'month', 10, null),
  ('november', 'de', 'month', 11, null),
  ('dezember', 'de', 'month', 12, null),
  ('dieses', 'de', 'filler', null, 'before'),
  ('diesen', 'de', 'filler', null, 'before'),
  ('diesem', 'de', 'filler', null, 'before'),
  ('im', 'de', 'filler', null, 'before'),
  ('am', 'de', 'filler', null, 'before'),
  ('fur', 'de', 'filler', null, 'before'),
  ('wahrend', 'de', 'filler', null, 'before'),

  -- Portuguese ("março" is left out: folded it is the name Marco)
  ('hoje', 'pt', 'today', null, null),
  ('hoje a noite', 'pt', 'tonight', null, null),
  ('esta noite', 'pt', 'tonight', null, null),
  ('amanha', 'pt', 'tomorrow', null, null),
  ('fim de semana', 'pt', 'weekend', null, null),
  ('janeiro', 'pt', 'month', 1, null),
  ('fevereiro', 'pt', 'month', 2, null),
  ('abril', 'pt', 'month', 4, null),
  ('maio', 'pt', 'month', 5, null),
  ('junho', 'pt', 'month', 6, null),
  ('julho', 'pt', 'month', 7, null),
  ('agosto', 'pt', 'month', 8, null),
  ('setembro', 'pt', 'month', 9, null),
  ('outubro', 'pt', 'month', 10, null),
  ('novembro', 'pt', 'month', 11, null),
  ('dezembro', 'pt', 'month', 12, null),
  ('este', 'pt', 'filler', null, 'before'),
  ('esta', 'pt', 'filler', null, 'before'),
  ('neste', 'pt', 'filler', null, 'before'),
  ('nesta', 'pt', 'filler', null, 'before'),
  ('em', 'pt', 'filler', null, 'before'),
  ('no', 'pt', 'filler', null, 'before'),
  ('na', 'pt', 'filler', null, 'before'),
  ('para', 'pt', 'filler', null, 'before'),
  ('durante', 'pt', 'filler', null, 'before')
on conflict (term, locale) do nothing;

/**
 * A date window read out of a query, in the zone of the place being
 * searched:
 *   a month name -> that month, this year or next if it has passed;
 *   today / tonight -> the rest of today; tomorrow -> tomorrow;
 *   weekend -> Friday 17:00 to Monday 00:00, this week's or, from Monday,
 *   the coming one.
 * The words come from search_date_term, in every language it holds; the
 * first date expression of the query counts, its longest wording first
 * ("fin de semana" before a word of it).
 * Returns the query without the date words, without the small words right
 * before them ("ce week-end", "en diciembre") and without the "anywhere"
 * fillers; the window; and the date words as they were read. A query with
 * no date comes back unchanged with a null window.
 */
drop function if exists public._search_temporal(text, timestamp with time zone, text);
create function public._search_temporal(p_norm text, p_as_of timestamp with time zone, p_timezone text default null)
  returns table(rest text, date_from timestamp with time zone, date_to timestamp with time zone, date_words text)
  language plpgsql
  stable parallel safe
  set search_path = ''
as $function$
declare
  v_tz     text := coalesce(nullif(p_timezone, ''), public.default_market_timezone(), 'UTC');
  v_tokens text[] := regexp_split_to_array(btrim(coalesce(p_norm, '')), '\s+');
  v_folded text[] := regexp_split_to_array(public._search_fold(btrim(coalesce(p_norm, ''))), '\s+');
  v_keys   text[];
  v_n      integer;
  v_now    timestamp := coalesce(p_as_of, now()) at time zone v_tz;
  v_today  date := v_now::date;
  v_first  integer;
  v_last   integer;
  v_kind   text;
  v_month  integer;
  v_words  text;
  v_year   integer;
  v_dow    integer;
  v_from   timestamp;
  v_to     timestamp;
  v_rest   text;
begin
  if coalesce(btrim(p_norm), '') = '' then
    return query select coalesce(p_norm, ''), null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  v_n := cardinality(v_tokens);
  -- Each word as the date terms are written: folded, letters and digits
  -- only ("week-end" -> "week end", "aujourd'hui" -> "aujourd hui").
  select array_agg(btrim(regexp_replace(u.t, '[^[:alnum:]]+', ' ', 'g')) order by u.ord)
    into v_keys
  from unnest(v_folded) with ordinality as u(t, ord);

  select c.i, c.i + c.len - 1, d.kind, d.month, c.phrase
    into v_first, v_last, v_kind, v_month, v_words
  from (
    select i, len, array_to_string(v_keys[i:i + len - 1], ' ') as phrase
    from generate_series(1, v_n) as i
    cross join generate_series(1, 3) as len
    where i + len - 1 <= v_n
  ) c
  join public.search_date_term d
    on d.term = c.phrase and d.enabled and d.kind <> 'filler'
  order by c.i, c.len desc, d.kind, d.month nulls last, d.locale
  limit 1;

  if not found then
    return query select p_norm, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  if v_kind = 'month' then
    v_year := extract(year from v_today)::integer;
    if v_month < extract(month from v_today)::integer then
      v_year := v_year + 1;
    end if;
    v_from := make_timestamp(v_year, v_month, 1, 0, 0, 0);
    v_to := v_from + interval '1 month';
  elsif v_kind in ('today', 'tonight') then
    v_from := v_now;
    v_to := (v_today + 1)::timestamp;
  elsif v_kind = 'tomorrow' then
    v_from := (v_today + 1)::timestamp;
    v_to := (v_today + 2)::timestamp;
  else
    -- weekend
    v_dow := extract(isodow from v_today)::integer;
    v_from := greatest((v_today + (5 - v_dow))::timestamp + interval '17 hours', v_now);
    v_to := (v_today + (8 - v_dow))::timestamp;
  end if;

  -- The small words that lead into the date ("ce week-end", "im
  -- dezember", "for this weekend") go with it.
  while v_first > 1 and exists (
    select 1 from public.search_date_term f
    where f.kind = 'filler' and f.enabled and f.term = v_keys[v_first - 1]
  ) loop
    v_first := v_first - 1;
  end loop;

  select coalesce(string_agg(u.t, ' ' order by u.ord), '')
    into v_rest
  from unnest(v_tokens, v_keys) with ordinality as u(t, k, ord)
  where (u.ord < v_first or u.ord > v_last)
    and not exists (
      select 1 from public.search_date_term f
      where f.kind = 'filler' and f.placement = 'anywhere' and f.enabled and f.term = u.k);

  return query select
    v_rest,
    (v_from at time zone v_tz),
    (v_to at time zone v_tz),
    v_words;
end;
$function$;
revoke all on function public._search_temporal(text, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public._search_temporal(text, timestamp with time zone, text) to service_role;

-- ---------------------------------------------------------------------
-- 6. Candidate pools: folded comparisons; the typo fallback keeps the dates
-- ---------------------------------------------------------------------
-- p_norm is what _search_normalize returns (folded). Titles and names are
-- compared through their folded columns.

create or replace function public._search_event_pool(p_norm text, p_organizer_id uuid, p_category text, p_origin extensions.geography, p_radius_km double precision, p_as_of timestamp with time zone, p_limit integer)
 returns table(id uuid, text_score double precision)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_cat     text := nullif(btrim(coalesce(p_category, '')), '');
  v_time    record;
  v_text    text;
  v_date    text;
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
    v_date := coalesce(v_time.date_words, '');
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
                    when e.search_title = v_text then 1.0
                    when e.search_title like v_like_p escape '\' then 0.7
                    when e.search_title like v_like_w escape '\' then 0.4
                    else 0.0
                  end)
        + 0.20 * extensions.similarity(e.search_title, v_text)
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
        + 0.20 * extensions.similarity(e.search_title, p_norm)
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
            + 0.20 * extensions.similarity(e.search_title, v_text)
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

  -- 4. trigram typo fallback, only when still thin.
  --
  --   a. The query as typed, against titles. For a dated query that keeps
  --      the date words and drops the date window, because "weekend" or
  --      "december" may simply be part of a title — but then the title has
  --      to say the date word itself: "remembr december" finds "December
  --      to Remember", and "afrobeats december" no longer brings in an
  --      "Afrobeats Summer Jam" held in June for the one word they share.
  --   b. Dated queries only: the other words, inside the dates, so a typo
  --      is forgiven there too ("afrobets december").
  if length(p_norm) < 3 or v_found >= least(5, p_limit) then
    return;
  end if;

  return query
  select t.id, t.text_score
  from (
    select x.id, max(x.s) as text_score, min(x.starts_at) as starts_at
    from (
      (select e.id,
        (
          0.30 * (case
                    when e.search_title like public._search_like_escape(p_norm) || '%' escape '\' then 0.7
                    when e.search_title like '% ' || public._search_like_escape(p_norm) || '%' escape '\' then 0.4
                    else 0.0
                  end)
          + 0.50 * extensions.word_similarity(p_norm, e.search_title)
          + 0.20 * extensions.similarity(e.search_title, p_norm)
        )::double precision as s,
        e.starts_at
      from public.event e
      where e.status = 'published'
        and e.archived_at is null
        and e.moderation_state is distinct from 'hidden'
        and e.moderation_state is distinct from 'removed'
        and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
        and p_norm operator(extensions.<%) e.search_title
        and (not v_dated or v_date operator(extensions.<%) e.search_title)
        and e.id <> all (v_ids)
        and (p_organizer_id is null or e.organizer_id = p_organizer_id)
        and (v_cat is null or lower(e.event_category) = lower(v_cat))
        and (p_origin is null or p_radius_km is null
             or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
        and public._search_event_in_window(e.id, e.starts_at, e.ends_at, p_as_of, null)
      limit v_cap)

      union all
      (select e.id,
        (
          0.30 * (case
                    when e.search_title like v_like_p escape '\' then 0.7
                    when e.search_title like v_like_w escape '\' then 0.4
                    else 0.0
                  end)
          + 0.50 * extensions.word_similarity(v_text, e.search_title)
          + 0.20 * extensions.similarity(e.search_title, v_text)
        )::double precision,
        e.starts_at
      from public.event e
      where v_dated
        and length(v_text) >= 3
        and e.status = 'published'
        and e.archived_at is null
        and e.moderation_state is distinct from 'hidden'
        and e.moderation_state is distinct from 'removed'
        and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
        and v_text operator(extensions.<%) e.search_title
        and e.id <> all (v_ids)
        and (p_organizer_id is null or e.organizer_id = p_organizer_id)
        and (v_cat is null or lower(e.event_category) = lower(v_cat))
        and (p_origin is null or p_radius_km is null
             or extensions.st_dwithin(e.location, p_origin, p_radius_km * 1000))
        and public._search_event_in_window(e.id, e.starts_at, e.ends_at, v_from, v_to)
      limit v_cap)
    ) x
    group by x.id
  ) t
  order by t.text_score desc, t.starts_at asc nulls last, t.id
  limit greatest(p_limit - v_found, 0);
end;
$function$;

create or replace function public._search_place_pool(p_norm text, p_category_id smallint, p_origin extensions.geography, p_radius_km double precision, p_limit integer)
 returns table(id uuid, text_score double precision)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- Category names the query (or a related term) points at. The table is
  -- a dozen rows, so their names are folded here; no listing table is ever
  -- folded row by row.
  select coalesce(array_agg(c.id), '{}')
    into v_cat_ids
  from public.place_category c
  where public._search_fold(c.name) like '%' || public._search_like_escape(p_norm) || '%' escape '\'
     or c.slug = replace(p_norm, ' ', '-')
     or (v_related is not null
         and to_tsvector('simple'::regconfig, public._search_fold(c.name)) @@ v_related);

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
                    when p.search_name = p_norm then 1.0
                    when p.search_name like v_like_p escape '\' then 0.7
                    when p.search_name like v_like_w escape '\' then 0.4
                    when p.category_id = any (v_cat_ids) then 0.35
                    when svc.place_id is not null then 0.30
                    else 0.0
                  end)
        + 0.20 * extensions.similarity(p.search_name, p_norm)
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
            + 0.20 * extensions.similarity(p.search_name, p_norm)
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
                when p.search_name like v_like_p escape '\' then 0.7
                when p.search_name like v_like_w escape '\' then 0.4
                else 0.0
              end)
      + 0.50 * extensions.word_similarity(p_norm, p.search_name)
      + 0.20 * extensions.similarity(p.search_name, p_norm)
    )::double precision as text_score
  from public.place p
  where p.status = 'published'
    and p.moderation_state is distinct from 'hidden'
    and p.moderation_state is distinct from 'removed'
    and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
    and p.temporary_status is distinct from 'permanently_closed'
    and p_norm operator(extensions.<%) p.search_name
    and p.id <> all (v_ids)
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_origin is null or p_radius_km is null
         or extensions.st_dwithin(p.location, p_origin, p_radius_km * 1000))
  limit v_cap
  ) t
  order by t.text_score desc, t.id
  limit greatest(p_limit - v_found, 0);
end;
$function$;

create or replace function public._search_organizer_pool(p_norm text, p_handle text, p_limit integer)
 returns table(id uuid, text_score double precision)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
        and (u2.search_name like v_like_h escape '\'
             or u2.search_name like v_like_hw escape '\')
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
      and not (u.search_name like v_like_h escape '\')
      and not (u.search_name like v_like_hw escape '\')
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
                  when lower(u.username::text) = p_norm or u.search_name = p_norm then 1.0
                  when lower(u.username::text) like v_like_n escape '\'
                    or u.search_name like v_like_n escape '\' then 0.7
                  else 0.0
                end)
      + 0.20 * greatest(extensions.similarity(u.username::text, p_norm),
                        extensions.similarity(u.search_name, p_norm))
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
                      extensions.word_similarity(p_norm, u.search_name))
      + 0.20 * greatest(extensions.similarity(u.username::text, p_norm),
                        extensions.similarity(u.search_name, p_norm))
    )::double precision as text_score
  from (
    select u2.id from public.user_info u2
    where u2.status_id = 1 and p_norm operator(extensions.<%) u2.username::text
    union
    select u2.id from public.user_info u2
    where u2.status_id = 1 and p_norm operator(extensions.<%) u2.search_name
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
$function$;

-- ---------------------------------------------------------------------
-- 7. Spotlight search, the vocabulary preview and the search log, folded
-- ---------------------------------------------------------------------
create or replace function public.search_spotlight(p_query text, p_viewer uuid, p_limit integer default 20)
 returns table(post_id uuid, rank real)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with q as (
    select
      websearch_to_tsquery('simple', public._search_normalize(p_query)) as tsq,
      public._search_related_tsquery(public._search_normalize(p_query), 'spotlight') as related,
      -- The query as a hashtag: its words side by side in the hashtags part
      -- of the document (weight B). The document is folded, so "#fete"
      -- finds a post tagged "#fête" without folding every post's tags.
      (select to_tsquery('simple', string_agg(quote_literal(t.tok) || ':B', ' <-> ' order by t.ord))
         from regexp_split_to_table(
                public._search_fold(regexp_replace(coalesce(p_query, ''), '^#', '')),
                '[^[:alnum:]]+') with ordinality as t(tok, ord)
        where t.tok <> '') as tag
  )
  select p.id,
         (
           (case when p.search_tsv @@ q.tsq then ts_rank(p.search_tsv, q.tsq) else 0 end)
           + (case when q.related is not null and p.search_tsv @@ q.related
                   then 0.6 * ts_rank(p.search_tsv, q.related) else 0 end)
           + (case when q.tag is not null and p.search_tsv @@ q.tag then 1.0 else 0 end)
           + least(p.trending_score, 1) * 0.2
         )::real as rank
  from public.content_post p, q
  where p.kind = 'spotlight'
    and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
    and p.moderation_state = 'visible'
    and (
      p.search_tsv @@ q.tsq
      or (q.tag is not null and p.search_tsv @@ q.tag)
      or (q.related is not null and p.search_tsv @@ q.related)
    )
    and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
    and not public.content_users_blocked(p_viewer, p.author_id)
  order by rank desc, p.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

create or replace function public.admin_search_concept_preview(p_term text, p_expands_to text[], p_applies_to text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_q    tsquery;
  v_part tsquery;
  v_word text;
  v_out  jsonb := '{}'::jsonb;
begin
  -- The term itself plus each word as a phrase, OR-ed: the same shape
  -- _search_concept_alternatives builds for a saved row. Folded, as a saved
  -- row is.
  foreach v_word in array array_prepend(coalesce(p_term, ''), coalesce(p_expands_to, '{}')) loop
    v_part := phraseto_tsquery('simple'::regconfig, public._search_fold(v_word));
    if numnode(v_part) = 0 then
      continue;
    end if;
    v_q := case when v_q is null then v_part else v_q || v_part end;
  end loop;
  if v_q is null then
    return jsonb_build_object('query', null);
  end if;

  v_out := jsonb_build_object('query', v_q::text);

  if 'event' = any (coalesce(p_applies_to, '{}')) then
    v_out := v_out || jsonb_build_object('events', (
      with m as (
        select e.title, e.starts_at
        from public.event e
        where e.status = 'published'
          and e.archived_at is null
          and e.moderation_state is distinct from 'hidden'
          and e.moderation_state is distinct from 'removed'
          and e.search_tsv @@ v_q
          and public._search_event_in_window(e.id, e.starts_at, e.ends_at, now(), null)
        limit 1000
      )
      select jsonb_build_object(
        'count', (select count(*) from m),
        'samples', coalesce((select jsonb_agg(s.title) from (select title from m order by starts_at limit 5) s), '[]'::jsonb)
      )
    ));
  end if;

  if 'place' = any (coalesce(p_applies_to, '{}')) then
    v_out := v_out || jsonb_build_object('places', (
      with m as (
        select p.name
        from public.place p
        where p.status = 'published'
          and p.moderation_state is distinct from 'hidden'
          and p.moderation_state is distinct from 'removed'
          and p.temporary_status is distinct from 'permanently_closed'
          and (
            p.search_tsv @@ v_q
            or exists (select 1 from public.place_service s
                       where s.place_id = p.id and s.search_tsv @@ v_q)
          )
        limit 1000
      )
      select jsonb_build_object(
        'count', (select count(*) from m),
        'samples', coalesce((select jsonb_agg(s.name) from (select name from m order by name limit 5) s), '[]'::jsonb)
      )
    ));
  end if;

  if 'spotlight' = any (coalesce(p_applies_to, '{}')) then
    v_out := v_out || jsonb_build_object('spotlights', (
      with m as (
        select coalesce(nullif(c.caption, ''), '(no caption)') as caption, c.published_at
        from public.content_post c
        where c.kind = 'spotlight'
          and public.content_post_is_public(c.status, c.moderation_state, c.kind, c.published_at, c.expires_at)
          and c.moderation_state = 'visible'
          and c.search_tsv @@ v_q
        limit 1000
      )
      select jsonb_build_object(
        'count', (select count(*) from m),
        'samples', coalesce((select jsonb_agg(left(s.caption, 80)) from (select caption from m order by published_at desc limit 5) s), '[]'::jsonb)
      )
    ));
  end if;

  return v_out;
end;
$function$;

-- Searches logged before today were not folded. Fold them once, so the
-- report of unanswered searches shows "café" and "cafe" as one line
-- without folding every row each time it is read. The log holds no
-- person and no device.
update public.search_query_log
set query_norm = left(public._search_fold(query_norm), 120)
where query_norm is distinct from left(public._search_fold(query_norm), 120);

-- ---------------------------------------------------------------------
-- 8. Everywhere else a reader types words
-- ---------------------------------------------------------------------
-- The older search (get_filtered_events / get_filtered_places with a
-- search text: what the apps fall back to when unified search is switched
-- off), the inbox search (list_conversations) and the field team's
-- duplicate check (fieldops_find_similar_places) compared raw text with
-- ILIKE or trigram similarity. They compare folded text now:
--
--   * a title, a name or a slug is still matched by "contains", on the
--     stored folded column; a "%" or "_" typed is a character, not a
--     wildcard;
--   * a description, category or type is matched through the search
--     document (every word, the last one as a prefix) instead of a
--     "contains" on the raw text. Folding the description of every row
--     took the older events search from 0.33 s to 3 s on the
--     100,000-event catalogue; the document is indexed. The venue-name
--     key (address ->> 'name') the old body also read is in no event.
--
-- Nothing else in these functions changes: each body is the one in the
-- database with only its text-matching lines replaced.

CREATE OR REPLACE FUNCTION public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_distance_km double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location extensions.geography, event_category text, status character varying, organizer_id uuid, timezone text, country_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- The typed text as search compares it (folded): a pattern for the
  -- stored folded title or name, and a query for the search document
  -- (every word, the last one as a prefix).
  v_search text := nullif(public._search_normalize(p_search_text), '');
  v_like   text := '%' || public._search_like_escape(v_search) || '%';
  v_tsq    tsquery := coalesce(public._search_prefix_tsquery(v_search),
                               public._search_web_tsquery(v_search));
BEGIN
  IF v_search IS NULL THEN
    v_like := NULL;
  END IF;
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
      AND (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
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
        v_like IS NULL OR
        e.search_title LIKE v_like ESCAPE '\' OR
        lower(e.slug) LIKE v_like ESCAPE '\' OR
        e.search_tsv @@ v_tsq
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

CREATE OR REPLACE FUNCTION public.get_filtered_places(p_search_text text DEFAULT NULL::text, p_category_id smallint DEFAULT NULL::smallint, p_min_rating numeric DEFAULT NULL::numeric, p_open_now boolean DEFAULT NULL::boolean, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location extensions.geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- The typed text as search compares it (folded): a pattern for the
  -- stored folded title or name, and a query for the search document
  -- (every word, the last one as a prefix).
  v_search text := nullif(public._search_normalize(p_search_text), '');
  v_like   text := '%' || public._search_like_escape(v_search) || '%';
  v_tsq    tsquery := coalesce(public._search_prefix_tsquery(v_search),
                               public._search_web_tsquery(v_search));
BEGIN
  IF v_search IS NULL THEN
    v_like := NULL;
  END IF;
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
      AND (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
        v_like IS NULL
        OR p.search_name LIKE v_like ESCAPE '\'
        OR p.search_tsv @@ v_tsq
      )
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

CREATE OR REPLACE FUNCTION public.list_conversations(p_filter text DEFAULT 'active'::text, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_role_scope text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_muted boolean DEFAULT NULL::boolean)
 RETURNS TABLE(conversation_id uuid, type text, event_id uuid, place_id uuid, title text, status text, last_message_at timestamp with time zone, last_message_preview text, last_message_sender_id uuid, my_role text, my_last_read_at timestamp with time zone, muted boolean, archived boolean, unread_count integer, other_participant_ids uuid[], created_at timestamp with time zone, subject_title text, other_user_id uuid, other_display_name text, other_username text, other_avatar_public_id text, other_avatar_version text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid),
  q as (
    -- The typed text as search compares it (folded), ready for LIKE.
    select '%' || public._search_like_escape(public._search_normalize(p_search)) || '%' as pat
  )
  select
    c.id,
    c.type,
    c.event_id,
    c.place_id,
    c.title,
    c.status,
    c.last_message_at,
    case when c.moderation_state = 'visible' then c.last_message_preview else null end,
    c.last_message_sender_id,
    cp.role,
    cp.last_read_at,
    cp.muted,
    cp.archived,
    (
      select count(*)::integer
      from public.message m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.moderation_state = 'visible'
        and m.message_type <> 'system'
        and m.sender_id is distinct from (select uid from me)
        and m.created_at > cp.last_read_at
    ) as unread_count,
    (
      select coalesce(array_agg(op.user_id), '{}')
      from public.conversation_participant op
      where op.conversation_id = c.id
        and op.user_id <> (select uid from me)
        and op.left_at is null
    ) as other_participant_ids,
    c.created_at,
    coalesce(
      case
        when c.type = 'event' then ev.title
        when c.type = 'place' then pl.name
        else c.title
      end,
      c.title
    ) as subject_title,
    other.user_id           as other_user_id,
    other.full_name         as other_display_name,
    other.username          as other_username,
    other.avatar_public_id  as other_avatar_public_id,
    other.avatar_version    as other_avatar_version
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
  left join public.event ev on ev.id = c.event_id
  left join public.place pl on pl.id = c.place_id
  left join lateral (
    select op.user_id, ui.full_name, ui.username, ui.search_name,
           ui.avatar_public_id, ui.avatar_version
    from public.conversation_participant op
    join public.user_info ui on ui.id = op.user_id
    where op.conversation_id = c.id
      and op.user_id <> (select uid from me)
      and op.left_at is null
    order by case op.role
      when 'organizer'  then 0
      when 'place_owner' then 1
      when 'staff'      then 2
      when 'admin'      then 3
      else 4
    end
    limit 1
  ) other on true
  where c.moderation_state not in ('removed','hidden','restricted')
    and (
      p_filter = 'all'
      or (p_filter = 'active'   and cp.archived = false)
      or (p_filter = 'archived' and cp.archived = true)
      or (p_filter = 'unread'   and cp.archived = false)
    )
    and (
      p_role_scope is null
      or p_role_scope = 'all'
      or (p_role_scope = 'member'   and cp.role = 'member')
      or (p_role_scope = 'business' and cp.role in ('organizer','place_owner','staff','admin'))
    )
    and (p_type is null or c.type = p_type)
    and (p_muted is null or cp.muted = p_muted)
    and (
      p_search is null
      or btrim(p_search) = ''
      or public._search_fold(c.title)  like (select pat from q) escape '\'
      or ev.search_title               like (select pat from q) escape '\'
      or pl.search_name                like (select pat from q) escape '\'
      or other.search_name             like (select pat from q) escape '\'
      or lower(other.username::text)   like (select pat from q) escape '\'
    )
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

CREATE OR REPLACE FUNCTION public.fieldops_find_similar_places(p_name text, p_lat double precision, p_lng double precision, p_phone text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text, p_radius_m integer DEFAULT 300, p_similarity numeric DEFAULT 0.45, p_limit integer DEFAULT 8)
 RETURNS TABLE(id uuid, name text, slug text, status text, owner_id uuid, distance_m integer, similarity numeric, phone_match boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with pt as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  typed as (
    -- The name as search compares it (folded), once.
    select public._search_fold(p_name) as name
  ),
  digits as (
    select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as phone,
           nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '') as whatsapp
  )
  select p.id, p.name, p.slug, p.status, p.owner_id,
         extensions.st_distance(p.location, pt.g)::integer as distance_m,
         round(extensions.similarity(p.search_name, t.name)::numeric, 3) as similarity,
         (
           (d.phone is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.phone
                                     or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.phone))
           or (d.whatsapp is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.whatsapp
                                           or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.whatsapp))
         ) as phone_match,
         p.created_at
  from public.place p, pt, typed t, digits d
  where p.status <> 'archived'
    and (
      (extensions.st_dwithin(p.location, pt.g, p_radius_m)
       and extensions.similarity(p.search_name, t.name) >= p_similarity)
      or (d.phone is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.phone
                                   or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.phone))
      or (d.whatsapp is not null and (regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = d.whatsapp
                                      or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = d.whatsapp))
    )
  order by phone_match desc, similarity desc, distance_m asc
  limit greatest(1, least(p_limit, 25));
$function$;

-- ---------------------------------------------------------------------
-- 9. Vocabulary: folded on write, and the words of four more languages
-- ---------------------------------------------------------------------
-- A term has a direction. Two-way (the default, and what every term was):
-- the term appears in listings too, so one of its words also finds the term
-- ("beans" finds "gob3"). One-way: the term finds its words and nothing
-- finds the term. A word of a language no listing is written in yet is
-- one-way: looking for it can match nothing and costs every search for its
-- English word. Staff switch a term to two-way in Admin when listings in
-- that language exist.
alter table public.search_concept
  add column if not exists two_way boolean not null default true;

comment on column public.search_concept.two_way is
  'true: listings use the term too, so one of its words also finds the term ("beans" finds "gob3"). false: one way only, the term finds its words.';

create or replace function public._search_concept_alternatives(p_phrase text, p_scope text)
 returns tsquery
 language plpgsql
 stable parallel safe security definer
 set search_path to ''
as $function$
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
      where c.enabled and c.two_way and p_scope = any (c.applies_to) and p_phrase = any (c.expands_to)
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
$function$;

-- A term or a word typed with an accent is stored the way a query arrives
-- (folded), so it can match. Blank words, repeats and the term itself are
-- dropped, in the order given.
create or replace function public.search_concept_fold()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.term := btrim(regexp_replace(public._search_fold(new.term), '\s+', ' ', 'g'));
  select coalesce(array_agg(kept.w order by kept.first_ord), '{}')
    into new.expands_to
  from (
    select folded.w, min(folded.ord) as first_ord
    from (
      select btrim(regexp_replace(public._search_fold(u.x), '\s+', ' ', 'g')) as w, u.ord
      from unnest(new.expands_to) with ordinality as u(x, ord)
    ) folded
    where folded.w <> '' and folded.w is distinct from new.term
    group by folded.w
  ) kept;
  return new;
end;
$function$;
revoke all on function public.search_concept_fold() from public, anon, authenticated;

drop trigger if exists search_concept_fold on public.search_concept;
create trigger search_concept_fold
  before insert or update of term, expands_to on public.search_concept
  for each row execute function public.search_concept_fold();

-- Rows already there (nothing changes unless staff saved an accent).
update public.search_concept set term = term;

-- Words English listings use as well: two-way, like every term before.
insert into public.search_concept (term, expands_to, applies_to, note) values
  ('cafe', array['coffee', 'coffee shop', 'espresso', 'bakery', 'brunch'], array['event', 'place', 'spotlight'], 'Any language'),
  ('diner', array['dinner', 'dining', 'restaurant', 'eatery'], array['event', 'place', 'spotlight'], 'English; French (dîner)'),
  ('theatre', array['theater', 'play', 'drama', 'performance', 'stage'], array['event', 'spotlight'], 'English; French (théâtre)'),
  ('theater', array['theatre', 'play', 'drama', 'performance', 'stage'], array['event', 'spotlight'], 'English; German'),
  ('sport', array['sports', 'fitness', 'gym', 'football', 'match'], array['event', 'place', 'spotlight'], 'French; German'),
  ('excursion', array['tour', 'trip', 'sightseeing'], array['event', 'place', 'spotlight'], 'English; French; Spanish'),
  ('humour', array['comedy', 'stand up', 'standup', 'comedian', 'laugh'], array['event', 'spotlight'], 'British English; French')
on conflict (term) do nothing;

-- Everyday words in French, Spanish, German and Portuguese, and the words
-- listings use for them. Folded here as they are stored. A word spelled
-- the same in two languages is one row. One-way (see two_way above).
insert into public.search_concept (term, expands_to, applies_to, note, two_way)
select v.term, v.expands_to, v.applies_to, v.note, false
from (values
  ('gratis', array['free', 'free entry'], array['event', 'spotlight'], 'Spanish; Portuguese; German'),

  -- French: food and drink
  ('nourriture', array['food', 'restaurant', 'chop bar', 'eatery', 'dining', 'cuisine', 'kitchen', 'grill', 'buffet'], array['event', 'place', 'spotlight'], 'French'),
  ('manger', array['food', 'restaurant', 'chop bar', 'eatery', 'dining', 'kitchen', 'grill'], array['event', 'place', 'spotlight'], 'French'),
  ('repas', array['food', 'meal', 'lunch', 'dinner', 'restaurant', 'buffet'], array['event', 'place', 'spotlight'], 'French'),
  ('boissons', array['drinks', 'bar', 'cocktails', 'lounge', 'pub', 'beer', 'wine', 'juice'], array['event', 'place', 'spotlight'], 'French'),
  ('biere', array['beer', 'pub', 'bar', 'brewery'], array['event', 'place', 'spotlight'], 'French (bière)'),
  ('vin', array['wine', 'wine bar', 'tasting'], array['event', 'place', 'spotlight'], 'French'),
  ('petit dejeuner', array['breakfast', 'brunch', 'cafe'], array['event', 'place', 'spotlight'], 'French (petit déjeuner)'),
  ('dejeuner', array['lunch', 'brunch', 'restaurant'], array['event', 'place', 'spotlight'], 'French (déjeuner)'),
  ('boulangerie', array['bakery', 'bread', 'pastries'], array['place', 'spotlight'], 'French'),
  ('patisserie', array['bakery', 'pastries', 'cakes', 'dessert'], array['place', 'spotlight'], 'French (pâtisserie)'),
  ('grillades', array['grill', 'barbecue', 'bbq', 'kebab', 'suya'], array['event', 'place', 'spotlight'], 'French'),
  -- French: nights out and music
  ('fete', array['party', 'celebration', 'club', 'jam', 'rave', 'dj', 'night'], array['event', 'spotlight'], 'French (fête)'),
  ('soiree', array['party', 'night', 'club', 'dj', 'evening', 'jam'], array['event', 'spotlight'], 'French (soirée)'),
  ('boite', array['club', 'nightclub', 'night club'], array['event', 'place', 'spotlight'], 'French (boîte de nuit)'),
  ('discotheque', array['club', 'nightclub', 'night club', 'dj', 'party'], array['event', 'place', 'spotlight'], 'French (discothèque)'),
  ('vie nocturne', array['nightlife', 'club', 'nightclub', 'lounge', 'bar', 'party', 'dj'], array['event', 'place', 'spotlight'], 'French'),
  ('musique', array['music', 'concert', 'live music', 'live band', 'dj'], array['event', 'spotlight'], 'French'),
  ('musique live', array['live music', 'concert', 'live band', 'gig', 'acoustic'], array['event', 'place', 'spotlight'], 'French'),
  ('spectacle', array['show', 'performance', 'live show', 'concert', 'comedy', 'theatre'], array['event', 'spotlight'], 'French'),
  ('danse', array['dance', 'dancing', 'salsa', 'dance class'], array['event', 'place', 'spotlight'], 'French'),
  ('comedie', array['comedy', 'stand up', 'standup', 'comedian', 'theatre'], array['event', 'spotlight'], 'French (comédie)'),
  -- French: faith, culture, family
  ('eglise', array['church', 'worship', 'service', 'gospel', 'praise', 'prayer'], array['event', 'place', 'spotlight'], 'French (église)'),
  ('culte', array['worship', 'service', 'church', 'praise'], array['event', 'spotlight'], 'French'),
  ('evangile', array['gospel', 'worship', 'praise', 'church', 'choir'], array['event', 'spotlight'], 'French (évangile)'),
  ('priere', array['prayer', 'worship', 'church'], array['event', 'spotlight'], 'French (prière)'),
  ('exposition', array['exhibition', 'gallery', 'art', 'museum'], array['event', 'place', 'spotlight'], 'French'),
  ('galerie', array['gallery', 'art', 'exhibition'], array['event', 'place', 'spotlight'], 'French; German'),
  ('musee', array['museum', 'gallery', 'heritage', 'culture'], array['event', 'place', 'spotlight'], 'French (musée)'),
  ('enfants', array['kids', 'children', 'family', 'kid friendly', 'playground'], array['event', 'place', 'spotlight'], 'French'),
  ('famille', array['family', 'kids', 'children', 'family friendly', 'picnic'], array['event', 'place', 'spotlight'], 'French'),
  ('mariage', array['wedding', 'engagement', 'bridal'], array['event', 'place', 'spotlight'], 'French'),
  ('anniversaire', array['birthday', 'celebration', 'party'], array['event', 'spotlight'], 'French'),
  -- French: places and activities
  ('plage', array['beach', 'seaside', 'shore', 'coast', 'resort', 'beach party'], array['event', 'place', 'spotlight'], 'French'),
  ('hebergement', array['hotel', 'lodge', 'guest house', 'guesthouse', 'inn', 'apartment'], array['place', 'spotlight'], 'French (hébergement)'),
  ('musculation', array['gym', 'fitness', 'workout', 'training'], array['event', 'place', 'spotlight'], 'French'),
  ('coiffure', array['salon', 'hair', 'braids', 'barber', 'beauty'], array['place', 'spotlight'], 'French'),
  ('coiffeur', array['barber', 'salon', 'hair', 'braids'], array['place', 'spotlight'], 'French'),
  ('beaute', array['beauty', 'salon', 'spa', 'nails', 'makeup'], array['place', 'spotlight'], 'French (beauté)'),
  ('magasin', array['shop', 'store', 'boutique', 'mall', 'market'], array['event', 'place', 'spotlight'], 'French'),
  ('marche', array['market', 'shopping', 'mall', 'bazaar'], array['event', 'place', 'spotlight'], 'French (marché)'),
  ('achats', array['shopping', 'mall', 'market', 'shop'], array['event', 'place', 'spotlight'], 'French'),
  ('atelier', array['workshop', 'training', 'class', 'masterclass', 'seminar'], array['event', 'spotlight'], 'French'),
  ('formation', array['training', 'workshop', 'class', 'course', 'bootcamp'], array['event', 'spotlight'], 'French'),
  ('cours', array['class', 'course', 'lesson', 'training', 'workshop'], array['event', 'spotlight'], 'French'),
  ('reseautage', array['networking', 'meetup', 'mixer'], array['event', 'spotlight'], 'French (réseautage)'),
  ('affaires', array['business', 'networking', 'conference', 'summit'], array['event', 'spotlight'], 'French'),
  ('randonnee', array['hike', 'hiking', 'trek', 'walk', 'outdoor'], array['event', 'place', 'spotlight'], 'French (randonnée)'),
  ('piscine', array['pool', 'swimming', 'swimming pool'], array['event', 'place', 'spotlight'], 'French'),
  ('jeux', array['games', 'gaming', 'game night'], array['event', 'place', 'spotlight'], 'French'),
  ('gratuit', array['free', 'free entry'], array['event', 'spotlight'], 'French'),
  ('tourisme', array['tour', 'tourism', 'sightseeing', 'heritage'], array['event', 'place', 'spotlight'], 'French'),
  ('parc', array['park', 'garden', 'playground'], array['place', 'spotlight'], 'French'),
  ('librairie', array['bookshop', 'bookstore', 'books'], array['place', 'spotlight'], 'French'),
  ('sante', array['health', 'wellness', 'clinic'], array['event', 'place', 'spotlight'], 'French (santé)'),
  ('bien etre', array['wellness', 'spa', 'massage', 'yoga'], array['event', 'place', 'spotlight'], 'French (bien-être)'),
  ('defile', array['fashion show', 'runway', 'fashion'], array['event', 'spotlight'], 'French (défilé)'),

  -- Spanish (several are Portuguese too)
  ('comida', array['food', 'restaurant', 'chop bar', 'eatery', 'dining', 'kitchen', 'grill', 'buffet'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('comer', array['food', 'restaurant', 'eatery', 'dining'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('restaurante', array['restaurant', 'eatery', 'dining', 'chop bar', 'bistro', 'grill', 'kitchen'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('bebidas', array['drinks', 'bar', 'cocktails', 'lounge', 'pub', 'beer', 'wine'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('cerveza', array['beer', 'pub', 'bar', 'brewery'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('vino', array['wine', 'wine bar', 'tasting'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('desayuno', array['breakfast', 'brunch', 'cafe'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('almuerzo', array['lunch', 'restaurant', 'buffet'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('cena', array['dinner', 'dining', 'restaurant'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('panaderia', array['bakery', 'bread', 'pastries'], array['place', 'spotlight'], 'Spanish (panadería)'),
  ('fiesta', array['party', 'celebration', 'club', 'jam', 'rave', 'dj', 'night'], array['event', 'spotlight'], 'Spanish'),
  ('discoteca', array['club', 'nightclub', 'night club', 'dj', 'party'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('vida nocturna', array['nightlife', 'club', 'nightclub', 'lounge', 'bar', 'party'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('musica', array['music', 'concert', 'live music', 'live band', 'dj'], array['event', 'spotlight'], 'Spanish; Portuguese (música)'),
  ('en vivo', array['live music', 'live band', 'concert', 'live show', 'gig'], array['event', 'spotlight'], 'Spanish'),
  ('concierto', array['concert', 'live music', 'live show', 'gig', 'performance', 'live band'], array['event', 'spotlight'], 'Spanish'),
  ('espectaculo', array['show', 'performance', 'live show', 'concert', 'theatre'], array['event', 'spotlight'], 'Spanish (espectáculo)'),
  ('baile', array['dance', 'dancing', 'salsa', 'dance class'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('comedia', array['comedy', 'stand up', 'standup', 'comedian'], array['event', 'spotlight'], 'Spanish; Portuguese (comédia)'),
  ('teatro', array['theatre', 'theater', 'play', 'drama'], array['event', 'spotlight'], 'Spanish; Portuguese'),
  ('cine', array['cinema', 'movies', 'movie', 'film', 'screening'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('pelicula', array['movies', 'cinema', 'film', 'screening'], array['event', 'place', 'spotlight'], 'Spanish (película)'),
  ('peliculas', array['movies', 'cinema', 'film', 'screening'], array['event', 'place', 'spotlight'], 'Spanish (películas)'),
  ('iglesia', array['church', 'worship', 'service', 'gospel', 'praise', 'prayer'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('evangelio', array['gospel', 'worship', 'praise', 'church'], array['event', 'spotlight'], 'Spanish'),
  ('exposicion', array['exhibition', 'gallery', 'art', 'museum'], array['event', 'place', 'spotlight'], 'Spanish (exposición)'),
  ('galeria', array['gallery', 'art', 'exhibition'], array['event', 'place', 'spotlight'], 'Spanish (galería); Portuguese'),
  ('museo', array['museum', 'gallery', 'heritage', 'culture'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('ninos', array['kids', 'children', 'family', 'playground'], array['event', 'place', 'spotlight'], 'Spanish (niños)'),
  ('familia', array['family', 'kids', 'children', 'family friendly', 'picnic'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese (família)'),
  ('cumpleanos', array['birthday', 'celebration', 'party'], array['event', 'spotlight'], 'Spanish (cumpleaños)'),
  ('playa', array['beach', 'seaside', 'shore', 'coast', 'resort'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('alojamiento', array['hotel', 'lodge', 'guest house', 'guesthouse', 'inn', 'apartment'], array['place', 'spotlight'], 'Spanish'),
  ('gimnasio', array['gym', 'fitness', 'workout', 'training'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('deporte', array['sports', 'fitness', 'football', 'match'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('deportes', array['sports', 'fitness', 'football', 'match'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('peluqueria', array['salon', 'hair', 'braids', 'barber'], array['place', 'spotlight'], 'Spanish (peluquería)'),
  ('belleza', array['beauty', 'salon', 'spa', 'nails'], array['place', 'spotlight'], 'Spanish'),
  ('tienda', array['shop', 'store', 'boutique', 'mall'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('mercado', array['market', 'shopping', 'mall'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('compras', array['shopping', 'mall', 'market', 'shop'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('futbol', array['football', 'soccer', 'match', 'sports'], array['event', 'place', 'spotlight'], 'Spanish (fútbol)'),
  ('conferencia', array['conference', 'summit', 'seminar', 'workshop', 'forum', 'talk'], array['event', 'spotlight'], 'Spanish; Portuguese (conferência)'),
  ('taller', array['workshop', 'training', 'class', 'masterclass', 'seminar'], array['event', 'spotlight'], 'Spanish'),
  ('curso', array['class', 'course', 'lesson', 'training', 'workshop'], array['event', 'spotlight'], 'Spanish; Portuguese'),
  ('negocios', array['business', 'networking', 'conference', 'summit'], array['event', 'spotlight'], 'Spanish; Portuguese (negócios)'),
  ('piscina', array['pool', 'swimming', 'swimming pool'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('parque', array['park', 'garden', 'playground'], array['place', 'spotlight'], 'Spanish; Portuguese'),
  ('senderismo', array['hike', 'hiking', 'trek', 'walk'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('juegos', array['games', 'gaming', 'game night'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('salud', array['health', 'wellness', 'clinic'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('bienestar', array['wellness', 'spa', 'massage', 'yoga'], array['event', 'place', 'spotlight'], 'Spanish'),
  ('arte', array['art', 'gallery', 'exhibition', 'painting', 'artist'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),
  ('cultura', array['culture', 'cultural', 'heritage', 'tradition', 'museum'], array['event', 'place', 'spotlight'], 'Spanish; Portuguese'),

  -- German
  ('essen', array['food', 'restaurant', 'eatery', 'dining', 'kitchen', 'grill', 'buffet'], array['event', 'place', 'spotlight'], 'German'),
  ('getranke', array['drinks', 'bar', 'cocktails', 'lounge', 'pub', 'beer', 'wine'], array['event', 'place', 'spotlight'], 'German (Getränke)'),
  ('bier', array['beer', 'pub', 'bar', 'brewery'], array['event', 'place', 'spotlight'], 'German'),
  ('wein', array['wine', 'wine bar', 'tasting'], array['event', 'place', 'spotlight'], 'German'),
  ('fruhstuck', array['breakfast', 'brunch', 'cafe'], array['event', 'place', 'spotlight'], 'German (Frühstück)'),
  ('mittagessen', array['lunch', 'restaurant', 'buffet'], array['event', 'place', 'spotlight'], 'German'),
  ('abendessen', array['dinner', 'dining', 'restaurant'], array['event', 'place', 'spotlight'], 'German'),
  ('backerei', array['bakery', 'bread', 'pastries'], array['place', 'spotlight'], 'German (Bäckerei)'),
  ('kneipe', array['pub', 'bar', 'lounge', 'drinking spot'], array['place', 'spotlight'], 'German'),
  ('feier', array['party', 'celebration', 'club', 'jam'], array['event', 'spotlight'], 'German'),
  ('feiern', array['party', 'celebration', 'club', 'night'], array['event', 'spotlight'], 'German'),
  ('disko', array['club', 'nightclub', 'night club', 'dj', 'party'], array['event', 'place', 'spotlight'], 'German'),
  ('nachtleben', array['nightlife', 'club', 'nightclub', 'lounge', 'bar', 'party'], array['event', 'place', 'spotlight'], 'German'),
  ('musik', array['music', 'concert', 'live music', 'live band', 'dj'], array['event', 'spotlight'], 'German'),
  ('livemusik', array['live music', 'concert', 'live band', 'gig', 'acoustic'], array['event', 'place', 'spotlight'], 'German'),
  ('konzert', array['concert', 'live music', 'live show', 'gig', 'performance', 'live band'], array['event', 'spotlight'], 'German'),
  ('tanzen', array['dance', 'dancing', 'salsa', 'dance class'], array['event', 'place', 'spotlight'], 'German'),
  ('tanz', array['dance', 'dancing', 'salsa', 'dance class'], array['event', 'place', 'spotlight'], 'German'),
  ('komodie', array['comedy', 'stand up', 'standup', 'comedian', 'theatre'], array['event', 'spotlight'], 'German (Komödie)'),
  ('kino', array['cinema', 'movies', 'movie', 'film', 'screening'], array['event', 'place', 'spotlight'], 'German'),
  ('filme', array['movies', 'cinema', 'film', 'screening'], array['event', 'place', 'spotlight'], 'German; Portuguese'),
  ('kirche', array['church', 'worship', 'service', 'gospel', 'praise', 'prayer'], array['event', 'place', 'spotlight'], 'German'),
  ('gottesdienst', array['worship', 'service', 'church', 'praise'], array['event', 'spotlight'], 'German'),
  ('ausstellung', array['exhibition', 'gallery', 'art', 'museum'], array['event', 'place', 'spotlight'], 'German'),
  ('kinder', array['kids', 'children', 'family', 'playground'], array['event', 'place', 'spotlight'], 'German'),
  ('familie', array['family', 'kids', 'children', 'family friendly', 'picnic'], array['event', 'place', 'spotlight'], 'German'),
  ('hochzeit', array['wedding', 'engagement', 'bridal'], array['event', 'place', 'spotlight'], 'German'),
  ('geburtstag', array['birthday', 'celebration', 'party'], array['event', 'spotlight'], 'German'),
  ('strand', array['beach', 'seaside', 'shore', 'coast', 'resort'], array['event', 'place', 'spotlight'], 'German'),
  ('unterkunft', array['hotel', 'lodge', 'guest house', 'guesthouse', 'inn', 'apartment'], array['place', 'spotlight'], 'German'),
  ('fitnessstudio', array['gym', 'fitness', 'workout', 'training'], array['event', 'place', 'spotlight'], 'German'),
  ('friseur', array['barber', 'salon', 'hair', 'braids'], array['place', 'spotlight'], 'German'),
  ('schonheit', array['beauty', 'salon', 'spa', 'nails'], array['place', 'spotlight'], 'German (Schönheit)'),
  ('geschaft', array['shop', 'store', 'boutique'], array['event', 'place', 'spotlight'], 'German (Geschäft)'),
  ('markt', array['market', 'shopping', 'mall'], array['event', 'place', 'spotlight'], 'German'),
  ('einkaufen', array['shopping', 'mall', 'market', 'shop'], array['event', 'place', 'spotlight'], 'German'),
  ('fussball', array['football', 'soccer', 'match', 'sports'], array['event', 'place', 'spotlight'], 'German (Fußball)'),
  ('konferenz', array['conference', 'summit', 'seminar', 'workshop', 'forum', 'talk'], array['event', 'spotlight'], 'German'),
  ('kurs', array['class', 'course', 'lesson', 'training', 'workshop'], array['event', 'spotlight'], 'German'),
  ('schulung', array['training', 'workshop', 'class'], array['event', 'spotlight'], 'German'),
  ('kostenlos', array['free', 'free entry'], array['event', 'spotlight'], 'German'),
  ('schwimmbad', array['pool', 'swimming', 'swimming pool'], array['event', 'place', 'spotlight'], 'German'),
  ('wandern', array['hike', 'hiking', 'trek', 'walk'], array['event', 'place', 'spotlight'], 'German'),
  ('spiele', array['games', 'gaming', 'game night'], array['event', 'place', 'spotlight'], 'German'),
  ('gesundheit', array['health', 'wellness', 'clinic'], array['event', 'place', 'spotlight'], 'German'),
  ('kunst', array['art', 'gallery', 'exhibition', 'painting', 'artist'], array['event', 'place', 'spotlight'], 'German'),
  ('kultur', array['culture', 'cultural', 'heritage', 'tradition', 'museum'], array['event', 'place', 'spotlight'], 'German'),

  -- Portuguese (the words not already there from Spanish)
  ('cerveja', array['beer', 'pub', 'bar', 'brewery'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('vinho', array['wine', 'wine bar', 'tasting'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('pequeno almoco', array['breakfast', 'brunch', 'cafe'], array['event', 'place', 'spotlight'], 'Portuguese (pequeno-almoço)'),
  ('almoco', array['lunch', 'restaurant', 'buffet'], array['event', 'place', 'spotlight'], 'Portuguese (almoço)'),
  ('jantar', array['dinner', 'dining', 'restaurant'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('padaria', array['bakery', 'bread', 'pastries'], array['place', 'spotlight'], 'Portuguese'),
  ('festa', array['party', 'celebration', 'club', 'jam', 'rave', 'dj', 'night'], array['event', 'spotlight'], 'Portuguese'),
  ('balada', array['club', 'nightclub', 'party', 'dj', 'night'], array['event', 'spotlight'], 'Portuguese (Brazil)'),
  ('vida noturna', array['nightlife', 'club', 'nightclub', 'lounge', 'bar', 'party'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('ao vivo', array['live music', 'live band', 'concert', 'live show', 'gig'], array['event', 'spotlight'], 'Portuguese'),
  ('concerto', array['concert', 'live music', 'live show', 'gig'], array['event', 'spotlight'], 'Portuguese'),
  ('espetaculo', array['show', 'performance', 'live show', 'concert', 'theatre'], array['event', 'spotlight'], 'Portuguese (espetáculo)'),
  ('danca', array['dance', 'dancing', 'salsa', 'dance class'], array['event', 'place', 'spotlight'], 'Portuguese (dança)'),
  ('filmes', array['movies', 'cinema', 'film', 'screening'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('igreja', array['church', 'worship', 'service', 'gospel', 'praise', 'prayer'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('evangelho', array['gospel', 'worship', 'praise', 'church'], array['event', 'spotlight'], 'Portuguese'),
  ('exposicao', array['exhibition', 'gallery', 'art', 'museum'], array['event', 'place', 'spotlight'], 'Portuguese (exposição)'),
  ('museu', array['museum', 'gallery', 'heritage', 'culture'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('criancas', array['kids', 'children', 'family', 'playground'], array['event', 'place', 'spotlight'], 'Portuguese (crianças)'),
  ('casamento', array['wedding', 'engagement', 'bridal'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('aniversario', array['birthday', 'celebration', 'party'], array['event', 'spotlight'], 'Portuguese (aniversário)'),
  ('praia', array['beach', 'seaside', 'shore', 'coast', 'resort'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('alojamento', array['hotel', 'lodge', 'guest house', 'guesthouse', 'inn', 'apartment'], array['place', 'spotlight'], 'Portuguese'),
  ('hospedagem', array['hotel', 'lodge', 'guest house', 'guesthouse', 'inn', 'apartment'], array['place', 'spotlight'], 'Portuguese (Brazil)'),
  ('ginasio', array['gym', 'fitness', 'workout', 'training'], array['event', 'place', 'spotlight'], 'Portuguese (ginásio)'),
  ('desporto', array['sports', 'fitness', 'football', 'match'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('esporte', array['sports', 'fitness', 'football', 'match'], array['event', 'place', 'spotlight'], 'Portuguese (Brazil)'),
  ('esportes', array['sports', 'fitness', 'football', 'match'], array['event', 'place', 'spotlight'], 'Portuguese (Brazil)'),
  ('cabeleireiro', array['salon', 'hair', 'braids', 'barber'], array['place', 'spotlight'], 'Portuguese'),
  ('beleza', array['beauty', 'salon', 'spa', 'nails'], array['place', 'spotlight'], 'Portuguese'),
  ('loja', array['shop', 'store', 'boutique', 'mall'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('futebol', array['football', 'soccer', 'match', 'sports'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('trilha', array['hike', 'hiking', 'trek', 'walk'], array['event', 'place', 'spotlight'], 'Portuguese (Brazil)'),
  ('jogos', array['games', 'gaming', 'game night'], array['event', 'place', 'spotlight'], 'Portuguese'),
  ('saude', array['health', 'wellness', 'clinic'], array['event', 'place', 'spotlight'], 'Portuguese (saúde)'),
  ('bem estar', array['wellness', 'spa', 'massage', 'yoga'], array['event', 'place', 'spotlight'], 'Portuguese (bem-estar)')
) as v(term, expands_to, applies_to, note)
on conflict (term) do nothing;

-- ---------------------------------------------------------------------
-- 10. Fresh statistics for the rewritten tables
-- ---------------------------------------------------------------------
analyze public.event;
analyze public.place;
analyze public.user_info;
analyze public.place_service;
analyze public.content_post;

-- ---------------------------------------------------------------------
-- 11. The deploy fails here if this database folds or reads dates
--     differently from the one the change was built on
-- ---------------------------------------------------------------------
do $check$
declare
  c record;
  v_time record;
begin
  for c in
    select * from (values
      (U&'Caf\00E9 Kwae', 'cafe kwae'),
      (U&'SOIR\00C9E \00C0 la Plage', 'soiree a la plage'),
      (U&'\0186dehye\025B k\0254k\0254\0254', 'odehyee kokoo'),
      (U&'AB\0186NTEN', 'abonten'),
      (U&'Stra\00DFe M\00FCller', 'strasse muller'),
      (U&'\0152uvre \00C6ther S\00F8ren \0141\00F3d\017A', 'oeuvre aether soren lodz'),
      (U&'cafe\0301', 'cafe'),
      (U&'\1ECD\0301 \0254\0300', 'o o'),
      (U&'Esi\2019s \201CJam\201D \2013 Live', 'esi''s "jam" - live'),
      (U&'S\00E3o Jo\00E3o, ma\00F1ana', 'sao joao, manana'),
      (U&'\014Bma \0189\0254 \0191e \028Bu \0194e', 'nma do fe vu ge'),
      ('gob3', 'gob3')
    ) as t(input, expected)
  loop
    if public._search_fold(c.input) is distinct from c.expected then
      raise exception 'migration check: search folding differs on this database: % gave %, expected %',
        c.input, public._search_fold(c.input), c.expected;
    end if;
  end loop;

  if public._search_normalize(U&'  D\00C9CEMBRE   \00E0  Accra ') <> 'decembre a accra' then
    raise exception 'migration check: search normalisation does not fold: %',
      public._search_normalize(U&'  D\00C9CEMBRE   \00E0  Accra ');
  end if;

  select * into v_time from public._search_temporal('jazz this weekend', now(), 'Africa/Accra');
  if v_time.rest <> 'jazz' or v_time.date_from is null or v_time.date_words <> 'weekend' then
    raise exception 'migration check: English date words changed: %', v_time;
  end if;
  select * into v_time from public._search_temporal('jazz ce week-end', now(), 'Africa/Accra');
  if v_time.rest <> 'jazz' or v_time.date_from is null or v_time.date_words <> 'week end' then
    raise exception 'migration check: French date words are not read: %', v_time;
  end if;
  select * into v_time from public._search_temporal('conciertos este fin de semana', now(), 'Africa/Accra');
  if v_time.rest <> 'conciertos' or v_time.date_from is null then
    raise exception 'migration check: Spanish date words are not read: %', v_time;
  end if;
  select * into v_time from public._search_temporal('konzert heute abend', now(), 'Africa/Accra');
  if v_time.rest <> 'konzert' or v_time.date_from is null or v_time.date_words <> 'heute abend' then
    raise exception 'migration check: German date words are not read: %', v_time;
  end if;
  select * into v_time from public._search_temporal('festa em dezembro', now(), 'Africa/Accra');
  if v_time.rest <> 'festa' or v_time.date_from is null then
    raise exception 'migration check: Portuguese date words are not read: %', v_time;
  end if;
  select * into v_time from public._search_temporal('le petit paris', now(), 'Africa/Accra');
  if v_time.rest <> 'le petit paris' or v_time.date_from is not null then
    raise exception 'migration check: a query with no date changed: %', v_time;
  end if;
end
$check$;
