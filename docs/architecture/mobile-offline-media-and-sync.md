---
title: Mobile offline cache, Spotlight playback, live comments, search relevance and follower counts
purpose: How the mobile app keeps previously loaded data across restarts and offline, how Spotlight video players are created, owned and torn down, how comments and likes stay in step across screens and devices, how search widens a query with related terms and dates, and how follower counts are maintained.
audience: Engineering, QA, security reviewers
scope: apps/mobile query persistence (queryPersistence.tsx, queryPersistPolicy.ts, queryCacheFiles.ts, SessionProvider offline session, storedSession.ts and the api.ts token fallback), the Spotlight feed and SpotlightVideo, commentThread / usePostEngagement / postCacheSync, the unified search screen and its filters, the profile header; migrations 20260919090000, 20260919091000, 20260919092000, 20260919093000 and 20260919100000; Admin › Discovery › Search vocabulary; @abonten/core query/persistPolicy, content/feedPlayback, content/commentCache, content/latestIntentToggle, content/postCache, search/searchFilters, promotionSummary; @abonten/services promotions/activePromotionsCore and GET /api/mobile/account/promotions. Not covered - web equivalents beyond the shared services and the Settings promotion card.
status: Approved
version: 1.1
lastReviewed: 2026-09-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile offline cache, Spotlight playback, live comments, search relevance and follower counts

This document covers the 2026-09-19 mobile overhaul. Each section states the
rule the code follows, why, and where it lives. PROJECT.md §36 is the summary.

## 1. Offline-first query cache

**What is kept.** React Query stays the single source of truth. An
allowlist (`apps/mobile/src/lib/queryPersistPolicy.ts`) names the queries
written to disk, each with a cap: at most N entries of that kind (newest
first) and, for paged lists, only the first page(s). The selection is a pure
function in `@abonten/core/query/persistPolicy` (unit tested).

| Kept (examples) | Why |
| --- | --- |
| Own profile, public profiles (30), profile tabs (first page) | Profiles must open offline |
| Event and place details (40 each), Explore sliders, nearby | Browsing what you saw |
| Spotlight feed (first page per surface), opened posts, grids, saved | The feed opens at once |
| Feature switches (content, discovery, rewards, verification, weekly) | Every programme hook fails closed; without these an offline start hides Spotlight, Search features and Rewards |
| Notifications (first page), active promotions | Account screens offline |

**Never written:** tickets and QR codes, payments, wallet, transactions,
payouts and organizer finance, verification cases, messages (messaging keeps
its own failed-send outbox), comments (live), search results, checkout
sessions and quotes.

**Where.** One JSON file per account (`rq-cache-<user id>.json`, or `anon`)
in the OS cache directory: excluded from device backups, may be purged by the
OS under storage pressure (it is a cache). A file over 3 MB or older than 7
days is discarded. The buster is the cache version + native app version +
OTA update id, so a bundle never reads data shaped by an older one — bump
`QUERY_CACHE_VERSION` when a persisted query's data shape changes.

**Lifecycle.**

1. `SessionProvider` reads the session. **Offline with an expired access
   token** supabase-js cannot refresh and answers "no session"; the stored
   session (never removed on a network failure) is used instead, so the
   person stays signed in with their cached data. When the refresh succeeds
   (`TOKEN_REFRESHED`) every query is invalidated, because anything fetched
   in between went out without a valid token.
2. `QueryPersistence` restores that account's file and holds React Query in
   restoring mode meanwhile (the splash stays up; 2 s cap).
3. Restored data keeps its original fetch time, so it is stale: mounted
   screens refetch when there is a network, and offline it stays on screen.
   Screens render cached data even when a refresh fails (event, place,
   profile, Spotlight); only "never loaded" or "no longer exists" replaces it.
4. Writes are throttled (2.5 s) and flushed when the app backgrounds; only
   successful updates of allowlisted queries trigger a write.
5. **Deletion** happens on a real sign-out (`SIGNED_OUT`: every account file
   goes, the public `anon` cache stays) and when a *different* account signs
   in. It never happens merely because there is no session at that moment.

**Never ask anonymously while signed in.** When the access token has
expired and the refresh cannot reach the auth server (offline, or a flaky
network that still reaches the API), supabase-js reports no session. The API
client (`apps/mobile/src/lib/api.ts`) then sends the *stored* token instead
of none (`storedSession.ts`). Sending none asked as a signed-out person, and
the routes that also serve signed-out callers (feature switches, feeds)
answered 200 with the signed-out answer, which the app cached for the
signed-in person: Spotlight disappeared from the tab bar until the answer went
stale. With the stored token the server answers as that person (token still
valid by its clock) or 401. Either way no signed-out answer is cached. The
first working token (`TOKEN_REFRESHED`) then refetches every query.
Reproduced on the emulator (auth port unreachable, device clock +2 h): the
old client got `/profile` 401 and the signed-out programme answer, and the
tab vanished. The new client got `/profile` 200 and kept Spotlight, and
reconnecting refetched everything.

Hooks whose answer gates UI (programmes, own profile, rewards) throw on a
401/429/5xx instead of returning "off"/"none", so a transient failure keeps
the last good answer rather than caching a wrong one. Programme hooks also
keep the previous answer across a sign-in (`placeholderData`), so tabs do not
flash away.

**Writes offline.** Network-required actions (likes, saves, follows,
comments, deletes) check connectivity first and say "You're offline" instead
of queuing silently; the comment text stays in the composer. The offline pill
(`OfflineBanner`) mounts only while it has something to say — it previously
sat at opacity 0 under the navigator and was never seen.

## 2. Spotlight playback

**Model** (`@abonten/core/content/feedPlayback`, unit tested): every page is
`active`, `preload` (a direct neighbour) or `idle`. Only active and preload
pages have a player, so at most three decoders exist however far you scroll.
A page plays only when active, the screen is focused, the app is in the
foreground, nothing covers it and the person has not paused it.

**Ownership.** Each page owns its player (`SpotlightVideo` → `PlayerLayer`,
`useVideoPlayer`), created when it enters the window. Its `VideoView` is never
attached to another player and its source is never swapped under it — the
single shared, re-sourced player this replaced is what played the previous
video's audio over the next page (play() ran before the new source loaded)
and left pages on a frozen frame. `playbackOwner.claimPlayback` pauses
whichever player held audio in the same call that starts a new one.

**Teardown order.** A page leaving the window *retires*: pause, unload the
source (the decoder stops), then unmount the view and release the player.
Unmounting a TextureView while its decoder still wrote frames crashed the app
natively on Android during fast scrolling (measured on the emulator).

**Memory.** Neighbours buffer 3 s / 3 MB, the active page 12 s / 12 MB
(`bufferOptions`). ExoPlayer's long-form defaults, one per player, exhausted
the Java heap after ~30 fast swipes; with the caps the heap stays flat across
repeated stress rounds. Played bytes are cached on disk (`useCaching`), so a
revisited or offline clip does not download again.

**Sound.** One app-wide preference (`spotlightSound.ts`, persisted): muted
until the person turns sound on, remembered across screens and restarts.
Muted players mix with other audio; unmuted ones take audio focus.

**States.** Poster until the page's own first frame; a spinner only after
350 ms of real buffering; on a load error a retry control ("You're offline"
when offline), retried automatically once when the connection returns; a
failed optimised rendition falls back to the original upload.

**Measured on a release build** (Android emulator, host GPU, local stack,
2026-09-19). Cold start to first frame 1.6–1.8 s (3.9 s on the first run
after install). Memory over 4 × 40 swipes levels off at about 495 MB total
(Java heap 38–58 MB with no upward trend): no leak. Frame times on this
emulator are dominated by its GPU translation (the system Settings app
itself: median 44 ms, 85% of frames over budget), so only relative numbers
mean anything. Home scrolls like Settings (median 48 ms, 28% slow UI-thread
frames against 21%). Spotlight is heavier (median 77–89 ms, 40–53% slow
UI-thread frames). A Perfetto trace puts the difference on the render
thread, not in app code: drawing about 57 ms per frame against 35 ms for
Settings, plus about 11 ms per frame of layer sync (under 1 ms for
Settings). That is the cost of TextureView video layers updating every frame. TextureView
is kept because the comment sheet transforms the video, which a SurfaceView
ignores. Deferring the neighbour's player creation until after the snap was
tried and measured, changed nothing, and was not kept. App-side main-thread
work is small: view mounting totals about 0.7 s over the trace. One exception
is a single unmount of a page that had left the list window (49 views, 303 ms on this
emulator). Worth re-measuring on a mid-range physical device before any
change.

**Feed data.** The feed is never refetched in the background (a re-rank
moved the video being watched). It changes on a tab re-press (scroll to top,
then refresh), pull-to-refresh, when empty or failed on reconnect, or when a
restored cache is older than 10 minutes on open. A refresh loads only a fresh
first page and joins one already in flight. The active page is tracked by post
id, not index. The feed key includes a position only for the Nearby surface.

## 3. Comments and likes

**Cache as state.** Comment lists are React Query infinite queries; every
change goes through pure transforms (`@abonten/core/content/commentCache`,
unit tested) applied to every cached list that holds the comment:
optimistic "sending" rows replaced by the server row via a client id (or
kept as "failed" with Retry / Remove), deletes with rollback, reply counts.

**Likes** (comments, posts, saves) are latest-intent switches
(`@abonten/core/content/latestIntentToggle`, unit tested): at most one
request in flight per item; taps only move the desired value and one final
request settles it. Counts shown are derived from the count at the start of
the burst. Post engagement is written into every cached copy of the post
(`postCacheSync` over `@abonten/core/content/postCache`), so the feed, the
opened post and grids agree.

**Realtime** (migration `20260919090000`). While a comment sheet is open the
app joins the private topic `content_post:<post id>`. Triggers send
`comment_insert` (ids only), `comment_update` (visible / like and reply
counts) and `post_counts` (likes, comments, shares, saves). An insert makes
the app fetch the newest page and fold unseen comments in on top without
touching loaded pages (a gap falls back to a reload). Bodies never ride the
channel; the service still applies block lists and moderation. Join policy:
signed-in accounts, published and visible/restricted posts only
(`content_realtime_can_join`). A foreground push for a comment also marks
that post's comment lists stale.

**Sheet gesture.** Dragging the handle moves the same `progress` value the
card's video transform reads, on the UI thread; release springs back or hands
the rest to the close animation from where the drag stopped. Comment rows
have 16 pt / 8 pt gutters and a fixed 44 pt like column.

## 4. Search relevance and filters

**Vocabulary** (migration `20260919091000`). `search_concept(term,
expands_to[], applies_to[], enabled)` is data: a term people type and the
words that express it in listings (seeded with a Ghana-focused starter set —
food and dishes, nights out and music, faith and culture, places). Each word
(or known two-word phrase) of a query is widened to its alternatives in both
directions, **and every word must still match**, so "gob3 osu" finds beans
and plantain spots in Osu but never every food listing. Rows can be added or
switched off without a deploy (service role only; no client access).

**Tiers**, each scored below the one before so a literal match always wins:
precise full text → related terms (×0.6) → any-word / run-together
("afro wave" → "afrowave", ×0.35, only when fewer than five results) → typo
trigram fallback. **Dates:** month names and today / tonight / tomorrow /
weekend become an Africa/Accra date window with the other words kept ("jazz
december"); a title that literally contains the month still matches.
Spotlight search uses the same vocabulary for captions and hashtags.

**Tuning from real searches** (migration `20260919100000`, Admin ›
Discovery › Search vocabulary). `admin_search_vocabulary_gaps` groups the
submitted searches of a period that found nothing, or found results nobody
opened, and says whether the vocabulary already knows any of their words.
`admin_search_concept_preview` counts what a term and its words would match
today (upcoming events, places, Spotlights) before it is saved, using the
same phrase expansion as search. Terms are added, edited, switched off or
removed through `@abonten/services/admin/discovery/searchVocabularyAdminCore`
(`discovery.configure` + step-up, a reason, optimistic concurrency on
`updated_at`, audited as `discovery.vocabulary.*`). Input rules shared by the
form and the service: `@abonten/core/search/searchVocabulary`. The same
migration adds starter terms for the app's own event and place categories.
Operator guide: [admin/discovery.md](../admin/discovery.md).

**Filters** (`@abonten/core/search/searchFilters`, unit tested;
`SearchFilterSheet`). Search's own model, not Explore's: when, distance
(from the Explore location), price, event category, place category, open now,
rating. Each filter declares the result types it narrows; a tab only sends
and shows the filters that apply to it (others are kept for when you switch
back). Dates are rounded to the hour so the cache key is stable. A category
alone browses without text. The applied search and filters are mirrored into
route params (`?q=&when=&km=&cat=&pcat=&open=&rating=`). Results include a
Spotlights tab and section when Spotlight is on.

## 5. Follower counts and the public profile

Migration `20260919092000`: `follow_count(target_kind, target_id,
follower_count)` is kept exact by a trigger on `follow` in the follow's own
transaction (row-level upsert, backfilled; `follow_counts` reads it). Public
read; no client writes. `get_public_profile(username)` returns the profile
view's columns, rating, organizer verification, follower count and
`viewer_follows` in one SECURITY INVOKER call (three sequential reads before).
The header shows Followers on every profile, including your own; a follow
moves the number optimistically and settles to the server's count.

## 6. Settings › Overview promotions

`listActivePromotionsCore` (service role, owner filters on every query) lists
featured events and places and promoted Spotlights that are active, starting
soon, in review or paused — for the web Settings card and
`GET /api/mobile/account/promotions`. Labels come from
`@abonten/core/promotionSummary`. Promotion flows invalidate the cached list.

## 7. Verification

Unit: persistence policy, feed playback, comment cache, latest-intent toggle,
post cache, search filters, search vocabulary rules. Integration (local
stack): search relevance, comment realtime delivery and join policy, follower
counts under concurrency, active promotions, admin search vocabulary (gap
report, preview, permission, add/edit/remove with concurrency and audit, and
that search follows the change). Release build: see §2 measurements, plus
two real uploads to Cloudinary (`content_media/development/`) through the
upload screens. The 0.8 MB clip went straight through. The 9 MB clip failed
once on a network error, showed "Not posted yet… Try again", and succeeded
on retry. The optimised copy was built (9.1 MB → 0.93 MB), the status went
from `pending` to `ready` on read, and the post played. Both assets were
deleted afterwards. Device (Android emulator, local stack): see PROJECT.md §36.
