---
title: Mobile offline cache, Spotlight playback, live comments, search relevance and follower counts
purpose: How the mobile app keeps previously loaded data across restarts and offline, how Spotlight video players are created, owned and torn down, how comments and likes stay in step across screens and devices, how search widens a query with related terms and dates, and how follower counts are maintained.
audience: Engineering, QA, security reviewers
scope: apps/mobile query persistence (queryPersistence.tsx, queryPersistPolicy.ts, queryCacheFiles.ts, SessionProvider offline session, storedSession.ts and the api.ts token fallback), the screen-state contract (useQueryView, QueryUnavailable, @abonten/core/query/queryView), detail prefetching (useWarmDetails, prefetchEventDetail / prefetchPlaceDetail, prefetchStorySequence), the navigation theme (navigationTheme.ts), the Spotlight feed and SpotlightVideo with its timeline, scrubbing and speed controls (SpotlightTimeline, spotlightSpeed.ts, @abonten/core/content/playbackControls) and publish-to-feed (publishedSpotlight.ts, @abonten/core/content/feedMerge prependOwnPost), the sticky detail CTAs (@abonten/core/eventCta, BottomBar, useFreeRsvpFlow), commentThread / usePostEngagement / postCacheSync, the unified search screen and its filters, the profile header; migrations 20260919090000, 20260919091000, 20260919092000, 20260919093000 and 20260919100000; Admin › Discovery › Search vocabulary; @abonten/core query/persistPolicy, content/feedPlayback, content/commentCache, content/latestIntentToggle, content/postCache, search/searchFilters, promotionSummary; @abonten/services promotions/activePromotionsCore and GET /api/mobile/account/promotions. Not covered - web equivalents beyond the shared services and the Settings promotion card.
status: Approved
version: 1.2
lastReviewed: 2026-09-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile offline cache, Spotlight playback, live comments, search relevance and follower counts

This document covers the 2026-09-19 mobile overhaul and the 2026-09-21
follow-up (screen-state contract, messages and Stories offline, detail
prefetching, Spotlight playback controls, navigation theming, sticky detail
CTAs). Each section states the rule the code follows, why, and where it
lives. PROJECT.md §36 is the summary.

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
| Event/place secondary sections: ratings, first page of reviews, a place's upcoming events | A saved detail screen reads the same offline as online |
| Story sequences (20) | What a Story ring opens; expiry is re-checked when it is shown, so a saved sequence never replays an ended Story |
| The inbox's unfiltered views (first page), the latest page of the 15 most recent threads, their headers and the unread count | Messages opens offline to what was there, the way a messaging app is expected to |

**Never written:** tickets and QR codes, payments, wallet, transactions,
payouts and organizer finance, verification cases, comments (live), search
results, signed attachment links (they expire), checkout sessions and quotes.
Messages were on this list until 2026-09-21: the inbox now persists, capped
as above, because offline it said "No conversations yet" — the failure this
document's §8 exists to prevent. The file is per account, in the OS cache
directory, and is deleted on sign-out, so nothing of one person's inbox can
reach the next.

**A failed refresh never drops good data.** A query whose latest refresh
failed still holds its last good data (React Query marks it `error`); it is
written to disk as the success it last was, so the cold start after an outage
still has it. Only queries with no data are skipped.

**An error is never written.** The typed /api/mobile client returns HTTP
failures as data (`{ status, message }`), so React Query records them as
successes. `selectPersistedQueries` skips any value that is an error envelope
(or infinite data holding one), and the query hooks whose answer a screen
depends on throw on a TRANSIENT failure (401, 408, 429, 5xx —
`apps/mobile/src/lib/envelope.ts`) so the last good data survives and the
retry/refetch-on-reconnect machinery runs. A definite answer (403, 404, 410)
is still returned as data, because the screen has something true to say
about it.

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

## 8. What a screen shows: one state contract

React Query exposes several independent flags (`status`, `fetchStatus`,
`data`, `isRestoring`) and the app adds its own online state. Screens that
branched on one or two of them conflated states that mean very different
things to a person. Two real failures: Messages said **"No conversations
yet"** when the inbox simply was not on the phone yet, and an event opened
offline showed a bare **"could not be loaded / Retry"**.

`resolveQueryView` (`@abonten/core/query/queryView`, unit tested) is the one
decision, and `useQueryView` (`apps/mobile/src/lib/useQueryView.ts`) feeds it
the query, the restore state and connectivity. It returns one of:

| Kind | Meaning | What the screen draws |
| --- | --- | --- |
| `content` | Data is in the cache (restored, fetched or seeded) | The content — plus `refreshing` / `refreshFailed` flags; an error never replaces it |
| `empty` | The server actually answered with nothing | The feature's own empty state ("No conversations yet") |
| `loading` | The saved cache is still being read, or a request is in flight | The screen's skeleton |
| `offline` | Nothing cached and no request can be made (paused retry, or a failed attempt while offline) | "You're offline — this hasn't been saved on this phone yet. It will load when you're back online." No Retry button: the reconnect refetches by itself |
| `error` | A request was made, while online, and failed | "Couldn't load … / Retry" |

`QueryUnavailable` (`components/app/QueryUnavailable.tsx`) renders the last
three, including an on-media variant for Stories and Spotlight. Screens keep
their own empty state, because only they know what "nothing" means.

Applied to: Explore (events/places), explore by type, nearby places, event and
place detail, Messages inbox and thread, Stories (sequence and each slide),
a shared Spotlight, notifications, tickets, bookings, Your Spotlights and
promotions. A value that is an error envelope counts as a failed request, not
as data.

## 9. Having the data before the tap

Waiting until a screen mounts to fetch what the previous screen already
implied is the difference between "instant" and "a spinner". The rules are
deliberately narrow — prefetching everything costs data, memory and battery:

- **Cards fetch their detail on touch-down.** `EventCard` / `PlaceCard` call
  `prefetchEventDetail` / `prefetchPlaceDetail` in `onPressIn`, ~100 ms
  before the press lands. A cached, fresh detail is not re-fetched.
- **The top of a list is warmed.** `useWarmDetails` loads the detail of the
  first six cards (featured + the start of the list) — only while online,
  only on an **unmetered** connection (NetInfo `isConnectionExpensive`), and
  only once per set of ids. Because details are persisted, those screens then
  open offline after a restart too.
- **Story rings are warmed.** The tray prefetches the sequences of up to four
  unseen publishers (`prefetchStorySequence`), which is what a tap opens.
- **A post opened from a feed, grid or Story starts from that copy.**
  `useContentPost` seeds itself with the cached document and the time it was
  fetched (`readCachedPostWithTime`), so it renders at once and still
  refreshes on age.
- **Detail heroes reuse the card image.** The detail screens pass the
  card-size Cloudinary URL as the `placeholder` of the large one: it is
  already on disk, so the hero is never an empty box — including offline.

Not prefetched, on purpose: anything with a cost or a truth requirement —
checkout, payments, tickets, organizer finance, verification — and the rest
of any list beyond the first screenful.

## 10. Spotlight playback controls

The feed's media lifecycle (one player per page, ordered teardown, capped
buffers) is §2 and unchanged. On top of it:

- **Timeline and loading light** (`SpotlightTimeline.tsx`). One line along the
  foot of the video: playback progress, animated on the UI thread from the
  player's clock (`SpotlightPlayback` — two shared values and a seek, filled
  in only by the ACTIVE page's player). While `expo-video` reports it is
  waiting on data (first load or a rebuffer — the player's own status, not a
  timer), a light sweeps along the line after a 350 ms grace, so a quick
  refill never flashes. It never blocks a control.
- **Scrubbing.** Drag the line (or tap a point) to seek. It thickens, a thumb
  and `0:07 / 0:13` appear, the chrome fades, the video pauses on the frame
  under the finger and resumes from there. Seeks are throttled to ~80 ms.
  Gesture priority: the pan activates only on a horizontal move and fails on
  a vertical one, so a swipe that starts on the line still pages the feed;
  once it activates the card locks the feed's scrolling
  (`onGestureLockChange`). Clips shorter than half a second, or without a
  known duration, cannot be scrubbed (`scrubTarget` returns null). The strip
  runs edge to edge, and with Android gesture navigation a touch that starts
  near either screen edge belongs to the system Back gesture — so the strip
  is a `SystemGestureExclusionView` (local module
  `apps/mobile/modules/system-gesture-exclusion`, Android only,
  `View.setSystemGestureExclusionRects`): Android leaves exactly that thin
  band to the app. It is a plain `View` on iOS and in binaries built before
  the module existed; it needs a native build. The app's own drawer also
  watches that edge (`AppDrawer`'s 22 dp catcher above every tab root): the
  strip claims its rows of the window while it is on screen
  (`claimDrawerEdge` in `components/app/drawerGesture.ts`) and the drawer
  draws its catcher in segments that leave a gap over a claimed band —
  a gap, not a declined touch, because gesture-handler stops looking for
  handlers at the topmost view under the finger. On the strip a drag
  scrubs; anywhere else on the edge the drawer opens as before.
- **Speed.** The options sheet offers 0.5× / 0.75× / 1× / 1.25× / 1.5× / 2×.
  The choice is app-wide for the session (`spotlightSpeed.ts`) — not stored on
  disk, because a feed still running at 1.5× the next morning reads as a
  fault. `preservesPitch` is on.
- **Press and hold** plays at 2× until the finger lifts (`holdRate` never
  slows a faster choice), with a `2× speed` pill. It is a native LongPress
  run exclusively with the tap, so a tap still pauses and a hold never also
  toggles pause; the feed is locked while held. Long-press no longer opens
  the options sheet — the "…" button does.
- **Comments are a sheet.** Everything above the panel (the compact video and
  the black around it) is its backdrop; a tap anywhere there closes it and
  the video returns to full screen. Drag-down dismissal is unchanged.

## 11. Publishing a Spotlight appears at once

The feed is never refetched behind the viewer (§2), which is why a new post
used to appear only after a manual refresh. `showPublishedSpotlight`
(`features/content/publishedSpotlight.ts`) writes the document the create
call returned into the cached For You feed — first, exactly once
(`prependOwnPost` in `@abonten/core/content/feedMerge`, unit tested) — and
records a one-shot focus request that the Spotlight screen consumes when it
is next focused, scrolling to the new post. Nothing is faked: it runs only
after the server confirmed the post, only for a published Spotlight, and a
draft never enters a feed. A failed publish leaves the cache untouched and
the composer shows "Try again" (the upload is idempotent by request id).

## 12. Navigation surfaces are themed

React Navigation paints native surfaces from **its own theme**, not from
anything a screen styles: on iOS the native stack's `UINavigationController`
view (`nativeContainerStyle` in expo-router's `NativeStackView`), every
screen's default content background, the tab container, headers and cards.
The app never provided a theme, so those surfaces used `DefaultTheme` —
whose background is `rgb(242, 242, 242)` in **both** app themes. An
interrupted or reversed iOS swipe-back moves the top screen past its resting
position and exposes that container beside the screen, dimmed by UIKit's
transition shade: it reads as a white panel in dark mode and a washed one in
light mode. No screen style could reach it.

`useNavigationTheme` (`apps/mobile/src/lib/navigationTheme.ts`) builds a
React Navigation theme from the app's own tokens and the root wraps the
navigator in its `ThemeProvider`, so every navigator — present and future —
paints those surfaces with the app's colours. Colours are converted to
`rgb()` (`toRgb` in `@abonten/ui-native/theme`) because React Navigation runs
theme colours through the `color` library, which cannot read the tokens'
space-separated `hsl(H S% L%)` form. The three layers under the UI are now
all themed: the native root (expo-system-ui), the RN root view, and the
navigation theme.

**The launch URL and the first commit.** expo-router's forked
`useLinking.native.js` used to record the launch URL as the "last unhandled
link" with a React state update from inside the initial-URL promise. On
Android that URL is always a promise, and it can resolve before the
`NavigationContainer` has committed — React's dev-only "state update on a
component that hasn't mounted yet" at boot. Nothing in expo-router reads
that state and upstream react-navigation has removed the code, so
`patches/expo-router+57.0.22.patch` (patch-package, run by the root
`postinstall`) removes it here too. Do not reintroduce a delay in
`+native-intent.ts` to work around it; the patch is the fix, and it must be
regenerated when expo-router is upgraded.

## 13. Sticky ticket and booking CTAs

The primary action on an event or place no longer sits mid-page. Both detail
screens end with a `BottomBar` (the shared sticky footer: safe-area padding
that collapses under a keyboard) holding a price/status summary and one
button. What that button is comes from `resolveEventCta`
(`@abonten/core/eventCta`, unit tested): buy, reserve, "View my ticket" for a
ticket already held (still reachable after sales close — that is when it is
needed), or a disabled label saying why nothing can be bought (canceled,
ended, in progress, sold out, none set up). "Free" means the `FREE` tier
exists (`hasFreeRegistration` in `@abonten/core/ticketTiers`) — the same
test `issue_free_ticket` applies — never "every tier costs 0"; a paid tier
at price 0, or named FREE, is refused when an event is created or its
tiers edited (`paidTierProblem`, on the server and in the mobile wizards). The free-RSVP flow
(`useFreeRsvpFlow`) is shared state, so the date chips in the Tickets section
and the sticky button are the same action; the in-page duplicate button is
gone. A place shows "Book" (or "Sign in to book", which returns to the place
after signing in) to anyone but its owner.
