-- Search vocabulary tuning from real searches.
--
-- 20260919091000 added search_concept with a hand-picked starter set. The
-- vocabulary only gets good by watching what people actually type, so this
-- gives staff the loop to do that from Admin › Discovery › Vocabulary:
--
--   * admin_search_vocabulary_gaps(days, limit) — the submitted searches in
--     the window that found nothing, or found something nobody opened,
--     grouped by query, with whether the vocabulary already knows any of its
--     words. Built on search_query_log (no user, device or session data).
--   * admin_search_concept_preview(term, words, scopes) — what a term would
--     match before it is saved: counts and a few titles per result type,
--     using exactly the expansion the search functions build.
--   * More starter terms: the everyday words for the app's own event
--     categories and types and place categories (the listing side already
--     indexes those names; people rarely type them).
--
-- Both functions are service-role only; the admin service checks
-- discovery.view before calling them. Edits to search_concept go through the
-- admin service (discovery.configure + step-up, audited), never a client.

-- ---------------------------------------------------------------------
-- 1. Gaps: what people searched for and did not find
-- ---------------------------------------------------------------------
create or replace function public.admin_search_vocabulary_gaps(
  p_days  integer default 30,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with win as (
    select l.query_norm, l.zero_results, l.clicked_at, l.created_at
    from public.search_query_log l
    where l.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
      and l.surface <> 'suggest'
      and l.mode = 'text'
      and l.query_norm <> ''
  ),
  agg as (
    select w.query_norm,
           count(*)::integer as searches,
           (count(*) filter (where w.zero_results))::integer as zero_results,
           (count(*) filter (where w.clicked_at is not null))::integer as clicks,
           max(w.created_at) as last_seen
    from win w
    group by w.query_norm
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.zero_results desc, g.searches desc, g.query_norm), '[]'::jsonb)
  from (
    select a.query_norm,
           a.searches,
           a.zero_results,
           a.clicks,
           a.last_seen,
           (
             public._search_related_tsquery(a.query_norm, 'event') is not null
             or public._search_related_tsquery(a.query_norm, 'place') is not null
             or public._search_related_tsquery(a.query_norm, 'spotlight') is not null
           ) as covered
    from agg a
    where a.zero_results > 0 or a.clicks = 0
    order by a.zero_results desc, a.searches desc, a.query_norm
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) g;
$$;

revoke all on function public.admin_search_vocabulary_gaps(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_vocabulary_gaps(integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- 2. Preview: what a term would find, before it is saved
-- ---------------------------------------------------------------------
create or replace function public.admin_search_concept_preview(
  p_term       text,
  p_expands_to text[],
  p_applies_to text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q    tsquery;
  v_part tsquery;
  v_word text;
  v_out  jsonb := '{}'::jsonb;
begin
  -- The term itself plus each word as a phrase, OR-ed: the same shape
  -- _search_concept_alternatives builds for a saved row.
  foreach v_word in array array_prepend(coalesce(p_term, ''), coalesce(p_expands_to, '{}')) loop
    v_part := phraseto_tsquery('simple'::regconfig, v_word);
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
$$;

revoke all on function public.admin_search_concept_preview(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.admin_search_concept_preview(text, text[], text[]) to service_role;

-- ---------------------------------------------------------------------
-- 3. More starter vocabulary: everyday words for the app's categories
-- ---------------------------------------------------------------------
insert into public.search_concept (term, expands_to, applies_to, note) values
  -- Event categories and types (packages/core/src/eventCategoriesAndTypes.ts)
  ('music', array['concert', 'live music', 'dj', 'gig', 'music festival', 'listening party', 'album launch'], array['event', 'place', 'spotlight'], 'Category: Music & Concerts'),
  ('show', array['concert', 'comedy', 'theatre', 'performance', 'talent show', 'magic show'], array['event', 'spotlight'], null),
  ('theatre', array['theater', 'drama', 'play', 'stage play', 'musical theatre'], array['event', 'place', 'spotlight'], 'Category: Arts, Culture & Theatre'),
  ('poetry', array['spoken word', 'poetry slam', 'open mic', 'storytelling'], array['event', 'spotlight'], null),
  ('dance', array['dance performance', 'dance class', 'traditional dances', 'choreography', 'dance battle'], array['event', 'place', 'spotlight'], null),
  ('worship', array['church', 'praise', 'gospel', 'worship night', 'revival', 'prayer'], array['event', 'spotlight'], 'Category: Spirituality & Religion'),
  ('prayer', array['prayer camp', 'fasting', 'revival', 'church', 'worship'], array['event', 'spotlight'], null),
  ('seminar', array['workshop', 'lecture', 'training', 'conference', 'webinar'], array['event', 'spotlight'], 'Category: Education & Training'),
  ('career', array['career fair', 'job fair', 'jobs', 'recruitment', 'internship'], array['event', 'spotlight'], null),
  ('networking', array['meetup', 'mixer', 'business expo', 'startup pitch', 'investor meetup'], array['event', 'spotlight'], 'Category: Business & Professional'),
  ('business', array['entrepreneurship', 'startup', 'networking', 'expo', 'summit', 'launch'], array['event', 'spotlight'], null),
  ('tech', array['technology', 'hackathon', 'tech meetup', 'developer', 'coding', 'startup', 'ai'], array['event', 'spotlight'], 'Category: Tech & Innovation'),
  ('hackathon', array['coding competition', 'tech', 'developer', 'build'], array['event', 'spotlight'], null),
  ('gaming', array['game', 'games', 'esports', 'playstation', 'fifa', 'arcade', 'gaming center'], array['event', 'place', 'spotlight'], 'Event type and place category'),
  ('charity', array['fundraising', 'fundraiser', 'donation', 'volunteer', 'outreach', 'nonprofit'], array['event', 'spotlight'], 'Category: Charity & Causes'),
  ('volunteer', array['volunteering', 'charity', 'clean up', 'outreach', 'community service'], array['event', 'spotlight'], null),
  ('sports', array['sport', 'football', 'basketball', 'marathon', 'run', 'fitness', 'tournament'], array['event', 'place', 'spotlight'], 'Category: Sports & Fitness'),
  ('marathon', array['run', 'race', 'fun run', 'walk', 'charity walk'], array['event', 'spotlight'], null),
  ('wedding', array['marriage', 'engagement', 'bridal', 'reception'], array['event', 'place', 'spotlight'], null),
  ('funeral', array['burial', 'memorial', 'final funeral rites', 'one week'], array['event', 'spotlight'], null),
  ('birthday', array['birthday party', 'celebration', 'party'], array['event', 'place', 'spotlight'], null),
  ('fashion', array['fashion show', 'runway', 'designer', 'clothing', 'style'], array['event', 'place', 'spotlight'], null),
  ('food festival', array['food fair', 'food bazaar', 'tasting', 'street food'], array['event', 'spotlight'], null),

  -- Place categories (place_category)
  ('eatery', array['restaurant', 'food spot', 'chop bar', 'canteen', 'local food'], array['place', 'spotlight'], 'Place category: Food Spot'),
  ('pub', array['bar', 'drinking spot', 'lounge', 'beer', 'spot'], array['place', 'spotlight'], 'Place category: Pub'),
  ('nightclub', array['club', 'night club', 'lounge', 'dj'], array['event', 'place', 'spotlight'], 'Place category: Nightclub'),
  ('games', array['gaming center', 'arcade', 'playstation', 'game centre', 'pool', 'snooker', 'bowling'], array['place', 'spotlight'], 'Place category: Gaming Center'),
  ('supermarket', array['mall', 'grocery', 'groceries', 'shop', 'store', 'mart'], array['place', 'spotlight'], 'Place category: Supermarket'),
  ('skating', array['skate', 'roller skating', 'rink', 'ice skating'], array['event', 'place', 'spotlight'], 'Place category: Skating'),
  ('karting', array['go-karting', 'go karting', 'go kart', 'racing', 'kart'], array['event', 'place', 'spotlight'], 'Place category: Go-Karting'),
  ('fun', array['entertainment', 'recreation', 'games', 'amusement', 'park', 'playground'], array['event', 'place', 'spotlight'], 'Place categories: Entertainment, Recreation'),
  ('park', array['garden', 'recreation', 'picnic', 'playground', 'outdoor'], array['event', 'place', 'spotlight'], null),
  ('pool', array['swimming', 'swimming pool', 'pool party'], array['event', 'place', 'spotlight'], null),
  ('lodging', array['hotel', 'guest house', 'lodge', 'airbnb', 'apartment', 'accommodation'], array['place', 'spotlight'], null)
on conflict (term) do nothing;
