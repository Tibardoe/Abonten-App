---
title: Tickets, entry and teams — the plan
purpose: The approved plan for sending tickets, team accounts for organizers and places, check-in stations, entry modes and wristbands, tickets sold on other platforms, resale controls and promoters, with the build order and the decisions behind each part.
audience: Founder, engineering, operations, legal counsel
scope: Parts 1 to 7 of the plan and decisions X1–X45; legal items N1–N9
status: Approved
version: 1.0
lastReviewed: 2026-11-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Tickets, entry and teams — the plan

The founder approved this plan and all 45 decisions on 2026-11-15 (decisions X1–X45 in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); legal items N1–N9 in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)). It started from the founder's visit to a festival where guests swapped their ticket QR for a wristband once at a redemption tent, then scanned the band at a self-scan gate watched by a guard each time they went in. The working document with the reasoning, scams and edge cases is the Claude Doc "Tickets, entry and teams — plan"; this file is the repository's record of what was decided.

Every part ships switched off (programme setting, audience staff, kill switch: X43), changes the database through a migration applied to Preview then Production, and gets its own architecture doc, handbook and help page when it is built.

| Part | What | Decisions | State |
|---|---|---|---|
| 1. Send a ticket | A holder offers an unused ticket to an account or a number; it moves on accept with a new code; at most 3 moves; 48 hours to accept; new 12-character codes with a check character; code hidden until tapped; a free ticket you sent still counts as yours | X1–X3, X15, X16, X27, X38 | **Built 2026-11-15**, switched off — [../architecture/ticket-transfers.md](../architecture/ticket-transfers.md) |
| 2. Team accounts | An organizer or a place is a team run by members with roles (Owner, Finance, Manager, Content and messages, Door staff, Front desk for places); Owners and Finance pass the ID check; the payout account belongs to the team, and a new one is held 48 hours; customers see the team's name; "make this a team" keeps the handle, followers, events, places, reviews and payout history | X5–X8, X42 | **Built 2026-11-15/16** (stages 1–5: teams, acting for a team, money, messages, Spotlight, verification, staff tools, 18+, place limits), switched off — [../architecture/team-accounts.md](../architecture/team-accounts.md) |
| 3. Stations and devices | Named check-in points with one job (redeem, entry, exit); door staff on their own accounts, at least one Lead per event; device-only stations from a setup QR that ends with the event; hardware scanners and a laptop scanner page; signed offline code lists without names; typed codes need the holder's confirmation | X9, X10, X14, X41 | Planned |
| 4. Entry modes | One entry, re-entry (scan out and back in) and wristbands (redeem once, scan the band each time; lost bands voided; copied bands caught); every ticket kept on the holder's phone from 24 hours before; ticket types that issue several tickets; venue capacity warnings | X11–X13, X17, X24, X39, X40 | Planned, needs Part 3. X39 (ticket types that issue several tickets) built 2026-11-19 ahead of the rest, with group prices: [../architecture/group-tickets-and-prices.md](../architecture/group-tickets-and-prices.md) |
| 5. Tickets sold elsewhere | Upload another platform's codes, a guest list or crew; scan them at the same stations and turn them into bands; delete imported lists 30 days after the event | X18–X20 | Planned, needs Part 3 |
| 6. Resale controls | Per-person limits by account and wallet; the QR held back until 24 hours before high-demand events; only the holder can cancel a sent ticket; reseller flags; scam reports end the right to send; later, resale at face value (sell back, sell to a person) | X4, X21–X23, X25, X26, X28, X29 | Planned; X25 is built with Part 1 |
| 7. Promoters | Promoter commission paid in cash from a promoter balance after the event settles; ID check before the first cash payout; invited promoters with their own rates; a typed promoter code at checkout; "send a buy link" by text, at most 20 a day | X30–X37 | Invited promoters with their own rates, invited-only events and members added by an Owner built 2026-11-16 (X33, X36; [../architecture/rewards-ledger.md](../architecture/rewards-ledger.md)); the rest planned: cash waits for live identity checks, live Paystack keys and counsel |

Cross-cutting: Abonten pays the texts these features send, within daily caps (X44); scan history is kept in full for 180 days after the event, then as totals (X45); staff tools in the admin console, support answers, all six languages, other markets' text rails, Safety's event-team alerts going to Leads, Rewards balances moving to teams, and tests and docs are part of each part, not extras.

Not in the plan: passes for several days of one event, selling at the door through Abonten, live links with other ticketing platforms, NFC or RFID bands and turnstiles, age checks at the door, seat maps, splitting money between co-hosting teams, cash withdrawals of credit. (Passes, runs of shows and assigned seats were taken up on 2026-11-19 in [shows-seats-and-pricing.md](shows-seats-and-pricing.md).)

Steps only the founder can take: the Smile ID contract (ID checks for Owners, Finance and cash promoters); live Paystack keys and the upgrade of the Paystack business account so it can send transfers; sending N1–N9 to counsel; choosing a friendly organizer and events for the first stations and the first wristband night.
