---
title: Ticket notes and special dates in opening hours
purpose: How a ticket type carries a short note of what it includes, why the note stays editable after the first sale, and how a place's holidays and other special dates replace its weekly hours for the place page and for "open now".
audience: Engineering, operations and support
scope: ticket_type.description and the place_special_hours table (migration 20261123091000); create_event and event_add_show (the note); place_is_open_now, _place_open_now, get_filtered_places and get_explore_place_sections (open now); @abonten/core ticketTypeNote, plainNote, placeSpecialHours and computePlaceOpenStatus; @abonten/services events/updateTicketTypeNotesCore and places/placeSpecialHoursCore; the web actions updateTicketTypeNotes, addPlaceSpecialHours and removePlaceSpecialHours and their /api/mobile twins; the ticket editors, checkout and place screens on the website and in the app.
status: Review required
version: 1.1
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Ticket notes and special dates in opening hours

**State (2026-11-23): built and tested, not behind a switch.** The founder's decision of 23 November 2026, for venues such as an amusement park: a ticket says what it includes, and a place can be closed (or keep other hours) on a holiday. PROJECT.md §90.

## 1. What a ticket type includes

`ticket_type.description` is an optional note shown under the ticket's name: "Kids: ages 3–12", "Entry + 50 ride credits", "Family day".

| Rule | Where |
|---|---|
| Plain text, one line, at most 140 characters (counted as Postgres counts them: an emoji is one), no links (`://` or `www.`) | `@abonten/core/ticketTypeNote` (on `plainNote`), and the CHECK `ticket_type_description_check`. Change the two together. |
| Spaces folded and ends trimmed before saving; an empty note is no note | `normalizeTicketTypeNote` |
| Named ticket types only (the multiple-types editor). The free tier and the single paid tier carry none | the editors |

**Who writes it.** The event's organizer (a person, or a team member with `events.manage`), always with their own session: the organizer rules on `ticket_type` decide. `create_event` takes it from each ticket type it is given (`description` in `p_ticket_types`), the full ticket editor (`updateEventTicketTypesCore`) writes it with the rest before the first sale, and `updateTicketTypeNotesCore` changes notes alone at any time. Before the first sale each listed type's note is edited in place in that editor, on the website (`TicketInputs`, the event form and Manage › Details, since 2026-11-23) as in the app, and saved with "Save ticket types"; there is no need to remove a type and add it again.

**Editable after the first sale.** The full ticket editor locks once the event has a confirmed ticket, because price and stock carry money. A note carries none, so the notes-only path stays open: the website's Details tab shows "What each ticket includes" when the editor is locked, the app's Edit event screen the same. It writes only `description`, only for the event's own ticket types, only the notes that changed. No `guard_*` trigger stands in the way: the ticket_type triggers fire on the money and stock columns only.

**Copied.** `event_add_show` copies the note to a run's new show and to a copy of the listing (both changed at a named anchor in the migration, so another branch's change to those functions is kept). Moving an event to a team and joining runs move events, not ticket types, so the note stays with them. Drafts keep it on both platforms.

**Wording an open amount.** For a ticket whose amount the buyer chooses ([open-amount-tickets.md](open-amount-tickets.md)), the note says what the amount buys ("Loaded on your card at the gate", "Deposit, taken off your bill"); the door shows it beside the amount paid.

**Shown.** Under the ticket's name in the event page's ticket picker and checkout (website `CheckoutTicketRow`, `TicketCheckoutSessionCard`; app buy screen and pending checkouts) and in the organizer's lists (website ticket editor and Insights › Ticket types; app event overview and the passes on Shows).

## 2. Special dates in a place's opening hours

`place_special_hours` holds one row per place and date of the place's own calendar (`place.timezone`): `special_date`, `is_closed`, `open_time`, `close_time`, an optional `label` ("Christmas Day", at most 60 characters, plain text, no links, the same rule as a ticket note). Unique on `(place_id, special_date)`; adding a date that has one replaces it.

**The rule.** A special date replaces that date's weekday hours, and only that date's. An open special date may run past midnight like weekly hours (a closing time not later than the opening time; equal is all day). Yesterday's hours that run past midnight still count after midnight, whichever kind they are: a bar open 18:00 to 02:00 on 24 December is still open at 01:00 on a closed Christmas Day, and a closed 24 December stops that night's late hours.

**Protected like the weekly hours.** Row level security: everyone reads the rows of a published place; the place's owner (a person, or a team acting with `places.manage`, through `acting_accounts`) inserts, updates and deletes; staff roles that read the weekly hours (`bookings.manage`, `visit.show`) read these. `anon` has `select` only. `guard_restricted_account` refuses a restricted account's writes. Place deletion cascades.

**Written through** `@abonten/services/places/placeSpecialHoursCore` with the owner's own client: the web actions `addPlaceSpecialHours` / `removePlaceSpecialHours`, and `POST /api/mobile/organizer/places/:placeId/special-hours`, `DELETE …/special-hours/:id`. The service refuses a date before the place's today, one more than a year ahead, an open day without both times, and more than 60 upcoming dates (`@abonten/core/placeSpecialHours`).

**Past dates.** No read asks for a date before yesterday, so past rows are harmless. The service removes a place's rows older than yesterday whenever its owner adds a date; no job is needed.

**Shown.** The owner edits them on the website (Manage › Hours & Status › Special dates) and in the app (Edit place). The public place page lists the special dates of the next 30 days in the opening-hours block, today marked, and uses them for its "Open now / Closed" label; the app's place screen the same. Favourite and profile place lists pass them to `isPlaceOpenNow` too.

## 3. "Open now"

Four copies of the rule live in SQL and one in TypeScript; all read the special dates of today and yesterday first, then the weekly rows of the dates that have none:

| Copy | Used by |
|---|---|
| `place_is_open_now(place, now)` | Every card (`_place_cards`), search, featured places, Abonten Weekly |
| `_place_open_now(place, zone, status)` | The reader's "open now" filter on the Explore place rows |
| Written into `get_filtered_places` | "All places" with "open now" |
| Written into `get_explore_place_sections` | The "Open now" Explore row |
| `@abonten/core/computePlaceOpenStatus` / `isPlaceOpenNow` | Place pages, favourites, profile place lists |

The list copies are written into the query on purpose (one lookup a place, never a function call a place: [explore-lists.md](explore-lists.md) §4). `explore-lists.integration.test.ts` checks all five agree for every kind of hours, special dates included; change them together. `place_is_open_now` sets `plan_cache_mode = auto` for itself: it runs once a card inside list functions that force custom plans, and its lookups by one place id are best served by a plan made once a session. Timings: `scripts/perf/discovery-explore-perf.sql` (its seed adds special dates for one place in twenty).

## 4. Tests

- `packages/core/src/placeSpecialHours.test.ts`, `ticketTypeNote.test.ts`: the rule (a special date over its weekday, closed all day, past midnight, the place's zone), the input checks.
- `packages/services/src/__integration__/ticket-notes-holiday-hours.integration.test.ts`: notes saved by create_event, refused with a link (service and CHECK), editable after a sale while the editor is locked, not by someone else, copied by event_add_show; special dates written by the owner only, public for a published place only, used by `place_is_open_now`.
- `explore-lists.integration.test.ts`: the five copies of "open now" agree, special dates included.
