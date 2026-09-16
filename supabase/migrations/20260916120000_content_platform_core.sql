-- Spotlight + Stories content platform — part 1 of 3: core schema.
--
-- Spotlight is persistent short-form content; a Story is a temporary
-- sequence of media from an organizer, a place owner or Abonten. Both share
-- one post row (`content_post.kind`), one media pipeline (`content_media`,
-- with its own state separate from the post's), one engagement layer and
-- one moderation/report path. Design and reasoning:
-- docs/audit/spotlight-stories-pre-implementation-report.md.
--
-- Naming: everything is prefixed `content_`. The legacy, unused `story` and
-- `story_default` tables (0 rows) are deliberately left untouched.
--
-- Access: RLS on every table. Clients never write any of these tables:
-- every write goes through @abonten/services on the service role after the
-- transport proved identity and the service checked ownership/eligibility.
-- Reads are opened only where a public or owner read is safe (see the
-- policies at the end). Restricted accounts (suspended / banned / deleted)
-- are blocked by guard_restricted_account like every other user-writable
-- table — even though writes are service-role, the trigger costs nothing
-- and keeps the invariant should a grant ever be widened.
--
-- Ships OFF: content_program_setting.spotlight_enabled = false,
-- stories_enabled = false, audiences 'staff', promotions off, downloads off.

-- ---------------------------------------------------------------------
-- 1. Programme switches
-- ---------------------------------------------------------------------
create table public.content_program_setting (
  id                              smallint    primary key default 1 check (id = 1),
  -- Spotlight
  spotlight_enabled               boolean     not null default false,
  spotlight_audience              text        not null default 'staff'
                                    check (spotlight_audience in ('staff', 'beta', 'all')),
  spotlight_posting_enabled       boolean     not null default true,
  spotlight_comments_enabled      boolean     not null default true,
  spotlight_downloads_enabled     boolean     not null default false,
  spotlight_promotions_enabled    boolean     not null default false,
  nearby_enabled                  boolean     not null default true,
  trending_enabled                boolean     not null default true,
  happening_soon_enabled          boolean     not null default true,
  -- Approved creators (people who are neither organizers nor place owners).
  -- Nothing grants creator status yet; the switch exists so the eligibility
  -- rule can grow without a schema change.
  creator_posting_enabled         boolean     not null default false,
  -- Stories
  stories_enabled                 boolean     not null default false,
  stories_audience                text        not null default 'staff'
                                    check (stories_audience in ('staff', 'beta', 'all')),
  stories_posting_enabled         boolean     not null default true,
  stories_comments_enabled        boolean     not null default true,
  stories_reactions_enabled       boolean     not null default true,
  stories_sharing_enabled         boolean     not null default true,
  story_ttl_hours                 smallint    not null default 24  check (story_ttl_hours between 1 and 168),
  max_story_items                 smallint    not null default 10  check (max_story_items between 1 and 20),
  beta_user_ids                   uuid[]      not null default '{}',
  -- Limits (per person)
  spotlight_posts_per_day         smallint    not null default 20  check (spotlight_posts_per_day between 1 and 200),
  stories_per_day                 smallint    not null default 30  check (stories_per_day between 1 and 200),
  comments_per_hour               smallint    not null default 60  check (comments_per_hour between 1 and 600),
  follows_per_hour                smallint    not null default 100 check (follows_per_hour between 1 and 1000),
  spotlight_video_max_seconds     smallint    not null default 90  check (spotlight_video_max_seconds between 5 and 600),
  story_video_max_seconds         smallint    not null default 60  check (story_video_max_seconds between 5 and 300),
  -- Feed mixing and ranking (weights live here so ranking can change without a release)
  feed_page_size                  smallint    not null default 10  check (feed_page_size between 3 and 30),
  sponsored_max_share_bps         smallint    not null default 2000 check (sponsored_max_share_bps between 0 and 5000),
  sponsored_min_gap               smallint    not null default 4   check (sponsored_min_gap between 1 and 20),
  sponsored_daily_cap_per_viewer  smallint    not null default 3   check (sponsored_daily_cap_per_viewer between 0 and 50),
  trending_window_hours           smallint    not null default 72  check (trending_window_hours between 6 and 720),
  nearby_default_radius_km        numeric     not null default 25  check (nearby_default_radius_km between 1 and 200),
  happening_soon_days             smallint    not null default 14  check (happening_soon_days between 1 and 60),
  rank_weight_recency             numeric     not null default 1.0  check (rank_weight_recency between 0 and 10),
  rank_weight_engagement          numeric     not null default 1.0  check (rank_weight_engagement between 0 and 10),
  rank_weight_following           numeric     not null default 1.5  check (rank_weight_following between 0 and 10),
  rank_weight_proximity           numeric     not null default 1.0  check (rank_weight_proximity between 0 and 10),
  rank_weight_urgency             numeric     not null default 0.8  check (rank_weight_urgency between 0 and 10),
  rank_seen_penalty               numeric     not null default 0.6  check (rank_seen_penalty between 0 and 1),
  -- Telemetry validity
  meaningful_view_ms              integer     not null default 2000 check (meaningful_view_ms between 500 and 30000),
  views_per_viewer_per_minute     smallint    not null default 120  check (views_per_viewer_per_minute between 10 and 2000),
  -- Retention
  expired_story_retention_days    integer     not null default 30  check (expired_story_retention_days between 1 and 365),
  deleted_post_retention_days     integer     not null default 30  check (deleted_post_retention_days between 1 and 365),
  raw_view_retention_days         integer     not null default 90  check (raw_view_retention_days between 7 and 730),
  orphan_media_hours              smallint    not null default 24  check (orphan_media_hours between 1 and 168),
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid
);

comment on table public.content_program_setting is
  'Spotlight + Stories switches, audiences, limits, feed mixing weights and retention (one row). Ships off. Edited only from the admin console (service role); SPOTLIGHT_KILL_SWITCH / STORIES_KILL_SWITCH on the web deployment win over it.';

insert into public.content_program_setting (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Follow graph (canonical; used by Stories, the Following feed and
--    later discovery). "Notify me" (notification_subscription) stays a
--    separate, explicit consent.
-- ---------------------------------------------------------------------
create table public.follow (
  id           uuid        primary key default gen_random_uuid(),
  follower_id  uuid        not null references public.user_info (id) on delete cascade,
  target_kind  text        not null check (target_kind in ('organizer', 'place')),
  target_id    uuid        not null,
  created_at   timestamptz not null default now(),
  constraint follow_unique unique (follower_id, target_kind, target_id)
);

comment on table public.follow is
  'Who follows which organizer (a user) or place. Service-role writes only (self-follow, target visibility and rate limits are checked in @abonten/services); the owner can read their own rows.';

create index idx_follow_target on public.follow (target_kind, target_id);
create index idx_follow_follower on public.follow (follower_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Posts and media
-- ---------------------------------------------------------------------
-- array_to_string is only STABLE, which a generated column refuses; the
-- join of a text[] with spaces is deterministic, so wrap it as IMMUTABLE.
create or replace function public._content_hashtags_text(p_tags text[])
returns text
language sql
immutable
set search_path = ''
as $$ select array_to_string(p_tags, ' ') $$;

create table public.content_post (
  id                   uuid        primary key default gen_random_uuid(),
  kind                 text        not null check (kind in ('spotlight', 'story')),
  author_id            uuid        not null references public.user_info (id) on delete cascade,
  -- The identity the post is shown under. 'organizer' = the author; 'place'
  -- = one of the author's places (publisher_place_id); 'abonten' = the
  -- official account (author must be active staff at publish time).
  publisher_kind       text        not null default 'organizer'
                         check (publisher_kind in ('organizer', 'place', 'abonten')),
  publisher_place_id   uuid        references public.place (id) on delete cascade,
  caption              text        check (caption is null or char_length(caption) <= 2200),
  status               text        not null default 'draft'
                         check (status in ('draft', 'published', 'archived', 'deleted')),
  moderation_state     text        not null default 'visible'
                         check (moderation_state in ('visible', 'hidden', 'removed', 'restricted')),
  moderated_at         timestamptz,
  moderated_by         uuid        references public.user_info (id) on delete set null,
  moderation_reason    text,
  published_at         timestamptz,
  -- Stories only: server-set at publish (now() + story_ttl_hours).
  expires_at           timestamptz,
  event_id             uuid        references public.event (id) on delete set null,
  place_id             uuid        references public.place (id) on delete set null,
  category             text,
  hashtags             text[]      not null default '{}',
  location             extensions.geography(Point, 4326),
  location_source      text        check (location_source is null or location_source in ('event', 'place', 'creator')),
  allow_comments       boolean     not null default true,
  allow_download       boolean     not null default false,
  rights_acknowledged_at timestamptz,
  cover_media_id       uuid,
  like_count           integer     not null default 0,
  reaction_count       integer     not null default 0,
  comment_count        integer     not null default 0,
  share_count          integer     not null default 0,
  save_count           integer     not null default 0,
  view_count           integer     not null default 0,
  impression_count     integer     not null default 0,
  trending_score       numeric     not null default 0,
  trending_computed_at timestamptz,
  search_tsv           tsvector    generated always as (
                         setweight(to_tsvector('simple'::regconfig, coalesce(caption, '')), 'A')
                         || setweight(to_tsvector('simple'::regconfig, public._content_hashtags_text(hashtags)), 'B')
                       ) stored,
  version              integer     not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint content_post_publisher_place_check check (
    (publisher_kind = 'place' and publisher_place_id is not null)
    or (publisher_kind <> 'place' and publisher_place_id is null)
  ),
  constraint content_post_story_expiry_check check (
    kind = 'spotlight' and expires_at is null
    or kind = 'story' and (status <> 'published' or expires_at is not null)
  ),
  constraint content_post_published_at_check check (
    status <> 'published' or published_at is not null
  ),
  constraint content_post_hashtags_check check (
    cardinality(hashtags) <= 15
  )
);

comment on table public.content_post is
  'A Spotlight (persistent) or Story (expires) post. Service-role writes only; public read for published, visible/restricted, unexpired rows plus the author''s own rows. Counters are trigger-maintained caches.';

create index idx_content_post_feed
  on public.content_post (kind, published_at desc, id desc)
  where status = 'published';
create index idx_content_post_author
  on public.content_post (author_id, kind, created_at desc);
create index idx_content_post_publisher_place
  on public.content_post (publisher_place_id, kind, published_at desc)
  where publisher_place_id is not null;
create index idx_content_post_event
  on public.content_post (event_id) where event_id is not null;
create index idx_content_post_place
  on public.content_post (place_id) where place_id is not null;
create index idx_content_post_story_active
  on public.content_post (expires_at)
  where kind = 'story' and status = 'published';
create index idx_content_post_trending
  on public.content_post (trending_score desc)
  where kind = 'spotlight' and status = 'published' and moderation_state = 'visible';
create index idx_content_post_location
  on public.content_post using gist (location)
  where status = 'published';
create index idx_content_post_hashtags
  on public.content_post using gin (hashtags);
create index idx_content_post_search
  on public.content_post using gin (search_tsv);
create index idx_content_post_moderation
  on public.content_post (moderation_state, moderated_at desc)
  where moderation_state <> 'visible';
create index idx_content_post_deleted
  on public.content_post (deleted_at) where status = 'deleted';

create table public.content_media (
  id                 uuid        primary key default gen_random_uuid(),
  owner_id           uuid        not null references public.user_info (id) on delete cascade,
  post_id            uuid        references public.content_post (id) on delete cascade,
  position           smallint    not null default 0 check (position between 0 and 19),
  media_type         text        not null check (media_type in ('image', 'video')),
  public_id          text        not null unique check (public_id ~* '^[a-z0-9_\/-]+$'),
  version            bigint      not null,
  format             text,
  bytes              bigint      not null check (bytes >= 0),
  width              integer,
  height             integer,
  duration_seconds   numeric,
  media_url          text        not null check (media_url ~* '^https://'),
  playback_url       text        check (playback_url is null or playback_url ~* '^https://'),
  poster_url         text        check (poster_url is null or poster_url ~* '^https://'),
  thumbnail_url      text        check (thumbnail_url is null or thumbnail_url ~* '^https://'),
  -- Media state, separate from the post state (a post can be pending
  -- review while its media is ready).
  status             text        not null default 'uploaded'
                       check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'deleted')),
  -- The optimised rendition: none (not needed), pending, ready, failed. A
  -- failure never blocks viewing — the original is always playable.
  playback_status    text        not null default 'none'
                       check (playback_status in ('none', 'pending', 'ready', 'failed')),
  trim_start_seconds numeric     check (trim_start_seconds is null or trim_start_seconds >= 0),
  trim_end_seconds   numeric     check (trim_end_seconds is null or trim_end_seconds > 0),
  failure_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  purged_at          timestamptz,
  constraint content_media_trim_check check (
    trim_start_seconds is null or trim_end_seconds is null or trim_end_seconds > trim_start_seconds
  )
);

comment on table public.content_media is
  'One media item of a post. Registered by the service after a signed direct Cloudinary upload and verified against Cloudinary''s Admin API (bytes, duration, dimensions, format are never taken from the client).';

create index idx_content_media_post on public.content_media (post_id, position);
create index idx_content_media_owner on public.content_media (owner_id, created_at desc);
create index idx_content_media_orphans
  on public.content_media (created_at) where post_id is null and status <> 'deleted';
create index idx_content_media_purge
  on public.content_media (deleted_at) where status = 'deleted' and purged_at is null;

alter table public.content_post
  add constraint content_post_cover_media_fkey
  foreign key (cover_media_id) references public.content_media (id) on delete set null
  deferrable initially deferred;

-- ---------------------------------------------------------------------
-- 4. Engagement
-- ---------------------------------------------------------------------
create table public.content_like (
  post_id    uuid        not null references public.content_post (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index idx_content_like_user on public.content_like (user_id, created_at desc);

create table public.content_reaction (
  post_id    uuid        not null references public.content_post (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  emoji      text        not null check (emoji in ('❤️', '🔥', '😂', '😍', '👏', '😮', '👍')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.content_save (
  post_id    uuid        not null references public.content_post (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index idx_content_save_user on public.content_save (user_id, created_at desc);

create table public.content_share (
  id         bigint      generated always as identity primary key,
  post_id    uuid        not null references public.content_post (id) on delete cascade,
  user_id    uuid        references public.user_info (id) on delete set null,
  channel    text        not null default 'native'
               check (channel in ('native', 'whatsapp', 'instagram', 'facebook', 'x', 'copy_link', 'internal', 'other')),
  created_at timestamptz not null default now()
);
create index idx_content_share_post on public.content_share (post_id, created_at desc);

create table public.content_comment (
  id                uuid        primary key default gen_random_uuid(),
  post_id           uuid        not null references public.content_post (id) on delete cascade,
  author_id         uuid        not null references public.user_info (id) on delete cascade,
  parent_id         uuid        references public.content_comment (id) on delete cascade,
  body              text        not null check (char_length(body) between 1 and 1000),
  status            text        not null default 'visible' check (status in ('visible', 'deleted')),
  moderation_state  text        not null default 'visible'
                      check (moderation_state in ('visible', 'hidden', 'removed', 'restricted')),
  moderated_at      timestamptz,
  moderated_by      uuid        references public.user_info (id) on delete set null,
  moderation_reason text,
  like_count        integer     not null default 0,
  reply_count       integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index idx_content_comment_post on public.content_comment (post_id, created_at desc)
  where parent_id is null;
create index idx_content_comment_parent on public.content_comment (parent_id, created_at)
  where parent_id is not null;
create index idx_content_comment_author on public.content_comment (author_id, created_at desc);

create table public.content_comment_like (
  comment_id uuid        not null references public.content_comment (id) on delete cascade,
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.content_story_seen (
  post_id       uuid        not null references public.content_post (id) on delete cascade,
  viewer_id     uuid        not null references public.user_info (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  completed     boolean     not null default false,
  primary key (post_id, viewer_id)
);
create index idx_content_story_seen_viewer on public.content_story_seen (viewer_id, last_seen_at desc);

create table public.content_mute (
  user_id        uuid        not null references public.user_info (id) on delete cascade,
  publisher_kind text        not null check (publisher_kind in ('organizer', 'place', 'abonten')),
  publisher_id   uuid        not null,
  created_at     timestamptz not null default now(),
  primary key (user_id, publisher_kind, publisher_id)
);
comment on table public.content_mute is
  'Mute a publisher''s Stories only. Never unfollows, blocks or hides Spotlight, events or places.';

create table public.content_not_interested (
  user_id    uuid        not null references public.user_info (id) on delete cascade,
  post_id    uuid        not null references public.content_post (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ---------------------------------------------------------------------
-- 5. Telemetry (raw, validated on ingest) and roll-ups
-- ---------------------------------------------------------------------
create table public.content_view (
  id             bigint      generated always as identity primary key,
  post_id        uuid        not null references public.content_post (id) on delete cascade,
  viewer_id      uuid,
  -- Stable, non-identifying key for the device/session (install id hash or
  -- a hash of ip + user agent for signed-out web). Dedupe only.
  viewer_key     text        not null,
  kind           text        not null
                   check (kind in ('impression', 'view_start', 'meaningful_view', 'completion', 'replay')),
  watched_ms     integer     not null default 0 check (watched_ms >= 0),
  surface        text        not null default 'for_you'
                   check (surface in ('for_you', 'following', 'nearby', 'happening_soon', 'trending',
                                      'stories', 'profile', 'deep_link', 'search', 'embed')),
  campaign_id    uuid,
  valid          boolean     not null default true,
  invalid_reason text,
  created_at     timestamptz not null default now()
);
create index idx_content_view_post on public.content_view (post_id, created_at desc);
create index idx_content_view_dedupe on public.content_view (viewer_key, post_id, kind, created_at desc);
create index idx_content_view_created on public.content_view (created_at);
create index idx_content_view_campaign on public.content_view (campaign_id, created_at)
  where campaign_id is not null;

create table public.content_click (
  id             bigint      generated always as identity primary key,
  post_id        uuid        not null references public.content_post (id) on delete cascade,
  viewer_id      uuid,
  viewer_key     text        not null,
  kind           text        not null
                   check (kind in ('profile', 'event', 'place', 'ticket', 'cta', 'hashtag')),
  campaign_id    uuid,
  valid          boolean     not null default true,
  invalid_reason text,
  created_at     timestamptz not null default now()
);
create index idx_content_click_post on public.content_click (post_id, created_at desc);
create index idx_content_click_viewer on public.content_click (viewer_id, kind, created_at desc)
  where viewer_id is not null;
create index idx_content_click_created on public.content_click (created_at);
create index idx_content_click_campaign on public.content_click (campaign_id, created_at)
  where campaign_id is not null;

create table public.content_post_daily_stat (
  post_id          uuid    not null references public.content_post (id) on delete cascade,
  day              date    not null,
  impressions      integer not null default 0,
  view_starts      integer not null default 0,
  meaningful_views integer not null default 0,
  completions      integer not null default 0,
  replays          integer not null default 0,
  watched_ms_total bigint  not null default 0,
  unique_viewers   integer not null default 0,
  likes            integer not null default 0,
  comments         integer not null default 0,
  shares           integer not null default 0,
  saves            integer not null default 0,
  profile_clicks   integer not null default 0,
  event_clicks     integer not null default 0,
  place_clicks     integer not null default 0,
  ticket_clicks    integer not null default 0,
  cta_clicks       integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (post_id, day)
);
create index idx_content_post_daily_stat_day on public.content_post_daily_stat (day desc);

-- Watermark for the hourly roll-up so it never re-counts rows.
create table public.content_rollup_state (
  id           boolean     primary key default true check (id),
  view_id      bigint      not null default 0,
  click_id     bigint      not null default 0,
  last_run_at  timestamptz
);
insert into public.content_rollup_state (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 6. Counter triggers (post row caches). Service-role and triggers only.
-- ---------------------------------------------------------------------
create or replace function public._content_counter_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post   uuid;
  v_delta  integer;
  v_column text;
begin
  v_delta := case when tg_op = 'INSERT' then 1 else -1 end;
  v_post  := case when tg_op = 'INSERT' then new.post_id else old.post_id end;
  v_column := case tg_table_name
    when 'content_like'     then 'like_count'
    when 'content_reaction' then 'reaction_count'
    when 'content_save'     then 'save_count'
    when 'content_share'    then 'share_count'
    when 'content_comment'  then 'comment_count'
    else null
  end;
  if v_column is null then
    return null;
  end if;
  -- A reaction switching emoji is an UPDATE: no count change.
  if tg_op = 'UPDATE' then
    return null;
  end if;
  -- Deleted / moderated comments are counted out separately (see below);
  -- only visible top-level comments and replies count.
  if tg_table_name = 'content_comment' then
    if tg_op = 'INSERT' and new.status <> 'visible' then
      return null;
    end if;
    if tg_op = 'DELETE' and (old.status <> 'visible' or old.moderation_state in ('hidden', 'removed')) then
      return null;
    end if;
  end if;
  execute format(
    'update public.content_post set %I = greatest(0, %I + $1), updated_at = now() where id = $2',
    v_column, v_column
  ) using v_delta, v_post;
  return null;
end;
$$;

create trigger trg_content_like_count
  after insert or delete on public.content_like
  for each row execute function public._content_counter_touch();
create trigger trg_content_reaction_count
  after insert or delete on public.content_reaction
  for each row execute function public._content_counter_touch();
create trigger trg_content_save_count
  after insert or delete on public.content_save
  for each row execute function public._content_counter_touch();
create trigger trg_content_share_count
  after insert or delete on public.content_share
  for each row execute function public._content_counter_touch();
create trigger trg_content_comment_count
  after insert or delete on public.content_comment
  for each row execute function public._content_counter_touch();

-- Comment soft-delete / moderation keeps the row but must adjust the cached
-- counts: visible -> not visible = -1, and back = +1.
create or replace function public._content_comment_visibility_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was boolean := old.status = 'visible' and old.moderation_state in ('visible', 'restricted');
  v_is  boolean := new.status = 'visible' and new.moderation_state in ('visible', 'restricted');
begin
  if v_was and not v_is then
    update public.content_post set comment_count = greatest(0, comment_count - 1) where id = new.post_id;
    if new.parent_id is not null then
      update public.content_comment set reply_count = greatest(0, reply_count - 1) where id = new.parent_id;
    end if;
  elsif v_is and not v_was then
    update public.content_post set comment_count = comment_count + 1 where id = new.post_id;
    if new.parent_id is not null then
      update public.content_comment set reply_count = reply_count + 1 where id = new.parent_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_content_comment_visibility
  after update of status, moderation_state on public.content_comment
  for each row execute function public._content_comment_visibility_touch();

create or replace function public._content_comment_reply_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null and new.status = 'visible' then
    update public.content_comment set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null and old.status = 'visible' then
    update public.content_comment set reply_count = greatest(0, reply_count - 1) where id = old.parent_id;
  end if;
  return null;
end;
$$;

create trigger trg_content_comment_reply
  after insert or delete on public.content_comment
  for each row execute function public._content_comment_reply_touch();

create or replace function public._content_comment_like_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.content_comment set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.content_comment set like_count = greatest(0, like_count - 1) where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger trg_content_comment_like
  after insert or delete on public.content_comment_like
  for each row execute function public._content_comment_like_touch();

create or replace function public._content_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_content_post_updated_at
  before update on public.content_post
  for each row execute function public._content_touch_updated_at();
create trigger trg_content_media_updated_at
  before update on public.content_media
  for each row execute function public._content_touch_updated_at();
create trigger trg_content_comment_updated_at
  before update on public.content_comment
  for each row execute function public._content_touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. Visibility predicate shared by RLS, feeds and the tray
-- ---------------------------------------------------------------------
-- True when a post may be shown to the public right now: published, not
-- hidden or removed (restricted rows stay reachable by direct link but are
-- excluded from feeds by the feed functions), and — for a Story — not
-- expired by the database clock.
create or replace function public.content_post_is_public(
  p_status text,
  p_moderation_state text,
  p_kind text,
  p_published_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'published'
     and p_moderation_state in ('visible', 'restricted')
     and p_published_at is not null
     and (p_kind <> 'story' or (p_expires_at is not null and p_expires_at > now()))
$$;

-- Global (conversation_id null) block in either direction.
create or replace function public.content_users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.conversation_block b
    where b.conversation_id is null
      and ((b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a))
  )
$$;

revoke all on function public.content_users_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.content_users_blocked(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 8. Eligibility: who may publish, and under which identity
-- ---------------------------------------------------------------------
create or replace function public.content_publisher_eligible(
  p_user_id uuid,
  p_publisher_kind text,
  p_publisher_place_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.content_program_setting%rowtype;
begin
  select * into v_settings from public.content_program_setting where id = 1;
  if p_user_id is null then return false; end if;
  if exists (select 1 from public.user_info u where u.id = p_user_id and u.status_id in (2, 3, 4)) then
    return false;
  end if;
  if p_publisher_kind = 'abonten' then
    return exists (select 1 from public.admin_user a where a.user_id = p_user_id and a.status = 'active');
  end if;
  if p_publisher_kind = 'place' then
    return p_publisher_place_id is not null and exists (
      select 1 from public.place p
      where p.id = p_publisher_place_id
        and p.owner_id = p_user_id
        and p.status = 'published'
        and coalesce(p.moderation_state, 'visible') not in ('hidden', 'removed')
        and coalesce(p.temporary_status, '') <> 'permanently_closed'
    );
  end if;
  -- organizer: owns at least one published, live event, or is a verified
  -- organizer, or owns a published place (a place owner may also post as
  -- themselves), or — when the switch is on — is an approved creator.
  if exists (
    select 1 from public.event e
    where e.organizer_id = p_user_id
      and e.status = 'published'
      and e.archived_at is null
      and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')
  ) then return true; end if;
  if exists (select 1 from public.user_info u where u.id = p_user_id and coalesce(u.organizer_verified, false)) then
    return true;
  end if;
  if exists (
    select 1 from public.place p
    where p.owner_id = p_user_id and p.status = 'published'
      and coalesce(p.moderation_state, 'visible') not in ('hidden', 'removed')
  ) then return true; end if;
  return false;
end;
$$;

revoke all on function public.content_publisher_eligible(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.content_publisher_eligible(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 9. Publish: the only thing that moves a post to 'published'
-- ---------------------------------------------------------------------
-- Checks eligibility, media readiness, attachment validity and the
-- publisher's right to attach the event/place, then stamps published_at,
-- expires_at (Stories), category and location. Returns the post id.
create or replace function public.content_post_publish(
  p_post_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post      public.content_post%rowtype;
  v_settings  public.content_program_setting%rowtype;
  v_media_ok  integer;
  v_media_bad integer;
  v_event     record;
  v_place     record;
  v_location  extensions.geography(Point, 4326);
  v_source    text;
  v_category  text;
  v_first     uuid;
  v_event_place uuid;
begin
  select * into v_settings from public.content_program_setting where id = 1;

  select * into v_post from public.content_post where id = p_post_id for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if v_post.author_id <> p_actor_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_post.status <> 'draft' then
    raise exception 'Only a draft can be published' using errcode = '22023';
  end if;
  if not public.content_publisher_eligible(p_actor_id, v_post.publisher_kind, v_post.publisher_place_id) then
    raise exception 'Not eligible to publish' using errcode = '42501';
  end if;
  if v_post.kind = 'spotlight' and not v_settings.spotlight_posting_enabled then
    raise exception 'Spotlight posting is paused' using errcode = '42501';
  end if;
  if v_post.kind = 'story' and not v_settings.stories_posting_enabled then
    raise exception 'Story posting is paused' using errcode = '42501';
  end if;
  if v_post.rights_acknowledged_at is null then
    raise exception 'Content rights must be acknowledged' using errcode = '22023';
  end if;

  select count(*) filter (where status in ('uploaded', 'processing', 'ready')),
         count(*) filter (where status in ('uploading', 'failed', 'deleted'))
    into v_media_ok, v_media_bad
  from public.content_media m
  where m.post_id = p_post_id;
  if v_media_ok = 0 then
    raise exception 'A post needs at least one media item' using errcode = '22023';
  end if;
  if v_media_bad > 0 then
    raise exception 'Some media is not ready' using errcode = '22023';
  end if;
  if v_post.kind = 'spotlight' and v_media_ok > 1 then
    raise exception 'A Spotlight holds one media item' using errcode = '22023';
  end if;
  if v_post.kind = 'story' and v_media_ok > v_settings.max_story_items then
    raise exception 'A Story holds at most % items', v_settings.max_story_items using errcode = '22023';
  end if;

  -- Daily posting caps.
  if v_post.kind = 'spotlight' and (
       select count(*) from public.content_post p
       where p.author_id = p_actor_id and p.kind = 'spotlight'
         and p.published_at > now() - interval '1 day'
     ) >= v_settings.spotlight_posts_per_day then
    raise exception 'Daily Spotlight limit reached' using errcode = '54000';
  end if;
  if v_post.kind = 'story' and (
       select count(*) from public.content_post p
       where p.author_id = p_actor_id and p.kind = 'story'
         and p.published_at > now() - interval '1 day'
     ) >= v_settings.stories_per_day then
    raise exception 'Daily Story limit reached' using errcode = '54000';
  end if;

  -- Attachments: the event must be live and belong to the publisher, or be
  -- hosted at the publisher's place; the place must be the publisher's own
  -- place or the attached event's venue.
  if v_post.event_id is not null then
    select e.id, e.organizer_id, e.status, e.archived_at, e.moderation_state, e.location, e.event_category, e.place_id
      into v_event
    from public.event e where e.id = v_post.event_id;
    if not found or v_event.status <> 'published' or v_event.archived_at is not null
       or coalesce(v_event.moderation_state, 'visible') in ('hidden', 'removed') then
      raise exception 'The attached event is not available' using errcode = '22023';
    end if;
    v_event_place := v_event.place_id;
    if v_event.organizer_id <> p_actor_id
       and not (v_post.publisher_kind = 'place' and v_event_place = v_post.publisher_place_id)
       and v_post.publisher_kind <> 'abonten' then
      raise exception 'You can only attach your own events' using errcode = '42501';
    end if;
    v_location := v_event.location;
    v_source := 'event';
    v_category := v_event.event_category;
  end if;

  if v_post.place_id is not null then
    select p.id, p.owner_id, p.status, p.moderation_state, p.location, p.temporary_status
      into v_place
    from public.place p where p.id = v_post.place_id;
    if not found or v_place.status <> 'published'
       or coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed')
       or coalesce(v_place.temporary_status, '') = 'permanently_closed' then
      raise exception 'The attached place is not available' using errcode = '22023';
    end if;
    if v_place.owner_id <> p_actor_id
       and (v_event_place is null or v_event_place <> v_post.place_id)
       and v_post.publisher_kind <> 'abonten' then
      raise exception 'You can only attach your own places' using errcode = '42501';
    end if;
    if v_location is null then
      v_location := v_place.location;
      v_source := 'place';
    end if;
  elsif v_post.publisher_kind = 'place' and v_location is null then
    select p.location into v_location from public.place p where p.id = v_post.publisher_place_id;
    v_source := 'place';
  end if;

  if v_location is null and v_post.location is not null then
    v_location := v_post.location;
    v_source := coalesce(v_post.location_source, 'creator');
  end if;

  select m.id into v_first
  from public.content_media m
  where m.post_id = p_post_id and m.status <> 'deleted'
  order by m.position, m.created_at
  limit 1;

  update public.content_post
  set status          = 'published',
      published_at    = now(),
      expires_at      = case when kind = 'story'
                          then now() + make_interval(hours => v_settings.story_ttl_hours)
                          else null end,
      location        = v_location,
      location_source = case when v_location is null then null else v_source end,
      category        = coalesce(v_category, category),
      cover_media_id  = coalesce(cover_media_id, v_first),
      version         = version + 1
  where id = p_post_id;

  return p_post_id;
end;
$$;

revoke all on function public.content_post_publish(uuid, uuid) from public, anon, authenticated;
grant execute on function public.content_post_publish(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 10. Moderation and reports: extend the existing systems
-- ---------------------------------------------------------------------
alter table public.report drop constraint if exists report_target_type_check;
alter table public.report add constraint report_target_type_check check (target_type in (
  'event', 'place', 'event_review', 'place_review', 'user_review', 'user', 'organizer',
  'highlight', 'message', 'conversation', 'spotlight', 'story', 'content_comment'
));

create or replace function public.apply_moderation_action(
  p_actor_id        uuid,
  p_target_type     text,
  p_target_id       uuid,
  p_action          text,
  p_reason          text,
  p_report_id       uuid,
  p_idempotency_key text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_existing   public.moderation_action%rowtype;
  v_new_state  text;
  v_table      text;
  v_action_id  uuid;
begin
  if not exists (
    select 1 from public.admin_user au
    where au.user_id = p_actor_id and au.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_existing
  from public.moderation_action
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'applied', false, 'idempotent_replay', true,
      'moderation_action_id', v_existing.id, 'action', v_existing.action
    );
  end if;

  v_new_state := case p_action
    when 'hide'       then 'hidden'
    when 'unhide'     then 'visible'
    when 'remove'     then 'removed'
    when 'restore'    then 'visible'
    when 'restrict'   then 'restricted'
    when 'unrestrict' then 'visible'
    else null
  end;
  if v_new_state is null then
    raise exception 'Unknown moderation action: %', p_action using errcode = '22023';
  end if;

  v_table := case p_target_type
    when 'event'           then 'public.event'
    when 'place'           then 'public.place'
    when 'highlight'       then 'public.highlight'
    when 'event_review'    then 'public.event_review'
    when 'place_review'    then 'public.place_review'
    when 'user_review'     then 'public.review'
    when 'message'         then 'public.message'
    when 'conversation'    then 'public.conversation'
    when 'spotlight'       then 'public.content_post'
    when 'story'           then 'public.content_post'
    when 'content_comment' then 'public.content_comment'
    else null
  end;
  if v_table is null then
    raise exception 'target_type % is not moderatable via this RPC', p_target_type
      using errcode = '22023';
  end if;

  insert into public.moderation_action (
    actor_id, target_type, target_id, action, reason, report_id, idempotency_key
  )
  values (p_actor_id, p_target_type, p_target_id, p_action, p_reason, p_report_id, p_idempotency_key)
  returning id into v_action_id;

  execute format(
    'update %s set moderation_state = $1, moderated_at = now(), moderated_by = $2, moderation_reason = $3 where id = $4',
    v_table
  ) using v_new_state, p_actor_id, p_reason, p_target_id;

  -- A removed Spotlight/Story loses its live campaign (see part 3: the
  -- campaign tick pauses campaigns whose post is no longer visible).

  if p_report_id is not null then
    insert into public.report_event (report_id, actor_id, kind, data)
    values (
      p_report_id, p_actor_id, 'action_taken',
      jsonb_build_object('action', p_action, 'target_type', p_target_type,
                         'target_id', p_target_id, 'new_state', v_new_state)
    );
  end if;

  return jsonb_build_object(
    'applied', true, 'idempotent_replay', false,
    'moderation_action_id', v_action_id, 'new_state', v_new_state
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 11. Restricted accounts and staff-managed columns
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'follow', 'content_post', 'content_media', 'content_like', 'content_reaction',
    'content_save', 'content_share', 'content_comment', 'content_comment_like'
  ] loop
    execute format('drop trigger if exists guard_restricted_account_trg on public.%I', t);
    execute format(
      'create trigger guard_restricted_account_trg
         before insert or update on public.%I
         for each row execute function public.guard_restricted_account()', t);
  end loop;
end;
$$;

drop trigger if exists guard_staff_managed_columns_trg on public.content_post;
create trigger guard_staff_managed_columns_trg
  before insert or update on public.content_post
  for each row execute function public.guard_staff_managed_columns();
drop trigger if exists guard_staff_managed_columns_trg on public.content_comment;
create trigger guard_staff_managed_columns_trg
  before insert or update on public.content_comment
  for each row execute function public.guard_staff_managed_columns();

-- ---------------------------------------------------------------------
-- 12. Privileges and RLS
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'content_program_setting', 'follow', 'content_post', 'content_media', 'content_like',
    'content_reaction', 'content_save', 'content_share', 'content_comment',
    'content_comment_like', 'content_story_seen', 'content_mute',
    'content_not_interested', 'content_view', 'content_click',
    'content_post_daily_stat', 'content_rollup_state'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

grant usage, select on sequence public.content_share_id_seq to service_role;
grant usage, select on sequence public.content_view_id_seq to service_role;
grant usage, select on sequence public.content_click_id_seq to service_role;

-- Public read of live posts; authors read their own rows in every state.
grant select on table public.content_post to anon, authenticated;
create policy content_post_public_select on public.content_post
  for select using (
    public.content_post_is_public(status, moderation_state, kind, published_at, expires_at)
  );
create policy content_post_author_select on public.content_post
  for select to authenticated using ((select auth.uid()) = author_id);

grant select on table public.content_media to anon, authenticated;
create policy content_media_public_select on public.content_media
  for select using (
    status <> 'deleted' and exists (
      select 1 from public.content_post p
      where p.id = content_media.post_id
        and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
    )
  );
create policy content_media_owner_select on public.content_media
  for select to authenticated using ((select auth.uid()) = owner_id);

grant select on table public.content_comment to anon, authenticated;
create policy content_comment_public_select on public.content_comment
  for select using (
    status = 'visible' and moderation_state in ('visible', 'restricted') and exists (
      select 1 from public.content_post p
      where p.id = content_comment.post_id
        and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
    )
  );
create policy content_comment_author_select on public.content_comment
  for select to authenticated using ((select auth.uid()) = author_id);

grant select on table public.follow to authenticated;
create policy follow_owner_select on public.follow
  for select to authenticated using ((select auth.uid()) = follower_id);

grant select on table public.content_like to authenticated;
create policy content_like_owner_select on public.content_like
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.content_reaction to authenticated;
create policy content_reaction_owner_select on public.content_reaction
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.content_save to authenticated;
create policy content_save_owner_select on public.content_save
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.content_comment_like to authenticated;
create policy content_comment_like_owner_select on public.content_comment_like
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.content_story_seen to authenticated;
create policy content_story_seen_owner_select on public.content_story_seen
  for select to authenticated using ((select auth.uid()) = viewer_id);
grant select on table public.content_mute to authenticated;
create policy content_mute_owner_select on public.content_mute
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on table public.content_not_interested to authenticated;
create policy content_not_interested_owner_select on public.content_not_interested
  for select to authenticated using ((select auth.uid()) = user_id);

-- Public follower counts without exposing who follows whom.
create or replace function public.follow_counts(p_kind text, p_ids uuid[])
returns table (target_id uuid, follower_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.target_id, count(*)::bigint
  from public.follow f
  where f.target_kind = p_kind and f.target_id = any (p_ids)
  group by f.target_id
$$;
revoke all on function public.follow_counts(text, uuid[]) from public;
grant execute on function public.follow_counts(text, uuid[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 13. Admin permissions
-- ---------------------------------------------------------------------
insert into public.admin_permission (key, label, description) values
  ('spotlight.view',             'View Spotlight & Stories',
     'See posts, comments, campaigns, analytics and settings of the content platform.'),
  ('spotlight.campaigns.review', 'Review Spotlight campaigns',
     'Approve, reject, pause, resume and cancel promoted Spotlight campaigns. Refunds also need finance.refund. Requires step-up.'),
  ('spotlight.configure',        'Configure Spotlight & Stories',
     'Turn Spotlight and Stories on or off, choose audiences, change limits, feed mixing and retention. Requires step-up.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',        'spotlight.view'),
  ('operations',        'spotlight.campaigns.review'),
  ('operations',        'spotlight.configure'),
  ('moderator',         'spotlight.view'),
  ('finance_admin',     'spotlight.view'),
  ('finance_admin',     'spotlight.campaigns.review'),
  ('support_admin',     'spotlight.view'),
  ('analyst',           'spotlight.view')
on conflict do nothing;
