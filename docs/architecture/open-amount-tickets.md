---
title: Open-amount tickets
purpose: How a ticket type can let the buyer choose the amount (a minimum, a maximum and a step), how such a ticket is priced, checked, paid, refunded and shown at the door, what it can never be combined with, and how staff switch it on for an organizer.
audience: Engineering, operations and support
scope: ticket_type.amount_mode / min_amount / max_amount / amount_step and ticket_checkout.open_amount (migration 20261123120000); create_ticket_checkout, create_event, event_add_show and ticket_plan_create; @abonten/core openAmountTickets and checkoutPricing; @abonten/services events/openAmountAccess, checkout/validateCheckoutCore, tickets/checkInTicketCore and the refusals in comps, seating, ticket plans and the basket; the organizer editors, the checkout and the door on the website and in the app; the tickets.open_amount feature flag.
status: Review required
version: 1.0
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Open-amount tickets

**State (2026-11-23): built and tested, switched off.** The founder's decision of 23 November 2026, behind the feature flag `tickets.open_amount` (off). PROJECT.md §92. Legal item M6 ([../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)) must be answered before the flag is switched on for anyone selling prepaid venue credits.

## 1. What it does

An organizer can make a ticket type whose price **the buyer chooses**. The organizer sets a lowest amount, a highest amount and a step; the buyer types an amount (or taps a quick pick) and gets **one ticket, with one QR code, for that amount**. At the door the scanner shows the amount paid in large type ("Paid GH₵150").

Three uses, one mechanism:

- **Prepaid venue credits.** Shornaa Island, an amusement park in Accra, sells ride credits at its gate: a visitor pays what they want to load, gets a card, and spends credits at the turnstile and each ride. On Abonten the visitor chooses GH₵150 of credits, pays, and shows the ticket at the gate; staff see "Paid GH₵150" and load that much onto the card.
- **Pay what you want (minimum X).** Community and charity events: from GH₵20, in steps of GH₵5, up to GH₵500.
- **Deposits.** A table deposit of GH₵200 to GH₵2,000.

What the amount buys is said by the ticket type's one-line note (`ticket_type.description`, "what's included", [ticket-notes-and-special-hours.md](ticket-notes-and-special-hours.md)): "Loaded on your card at the gate", "Pay what you can, from GH₵20", "Deposit, taken off your bill".

## 2. Data (migration 20261123120000)

| Column | Meaning |
|---|---|
| `ticket_type.amount_mode` | `'fixed'` (every existing type, the default) or `'open'` |
| `ticket_type.min_amount` | Open types: the lowest amount, in major units of the event's currency. `price` holds the same value, so every "From GH₵X" already shown keeps working |
| `ticket_type.max_amount` | Open types: the highest amount; the lowest amount plus whole steps |
| `ticket_type.amount_step` | Open types: the amounts go up from the lowest in this step |
| `ticket_checkout.open_amount` | The buyer chose this line's amount: `unit_price` = `total_price` = the amount, one ticket. Written by `create_ticket_checkout` from the type, like `admits`, so the door reads the line, not the type as it is now |

What the database guarantees:

- `ticket_type_amount_mode_check`: the mode is `fixed` or `open`.
- `ticket_type_amount_range_check`: a fixed type has no range; an open type has all three, a minimum above 0, a maximum not below it, a step above 0, and `mod(max − min, step) = 0`.
- `ticket_type_open_amount_shape_check`: an open type's `price` equals its minimum, it admits one person (`admits = 1`), is never a pass (`pass_shows` null), never sells a seating section (`seating_section_id` null) and is never the FREE tier.
- Trigger `trg_ticket_type_zz_amount_precision` (`ticket_type_amount_precision()`): each amount has at most the currency's decimals (`money_round`, "A GHS amount can't have more than 2 decimal places"), and the range is whole steps **counted in the currency's minor units** (`major_to_minor`, so pesewas and whole francs decide, never floating point).
- Trigger `trg_guard_ticket_type_amount` (`guard_ticket_type_amount()`): a client session (an organizer writing through the Data API) cannot change the mode or the range once any checkout line exists for the type ("How this ticket type's price is chosen can't change once it has been sold."), exactly as `guard_ticket_type_admits` does for `admits`. The services replace ticket types only before the first confirmed ticket anyway.
- `ticket_checkout_open_amount_check`: an open-amount line has quantity 1, admits 1, no discount, no promo units, no group price, and `total_price = unit_price`.
- The flag row `tickets.open_amount` is inserted off (`{"allowSubjects": [], "percent": 0}`).

## 3. Pricing: one rule

`@abonten/core/checkoutPricing` `priceOrder` prices the server's order (`validateCheckoutCore`) and every live preview (website checkout, app buy screen) alike. A line given `amountMode: "open"` and `chosenAmount`:

- is **one ticket** at the chosen amount (`purchases` 1 when anything was picked, `admits` 1), whatever quantity was asked;
- is **never discounted**: no promo code, no group price (`discount` 0, `discountedUnits` 0, `groupDiscountPercent` null, `openAmount: true`);
- is **not counted** towards a group price: `PricedOrder.discountableTickets` counts every ticket but the open ones, and the group tier is chosen from it. A promo code's remaining uses are spread over fixed lines only.

An order of open lines only, with a promo code typed, leaves the code unused and unspent (`promoApplied` false; `create_ticket_checkout` stores no code on an open line). The service fee is added on top of the order as for any ticket, at the rate in `platform_fee_config` (5% today, never hard-coded): GH₵150 is charged as GH₵157.50. The organizer receives the amount chosen.

## 4. Rules and words (`@abonten/core/openAmountTickets`)

| Function | What it decides |
|---|---|
| `openAmountRangeProblem(range, currency)` | The organizer's range: `range_missing`, `min_not_positive`, `max_below_min`, `step_not_positive`, `too_precise` (more decimals than the currency), `step_misaligned` (the maximum is not the minimum plus whole steps). Counted in minor units |
| `openAmountTypeProblem(tier, { currency, freeEvent })` | A whole open type: also `free_event`, `admits`, `pass` (the services add `seating` and `not_enabled`) |
| `chosenAmountProblem(amount, range, currency)` | The buyer's amount, a number or the text of an input: `missing`, `below_min`, `above_max`, `off_step` (off the steps, or more decimals than the currency) |
| `parseChosenAmount`, `openAmountRangeOf`, `isOpenAmountType` | Reading typed text and ticket type rows |
| `openAmountQuickPicks(range, currency)` | Up to four amounts to tap: the minimum, then about 2×, 5× and 10× it, each moved up onto the steps and kept within the maximum, plus the maximum when there is room. GH₵50–1,000 in steps of 10 gives 50, 100, 250, 500 |
| `openAmountRangeHint` | "From GH₵50 to GH₵1,000, in steps of GH₵10" |

Words come from `openAmount.*` of the `core` namespace in the reader's language (amounts formatted with the currency); `OPEN_AMOUNT_FLAG` is the flag's key.

## 5. The server path

1. **Saving ticket types.** `postEventCore` and `updateEventTicketTypesCore` take `amountMode`, `minAmount`, `maxAmount`, `amountStep` on each named type. An open type's price is set to its minimum and its `admits` to 1, whatever the client sent; `openAmountTicketsProblem` (`@abonten/services/events/openAmountAccess`) checks the range in the event's currency and that the flag is on for the account the event belongs to; `openAmountColumns` writes the four columns. A type saved again by the name of a pass cannot become open. The web actions `postEvent` / `updateEventTicketTypes`, `POST /api/mobile/events` and `PUT /api/mobile/organizer/events/:eventId/ticket-types` carry the fields; drafts keep them (`eventDraftSchema`).
2. **Choosing the amount.** `validateCheckoutCore` takes `amounts: { [ticketTypeId]: amount }` beside `quantities` (web action `validateCheckout`; `POST /api/mobile/checkout/validate` with `amounts`). For each open type picked it checks the amount (`chosenAmountProblem`, a 400 in the buyer's language), sets that type's quantity to 1 and prices the order with `priceOrder`.
3. **The database re-checks** in `create_ticket_checkout` (made again whole from its same-day-sales version, fingerprinted): an open line carries the amount in `unit_price` and `amount`, must be quantity 1 with no discount, promo units or group price ("Ticket data mismatch for type …"), and the amount must be within the range, on the steps and within the currency's decimals ("Choose an amount from % to %, in steps of %.", the amounts written by `money_text`). The stock update re-reads the range, so a range changed in between is "Ticket price has changed. Please review your order.". A fixed line keeps its price check and must still be fixed. Still service role only.
4. **Paying and issuing** are unchanged: `issue_tickets_for_checkout` issues one ticket per unit, and a ticket's share of its payment stays `total_price / quantity`, which here is the amount.

## 6. What an open type is never combined with

| Combination | Refused by |
|---|---|
| Several people per purchase | Services set `admits` to 1; the database shape check |
| A pass for several shows | The database shape check; `updateEventTicketTypesCore` refuses a type named like a pass |
| A seating section | `@abonten/services/seating/seatingCore` (`openAmount.seating`); the database shape check |
| The FREE tier, a free event | `openAmountTypeProblem` (`free_event`); the database shape check |
| A complimentary ticket | `@abonten/services/comps/complimentaryCore` (`openAmountTicketsCantBeGiven`): a gift would have no amount to load |
| Pay small small | `startTicketPlanCore` (`openAmountTicketsArePaidAtOnce`) and `ticket_plan_create` ("ticket_plan_create: open amount"); the checkouts hide the choice when an open line is picked |
| Changing the quantity in the basket | `updateTicketCheckoutQuantity` (`openAmountLineCantChange`): remove the line and choose again |
| A promo code or a group price | `priceOrder` (section 3) and `create_ticket_checkout` |

## 7. Refunds

Nothing new. A refund follows the event's refund policy (`@abonten/core/refundPolicy`) through `buyerCancelGate`, and a cash payment is refunded ticket by ticket: the ticket's share, `total_price / quantity`, is the amount chosen (`refund_quote_amount` gives 150 for a GH₵150 ticket). The service fee stays with Abonten, as for any refund; the organizer's earning is reversed by the same amount. Abonten does not know how much of a loaded amount a visitor has used at the venue: a refund after the gate is a matter between the organizer and the buyer, like any ticket used at the door (checked-in tickets are not refundable by the buyer).

## 8. At the door

`checkInTicketCore` now returns, after a successful scan, `ticket: { type, note, paidAmount }`. For a ticket of an open type it reads the checkout line with the service role (the caller was authorised just before; a team member cannot read `ticket_checkout` through their own session) **before** the ticket moves to used, so a scan that cannot show the amount admits nobody and can simply be repeated. `paidAmount` is `{ amount, currency }` for an open-amount line, null for a fixed-price ticket. The web action `checkInTicket` and `POST /api/mobile/organizer/tickets/:ticketId/check-in` pass it on (`CheckedInTicket` in `@abonten/api-client`).

The website's check-in (`CheckInByCodeCard`, the attendee list) and the app's scanner (`TicketScannerSheet`) show "Paid GH₵150" in large type with the type's note, so staff load that many credits.

## 9. Copying and moving

`create_event` writes the four columns from `p_ticket_types`, and `event_add_show` copies them to a run's new show or a copy of the listing. Both were changed in place at a named anchor (as the ticket-notes migration did), so another branch's change elsewhere in those functions is kept; a missing anchor stops the migration. A later migration that replaces either function whole must keep the four columns. Moving an event to a team and joining runs move events, not ticket types.

## 10. The switch

Organizers set an open type only when the feature flag `tickets.open_amount` is on for their account (`openAmountEnabledFor`), exactly like `tickets.group_pricing` ([group-tickets-and-prices.md](group-tickets-and-prices.md) §5). Otherwise the services refuse with 403 ("Letting buyers choose the amount isn't switched on for your account yet."). Fixed tickets need nothing. A listing already set up keeps selling when the flag is turned off.

To switch it on for an organizer (Admin › Markets › Feature flags, `markets.flags`): `enabled` on and the rules `{"allowSubjects": ["<organizer or team account id>", "<the person's own id>"], "percent": 0}`. The server checks the account the event belongs to (the team, when a member acts for one); the forms show the option from the edit loader's `open_amount_enabled` (`getEventForEditCore`) and the person's own flag, so list both for a team. Before switching it on for a seller of prepaid credits, legal item M6 must be answered.

**Known gap, as for group tickets.** The flag is a product gate enforced in the services. An organizer writing `ticket_type` directly through the Data API could set an open type without it (as they could set `admits` without `tickets.group_pricing`); the database still enforces the shape, the range, the amount and everything in section 6.

## 11. Screens

- **Organizer** — the website's event form (Tickets, `TicketInputs`) and Manage › Details; the app's event wizard (Tickets step, `EventWizardTickets`) and Edit event: each named type has **Price: Fixed / Buyer chooses the amount**, and the second shows lowest amount, highest amount and step, with the range checked as it is typed. Shown only when the flag is on (or the type is already open).
- **Buyer** — the website's checkout dialog and the app's buy screen: an open type shows an amount field with the range hint and quick-pick chips instead of the +/− stepper, the line says "Promo codes and group prices don't apply to amounts you choose", and Pay small small is not offered while an open line is picked. The order summary and checkout show the chosen amount; the ticket (website and app) shows the amount paid.
- **Door** — section 8.

## 12. Code map

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261123120000_open_amount_tickets.sql` |
| Rules and words | `packages/core/src/openAmountTickets.ts`; `core` messages `openAmount.*` |
| Pricing | `packages/core/src/checkoutPricing.ts` (`priceOrder`, `discountableTickets`) |
| Switch, columns | `packages/services/src/events/openAmountAccess.ts` |
| Saving types | `packages/services/src/events/postEventCore.ts`, `updateEventTicketTypesCore.ts`, `getEventForEditCore.ts` |
| Checkout | `packages/services/src/checkout/validateCheckoutCore.ts`; `apps/web/src/actions/validateCheckout.ts`; `POST /api/mobile/checkout/validate` |
| Refusals | `packages/services/src/comps/complimentaryCore.ts`, `packages/services/src/seating/seatingCore.ts`, `packages/services/src/ticketPlans/ticketPlanCore.ts`, `apps/web/src/actions/updateTicketCheckoutQuantity.ts` |
| Door | `packages/services/src/tickets/checkInTicketCore.ts` |
| Tests | `packages/core/src/openAmountTickets.test.ts`; `packages/services/src/__integration__/open-amount-tickets.integration.test.ts` |

The integration suite proves, against the local stack: the flag off (or on for someone else) refuses an open type on create and on edit; a range off the steps or too precise is refused by the service, and the database refuses every bad shape; a GH₵150 choice is one ticket at 150, charged 15,750 pesewas (the 5% fee on top), refundable at 150, earning the organizer 150, and the door returns `paidAmount` 150 GHS with the note, after which the organizer's own session cannot change the range; an open line is never discounted by a promo code or a group price and does not count towards a group; the database refuses an amount outside the range or off the steps, a quantity of 2, a discounted line, a cheap fixed line and a Pay small small plan with an open line; a run's new show keeps the range and the editor stores an open type at its minimum, admitting one.

## 13. Support

- "I paid GH₵150 but the gate loaded less": the scanner shows the amount paid; ask the venue to scan the ticket again or read the amount on the buyer's ticket.
- "Can I use a promo code on credits?": no, promo codes and group prices never apply to an amount the buyer chooses; they still apply to the event's other tickets in the same order.
- "Can I pay for credits small small?": no, an amount you choose is paid at once.
- "I want a refund of my credits": the event's refund policy applies, as for any ticket, until the ticket is used at the door. Once loaded at the venue, it is the organizer's matter.
- "How do I sell credits?" (organizer): ask Abonten support to switch "buyer chooses the amount" on for your account.
