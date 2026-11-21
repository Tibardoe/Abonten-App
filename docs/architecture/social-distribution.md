---
title: Social distribution — posting listings, tagged links and the weekly views note
purpose: How Abonten posts new events and places on its own social channels, how the links it posts are tagged so a listing's views record which channel brought them, and how listers are told every Monday what their listings drew.
audience: Engineering, operations and support
scope: "@abonten/core/social/linkSources; the source column on event_analytics_event and place_analytics_event, listing_views_weekly_run, listing_views_weekly_notices() and the listing-views-weekly job (migration 20261121230000); the website's EventViewLogger / PlaceViewLogger and logEventView / logPlaceEngagement; the app's useLogEventView / useLogPlaceView and +native-intent.ts; the listing_views_weekly notice."
status: Review required
version: 1.0
lastReviewed: 2026-11-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Social distribution

**State (2026-11-21): built.** Three parts, built together:

1. **Admin › Social posting queue** — a daily list of new events and places to post, with the picture, the caption and a tagged link for each channel (section 4).
2. **Tagged links and the weekly views note** — the links Abonten posts carry `?src=<channel>`; a listing's page view records the channel, and every Monday each lister is told how many views their listings had and how many came from Abonten's own posts (sections 1–3).
3. **Install then open the listing** — a person without the app who taps a listing link lands on that listing after installing (section 5).

Why: a lister keeps listing when listing brings people. Posting every new listing on Abonten's own channels gives them reach; the tagged link and the Monday note let them see it.

## 1. The source codes

`@abonten/core/social/linkSources` is the only list: `ig` (Instagram), `x` (X), `wa` (WhatsApp, the Channel and shared messages), `tt` (TikTok), `fb` (Facebook). The query parameter is `src` (`LINK_SOURCE_PARAM`).

- `withLinkSource(url, code)` sets the tag on an address and keeps any other query.
- `normalizeLinkSource(value)` turns whatever arrived into a known code or `null`. Nothing else is ever stored: an unknown or misspelt tag is recorded as no tag.
- The codes never change meaning, are never translated and are never reused. A new channel is a new code added in `linkSources.ts` **and** in the two `*_source_check` constraints (a migration), together.

## 2. Recording where a view came from

`event_analytics_event.source` and `place_analytics_event.source` (text, null or one of the codes, enforced by `event_analytics_event_source_check` / `place_analytics_event_source_check`).

- **Website.** `EventViewLogger` / `PlaceViewLogger` read `src` from the page address once, normalise it and pass it to `logEventView(eventId, source)` / `logPlaceEngagement(placeId, "view", source)`. The place action keeps the source for page views only, never for clicks.
- **App.** The event and place screens read the `src` route parameter and pass it to `useLogEventView(eventId, source)` / `useLogPlaceView(placeId, source)`. A universal / app link `https://abontenhub.com/events/<code>?src=ig` reaches the screen with its tag because `app/+native-intent.ts` carries a known `src` onto the native route (and drops anything else).
- Older app builds keep writing views without the column; that is a view with no tag.
- The rest is unchanged: no account, device or address is stored with a view, and the lister's own views are still dropped by the existing triggers.

## 3. The Monday note (`listing_views_weekly_notices`)

The `listing-views-weekly` pg_cron job runs `public.listing_views_weekly_notices()` every Monday at 09:00 UTC (09:00 in Accra).

- It counts the past seven days' page views of each account's events (`event.organizer_id`) and places (`place.owner_id`). An account with no views, or whose `user_info.status_id` is not active, gets nothing.
- One notice per account, type `listing_views_weekly`: "Your listings had N views this week. Most viewed: <title>. M came from Abonten's own posts." (the second sentence only when M > 0). The words come from `core:notices.listing_views_weekly` in the reader's language; the row's English `title` / `body` are the fallback. `data.notice.params` = `{ views, social, top }`, `data.kind` = `listing_views`.
- Tapping it opens the most viewed listing's manage page (`link` `/manage/events/<id>` or `/manage/places/<id>`; the app maps it to Organizer › the event / place).
- A person's notice is queued as a push (`notification_delivery`, source `app`, not urgent). A team's notice is copied to its Owners by `trg_notification_fan_out_to_team` and each copy is pushed there; the team itself has no phone. Never an email.
- The push is optional: the type is in the `social` category (`SOCIAL_TYPES` in `@abonten/core/notifications/categories` and `public._notification_optional_category`, kept identical), so a person who turned off social pushes still finds it in the inbox only.
- Once a week: the function first inserts the week's Monday into `listing_views_weekly_run`; a second run in the same week (a retry, a manual run) sends nothing and returns 0. The row records how many notices went out.
- Service role only: the function and the run table are closed to `anon` and `authenticated`.

To send it by hand (for example after the job failed): `select public.listing_views_weekly_notices();` as the service role. It refuses to send twice in one week; to resend a week on purpose, delete that week's `listing_views_weekly_run` row first, knowing every lister is told again.

## 4. Admin › Social posting queue

Built in a separate change; this section is completed when that change lands.

## 5. Install then open the listing

Built in a separate change; this section is completed when that change lands.

## 6. Checks

- `packages/core/src/social/linkSources.test.ts` — the codes and both helpers.
- `packages/services/src/__integration__/listing-views-weekly.integration.test.ts` — the note's numbers, most viewed listing, push, a team Owner's pushed copy, nothing for an account with no views, once a week, and an unknown tag refused by the database.
- `packages/core/src/notifications/categories.test.ts` — the type is optional (`social`).
