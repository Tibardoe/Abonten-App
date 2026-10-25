---
title: Pay small small — paying for a ticket in parts before the event
purpose: How a buyer locks an event's price, holds the tickets and pays in parts until a deadline; how the parts ride on the existing payment path and become one ordinary purchase; how an unfinished plan ends and is refunded; why there is no top-up balance; and how the programme is switched on.
audience: Engineering, finance, operations and legal reviewers
scope: The ticket_plan* tables and functions, ticket_checkout status on_plan, payment_attempt.ticket_plan_id, the abonten_plan settlement, @abonten/services ticketPlans and admin/ticketPlans modules, @abonten/core/ticketPlans, the /ticket-plans and /balance web routes, /api/mobile/ticket-plans, /api/maintenance/ticket-plans, the app's plan and Balance screens, Admin › Pay small small and the ticket-plans-dispatch job. Not covered - Abonten Credit itself (rewards-ledger.md).
status: Review required
version: 1.0
lastReviewed: 2026-10-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Pay small small

**State (2026-10-25): built and tested, switched off.** `ticket_plan_program_setting.enabled = false`, audience `staff`, and `TICKET_PLANS_KILL_SWITCH` is available on the web deployment. Legal items M1–M5 ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)) and decisions T1–T8 ([OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)) are open. Production Paystack still uses test keys, so no real money can move through it yet.

## 1. What it is, and why not a top-up balance

A pilot tester asked for two things: an "Abonten balance" people top up and pay from (like the ECG prepaid app), and a way to "pay small small" for a ticket they cannot afford at once. The founder suggested the balance could serve both: top it up bit by bit until it covers the ticket.

Pay small small does the second job directly, and the top-up balance was deliberately not built:

| | General top-up balance | Pay small small (built) |
|---|---|---|
| Holds the seat while you save | No: the event can sell out first | Yes: the tickets are held for you |
| Holds the price | No: an early-bird price can end first | Yes: the price is locked when the plan starts |
| What the money is | Stored value, usable with any organizer later | A prepayment for one specific purchase |
| Regulation (Ghana) | Electronic money under the Payment Systems and Services Act, 2019 (Act 987): a Bank of Ghana licence or a licensed partner (item M5) | A merchant collecting for a sale, as today (item M1 to confirm) |
| Refunds, dormant money, fraud | Refunds to a different instrument, balances nobody claims, top up with a stolen card and refund to MoMo | Refunded to the charge that paid it, automatically, when a plan ends |

ECG prepaid is closer to a plan than to a wallet: a customer prepays ECG for ECG's own electricity, one seller and one product.

**Abonten Credit is shown beside plans, not merged into them.** The Balance page shows "Saved towards tickets" (plan money, the buyer's cash, refundable) and "Abonten Credit" (rewards: spend-only, never cashed out, part of it expires, some only for promotions). Adding the two would either make credit look like withdrawable money or treat cash like expiring credit. Credit cannot yet pay a part of a plan (decision T7). Rewards are switched off for users in production, so the credit row shows only to people who can see Rewards.

## 2. The rules

| Rule | Default | Setting |
|---|---|---|
| Who offers it | The organizer, per event (Manage › event › Promotion tab; the app's event dashboard) | `event_ticket_plan_setting.enabled` |
| First part | At least 20% of the total (rounded up to a whole pesewa) | `first_part_min_bps` |
| Every later part | At least 10%; the last part may be whatever is left | `part_min_bps` |
| Deadline | 48 hours before the chosen date starts | `deadline_hours_before_start` |
| When it is offered | Only while the deadline is at least 3 days away | `min_days_to_deadline` |
| Hold for the first part | 30 minutes, like a checkout | `hold_minutes` |
| Tickets per plan | At most 4; one open plan per person and event | `max_tickets_per_plan` |
| Unfinished plan | The ticket share of what was paid comes back; the service-fee share is kept, as on every refund | `keep_fee_on_refund` (copied onto each plan) |
| Reminders | 7 and 2 days before the deadline, while something is left | `reminder_days` |

No promo codes on a plan (version 1), no credit, no interest. The tickets exist only once everything is paid.

The rules live in `@abonten/core/ticketPlans/rules` (`planMinimums`, `partBounds`, `checkPartAmount`, `unfinishedRefund`, `planOfferWindow`, `dueReminder`; unit-tested), so the screens offer exactly what the server accepts.

## 3. The flow

1. **Offer.** The checkout (web modal, app Buy screen) asks `getTicketPlanOfferCore` whether the event can be paid small small: programme on and the buyer in the audience, the event's switch on, paid tickets, not the buyer's own event, on sale, and the deadline far enough away. With audience `all` a signed-out visitor sees the offer too.
2. **Start.** The buyer chooses *Pay small small*; the terms are listed before anything starts. `startTicketPlanCore` prices the tickets from `ticket_type` and the order exactly as a checkout would (`computeOrderTotals`: net + service fee + tax), then calls `ticket_plan_create`, which reserves the seats through `create_ticket_checkout` (the same sales-window, price and capacity checks) and moves them to `on_plan`. Nothing is charged yet. The seats are held for `hold_minutes`.
3. **Parts.** On the plan page (`/ticket-plans/<id>`, app `ticket-plans/[id]`) the buyer picks an amount (the minimum, about half, or the rest; or types one) and a way to pay: the same wallet list and payment step as a checkout (MoMo direct, saved card, hosted page). `payTicketPlanPartCore` checks the amount and the method, opens a `payment_attempt` whose target is the plan, and starts the charge with `initiateChargeForAttempt`. Only one part can be open at a time.
4. **Confirmed.** The app's verify, the provider's webhook or the reconcile sweep call `finalizePayment`, which verifies the charge with the provider as for any purchase, then `ticket_plan_record_payment` records it. The first part moves the plan to `active` (seats now held until the deadline). The buyer gets "Payment received for …".
5. **Finished.** The part that completes the total moves the plan to `settling` and opens its settlement (§4). The tickets are issued, emailed and notified exactly as for a normal purchase; the plan becomes `completed`.

```
awaiting_payment ──first part──▶ active ──last part──▶ settling ──tickets──▶ completed
       │                           │                       │
   hold ends                 deadline / buyer /       event cancelled
       ▼                     event / staff / closed        ▼
    expired                     lapsed | cancelled      cancelled
```

## 4. How it rides on the payment path

| Piece | What it is |
|---|---|
| Held seats | The plan's own `ticket_checkout` rows with status **`on_plan`**. `event_capacity_check`, `event_shared_capacity_left` and the capacity trigger count them like `pending` rows. Every checkout path reads `pending` only, so the basket, the 30-minute sweep and the pay flow never see them. |
| A part | A `payment_attempt` with `ticket_plan_id` set (the target check now allows exactly one of six targets). A partial unique index allows one open part per plan. |
| Recording a part | `ticket_plan_record_payment(attempt, amount, fee, provider id)` while finalizePayment holds the attempt: inserts `ticket_plan_payment`, adds to `paid_minor`, marks the attempt `succeeded`. A part for a plan that has ended, or that would pay more than is left, is not recorded: finalizePayment refunds it in full as an orphan capture. |
| Settlement | An attempt on the plan's checkout session with the internal provider **`abonten_plan`**, reference `ABNPL-<plan id>`, amount = the total. `finalizePlanSettlement` checks the plan is `settling`, the parts add up to the price and the event is not cancelled, then `completeVerifiedPayment` writes **one `transaction`** (provider `abonten_plan`, amount = everything paid, `provider_fee` = the parts' fees), issues the tickets, and records the platform fee. `ticket_plan_mark_completed` closes the plan. |
| Issuance | `issue_tickets_for_checkout` issues `on_plan` rows only on the authority of an `abonten_plan` attempt, so no ordinary charge can pay for seats a plan holds. `generateTicket` reads `pending` and `on_plan` rows and never hands seats back on a failure: a plan's seats stay with the plan until it settles or ends. |
| Organizer | Earns 100% of the ticket price through `record_organizer_earning` at issuance, settled 48 hours after the event, like any sale. Money on an unfinished plan is not the organizer's. |
| Reconciliation | The reconcile sweep retries parts and settlements like any attempt; the ticket-plans job finishes settlements left behind (§6). |

`finalizePayment`'s rules for an internal provider (`abonten_credit`, `abonten_plan`): never ask a provider, never treat a closed attempt as an orphan capture.

## 5. Ending a plan and refunds

`ticket_plan_release(plan, status, reason)` is the only way an unfinished plan ends. In one transaction it closes any open part charge (a payment that still arrives on it is refunded in full), puts the seats back (`on_plan` → `expired`/`cancelled`, stock restored), and plans the refund:

* refund = everything paid, or — when the plan's terms keep the fee — `floor(paid × ticket ÷ total)`, the ticket share; the pesewa left over stays with the fee (`unfinishedRefund` mirrors it);
* the refund is split across the parts in proportion to each (largest remainder), so each charge gets its share back: `ticket_plan_payment.refund_minor`, status `planned`.

A plan whose part or settlement is being confirmed at that moment answers `busy` and is ended on the job's next run.

**Asking the provider.** `requestPlannedPlanRefunds` claims each share (`planned` → `requesting`), asks the provider for a partial refund of that part's charge, and marks it `requested`. Asking twice could refund twice (Paystack accepts several partial refunds of one charge), so a failure that might have reached the provider is never retried by itself: the share becomes `failed`, an incident is opened (emailed to super-admins in production) and the buyer is told the refund is delayed. Only an answer that says the provider did nothing (429, 503) puts the share back for the next run. A share left `requesting` for 15 minutes is handed to staff the same way.

**Confirmation.** The refund webhook for a part's reference (`handleRefundOutcome` → `handlePlanPartRefundOutcome` → `ticket_plan_part_refund_outcome`) marks the share `processed` or `failed`. When no share is left to ask for or wait on, the plan's refund is `refunded` (or `failed` if any share was refused) and the buyer gets "Refund complete".

**A finished plan's purchase** is refunded by the usual triggers (event cancelled, every ticket cancelled, Admin › Finance). `issueRefundCore` works out the ticket revenue as for any purchase, then — because the transaction's provider is `abonten_plan` — `ticket_plan_plan_purchase_refund` splits that cash across the parts' charges instead of refunding one charge. `record_refund_hold` moves the transaction to `refund_pending` and holds the organizer's earning as usual; the transaction becomes `refunded` once every share has landed.

**Who ends a plan:** the buyer (*Cancel this plan*, with the refund shown first), the deadline (job), the event's cancellation (`cancelEventCore`, then the job for any that were busy), a closed account (job), staff (Admin › Pay small small, step-up). A hold that runs out before the first part ends the plan quietly (nothing was paid).

The fee share kept on unfinished plans is reported in Admin › Pay small small; it is not in `platform_fee_entry` (no sale took place).

## 6. The job

`ticket-plans-dispatch` (pg_cron, every 5 minutes) calls `run_ticket_plan_dispatch()`, which posts to `/api/maintenance/ticket-plans` only while `ticket_plan_work_due()` finds something, with the same address and token as the payment-reconcile job (`payment_reconcile_config`). `runTicketPlanMaintenanceCore`:

1. moves a plan's deadline earlier when its date moved earlier;
2. ends plans: holds that ran out, deadlines that passed, events that were cancelled, accounts that were closed;
3. asks for planned refunds and hands stuck ones to staff;
4. finishes settlements left `pending` or `fulfillment_failed` for more than 10 minutes;
5. sends the reminders (a compare-and-set on `reminders_sent`, so two runs never send one twice).

## 7. Programme, access and notices

* **Switches.** `ticket_plan_program_setting` (enabled, audience staff/beta/all, the rules) plus `TICKET_PLANS_KILL_SWITCH` (web). Off, or outside the audience: no new plan, and organizers cannot switch it on; running plans keep working (parts, cancelling, refunds). The kill switch also stops new parts; running plans can still be read and cancelled and the job keeps ending and refunding them.
* **Access.** All four tables and every `ticket_plan_*` function are service-role only (RLS on, no grants); the buyer reads plans through `@abonten/services/ticketPlans` and `/api/mobile/ticket-plans`. Nothing about plans is in the app's persisted-query allowlist.
* **Notices** (`@abonten/core/notifications/notices`, transactional, push + in-app, in the recipient's language): `ticket_plan_part_received`, `ticket_plan_reminder`, `ticket_plan_lapsed`, `ticket_plan_cancelled`, `ticket_plan_event_cancelled`, `ticket_plan_ended_by_staff`, `ticket_plan_refunded`, `ticket_plan_refund_problem`; `kind: "ticket_plan"` opens the plan. Amounts go in as minor units, the deadline on the event's clock (`deadlineAt` → `deadline`).
* **Admin.** Admin › Pay small small (`plans.view`): every plan, money held on running plans, fee share kept, refunds under way; a plan's parts with their provider references and refund states. `plans.manage` (step-up): end a plan with its refund; ask the provider again for a refused share or record it as refunded by hand, after checking the dashboard. `plans.configure` (step-up): the settings. Every action is audited. Handbook: [admin/ticket-plans.md](../admin/ticket-plans.md).

## 8. Where the code is

| Layer | Files |
|---|---|
| Database | `supabase/migrations/20261025100000_ticket_plans.sql` |
| Rules | `packages/core/src/ticketPlans/rules.ts`, `display.ts` |
| Services | `packages/services/src/ticketPlans/*` (program, core, queries, lifecycle, refunds, notices, maintenance, eventTicketPlanCore); `payments/finalizePayment.ts` (recordPlanPart, finalizePlanSettlement); `organizer/issueRefundCore.ts`; `payments/webhookCore.ts`; `events/cancelEventCore.ts`; `admin/ticketPlans/ticketPlansAdminCore.ts` |
| Website | `apps/web/src/actions/ticketPlans/*`, `apps/web/src/ticketPlans/*`, `/ticket-plans/[planId]`, `/balance`, the checkout modal, the event's manage page, `/api/maintenance/ticket-plans` |
| App | `apps/mobile/app/(app)/ticket-plans/[id].tsx`, `balance.tsx`, the Buy screen, the organizer's event dashboard, `src/features/ticketPlans/*` |
| Mobile API | `/api/mobile/ticket-plans`, `/offer`, `/balance`, `/[planId]`, `/[planId]/pay`, `/[planId]/cancel`, `/api/mobile/organizer/events/[eventId]/ticket-plans`; `payments/options?kind=plan` |
| Admin | `apps/admin/src/app/(console)/ticket-plans/*` |
| Tests | `packages/core/src/ticketPlans/rules.test.ts`; `packages/services/src/__integration__/ticket-plans.integration.test.ts` (start → parts → tickets → refund through the parts; lapse with proportional refunds; late payment refunded; event cancellation; access) |

## 9. Before switching it on for everyone

1. Live Paystack keys ([finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)), and one real plan bought, finished and refunded with them.
2. Legal M1–M4 Decided and the Terms of Sale updated with the plan terms (draft wording in item M2).
3. Decisions T1–T6 recorded.
4. Walk the plan on a device in a second language (`scripts/qa/mobile-walk.sh`), on iOS and Android.
5. List the help page (`customers/paying-small-small`, built with `listed: no`).
