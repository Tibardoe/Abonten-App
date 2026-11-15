---
title: Send a ticket to a friend — ticket transfers
purpose: How a holder offers an unused ticket to another account or a phone number, how the receiver accepts and the ticket moves with a new code, the rules the database keeps, the new ticket code format, what changed in refunds and free registrations, and how the programme is switched on.
audience: Engineering, operations, support and legal reviewers
scope: The ticket_transfer* tables and functions, ticket.issued_to and ticket.transfer_count, the new ticket code format (@abonten/core/ticketTransfers/ticketCode), @abonten/services ticketTransfers and admin/ticketTransfers, the refund guards in tickets/cancelUserTicketCore, ticketCancelQuoteCore and cancelEventTicketsCore, the web actions in src/actions/ticketTransfers, /api/mobile/ticket-transfers/**, the app's ticket and My Tickets screens, Admin › Ticket transfers and the ticket-transfers-expire job.
status: Review required
version: 1.0
lastReviewed: 2026-11-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Send a ticket to a friend

**State (2026-11-15): built and tested, switched off.** Part 1 of the Tickets, entry and teams plan ([specifications/tickets-entry-and-teams.md](../specifications/tickets-entry-and-teams.md)); decisions X1–X3, X15, X16, X27, X38, X43 and X44 were approved by the founder on 2026-11-15 ([OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)). `ticket_transfer_program_setting.enabled = false`, audience `staff`, and `TICKET_TRANSFERS_KILL_SWITCH` is available on the web deployment. Legal items N1 and N7 are open ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)).

## 1. What it does

A holder offers one unused ticket to another person: by username (the sender sees their public name and photo first) or by phone number. The ticket stays the sender's until the receiver accepts; then it moves to the receiver's account **with a new code and QR**, so the sender's copy, the emailed PDF and any screenshot stop working. Until then the sender can take it back; an offer nobody accepts within 48 hours comes back by itself.

Why: a buyer who bought for a group holds every QR on one phone, so a late friend could not get in without the buyer coming out; a buyer who cannot go had no clean way to pass a ticket on. Private resale between people happens anyway; a ticket sent through Abonten is the one form of it a buyer can trust (Part 6 of the plan works on the rest).

## 2. The flow

1. **Send** (`sendTicketCore`): the programme must be open to the sender, their account not restricted. A username is resolved to an account; a phone number is parsed with the sender's country. A number that belongs to an account (verified phone) goes to that account. A number with none needs a market Abonten can text (`canTextNumber`, Hubtel: Ghana today) and a text left for the sender today (`texts_per_sender_per_day`, X44); the receiver gets a text with a link and accepts by signing up with that number. Then `ticket_transfer_send` checks and records the offer.
2. **Accept** (`acceptTicketTransferCore`): a new code is made (`newTicketCode`) and its QR uploaded; `ticket_transfer_accept` then moves the ticket, its attendee row and its code in one transaction. If that fails the new QR is removed; if it succeeds the old one is.
3. **Decline** (receiver) or **take back** (sender, `ticket_transfer_cancel`): the ticket stays with the sender.
4. **Expiry**: the `ticket-transfers-expire` job (pg_cron, every 10 minutes, `ticket_transfer_expire_due()`) ends offers past their deadline and writes the sender a registry notice (`ticket_transfer_expired`) with a push.
5. **A check-in, cancellation or refund** of the ticket ends its open offer (trigger `ticket_transfer_on_ticket_change`, `cancel_reason = 'ticket_changed'`).

Notices (`@abonten/core/notifications/notices`, words in the recipient's language): `ticket_transfer_received` (receiver), `ticket_transfer_accepted`, `ticket_transfer_declined`, `ticket_transfer_expired` (sender), `ticket_transfer_cancelled` (receiver). `data.kind = 'ticket_transfer'`; the app opens My Tickets, the website `/manage/my-events`.

## 3. Rules the database keeps

All in `supabase/migrations/20261115100000_ticket_transfers.sql`, under row locks (ticket, then offer); the services check them first only to choose the words.

| Rule | Where |
|---|---|
| Only the holder sends, only an `active` ticket whose date is not over (`ticket.expires_at`) of a `published` event | `_ticket_transfer_check_ticket` |
| At most `max_moves` (3, X2) moves per ticket | `ticket.transfer_count` |
| One open offer per ticket | unique index `ticket_transfer_one_open_per_ticket` |
| Never to yourself, never to a restricted account, never to someone who has blocked you (account-wide `conversation_block`) | `ticket_transfer_send` |
| The organizer's switch (X1, on unless turned off) | `event_ticket_transfer_setting` |
| The receiver is the account named, or the account whose verified phone (`auth.users.phone_confirmed_at`) is the number named | `ticket_transfer_accept` / `_decline` |
| A free registration counts against who it was first issued to as well as its holder (X38): nobody sends theirs and registers again, nobody holds two | `ticket.issued_to`, unique index `ticket_one_free_registration_per_issuee`, `issue_free_ticket`, `_ticket_transfer_check_free` |
| The attendee row follows the ticket, carrying the holder's name instead of the buyer's contact details | `ticket_transfer_accept` |

Everything is service-role only: the three tables have RLS on with no client grants, and every `ticket_transfer_*` function is executable by `service_role` alone. `ticket_transfer_user_by_phone` reads `auth.users`, so it is never callable by the apps.

## 4. Refunds of a sent ticket

**The refund of a ticket goes to whoever paid, never to its holder**: refunds follow the transaction. Three guards were added so a transfer can never pay back a ticket someone still holds:

- `ticketsOfPayment`, `areAllTicketsForTransactionCancelled` and `markCheckoutCancelledIfAllTicketsCancelled` now read with the service role. They used the buyer's client, which cannot see a ticket the buyer sent on, so a payment refunded only as a whole (Abonten Credit, Pay small small) could have been refunded in full while a friend still held one of its tickets.
- A holder cannot cancel a ticket someone else paid for: `cancelUserTicketCore` and the quote answer 409 `ticketTransferCancelSendBack` ("send it back to them"). Cancelling it would put the seat back with nothing returned to the payer. "Cancel all my tickets for this event" leaves such tickets out.
- A payment refunded only as a whole cannot be cancelled while one of its tickets is with someone else (409 `ticketTransferPaidTogetherSent`); the organizer can still refund it.

Organizer and staff refunds are unchanged: they cancel the payment's tickets wherever they are and refund the payer.

## 5. Ticket codes (X15, X16)

`@abonten/core/ticketTransfers/ticketCode`: a new code is `TKT-` plus 12 characters from an alphabet without look-alikes (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, no 0/O, 1/I/L): 11 random characters and a check character that makes the weighted sum (weights 1–12) a multiple of 31. Because 31 is prime, every single wrong character and every swap of two neighbours fails the check, so a typed code can be refused before any lookup (`normalizeTypedTicketCode`, used by the typed-code flow of Part 3). The stored form has no spaces, so older scanners (`/TKT-[A-Z0-9]+/`) read new codes whole; `formatTicketCodeForReading` shows `ABCD EFGH JKMN`. Every new ticket gets one (`generateTicketCode`); codes issued before 2026-11-15 (`TKT-` + 8 hex) stay valid.

The code under the QR is hidden until the holder taps **Show code** on the website (`TicketCodeReveal`) and in the app (`TicketCodeRow`), and the ticket lists no longer print it, so a photo of a ticket no longer gives it away.

## 6. Who sees what

- **Sender:** a username shows the account's public name and photo; a phone number is only checked and masked (`+233 24* *** 4567`), never said to belong to anyone, so the lookup cannot be used to test numbers. The one exception: a number Abonten cannot text and that has no account is refused with "ask for their username", which says that much.
- **Receiver:** the sender's public name and photo, the event, the ticket type and the deadline.
- **Staff** (Admin › Ticket transfers, `transfers.view`): every offer with its status, sender, receiver and, for a number, only its last four digits.

## 7. Programme switches (X43)

| Switch | Off means |
|---|---|
| `ticket_transfer_program_setting.enabled` / `audience` (`staff` → `beta` → `all`) | No new offer from people outside the audience. Open offers can still be accepted, declined or taken back. |
| `TICKET_TRANSFERS_KILL_SWITCH=true` (web) | No new offer and no accepting. Declining, taking back and the expiry job still work, so every ticket ends up with someone. |
| `event_ticket_transfer_setting.enabled` (organizer, per event) | No new offer for that event's tickets. |

Rules in the settings row: `max_moves` (3), `accept_hours` (48), `texts_per_sender_per_day` (20). Admin › Ticket transfers changes them (`transfers.configure`, step-up, reason, audited). Rollout (X43): staff first, then beta, then everyone once counsel has approved N1.

## 8. Code map

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261115100000_ticket_transfers.sql` |
| Codes | `packages/core/src/ticketTransfers/ticketCode.ts` (+ test) |
| Services | `packages/services/src/ticketTransfers/` (`ticketTransferCore`, `ticketTransferProgram`, `ticketTransferNotices`); admin `packages/services/src/admin/ticketTransfers/` |
| Inputs | `packages/validation/src/ticketTransferSchemas.ts`; types `packages/types/src/ticketTransferType.ts` |
| Website | `apps/web/src/actions/ticketTransfers/*`, `apps/web/src/ticketTransfers/*` (offers panel on `/manage/my-events`, send control on each ticket, code reveal, organizer card on the event's Promotion tab) |
| App routes | `apps/web/src/app/api/mobile/ticket-transfers/**`, `.../organizer/events/[eventId]/ticket-transfers`; client `api.ticketTransfers.*`, `api.organizer.eventTicketTransfers` |
| App | `apps/mobile/src/features/ticketTransfers/*` (offers on My Tickets, send panel and sheet on the ticket screen, code row, organizer section) |
| Admin | `apps/admin/src/app/(console)/ticket-transfers/*`; handbook [admin/ticket-transfers.md](../admin/ticket-transfers.md) |
| Tests | `packages/services/src/__integration__/ticket-transfers.integration.test.ts` |
