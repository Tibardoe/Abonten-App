---
title: Spotlight and Stories — short video, temporary Stories, follows and promoted content
purpose: How Spotlight posts, 24-hour Stories, the follow graph, engagement, telemetry, ranking, moderation and paid Spotlight promotions are modelled, secured, operated and rolled out on web, mobile and the admin console.
audience: Engineering, operations, finance, security reviewers
scope: The content_* and follow tables and functions (migrations 20260916120000..20260917120000), @abonten/services content and admin/content modules, /spotlight, /stories and /manage/spotlight on web, /api/mobile/content/**, the mobile Spotlight, Story and creator screens, the Stories row in Messages, Admin › Spotlight & Stories, the seven content cron jobs, and the spotlight-promotion payment path. Not covered - hashtag pages, audio libraries, duets, live streaming and creator payouts, which are not built.
status: Approved
version: 1.3
lastReviewed: 2026-09-17
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Spotlight and Stories

**State (2026-09-16): built, merged to the feature branch, migrations applied to production, switched off for everyone.** `content_program_setting` has `spotlight_enabled = false`, `stories_enabled = false`, `spotlight_promotions_enabled = false`, both audiences `staff`. No entry point is visible on web or mobile while it is off, and the admin module works normally. Rollout is decision **S1** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md). Legal items **F5** and **G4** in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) must be decided before the audience is Everyone.

The pre-implementation audit that led to these decisions is [audit/spotlight-stories-pre-implementation-report.md](../audit/spotlight-stories-pre-implementation-report.md).

## 1. What it is

- **Spotlight**: a persistent feed of short vertical videos and photos posted by organizers, place owners and Abonten staff. Tabs: For you, Following, Nearby, Happening soon, Trending. A post can link an event or a place; its call to action follows the live state of that listing ("View event", "Sold out", "Event cancelled", "Event has ended", "Event unavailable", "Place unavailable"). Stories use the same button.
- **Stories**: temporary posts (default 24 hours) from the same publishers, shown as a row at the top of Messages, unseen first. A Story holds up to `max_story_items` photos or videos.
- **Follow**: a public, one-directional follow of an organizer or a place. It fills the Following tab and the Stories row. It is separate from the private "Notify me" bell (`notification_subscription`), which is consent to alerts.
- **Promoted Spotlights**: a publisher pays a budget to have a live Spotlight shown to more people, marked "Sponsored". The server prices the budget into sponsored impressions and shows an **estimated** reach range; spend is recognised only for impressions actually delivered. Every promotion is reviewed before it runs.

Ordinary users cannot post. Publishing needs a published live event, a published place, verification as an organizer, or an active admin account (`content_publisher_eligible`).

## 2. Data model

One post table for both kinds, so moderation, reports, engagement and telemetry are written once.

| Table | Holds | Client access |
|---|---|---|
| `content_program_setting` | One row: switches, audiences, limits, ranking weights, sponsored caps, retention | none |
| `follow` | `(follower_id, target_kind organizer\|place, target_id)` | select own rows |
| `content_post` | `kind spotlight\|story`, `publisher_kind organizer\|place\|abonten`, caption, hashtags, status `draft\|published\|archived\|deleted`, `moderation_state`, `expires_at`, event / place links, location, counters, `trending_score`, `search_tsv` | select live posts (RLS via `content_post_is_public`) and own posts |
| `content_media` | Cloudinary asset per item: type, public id, version, size, duration, URLs, `status`, `playback_status`, trim | select media of visible posts, own media |
| `content_like`, `content_reaction`, `content_save`, `content_share`, `content_not_interested`, `content_story_seen`, `content_mute` | Engagement, one row per person per post (reaction: one emoji, replaced) | select own rows |
| `content_comment`, `content_comment_like` | One-level threads, soft delete, moderation state | select visible comments |
| `content_view`, `content_click` | Raw telemetry with `valid` and `invalid_reason` | none |
| `content_post_daily_stat`, `content_rollup_state` | Hourly rollups for insights and admin | none |
| `content_promotion_pricing`, `content_audience_snapshot` | One row each: pricing and estimate assumptions (versioned, admin-editable); measured Spotlight audience (nightly) | none |
| `content_campaign`, `content_campaign_checkout`, `content_campaign_ledger`, `content_campaign_event`, `content_campaign_conversion` | Campaigns with their price snapshot and delivery counters, checkout, append-only money ledger, state history, attributed purchases | none |

No client role can insert, update or delete any of these tables. Every write goes through `@abonten/services` with the service role after the service has resolved identity and the programme. `content_campaign_ledger` refuses updates and deletes by trigger.

Existing tables reused: `report` (targets `spotlight`, `story`, `content_comment`), `moderation_action` and `apply_moderation_action`, `conversation_block` (a block anywhere hides content both ways), `notification` and the delivery queue, `payment_attempt` (fifth target `content_campaign_checkout_id`), `transaction` (`reason = 'Promotion_Purchase'`), `admin_audit_log`, `incident`, `rate_limit_bucket`.

The older empty `story` and `story_default` tables from the original schema are untouched and unused.

## 3. Publishing

1. The client asks for a Cloudinary signature (`kind: "content"`, folder `content_media/<environment>/<user id>`, where the environment is `production`, `preview` or `development` from `VERCEL_ENV`), uploads directly, then calls **register media**. `registerContentMediaCore` refuses anything outside the caller's folder, re-reads the asset from the Cloudinary Admin API and checks type, format, size and length there (the client's claims are ignored). The length comes from the Admin API with `media_metadata`; a video whose length cannot be read, or with no picture, is refused. A refused upload is destroyed on Cloudinary at once. A signature for `content` is issued only to people who can post. Trims are applied as a delivery transformation. Long or large videos get an asynchronous optimised rendition (`playback_status = pending`); the original always plays meanwhile.
2. **Create post** attaches the caller's ready media in order and either keeps a draft or calls `content_post_publish`. `clientRequestId` makes a retried create return the same post.
3. `content_post_publish(post, actor)` is the only way to publish. It re-checks author, eligibility, the posting switches, the rights acknowledgement, media count and state, daily caps (`spotlight_posts_per_day`, `stories_per_day`), and the linked event or place (live, owned by the publisher or held at the publisher's place). It sets `published_at`, and for Stories `expires_at = now() + story_ttl_hours`.

Deleting a post is a soft delete; a running promotion on it is cancelled, and an unpaid promotion order for it is cancelled unless a payment is in flight. Registered-but-unused uploads are destroyed after `orphan_media_hours`, media of deleted posts and ended Stories after their retention, through `draft_asset_cleanup_queue`; uploads that never became a `content_media` row are found by a daily sweep of this environment's `content_media/<environment>/` folder on Cloudinary (see §11). The Cloudinary account is shared by production, previews and local development, each with its own database; the environment folder keeps one environment's sweep away from another's uploads.

## 4. Reading

- **Visibility** is one SQL predicate, `content_post_is_public(status, moderation_state, kind, published_at, expires_at)`: published, `visible` or `restricted`, and not expired for Stories. Documents are built by `content_post_documents(viewer, ids)`, which also drops posts by suspended authors and posts either side has blocked. The author always sees their own post.
- **Feed** `content_feed(viewer, surface, lat, lng, radius, as_of, cursor_score, cursor_id, limit)` ranks in SQL from settings: recency, engagement, following, proximity, event urgency, a penalty for posts already viewed, and removes not-interested posts and muted publishers. Cursors are keyset `(as_of, score, id)`, so a page never repeats or skips when new posts arrive.
- **Sponsored slots** are merged in TypeScript (`mergeSponsored`, `@abonten/core/content/feedMerge`): at most `sponsored_max_share_bps` of a page, never closer than `sponsored_min_gap` posts, capped per viewer per day (`sponsored_daily_cap_per_viewer`), never a post already on the page, and never repeated within one paging session (the cursor carries the posts already shown as sponsored). Candidates come from `content_sponsored_candidates`, which applies the delivery switch, the impression goal, pacing, location targeting, publisher eligibility (active author, published and visible place), blocks and not-interested, and never returns the viewer's own promotion; the campaign furthest behind its plan goes first. A failure there drops the sponsored slots, never the page. The slot carries `sponsored.campaignId` and both clients always show the "Sponsored" label. For you and Trending send a rough position (about 1 km) only when location is already allowed — no prompt, not stored — so a promotion aimed at an area can reach people there.
- **Story tray** `content_story_tray(viewer)`: own Stories first, then followed publishers with unseen Stories, then seen; muted publishers are flagged. **Story sequence** returns a publisher's live Stories oldest first. An ended Story link answers 410 with the publisher so the page can offer their profile or place.
- **Search** `search_spotlight(query, viewer, limit)` over captions and hashtags.

## 5. Engagement and notifications

Likes, saves, reactions, not-interested and follows send the desired end state, so double taps and retries are idempotent. Counters are maintained by triggers (a hard delete of an already soft-deleted comment does not double-decrement). **Story replies and reactions are private messages**, not comments (migration `20260917120000`, `send_story_reply`, run on the caller's session after `sendStoryReplyCore` checks the programme: replies need `stories_comments_enabled` and the Story's `allow_comments`, reactions need `stories_reactions_enabled`). A place Story reply goes into the viewer's place conversation (`open_conversation`); an organizer Story reply into one `direct` conversation per pair (member and organizer), found under an advisory lock. The function re-checks a live Story, not your own, not an Abonten Story and no block either way, sends through `send_message`, then stamps `message.system_data.story_reply` (post id, kind, author, publisher kind, thumbnail snapshot, expiry) and sets the conversation preview. A reaction is also stored as the Story reaction so insights count it. Clients show the Story preview above the bubble only until it expires. Spotlight comments are rate-limited (`comments_per_hour`) and can be turned off per post or per product. Follows are rate-limited (`follows_per_hour`).

Notices use the existing notification pipeline: likes, reactions and follows aggregate into one row per post ("X and 3 others liked your Spotlight") within a window; comments and replies notify individually; moderation outcomes and every promotion state change notify the author. Notification `data.kind` is `spotlight`, `story`, `follow` or `content_campaign`; mobile routes them in `notificationLink.ts`.

## 6. Telemetry and insights

Clients batch events (`impression`, `view_start`, `meaningful_view`, `completion`, `replay`) and send a random per-install viewer key. The server hashes it (HMAC, `deriveSigningKey("content-viewer")`) before storage and rate-limits per key. `content_view_ingest` validates each event: unknown ids are skipped; unavailable posts, own views, implausible watch time, duplicates within the hour, too-short meaningful views and replays without a view are stored as invalid. Only valid events move counters. Viewing a Story as a signed-in person records `content_story_seen`.

`content-stats-rollup` folds valid events into `content_post_daily_stat` hourly; `content_post_insights` serves creators; `content_admin_overview` serves the admin overview. Clicks on the call to action, profile, event or place are recorded the same way. `content-attribute-conversions` credits a ticket purchase to a promoted post when the buyer tapped it within 7 days.

## 7. Moderation and safety

- Reports use the shared report flow with targets `spotlight`, `story` and `content_comment`.
- Staff act from Reports or Admin › Spotlight & Stories with `apply_moderation_action` (hide, remove, restrict, restore). The author gets a notice. A hidden or removed post leaves every feed and link immediately; an active promotion on it is paused by the next `content-campaign-tick`.
- Restricted accounts cannot post, comment, react or promote (`accountIsRestricted` and `guard_restricted_account`). Staff-managed columns are protected by `guard_staff_managed_columns`.
- Blocks from messaging hide content in both directions.
- Downloads are off by default, need the author's permission and the programme switch, and are signed Cloudinary attachment URLs.

## 8. Promoted Spotlights (money path)

**The product is extra distribution, not days and not guaranteed views.** An advertiser chooses a goal, who should see the Spotlight (everyone, or people within 5/10/25/50 km of its event or place), a budget and the longest it may run. The server prices it and shows an estimated reach range. Nothing is promised: every screen says "estimated", and the notes say reach depends on the audience, its activity and other promotions.

### 8.1 Pricing and the estimate

`content_promotion_pricing` (one row, `version` bumped on every change, edited in Admin › Spotlight & Stories › Settings with step-up, a reason and an audit entry) holds the budget range and step, suggested budgets, run-length options, the **cost per 1,000 sponsored impressions** (`cpm_minor`) and the estimate assumptions. `content_audience_snapshot` holds the measured audience: average daily distinct viewing devices over 14 days and distinct devices over 28 days on For you / Nearby / Trending (`content-audience-refresh`, nightly; counts only).

`estimatePromotionReach` (`@abonten/core/content/promotionEstimate`, pure and unit-tested; the server is the only caller that decides anything):

1. **Impression goal** = floor(budget × 1000 ÷ `cpm_minor`) — what the budget buys and where delivery stops.
2. **Audience** = the measured figures, or the admin planning floors (`audience_floor_daily_viewers`, `audience_floor_reach`) while measured data is thinner; × the share assumed within the chosen radius for a location target (`location_audience_share_by_radius`, one figure per selectable radius: 5, 10, 25 and 50 km; a radius without its own figure uses the next wider one). `basis` records `observed`, `assumed` (floor used) or `no_data`.
3. **Deliverable impressions** = daily audience × run days × `sponsored_daily_cap_per_viewer` × `daily_fill_bps`.
4. **Reach** = expected impressions ÷ `avg_frequency`, capped at `max_reach_share_bps` of the audience, shown as ± `estimate_spread_bps` and rounded.
5. The server **refuses to sell** when there is no data, or when the forecast delivers less than `min_deliverable_bps` of the goal ("the audience is too small for this budget right now").

Seeded defaults: GH₵ 20–5,000 in GH₵ 5 steps; suggested GH₵ 20 / 50 / 100; runs of 3, 7 or 14 days; GH₵ 11 per 1,000 impressions; 1.5 impressions per person; ±20 %; no planning floor; 30 % daily fill; 60 % max reach share; audience within 5 / 10 / 25 / 50 km of 10 / 18 / 30 / 45 %; refuse under 50 % deliverable; pacing ×2. With a planning floor of 5,000 daily / 20,000 people, GH₵ 50 over 7 days estimates about 2,400–3,700 people. These are **working assumptions** to be calibrated against real delivery (decision **S2**). The estimate does not account for other promotions running at the same time; see the delivery simulation in [perf/promotion-delivery-2026-09](perf/promotion-delivery-2026-09.md).

The client sends only the post, goal, audience choice, budget, run length and start. Anything else it sends (an impression goal, a price, a reach figure) is stripped by validation. Creation re-runs the quote and snapshots `pricing_version`, `cpm_minor`, `impression_goal` and the estimate onto the campaign; later price changes never touch it.

### 8.2 Lifecycle

```text
draft → pending_payment → payment_confirmed → pending_review → scheduled / active ⇄ paused → completed
                                                           ↘ rejected   (any live state) → cancelled
completed / rejected / cancelled → refunded
```

`content_campaign_transition` is the only state machine (mirrored in `@abonten/core/content/campaignStateMachine`); it checks the actor kind for every move and records `content_campaign_event`. An advertiser may lift only their own pause, and resuming re-checks payment and that the post is still live.

1. **Create** (`createContentCampaignCore`): the post must be the caller's live, visible Spotlight with no other open campaign; the quote must be deliverable. A 30-minute `content_campaign_checkout` priced at the budget is created and the campaign moves to `pending_payment`.
2. **Pay**: web checkout page `?type=spotlight-promotion`, or the mobile promote / campaign screen (`POST /api/mobile/checkout/spotlight-promotion-attempt`). Cash only (card or mobile money); Abonten Credit is refused. `finalizePaystackPayment` verifies the charge with Paystack (the amount must match the attempt) from the client's verify call or the webhook, whichever comes first, and calls `activateContentCampaign`.
3. **Activate** (`content_campaign_activate_from_checkout`): only for a pending checkout whose total and whose successful transaction both equal the campaign budget; one `payment` ledger row (idempotency key per checkout; a replay answers `replayed: true`); the campaign moves to `pending_review`.
4. **Review** in Admin: approve (runs from `starts_at` for `duration_days`), reject (the full amount is refunded straight away), pause, resume, cancel. Needs `spotlight.campaigns.review` with a fresh step-up.
5. **Delivery**: a valid, de-duplicated sponsored impression (one per device per post per hour) moves `impression_count` while it is below the goal; the first one per device moves `reach_count`; meaningful views and completions are counted too. `content_campaign_accrue` recognises spend = floor(impressions × `cpm_minor` ÷ 1000), and the whole amount paid once the goal is delivered, never more than paid. `content-campaign-tick` (every 10 minutes) starts scheduled campaigns, accrues, pauses a campaign whose post, author or publisher place stopped being eligible (only staff can lift that pause), completes a campaign whose goal is delivered (`end_reason = budget_delivered`) and one whose run ended (`run_ended`).
6. **Stops**: goal delivered, run ended, advertiser cancels, staff pause / reject / cancel, the post is hidden, removed or deleted, the author is restricted, the publisher place is hidden, sponsored delivery switched off (nothing is shown or charged), or the promotions kill switch.
7. **Cancellation**: an unpaid order is cancelled through its checkout (refused while a payment is in flight, so a charge can never land on a cancelled campaign); a paid one moves to `cancelled` and keeps its unused budget as refundable.
8. **Refunds**: `content_campaign_refundable_minor` = paid − spent − refunded, for rejected, cancelled or completed campaigns. `content_campaign_record_refund` first recognises any delivery not yet accrued, then writes one `refund` row (once per campaign), moves the transaction to `refund_pending` and the service asks Paystack for the refund; the webhook settles it. Rejection refunds automatically. **Unused budget of a completed or cancelled promotion is refunded only when staff choose to** — whether it should be automatic, and what the advertiser is told, is decision **S3**. The advertiser screens say only that unused budget is shown on the promotion page.
9. **Accounting**: amount paid = the budget (no fee on top); recognised spend (`accrual` rows) is Abonten revenue; the unused remainder is owed back until refunded or decided otherwise. Promotion money never touches `organizer_ledger_entry`. Estimated reach is guidance, not a liability.
10. **Reconciliation**: `content-campaign-reconcile` (twice an hour) opens critical incidents for ledger drift, a live campaign without payment, a campaign pointing at a missing or failed transaction, or spend beyond delivered impressions; and a medium incident for a completed campaign with unused budget still unrefunded after 7 days.

### 8.3 Measurement

`content_campaign_metrics(campaign)` keeps the measures apart: **impressions** (times shown, de-duplicated per device per hour) and **reach** (distinct devices) never mix; plus meaningful views (watched past `meaningful_view_ms`), completions, profile / event / place / button taps, follows of the publisher by people shown the promotion within the previous 7 days, and attributed ticket purchases and reservations. Advertisers see these on the promotion page next to the estimate; staff see them on the campaign page and the overview.

Lifecycle analytics come from existing records: `content_campaign_event` (created, submitted, approved, rejected, paused, resumed, cancelled, completed, refunded) and `payment_attempt` (payment started, succeeded, failed).

## 9. Permissions

| Permission | Allows | Seeded roles |
|---|---|---|
| `spotlight.view` | The admin module: overview, posts, comments, promotions, settings (read) | operations, moderator, finance_admin, support_admin, analyst |
| `spotlight.campaigns.review` | Approve, reject, pause, resume, cancel promotions; with `finance.refund`, refund — in `STEP_UP_PERMISSIONS` | operations, finance_admin |
| `spotlight.configure` | Programme settings — in `STEP_UP_PERMISSIONS` | operations |

Content moderation actions use the existing `moderation.*` permissions.

## 10. Programme switches and kill switches

`resolveContentAccess` (`packages/services/src/content/contentProgram.ts`) reads the settings row (15-second cache) and fails closed. Separate switches exist for Spotlight, Stories, posting, comments, downloads, reactions, sharing, each feed tab, creator tools and promotions; audiences are `staff`, `beta` (plus `beta_user_ids`) or `all`. `spotlight_promotions_enabled` controls selling new promotions; `sponsored_delivery_enabled` separately controls showing running ones (off: nothing shown, nothing charged, organic Spotlight unaffected). Deploy-level emergency stops: `SPOTLIGHT_KILL_SWITCH=true`, `STORIES_KILL_SWITCH=true` and `SPOTLIGHT_PROMOTIONS_KILL_SWITCH=true` (selling and delivery) on the web deployment (set them on the admin deployment too so the settings page shows a warning). Turning Spotlight off hides every entry point but leaves Messages, events, places and notifications working; turning Stories off removes only the Stories row.

## 11. Jobs

| Job | Schedule | Does |
|---|---|---|
| `content-stats-rollup` | :20 hourly | Valid views and clicks into daily stats |
| `content-trending-refresh` | :25 hourly | Recompute `trending_score` over `trending_window_hours` |
| `content-housekeeping` | 03:50 | Archive ended Stories, purge per retention settings, queue orphan media |
| `content-campaign-tick` | */10 | Start, accrue delivered spend, pause ineligible, complete delivered or ended campaigns |
| `content-audience-refresh` | 03:15 | Measured audience for the promotion estimate |
| `expire-stale-content-campaign-checkouts` | */5 | Expire unpaid checkouts (skips a live payment attempt) and return the campaign to draft |
| `content-attribute-conversions` | :35 hourly | Credit purchases to promoted posts |
| `content-campaign-reconcile` | :10 and :40 | Money invariants → incidents |
| `storage-purge-dispatch` (existing) | */10 | Also drains `draft_asset_cleanup_queue` on Cloudinary through `/api/maintenance/storage-purge`, and sweeps `content_media/<environment>/` for uploads never registered (older than a day). For the sweep alone it calls the route at most once every 20 hours (last sweep and last call both older than that) |

## 12. Surfaces

- **Web**: `/spotlight` (keyboard: ↑ ↓, Space or K, M, L, C), `/spotlight/[postId]`, `/stories/[postId]`, Stories row in Messages, Follow on profiles and places, Spotlight tab on profiles and a Spotlight section on places, `/manage/spotlight` (composer, posts, insights, promotions), checkout branch `spotlight-promotion`. Server Actions in `apps/web/src/actions/content/`, components in `apps/web/src/spotlight/`. `/spotlight` and `/stories/` are public routes in the session middleware; the pages decide visibility through the programme. Link previews carry no post content and are `noindex`.
- **Mobile**: the feed is the Spotlight bottom tab `app/(app)/(tabs)/spotlight.tsx` (hidden while the programme is off); `app/(app)/spotlight/` (post, composer, manage, insights, promote, campaign); the Stories player `app/(app)/story/play` (queued from the Stories row) and `app/(app)/story/[id]`, both screens rather than modals so the reply bar and a report sheet work over a Story; comments open in place under a shrunken video; a native `volume-observer` module unmutes on volume up; profiles have an Events/Places selector and a Spotlights tab (Published / Saved / Drafts on your own); Follow on profiles and places, Spotlight strip on places, deep links `/spotlight` and `/stories` (`+native-intent.ts`, `app.json` App Links, the web `apple-app-site-association`) plus the in-app links `abonten://spotlight/campaign/<id>`, `…/post/<id>`, `…/promote/<post id>` and `…/manage`. White status icons over the black media screens come from `MediaStatusBar` (native-stack option on Android; `expo-status-bar` while focused on iOS, because the stack option needs a view-controller-based status bar that Expo's default Info.plist turns off). The feed holds one video player for the whole screen and gives it only to the page on screen.
- **API**: `/api/mobile/content/**` (33 route files) and `/api/mobile/checkout/spotlight-promotion-attempt`; typed in `@abonten/api-client` (`api.content.*`).
- **Admin**: Admin › Spotlight & Stories — see [admin/spotlight.md](../admin/spotlight.md).

## 13. Verification

Pre-merge audit, 2026-09-16 (local Docker stack; web, admin and Metro against it; real Cloudinary account; Paystack **test** mode):

- **Automated**: integration suites `content-platform` (20 tests), `content-promotions` (19: server pricing = shared estimator, refusals, kill switch, no-data refusal, stripped client fields and price snapshot, payment amount check, per-impression billing with reach per device and goal stop, run-end with refund exactly once, staff-pause and hidden-post guards, system pause on removal, sponsored placement without repeats, switches / kill switch / daily cap / pause / hidden / block, fair rotation, pacing and location targeting, event / place / Spotlight checkout cancellation incl. in-flight payment), `cloudinary-cleanup` (3); estimator unit tests (14); full counts in the changelog entry.
- **Cloudinary (real)**: photo, portrait, landscape, square and silent videos accepted with correct lengths; a 0.5 s clip and a clip over the limit refused and destroyed; the long clip trimmed and accepted; GIF and a fake .mp4 refused by the signed upload; an HD video's rendition went pending → ready and served; the emulator composer uploaded, registered and published a video.
- **Paystack (test mode)**: mobile money payment from the Android app → verify → review; webhook-only fulfilment; replayed, duplicate, tampered and badly signed webhooks change nothing; staff rejection created a real Paystack refund and the `refund.processed` webhook (twice) settled it once; an invalid payer email fails cleanly.
- **Android emulator** (dev client built from this branch): Stories row, unseen-first ordering and seen state, viewer (hold to pause, reactions, menu with mute and report), feed tabs, paging, video playback, like, comment and reply, report, profile navigation, the composer (pick, details, upload, publish), edit caption, promote with live estimates, wallet, payment, promotion page with delivery figures, and the programme switched off. Defects found there are listed in the changelog.
- **Web / admin** in a browser: sponsored slot with its label, keyboard paging, promote dialog estimates (no request loop), checkout summary and cancel, admin approve and reject-with-refund, pricing save (audited), overview figures; no console errors after fixes.
Follow-up, 2026-09-17:

- **Delivery at a realistic audience size**: `scripts/perf/promotion-delivery-simulation.sql` runs a simulated week (8,000 devices, about 3,000 a day, three promotions side by side) through the real functions. The small budget delivered in full and stopped; the two larger ones ran out of time and ended with their unused budget shown; spend equalled delivered impressions × cost per 1,000; no device saw one promotion more than once a day; reconciliation found nothing. Results and the estimate comparison: [perf/promotion-delivery-2026-09](perf/promotion-delivery-2026-09.md).
- **Card payment (Paystack test mode, web)**: a test Visa card verified and saved through the Paystack window (GH₵ 1 check), then a GH₵ 20 promotion paid with the saved card; the payment attempt succeeded and the promotion moved to review.
- **Estimate by radius**: the Android promote screen showed 950–1,200 people within 5 km against 2,400–3,600 within 25 km for the same budget; the server quote equals the shared estimator for both (integration test); the admin form saves the per-radius figures (audited) and refuses a wider radius with a smaller share.
- **Environment folders**: a real upload through the local API landed in `content_media/development/<user id>/` and registered; the sweep lists only its own environment's folder and ignores anything else even if returned (integration test).
- **Android emulator**: the feed tab row fades at the edges and keeps the chosen tab in view; `abonten://spotlight/campaign/<id>` and `…/manage` open those screens; the promotions list shows people reached; status icons are white on the feed, dark on a pushed profile and white again after going back.
- **iOS**: the iOS JavaScript bundle exports cleanly (`expo export --platform ios`). No simulator or device run.
- **Not verified**: iOS on a device (including the status bar change above); Android App Links opening from a real `https://abontenhub.com/spotlight` link (needs the production `assetlinks.json` and a release build); a live (non-test) card payment; delivery with a real audience (the simulation models behaviour, it does not measure it).

Mobile interaction pass, 2026-09-17 (Android emulator, dev client rebuilt with the volume module, web API and Metro against the local stack with seeded users and content):

- **Automated**: `story-replies.integration.test.ts` (5: direct conversation per pair with Story context, reuse across Stories, reaction also recorded, client-id idempotency, place conversation reuse, refusals for replies off / own / expired / programme off / block / signed out); core `storyReply` and `profileContent` unit tests; the production function body is identical (md5) to the local replay.
- **Emulator**: Spotlight tab and dark bar; Tickets from Account; feed paging; inline Follow state; save count; More sheet; comments panel open, keyboard, post, list; own-post Insights button → Insights; Stories row rings and seen state; a Story reply sent without leaving the Story ("Reply sent · View chat"); the conversation shows "You replied to their story" with the preview; opening a Story from that preview (found and fixed: a first-slide video was skipped because a fresh player reports "ended" for its empty source); profile selector menu, Places, Spotlights Published / Saved / Drafts; location sheet lifted above the keyboard; chat send.
- **Not verified**: the volume buttons (this emulator image ignores media-volume changes, so no change event could be produced); the organizer-side view of a reply on a device (covered by the integration test); iOS entirely, including the Swift half of the volume module; the swipe transition frame by frame (screen captures are too slow to catch one frame; the fix is structural).

## 14. Deliberate limits

No hashtag pages, no audio library, no duets or stitches, no live streaming, no creator payouts, no auction pricing, no interest or category targeting (the `targeting_categories` column is kept empty), location targeting only around the post's own event or place, no automated content classification, English copy only. Comments are one level deep. On mobile, Stories take private replies rather than comments. Web has no drag-to-reorder in the Story composer.
