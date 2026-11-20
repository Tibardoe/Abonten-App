---
title: Moving an event to a new date
purpose: How an organizer moves an event that already has tickets to a new date, how every holder is told, and how a holder keeps their ticket or gives it back for the ticket price and the service fee.
audience: Engineering, operations and support
scope: event_reschedule, event_reschedule_choice, ticket.refund_includes_fee, transaction_refund.fee_amount, event_reschedule(), get_event_reschedule(), _refund_fee_share(), refund_quote_amount_with_fee(), the replaced refund_prepare() and _refund_fee_adjustment(), the event_rescheduled push (migration 20261120170000); @abonten/core/eventReschedule; @abonten/services events/eventRescheduleCore and the afterReschedule option of tickets/cancelEventTicketsCore; the website's Manage › Details card, ticket card notice and email; the app's Move to a new date screen and ticket notice; the app's reminders following a moved event.
status: Review required
version: 1.0
lastReviewed: 2026-11-20
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Moving an event to a new date

**State (2026-11-20): built and open to every organizer.** Asked for by the founder ("build reschedule with your suggested defaults"); decisions RS1–RS4 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md), legal item E11 in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md).

Before this, an event's dates locked at its first confirmed ticket and the only way out was cancelling it (everyone refunded, the service fee kept) and making a new one.

## 1. What it does

1. **The organizer moves the event** (website Manage › Details › Move to a new date, shown once people hold tickets; app event menu › Move to a new date): a new date, a start and an end time on the venue's clock, and a message to ticket holders (required, up to 1,000 characters). The form says how many people hold tickets and until when they may get a refund.
2. **Every holder is told at once**: one in-app notice per person holding a live ticket or a running Pay small small plan, pushed as urgent (`event_rescheduled`, through the delivery queue), and an email with the old and new dates and the organizer's message (sent after the response, in each reader's language, dates on the event's clock).
3. **Each holder chooses** (website ticket card, app ticket screen):
   - **Keep my ticket**: nothing changes; the same ticket, code, QR and seat are valid for the new date. Doing nothing keeps it too. Keeping is not final while the window is open.
   - **Get a refund**: every ticket they hold for the event and paid for themselves is given back for the **ticket price and its share of the service fee**, whatever the event's refund policy says; free tickets are given back (their place returns). A ticket someone else paid for stays (its refund is the payer's), as everywhere.
4. **The refund window**: 7 days from the move, and no later than 48 hours before the new date; never less than a day (nor past the new start) when the new date is close. After it, the tickets stay valid for the new date and the event's own refund policy applies again.

## 2. Rules

| Rule | Where |
|---|---|
| A published, single-date event that has not started; not an event with several dates (`event_occurrence`) | `event_reschedule()`, `getRescheduleSetupCore` |
| The new start at least 2 hours ahead, an end after it, something actually changing, a message of 1–1,000 characters | `event_reschedule()`, `@abonten/core/eventReschedule` `rescheduleProblem` |
| At most two moves per event (a third: cancel instead) | `event_reschedule()`, `MAX_RESCHEDULES` |
| A show of a run cannot land on another show's time | `event_reschedule()` (the run's own rule) |
| Only the organizer side (or a team member with `events.manage`) moves it | the transports' `actingFor` / `mobileActingFor` + `rescheduleEventCore` reading the event with the caller's client |
| Everything moves with it: `event.starts_at` / `ends_at`, every live ticket's `expires_at`, running Pay small small plans (`event_starts_at`, `deadline_at`, their held seats' expiry, the same distance before the date) | `event_reschedule()` |
| What follows the date on its own: check-in windows, server reminders (`event_reminders_enqueue` reads the live date), payouts (`is_event_settled`, 48 hours after the new end), the refund policy's cutoff | unchanged code |
| The app's own reminders re-arm on the next foreground (the live start is read for every stored reminder) | `useRemindersSync`, `reconcileEventReminder` |
| All reschedule tables and `event_reschedule()` are service role only; `get_event_reschedule()` (the latest move of a public event) is readable by anyone | grants |

## 3. The money

A refund after a move goes through the normal per-ticket path (`cancelEventTicketsCore` → `issueRefundCore` → `refund_prepare`), with two differences:

- the event's refund policy is not checked (`buyerCancelGate` is skipped);
- the cancelled tickets carry `ticket.refund_includes_fee = true`, and `refund_prepare` adds their share of the payment's service fee: `service_fee × their ticket revenue ÷ the payment's ticket revenue` (`_refund_fee_share`, rounded in the currency, never more than the fee not yet given back, never more than the charge has left). The refund row records the fee part in `transaction_refund.fee_amount`; once the provider confirms, the fee audit row (`_refund_fee_adjustment`) records `service_fee = −fee_amount` and `net_revenue = −fee_amount` (Abonten's fee revenue goes down; Paystack's processing charge is not returned and stays Abonten's cost).

Because the flag sits on the ticket, a refund that fails and is retried later (Retry refund, the retry sweep) still includes the fee. The organizer's share is held and reversed exactly as for any refund (`_refund_hold`).

Payments partly in Abonten Credit and Pay small small purchases are refunded as a whole by their own path, which keeps the fee; a holder with such a payment gets the ticket price back. Both are switched off in production today.

## 4. Code map

| Piece | Where |
|---|---|
| Database | `supabase/migrations/20261120170000_event_reschedule.sql` |
| Rules | `packages/core/src/eventReschedule.ts` |
| Services | `packages/services/src/events/eventRescheduleCore.ts` (`getRescheduleSetupCore`, `rescheduleEventCore`, `getEventRescheduleForHolderCore`, `keepTicketsAfterRescheduleCore`, `refundAfterRescheduleCore`, `rescheduleEmailBatchCore`); `tickets/cancelEventTicketsCore.ts` (`afterReschedule`) |
| Website | actions `rescheduleEvent`, `getRescheduleSetup`, `getEventReschedule`, `keepTicketsAfterReschedule`, `refundAfterReschedule`, `eventRescheduleNotification` (email); `ManageEventRescheduleCard`; `RescheduleNotice` on the My Tickets card; `EventRescheduledEmailTemplate` |
| App | `GET`/`POST /api/mobile/organizer/events/:id/reschedule`; `GET /api/mobile/events/:id/reschedule`, `POST …/keep`, `POST …/refund`; `organizer/events/[eventId]/reschedule.tsx`; `features/reschedule/RescheduleNotice` on the ticket screen |
| Notice | `core` `notices.event_rescheduled`; push trigger `trg_notification_queue_app_push` (urgent) |
| Tests | `packages/core/src/eventReschedule.test.ts`, `packages/services/src/__integration__/event-reschedule.integration.test.ts` |

## 5. Not in this version

- Moving one date of an event with several dates, and moving the venue (the venue stays; a new venue needs a cancelled event and a new listing).
- "Postponed, new date to come" (an event with no date).
- Text messages to holders (RS3).
- A full refund including the fee for payments with Abonten Credit or Pay small small.

## 6. Support

- "The event moved and I can't go": open the ticket (website My Events, app Tickets) and choose Get a refund before the date shown; the ticket price and the service fee come back to the card or mobile money used.
- "I missed the refund window": the ticket is valid for the new date; the event's own refund policy applies (it may allow no refunds).
- "I chose Keep but changed my mind": while the window is open, Get a refund is still there.
- "I was sent this ticket": the refund belongs to the person who paid; they can't refund a ticket they gave away, so send it back to them first.
- "Can the organizer move it again?": once more at most; after two moves, a further change means cancelling (everyone refunded).
