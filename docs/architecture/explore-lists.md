---
title: Explore lists
purpose: Explain how the lists of events and places on Explore are built (which listings are on, what each filter means, how a page and the Explore rows are chosen), what the apps send, and how to add a filter or a list without creating a second rule.
audience: Engineering
scope: public._explore_event_candidates, _event_cards, _place_cards, get_filtered_events, get_nearby_events, get_explore_event_sections, get_similar_events, get_place_events, get_events_in_window, get_filtered_places, get_nearby_places; @abonten/core exploreSections, exploreFilters and eventAvailability; the web Explore pages and the mobile Explore screens. Not covered - unified search and recommendations (discovery-search-and-recommendations.md) and how typed text is compared (search-languages.md).
status: Approved
version: 1.0
lastReviewed: 2026-10-03
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Explore lists

Migration: `supabase/migrations/20261002180000_explore_lists_one_rule.sql`. Columns were only added to the list functions, never renamed or removed, so app versions already installed keep working.

## 1. What was wrong

| What a person saw | Why |
|---|---|
| "Happening today" empty on a day with events; a paid promotion missing from the Featured banner | `get_nearby_events` gave every event with one date the same position, so they came in id order. The website cut its rows from the first 20 of that list and the app from the first 60. |
| "Free", "Under 50" and "From 20" did not change "All events" | A price filter needed both ends. |
| "Today" and "Tomorrow" emptied "All events"; a range stopped before its last day | A date filter needed both ends too and compared instants, and the apps send days. |
| A festival on the 5th, 12th and 19th not found by "10th to 15th" | An event with several dates was matched on its next date only. |
| A festival from Friday to Sunday missing from "Happening today" and from the "Today" filter on Saturday | A date counted for a day only when it started on it. |
| The same twenty cards under "Happening today", "this week" and "this month" | Each time row started from now, so "this week" began with today's events and "this month" with this week's. |
| "Talent Shows" also showing "Kids Talent Shows" | Types were matched as text inside text. |
| The same event twice where two pages of a list meet | The distance is part of the cursor. The API sends a float with 15 digits, so the cursor was a hair smaller than the value it stood for. |
| A row above the list and the list disagreeing | The rows were filtered in the browser or on the phone with their own rules. |
| "See all" in the app stopping at 60, in no order | It showed the row again instead of asking for more. |
| An event with several dates, or one that had begun, missing from a place's page | The place page read `event` directly and asked for a start in the future. |
| "Similar places" empty in a busy street | It took the 20 nearest places of any kind and kept the ones of the same category. |
| "100 spots left" on the website for an event whose tickets were gone | The website's card counted the headcount cap only. |
| Slow lists | Every list built the whole card for every listing in range before keeping 20. |

## 2. One rule for which events are on

`public._explore_event_candidates(...)` is the only place that says which events a list may show and what the filters mean. It returns ids with their position and nothing else. Every event list calls it.

An event is on when:

- it is published, not archived, not hidden or removed, and its market is visible;
- it has a date that has not ended. An event with dates of its own (`event_occurrence`) is judged by those. An event without is judged by its own start and end.

The filters, each optional:

| Filter | Meaning |
|---|---|
| Area | Within `p_max_distance_km` of the point. A point with no distance is "anywhere, with the distance worked out". |
| Dates | A date that has not ended falls inside them: it starts by their end, and starts in them or is still running when they begin. Each end stands alone. The event is listed under the earliest such date, so one under way is listed under its own start. |
| Price | A ticket tier is priced inside the bounds. Each end stands alone. An event with no tier is free. |
| Category | The event's category is that name. Upper and lower case do not matter. An empty name is no filter. |
| Types | One of the types is in the event's list, as a whole name. |
| Rating | The average of the event's visible reviews is at least that. |
| Text | The older search: title, slug and search document ([search-languages.md](search-languages.md)). |

**A day sent without a time is that whole day.** `get_filtered_events` and the rows function read an end bound at midnight UTC exactly as the end of that day (`_explore_day_end`), because app versions from before 2026-10 send "2026-10-12", which arrives as midnight. Current code sends the last moment of the day in the reader's zone and never midnight. The rule itself takes instants, so `get_events_in_window`, whose window ends are always instants, is not affected.

**Running counts.** A date ends when its `ends_at` passes. A date that ends at the very moment the asked dates begin is not inside them.

**Position.** `sort_start` is the next date that has not ended (inside the asked dates). `distance_km` is kilometres to the millimetre.

**Why the millimetre.** The distance is part of the cursor of "All events" and of the place lists. The database is set to send a float with 15 digits (`extra_float_digits = 0`). A distance of 0.22119104920000002 km went out as 0.2211910492, and the next page asked for rows after 0.2211910492, which included the row it had just shown. A distance rounded to six decimals goes out and comes back as the same number.

## 3. The card is built for the chosen rows only

`_event_cards(ids)` returns what an event card shows: lowest price, each tier's price and stock, how many are going, the dates, the event's rating, the organizer's rating, the time zone. `_place_cards(ids, distances)` does the same for places: category, rating, open now.

Every event list returns this same card, so a card says "Sold out" or "3 spots left" the same way wherever it appears, and no screen asks for attendance or tiers in a second request. `withInlineEventAvailability` in `packages/core/src/eventAvailability.ts` turns the row's `attendance_count` and `ticket_types` into the `attendanceCount` and `ticket_type` a card reads.

The three helpers are for the list functions only. `anon` and `authenticated` cannot call them.

## 4. The lists

| Function | What it lists | Order |
|---|---|---|
| `get_filtered_events` | "All events", the older search, the "See all" of a time row | Soonest, then nearest, then id |
| `get_nearby_events` | Events near a point | Soonest, then id |
| `get_explore_event_sections` | The Explore rows, in one call | Each row its own |
| `get_similar_events` | The same category near an event, without that event | Soonest |
| `get_place_events` | The events at a place | Soonest |
| `get_events_in_window` | The website's "See all" of a time row | Soonest date inside the window |
| `get_filtered_places` | "All places", each place row, "Similar places" | Nearest, then id |
| `get_nearby_places` | Places near a point | Nearest, then id |

A page is at most 1,000 rows. Every list returns one row more than asked when there is a next page.

`get_events_in_window` uses the rule with the window as its dates, so a date that is over is not listed and one still running is. Its window ends are instants.

**Dates first.** When a list has an end date, the rule also reads the two start-time indexes (`idx_event_starts_at_discoverable`, `idx_event_occurrence_starts_at`) for the events with a date that starts by then. That set is only a shortcut, never the rule, and the planner starts from it or from the area, whichever is smaller.

**Open now.** `place_is_open_now` reads opening hours on the place's own clock and costs about 60 microseconds a place, almost all of it the call. `get_filtered_places` sorts the places in range by distance and then asks "open now" of each in order until the page is full, instead of asking every place in range, and asks it with the same rule written into the query (one index lookup, about 5 microseconds). The cards still show `place_is_open_now`; the integration suite checks the two agree for every kind of opening hours. Change both together.

## 5. The Explore rows

`get_explore_event_sections` returns each event once, with `sections` saying which rows it is in and where: `{"aroundYou": 3, "happeningToday": 1}`.

| Row | What is in it |
|---|---|
| `aroundYou` | Events within `p_around_km` (5 km), soonest first |
| `happeningToday` | A date that has not ended starts by `p_today_end`: under way since yesterday counts |
| `happeningThisWeek` | A date that has not ended starts within seven days from now, and the event is not in `happeningToday` |
| `happeningThisMonth` | A date that has not ended starts by `p_month_end`, and the event is in neither row above |
| `topRatedOrganizers` | Events whose organizer has a visible review, best rated first, then most reviews, then soonest |
| `featured` | Events with an active promotion (or the staff-set `featured` flag) and a date still ahead |

The reader's filters apply to every row except `featured`. Paid placement is not a search result.

**The time rows do not repeat each other.** Each leaves out the events the time rows before it show, so a busy area does not show the same cards three times. A row that is full passes the rest of its stretch to the next one. The list behind a row ("See all") is the whole stretch: "this week" there starts with what is on today. A time row asked for by itself (`p_sections`) is whole too.

"Today" and "this month" are the reader's. The caller works them out (`exploreEventSectionArgs` in `packages/core/src/exploreSections.ts`) from the browser's zone on the website and the phone's zone in the app.

`p_sections` asks for some rows only. The "See all" of top-rated organizers asks for that row alone with `p_section_size` 60: it is a ranking, not a feed, so it is one list.

## 6. What the apps send

`packages/core/src/exploreSections.ts` is shared by the website and the app.

| Function | Use |
|---|---|
| `eventFilterDateBounds(start, end, zone)` | Days to instants: the first moment of the first day to the last moment of the last. One day with no end is that day. |
| `eventFilterArgs(filters, zone)` | The filter sheet's values as arguments. A filter that is not set is left out. |
| `exploreEventSectionArgs(...)` | The arguments of the rows function. A chosen distance narrows the area, and "Around you" with it. |
| `exploreSectionWindow(row, zone)` | The stretch of time a time row covers, for the whole list behind it. |
| `splitExploreEventSections(rows)` | The function's rows laid out as rows of cards. |

Nothing is filtered in the browser or on the phone. The predicates that did it (`filterEventList`, `filterPlaceList`, `filterEventsByWindow`) are gone.

**Website.** `EventsTabContent.tsx` calls `getExploreEventSections` and `getQueriedEvents` with the same filters. `PlacesTabContent.tsx` asks `getQueriedPlaces` once per row with the filters added to the row's own question. The "See all" pages are `explore/[type]/page.tsx`.

**App.** `useExploreEventSliders` and `useExplorePlaceSliders` take the filters. `explore/[type].tsx` pages through `useFilteredEvents` with the row's window, or 5 km for "Around you".

## 7. Performance

Timings on the 100,000-event catalogue: [perf/discovery-2026-09.md](perf/discovery-2026-09.md), section "Explore lists". In short: "All events" is about three times faster, the place lists two to eight times, and the Explore rows are one call instead of three.

Two things decide the cost:

- **Every event in range is visited once**, to learn its next date. That is about 3 microseconds an event. It scales with what is on in the area, not with the catalogue.
- **The helper plans each call with the values it was given** (`plan_cache_mode = force_custom_plan`). A plan made for one city and reused for another reads the whole table. Planning costs about a millisecond.

`idx_event_geo_discoverable` leaves archived events out, so the index holds what the lists can show and does not grow with history.

**Rules for new code:**

- Do not write a second "which events are on" rule. Add a parameter to `_explore_event_candidates` and call it.
- Do not build card fields for candidates. Pick the page, then call `_event_cards`.
- Do not anti-join `event_occurrence` to find events with one date. The planner's estimate for an area is far off, and it chose a plan that took 16 seconds on the test catalogue. The helper asks each event for its dates through the index.
- Do not call a function per row of a list when the list may ask every row (`place_is_open_now` at night): write the check into the query.
- A float in a cursor must be rounded to what the API can carry.

## 8. Tests

- `packages/services/src/__integration__/explore-lists.integration.test.ts`: order, filters with one end, whole days, a date under way, several dates, types, cursors through the API, the rows (and that they do not repeat each other), the window list, similar events, a place's events, open now.
- `market-visibility.integration.test.ts`: every list hides a listing whose market is not live.
- `session-rpc-reachability.integration.test.ts`: every list answers a visitor and a signed-in person; the helpers answer neither.
- `packages/core/src/exploreSections.test.ts` and `eventAvailability.test.ts`.
- Old against new: every list was compared with the function it replaces on the test catalogue, row by row and page by page, for every case whose meaning did not change. The script and the old definitions are not kept in the repository; `scripts/perf/discovery-explore-perf.sql` times the lists as installed.

## 9. Limits

- "Top rated" places are the well-rated places nearest to the reader, shown best first. They are not the best-rated places of the whole area.
- "From top-rated organizers" stops at 60 events.
- An event with no start and no dates of its own, but an end in the future, sorts last and cannot be paged past. The apps cannot create one.
- A city with tens of thousands of events on at once pays about 3 microseconds an event for every list without an end date: 75 ms for 21,000 events in range.
- "Happening today" reads every event that started before the end of today and is not archived. That is what is on only while the nightly job archives ended events (decision S8 is about that job).
- "Open now" at night asks every place in range when few are open: about 5 microseconds a place.
- A list with no point (the older search with filters and no text) reads every event that is on.
