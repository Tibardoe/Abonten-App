---
title: User guides (index)
purpose: Point staff to the public help centre content and summarise the differences between the website and the app that support most often needs.
audience: Support, operations
scope: apps/web/src/content/help/** (public); web vs app behaviour
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# User guides (index)

The public help centre is served at **abontenhub.com/help** from `apps/web/src/content/help/`. Edit the Markdown there; the site rebuilds it. Metadata block per page: `title`, `summary`, `order`, `lastUpdated`, `status`, `owner`.

## Pages

**For customers** (`customers/`): getting-started · finding-events-and-places · tickets-and-checkout · payments-and-payment-methods · your-tickets · refunds-and-cancellations · bookings · reviews-and-highlights · messaging · reporting-a-problem · notifications · rewards-and-credit · web-vs-app

**For organizers** (`organizers/`): creating-and-publishing-events · selling-tickets-and-promo-codes · event-day-check-in · cancelling-an-event · finance-payouts-and-settlement · promoting-your-event

**For place owners** (`place-owners/`): claiming-and-verifying-a-place · managing-your-place · bookings-reviews-and-messaging · promoting-your-place

**Account, privacy and safety** (`account/`): profile-and-settings · privacy-and-your-data · deleting-your-account · restricted-accounts

## Web vs app quick table

| | Web | Android app |
|---|---|---|
| Tickets | Manage › My Tickets | Tickets tab |
| Wallet | Side menu › Wallet | Account › Wallet |
| Delete account | Settings › Security | Settings › Security (double confirm) |
| Support | Messages › Contact Abonten Support; Help centre card | Account › Help & support |
| QR scanner | — | Organizer › event › Attendees › Scan |
| Voice notes, push, reminders | — | ✓ |
| Field team tools | `/field` | — |
| Legal / help | footer, side menu | drawer, Settings rows (open the website) |

## Writing rules for public help

Plain English; describe controls by label; never include internal identifiers, table names or staff procedures; mark features that are not generally available (rewards, field programme) as such; when behaviour differs by platform, say which. Run `npm run check:docs` before merging.
