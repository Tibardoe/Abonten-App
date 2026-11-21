---
title: Social distribution — posting listings, tagged links and the weekly views note
purpose: How Abonten posts new events and places on its own social channels, how the links it posts are tagged so a listing's views record which channel brought them, and how listers are told every Monday what their listings drew.
audience: Engineering, operations and support
scope: "@abonten/core/social/linkSources; the source column on event_analytics_event and place_analytics_event, listing_views_weekly_run, listing_views_weekly_notices() and the listing-views-weekly job (migration 20261121230000); the website's EventViewLogger / PlaceViewLogger and logEventView / logPlaceEngagement; the app's useLogEventView / useLogPlaceView and +native-intent.ts; the listing_views_weekly notice; @abonten/core/social/appLinks, qrLinkTarget's open/src referrer, GetTheAppLink, the Smart App Banner on event and place pages, apps/mobile/src/lib/installReferrer.ts and useInstallListingOpen; social_queue_setting, social_post, social_queue_listings(), social_queue_roundup(), the social-queue-listings and social-queue-roundups jobs, @abonten/services/admin/social and Admin › Social."
status: Review required
version: 1.0
lastReviewed: 2026-11-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Social distribution

**State (2026-11-21): built, not yet live.** Three parts, built together:

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

Admin › Social is the daily list of what to post on Abonten's own channels (migration `20261121220000_social_queue`; handbook [admin/social.md](../admin/social.md)). Nothing is posted automatically: staff post and then mark each item.

- **Tables** (service role only):
  - `social_queue_setting` is one row: `enabled` (on), `daily_cap` (12 new listings a day, on Accra's calendar), `excluded_account_ids` (seeded with the App Review sample organizer) and the job's `queue_watermark`.
  - `social_post` is one row per subject per channel. A subject is an event, a place, or a roundup (`week:<Monday>` / `weekend:<Friday>` with its `event_ids` in order). Channels are `ig_story`, `ig_feed`, `x`, `wa_channel`; status `pending`, `posted` or `skipped`, with who and when. The same subject is never queued twice on a channel.
- **New listings.** The `social-queue-listings` job (every 15 minutes, `social_queue_listings()`) takes listings published at least 5 minutes earlier, past the watermark. An event qualifies when the Explore rule (`_explore_event_candidates`, run once per batch) lists it, its next date has not started, it is visible and its organizer is active and not excluded; a run of shows is queued once. A place qualifies when it is published, visible, not closed, in an open market and its owner is active and not excluded. Each goes to `ig_story`, `x` and `wa_channel`. Past the day's cap the rest wait for the next day.
- **Roundups.** The `social-queue-roundups` job (07:00 UTC on Mondays and Fridays, `social_queue_roundup()`) queues "What's on in Accra this week" or "This weekend in Accra": up to 10 events on in the window within the Accra city radius (`market_region` `accra`, the city named by `ROUNDUP_CITY` in `@abonten/core/social/roundups`), featured or promoted first, for `ig_feed`, `x` and `wa_channel`. The cover picture is `/api/share/roundups/<kind>-<date>/cover`.
- **Computed when the page is read, never stored**, in `@abonten/services/admin/social`: the English captions (X kept within 280 the way X counts, a link as 23), the links tagged with the channel through `withLinkSource` (`?src=ig`, `x`, `wa`), and the share-kit pictures. Never hand out a link without its tag: it is how listers see what the posts brought (section 3).
- **Who posts what.** The founder posts Instagram (Story with a link sticker, feed with "link in bio") by hand from the phone; Instagram is never driven by a program. An operator posts X and the WhatsApp Channel. Each post is then marked posted or skipped (audited `social.post.posted`, `.skipped`, `.reopened`; settings `social.settings.update`).
- **Permissions**: `social.view` and `social.manage` (operations and moderator; super_admin in code; no step-up). The admin console serves the pictures from its own address (`/social/image`, which accepts only a share-kit kind, key and format).
- **Switching it off**: the settings card on the page (`enabled`). There is no environment kill switch.

## 5. Install then open the listing

A posted link is the listing's own address (`abontenhub.com/events/<code>`, `/places/<slug>`, with `?src=`). On a phone with the app it opens the app on the listing (Universal Links / App Links, unchanged: the AASA file, the Android intent filters and `apps/mobile/app/+native-intent.ts`). Without the app it opens the web page, which offers the app:

- **Android.** The event and place pages show "Get the Abonten app" (`common.getTheAbontenApp`) on Android phones only (`apps/web/src/components/atoms/GetTheAppLink.tsx`, rendered in the browser only, so the server page never waits for it). It links to `/go/app?open=<listing path>&src=<the page's known src>`. `qrLinkTarget` (`@abonten/core/brand/qrLinks`) puts that pair on the Google Play link as its `referrer`. On the first start after the install the app opens that listing once, with `src` as the screen's parameter, so the view counts for the channel (`apps/mobile/src/features/appLinks/useInstallListingOpen.ts`). Conditions: within 48 hours of the install, not when the app was opened from a link, and only if the lookup answers within 15 seconds (never pull someone away from what they started).
- **iPhone.** The App Store passes nothing to the app. The pages carry Apple's Smart App Banner (`itunes` metadata, `smartAppBanner()` in `@abonten/core/social/appLinks`: the app id from `APP_STORE_LISTINGS.ios`, the page's address as the argument). After Get, the person comes back to Safari and taps Open in the banner, which opens the listing. Opening the app from the App Store or the home screen starts on Home. Only Safari shows the banner (not Chrome on iPhone, not the Instagram or TikTok browsers). The banner's address carries no `src`, so a view in the app opened this way has no channel (the web view before it has one).
- **Rules.** Only `/events/<code>` and `/places/<slug>` are ever accepted, exactly (`appOpenTarget`): no query, fragment, other segment or encoded character, so `open` can never send anyone to another page or site. `/go/app` without `open` behaves as before (the phone's store, or the homepage). The Play referrer is read only through `apps/mobile/src/lib/installReferrer.ts` (once per run); friend invites (`inviteCapture.ts`) and the listing hand-off each keep their own once-per-install flag, so neither uses up the other's referrer.
- **Limits.** On the 1.0.0 store binary a new install's first start runs the code built into the binary, which reads the referrer for invites only; the update with the listing hand-off runs from the second start (Google Play keeps the referrer for 90 days), so on 1.0.0 the listing opens on the second start, still within the 48 hours. From the next store build it opens on the first start. On Android, if the app is installed but the page is open in an in-app browser, the button's Play page offers Open, which starts on Home. No native build and nothing to set up.
- **Test.** `apps/web/e2e/app-links.spec.ts` (the button, the redirect with its referrer, the banner tag), `packages/core/src/social/appLinks.test.ts`, `packages/core/src/brand/qrLinks.test.ts`.

## 6. Checks

- `packages/core/src/social/linkSources.test.ts` — the codes and both helpers.
- `packages/services/src/__integration__/listing-views-weekly.integration.test.ts` — the note's numbers, most viewed listing, push, a team Owner's pushed copy, nothing for an account with no views, once a week, and an unknown tag refused by the database.
- `packages/core/src/notifications/categories.test.ts` — the type is optional (`social`).
