---
title: Social distribution — posting listings, tagged links and the weekly views note
purpose: How Abonten posts new events and places on its own social channels, how the links it posts are tagged so a listing's views record which channel brought them, and how listers are told every Monday what their listings drew.
audience: Engineering, operations and support
scope: "@abonten/core/social/linkSources; the source column on event_analytics_event and place_analytics_event, listing_views_weekly_run, listing_views_weekly_notices() and the listing-views-weekly job (migration 20261121230000); the website's EventViewLogger / PlaceViewLogger and logEventView / logPlaceEngagement; the app's useLogEventView / useLogPlaceView and +native-intent.ts; the listing_views_weekly notice; @abonten/core/social/appLinks, qrLinkTarget's open/src referrer, GetTheAppLink, the Smart App Banner on event and place pages, apps/mobile/src/lib/installReferrer.ts and useInstallListingOpen; social_queue_setting, social_post, social_queue_listings(), social_queue_roundup(), the social-queue-listings and social-queue-roundups jobs, @abonten/services/admin/social and Admin › Social; user_info.social_links, social_links_valid() and the user_info_forget_social_links trigger (migration 20261122100000), @abonten/core/social/listerSocialLinks, @abonten/services/profile/updateProfileCore, PATCH /api/mobile/profile; @abonten/core/social/roundupReel and the console's roundup video; SOCIAL_LINKS and the Follow Abonten blocks (web FollowAbonten, app FollowAbonten, EmailFollowAbonten)."
status: Review required
version: 1.2
lastReviewed: 2026-11-22
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
- **Computed when the page is read, never stored**, in `@abonten/services/admin/social`: the English captions (X kept within 280 the way X counts, a link as 23), the links tagged with the channel through `withLinkSource` (`?src=ig`, `x`, `wa`), and the share-kit pictures. Never hand out a link without its tag: it is how listers see what the posts brought (section 3). A listing's WhatsApp caption also carries "Get the app" naming the listing (`/go/app?open=/events/<code>&src=wa`), so an Android install lands on it (section 5); a roundup's carries the plain `/go/app?src=wa`.
- **Who posts what.** The founder posts Instagram (Story with a link sticker, feed with "link in bio") by hand from the phone; Instagram is never driven by a program. An operator posts X and the WhatsApp Channel. Each post is then marked posted or skipped (audited `social.post.posted`, `.skipped`, `.reopened`; settings `social.settings.update`).
- **Permissions**: `social.view` and `social.manage` (operations and moderator; super_admin in code; no step-up). The admin console serves the pictures from its own address (`/social/image`, which accepts only a share-kit kind, key and format).
- **Switching it off**: the settings card on the page (`enabled`). There is no environment kill switch.
- **Crediting the lister** (2026-11-22, founder's decision: Abonten's own accounts are small, so a post borrows the lister's audience). Each event and place card shows the lister's own social accounts with a Copy button each: for a place, `place.social_links`; for an event, its organizer's `user_info.social_links`, or the event's place's links when the organizer has none (shown as "Venue"). A team's links stay empty until team profile editing exists, so a team's events fall back to the venue. On X the caption gains a `via @handle` line before the link when the lister has an X account; `fitForX` keeps it and drops hashtags first, then title words. The Instagram story (and feed) items carry the tip "Mention @handle in the Story (or send a Collab invite on a feed post), then ask them to reshare." when the lister has an Instagram account. WhatsApp captions are unchanged, roundups credit nobody, and the links keep their `withLinkSource` tag. Computed on read like the rest, never stored.
- **Where the handles come from.** `@abonten/core/social/listerSocialLinks` is the one rule. Organizers (and anyone) add Instagram, X, TikTok and Facebook in Edit profile on the website (`updateUserDetails`) and in the app (`PATCH /api/mobile/profile`, `api.profile.update`), both through `@abonten/services/profile/updateProfileCore`, which writes with the person's own session (the `user_info_update` policy: owner only). Accepted: an https address on the network's own domains (scheme-less and http:// are read as https://), or a bare @handle (the @ may be left out); refused: any other scheme or host, a sign-in or port in the address, a post, reel or share link. What is stored is the canonical profile address built from the handle (`https://www.instagram.com/<h>`, `https://x.com/<h>`, `https://www.tiktok.com/@<h>`, `https://www.facebook.com/<name>` or `…/profile.php?id=<n>`). The database's `user_info_social_links_valid` check (`social_links_valid()`) refuses any other shape, so a write past the service (older app builds write the profile straight to `user_info`) cannot store `javascript:` or another host; `user_info_social_links_object` keeps it an object. A handle is only ever read from an entry that parses (place links were never checked when written, so they go through the same parser and an older `twitter` key counts as X); the console links to the canonical address, never the stored text. A deleted account (status 4) loses its links (trigger `user_info_forget_social_links`). Not yet: the links are not shown on the public profile (it does not show the website either), Owners cannot edit a team's links, and `team_convert_account()` does not copy them to the new team.

### 4.1 Roundup video (Reel / TikTok)

Reels and TikTok reach people who do not follow Abonten, so each roundup card has **Make video (Reel / TikTok)** (`apps/admin/src/app/(console)/social/RoundupReelMaker.tsx`).

- The service hands out the frames (`SocialQueueSubject.reel`): the roundup's cover, then each listed event's Story picture (`/social/image?kind=events&key=<code>&format=story`), in the roundup's order, and the file name `abonten-<week|weekend>-<date>-reel`.
- The browser draws them on a 1080×1920 canvas and records it with `MediaRecorder` in real time: the 4:5 cover centred over a blurred, darkened copy of itself for 3 s, then each event's picture for 2.5 s, with a 0.4 s crossfade, never more than 30 s (`@abonten/core/social/roundupReel`: a full roundup of 10 events is 28 s). No sound: the founder adds a trending sound in Instagram or TikTok. Pictures come from the console's own origin, so the canvas is never tainted; nothing is uploaded anywhere.
- Format: the first type `MediaRecorder.isTypeSupported` accepts, MP4 (H.264) first, then WebM. The card says which came out; Instagram needs MP4, which recent Chrome and Safari make. TikTok (@abontenhub) takes the same video with the Instagram feed caption ("link in bio").
- Progress (loading the pictures, then recording) and Cancel; a picture that does not load is left out and said so; the cover failing stops it. The tab must stay in front while it records (a hidden tab stops animation frames). The last picture is held 0.6 s past the timeline: recording starts a moment after the first frame, and without it the last picture came out about half a second short.
- Checked (2026-11-22) by bundling the component alone and recording it in Chrome 157 with stand-in pictures: MP4 (`ftyp isom`, H.264), 1080×1920, the expected length, the cover centred over its blurred copy, the last picture to the end, a missing picture left out and Cancel leaving nothing. Not yet checked in Safari, on a phone, or inside the running console; the timing is unit-tested.

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
- `packages/core/src/social/listerSocialLinks.test.ts` — what a social account entry may be, its canonical form, refused schemes and hosts, reading a place's older keys.
- `packages/core/src/social/roundupReel.test.ts` — the video's timing (3 s cover, 2.5 s per event, crossfade, 30 s at most) and file type.
- `packages/services/src/admin/social/socialCaptions.test.ts` — `via @handle` on X (kept, hashtags dropped first), the Instagram tip.
- `packages/services/src/__integration__/organizer-social-links.integration.test.ts` — saving through the profile service (canonical, bad entries refused, other fields leave them alone), the database's check against writes past the service, nobody else's write, public read, cleared on account deletion; the queue credits the organizer, falls back to the venue, credits nobody for links that do not parse, and gives a roundup its video frames.

## 7. Follow links: Abonten's own channels

Decided by the founder on 2026-11-22: Abonten's own accounts had few followers, so everyone who buys a ticket, registers or reads Abonten Weekly is invited to follow them, in places Abonten already owns.

- **The list.** `SOCIAL_LINKS` in `@abonten/core/brand/socialLinks` is the only list of official channels: X, Instagram, TikTok and the WhatsApp Channel (key `whatsapp`, `https://whatsapp.com/channel/0029Vb9N5fXCRs1lYPBl7Q00`, added 2026-11-22). The footers, the app's drawer and every Follow block read it; `scripts/check-docs.mjs` asserts the four addresses and refuses any other `whatsapp.com/channel/` address. A link's accessible name is `common:abontenOnNetwork.<key>`; the network's own name (`label`, never translated) is shown beside its icon.
- **Not in `sameAs`.** The homepage's `Organization` lists only links marked `profile` (X, Instagram, TikTok). The channel's address is an opaque invite code with no handle, and its web page only offers to open WhatsApp, so it identifies nothing to a search engine (and it would change if the channel were ever made again).
- **Where the block appears**, always after the screen's main content, never above a ticket:
  - **Website** (`apps/web/src/components/molecules/FollowAbonten.tsx`; icons `SocialNetworkIcon`, the footer's SVG set, with `public/assets/images/whatsapp.svg` added): the checkout page once a ticket payment succeeded and nothing else is left to pay (`TicketPurchaseSuccessPanel` in `PendingCheckoutsBasket.tsx`; above checkouts still to pay it would push them down, so it is left out there); the event page right after a free registration (`AttendingButton.tsx`); a completed Pay small small plan (`TicketPlanView.tsx`); every Abonten Weekly page (`WeeklyPage.tsx`, after the edition, the fallback or the staff loader). On Weekly it is a server component with nothing personal in it, so the pages stay cached (`revalidate = 60`).
  - **App** (`apps/mobile/src/components/app/FollowAbonten.tsx`; Ionicons from `socialIcons.ts`, shared with the drawer): the payment screen once a ticket payment succeeded (`app/(app)/payment/[attemptId].tsx`, kind `ticket`, not a plan's part); the free registration card right after registering (`FreeRsvpCard.tsx`); a completed plan (`app/(app)/ticket-plans/[id].tsx`). Links open with `Linking.openURL`, so the network's own app takes them when installed.
  - **Ticket email** (one template for purchases and free registrations): the channels as plain text links after the button (`EmailFollowAbonten` in `EmailParts.tsx`), in the recipient's language (`emails:common.followAbonten`); no image is fetched from the networks.
- **Not shown**: a free checkout from the basket goes straight to My tickets (no success screen); the staff preview of an edition.
- **Words**: `common:followAbonten.title` ("Follow Abonten for what's on in {city}"; the city is `ROUNDUP_CITY` from `@abonten/core/social/roundups`, the one the channels' roundups cover) and `common:followAbonten.body`, in en, fr, es, de, pt (Akan in English).
- **No `?src=` tag**: these links lead to Abonten's own profiles, not to a listing.
- **Release**: the website and the email with a deploy; the app part with an app update (JavaScript only, no native build).
- **Checks**: `packages/core/src/brand/socialLinks.test.ts`, `packages/core/src/seo/jsonLd.test.ts` (`sameAs` without the channel), `apps/web/e2e/seo.spec.ts` (the footer link, the block on `/weekly`, `sameAs`).
