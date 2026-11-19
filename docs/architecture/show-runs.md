---
title: Runs of shows and copying a listing
purpose: How an organizer turns one listing into a run of shows (a play on several days and times) or copies it to a new date, why each show is a whole event, what is copied, how lists and search show a run once, and how buyers pick a show.
audience: Engineering, operations and support
scope: event_series, event.series_id, event_add_show, get_event_shows and the run-once rewrite of _explore_event_candidates, search_events and search_suggest (migration 20261119210000); @abonten/core/showRuns; @abonten/services events/eventShowsCore; the web Manage › Details "Shows" card and event page show picker; the app's Shows and copies screen and event show picker.
status: Review required
version: 1.0
lastReviewed: 2026-11-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runs of shows and copying a listing

**State (2026-11-19): built, open to every organizer.** Parts 2 and 6 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md), decisions Y5–Y7 and Y12).

## 1. What it does

- **A run of shows.** On a published listing, the organizer picks the days of the week, the show times, the first and last day and how long a show lasts ("Friday 16:00, Saturday 16:00 and 20:00, Sunday 13:00, from 4 to 13 December"). Abonten makes one show per time, up to 60 per request. Times are read on the venue's clock.
- **Each show is a whole event** (a copy of the listing with its own date), linked to the others by `event.series_id`. So each show has its own seats and ticket stock, its own door list and check-in, its own cancellation and refunds, its own numbers, and its own payout 48 hours after it ends (`is_event_settled` works per event). Nothing on the money path changed.
- **Buyers see the run once.** Explore, every event list, search and the search suggestions keep one entry per run: the earliest show that matches what was asked (a date filter finds the run by its show inside the dates). The event page of any show lists the run's upcoming shows with seats left; picking one opens that show.
- **Make a copy.** The same copy with one new date and no run: a separate listing to edit afterwards (the same play next season, a second edition of a festival).

The older "several dates on one listing" (`event_occurrence`: one ticket valid on a chosen date, the seats shared by every date) stays as it is, for festivals and passes.

## 2. What a new show copies (`event_add_show`)

One transaction per show, service role only, idempotent on a client request id (a retry of the same submission returns the shows already made):

| Copied | How |
|---|---|
| Title, description, category and types, flyer, website, venue (point, address, place), capacity, registration setting | As they are. The flyer is shared; deleting a shared image is already guarded (`destroyAssetIfUnused`) |
| Country, time zone, currency | As they are (fixed at creation) |
| Refund policy | `refund_policy`, `refund_cutoff_hours` |
| Ticket types | Name, price, people per ticket; **the full stock** (what is left plus what was sold or is being bought); sale windows moved by the same amount as the date |
| Group prices | All tiers |
| Promo codes | Those still running, with their expiry moved like the date and their uses back to 0 |
| Promoter commission and promoters | The rate, invited-only, and the promoters still added |
| Pay small small and sending switches | The organizer's per-event settings |

Not copied: dates, sales, attendees, reviews, featuring (promotions are bought per show), photos (`event_media`).

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
| Tests | `packages/core/src/showRuns.test.ts`, `packages/services/src/__integration__/show-runs.integration.test.ts` |

## 5. Support

- "I want to change the title of every show": each show is edited on its own for now (Manage › Details of each show; the Shows card lists them).
- "Cancel one show": cancel that show's listing as usual; its buyers are refunded, the other shows are untouched.
- "The run shows the wrong date in Explore": a list shows the earliest show that matches; once a show ends, the next one takes its place.
