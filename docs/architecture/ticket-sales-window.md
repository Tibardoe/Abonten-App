---
title: When tickets are on sale (the sales window) and same-day sales
purpose: The one rule for whether a session of an event can be sold now, the organizer's choice to keep selling while it's on, every place that enforces the rule, and what deliberately does not change.
audience: Engineering, operations and support
scope: event.sales_close_before_end_minutes and public.event_session_sales_close_at (migration 20261123090000_same_day_sales); @abonten/core/eventPurchaseEligibility; create_ticket_checkout, issue_free_ticket, ticket_pass_claim, ticket_pass_state; @abonten/services validateCheckoutCore, registerForFreeEventCore, ticketPlanCore, postEventCore, updateEventCore, eventShowsCore; the website and app event pages, buy screens and event forms.
status: Review required
version: 1.0
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# When tickets are on sale (the sales window) and same-day sales

**State (2026-11-23): built, open to every organizer; the default is unchanged for every event.** The founder's decision of 23 November 2026: an amusement park open 11:00–19:00 with a daily entry could not sell today's entry online once it opened, while families decide on the day.

## 1. The rule

A ticket is sold for a **session**: one date of an event with several dates (`event_occurrence`), or the event itself for a single-date event. Each show of a run is its own event, so its own session.

A session is on sale while `now < sales close`, where *sales close* is:

| `event.sales_close_before_end_minutes` | Sales close | Shown to the organizer as |
|---|---|---|
| `null` (the default, every event before 2026-11-23) | at the session's start | "When it starts" |
| `0` | at the session's end | "When it ends" |
| `30`, `60`, `120` | that many minutes before the end, never before the start | "30 minutes / 1 hour / 2 hours before it ends" |

The column has a CHECK for exactly these values. The rule exists twice and the two must change together:

- **TypeScript**: `@abonten/core/eventPurchaseEligibility` — `sessionSalesCloseAt`, `isSessionOnSale`, and `resolveOccurrenceState(starts, ends, occurrences, { now, salesCloseBeforeEndMinutes })`, which returns `nextPurchasable` (a session on now that still sells comes before the next one to come), `salesCloseAt`, `onNow` and the `blockReason` (`ended`, `ongoing_no_future` = something is on but nothing sells, `no_dates`). `validatePurchaseOccurrence` checks a chosen date the same way. Called with a plain number for the clock it applies the default rule.
- **SQL**: `public.event_session_sales_close_at(starts_at, ends_at, minutes)` (immutable, executable by everyone: it reads nothing).

## 2. Where it is enforced

| Path | Code | What it checks |
|---|---|---|
| Paid checkout | `validateCheckoutCore` → `create_ticket_checkout` | the event has a session on sale; a chosen date is on sale |
| Free registration | `registerForFreeEventCore` → `issue_free_ticket` | the same |
| A pass choosing a show | `claimShowPassCore` → `ticket_pass_claim`; `ticket_pass_state` reports `started` = no longer on sale | the chosen show is on sale |
| New shows of a run, copies | `addEventShowsCore` copies the setting after `event_add_show` | — |
| Create / edit | `postEventCore` (written after `create_event`, like the refund policy), `updateEventCore` (omitted = kept, so older app builds don't reset it); web actions `postEvent` / `updateEvent`, `POST /api/mobile/events`, `PATCH /api/mobile/organizer/events/:id` | a value off the list is a 400 |
| Screens | web `EventDateSelector`, `AttendingButton`, `EventStatusBanner`; app `event/[id]`, `buy/[eventId]`, `useFreeRsvpFlow` | which dates can be picked, the "On now — tickets on sale until 18:00" line (the event's own clock, `salesCloseClock`) |

The payment attempt (`createMultiCheckoutPaymentAttemptCore`, `chargeInit`) and the basket (`getUserPendingTicketCheckoutsCore`) do not check the time: a checkout opened before the cut-off keeps its 30-minute hold and can be paid, exactly as a checkout opened just before a start always could.

## 3. What does not change

- **Refunds.** No buyer cancels a ticket once its show has started (`buyerCancelGate`), whatever the refund policy, so a ticket bought during the session can't be cancelled by the buyer.
- **Pay small small** uses the default rule on purpose (`ticketPlanCore`): a plan needs 48 hours before its date, so it is never offered for a session that is on.
- **Postponed events** sell nothing (`create_ticket_checkout` and `issue_free_ticket` refuse them first).
- **Complimentary tickets** were already allowed until the event ends.
- **Capacity, seats, ticket-type windows.** Unchanged; `ticket_type.available_from` / `available_until` still apply on top.
- **The ticket**: its `expires_at` is still the event's end, check-in (`checkInTicketCore`) admits it as any other, and the money settles 48 hours after the end.

## 4. Support

- *"I can't buy today's ticket"*: the event's setting is the default (sales close at the start), or the cut-off has passed. The organizer changes it under **Edit** › *Online ticket sales close*.
- Help pages (five languages): `apps/web/src/content/help/organizers/selling-tickets-and-promo-codes.md` › *When online sales close* (organizers), `apps/web/src/content/help/customers/tickets-and-checkout.md` (buyers).
