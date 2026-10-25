---
title: Admin — Pay small small
purpose: How to watch the money Pay small small plans hold, end a plan with its refund, deal with a refund share the provider refused or never confirmed, and switch the programme on in stages.
audience: Finance, operations, support
scope: Admin › Pay small small (Plans, a plan, Settings), the plans.view / plans.manage / plans.configure permissions, the TICKET_PLANS_KILL_SWITCH deploy flag and the ticket-plans-dispatch job
status: Approved
version: 1.0
lastReviewed: 2026-10-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Admin — Pay small small

Buyers can pay for an event's tickets in parts before the event: the price is locked, the tickets are held, and the tickets are issued when the last part arrives. How it works: [architecture/ticket-plans.md](../architecture/ticket-plans.md). Open decisions: T1–T8 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); legal items M1–M5 in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md).

**Money on a running plan is the buyer's, not a sale.** It becomes the purchase (one transaction, the organizer's earning, the service fee) when the plan is finished, or goes back to the buyer when the plan ends. It does not appear in Finance › Transactions until then.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `plans.view` | The list, the money held and kept, each plan's parts, provider references and refund states | finance_admin, operations, support_admin (super_admin always) |
| `plans.manage` | End a plan with its refund; ask the provider again for a refused refund share, or record one refunded by hand. Fresh step-up and a reason; audited | finance_admin (super_admin always) |
| `plans.configure` | The settings. Fresh step-up and a reason; audited | finance_admin, operations (super_admin always) |

## Plans

Admin › Pay small small opens with three figures per currency:

* **Held on running plans** — paid by buyers on plans that are waiting for their first part, being paid or issuing tickets.
* **Fee share kept on ended plans** — when a plan ends unfinished and its terms keep the fee, the service-fee share of what was paid. This is not in the platform fee records (no sale took place); count it from here.
* **Refunds under way** — shares planned, being asked or waiting on the provider, and refused ones.

Filter by state, or by **Refund needs staff** (start here every day) and **Refund pending**. Open a plan to see its locked price, what was paid, the deadline, its terms, how it ended and every part with its provider reference.

## Ending a plan

Use it when a buyer asks support to stop a plan they cannot cancel themselves, or when something is wrong (fraud, a duplicate). The seats go back on sale, open charges are closed and the refund starts at once, on the plan's own terms (the ticket share, or everything paid if the terms do not keep the fee). The buyer is told. A plan whose payment is being confirmed at that moment cannot be ended: try again a minute later.

A plan that is fully paid is normally issuing its tickets within a minute, and the job retries one that stalls; end it only if its tickets cannot be issued. Once a plan is completed, refund its purchase in Finance › Transactions like any order: the refund goes back through the plan's parts automatically.

## A refund that needs staff

Each part was its own charge, so each gets its own share of a refund. A share comes to you when:

* the provider refused it (the reason is shown, for example a closed wallet), or
* the request may or may not have reached the provider (a network failure, or no answer within 15 minutes).

An incident is opened and the buyer is told their refund is delayed. **Check the provider's dashboard for that reference first:** a provider accepts several partial refunds of one charge, so asking twice can refund twice.

* **Ask the provider again** — only when the dashboard shows no refund for the charge yet.
* **Record as refunded** — when the money reached the buyer another way (sent by MoMo by hand, refunded in the dashboard). Write how in the reason.

When every share is done the plan (and, for a finished plan, its transaction) shows Refunded and the buyer is told.

## Settings

Admin › Pay small small › Settings:

* **Switched on** and **Audience** (staff, staff + beta user ids, everyone). Both the organizer and the buyer must be in the audience. With "Everyone", signed-out visitors see the offer too. Switching off stops new plans and stops organizers turning it on; running plans carry on.
* The rules: first part and later parts (% of the total), the deadline (hours before the event), how far away the deadline must be for a plan to be offered, the hold for the first part, tickets per plan, reminders (days before the deadline).
* **Keep the service-fee share when a plan ends unfinished** (decision T2). A change applies to plans started afterwards: each plan keeps the terms it was started with, because the buyer agreed to them.

`TICKET_PLANS_KILL_SWITCH=true` on the web deployment is the emergency stop: nobody can start a plan or pay a part; running plans can still be read and cancelled and the job keeps ending and refunding them.

## Rolling out

1. Staff only, with test keys: start, pay, finish, cancel and let a plan lapse on a test event; refund a finished one.
2. Live Paystack keys; one real plan bought, finished and refunded.
3. Beta: a few organizers switch it on for one event each; watch Refund needs staff daily.
4. Everyone, once legal M1–M4 and decisions T1–T6 are Decided and the help page is listed.
