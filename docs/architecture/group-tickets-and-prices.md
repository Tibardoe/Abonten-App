---
title: Group tickets and group prices
purpose: How a ticket type can admit several people (a Couple, a table), how an event offers automatic discounts by the number of tickets in one order, how both are priced and stored, what the database guarantees, and how staff switch them on for an organizer.
audience: Engineering, operations and support
scope: ticket_type.admits, ticket_checkout.admits / group_discount_percent, the event_group_discount table, create_ticket_checkout and create_event (migration 20261119200000), @abonten/core/checkoutPricing priceOrder and @abonten/core/groupPricing, @abonten/services events/groupPricingAccess and events/eventGroupDiscountsCore, the checkout, basket and Pay small small pricing, the organizer forms on the website and the app, and the tickets.group_pricing feature flag.
status: Review required
version: 1.0
lastReviewed: 2026-11-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Group tickets and group prices

**State (2026-11-19): built and tested, switched off.** Decision X39 of the Tickets, entry and teams plan ("a ticket type can issue several tickets per purchase; no ticket admits more than one person", [specifications/tickets-entry-and-teams.md](../specifications/tickets-entry-and-teams.md)) and the first part of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md)). Both features are behind the feature flag `tickets.group_pricing` (off).

## 1. What it does

- **Group tickets.** A ticket type has `admits`: how many people one purchase lets in. A "Couple" type at GH¢500 with `admits = 2` sells as one purchase of GH¢500 and issues **two tickets**, each with its own code and QR, each admitting one person. A "Table of 6" works the same way. Each person can be checked in, sent the ticket (Part 1) or refunded separately.
- **Group prices.** An event can offer up to three automatic discounts by the number of tickets in one order, for example "10 or more tickets: 10% off; 20 or more: 15% off". The checkout applies the best tier the whole order reaches to every ticket in it. Nothing to type. A bigger group never gets a smaller discount (the tiers must increase).
- **A promo code never adds to a group price.** Each ticket gets the larger of the two. When the group price is at least as good as the code, the code is not used at all and its uses are not spent.

## 2. Counting: people everywhere

Every stored count is a count of **people (tickets)**, so nothing that counts seats, restocks, issues tickets or refunds had to change:

| Column | Meaning |
|---|---|
| `ticket_type.admits` | People one purchase admits (1–20; the FREE tier is always 1) |
| `ticket_type.quantity` | Places (people) left, as before. A type sells `floor(quantity / admits)` more purchases (`purchasesLeft`) |
| `ticket_checkout.quantity` | Tickets on the line (people), always a whole number of purchases (`quantity % admits = 0`, check constraint) |
| `ticket_checkout.admits` | The type's `admits` when the line was made |
| `ticket_checkout.unit_price` | The price of **one purchase** (the couple). The line is worth `quantity / admits × unit_price − discount` |
| `ticket_checkout.group_discount_percent` | The group price applied to the line, or null |
| `ticket_checkout.discounted_units` | Tickets the promo code discounted |

A ticket's share of its payment stays `total_price / quantity` (half a couple's price per ticket): the per-ticket refund functions (`_refund_amount`) already use it. The capacity rule (`event_capacity_check`), the expiry sweep, issuance (`issue_tickets_for_checkout`, one ticket per person) and restock on cancellation all count people already.

Only the screens and the API inputs speak in purchases:

- the checkout request `quantities` is **purchases per type** (an app that does not know `admits` still sends what the buyer picked, and the server multiplies);
- the organizer forms enter **purchases on sale**; the services store `purchases × admits`, and the edit loaders give back `floor(places / admits)`;
- the basket stepper sends purchases (`updateTicketCheckoutQuantity`).

## 3. Pricing

`@abonten/core/checkoutPricing` `priceOrder(lines, { promo, groupTiers })` is the one rule for the server (`validateCheckoutCore`, the basket, Pay small small) and every live preview (website checkout, app buy screen), so they agree to the pesewa. Per line, in the currency's minor units, rounded once:

```
tickets          = purchases × admits
group %          = best tier the whole order's tickets reach (0 = none)
promo applies    = a code is given AND its % > group %
eligible tickets = the code's remaining uses, first come across the lines
discount         = round(unitMinor × (eligible × promo% + (tickets − eligible) × group%) / (100 × admits))
amount           = purchases × unitMinor − discount
```

With `admits = 1` and no group price this is exactly the old `computeLineAmount`. The service fee is computed on the discounted total as before; the organizer receives the discounted ticket price.

- **Pay small small** prices purchases with `admits` but applies no promo code and no group price (version 1 of plans takes no discounts).
- **The basket** (`updateTicketCheckoutQuantity`): a line's purchases can change, re-priced with the line's own sticky promo units. An order on an event with group prices is not edited there (every line's price depends on the whole order): the buyer is asked to remove it and choose again.

## 4. What the database guarantees (migration 20261119200000)

- `create_ticket_checkout` refuses a line whose ticket type is not the event's (it used to accept any type id), and a line that is not a whole number of purchases (`Ticket data mismatch for type …`). It stores the type's own `admits`, never the caller's. Still service role only.
- `create_event` reads `admits` from each ticket type (default 1).
- `event_group_discount` (event, min_tickets 2–500, percent_off 1–90, primary key per event and size): read by everyone who can read the event's ticket types (published or cancelled events, and the organizer's acting accounts); **written by the service role only**; at most 3 per event (trigger `event_group_discount_limit`).
- A client session cannot change a type's `admits` once anything was bought or is being bought (`guard_ticket_type_admits`); the services replace ticket types only before the first confirmed ticket anyway.

## 5. Who can use it: the switch

Organizers set group tickets and group prices only when the feature flag `tickets.group_pricing` is on for their account (`groupPricingEnabledFor`, `@abonten/core/groupPricing` `GROUP_PRICING_FLAG`). The services refuse with 403 otherwise (`groupPricingProblem`: "not switched on for your account yet"). Ordinary tickets and removing every group price need nothing. A listing already set up keeps selling when the flag is turned off.

To switch it on for an organizer (Admin › Markets › Feature flags, `markets.flags`): set `enabled` on and the rules to `{"allowSubjects": ["<organizer or team account id>", "<the person's own id>"], "percent": 0}`. The server checks the account the event belongs to (the team, when a member acts for one); the forms show the fields from the person's own flag, so list both for a team. `{"percent": 100}` opens it to every organizer.

Where the organizer sets them: the website's event form (Tickets → "People per ticket" on each type, "Group prices" below) and Manage › Details (ticket types until the first sale; group prices any time, `setEventGroupDiscounts`); the app's event wizard (Tickets step) and Edit event. Buyers see "Admits 2 people, each with their own ticket" on the type, the group prices on the event page, the group price and "3 more tickets for 10% off" in the checkout.

## 6. Code map

| Piece | Where |
|---|---|
| Pricing rule | `packages/core/src/checkoutPricing.ts` (`priceOrder`, `groupDiscountPercentFor`, `purchasesLeft`) |
| Rules and words | `packages/core/src/groupPricing.ts` (`admitsProblem`, `groupDiscountTiersProblem`, `groupPricingProblemMessage`) |
| Limits per order | `packages/core/src/checkoutLimits.ts` (50 tickets of a type, 100 per order, counted as people) |
| Switch, writes | `packages/services/src/events/groupPricingAccess.ts` |
| Edit group prices | `packages/services/src/events/eventGroupDiscountsCore.ts`, web `actions/setEventGroupDiscounts.ts`, `PUT /api/mobile/organizer/events/:id/group-prices` |
| Checkout | `packages/services/src/checkout/validateCheckoutCore.ts` |
| Tests | `packages/core/src/groupPricing.test.ts`, `packages/services/src/__integration__/group-pricing.integration.test.ts` (a Couple paid end to end: four tickets, a quarter of the order refunded per ticket, the organizer's earning) |

## 7. Support

- "I bought a Couple ticket and got two tickets": that is how it works; each person has their own QR. Either can be sent to the partner (when sending is on).
- "Can I refund half a couple?": yes, ticket by ticket, each worth half the couple's price; the service fee stays with Abonten as for any refund.
- "My promo code didn't work": with a group price at least as good, the code is not used (and not spent); the checkout says so.
- "The organizer changed the group price after I paid": an order keeps the price it was made at.
