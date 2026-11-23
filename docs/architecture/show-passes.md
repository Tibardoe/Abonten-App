---
title: Passes for several shows
purpose: How an organizer sells one ticket for several shows of a run (a festival or season pass), how the holder chooses the other shows, and the rules that keep seats, money and refunds straight.
audience: Engineering, operations and support
scope: ticket_type.pass_shows, ticket_checkout.pass_ticket_id, event_series_add_pass, ticket_pass_state, ticket_pass_claim, the ticket_pass_host_cancelled trigger and event_add_show carrying passes (migration 20261120100000); @abonten/core/showPasses; @abonten/services passes/showPassCore and the pass rule in tickets/buyerCancelGate; the website's pass card and ticket panel; the app's shows screen and ticket panel.
status: Review required
version: 1.3
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Passes for several shows

**State (2026-11-20): built, open to every organizer with a run of shows.** Part 4 of the shows, seats and pricing plan ([specifications/shows-seats-and-pricing.md](../specifications/shows-seats-and-pricing.md)); decision Y10. A run is a series of events, one per show ([show-runs.md](show-runs.md)).

## 1. What it does

1. **The organizer sells a pass** on a run (website Manage › Details › Passes for several shows; app Shows and copies): a name ("Festival pass"), how many shows it covers (2 to 30, the one bought for included), a price, and how many passes each show takes (or no limit). The pass becomes a ticket type, with `pass_shows` set, on every show of the run still to come; a show that already has a ticket type of that name, or whose capacity cannot take the passes, is skipped and counted. Shows added to the run later copy it (`event_add_show`).
2. **A buyer buys it like any ticket**, on whichever show they pick first. The page and checkout say it is a pass for N shows. That ticket is an ordinary ticket for that show: it admits there, its money is that show's sale and settles with it, 48 hours after it.
3. **The holder chooses the other shows from the ticket** (website ticket view, app ticket screen): the run's shows are listed with the one bought for, the ones chosen, and a Choose button on the others. Each choice is a new ticket for that show — its own code and QR, out of that show's pass stock and capacity, seated when the show is seated — with no money moved (a `paid` checkout of price 0 whose `pass_ticket_id` names the pass).
4. A show can be chosen once per pass, and at most N − 1 shows in all. A chosen ticket that is cancelled (the holder gave it back, or the show was cancelled) frees the choice for another show.

## 2. Refunds and cancellations

| What happens | Result |
|---|---|
| The pass (the ticket bought) is cancelled or refunded — by its buyer, or because its show was cancelled | The chosen tickets for shows still to come are cancelled with it and their places go back (`ticket_pass_host_cancelled`). Chosen shows that already happened stay as they were. |
| The buyer tries to cancel the pass after a chosen show has started | Refused (`buyerCancelGate`): they have had that show. |
| A chosen show is cancelled by the organizer | Its ticket is cancelled with the rest of that show (nothing to refund — the money is with the pass); the holder can choose another show. |
| The holder sends the pass to a friend | The pass and its remaining choices move with it; tickets already chosen stay with whoever holds them. |

The pass's money is never split across shows: an organizer who cancels the show a pass was bought for refunds the whole pass.

## 3. Rules

| Rule | Where |
|---|---|
| A pass needs a run, 2–30 shows, a positive price in the currency's precision, admits 1 | `event_series_add_pass`, check `ticket_type_pass_shows_range`, `@abonten/core/showPasses` |
| Only the organizer side (or a team member with `events.manage`) sells one; a paid pass may need a checked identity | `addShowPassCore` (`requireVerifiedIdentity` "paid_events") |
| Only the holder sees and uses the pass; one choice at a time (the pass ticket is locked) | `ticket_pass_state`, `ticket_pass_claim` |
| A ticket chosen with a pass is not a pass itself: it has no shows to choose (its checkout names a pass). A pass given as a free ticket is a pass. Fixed 2026-11-20 (migration 20261120120000): before it, a chosen ticket could choose shows of its own, again and again | `ticket_pass_state`, `ticket_pass_claim` |
| A choice needs a show of the same run, published, not hidden or removed by Abonten (since 2026-11-20, migration 20261120150000), still on sale (not started, or before its cut-off when the organizer keeps selling while it's on, [ticket-sales-window.md](ticket-sales-window.md), since 2026-11-23), with no dates of its own, selling the pass with places left. A hidden show is not offered either; the pass's own show and shows already chosen stay listed | `ticket_pass_claim`, `ticket_pass_state` |
| Saving a show's ticket types again keeps a pass a pass (matched by name) | `updateEventTicketTypesCore` |
| All pass functions are service-role only | grants; everything goes through `@abonten/services/passes` |

`ticket_checkout.pass_ticket_id` has no foreign key on purpose: a second relationship between `ticket` and `ticket_checkout` would make every unhinted Data API embed between them ambiguous.

## 4. Code map

| Piece | Where |
|---|---|
| Database | `supabase/migrations/20261120100000_show_passes.sql` |
| Rules | `packages/core/src/showPasses.ts` |
| Service | `packages/services/src/passes/showPassCore.ts` (`addShowPassCore`, `getShowPassCore`, `claimShowPassCore`) |
| Website | `actions/addShowPass.ts`, `getShowPass.ts`, `claimShowPass.ts`; `ManageEventPassCard`; `PassShowsPanel` in the ticket view; the checkout row's pass line |
| App | `POST /api/mobile/organizer/events/:id/passes`, `GET`/`POST /api/mobile/tickets/:id/pass`; Shows and copies screen; `features/passes/PassShowsPanel` on the ticket screen; the buy screen's pass line |
| Tests | `packages/core/src/showPasses.test.ts`, `packages/services/src/__integration__/show-passes.integration.test.ts` |

## 5. Support

- "I bought a pass, where are my other shows?": open the ticket and choose them; each becomes a ticket in My Tickets.
- "The show I want says no places for passes": that show's passes are taken, or it doesn't sell this pass; choose another show.
- "I want my money back for one show of the pass": the pass is one purchase; it is refunded whole, before any chosen show has started, under the bought show's refund policy.
