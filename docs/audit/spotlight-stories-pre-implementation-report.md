---
title: Spotlight + Stories — pre-implementation report
purpose: The codebase audit and architecture decisions made before building the Spotlight + Stories content platform, so reviewers can see what was reused, what was extended and what was newly built, and why.
audience: Engineering, product, security and finance reviewers
scope: Web, mobile, admin, packages, database and jobs as of main 4b175a49 (2026-09-16)
status: Approved
version: 1.0
lastReviewed: 2026-09-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Spotlight + Stories — pre-implementation report

Written before any implementation code, as required by the brief (§100). Every statement below was verified against the repository or the live database on 2026-09-16. The final architecture document is [architecture/spotlight-and-stories.md](../architecture/spotlight-and-stories.md).

## 1. Current architecture

A modular monolith. Business logic lives in the framework-free `@abonten/services` package; two thin transports consume it: web Server Actions (`apps/web/src/actions/**`, cookie session) and the mobile HTTP API (`apps/web/src/app/api/mobile/**`, Bearer JWT via `getMobileAuth`, typed by `@abonten/api-client`). `apps/mobile` never imports the services package. `apps/admin` is a third Next app and another client of the services package, guarded by `resolveAdminContext` and the `admin_role_permission` matrix. Every programme shipped since 2026-09 follows one pattern: a single `*_program_setting` row (switch + audience `staff|beta|all` + beta ids), a deploy-level `*_KILL_SWITCH` env flag that wins, a `resolve*Access` resolver that fails closed, and a `GET /api/mobile/<x>/program` twin of a `get<X>Program` action. Spotlight + Stories follows it exactly.

## 2. Existing reusable systems

| Need | What exists | Decision |
|---|---|---|
| Follow graph | **None.** `notification_subscription` (`kind = organizer|place`) is an explicit notification opt-in behind the recommendations programme (off in production, consent semantics, legal G3) — its own code even says "You can't follow yourself" but it is not a social relationship | Build one canonical `follow` table (organizer or place targets). "Notify me" stays a separate, explicit consent; following never auto-subscribes |
| Likes / comments / reactions on content | None for content (PROJECT.md §5: no post-comment or reaction system). Messaging has `message_reaction` with one-reaction-per-user semantics and `rollReaction` | New `content_*` engagement tables; reuse the one-reaction-per-user rule and the messaging emoji conventions |
| Shares | `event_share` (event-only) | New `content_share` with a channel column |
| Saves | `favorite` / `favorite_place` (events, places) | New `content_save` (different entity; the existing tables are hash-partitioned by user for events) |
| Blocking | `conversation_block` with `conversation_id null` = global block (`block_participant` RPC) | Reused as the unified block model: feeds, stories, comments and notifications exclude globally blocked users in both directions |
| Reporting | Generic `report` table, `submitReportCore`, `ReportDialog` (web), `ReportSheet` (mobile), `REPORTABLE_CATEGORIES` | Extended with target types `spotlight`, `story`, `content_comment`. No new reporting system |
| Moderation | `moderation_state` columns + `apply_moderation_action` RPC + Admin › Reports/Content, `contentBrowseCore` | Extended: the RPC maps the three new target types; Content module gets Spotlight / Stories / Comments tabs |
| Notifications | `createNotificationCore` (in-app row + push, honours `social_push`), `notification_delivery` queue for SQL-written notices, `notificationLink.ts` routing on mobile | Reused; new `content_*` notification types are classed `social`; likes and reactions are aggregated into one notice per post per hour |
| Media | Signed direct-to-Cloudinary uploads (`buildCloudinaryUploadSignature`, folder bound to the user id), `prepareHighlightVideoDelivery` (eager 720p rendition + poster), `videoDelivery.ts` decision, `highlightPlayback.ts` fallback, mobile `uploadToCloudinary` with progress, `draft_asset_cleanup_queue` for orphan destruction | Reused. New signature kind `content`. The server now verifies every registered upload against Cloudinary's Admin API (bytes, duration, dimensions, format) instead of trusting the client |
| Highlights (existing story-style reel) | `highlight` table, mobile `HighlightViewer` / composer (`useHighlightComposer`, `VideoTrimBar`, `ImageCropModal`), web `HighlightViewer` / `HighlightModal` | The composer pieces are reused for Story and Spotlight creation; the viewer patterns (gesture, progress, fallback) are reused for the Story viewer. Highlights themselves are untouched |
| Payments | `createPromotionPaymentAttemptCore` → Paystack → `finalizePaystackPayment` (CAS lock, verify, `transaction` row, credit capture, injected fulfilment step) + webhook; `payment_attempt` exactly-one-target check; credit reservations with `target_type` | Extended with a fifth target `content_campaign_checkout_id`, a fourth fulfilment dependency `activateContentCampaign`, and `PROMOTION_TARGETS.spotlight` |
| Promotions | `event_promotion_tier` / `_checkout` / `event_promotion` (fixed price for a fixed duration) | Same shape for campaigns: presets (fixed budget for fixed days), a money-path checkout, activation only after a verified `transaction` |
| Financial ledger | `transaction` (cash), `platform_fee_entry` (ticket fees), `organizer_ledger_entry` (organizer money), credit ledger | Campaign money is platform revenue, not organizer money: it is recorded as `transaction` rows (`reason = Promotion_Purchase`, like featuring) plus an append-only `content_campaign_ledger` (payment / accrual / refund). Nothing is added to `organizer_ledger_entry` |
| Analytics | `place_analytics_event`, `app_request_metric`, admin analytics RPCs, `search_query_log` | New raw telemetry tables (`content_view`, `content_click`) rolled up hourly into `content_post_daily_stat`; admin overview RPC |
| Rate limiting | `consume_rate_limit` RPC via `checkRateLimit` (fails open); row-count caps in domain tables | Both reused |
| Account restrictions | `guard_restricted_account` trigger on every user-writable public table | Attached to every new user-writable content table |
| Feature flags | `*_program_setting` + kill switch | `content_program_setting` + `SPOTLIGHT_KILL_SWITCH` / `STORIES_KILL_SWITCH` |
| Search | `search_tsv` generated columns, ranked RPCs, `search_query_log` | `content_post.search_tsv` + `search_spotlight` RPC; shown as a section when the visitor may see Spotlight |
| Deep links | `+native-intent.ts`, `app.json` intent filters (`/events`, `/places`, `/invite`, `/weekly`) | `/spotlight/<id>` and `/stories/<id>` added (native rebuild needed for the Android/iOS link filters) |

## 3. Existing media architecture

Bytes go browser/app → Cloudinary with a signature that binds `folder = <prefix>/<user id>` and `allowed_formats`; the server never sees the file. `uploadHighlight` then records the row, builds a poster and asks Cloudinary for an optimised rendition asynchronously (`eager_async`); players prefer `playback_url` and fall back to the original on a 423/404. Sizes: 90 MB video / 20 MB image client-side, Cloudinary's account ceiling server-side. Orphans are destroyed immediately or queued in `draft_asset_cleanup_queue`, drained opportunistically from the Drafts page. Weaknesses carried into the new design and fixed there: (1) client-reported bytes/duration/dimensions were trusted; (2) there was no media state model; (3) the cleanup queue is drained only when someone opens Drafts.

## 4. Existing Messages architecture

Mobile: `(tabs)/messages.tsx` renders `AppHeader` → `InboxSearchBar` → `InboxFilterChips` → subtitle → a `FlatList` of `ConversationRow` (with `ArchivedEntryRow` as the list header) fed by `useConversations` (infinite query over `list_conversations`, 20 per page, keyset cursor) and kept live by `useInboxRealtime`. Web: `/messages` → `MessagingWorkspace` (two-pane) → `ConversationList` (header, search, chips, rows). The Stories row is added as an independent block between the chips and the list on mobile and between the header and the search on web; it has its own query and error state, so a Stories failure never affects conversations.

## 5. Existing social / follow architecture

Public profile (`/user/<username>/*`, mobile `user/[username]`) shows the "Notify me" bell (`SubscribeBell`) when the discovery programme allows, plus highlights, events, places, reviews. Place pages show the same bell. There is no follower count anywhere. The Follow button is added beside the bell on both, and a "Spotlight" tab is added to the public profile.

## 6. Existing notification architecture

`createNotificationCore` writes the row with the service role and pushes (Expo + web push), skipping the push for social types when `social_push` is off. SQL-written notices reach phones through `notification_delivery` and the `notification-delivery` cron. The mobile app routes taps through `notificationTarget()` using `data.kind`. New kinds: `spotlight`, `story`, `content_comment`, `content_campaign`, `follow`.

## 7. Existing reporting / moderation architecture

`report` (polymorphic `target_type` CHECK), one open report per reporter per target, 10 per hour, optional attachment in the private `report-attachments` bucket. `apply_moderation_action` is the only writer of `moderation_state` (idempotency key, `moderation_action` audit row, `report_event`). Admin › Reports shows an `ActionPanel` whose `MODERATABLE` list decides which targets get hide/remove/restrict; Admin › Content browses by entity. Expired Stories stay reportable because the row and media are retained for `expired_story_retention_days`.

## 8. Existing payments / ledger architecture

Described in §2. Key invariants preserved: every purchase is a `payment_attempt` with exactly one target; `finalizePaystackPayment` is the single path for client-verify and webhook; a fulfilment step refuses to run without a verified `transaction`; refunds go through Paystack's API and the `refund.processed` / `refund.failed` webhooks flip `transaction.status`. `record_refund_release` on a failed campaign refund is a no-op (it only mirrors `refund_hold` rows, and a campaign transaction has none).

## 9. Existing promotions architecture

Featuring is a fixed price for a fixed duration; activation inserts an `event_promotion` / `place_promotion` row keyed by the checkout (unique), computed end date in SQL. Credit (scope `promotions`) may pay part or all of it. Campaigns reuse this economics: **fixed campaign** billing (the simplest model that can be measured and reconciled), with impressions, views and clicks reported but not billed.

## 10. Existing analytics architecture

Organizer dashboards and admin analytics are Postgres RPCs over money-path tables; place engagement is a raw event table with an owner insights action. Nothing here counts views with deduplication or abuse controls; the content telemetry design adds both.

## 11. Database design

Prefix `content_` for everything shared by Spotlight and Stories; `kind = spotlight | story` on the post. **The legacy `story` and `story_default` tables (0 rows, unused, guarded by the restricted-account trigger) are left untouched** — dropping them is a schema decision for the owner; the new tables do not collide with them.

| Table | Purpose |
|---|---|
| `content_program_setting` | One row: switches, audiences, beta ids, limits, feed mixing controls, retention days |
| `follow` | Canonical follow graph: `follower_id` → (`organizer`, user id) or (`place`, place id) |
| `content_post` | The post (Spotlight or Story): author, publisher identity (organizer / place / abonten), caption, hashtags, category, location, attachments (`event_id`, `place_id`), status (`draft`, `published`, `archived`, `deleted`), moderation columns, `published_at`, `expires_at` (Stories), cached counters, `trending_score`, `search_tsv` |
| `content_media` | One row per media item with its own state (`uploading`, `uploaded`, `processing`, `ready`, `failed`, `deleted`) separate from the post state; server-verified bytes/duration/dimensions; playback and poster URLs; trim window |
| `content_like`, `content_reaction`, `content_save`, `content_share`, `content_comment`, `content_comment_like` | Engagement; one like / one reaction / one save per person per post (primary keys); counters maintained by triggers |
| `content_view`, `content_click` | Raw telemetry with `valid` / `invalid_reason` (dedupe and abuse rules applied in SQL on ingest) |
| `content_post_daily_stat` | Hourly roll-up of validated telemetry per post per day |
| `content_story_seen` | Per-viewer seen state (ring state, unique viewers) |
| `content_mute`, `content_not_interested` | Stories mute per publisher; "not interested" per post |
| `content_campaign_preset` | Budget / duration presets (GH₵ 50 / 3 d, 100 / 5 d, 250 / 7 d, 500 / 14 d), editable in SQL like promotion tiers |
| `content_campaign` | The campaign with the eleven states from the brief; targeting (radius, categories); paid / spent / refunded (minor units); counters |
| `content_campaign_checkout` | Money-path checkout mirroring `event_promotion_checkout` (30-minute hold, expiry sweep) |
| `content_campaign_ledger` | Append-only spend ledger: `payment`, `accrual`, `refund`, `adjustment`, each with an idempotency key |
| `content_campaign_event` | Every state transition with actor and reason |
| `content_campaign_conversion` | Attributed ticket purchases / accepted bookings (a click within 7 days before the purchase) |

Constraints: CHECK on every status/kind/emoji; Stories must carry `expires_at` when published; a place publisher must name its place; likes/reactions/saves keyed by (post, user); `content_media.public_id` unique; foreign keys everywhere except where history must outlive the referenced row (campaign ledger keeps `transaction_id` as a plain uuid).

## 12. RLS design

RLS on every table; all writes are service-role only after the service has checked identity, ownership and eligibility. Reads: `content_post` public for published + visible/restricted + unexpired rows and own rows; `content_media` and `content_comment` readable when their post is; `follow`, `content_like`, `content_reaction`, `content_save`, `content_story_seen`, `content_mute`, `content_not_interested` readable by their owner only; `content_campaign` readable by its advertiser; telemetry, stats, ledgers, program settings and presets have no client privileges (presets are read through the service). The restricted-account trigger is attached to every user-facing table. The integration suite asserts each boundary as anon, a normal user, an organizer, a place owner, an unauthorized owner and the service role.

## 13. Media architecture

Upload → `registerContentMedia` (server checks the folder prefix, then calls Cloudinary's Admin API for the truth about bytes, format, duration and dimensions, applies limits) → `ready` (original playable) → asynchronous rendition (`playback_status`: `pending` → `ready` / `failed`; a failure never blocks viewing; "Retry processing" re-requests it) → attached to a post at publish. Orphans (media never attached within 24 hours), deleted posts and expired Stories past retention are queued for Cloudinary destruction by the housekeeping job, and the queue is now also drained by the web app's existing maintenance route pattern.

## 14. Spotlight architecture

Persistent posts by organizers, place owners and Abonten. Surfaces: For You, Following, Nearby, Happening Soon, Trending, plus profile and deep links. Ranking in one SQL function (`content_feed`) with settings-driven weights; sponsored posts are merged in the service with a maximum share and a minimum gap. Engagement is idempotent (primary keys, `on conflict`). Downloads are off by default and owner-controlled; when allowed the download is a Cloudinary attachment URL with `fl_attachment`, rate-limited.

## 15. Stories architecture

Temporary posts (default 24 hours, setting `story_ttl_hours`) of 1–10 media items. Expiry is server-authoritative: every active-story query requires `published_at <= now() and expires_at > now()`; nothing depends on the client clock. Tray order: unseen followed publishers by recency, then seen ones. Mute hides a publisher's Stories only. Expired Stories keep row and media for 30 days (reportable, moderatable) then are purged. Shared links to an expired Story open the publisher's profile or place with an "ended" notice.

## 16. Feed / ranking architecture

Score = recency decay × (1 + engagement rate) + relationship boost (followed) + proximity (Nearby) + urgency (Happening Soon) + quality (completion rate) − seen penalty − negative signals (not interested, reported, blocked). Weights live in `content_program_setting`, not code, so ranking can evolve without a release. Deterministic within a page cursor (`as_of` frozen in the cursor).

## 17. Monetization architecture

Fixed campaign: the advertiser picks a preset (budget and duration), an objective and simple targeting, pays through the existing Paystack path (credit allowed, scope `promotions`), the campaign becomes `pending_review`, staff approve, it runs `scheduled → active → completed`. Spend accrues pro rata per hour into the ledger; cancelling refunds the unaccrued remainder through Paystack (admin, step-up). No auction, no per-impression billing in version 1.

## 18. Admin architecture

New module **Spotlight** (`/spotlight` in the console): Overview, Posts (Spotlight / Stories with state filters), Comments, Campaigns (approve / reject / pause / resume / cancel / refund), Settings. Permissions `spotlight.view`, `spotlight.campaigns.review` (step-up), `spotlight.configure` (step-up). Content moderation actions reuse `moderation.*` and `apply_moderation_action`. Everything is audited through `recordAdminAudit`.

## 19. Mobile architecture

Expo Router screens under `(app)/spotlight/*` and `(app)/story/*` (pushed, not a sixth tab: the tab bar already holds five items and the programme starts staff-only); entries from the Explore hero, the drawer, profiles and deep links. Feed is a paged vertical `FlatList` with one `expo-video` player mounted per visible item and explicit release; Stories viewer built from the `HighlightViewer` gesture/progress model. Creation reuses the highlight composer (picker, crop, trim) and the upload provider pattern.

## 20. Web architecture

Routes `/spotlight`, `/spotlight/[id]`, `/stories/[id]`, `/manage/spotlight` (creator tools and campaigns). A responsive vertical viewer (keyboard: ↑/↓, space, m, esc), sponsored disclosure, deep links with Open Graph metadata. Stories row inside `ConversationList`.

## 21. Security model

Server-derived identity everywhere; no client-supplied price, owner, duration or bytes; signed uploads bound to the user; Cloudinary Admin API verification; rate limits on posting, comments, follows, reports, views; blocked users excluded at query time; moderation columns unwritable by clients; campaign money only through `finalizePaystackPayment`; Paystack webhook signature; idempotency keys on ledger entries and moderation actions; step-up for refunds and settings. Adversarial checks listed in §99 of the brief are executed in the QA phase.

## 22. Performance model

Cursor pagination everywhere; partial indexes for published/unexpired posts; GiST on locations; GIN on hashtags and search; counters cached on the post row (trigger-maintained); telemetry batched from the client; roll-ups hourly; one video player active at a time; poster-first rendering; feed page size 10; `explain analyze` on the feed and tray queries with a seeded dataset in `scripts/perf/`.

## 23. Testing strategy

Unit (Vitest, `packages/core` + `packages/services`): expiry predicate, ranking helpers, sponsored merge, state machine, budget arithmetic, view validation rules, notification aggregation. Integration (local Supabase replay): RLS matrix, publish/expiry, engagement idempotency, follow/tray, moderation, campaign state machine, checkout/payment fulfilment with a fake gateway, refunds, reconciliation. Web/mobile: typecheck, lint, production build; Android emulator QA per the recorded technique.

## 24. Migration strategy

Three additive migrations (`content_platform_core`, `content_platform_feed_and_engagement`, `content_platform_campaigns`), replayed locally first, then applied live through the Supabase MCP, advisors checked, types regenerated. No destructive statements; widened CHECK constraints only (`report.target_type`, `payment_attempt_target_check`, `credit_reservation.target_type`).

## 25. Rollout strategy

Ships **off**: both switches false, audiences `staff`, promotions off, downloads off. Stages: staff → selected organizers/place owners (beta ids) → pilot users → limited production → everyone. Promotions stay off until content quality, campaign accounting and fraud controls are verified on staff campaigns.

## 26. Risk register

| Risk | Mitigation |
|---|---|
| Legacy `story` table name collision | New tables use the `content_` prefix; legacy tables untouched and flagged |
| Video cost blow-up | Duration and size caps, per-day posting caps, rendition only when it saves bytes, retention purges |
| Fake views inflating trending or campaign reports | Dedupe per viewer/post/hour, watch-time sanity checks, per-viewer ingest cap, invalid rows kept for audit, no billing on views |
| Campaign activates without payment | Activation reads the verified `transaction` through the same guard featuring uses |
| Duplicate refund | Ledger idempotency key + `transaction.status` transitions |
| Expired Stories leaking | Predicate in every query and in RLS; no cached tray longer than 60 s |
| Native link filters need a rebuild | Documented; web links work immediately |
| Legal: user-content licence and copyright process (F1), promotional push (G3) | Rights acknowledgement at publish; copyright report category exists; recorded in the legal register |

## 27. Cost considerations

Per 1,000 30-second 720p clips: roughly 6 GB storage and, at 50 views each, 300 GB delivery on Cloudinary — the dominant cost, hence the caps and the rendition policy. Database growth is bounded by the 90-day raw telemetry retention and hourly roll-ups. Moderation load scales with posts; the Content module and report grouping already exist.

## Decisions taken without the owner (to confirm)

1. A new `follow` table is the canonical follow graph; "Notify me" remains separate.
2. One post table for both kinds (`content_post.kind`) rather than two parallel table sets.
3. Fixed-campaign billing with hourly accrual; no impression billing.
4. Stories are one publisher sequence of up to 10 items, 24 hours.
5. Downloads off for Stories in version 1; owner-controlled for Spotlight.
6. Legacy `story` / `story_default` tables left in place.
