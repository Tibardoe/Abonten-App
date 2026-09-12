---
title: Specifications gated on open decisions
purpose: Technical specifications for work that is understood well enough to design but must not be built until a legal or business decision in the registers is recorded.
audience: Founder, engineering, legal counsel
scope: Cookie consent, age gate, data export, retention jobs, appeals workflow, support and security contacts, and the future-improvements roadmap
status: Draft
version: 1.0
lastReviewed: 2026-09-12
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
| [cookie-consent.md](cookie-consent.md) | No consent banner; attribution and abuse-detection cookies set on first visit | Legal B4 · decision S5 |
| [age-gate.md](age-gate.md) | No minimum age, no date of birth, no age check | Legal B7 · decision O6 |
| [data-export.md](data-export.md) | No self-service data export; access requests are manual | Legal B5 · decision O3 · decision O2 |
| [retention-jobs.md](retention-jobs.md) | Nine data sets with no retention period or purge job | Legal B3, B9 · decisions R1–R9 |
| [appeals-workflow.md](appeals-workflow.md) | No formal appeal path for moderation and account actions | Decision O4 · decision M3 · legal E4 (wording) |
| [support-and-security-contacts.md](support-and-security-contacts.md) | ~~No official address~~ — channels published 2026-09-12 (A3 Decided); responsible-disclosure section and `security.txt` published; remaining: support operating policy and safe-harbour wording | Decision O1 (`../operations/support-operating-policy.md`) · legal D3 (`../security/responsible-disclosure.md`) |
| [future-improvements.md](future-improvements.md) | P2 roadmap: security hardening, localization, iOS, operational improvements | Various (each entry names its item) |

## Priority mapping

- **P0 (done in this programme):** documentation, legal drafts, registers, placeholders, validation, official social links.
- **P1 (these specifications):** ready for review; implementation requires the founder's approval of the named decision and, where marked, counsel's confirmation.
- **P2 ([future-improvements.md](future-improvements.md)):** documented for planning only.
