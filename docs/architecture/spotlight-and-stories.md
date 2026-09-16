---
title: Spotlight and Stories — short video, temporary Stories, follows and promoted content
purpose: How Spotlight posts, 24-hour Stories, the follow graph, engagement, telemetry, ranking, moderation and paid Spotlight promotions are modelled, secured, operated and rolled out on web, mobile and the admin console.
audience: Engineering, operations, finance, security reviewers
scope: The content_* and follow tables and functions (migrations 20260916120000..120400), @abonten/services content and admin/content modules, /spotlight, /stories and /manage/spotlight on web, /api/mobile/content/**, the mobile Spotlight, Story and creator screens, the Stories row in Messages, Admin › Spotlight & Stories, the seven content cron jobs, and the spotlight-promotion payment path. Not covered - hashtag pages, audio libraries, duets, live streaming and creator payouts, which are not built.
status: Approved
version: 1.0
lastReviewed: 2026-09-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Spotlight and Stories

**State (2026-09-16): built, merged to the feature branch, migrations applied to production, switched off for everyone.** `content_program_setting` has `spotlight_enabled = false`, `stories_enabled = false`, `spotlight_promotions_enabled = false`, both audiences `staff`. No entry point is visible on web or mobile while it is off, and the admin module works normally. Rollout is decision **S1** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md). Legal items **F5** and **G4** in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) must be decided before the audience is Everyone.

The pre-implementation audit that led to these decisions is [audit/spotlight-stories-pre-implementation-report.md](../audit/spotlight-stories-pre-implementation-report.md).

## 1. What it is

- **Spotlight**: a persistent feed of short vertical videos and photos posted by organizers, place owners and Abonten staff. Tabs: For you, Following, Nearby, Happening soon, Trending. A post can link an event or a place; its call to action follows the live state of that listing ("View event", "Event has ended", "Place unavailable").
- **Stories**: temporary posts (default 24 hours) from the same publishers, shown as a row at the top of Messages, unseen first. A Story holds up to `max_story_items` photos or videos.
- **Follow**: a public, one-directional follow of an organizer or a place. It fills the Following tab and the Stories row. It is separate from the private "Notify me" bell (`notification_subscription`), which is consent to alerts.
- **Promoted Spotlights**: a publisher pays a fixed plan to show a live Spotlight in more feeds with a "Sponsored" label. Every promotion is reviewed before it runs.

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
| `content_campaign_preset`, `content_campaign`, `content_campaign_checkout`, `content_campaign_ledger`, `content_campaign_event`, `content_campaign_conversion` | Promotion plans, campaigns, checkout, append-only money ledger, state history, attributed purchases | none |

No client role can insert, update or delete any of these tables. Every write goes through `@abonten/services` with the service role after the service has resolved identity and the programme. `content_campaign_ledger` refuses updates and deletes by trigger.

Existing tables reused: `report` (targets `spotlight`, `story`, `content_comment`), `moderation_action` and `apply_moderation_action`, `conversation_block` (a block anywhere hides content both ways), `notification` and the delivery queue, `payment_attempt` (fifth target `content_campaign_checkout_id`), `transaction` (`reason = 'Promotion_Purchase'`), `admin_audit_log`, `incident`, `rate_limit_bucket`.

The older empty `story` and `story_default` tables from the original schema are untouched and unused.

## 3. Publishing

1. The client asks for a Cloudinary signature (`kind: "content"`, folder `content_media/<user id>`), uploads directly, then calls **register media**. `registerContentMediaCore` refuses anything outside the caller's folder, re-reads the asset from the Cloudinary Admin API and checks type, format, size and length there (the client's claims are ignored). Trims are applied as a delivery transformation. Long or large videos get an asynchronous optimised rendition (`playback_status = pending`); the original always plays meanwhile.
2. **Create post** attaches the caller's ready media in order and either keeps a draft or calls `content_post_publish`. `clientRequestId` makes a retried create return the same post.
3. `content_post_publish(post, actor)` is the only way to publish. It re-checks author, eligibility, the posting switches, the rights acknowledgement, media count and state, daily caps (`spotlight_posts_per_day`, `stories_per_day`), and the linked event or place (live, owned by the publisher or held at the publisher's place). It sets `published_at`, and for Stories `expires_at = now() + story_ttl_hours`.

Deleting a post is a soft delete; an active promotion on it is cancelled. Unused uploads are destroyed after `orphan_media_hours` through `draft_asset_cleanup_queue`.

## 4. Reading

- **Visibility** is one SQL predicate, `content_post_is_public(status, moderation_state, kind, published_at, expires_at)`: published, `visible` or `restricted`, and not expired for Stories. Documents are built by `content_post_documents(viewer, ids)`, which also drops posts by suspended authors and posts either side has blocked. The author always sees their own post.
- **Feed** `content_feed(viewer, surface, lat, lng, radius, as_of, cursor_score, cursor_id, limit)` ranks in SQL from settings: recency, engagement, following, proximity, event urgency, a penalty for posts already viewed, and removes not-interested posts and muted publishers. Cursors are keyset `(as_of, score, id)`, so a page never repeats or skips when new posts arrive.
- **Sponsored slots** are merged in TypeScript (`mergeSponsored`, `@abonten/core/content/feedMerge`): at most `sponsored_max_share_bps` of a page, never closer than `sponsored_min_gap` posts, capped per viewer per day, never a post already on the page. Candidates come from `content_sponsored_candidates`. The slot carries `sponsored.campaignId` and both clients always show the "Sponsored" label.
- **Story tray** `content_story_tray(viewer)`: own Stories first, then followed publishers with unseen Stories, then seen; muted publishers are flagged. **Story sequence** returns a publisher's live Stories oldest first. An ended Story link answers 410 with the publisher so the page can offer their profile or place.
- **Search** `search_spotlight(query, viewer, limit)` over captions and hashtags.

## 5. Engagement and notifications

Likes, saves, reactions, not-interested and follows send the desired end state, so double taps and retries are idempotent. Counters are maintained by triggers (a hard delete of an already soft-deleted comment does not double-decrement). Comments are rate-limited (`comments_per_hour`) and can be turned off per post or per product. Follows are rate-limited (`follows_per_hour`).

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

Fixed billing, no auction. `content_campaign_preset` rows set price and duration (seeded: 3 days GH₵ 50, 5 days GH₵ 100, 1 week GH₵ 250, 2 weeks GH₵ 500). Presets never promise reach.

```text
draft → pending_payment → payment_confirmed → pending_review → scheduled / active ⇄ paused → completed
                                                           ↘ rejected   (any live state) → cancelled
completed / rejected / cancelled → refunded
```

`content_campaign_transition` is the only state machine (mirrored in `@abonten/core/content/campaignStateMachine`); it checks the actor kind for every move and records `content_campaign_event`.

1. **Create** (`createContentCampaignCore`): the post must be the caller's live, visible Spotlight with no other open campaign. The price comes from the preset, never the client. A 30-minute `content_campaign_checkout` is created and the campaign moves to `pending_payment`.
2. **Pay**: web checkout page `?type=spotlight-promotion` or mobile `POST /api/mobile/checkout/spotlight-promotion-attempt`. Cash only: `PROMOTION_TARGETS.spotlight.creditAllowed = false`, so Abonten Credit is refused. `finalizePaystackPayment` verifies the charge and calls the injected `activateContentCampaign` step.
3. **Activate** (`content_campaign_activate_from_checkout`): only for a pending checkout with a successful transaction; writes one `payment` ledger row (idempotency key per checkout; a replay answers `replayed: true`) and moves the campaign to `pending_review`.
4. **Review** in Admin: approve (scheduled or active from `starts_at`), reject (the full amount is refunded immediately), pause, resume, cancel. Needs `spotlight.campaigns.review` with a fresh step-up.
5. **Delivery**: `content-campaign-tick` (every 10 minutes) starts scheduled campaigns, accrues spend by time run into `accrual` ledger rows, pauses campaigns whose post is no longer live, and completes campaigns at `ends_at`.
6. **Refunds**: `content_campaign_refundable_minor` = paid − accrued − refunded, only for rejected, cancelled or completed campaigns. `content_campaign_record_refund` writes one `refund` row (once per campaign) and moves the transaction to `refund_pending` before the service asks Paystack for a partial refund; the existing webhook settles it. A cancelled campaign's remainder is refunded by staff from the campaign page (needs `finance.refund` as well). Who decides those refunds is decision **S3**.
7. **Reconciliation**: `content-campaign-reconcile` (twice an hour) opens critical incidents for ledger drift, a live campaign without payment, or a campaign pointing at a missing or failed transaction.

## 9. Permissions

| Permission | Allows | Seeded roles |
|---|---|---|
| `spotlight.view` | The admin module: overview, posts, comments, promotions, settings (read) | operations, moderator, finance_admin, support_admin, analyst |
| `spotlight.campaigns.review` | Approve, reject, pause, resume, cancel promotions; with `finance.refund`, refund — in `STEP_UP_PERMISSIONS` | operations, finance_admin |
| `spotlight.configure` | Programme settings — in `STEP_UP_PERMISSIONS` | operations |

Content moderation actions use the existing `moderation.*` permissions.

## 10. Programme switches and kill switches

`resolveContentAccess` (`packages/services/src/content/contentProgram.ts`) reads the settings row (15-second cache) and fails closed. Separate switches exist for Spotlight, Stories, posting, comments, downloads, reactions, sharing, each feed tab, creator tools and promotions; audiences are `staff`, `beta` (plus `beta_user_ids`) or `all`. Deploy-level emergency stops: `SPOTLIGHT_KILL_SWITCH=true` and `STORIES_KILL_SWITCH=true` on the web deployment (set them on the admin deployment too so the settings page shows a warning).

## 11. Jobs

| Job | Schedule | Does |
|---|---|---|
| `content-stats-rollup` | :20 hourly | Valid views and clicks into daily stats |
| `content-trending-refresh` | :25 hourly | Recompute `trending_score` over `trending_window_hours` |
| `content-housekeeping` | 03:50 | Archive ended Stories, purge per retention settings, queue orphan media |
| `content-campaign-tick` | */10 | Start, accrue, pause, complete campaigns |
| `expire-stale-content-campaign-checkouts` | */5 | Expire unpaid checkouts (skips a live payment attempt) and return the campaign to draft |
| `content-attribute-conversions` | :35 hourly | Credit purchases to promoted posts |
| `content-campaign-reconcile` | :10 and :40 | Money invariants → incidents |

## 12. Surfaces

- **Web**: `/spotlight` (keyboard: ↑ ↓, Space or K, M, L, C), `/spotlight/[postId]`, `/stories/[postId]`, Stories row in Messages, Follow on profiles and places, Spotlight tab on profiles and a Spotlight section on places, `/manage/spotlight` (composer, posts, insights, promotions), checkout branch `spotlight-promotion`. Server Actions in `apps/web/src/actions/content/`, components in `apps/web/src/spotlight/`. `/spotlight` and `/stories/` are public routes in the session middleware; the pages decide visibility through the programme. Link previews carry no post content and are `noindex`.
- **Mobile**: `app/(app)/spotlight/` (feed, post, composer, manage, post insights, promote, campaign), `app/(app)/story/[id]`, Stories row in the Messages tab, drawer rows, Follow and Spotlight strip on profiles and places, deep links `/spotlight` and `/stories` (`+native-intent.ts`, `app.json` App Links, the web `apple-app-site-association`). The feed holds one video player for the whole screen and gives it only to the page on screen.
- **API**: `/api/mobile/content/**` (33 route files) and `/api/mobile/checkout/spotlight-promotion-attempt`; typed in `@abonten/api-client` (`api.content.*`).
- **Admin**: Admin › Spotlight & Stories — see [admin/spotlight.md](../admin/spotlight.md).

## 13. Verification

- Integration suite `content-platform.integration.test.ts` (16 tests on the replayed local stack): client writes refused, service-role-only functions, drafts hidden by RLS, programme and audiences, kill switch, publisher eligibility, feed visibility after not-interested / block / moderation, idempotent likes and counters, author comment deletion, reaction replacement, comments switch, follow and tray seen-state, ended Story 410, view de-duplication, moderation notice, and the full campaign path (activation replay, advertiser cannot approve, accrual, cancel, refund once, append-only ledger, reconciliation clean).
- The suite found two defects that were fixed before release: the feed sent `undefined` RPC arguments that PostgREST drops (no feed could load), and `moderation_action` refused the new targets (plus `message` and `conversation`, which had silently broken staff moderation of messages) — migration `20260916120400`.
- Full regression: 53 files, 483 integration tests; unit tests core 434 and services 115; typecheck for services, web, admin and mobile; API parity (214 routes); scoped Biome.
- **Not verified**: any UI in a browser or on a device, real Cloudinary uploads and renditions, a real Paystack promotion payment and refund, iOS, Android App Links for the new paths (need a native build).

## 14. Deliberate limits

No hashtag pages, no audio library, no duets or stitches, no live streaming, no creator payouts, no auction pricing, no targeting beyond optional location, no automated content classification, English copy only. Comments are one level deep. Web has no drag-to-reorder in the Story composer.
