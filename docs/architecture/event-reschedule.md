---
title: Moving or postponing an event
purpose: How an organizer moves an event that already has tickets to a new date, a new venue or both, moves one date of an event with several dates, or postpones it with no new date yet; how every holder is told; and how a holder keeps their ticket or gives it back for the ticket price and the service fee.
audience: Engineering, operations and support
scope: event_reschedule, event_reschedule_choice, event.postponed_at, ticket.refund_includes_fee, transaction_refund.fee_amount, event_reschedule(), get_event_reschedule(), _refund_fee_share(), refund_quote_amount_with_fee(), the replaced refund_prepare() and _refund_fee_adjustment(), the event_rescheduled push (migrations 20261120170000 and 20261120210000), the postponement guards in the selling, listing, reminder, settlement and retirement functions, the text outbox event_reschedule_text and the reschedule-texts job (migration 20261120220000); @abonten/core/eventReschedule; @abonten/services events/eventRescheduleCore, events/rescheduleTextsCore, events/resolveEventVenue and the afterReschedule / occurrenceId options of tickets/cancelEventTicketsCore; the website's Manage › Details card, ticket card notice, event page and email; the app's Move or postpone screen, ticket notice and event screen; the app's reminders following a moved event.
status: Review required
version: 1.2
lastReviewed: 2026-11-20
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Moving or postponing an event

**State (2026-11-20): built and open to every organizer.** Asked for by the founder ("build reschedule with your suggested defaults", then "do all of Not in this version"); decisions RS1–RS8 (RS3 changed: texts) in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md), legal item E11 in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md).

Before this, an event's date and venue locked at its first confirmed ticket and the only way out was cancelling it (everyone refunded, the service fee kept) and making a new one.

## 1. What it does

1. **The organizer moves or postpones the event** (website Manage › Details › Move or postpone, shown once people hold tickets; app event menu). With a message to ticket holders (required, up to 1,000 characters), one of:
   - **a new date** (a start and an end time on the venue's clock), and, ticking "The venue changes too", a new venue as well;
   - **a new venue** in the same country: an Abonten place or an address picked from the suggestions or the map (its country and time zone come from its point, on the server);
   - **one date** of an event with several dates (`event_occurrence`): only the people holding that date are told;
   - **postponed, new date to come**: the event keeps its old date but sells nothing, leaves the lists and waits; the organizer later sets the new date (an ordinary move, which lifts the postponement).
   The form says how many people hold tickets and until when they may get a refund.
2. **Every holder is told at once**: one in-app notice per person holding a live ticket or a running Pay small small plan (for one date: that date's), pushed as urgent (notification type `event_rescheduled`; the notice says which: `event_rescheduled` a new date, `event_moved_venue` a new date and venue, `event_venue_changed` a new venue, `event_date_moved` one date, `event_postponed`), an email saying the same with the organizer's message (sent after the response, in each reader's language, dates on the event's clock), and a short text to everyone with a verified phone in a market whose text rail is Hubtel (section 4a).
3. **Each holder chooses** (website ticket card, app ticket screen):
   - **Keep my ticket**: nothing changes; the same ticket, code, QR and seat are valid for the new date or venue. Doing nothing keeps it too. Keeping is not final while the window is open.
   - **Get a refund**: every ticket they hold for the event (after a one-date move: for that date) and paid for themselves is given back for the **ticket price and its share of the service fee**, whatever the event's refund policy says; free tickets are given back (their place returns). A ticket someone else paid for stays (its refund is the payer's), as everywhere.
4. **The refund window**: 7 days from the move, and no later than 48 hours before the (new) date; never less than a day (nor past the start) when the date is close. **While postponed, the window has no end**: holders may give tickets back until the new date is set, when the usual 7-day window opens. After the window, tickets stay valid and the event's own refund policy applies again.

## 2. Rules

| Rule | Where |
|---|---|
| A published event that has not started (a postponed one may be moved whatever its old date) | `event_reschedule()`, `getRescheduleSetupCore` |
| A new date: start at least 2 hours ahead, an end after it; something must change (date, time or venue); a message of 1–1,000 characters | `event_reschedule()`, `@abonten/core/eventReschedule` `rescheduleProblem` / `rescheduleMessageProblem` |
| A new venue: a published, visible place or an address whose point is in the event's country; another country is refused (its currency and payment provider would change: create a new event there) | `resolveEventVenue` (service), `event_reschedule()` (again) |
| **A seated event never changes venue** (its seats belong to the hall); a venue within 100 m, or the same place, is not a change | `event_reschedule()`, setup `seated` |
| An event with several dates moves **one date at a time**; a new venue is for every date (no date chosen) and nothing can be postponed | `event_reschedule()` |
| At most two moves per event, and per date of an event with several dates (a third: cancel instead) | `event_reschedule()`, `MAX_RESCHEDULES` |
| Postponing: single-date events only, once per event (`MAX_POSTPONEMENTS`), and does not count as a move; setting the new date afterwards does | `event_reschedule()` |
| A show of a run cannot land on another show's time at the same venue | `event_reschedule()` (the run's own rule) |
| Only the organizer side (or a team member with `events.manage`) moves it | the transports' `actingFor` / `mobileActingFor` + `rescheduleEventCore` reading the event with the caller's client |
| Everything moves with it: `event.starts_at` / `ends_at` (one date: that `event_occurrence`), every live ticket's `expires_at` (one date: the event's last end), running Pay small small plans (`event_starts_at`, `deadline_at`, their held seats' expiry, the same distance before the date; one date: that date's plans); a new venue: `event.location`, `address`, `place_id` and `timezone` | `event_reschedule()` |
| What follows the date on its own: check-in windows, server reminders (`event_reminders_enqueue` reads the live date), payouts (`is_event_settled`, 48 hours after the new end), the refund policy's cutoff | unchanged code |
| The app's own reminders re-arm on the next foreground (the live start is read for every stored reminder) | `useRemindersSync`, `reconcileEventReminder` |
| All reschedule tables and `event_reschedule()` are service role only; `get_event_reschedule()` (the latest move of a public event, with its kind) is readable by anyone; clients cannot set or lift `event.postponed_at` (`guard_event_postponed_column`) | grants, trigger |

## 3. While an event is postponed

`event.postponed_at` is set; the old dates stay. Everything that would treat the passing of the old date as the end waits:

| What | How |
|---|---|
| No sales, free registrations or pass choices | `create_ticket_checkout`, `issue_free_ticket` ("This event is postponed. Tickets go on sale again when it has a new date."), `ticket_pass_claim` |
| Not in Explore, any event list or search | `_explore_event_candidates`, `_search_event_pool` |
| No day-before reminder | `event_reminders_enqueue` |
| No entry | `checkInTicketCore` |
| Its money is not settled, no payout | `is_event_settled` (false), `_event_settles_at` (infinity) |
| Not retired | `retire_ended_events` |
| Pay small small plans do not lapse | the plan sweep (`ticketPlanMaintenanceCore`, `ticket_plan_work_due`) skips them; the new date moves their deadline |
| Tickets stay in "upcoming", the event page says "Postponed" | website My Events, app Tickets, event pages (`postponed_at`), show pickers (`get_event_shows.postponed`) |

## 4a. Text messages

| Step | How |
|---|---|
| Queue | Right after the move, `rescheduleEventCore` calls `event_reschedule_queue_texts()`: one `event_reschedule_text` row per person the notice went to who has a verified phone (`auth.users.phone_confirmed_at`) and an active account. The row holds no number. |
| Send | The transport sends after the response (20 seconds at most), and the `reschedule-texts` pg_cron job (every minute, only while a text is due) posts to `/api/jobs/reschedule-texts` with the notification-delivery token to send the rest. Rows are claimed with row locks: nobody is texted twice. |
| Who | Numbers in a market whose text rail is Hubtel (`canTextNumber`, Ghana today); others are marked skipped. At most 1,000 texts per move (`MAX_TEXTS_PER_MOVE`). |
| Words | One short text in the person's language (`server.rescheduleSms*`): what changed, the date on the event's clock, the venue, and the link to their tickets. Title and venue are shortened to 40 characters. |
| Failures | A refused or unanswered text is not tried again (it may have gone out; the notice, push and email reached the person anyway). A dispatcher that died mid-send leaves its rows to the next run (claimed again after five minutes, given up after three claims). |
| Stop | `RESCHEDULE_TEXTS_KILL_SWITCH=true` on the web deployment: nothing is queued and queued texts are skipped. |

## 4. The money

A refund after a move goes through the normal per-ticket path (`cancelEventTicketsCore` → `issueRefundCore` → `refund_prepare`), with two differences:

- the event's refund policy is not checked (`buyerCancelGate` is skipped);
- the cancelled tickets carry `ticket.refund_includes_fee = true`, and `refund_prepare` adds their share of the payment's service fee: `service_fee × their ticket revenue ÷ the payment's ticket revenue` (`_refund_fee_share`, rounded in the currency, never more than the fee not yet given back, never more than the charge has left). The refund row records the fee part in `transaction_refund.fee_amount`; once the provider confirms, the fee audit row (`_refund_fee_adjustment`) records `service_fee = −fee_amount` and `net_revenue = −fee_amount` (Abonten's fee revenue goes down; Paystack's processing charge is not returned and stays Abonten's cost).

Because the flag sits on the ticket, a refund that fails and is retried later (Retry refund, the retry sweep) still includes the fee. The organizer's share is held and reversed exactly as for any refund (`_refund_hold`).

Payments partly in Abonten Credit and Pay small small purchases are refunded as a whole by their own path, which keeps the fee; a holder with such a payment gets the ticket price back. Both are switched off in production today.

## 5. Code map

| Piece | Where |
|---|---|
| Database | `supabase/migrations/20261120170000_event_reschedule.sql`, `20261120210000_reschedule_venue_dates_postpone.sql` |
| Rules | `packages/core/src/eventReschedule.ts` |
| Services | `packages/services/src/events/eventRescheduleCore.ts` (`getRescheduleSetupCore`, `rescheduleEventCore`, `getEventRescheduleForHolderCore`, `keepTicketsAfterRescheduleCore`, `refundAfterRescheduleCore`, `rescheduleEmailBatchCore`); `events/resolveEventVenue.ts` (shared with tours); `tickets/cancelEventTicketsCore.ts` (`afterReschedule`, `occurrenceId`) |
| Website | actions `rescheduleEvent`, `getRescheduleSetup`, `getEventReschedule`, `keepTicketsAfterReschedule`, `refundAfterReschedule`, `eventRescheduleNotification` (email); `ManageEventRescheduleCard` with `VenuePicker`; `RescheduleNotice` on the My Tickets card; `EventRescheduledEmailTemplate`; `EventStatusBanner` / `EventDateSelector` (postponed) |
| App | `GET`/`POST /api/mobile/organizer/events/:id/reschedule`; `GET /api/mobile/events/:id/reschedule`, `POST …/keep`, `POST …/refund`; `organizer/events/[eventId]/reschedule.tsx` with `VenuePickerField`; `features/reschedule/RescheduleNotice` on the ticket screen; event screen (postponed) |
| Texts | `supabase/migrations/20261120220000_reschedule_texts.sql`; `events/rescheduleTextsQueue.ts`, `events/rescheduleTextsCore.ts`; `POST /api/jobs/reschedule-texts` |
| Notice | `core` `notices.event_rescheduled`, `event_moved_venue`, `event_venue_changed`, `event_date_moved`, `event_postponed`; push trigger `trg_notification_queue_app_push` (urgent) |
| Tests | `packages/core/src/eventReschedule.test.ts`, `packages/services/src/__integration__/event-reschedule.integration.test.ts`, `event-reschedule-more.integration.test.ts`, `reschedule-texts.integration.test.ts` |

## 6. Not in this version

- A full refund including the fee for payments with Abonten Credit or Pay small small.
- Postponing an event with several dates (move or cancel its dates instead).

## 7. Support

- "The event moved and I can't go": open the ticket (website My Events, app Tickets) and choose Get a refund before the date shown; the ticket price and the service fee come back to the card or mobile money used.
- "The event is postponed": the ticket stays valid for the new date; until the organizer sets it, Get a refund is open at any time.
- "I missed the refund window": the ticket is valid for the new date or venue; the event's own refund policy applies (it may allow no refunds).
- "I chose Keep but changed my mind": while the window is open, Get a refund is still there.
- "I was sent this ticket": the refund belongs to the person who paid; they can't refund a ticket they gave away, so send it back to them first.
- "Can the organizer move it again?": once more at most (per date for an event with several dates); after two moves, a further change means cancelling (everyone refunded).
- "My event has a seating plan and the hall changed": the venue can't change on a seated event; cancel it (everyone refunded) and list it again at the new hall.
- "An event with several dates moved one date": only the people holding that date are told and may get a refund; the other dates are untouched.
