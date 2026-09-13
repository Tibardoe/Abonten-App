-- Discovery: explicit, revocable interest subscriptions and the notification
-- preference centre.
--
-- Adds:
--   * notification_preference columns for the optional categories. Transactional
--     notices (tickets, payments, refunds, cancellations, security,
--     verification, claims, support) have no column and cannot be turned off.
--     Defaults are on for push and off for email, but NOTHING optional is sent
--     without a subscription, and no subscription exists until a person accepts
--     a prompt or taps "Notify me". Existing users therefore receive nothing new.
--   * notification_subscription   one row per thing a person chose to hear about:
--                                 an organizer, a place, similar events (event
--                                 category near a point), similar places
--                                 (place category near a point)
--   * notification_prompt_state   what opt-in prompts a person has seen,
--                                 dismissed or accepted (consent history; kept)
--
-- Access: RLS on. A person can read their own subscription and prompt rows;
-- notification_preference stays service-role only, as before. Nobody but the service role
-- writes: @abonten/services validates the target, derives the topic from the
-- event/place the person was looking at, records the source and rate-limits.

alter table public.notification_preference
  add column if not exists recommendations_push   boolean not null default true,
  add column if not exists recommendations_email  boolean not null default false,
  add column if not exists organizer_alerts_push  boolean not null default true,
  add column if not exists organizer_alerts_email boolean not null default false,
  add column if not exists place_updates_push     boolean not null default true,
  add column if not exists place_updates_email    boolean not null default false,
  add column if not exists social_push            boolean not null default true,
  add column if not exists paused_until           timestamptz;

comment on column public.notification_preference.recommendations_push is
  'Push for "similar events / places" picks the person opted into. Checked when the digest is built and again when it is sent.';
comment on column public.notification_preference.social_push is
  'Push for messages, reviews, review replies and booking updates. The in-app notice is always written.';
comment on column public.notification_preference.paused_until is
  'Optional notifications are held until this time (set by the person, or automatically after several unopened digests).';

create table public.notification_subscription (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.user_info (id) on delete cascade,
  kind             text        not null
                     check (kind in ('organizer', 'place', 'similar_events', 'similar_places')),
  target_id        uuid,
  topic_category   text,
  topic_location   extensions.geography(Point, 4326),
  topic_radius_km  numeric     check (topic_radius_km is null or topic_radius_km between 1 and 200),
  topic_key        text        generated always as (
                     case
                       when target_id is not null then target_id::text
                       else lower(coalesce(topic_category, '')) || '|'
                         || coalesce(round(extensions.st_y(topic_location::extensions.geometry)::numeric, 1)::text, '') || ','
                         || coalesce(round(extensions.st_x(topic_location::extensions.geometry)::numeric, 1)::text, '')
                     end
                   ) stored,
  source           text        not null
                     check (source in ('purchase_prompt', 'rsvp_prompt', 'place_prompt', 'profile', 'search', 'settings')),
  status           text        not null default 'active'
                     check (status in ('active', 'paused', 'unsubscribed')),
  source_event_id  uuid        references public.event (id) on delete set null,
  source_place_id  uuid        references public.place (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unsubscribed_at  timestamptz,
  last_notified_at timestamptz,
  constraint notification_subscription_shape check (
    (kind in ('organizer', 'place') and target_id is not null and topic_category is null)
    or (kind in ('similar_events', 'similar_places') and target_id is null
        and topic_category is not null and topic_location is not null and topic_radius_km is not null)
  ),
  constraint notification_subscription_user_kind_topic_key unique (user_id, kind, topic_key)
);

comment on table public.notification_subscription is
  'What a person explicitly asked to hear about (organizer, place, similar events, similar places). Service-role writes only; owner can read.';

create index idx_notification_subscription_target_active
  on public.notification_subscription (kind, target_id) where status = 'active';
create index idx_notification_subscription_topic_active
  on public.notification_subscription (kind, lower(topic_category)) where status = 'active';
create index idx_notification_subscription_topic_geo
  on public.notification_subscription using gist (topic_location) where status = 'active';
create index idx_notification_subscription_user
  on public.notification_subscription (user_id, kind, status);
create index idx_notification_subscription_source_event
  on public.notification_subscription (source_event_id) where source_event_id is not null;
create index idx_notification_subscription_source_place
  on public.notification_subscription (source_place_id) where source_place_id is not null;

alter table public.notification_subscription enable row level security;
revoke all on table public.notification_subscription from anon, authenticated;
grant select on table public.notification_subscription to authenticated;
grant all on table public.notification_subscription to service_role;
create policy notification_subscription_owner_select on public.notification_subscription
  for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.notification_prompt_state (
  user_id       uuid        not null references public.user_info (id) on delete cascade,
  kind          text        not null check (kind in ('similar_events', 'organizer', 'place')),
  target_key    text        not null check (length(target_key) between 1 and 200),
  shown_count   smallint    not null default 0,
  last_shown_at timestamptz,
  dismissed_at  timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, kind, target_key)
);

comment on table public.notification_prompt_state is
  'Opt-in prompt history per person: shown, dismissed ("Not now"), accepted. Consent record; not purged.';

create index idx_notification_prompt_state_user_shown
  on public.notification_prompt_state (user_id, last_shown_at desc);

alter table public.notification_prompt_state enable row level security;
revoke all on table public.notification_prompt_state from anon, authenticated;
grant select on table public.notification_prompt_state to authenticated;
grant all on table public.notification_prompt_state to service_role;
create policy notification_prompt_state_owner_select on public.notification_prompt_state
  for select to authenticated
  using ((select auth.uid()) = user_id);
