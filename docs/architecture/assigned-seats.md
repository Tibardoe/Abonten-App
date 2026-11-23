---
title: Assigned seats
purpose: How an organizer describes a venue's seats once, gives an event's ticket types sections, and how the database gives every issued ticket the best seat left — side by side for an order — with the rules that keep a seat from being given twice.
audience: Engineering, operations and support
scope: seating_plan, seating_section, event_seating, ticket_type.seating_section_id, ticket_seat, the ticket_assign_seat and ticket_release_seat triggers and the section stock guard (migration 20261119220000); the shared seat chooser and event_seating_set, which seats tickets sold before the seating was set (migration 20261124090000); @abonten/core/seating; @abonten/services seating/seatingCore; the website's Manage › Details › Seating card; where the seat is shown.
status: Review required
version: 1.2
lastReviewed: 2026-11-24
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Assigned seats

**State (2026-11-19): built, open to every organizer on the website.** Part 3 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md)); decision Y8 (the founder chose assigned seats rather than a seat map) and Y9. **Since 2026-11-24** the seating can be set after the first sale, until a seat is given, and the tickets already sold get their seats (§1a; approved by the founder on 2026-11-23 after a theatre run sold a ticket before setting up its seats).

## 1. What it does

1. **A seating plan** describes a venue once: sections ("Stalls", "Balcony"), each with its rows front first ("A" to "N", or "1" to "30") and the seats in each row. Plans belong to the organizer (or team) and are reused by every event at that venue.
2. **An event uses a plan**, and each ticket type sells one section (or none). A seated type always has a number of tickets, at most the section's seats; a type with no number, or too many, is set to the section's seats.
3. **When a ticket is issued** — by any path: a paid checkout, a free registration, later complimentary tickets — the database gives it a seat (`ticket_assign_seat`, after insert on `ticket`, one chooser per event at a time):
   - next to a seat its order already holds in that section, if one is free;
   - otherwise the run of free seats for the whole order closest to the middle of the frontmost row that has one;
   - otherwise the best single seat left.
   The seat is written on the ticket (`ticket.seat_number`, "Stalls · C12") and recorded in `ticket_seat`, whose key makes a seat impossible to give twice.
4. **Shows added to a run, and copies, keep the seating**: the plan and each ticket type's section come with the new show (`event_add_show`, since 2026-11-20), each show with its own seats.
5. **A cancelled ticket frees its seat** (`ticket_release_seat`); the label stays on the cancelled ticket as history. **A ticket sent to a friend keeps its seat** (the transfer moves the same ticket).

Issuance is never refused for want of a seat: the section stock guard keeps every seated type's places for sale plus the seats given at or below the section's seats (`ticket_type_section_check`, deferred), and a ticket that still found none is issued unseated for the organizer to place.

## 1a. Seating set after the first sale

An organizer may sell before setting up the seats (on 2026-11-23 a theatre run did; the buyer called because the ticket had no seat number). The seating can be set or changed **until a seat has been given to one of the event's tickets**; after that the locks of §2 hold as before. Saving it (`event_seating_set`, service role only, one transaction):

1. holds the event, its ticket types, its tickets that keep a place and its seat chooser, taken without waiting and tried again for up to about 3 seconds, so a sale, a refund or a move in flight is never caught in a deadlock (a ticket being issued either commits first and is seated here, or waits and is seated at issue; a move to another venue waits and then sees the seating, which it refuses). If tickets keep being bought the save is refused with "Tickets are being bought for this event right now. Try again in a moment.";
2. refuses when a seat is already given, when the tickets sold or held (active or checked-in tickets, plus places being bought or paid for with Pay small small) for a section are more than its seats, or when the types selling one section would sell more places than it has;
3. sets the plan and each type's section; a seated type with no number of tickets, or too many, sells what its section has left after what the type already holds (before any sale: all the section's seats, as before);
4. gives every ticket already issued for a now-seated type that keeps its place (active or checked in) a seat with the same chooser as at issue (`_ticket_seat_give`, which `ticket_assign_seat` calls too), **earliest purchase first**, so earlier buyers get the better seats and an order sits side by side when a row has room. A cancelled ticket takes none (an order's cancelled tickets are counted out of the run it looks for). A ticket sent to a friend is seated where it is now; complimentary tickets and tickets chosen with a pass are seated like any other;
5. tells each holder once: one in-app notice per person (`ticket_seat_assigned`, "Your seat for Fame In Flames — Fri 27 Nov, 7:30 pm: Stalls · C12. It's on your ticket."), pushed through the delivery queue (`trg_notification_queue_app_push`) and worded in the holder's language (`user_info.locale`; the inbox in the reader's). No email.

The website's Seating card says how many sold tickets will be seated before saving ("12 tickets are already sold. When you save, they get the best seats left, in the order they were bought, and each buyer is told their seat.") and how many were after. Each show of a run is its own event: seating one show changes no other, and a show added later copies the seating of the show it is added from (`event_add_show`, unchanged); the card says so on a show of a run.

## 2. Rules

| Rule | Where |
|---|---|
| Up to 20 sections, 100 rows each, 1–200 seats per row, unique labels | `@abonten/core/seating`, trigger `seating_section_rows_check` |
| A seated type's section is in the event's plan; it has a number of tickets; a section never sells more than its seats | `ticket_type_section_check` (deferred) |
| An event's seating changes only until a seat is given to one of its tickets; the tickets sold or held for a section must fit in it | `event_seating_set` (since 2026-11-24; before, the first confirmed ticket) |
| A plan's sections change only while none of its seats is given (renaming always works) | `saveSeatingPlanCore` |
| Clients read and write none of the seating tables | grants, RLS; everything through `@abonten/services/seating` |

## 3. Where the seat shows

The ticket on the website (My Tickets) and in the app (it already showed `seat_number`), the organizer's attendee list on both. The door scanner shows the ticket's details as before. A seat given after the sale (§1a) shows the same way; a ticket PDF emailed before it does not carry it.

## 4. Code map

| Piece | Where |
|---|---|
| Rules and words | `packages/core/src/seating.ts` |
| Database | `ticket_assign_seat` → `_ticket_seat_give` (the chooser); `event_seating_set` (the seating change and the seats for tickets already sold); notice `ticket_seat_assigned` (`@abonten/core/notifications/notices`) |
| Service | `packages/services/src/seating/seatingCore.ts` (`getEventSeatingCore`, `saveSeatingPlanCore`, `setEventSeatingCore`) |
| Website | `actions/getEventSeating.ts`, `saveSeatingPlan.ts`, `setEventSeating.ts`; Manage › Details › `ManageEventSeatingCard` |
| Tests | `packages/services/src/__integration__/assigned-seats.integration.test.ts`, `seat-sold-tickets.integration.test.ts` |

Setting up seating is on the website only for now; the app shows seats on tickets and the attendee list.

## 5. Support

- "My ticket has no seat number": the organizer sold it before setting up the seats. Ask them to set the event's seating on the website (Manage › Details › Seating): the tickets already sold get the best seats left, in the order they were bought, and each holder is told their seat. This works until a seat has been given; if the event already has seats given, a ticket without one was issued when its section was full, and the organizer places that person at the door.
- "The organizer can't save the seating": the message says why — seats already given (it no longer changes), more tickets sold for a section than it has seats (choose a bigger section), or tickets being bought at that moment (try again a moment later).
- "We are a group but got seats apart": an order sits together when a row has room for all of it at the time of issue (or of the late seating); otherwise the best seats left are given one by one.
- "Change my seat": not yet; cancel and buy again while seats remain, or the organizer places people at the door.
- "The organizer wants a different layout after selling": it can change until seats are given; after that sections lock, so make a new plan for later events.
- "A run of shows: we set seating on one show": each show is its own event; set it on each show that sold before its seating. Shows added later copy the seating of the show they are added from.
