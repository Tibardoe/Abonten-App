---
title: Assigned seats
purpose: How an organizer describes a venue's seats once, gives an event's ticket types sections, and how the database gives every issued ticket the best seat left — side by side for an order — with the rules that keep a seat from being given twice.
audience: Engineering, operations and support
scope: seating_plan, seating_section, event_seating, ticket_type.seating_section_id, ticket_seat, the ticket_assign_seat and ticket_release_seat triggers and the section stock guard (migration 20261119220000); @abonten/core/seating; @abonten/services seating/seatingCore; the website's Manage › Details › Seating card; where the seat is shown.
status: Review required
version: 1.1
lastReviewed: 2026-11-20
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Assigned seats

**State (2026-11-19): built, open to every organizer on the website.** Part 3 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md)); decision Y8 (the founder chose assigned seats rather than a seat map) and Y9.

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

## 2. Rules

| Rule | Where |
|---|---|
| Up to 20 sections, 100 rows each, 1–200 seats per row, unique labels | `@abonten/core/seating`, trigger `seating_section_rows_check` |
| A seated type's section is in the event's plan; it has a number of tickets; a section never sells more than its seats | `ticket_type_section_check` (deferred) |
| An event's seating changes only before its first confirmed ticket | `setEventSeatingCore` |
| A plan's sections change only while none of its seats is given (renaming always works) | `saveSeatingPlanCore` |
| Clients read and write none of the seating tables | grants, RLS; everything through `@abonten/services/seating` |

## 3. Where the seat shows

The ticket on the website (My Tickets) and in the app (it already showed `seat_number`), the organizer's attendee list on both. The door scanner shows the ticket's details as before.

## 4. Code map

| Piece | Where |
|---|---|
| Rules and words | `packages/core/src/seating.ts` |
| Service | `packages/services/src/seating/seatingCore.ts` (`getEventSeatingCore`, `saveSeatingPlanCore`, `setEventSeatingCore`) |
| Website | `actions/getEventSeating.ts`, `saveSeatingPlan.ts`, `setEventSeating.ts`; Manage › Details › `ManageEventSeatingCard` |
| Tests | `packages/services/src/__integration__/assigned-seats.integration.test.ts` |

Setting up seating is on the website only for now; the app shows seats on tickets and the attendee list.

## 5. Support

- "We are a group but got seats apart": an order sits together when a row has room for all of it at the time of issue; otherwise the best seats left are given one by one.
- "Change my seat": not yet; cancel and buy again while seats remain, or the organizer places people at the door.
- "The organizer wants a different layout after selling": sections lock once seats are given; make a new plan for later events.
