---
title: Specification — venue credit vouchers sold from a place page
purpose: Design the larger follow-up to open-amount tickets — credits or vouchers a venue sells from its place page, not tied to an event date, valid for a number of days, giftable and redeemed by scan at the venue — and list every decision it needs before anything is built.
audience: Founder, legal counsel, engineering, operations
scope: A possible place-bound voucher listing reusing open-amount ticket types, settlement without an event date, expiry and unredeemed balances, refunds, gifting through ticket transfers, redemption at the venue, legal item M6
status: Draft
version: 1.0
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — venue credit vouchers sold from a place page

**Design only. Not built, and not to be built** until the founder has decided the open questions in section 4 and legal item M6 in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) is Decided.

## 1. Current state (verified against code and schema, 2026-11-23)

- **Open-amount tickets exist** ([../architecture/open-amount-tickets.md](../architecture/open-amount-tickets.md), switched off behind `tickets.open_amount`). A buyer chooses an amount within a ticket type's lowest amount, highest amount and step and gets one ticket for it; the door shows "Paid GH₵150" so a venue such as Shornaa Island loads that many ride credits onto its own card.
- **But every ticket belongs to an event.** `ticket_type.event_id` names an event, and everything around a ticket reads the event's dates: what is on sale (`event_session_sales_close_at`), the ticket's `expires_at` (the event's end), the refund policy (counted from the event's start, `@abonten/core/refundPolicy`, `buyerCancelGate`), the organizer's earning (settled 48 hours after the event ends), check-in windows, retiring ended events (`retire_ended_events`).
- So a park that wants to sell credits every day must list an event (for example a long-running event with a date per day, or same-day sales, [../architecture/ticket-sales-window.md](../architecture/ticket-sales-window.md)). A credit bought for Saturday is a ticket for Saturday.
- **Places** have pages, opening hours, special dates, services, bookings and teams (Front desk and Door staff roles, `acting_places`), but sell nothing through checkout.
- **Ticket transfers** exist ([../architecture/ticket-transfers.md](../architecture/ticket-transfers.md), switched off): a holder offers an unused ticket to another person, who gets a new code when they accept; at most 3 moves; a refund follows the payment, never the holder.

## 2. What the follow-up would offer

- A venue (a place, run by a person or a team) sells **vouchers from its place page**: "Ride credits", "Gift card", "Spa voucher", each a fixed price or an amount the buyer chooses (the open-amount rule).
- A voucher is **not tied to a date**: it is valid for N days from purchase (for example 90 or 365), set by the venue.
- It can be **given** to someone else (a gift), using ticket transfers.
- It is **redeemed by scan at the venue**: the Front desk or Door staff scanner shows the amount paid (or the voucher's name) and marks it used.
- Optionally later: **partial redemption** (a balance spent over several visits), which turns a voucher into stored value — see decision V3.

## 3. Design sketch (for review, not approved)

### 3.1 Data model: two options

| | Option A — a place-bound "voucher listing" reusing tickets | Option B — a new voucher table |
|---|---|---|
| Shape | A hidden, undated listing per place (an `event` row of a new kind, or a new `listing_kind`) whose `ticket_type` rows are the vouchers; a purchase is an ordinary `ticket_checkout` and `ticket` with `expires_at` = purchase + N days | `place_voucher_type` (price or open range, validity days, note) and `place_voucher` (code, holder, amount, `valid_until`, `redeemed_at`, payment link), with their own checkout lines |
| Reuses | Checkout, `create_ticket_checkout`, payment attempts, Paystack, `issue_tickets_for_checkout`, the ticket screens, QR codes, transfers, check-in, refunds per ticket, the open-amount rule | Payments and the provider adapters only; every screen, issuance, transfer, scan and refund path written again |
| Costs | Every event rule must learn that this listing has no date: Explore and search must never list it, `retire_ended_events` must skip it, the sales window, the refund policy, settlement, check-in windows and reschedule must treat it apart (each is a place where a missing date could sell, list or settle the wrong thing) | A second ticketing system to keep in step with the first (money path, refunds, fees, i18n, admin finance) |
| Leaning | Smaller, but only if the "no date" cases can be listed and tested exhaustively | Cleaner, much larger |

Either way: the money path stays server-write-only (CLAUDE.md), the price is never taken from the client, the service fee comes from `platform_fee_config`, and money uses minor units and the place's market currency.

### 3.2 Redemption

- The venue's staff scan with the existing check-in path, scoped to the **place** instead of an event (a new check on `acting_places` for Front desk and Door staff, PROJECT.md §75.11), shown as "Paid GH₵150 — Ride credits".
- One-shot first (scan = used). Partial redemption needs a balance and a ledger per voucher (decision V3).
- A screenshot of a QR must not be redeemable twice: the scan moves the voucher conditionally, as check-in does today (one door wins), and a transferred voucher gets a new code.

### 3.3 Gifting

Ticket transfers as they are: offer, accept, new code, at most 3 moves, never to someone who blocked the sender; the refund follows the payment. A gift message and "send as a gift at checkout" would be new.

## 4. Open decisions

| # | Decision | Why it matters |
|---|---|---|
| V1 | **Settlement timing for undated vouchers.** When does the venue get the money: at purchase, at redemption, after N days, or after the voucher expires? | Today an organizer's earning settles 48 hours after the event ends; a voucher has no event. Paying at purchase puts refund risk on Abonten; paying at redemption delays the venue's cash and needs a redemption ledger. |
| V2 | **Expiry and unredeemed value.** How long is a voucher valid, can the venue choose, what happens to the money of an expired voucher (breakage: venue's, refunded, or Abonten's), and must the buyer be reminded before it expires? | Consumer-protection rules may limit short expiries or keeping unredeemed money; the answer changes V1 and the accounts. |
| V3 | **One-shot or a balance.** Is a voucher used once (scan = used), or can a balance be spent over several visits? | A balance spent over time and across sales is much closer to stored value (M5, M6) and needs a per-voucher ledger, partial refunds and a balance screen. |
| V4 | **Refunds without an event start.** Which refund policy applies (until N days after purchase? until first use? never?), and what of a voucher the venue can no longer honour (closed, sold, banned)? | `@abonten/core/refundPolicy` and `buyerCancelGate` count from an event's start; a voucher has none. A venue closing with unredeemed vouchers is the largest consumer risk. |
| V5 | **Legal.** Whether closed-loop vouchers redeemable only at the issuing venue stay outside electronic-money rules (Act 987), whether gifting changes that, consumer-protection duties (expiry, disclosure, refunds when the venue closes), and when VAT is due (at sale or at redemption). | Legal item M6 covers open-amount credits sold as tickets; this follow-up widens it (undated, giftable, possibly a balance) and needs its own answer before building. |
| V6 | **Fraud and abuse.** Limits on vouchers bought per account, on transfers (resale of discounted vouchers), on amounts, and what staff do when a scanned voucher was refunded or charged back. | Screenshots, resale and chargebacks after redemption land on the venue or on Abonten. |
| V7 | **Operations.** Who at the venue may sell and redeem (Owner, Manager, Front desk, Door staff), whether the venue needs a scanning mode for the place (not an event), what the venue sees (sold, redeemed, expired, outstanding), and support's script for "my voucher doesn't scan". | Place teams exist (PROJECT.md §75); a place scanner and a voucher report do not. |
| V8 | **Data model.** Option A (a place-bound voucher listing on ticket types) or option B (a new voucher table), section 3.1. | Decides the size of the work and which existing rules must change. |
| V9 | **Relationship to open-amount tickets.** Do venues that sell credits today as open-amount event tickets move to vouchers, or do both stay? | Two ways to sell the same thing confuse organizers and support. |

## 5. Relationship to open-amount tickets

Open-amount tickets are the first, smaller step and are built: one ticket of the amount chosen, for an event date, redeemed once at the door, settled like any ticket. Vouchers would reuse the amount rule (`@abonten/core/openAmountTickets`), the door's "Paid GH₵150" and ticket transfers, and add what open-amount tickets deliberately leave out: no date, a validity period, gifting as a first-class flow, redemption at a place and, perhaps, a balance.

## 6. Approval required before implementation

- Legal item **M6** in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) marked Decided, with counsel's answer extended to undated, giftable vouchers (V5).
- The founder's decisions **V1–V4 and V6–V9** above, recorded in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md) before work starts.
- If V3 chooses a balance: legal item **M5** revisited (stored value), since a balance spent over time is close to what M5 records as not to be built.
