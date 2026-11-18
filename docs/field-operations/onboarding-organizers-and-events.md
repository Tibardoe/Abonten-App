---
title: Onboarding an organizer and their event
purpose: How the event branch of the wizard works, the organizer-consent rule, and when the commission is released.
audience: Field members
scope: /field/onboard/[id] (event branch)
status: Approved
version: 1.2
lastReviewed: 2026-11-18
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Onboarding an organizer and their event

Choose the **event** branch when the person you meet runs events rather than a fixed place.

## Steps

1. **Organizer** — name and phone; the same **owner-consent** step as for places (OTP to their phone, or consent link). The organizer's Abonten account exists from that moment, and a new account takes the name you typed, so the event reads "Hosted by <name>" until they choose a username. If the page reloads after "Send the code", the code box and the link are still there.
   - **Working by phone:** the easiest path is to ask them to reply with the 6-digit code and type it in yourself. The link page says the same, for anyone whose phone won't take the code there.
2. **The event** — title, description, category and type, date(s) and times, venue and pin, ticket types (free or priced). An event that **starts in the past is refused**.
   - **Venue and pin:** search for the venue or address and pick it; that sets the pin. In person you can also use "Set the location" while standing at the venue (offline mode only: working by phone, your own position is not the venue).
   - **Address shown on the listing:** the search fills it with the place's name; add what helps people find it ("opposite the DVLA head office"). The pin stays where the search put it.
   - **Several days:** "Add another date" for a festival or a weekly night (up to 30 dates). Each date has its own start and end; people pick the date on the event page.
   - **Paid events:** one price, or "Add another ticket type" for Early bird / Regular / VIP (up to 10, each with a name and an optional quantity).
   - **Free events:** "People register and get a free ticket with a QR code" is ticked by default, so the organiser sees who is coming and checks them in. Untick it only for an open event with no list at the door.
3. **Flyer** — uploaded under your signed folder (a flyer from anywhere else is refused).
4. **Submit** — the event is created through the normal event path **under the organizer's account**; the onboarding is submitted for the lead's review.

## Commission timing

Event onboardings pay on the **event_started** release policy: after the lead verifies and the holding period passes, the sweep waits until the event's start time has passed and then checks it was not cancelled or moderated. Until then the row shows "waiting on release" — not a problem, just the rule. A cancelled event pays nothing.

The submission page judges an event onboarding on the event itself (published, still the organiser's, a flyer, a description, started), not on a place's photos and opening hours.

**Known gap:** the sweep reads the event's single start time. An event listed with several dates keeps its dates separately and has no single start time, so its commission would never be released. Commissions are off today; fix the sweep (read the first date) before switching them on for events.

## What the organizer must do

Sign in with the phone number that received the code; the event is under Manage › Events (web) or Organizer › Events (app). They set payout accounts and manage sales exactly like any organizer — see the public help centre, which you can show them.

## Do not

- List an event you have not confirmed with the organizer, or one they do not have the right to sell tickets for.
- Use your own or a colleague's number for consent — refused, and a breach.
- Create ticket prices the organizer did not give you.
