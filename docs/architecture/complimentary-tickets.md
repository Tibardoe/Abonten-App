---
title: Complimentary tickets
purpose: How an organizer gives free tickets to named people (cast, press, sponsors, family) — real tickets taken from the seats, with no money moved — and the rules that keep them apart from sales.
audience: Engineering, operations and support
scope: ticket_checkout.complimentary_by / complimentary_note, issue_complimentary_tickets (migration 20261120090000); @abonten/services comps/complimentaryCore; the website's Manage › Attendees card, the app's Give free tickets screen, POST /api/mobile/organizer/events/:id/complimentary; the complimentary_tickets notice; where a given ticket is marked.
status: Review required
version: 1.0
lastReviewed: 2026-11-20
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Complimentary tickets

**State (2026-11-20): built, open to every organizer on the website and in the app.** Part 5 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md)); decision Y11. Importing guest lists from other sellers is a separate piece (Part 5 of the Tickets, entry and teams plan) and is not built.

## 1. What it does

1. On a published event that is not over, the organizer (or a team member who manages events) picks a ticket type, how many, the person (an Abonten username or a phone number that belongs to an account), the date for an event with several dates, and an optional note only the team sees.
2. The person gets real tickets of that type on their account, with their own codes and QR codes, and a notice ("Ama gave you 2 tickets") with a push.
3. The tickets come out of the type's stock and go through the event's capacity rule like sold ones, are seated when the type sells a section ([assigned-seats.md](assigned-seats.md)), are checked in at the door, and can be sent to a friend like any ticket.
4. No money moves: there is no payment, no organizer earning, no Abonten fee, and nothing to refund. The door list marks each one "Free ticket".

A Couple-style type counts in purchases: "1" of a type that admits two gives two tickets. One gift is at most 40 tickets.

## 2. How it is stored

| Piece | What |
|---|---|
| `ticket_checkout` row | status `paid`, `unit_price`, `discount` and `total_price` all 0 (so sales and discount figures do not move), `complimentary_by` = the person who gave them, `complimentary_note` |
| `ticket` rows | owner = the recipient, `transaction_id` null, `metadata` `{"complimentary": true}` |
| `attendance` rows | one per ticket, `attending` (the capacity rule runs on these) |
| `notification` | type `complimentary_tickets`, notice `complimentary_tickets` in the recipient's language |

`issue_complimentary_tickets()` writes all of it in one transaction and is executable by the service role only. It re-checks that the event is published and not over, that the type belongs to it, that the count is a whole number of purchases, that the date is still to come, and takes the stock (`Only N of these tickets are left.` otherwise). The row is inserted already `paid`, so the reward triggers (which fire on a change of status) never treat a gift as a purchase.

## 3. Who can give them

`giveComplimentaryTicketsCore` reads the event with the caller's own client filtered on the acting account (the person, or the team they act for with `events.manage`), so only the organizer's side can give tickets. A restricted account cannot. The recipient must be an open account (not deleted); a phone number is matched with `ticket_transfer_user_by_phone`.

## 4. Code map

| Piece | Where |
|---|---|
| Database | `supabase/migrations/20261120090000_complimentary_tickets.sql` |
| Service | `packages/services/src/comps/complimentaryCore.ts` |
| Input | `packages/validation/src/complimentarySchemas.ts` |
| Website | `actions/giveComplimentaryTickets.ts`; Manage › Attendees › `GiveComplimentaryCard` |
| App | `app/(app)/organizer/events/[eventId]/comps.tsx` (menu row "Give free tickets") via `api.organizer.giveComplimentaryTickets` |
| Mark on the door list | `@abonten/core/complimentary` (`isComplimentary`) |
| Tests | `packages/services/src/__integration__/complimentary-tickets.integration.test.ts` |

## 5. Numbers

The event's ticket count includes given tickets (they take seats); gross sales, discounts, earnings and fees do not. A report that needs gifts apart reads `ticket_checkout.complimentary_by is not null`.

## 6. Support

- "I gave tickets to the wrong person": the recipient can send them on ([ticket-transfers.md](ticket-transfers.md)) or cancel them from their tickets like a free registration, which gives the seats back. The organizer cannot take back a single given ticket yet; cancelling the event cancels given tickets with the rest (nothing to refund).
- "My guest has no account": they sign up first (a phone number must belong to an account).
- A given ticket is never refunded: there was no payment.
