---
title: The On Abonten showcase — a moving wall of hosts and places
purpose: How the "On Abonten" wall works end to end — who can be on it, how eligibility is checked on every read, the programme switch, the website and app surfaces and their motion rules, the "See all" directory, counting taps and follows, and what is deliberately not built.
audience: Engineering, operations and support
scope: "showcase_program_setting, showcase_entry, showcase_daily_count and the showcase_* functions (migration 20261126100000); @abonten/core/showcase/rules; @abonten/services/showcase and @abonten/services/admin/showcase; the website's OnAbontenShowcase on the landing page and Explore, /on-abonten; GET /api/mobile/showcase, /showcase/directory, POST /showcase/tap; the app's Explore tab section and the on-abonten screen; the follow paths' showcaseEntryId; Admin › Showcase; SHOWCASE_KILL_SWITCH."
status: Review required
version: 1.1
lastReviewed: 2026-11-26
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# The On Abonten showcase

**State (2026-11-26): built, not released, switched off.** The founder's idea of 26 November 2026, approved the same day ("go with your picks and build the showcase"): a moving wall of the organizers and places that are on Abonten, on the website and in the app, every tile a real Abonten page with a Follow button. Think of a "companies we work with" logo strip where each logo opens a live profile.

Why: social proof for first-time visitors, a concrete give in venue proposals, and more follows (follows feed the Following tab and the Stories row).

## 1. What people see

A section titled **On Abonten** with two rows drifting slowly in opposite directions:

- **Hosts**: organizers, people or teams.
- **Places**: venues, restaurants, bars and the like.

Each tile shows the picture (organizer avatar, place cover), the name with the existing Verified mark when they have it (organizer badge, or the business badge for a team, `user_info.organizer_verified`; `place.verified`), a "next up" line, a pulsing dot when something of theirs is on today or this weekend, and a Follow button. Tapping the picture or the name opens their profile or place page.

The "next up" line (`showcaseNextUp` in `@abonten/core/showcase/rules`):

| Tile | Line |
|---|---|
| Host | Their next event: "Fri, 4 Dec · Afro-house night" (the day on the event's own clock, in the reader's language, `getEventCardDateTime`), or "On now · …" while it runs. Nothing when they have none (they would not be on the wall). |
| Place | Its next event there, as above; else "Open now" (`place_is_open_now`, special dates included); else its kind and area ("Restaurant · Osu"). |

The dot (`isOnTodayOrThisWeekend`): the event is running, or one of its days touches today, or this week's Friday to Sunday (from Friday on: the rest of that weekend), always on the event's own clock (`event.timezone`). A screen reader reads it as "On today or this weekend: …".

The wording is "On Abonten", never "Our partners", "Trusted by" or anything that implies an endorsement or an agreement ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) P1, P2). Big events appear only as a tile's next-up line: there is no poster row in this version.

## 2. Where it is

| Surface | Where | How it is read |
|---|---|---|
| Website landing page | Below "Explore a city", before "What you can do on Abonten" (`apps/web/src/landingPage/organisms/LandingSections.tsx`) | In the browser (`useShowcaseWall` → Server Action `getShowcaseWall`): the page is cached for an hour for everyone, the tiles carry the visitor's own follow state |
| Website Explore | Events and Places tabs, after the first row "Around you" (`EventsTabContent`, `PlacesTabContent`), for the explored point | Same |
| App Explore tab | Events and Places tabs, after the first row (`apps/mobile/app/(app)/(tabs)/index.tsx`), for the explored area | `GET /api/mobile/showcase?lat=&lng=` (`api.showcase.wall`), `private, no-store` |
| "See all" (website) | `/on-abonten` (`apps/web/src/app/[locale]/(pages)/on-abonten/page.tsx`), the point carried as `?lat=&lng=` | Server-rendered per request (`dynamic = "force-dynamic"`), service called directly |
| "See all" (app) | `app/(app)/on-abonten.tsx` | `GET /api/mobile/showcase/directory` |

Never near checkout, tickets or payments.

The point picks the wall: the market whose launched city (`market_region`, active) holds it, with that city; else the default market without a city. A city entry (section 4) shows only to people browsing that city.

## 3. Motion manners (WCAG 2.2.2)

| | Website (`apps/web/src/showcase`) | App (`apps/mobile/src/components/showcase`) |
|---|---|---|
| How it moves | Each row's track holds its tiles twice and a CSS animation moves it left by half its width per loop (`showcaseDrift` in `globals.css`): a transform the compositor runs, no script per frame. The second row runs in reverse. About 7 s per tile, at least 40 s per loop | The same two copies; a Reanimated frame callback moves `translateX` on the UI thread (no JavaScript per frame), 28 points a second; the second row moves right |
| A short row | Repeated inside each copy until a copy holds 8 tiles (wider than a wide screen) | Repeated until a copy holds 6 |
| Pauses | Pointer over it, focus inside it, a finger on it (and 2.5 s after), the visible **Pause / Play** button, off screen (IntersectionObserver) | A finger on it (and 2.5 s after), Explore not the screen in front (`useIsFocused`), the app in the background (`useAppActive`) |
| Still | `prefers-reduced-motion`: plain rows that scroll sideways, no copies, no Pause button | Reduced motion (`useReducedMotion`) **or a screen reader on** (`AccessibilityInfo.isScreenReaderEnabled`): plain horizontal lists |
| The copies | Every repeat is `aria-hidden` and `inert`: read once, tabbed once | Every repeat is `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` |

The dot pulses (`animate-ping` on the web, a Reanimated opacity loop in the app) and stands still under reduced motion.

## 4. Who is on it

**Staff pick**, per market, in Admin › Showcase ([admin/showcase.md](../admin/showcase.md)): search for organizers, teams and places, add them, set the order (Up / Down), optionally limit an entry to one launched city, add a staff note, remove. A subject is on a market's wall at most once (`showcase_entry_once`); a place only on its own market's wall. Every change is audited (`showcase.entry.add`, `.update`, `.move`, `.remove`, `showcase.settings.update`).

**Eligibility is checked on every read, in SQL** (`_showcase_subject_state`), so an entry that stops qualifying drops out by itself and comes back when it qualifies again. Reasons an entry is not shown (null = shown):

| Host | Place |
|---|---|
| `market_closed`: the market is not live or in maintenance (`hidden_listing_countries()`, once per query) | `missing`, `market_closed`, `other_market` (the place moved to another country) |
| `account_deleted` (status 4) | `ownerless`: the owner's account was deleted |
| `account_restricted`: suspended or banned | `owner_restricted`: the owner is suspended or banned |
| `team_paused`: a team account whose team is frozen or closed | `team_paused`: the owning team is frozen or closed |
| `no_upcoming_event`: no event of theirs in this market that the Explore rule has on (`_explore_event_candidates`: published, not archived, **not postponed**, not hidden or removed, a date not ended) and that is not restricted | `not_published`, `moderated` (restricted, hidden or removed), `permanently_closed` |
| | `not_claimed`: put up by Abonten's own staff (the owner is an active admin) and nobody has claimed it; since 2026-11-26 the shared `place_listed_by_abonten()`, the same test the place page uses to invite a claim (`@abonten/core/placeClaimInvite`, migration `20261126140000`) |

The next event is the Explore rule's, so a run of shows counts once at its earliest show (`coalesce(series_id, id)`). The rule is called **once per kind for the whole set** (a host's own events in the market, and the events held at each place, separately, because a run's earliest show for a host and for a venue can differ), never once per row, and not at all when there is nothing to ask about.

`showcase_wall()` picks the entries that show, in staff order, up to `max_per_row` per row, and only then builds the tile fields for those (names, pictures, category, area, "open now", the viewer's follow state). The directory asks for up to 200 per row.

## 5. The programme switch

`showcase_program_setting` (one row): `enabled`, `audience` (`staff` active admins · `beta` staff plus `beta_user_ids` · `all` everyone), `min_per_row` (default 4), `max_per_row` (default 24). The env flag `SHOWCASE_KILL_SWITCH=true` on the website deployment hides it everywhere (the website serves the app's routes too); set on the console's deployment as well, Admin › Showcase says it is set. Resolver: `packages/services/src/showcase/showcaseProgram.ts` (15 s cache; fails closed; a settings read error is reported as a failure, never as "off").

**Ships off**: `enabled = false`, audience `staff`. Nothing is seeded.

**The thin-wall rule**: a row shows only with at least `min_per_row` entries that qualify; the whole section hides when neither row does (`showcaseRowsToShow`). The directory lists a group on the same terms, so it never lists what the wall would hide. A wall of two or three names looks worse than none.

**Caching**: signed-out visitors see it only when the audience is `all`. No response that carries follow state is cached for others: the landing and Explore pages load it in the browser per visitor, the directory renders per request, the app's routes answer `private, no-store`. The app does **not** persist it offline (`queryPersistPolicy.ts` is unchanged): follow state is personal.

**Failures**: a read that failed is a 500 envelope; the website's query treats it as an error and the section stays hidden; the app's query keeps the last answer and retries (`settleEnvelope`). Neither ever says "nobody is on Abonten". The directory page answers 404 while the wall is off for the visitor and 500 when the read failed.

## 6. Follow

The tiles reuse the existing Follow button and service: website `apps/web/src/spotlight/molecules/FollowButton.tsx`, app `apps/mobile/src/components/content/FollowButton.tsx`, `setFollowCore` in `packages/services/src/content/followCore.ts`. Signed out, the button asks the person to sign in (the existing prompt). It is hidden on your own profile or place, and while neither Spotlight nor Stories is on for the visitor (the button's existing rule; both are on for everyone in production). The wall passes the viewer's follow state (`known`), so a wall makes no follow-status request per tile.

## 7. Counting taps and follows

`showcase_daily_count` (entry, market day, taps, follows), service-role only, removed with its entry:

- **Taps**: the tile counts a tap as it opens the page (website `recordShowcaseTap`, app `POST /api/mobile/showcase/tap`, both `recordShowcaseTapCore`). Counted only while the wall is on for the caller, once an hour per viewer (the account, or the address signed out) and entry; at most 120 taps an hour per viewer. Counting never gets in the way of opening the page.
- **Follows**: the tile's Follow sends `showcaseEntryId` with the ordinary follow (`followSchema`, `api.content.setFollow(…, { showcaseEntryId })`). `setFollowCore` counts it only after inserting a **new** follow row, `showcase_count()` only when the entry is for that very organizer or place, and once a day per person and entry, so following, unfollowing and following again does not count twice.

Admin › Showcase shows each entry's taps and follows for 7 and 30 days. **Not done yet**: telling hosts in their Monday views note how many people tapped or followed them from the wall (a later step; the Monday note is `listing_views_weekly_notices()`, [social-distribution.md](social-distribution.md)).

## 8. Access

All three tables have RLS on, no policies and no anon/authenticated privileges; every function is `SECURITY DEFINER`, `search_path = ''`, `EXECUTE` for `service_role` only (the migration checks both and refuses to finish otherwise). Everything goes through `@abonten/services/showcase` (public reads, counting) and `@abonten/services/admin/showcase` (the console, each function re-checking `showcase.view` / `showcase.edit`). Permissions: `showcase.view` (operations, moderator, support_admin, analyst, field_ops_manager) and `showcase.edit` (operations, moderator); super_admin has both. Saving the programme settings also needs a fresh sign-in (step-up, checked in the console's action).

Tests: `packages/core/src/showcase/rules.test.ts` (rows and section thresholds, the next-up line, today or this weekend in a zone, the audience); `packages/services/src/__integration__/showcase.integration.test.ts` (eligibility for deleted, banned, suspended accounts, a frozen team, ownerless, banned-owner, staff-listed, hidden, closed and draft places, postponed, hidden and restricted events, an ended event dropping a host on the next read, a market that is not live; the switch, the audience and the kill switch; the minimum and maximum per row; city entries; the console's add, move, remove, permissions and audit; the settings' version check; taps and follows counting; no client access). `function-grants.integration.test.ts` keeps four of the functions refused to signed-in callers. `apps/web/e2e/seo.spec.ts` checks the directory is a 404 while the wall is off.

## 9. Not in this version

- Paid "Featured" placement on the wall: deferred ([OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md) SC1).
- A poster row of big events; automatic picks; per-viewer ordering.
- Telling hosts about their taps and follows in the Monday note.
- The "ID checked" mark on tiles (not shown; it would be read only through `user_info.id_checked` / `account_id_checked()`).
- An app link for `abontenhub.com/on-abonten` (the website page opens in the browser).
- Drag-and-drop ordering in the console (Up / Down buttons, as in Abonten Weekly).

## 10. Switching it on

1. Apply the migration (it ships off). Add hosts and places in Admin › Showcase for the market; check each shows "Showing".
2. For staff only: Settings › The wall is switched on, Who sees it **Staff only**, a reason, Save (needs a fresh sign-in). Staff then see it on the landing page, on Explore (both tabs, after "Around you"), in the app's Explore tab, and at `/on-abonten`.
3. For everyone: decision SC2 (about ten well-known names first) and the legal items P1 and P2.
