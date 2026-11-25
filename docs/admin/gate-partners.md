---
title: Admin — Gate partners
purpose: How staff link an event to an organizer's own check-in system (Hapniin), watch the sales registered with it, retry the stuck ones, handle codes to void, and answer the common questions from buyers and organizers.
audience: Operations, finance, support
scope: Admin › Gate partners, the gatepartners.view / gatepartners.manage permissions, the tickets.gate_partners feature flag, the GATE_PARTNERS_KILL_SWITCH deploy flag and the gate-partners job
status: Review required
version: 1.0
lastReviewed: 2026-11-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Admin — Gate partners

Some organizers check people in at the gate with their own ticketing system and will not run a second one. Abonten can still sell their tickets: each sale is registered with the organizer's system (the **gate partner**; Hapniin is the first), which issues its own code, and the buyer's Abonten ticket shows that code. How it works: [architecture/gate-partner-connectors.md](../architecture/gate-partner-connectors.md).

**Not live yet.** No Hapniin key exists, and the commercial terms with Hapniin (decisions GP1–GP5) and legal items L1–L3 are open. Do not link a real event until they are answered.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `gatepartners.view` | The links, every sale registered with a partner, the stuck ones and the codes to void | operations, finance_admin, support_admin (super_admin always) |
| `gatepartners.manage` | Link or end a link, pause or resume sales, check prices again, retry a sale, record codes as voided. Fresh step-up and a reason; audited `gatepartners.link`, `.pause`, `.resume`, `.unlink`, `.push.retry`, `.voided` | operations, finance_admin (super_admin always) |

## Linking an event

1. Switch the flag on for the organizer: Admin › Markets › Feature flags › `tickets.gate_partners`, add the organizer's account id (or their team's id) to `allowSubjects`, enabled.
2. Make sure the key variables are on **both** the web and the admin deployments (`HAPNIIN_API_KEY` or `HAPNIIN_API_KEY_<NAME>`, and `HAPNIIN_WEBHOOK_SECRET[_<NAME>]`). Production takes only a `pk_live_` key; Preview only a `pk_sandbox_` key.
3. Admin › Gate partners › paste the event id › **Open**. The page says whether the event can be linked. It cannot if it is seated, has several dates, an amount the buyer chooses, a Couple or table ticket, a pass, a free ticket, group prices, or **any ticket already reserved or sold** — set it up before sales open.
4. Confirm your identity, type the variable names, **Load the partner's events**, choose the partner's event, map every ticket type to the partner's ticket, give a reason, **Link**. The prices must be identical to the pesewa; the link is refused otherwise.
5. Buy one ticket yourself and check the code appears on it and scans at the partner's gate. Then the event can be announced.

While linked, the organizer cannot change ticket prices or types, add group prices, dates or seating; stock and the ticket notes stay editable. Promo codes cannot be used for the event.

## Watching sales

Each paid order line is one **sale** on the event's page: **Waiting to send**, **Sending**, **Registered, codes pending**, **Codes received**, **Needs staff**, or **Not sent** (refunded before it was sent). The front page lists sales that need staff or have tried three times or more. A sale that keeps failing opens an incident (Admin › Monitoring) and the super-admins are emailed.

| What you see | What to do |
|---|---|
| `SOLD_OUT`, `PRODUCT_SALE_ENDED`, `PRODUCT_NOT_FOUND` | The partner refused the sale: the buyer paid Abonten but has no code. Ask the organizer to add stock or reopen the product in the partner's system, then **Retry** (it goes as a new request). If that cannot happen, refund the buyer in Admin › Finance and tell them. |
| `INVALID_API_KEY`, `INSUFFICIENT_SCOPE`, `KEY_…` | The key is wrong, revoked, not scoped, or does not suit this deployment. Fix the variable and redeploy; the sales retry on their own. |
| `TIMEOUT`, `NETWORK`, `HTTP_5xx`, `RATE_LIMITED` | The partner is slow or down. Nothing to do: the job retries with the same key (never a second order). |
| `CODES_PENDING` | The partner registered the order but has not issued its codes yet. It looks again on its own. |
| `ATTENDEE_COUNT` | The partner's order has a different number of tickets. Check the order in the partner's dashboard before anything else. |
| `BUYER_DETAILS` | The buyer has no email or name on their account. Ask them to add it, then **Retry**. |
| `NOT_MAPPED` | A ticket type has no partner product (should not happen while linked). Contact engineering. |

**Pause sales** stops new sales at once (already-paid sales are still registered). **Check prices again** compares the partner's current prices with Abonten's and records any difference; pause sales until they match again. **End link** is possible only before any sale.

## Codes to void

When a partner ticket is cancelled or refunded on Abonten (by the buyer, the organizer or staff, or because the event was cancelled), its code must be voided in the partner's system — the partner cannot be told automatically yet. The organizer gets a notice and an email listing the codes, and marks them voided on their event page. The event's page here lists the codes still to void; once the organizer confirms, or you have checked in the partner's dashboard, **Record all as voided**. Before the gate opens, make sure the list is empty.

## Common questions

- **"My ticket says my gate code is on its way."** The partner has not issued it yet. It usually takes seconds; the buyer gets an email and a notice when it arrives. If it is still missing after an hour, look the sale up here.
- **"Abonten's scanner says check-in happens in Hapniin."** Correct: these tickets are scanned with the organizer's Hapniin scanner, not Abonten's.
- **"Can I send my ticket to a friend?"** No: the code is issued for the buyer by the organizer's system. They can show the ticket on their phone, or the buyer can cancel it (within the refund policy) and the friend can buy their own.
- **"I want a refund."** As for any ticket (the event's refund policy). The organizer is told to void the code.
- **"The organizer gave free tickets."** Free tickets for a linked event are given in the organizer's own system, not on Abonten.

## Switching it off

`GATE_PARTNERS_KILL_SWITCH=true` on the web deployment (redeploy): every linked event stops selling on Abonten and no sale is sent; queued sales wait and go when it is removed. To stop one event, **Pause sales** on its page.
