---
title: Admin — Ticket transfers
purpose: How to look up where a sent ticket went, answer the common support questions about sending tickets, and switch the programme on in stages.
audience: Support, operations
scope: Admin › Ticket transfers, the transfers.view / transfers.configure permissions, the TICKET_TRANSFERS_KILL_SWITCH deploy flag and the ticket-transfers-expire job
status: Approved
version: 1.1
lastReviewed: 2026-11-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Ticket transfers

People can send an unused ticket to a friend's account or phone number. It moves only when the friend accepts, and then gets a new code. How it works: [architecture/ticket-transfers.md](../architecture/ticket-transfers.md).

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `transfers.view` | The settings and every offer: status, event, sender, receiver (a number shows only its last four digits) | finance_admin, operations, support_admin (super_admin always) |
| `transfers.configure` | Change the settings. Fresh step-up and a reason; audited as `transfers.settings.update` | finance_admin, operations (super_admin always) |

## Looking a ticket up

Search by the ticket's id or its code as the person reads it (old or new code, spaces allowed), or by a user id (offers they sent or received). Statuses: **Waiting**, **Accepted**, **Declined**, **Ended** (the sender took it back, or the ticket was checked in or cancelled) and **Ran out** (nobody accepted within the hours set; the ticket stayed with the sender).

## Common questions

- **"I sent it to the wrong person."** Before they accept, the sender takes it back from the ticket. After they accept, the move is final: only the receiver can send it back. Staff do not move an accepted ticket, unless the receiver's account was taken over (escalate to operations; there is no button for this yet).
- **"I bought a ticket from someone and it never came."** Abonten never sees money paid between people and cannot refund it. If the seller's account is reported for scams, handle it as a report.
- **"I want a refund for a ticket someone sent me."** The refund belongs to whoever paid. The holder sends it back to them, and they cancel it.
- **"My friend never got the text."** Texts go only to numbers Abonten can text (Ghana today), at most the daily number per sender. The friend can sign up with that number anyway and find the ticket on the tickets page within the hours set; otherwise send to their username. When the text did not go, the sender's ticket says so ("We couldn't text this number").
- **"The event is sold out and I can't send my ticket."** Check the event: the organizer may have switched sending off (which also closes offers still waiting, shown here as "the organizer turned sending off"), the ticket may have moved the most times allowed, or it was already checked in.

## Switching it on

1. Staff only (the default audience) with test events.
2. Beta: add user ids, one per line.
3. Everyone, once counsel has approved legal item N1 (the Terms for sending tickets) and the help page `customers/sending-tickets` is listed.

`TICKET_TRANSFERS_KILL_SWITCH=true` on the web deployment stops new offers and accepting at once (for a fault in the move itself). Declining, taking back and the expiry job keep working.

## The job

`ticket-transfers-expire` (pg_cron, every 10 minutes) ends offers past their deadline and tells each sender the ticket is still theirs. If it stops, offers stay "Waiting" past their deadline but can no longer be accepted (the accept checks the deadline itself).
