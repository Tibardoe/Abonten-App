---
title: Specifications gated on open decisions
purpose: Technical specifications for work that is understood well enough to design but must not be built until a legal or business decision in the registers is recorded.
audience: Founder, engineering, legal counsel
scope: Cookie consent, age gate, data export, retention jobs, appeals workflow, support and security contacts, venue credit vouchers, the partner programme, and the future-improvements roadmap
status: Draft
version: 1.1
lastReviewed: 2026-11-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specifications gated on open decisions

Each document here separates two things on purpose:

1. **The technical design** — what exists in the code today, what would change, and how. Engineering can review and estimate this now.
2. **The decision it depends on** — a numbered item in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) or [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md). **Nothing in a specification is approved policy, and nothing is to be implemented until that item is marked Decided.**

Every specification ends with an **Approval required before implementation** section naming the exact register items.

| Specification | Gap it addresses | Blocking items |
|---|---|---|
| [shows-seats-and-pricing.md](shows-seats-and-pricing.md) | Group tickets and group prices (built), one listing for a run of shows, assigned seats, passes, complimentary tickets, copying a listing | Decisions Y1–Y12 (Y1–Y4, Y8 decided) |
| [cookie-consent.md](cookie-consent.md) | No consent banner; attribution and abuse-detection cookies set on first visit | Legal B4 · decision S5 |
| [age-gate.md](age-gate.md) | No minimum age, no date of birth, no age check | Legal B7 · decision O6 |
| [data-export.md](data-export.md) | No self-service data export; access requests are manual | Legal B5 · decision O3 · decision O2 |
| [retention-jobs.md](retention-jobs.md) | Nine data sets with no retention period or purge job | Legal B3, B9 · decisions R1–R9 |
| [appeals-workflow.md](appeals-workflow.md) | No formal appeal path for moderation and account actions | Decision O4 · decision M3 · legal E4 (wording) |
| [venue-credit-vouchers.md](venue-credit-vouchers.md) | Credits or vouchers a venue sells from its place page, not tied to a date, valid for N days, giftable, redeemed by scan at the venue (the follow-up to open-amount tickets) | Legal M6 (and M5 for a balance) · decisions V1–V9 in the specification |
| [partner-program.md](partner-program.md) | Other platforms and sellers (travel sites, hotel desks and concierges, tour operators, other apps, ticket agents, media) selling Abonten tickets for a share: partner links, an embeddable checkout, a Partner API and desk sales with allocations; organizers keep 100% of their ticket price. Design only, not built | Decisions PA1–PA22 · legal Q1–Q8 (with B4, E1, E3, E7, M5, N2, N3, N5) |
| [tickets-entry-and-teams.md](tickets-entry-and-teams.md) | Sending tickets, team accounts, stations, wristbands, outside tickets, resale controls, promoters | None: approved 2026-11-15 (X1–X45); legal N1–N9 open. Part 1 built; Part 2 stage 1 built |
| [support-and-security-contacts.md](support-and-security-contacts.md) | ~~No official address~~ — channels published 2026-09-12 (A3 Decided); responsible-disclosure section and `security.txt` published; remaining: support operating policy and safe-harbour wording | Decision O1 (`../operations/support-operating-policy.md`) · legal D3 (`../security/responsible-disclosure.md`) |
| [future-improvements.md](future-improvements.md) | P2 roadmap: security hardening, localization, iOS, operational improvements | Various (each entry names its item) |

## Priority mapping

- **P0 (done in this programme):** documentation, legal drafts, registers, placeholders, validation, official social links.
- **P1 (these specifications):** ready for review; implementation requires the founder's approval of the named decision and, where marked, counsel's confirmation.
- **P2 ([future-improvements.md](future-improvements.md)):** documented for planning only.
