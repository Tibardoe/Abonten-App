---
title: Gate partner connectors
purpose: How Abonten sells tickets for an organizer who checks people in with their own system (Hapniin first) — how staff link an event to the partner's event and products, how each paid sale is registered with the partner and the partner's code shown on the ticket, what happens on failure, refund, transfer and at the door, and how it is switched on.
audience: Engineering, operations and support
scope: Migration 20261125120000_gate_partner_connectors (gate_partner_link, gate_partner_product, gate_partner_push, gate_partner_ticket, gate_partner_rate_window, ticket.partner_gate / partner_code / partner_qr_public_id / partner_qr_version, their triggers and functions, the gate-partners pg_cron job); @abonten/core gatePartners/gateLinkRules and gatePartners/ticketEntryCode; @abonten/services gatePartners/* and admin/gatePartners/*; POST /api/jobs/gate-partners, POST /api/gate-partners/:provider/webhook, /api/mobile/organizer/events/:eventId/gate-partner; the ticket screens, email and PDF receipt; Admin › Gate partners; the tickets.gate_partners feature flag and GATE_PARTNERS_KILL_SWITCH.
status: Review required
version: 1.0
lastReviewed: 2026-11-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Gate partner connectors

**State (2026-11-25): built and tested against a stand-in for Hapniin, switched off, never connected.** No Hapniin API key exists yet; nothing has been sent to Hapniin's live or sandbox API. The commercial terms (who keeps what, who refunds) are open: decisions GP1–GP5 in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md), legal items L1–L3 in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md). PROJECT.md §93. Handbook: [../admin/gate-partners.md](../admin/gate-partners.md).

## 1. Why

The Ghana-Jamaica Homecoming Festival (4–5 December 2026, Accra) wants to sell tickets on Abonten, but its gate checks everyone in with **Hapniin**, a Ghanaian ticketing platform, and it will not run two check-in systems. Hapniin's scanner admits only codes Hapniin issued. Hapniin publishes a partner ("reseller") push API: a partner that sold a ticket on its own platform registers the completed sale, and Hapniin issues the attendee's ticket code.

So Abonten sells the ticket as usual (its checkout, its payment, its fee) and then registers the sale with Hapniin. The buyer's ticket on Abonten shows **Hapniin's code and QR**; the gate scans it with Hapniin's scanner. The design is generic: a **gate partner** is any platform whose check-in system the organizer keeps; Hapniin is the first adapter, a bigger platform may follow with a second adapter and no new flow.

## 2. Hapniin's API as used (v1)

| What | How |
|---|---|
| Base URL | `https://dash.hapniin.com` for live and sandbox: the key decides (`pk_live_…` / `pk_sandbox_…`). A constant in the adapter: an environment override could send the key to another host |
| Catalog | `GET /api/partner/v1/events`: live, **unseated** events, each product with its current price |
| Register a sale | `POST /api/partner/v1/orders` with `eventId`, buyer `firstName`, `lastName`, `email`, optional `phone`, `items: [{ productId, quantity }]` and an **`Idempotency-Key`** header. Created **PAID** at once, **priced by Hapniin from its own catalog** (never from the request). Seated events refused (`SEATED_EVENT_NOT_SUPPORTED`) |
| Codes | `GET /api/partner/v1/orders/:id`: each attendee with its `ticketCode` (`TCK-A1B2C3`). An order is visible only to the key that made it (404 otherwise) |
| Webhook | `order.completed`, HMAC-SHA256 of the raw body in `X-Hapniin-Signature: sha256=<hex>`; `order.refunded` is reserved and not sent yet |
| Limits | 100 requests per 60 seconds per key (429 with `Retry-After`); a request still running under the same key answers 409 `REQUEST_IN_PROGRESS` |
| QR | Hapniin's QR is the plain `ticketCode`; its scanner upper-cases it and looks it up |

Not documented, therefore treated as unknown and kept out of the code: how money for push sales is settled, the revenue share, and who refunds a buyer (GP1–GP3). The API has **no refund or void call**, so a refunded ticket must be voided by hand in Hapniin (§6).

The published OpenAPI file is kept as a test fixture (`packages/services/src/gatePartners/__fixtures__/hapniin-partner-openapi.json`, fetched 2026-11-25).

## 3. Data (migration 20261125120000)

Every table and function is **service role only** (RLS on, no client grants); the migration checks it.

| Table / column | Meaning |
|---|---|
| `gate_partner_link` | One per event: `provider` (`hapniin`), `partner_event_id`, the **names** of the env variables holding the API key and the webhook secret (`api_key_env`, `webhook_secret_env`, only `HAPNIIN_API_KEY[_X]` / `HAPNIIN_WEBHOOK_SECRET[_X]`, checked in SQL and TypeScript), `key_mode` (live / sandbox, read from the key when linked), `currency`, `status` (`active` selling, `paused` no new sales, `ended`), `check_problems` (what the last catalog check said) |
| `gate_partner_product` | Each ticket type → the partner's product, with the partner's price when linked |
| `gate_partner_push` | One per **paid checkout line** of a linked event: status (`queued` → `sending` → `ordered` → `done`; `failed` needs staff; `cancelled` when every ticket of the line was cancelled before it was sent), `generation` and the generated **`idempotency_key`** (`abn-<checkout line id without dashes>-g<generation>`, the same as `gatePushIdempotencyKey()`), the tickets the order covers (`request_ticket_ids`, fixed at the first send), attempts and backoff, the last error, the partner's order id, `partner_confirmed_at` (webhook), `buyer_notified_at`, `incident_opened_at` |
| `gate_partner_ticket` | Each ticket's partner code and attendee id, and `state`: `issued`, `to_void` (cancelled or refunded on Abonten: void it in the partner's system), `voided` (recorded by the organizer or staff) |
| `gate_partner_rate_window` | Requests per key per minute (by the key's env variable name) |
| `ticket.partner_gate` | Set when the ticket is issued for a linked event (trigger `ticket_gate_partner_mark`): the holder's ticket says "your gate code is on its way" until the code arrives |
| `ticket.partner_code`, `partner_qr_public_id`, `partner_qr_version` | The partner's code and a QR image of the plain code (Cloudinary, `tickets_qr_codes/gate-<provider>-<code>`), written only by `gate_partner_store_codes()`. Clients cannot write them (`guard_ticket_client_update` compares every other column) |

Triggers:

- `ticket_checkout_gate_partner_paid` (a line turns `paid`): queues the push **in the same transaction as the payment** (`issue_tickets_for_checkout`, whatever path confirmed it: the client's verification, the Paystack webhook, Abonten Credit). A line whose type has no product is queued as `failed` (`NOT_MAPPED`).
- `ticket_checkout_gate_partner_insert`: a line written already `paid` or `on_plan` for a linked event (a complimentary gift, a pass choice, Pay small small) is **refused**: there is no sale to register and the partner would record one at its own price.
- `ticket_gate_partner_cancelled` (a partner ticket turns `cancelled`, any path): its code becomes `to_void`.
- `ticket_gate_partner_guard`: a partner ticket cannot change hands (`user_id`).
- `gate_partner_refuse_while_linked` on `ticket_type` (insert, or a real change of price, currency, admits, amount, pass, seating section), `event_group_discount`, `event_occurrence`, `event_seating`: a linked event's tickets stay what the partner sells. Stock and notes stay editable.

Functions: `gate_partner_event_problems(event)` (why an event cannot be linked, as codes), `gate_partner_link_set(…)` (link or re-link before the first sale, one transaction, ticket types locked, every type mapped once, same currency, same price to the currency's smallest unit), `gate_partner_link_end(event)` (only before any sale), `gate_partner_push_claim(limit, session)` (row locks, `skip locked`; a push stuck in `sending` for 5 minutes is due again), `gate_partner_store_codes(push, codes)`, `gate_partner_rate_take(bucket, cost, limit)`, `gate_partner_void_claim(limit)`, `gate_partner_work_due()`, `run_gate_partner_dispatch()`. **The migration replaces no existing function.**

## 4. Linking an event (staff)

Admin › Gate partners › an event (`gatepartners.manage`, fresh step-up, a reason, audited `gatepartners.link`):

1. The **feature flag** `tickets.gate_partners` must be on for the organizer (Admin › Markets › Feature flags, `allowSubjects` = the organizer's account or team id).
2. The event must be linkable (`gate_partner_event_problems`, mirrored by `gateEventProblems`): published, not postponed, **one date** (link each show of a run as its own event), **not seated**, no **open-amount**, **group (admits > 1)**, **pass** or **free** ticket type, no **group prices**, and **nothing reserved or sold yet** (every ticket must carry the partner's code). Pay small small is then impossible (its seats are checkout lines).
3. Staff name the API key variable (and the webhook secret variable). The key must exist on the deployment and suit it (`gateKeyModeProblem`): a **live key only with live payments on production**, a sandbox key only with test payments, never a live key on a preview.
4. "Load the partner's events" calls `GET /events`; staff pick the partner's event and map **every** ticket type to one of its ticket products. `checkGateMapping` refuses another currency, an unmapped type, a non-ticket product, a product mapped twice, and **any price that differs by even one pesewa**; it warns (without refusing) when the partner's event starts more than a day from Abonten's, or a partner ticket is not sold on Abonten.
5. `gate_partner_link_set` re-checks all of it in SQL and stores the link.

Later: **Check prices again** re-reads the catalog and records any difference (pause sales until fixed); **Pause sales** (no new sale; sales made are still registered); **End link** (only before any sale).

## 5. A sale

1. **Checkout** (`validateCheckoutCore`, website and app): after Abonten prices the order itself, `gatePartnerSaleProblem` refuses the sale (409, `server:gatePartnerSalesPaused` / `gatePartnerNoPromoCodes`) when the link is paused or the kill switch is on, when a promo code is given, for a date of a multi-date event, or when any line is not a mapped type at exactly the partner's price with no discount or group price. So Abonten charges exactly what the partner will record, plus Abonten's service fee on top as for every ticket.
2. **Payment** as usual. Issuance (`issue_tickets_for_checkout`) marks the tickets `partner_gate` and queues one push per line (§3).
3. **Right after issuance** (`generateTicket`, the one place both the client verification and the Paystack webhook issue tickets), after the response: `dispatchGatePartnerPushes({ sessionId })` sends this purchase's pushes, then the receipt email goes out. In the usual case the receipt already carries the partner's codes.
4. **Sending one push** (`@abonten/services/gatePartners/gatePushCore`):
   - the first time, fix the tickets the order covers: the line's live tickets (a line refunded before it was sent is `cancelled`, nothing sent);
   - the buyer's names (one name field split: first word / the rest; a one-word name is used for both), email and verified phone;
   - wait for the rate window (`gate_partner_rate_take`, 90 a minute per key; never counted as an attempt);
   - `POST /orders` with the push's **Idempotency-Key** — a timeout, a crash or a redelivered payment webhook sends the same key, and the partner replays its first answer instead of a second order;
   - store the partner's order id, then `GET /orders/:id`; when every ticket has its code, make a QR of each plain code and store them all in one transaction (`gate_partner_store_codes`; a ticket cancelled meanwhile goes straight to `to_void`).
5. **The gate-partners job** (pg_cron, every minute while something is due → `POST /api/jobs/gate-partners` with the notification-delivery token) sends what is due and, when codes arrive after the receipt went out, tells the buyer: notice `gate_codes_ready` (in-app and push) and the tickets emailed again with the codes ("Your gate codes are ready").
6. **The webhook** (`POST /api/gate-partners/hapniin/webhook`): a delivery signed with a linked webhook secret for one of our orders marks it confirmed; if its codes are not stored yet it becomes due now and a short dispatch runs after the 200. Anything else is acknowledged (200) so Hapniin stops retrying; a bad signature is 401.

Failures, sorted by the adapter (`classifyHapniinError`):

| Answer | What happens |
|---|---|
| Timeout, network error, 5xx, unexpected body | Retried with the **same key**, backoff 1, 2, 5, 10, 20, 30, 60, 120, 240, then every 360 minutes (`gatePushBackoffMs`) |
| 429 | Waits `Retry-After`, not counted |
| 409 `REQUEST_IN_PROGRESS` | Asked again in 30 seconds, not counted |
| 401 / 403 / a key that does not suit the deployment | Retried with backoff (a configuration problem staff fix) |
| A definite refusal (`SOLD_OUT`, `PRODUCT_NOT_FOUND`, `PRODUCT_SALE_ENDED`, `VALIDATION_ERROR`, …), a buyer with no name or email, an attendee count that differs | `failed` at once and an **incident** opened; staff act (§7) |
| Codes not out yet after the order went through | `ordered`, looked at again with backoff |

After 5 failed attempts an incident is opened (`open_reconciliation_incident`, component `gate_partners.push.<event id>`, one open per event), which emails the active super-admins like every incident.

## 6. Refunds, cancellations, transfers, the door

- **Refund or cancel** (the buyer within the refund policy, the organizer, staff, an event cancellation): the ticket turns `cancelled` and its code `to_void` (trigger). The money path is unchanged: Abonten refunds the buyer exactly as for any ticket. Because Hapniin cannot be told by API, the job tells the organizer — one notice per event (`gate_tickets_to_void`, in-app and push) and an email listing the codes to void (the organizer, or a team's Owners and Managers). The organizer voids them in Hapniin and taps **Mark as voided** (website Manage › Details; app route ready); staff can record them too. Who carries a refunded sale's money on Hapniin's side is GP2/GP3.
- **Transfers** (send a ticket to a friend): refused for partner tickets — the send control says why (`sendBlockedPartnerGate`), `sendTicketCore` answers 409, and the database refuses a change of `ticket.user_id`.
- **Complimentary tickets, pass choices, Pay small small, free registration**: refused for a linked event (service first, database behind it).
- **The door**: Abonten's scanner and the attendee list answer 409 "Tickets for this event are checked in with Hapniin. Scan them with the Hapniin scanner." for the Abonten ticket or a scanned partner code; the website's Check-in tab says so up front.

## 7. Stuck sales (staff)

Admin › Gate partners lists sales that failed or have tried three times or more; an event's page lists every sale with its key, partner order, attempts and last error. **Retry** makes a sale due now: one the partner **definitely refused** (nothing was created) gets a new key (`generation` + 1) so the corrected request is new; anything else keeps its key, so the partner replays an order it may already have made. A sale that keeps failing for a reason staff cannot fix (sold out at the partner) is **refunded** on Abonten (Admin › Finance), which marks its codes, if any, to void.

## 8. What the holder sees

`@abonten/core/gatePartners/ticketEntryCode` is the one rule every surface uses (website ticket view, app ticket screen, the ticket email, the PDF receipt on both): Abonten's code and QR for an ordinary ticket; for a partner ticket the partner's code and QR with the line **"Scanned at the gate by the organiser's check-in system"**, or **"Your gate code is on its way"** (no QR, never Abonten's code) until it arrives. Words `tickets.gate*`, `core:ticketReceipt.gate*`, `emails:ticket.gate*` in five languages (Akan in English).

The organizer sees the link read-only on the website (Manage › Details card; Check-in tab note): partner event, ticket mapping and prices, codes received, sales still being registered or with staff, codes to void. App: `GET/POST /api/mobile/organizer/events/:eventId/gate-partner` and `api.organizer.eventGatePartner` / `confirmGatePartnerVoids` (no app screen yet).

## 9. Switches

| Switch | Effect |
|---|---|
| Feature flag `tickets.gate_partners` (ships **off**) | Staff may link an organizer's events only while it is on for them. A link already made keeps working if it goes off |
| `GATE_PARTNERS_KILL_SWITCH=true` (web) | Linked events are not on sale and no sale is sent; queued sales wait and go when it is removed |
| Link status `paused` | That event is not on sale; sales already made are still registered |
| Env variables | `HAPNIIN_API_KEY[_X]`, `HAPNIIN_WEBHOOK_SECRET[_X]` on the web deployment (the job and the webhook run there) and the admin deployment (linking reads the catalog). Never stored in the database |

## 10. Going live with Hapniin (founder and operations)

1. Agree the commercial terms (GP1–GP3) and get legal items L1–L3 answered.
2. Ask Hapniin for a **sandbox** key, then a **live** key, each scoped `events:read`, `orders:write`, `orders:read`, and a webhook to `https://abontenhub.com/api/gate-partners/hapniin/webhook` (live) with its secret.
3. Put the sandbox key on Preview (`HAPNIIN_API_KEY`, `HAPNIIN_WEBHOOK_SECRET`; payments are test there), link a test event to a Hapniin sandbox event, buy a ticket with a Paystack test card, check the code appears and scans with Hapniin's sandbox scanner, refund it and void it.
4. **Publish an app update (JS only) first.** Until then the app's ticket screen and receipt show Abonten's own code, which the partner's gate does not admit (the website, the email and the emailed PDF already show the partner's code).
5. On Production: the live key and secret, the flag on for the festival's organizer, link the event, buy one real ticket, scan it at Hapniin, refund and void it, then open sales.
6. Before the gate opens: confirm with the organizer that every "to void" code is voided in Hapniin.

## 10a. Not built (on purpose, for now)

- An app screen for the organizer's link (the route and client method exist).
- Partner refunds/voids by API (Hapniin has none yet; `order.refunded` is reserved): when it exists, the `to_void` queue is where it plugs in.
- Seated events, several dates on one event, open amounts, group tickets, passes, free registration (Hapniin's order cannot express them one to one).
- Selling the partner's merchandise or add-ons.

## 11. Code map

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261125120000_gate_partner_connectors.sql` |
| Rules (codes, pure) | `packages/core/src/gatePartners/gateLinkRules.ts`, `ticketEntryCode.ts`; staff words `packages/core/src/admin/gatePartnerText.ts` |
| Adapter | `packages/services/src/gatePartners/adapter.ts` (interface), `hapniinAdapter.ts` |
| Config, keys, link reads | `packages/services/src/gatePartners/gatePartnerConfig.ts` |
| Checkout check | `packages/services/src/gatePartners/gateSaleCheck.ts` (from `checkout/validateCheckoutCore.ts`) |
| Sender | `packages/services/src/gatePartners/gatePushCore.ts` |
| Voids | `packages/services/src/gatePartners/gateVoidCore.ts` |
| Webhook | `packages/services/src/gatePartners/gateWebhookCore.ts`; route `apps/web/src/app/api/gate-partners/[provider]/webhook/route.ts` |
| Job | `apps/web/src/app/api/jobs/gate-partners/route.ts`; emails `apps/web/src/utils/sendGatePartnerEmails.tsx`, `GateVoidEmailTemplate.tsx` |
| Organizer | `packages/services/src/gatePartners/organizerGateCore.ts`; `apps/web/src/actions/gatePartners/*`; `apps/web/src/events/molecules/GatePartnerCard.tsx`; `apps/web/src/app/api/mobile/organizer/events/[eventId]/gate-partner/route.ts` |
| Staff | `packages/services/src/admin/gatePartners/*`; `apps/admin/src/app/(console)/gate-partners/**`; `apps/admin/src/server/actions/gatePartners.ts` |
| Refusals elsewhere | `ticketTransfers/ticketTransferCore.ts`, `tickets/checkInTicketCore.ts`, `comps/complimentaryCore.ts`, `checkout/registerForFreeEventCore.ts`, `ticketPlans/ticketPlanCore.ts`, `events/updateEventTicketTypesCore.ts`, `events/eventGroupDiscountsCore.ts`, `seating/seatingCore.ts` |
| Tests | `packages/core/src/gatePartners/gateLinkRules.test.ts`; `packages/services/src/gatePartners/hapniinAdapter.test.ts` (against `__fixtures__/hapniinMockServer.ts`, built from the OpenAPI file); `packages/services/src/__integration__/gate-partners.integration.test.ts` |
