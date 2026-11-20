---
title: Shows, seats and pricing — the plan
purpose: The plan for what a theatre company, a church concert or a weekly event needs from ticketing beyond one date and one price — group tickets and group prices, one listing for a run of shows, assigned seats, passes for several shows, complimentary tickets and copying a listing — with the build order and the decisions behind each part.
audience: Founder, engineering, operations
scope: Parts 1 to 6 of the plan and decisions Y1–Y12
status: Approved
version: 1.0
lastReviewed: 2026-11-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Shows, seats and pricing — the plan

On 2026-11-19, before a meeting with a theatre company that plays the National Theatre three times a day, the founder asked whether Abonten offers quantity discounts, numbered seats, and events that run every weekend, and asked for the gaps to be built ("go ahead and build them"). They chose **assigned seats** for the first version of seating. The per-event refund policy is a separate piece of work (PR #108) and is not part of this plan.

What existed on that day:

- **Discounts**: promo codes only (a percentage, a use limit, an end date; anyone with the code can use it). Early-bird prices work through each ticket type's sale window.
- **Seats**: `ticket.seat_number` exists and the app shows it, but nothing fills it in. Tickets are sold by type.
- **Several dates**: a listing can have specific dates (`event_occurrence`), typed one by one; the buyer picks a date and the door refuses a ticket on another date. But the seat limit and each type's stock are shared by all the dates, there is no repeat rule, and a listing entered as one long date range stops selling once it has started. Organizers were told to make one listing per show.

Every part ships behind a switch (a feature flag or a programme setting), off, and is opened per organizer first ("on request"), then to everyone.

| Part | What | Decisions | State |
|---|---|---|---|
| 1. Group tickets and group prices | A ticket type admits several people, one ticket each (a Couple, a table). Automatic discounts by the number of tickets in one order, up to three tiers; never added to a promo code | Y1–Y4 (and X39) | **Built 2026-11-19**, behind `tickets.group_pricing` — [../architecture/group-tickets-and-prices.md](../architecture/group-tickets-and-prices.md) |
| 2. One listing for a run of shows | Each show of a listing has its own seats and stock; the buyer picks a show; the door admits that show; each show's money is ready 48 hours after it; a repeat rule fills the dates ("every Friday 4pm, Saturday 4pm and 8pm, from … to …"); one show can be cancelled and refunded on its own; a long run sells day tickets while it runs | Y5–Y7 | **Built 2026-11-19**: each show is a whole event in a run (`event.series_id`), so seats, door, payout and cancellation are per show with nothing new on the money path; lists show a run once — [../architecture/show-runs.md](../architecture/show-runs.md) |
| 3. Assigned seats | The organizer (or Abonten for them) sets up a venue's seating once: sections, rows, seat numbers. A ticket type maps to a section. When the order is paid, Abonten gives the best seats left in that section, side by side for a group; the seat is on the ticket, the email and the door scanner. Choosing seats on a map comes later on top | Y8–Y9 | **Built 2026-11-19**: plans of sections and rows, an event's types mapped to sections, the database seats every issued ticket (an order side by side) — [../architecture/assigned-seats.md](../architecture/assigned-seats.md) |
| 4. Passes | One purchase for several shows of a series (a festival pack: any six plays); the holder picks each show later and gets that show's ticket | Y10 | Planned |
| 5. Complimentary tickets and guest lists | The organizer issues free tickets to people by username or phone (cast, press, sponsors), counted against the seats; imported lists from other sellers follow Part 5 of the Tickets, entry and teams plan | Y11 | **Built 2026-11-20** (complimentary tickets; imported guest lists not yet): real tickets of a type on the person's account, from the stock and seats, price 0, marked on the door list — [../architecture/complimentary-tickets.md](../architecture/complimentary-tickets.md) |
| 6. Copy a listing | "Run it again": a new draft with the title, description, flyer, venue, ticket types and group prices of an earlier listing, new dates to fill | Y12 | **Built 2026-11-19** with Part 2 (Manage › Details › Make a copy) |

## Decisions

| # | Part | Decision | Default taken | Status |
|---|---|---|---|---|
| Y1 | 1 | How many people a ticket type may admit | 1–20; each person gets their own ticket (X39); the free registration admits one | **Decided (2026-11-19, built at the founder's request).** |
| Y2 | 1 | How group prices count | By the tickets in one order (a Couple counts two), the best tier reached applies to every ticket; up to three tiers, a bigger group always gets more off | **Decided (2026-11-19, built at the founder's request).** |
| Y3 | 1 | A promo code and a group price together | Never added: each ticket gets the larger; a code that is not better is not used (nor spent) | **Decided (2026-11-19, built at the founder's request).** |
| Y4 | 1, all | How it is opened | On request per organizer (feature flag `tickets.group_pricing`, allowSubjects), then everyone | **Decided (2026-11-19, built at the founder's request).** |
| Y5 | 2 | Seats and stock of a run | Per show: each show is a whole event in a run | **Decided (2026-11-19, built at the founder's request).** |
| Y6 | 2 | When a run's money is ready | 48 hours after each show, show by show | **Decided (2026-11-19, built at the founder's request).** |
| Y7 | 2 | A long run (an exhibition) | A show per day (or per opening), each sold until it starts | **Decided (2026-11-19, built at the founder's request).** |
| Y8 | 3 | First version of seating | Assigned seats (best seats left, side by side), not a map | **Decided (2026-11-19, the founder chose it).** |
| Y9 | 3 | Who sets up a venue's seating | The organizer (or a team member who manages events), on the website; a plan is reused by every event at that venue | **Decided (2026-11-19, built at the founder's request).** |
| Y10 | 4 | What a pass is | A purchase of N show credits for one series, each turned into a ticket for one show of the holder's choosing, while seats last | Planned default |
| Y11 | 5 | Complimentary tickets | Free tickets issued by the organizer to named people, counted against the seats, not refundable, shown as complimentary in reports | **Decided (2026-11-20, built at the founder's request).** |
| Y12 | 6 | What copying keeps | Everything but dates, sales, reviews, featuring and photos; promo codes still running come along with their expiry moved | **Decided (2026-11-19, built at the founder's request).** |

Planned defaults become decisions when each part is built; the founder may change any of them before then.
