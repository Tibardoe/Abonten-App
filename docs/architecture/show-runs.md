---
title: Runs of shows and copying a listing
purpose: How an organizer turns one listing into a run of shows (a play on several days and times) or copies it to a new date, why each show is a whole event, what is copied, how lists and search show a run once, and how buyers pick a show.
audience: Engineering, operations and support
scope: event_series, event.series_id, event_add_show, get_event_shows and the run-once rewrite of _explore_event_candidates, search_events and search_suggest (migration 20261119210000); tours, shows at other venues (migration 20261120190000); @abonten/core/showRuns; @abonten/services events/eventShowsCore; the web Manage › Details "Shows" card (ShowVenueChooser) and event page show picker; the app's Shows and copies screen (ShowVenueField) and event show picker.
status: Review required
version: 1.4
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runs of shows and copying a listing

**State (2026-11-19): built, open to every organizer.** Parts 2 and 6 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md), decisions Y5–Y7 and Y12).

## 1. What it does

- **A run of shows.** On a published listing, the organizer adds one show (a date and a time) or picks the days of the week, the show times, the first and last day and how long a show lasts ("Friday 16:00, Saturday 16:00 and 20:00, Sunday 13:00, from 4 to 13 December"). Abonten makes one show per time, up to 60 per request. Times are read on the venue's clock.
- **Tours.** New shows and copies may be at another venue in the same country (section 3a).
- **Each show is a whole event** (a copy of the listing with its own date), linked to the others by `event.series_id`. So each show has its own seats and ticket stock, its own door list and check-in, its own cancellation and refunds, its own numbers, and its own payout 48 hours after it ends (`is_event_settled` works per event). Nothing on the money path changed.
- **Buyers see the run once.** Explore, every event list, search and the search suggestions keep one entry per run: the earliest show that matches what was asked (a date filter finds the run by its show inside the dates); when the list knows where the reader is, the earliest show at the venue nearest them. The event page of any show lists the run's upcoming shows with seats left, grouped by venue for a tour; picking one opens that show.
- **Make a copy.** The same copy with one new date and no run: a separate listing to edit afterwards (the same play next season, a second edition of a festival).

The older "several dates on one listing" (`event_occurrence`: one ticket valid on a chosen date, the seats shared by every date) stays as it is. A pass for several shows of a run is [show-passes.md](show-passes.md).

## 2. What a new show copies (`event_add_show`)

One transaction per show, service role only, idempotent on a client request id (a retry of the same submission returns the shows already made):

| Copied | How |
|---|---|
| Title, description, category and types, flyer, website, capacity, registration setting | As they are. The flyer is shared; deleting a shared image is already guarded (`destroyAssetIfUnused`) |
| Venue (point, address, place) | As it is, or the other venue the organizer chose (section 3a) |
| Country, currency | As they are (fixed at creation; another venue must be in the same country) |
| Time zone | The venue's (the listing's, or the other venue's) |
| Refund policy | `refund_policy`, `refund_cutoff_hours` |
| When online sales close | `sales_close_before_end_minutes` ([ticket-sales-window.md](ticket-sales-window.md), since 2026-11-23): written by `addEventShowsCore` straight after `event_add_show`, not by the function itself |
| Ticket types | Name, price, people per ticket, passes (`pass_shows`, [show-passes.md](show-passes.md), since 2026-11-20); **the full stock** (what is left plus what was sold or is being bought); sale windows moved by the same amount as the date |
| Seating | The seating plan (`event_seating`) and each ticket type's section ([assigned-seats.md](assigned-seats.md)), since 2026-11-20; **not** for a show at another venue (a seating plan belongs to its hall: the organizer gives the new show its own) |
| Group prices | All tiers |
| Promo codes | Those still running, with their expiry moved like the date and their uses back to 0 |
| Promoter commission and promoters | The rate, invited-only, and the promoters still added |
| Pay small small and sending switches | The organizer's per-event settings |

Not copied: dates, sales, attendees, seats given, reviews, featuring (promotions are bought per show), photos (`event_media`).

Refused: a listing that is not published, and (since 2026-11-20, migration 20261120120000) one Abonten has hidden or removed — its new shows would have come out visible. The organizer reads "Abonten has hidden this listing, so it can't be copied."

## 2b. Bringing another run into this one (2026-11-21)

**Why.** An organizer who made a separate copy for the second week of a play and then added shows to the copy had two runs of the same play, listed twice to buyers (Roverman's *Fame In Flames*: 27–29 November and 4–6 December), and no way to put them together.

**What.** On the Shows card (website, *Join another run*) and the Shows and copies screen (app), the organizer, or a team member whose role covers `events.manage`, picks another of the account's upcoming published listings; it joins this run **with every show of its own run**. Each show stays its own event: tickets, seats, door lists and payouts don't change, and buyers now see one listing with all the shows.

**Refused** (`public.event_join_runs(account, event, other)`, service role only; the service resolves the acting account): not both the account's (`not_yours`); not both published and current (`not_published`); already the same run (`same_run`); another country or currency (`other_country`, as for a tour); a pass in either run (`has_passes`: a pass is sold for the shows of its own run); two shows at the same time at the same venue (`same_time`, the rule `event_add_show` keeps; a tour may play two cities at once). The other run's `event_series` row is deleted once empty.

**Where.** `listJoinableRunsCore` / `joinEventRunsCore` in `@abonten/services/events/eventShowsCore`; website actions `getJoinableRuns`, `joinEventRuns`, `events/molecules/JoinRunsSection`; app `GET`/`POST /api/mobile/organizer/events/:eventId/shows/join`, `features/events/JoinRunsSection`. Migration `20261121210000_join_runs`.

## 3a. Tours: shows at other venues

Built 2026-11-20 (migration 20261120190000), at the founder's request.

- **Where.** The Shows card (website) and the Shows and copies screen (app) ask "Where": *At this venue* or *At another venue*. Another venue is an Abonten place (website: any listed place, searched; app: the organizer's own places) or an address picked from the suggestions or the map. The choice applies to the shows and copies made next.
- **Checked by the server.** `addEventShowsCore` resolves the venue before anything is made: a place must be published and not hidden or removed; an address's country and time zone come from its point (`resolveListingLocation`, as when a listing is created), never from the client. The country must be the listing's: its currency, market and payment provider stay one per run. Another country is refused ("A show must be in the same country as the listing. For another country, create a new event there."). Wall-clock times are read on the new venue's clock.
- **`event_add_show`** takes the venue (`p_place_id`, or `p_latitude`, `p_longitude`, `p_address`, `p_country_code`, `p_timezone`) and checks the place and the country again. A venue more than 100 m from the listing's is another venue: the new show does not take the seating plan.
- **Two cities at once.** A run may have two shows at the same time when their venues are more than 100 m apart; at the same venue the second is skipped as before ("This run already has a show at that time.").
- **Buyers.** `get_event_shows` returns each show's venue (`place_id`, `venue_name` while the place is listed, `venue_address`, `city`); the pickers group the shows by venue (`groupShowsByVenue`). Lists with the reader's position pick the earliest show at the venue nearest them, to the kilometre (`_explore_event_candidates`, `search_events`, `search_suggest`), so a reader in Kumasi sees the Kumasi show.
- **Each show stays its own event**: its own seats, door list, cancellation and payout, as before. Editing the venue of one show later is the usual Manage › Details edit of that show.

## 3. Lists show a run once

Migration 20261119210000 rewrites three functions in place (`pg_get_functiondef` + `replace`, each replacement checked):

- `_explore_event_candidates`, the one rule every event list reads ([explore-lists.md](explore-lists.md)): a window `row_number() over (partition by coalesce(series_id, id) order by next start, id)` keeps rank 1. The candidate set is filtered first, so the kept show is the earliest that matches.
- `search_events`: the same over the whole ranked set before the cursor, so pages stay stable.
- `search_suggest`: up to six listings from a pool of 30, a run once.

Clients cannot place an event in a run (`guard_event_series_column`); `event_series` has no client access.

## 4. Code map

| Piece | Where |
|---|---|
| Weekly pattern → show times | `packages/core/src/showRuns.ts` (`expandShowRun`, 60 shows, 366 days, 15 min–24 h) |
| Service | `packages/services/src/events/eventShowsCore.ts` (`addEventShowsCore`: owner, restricted account, ID check for paid events, dates ahead, codes and slugs, partial-failure retry) |
| Transports | web `actions/addEventShows.ts`, `actions/getEventShows.ts`; `POST /api/mobile/organizer/events/:eventId/shows`; `get_event_shows` (public RPC) |
| Website | Manage › Details › `ManageEventShowsCard`; event page `EventShowsPicker` |
| App | `organizer/events/[eventId]/shows.tsx` (Shows and copies); event screen `EventShowsPicker` |
| Tours | `ShowVenueChooser.tsx` (website), `ShowVenueField.tsx` (app), `groupShowsByVenue` in `@abonten/core/showRuns` |
| Tests | `packages/core/src/showRuns.test.ts`, `packages/services/src/__integration__/show-runs.integration.test.ts`, `packages/services/src/__integration__/tours.integration.test.ts` |

## 5. Support

- "I want to change the title of every show": each show is edited on its own for now (Manage › Details of each show; the Shows card lists them).
- "Cancel one show": cancel that show's listing as usual; its buyers are refunded, the other shows are untouched.
- "The run shows the wrong date in Explore": a list shows the earliest show that matches (at the venue nearest the reader when it knows where they are); once a show ends, the next one takes its place.
- "I can't add a show in Lagos": a run stays in one country (currency, payment provider). Create a new event there.
- "My seat map is missing on the new show": a show at another venue does not take the seating plan; set one up on that show (Manage › Details › Seating).
