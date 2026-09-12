---
title: A2 — Data Protection Commission registration status
purpose: Track, as an organisational compliance item with evidence, whether Abonten Hub Ltd is registered as a data controller with Ghana's Data Protection Commission — and list the privacy-policy language that depends on the answer.
audience: Founder, compliance reviewer, legal counsel
scope: Registration under the Data Protection Act, 2012 (Act 843); the public Privacy Policy; the privacy programme documents
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# A2 — Data Protection Commission registration status

**STATUS: VERIFICATION REQUIRED**

Registration status **cannot** be inferred from the source code, the Privacy Policy, the database, the domain, the company registration documents (Form 3, Beneficial Ownership Profile, Constitution — none mentions the Commission) or the existence of a privacy page. Only an official record supplied by the founder or counsel counts as evidence. Until then the Privacy Policy carries the placeholder `[DPC REGISTRATION STATUS — TO BE CONFIRMED]` and **nothing anywhere may say "Abonten is DPC registered".**

## Record

| Field | Value |
|---|---|
| Registration status | **VERIFICATION REQUIRED** (registered / not registered / application pending / registration not required — to be determined with counsel) |
| Registration number / reference | Not supplied |
| Registration date | Not supplied |
| Renewal / expiry date | Not supplied (Act 843 registrations are renewable; the period is for counsel to confirm) |
| Registered organisation name | Abonten Hub Ltd (company registration CS015010126) — the name that would appear on any registration |
| Organisation contact for the Commission | Not designated. Candidate: privacy@abontenhub.com plus the registered postal address (P.O. Box 465, Weija, Accra) |
| Data protection supervisor / officer | Not designated. Whether Act 843 requires Abonten to appoint one is a question for counsel (legal B-series) |
| Evidence / reference | None held in the repository. When supplied, record the certificate or portal reference here **without** committing the document itself if it carries personal data |
| Last verification date | — (never verified) |
| Responsible owner | Founder (with counsel) |

## Privacy Policy language that depends on the final status

| Location | Current wording | If registered | If registration is not required | If not registered but required |
|---|---|---|---|---|
| Privacy §1 | "Data Protection Commission registration: [DPC REGISTRATION STATUS — TO BE CONFIRMED]. Nothing in this policy should be read as a claim of registration with, or approval by, the Commission until that line is completed." | State the registration number and date | State that registration is not required and why, if counsel advises stating it | Do not publish the policy as final; register first |
| Privacy §1 draft banner | "our registration status with the Data Protection Commission is still to be confirmed" | Remove | Remove, adjust | Keep |
| Privacy §14 (complaints) | "You also have the right to complain to Ghana's Data Protection Commission" | Keep; optionally add the Commission's contact details from its official site | Keep | Keep |
| Privacy §4 (cross-border transfers) | "subject to legal review" | Counsel confirms whether transfers must be notified or registered (legal B2) | Same | Same |
| Help `account/privacy-and-your-data` | mentions the right to complain to the Commission | Keep | Keep | Keep |
| Internal: `../privacy/privacy-rights-operations.md`, `../incident-response/pii-exposure-and-data-breach.md` | breach-notification steps refer to the Commission (legal B6) | Add the registration reference to the notification template | Confirm the notification route applies regardless | Same |

## Procedure to close this item

1. Founder or counsel determines whether Abonten Hub Ltd must register (legal A2 / B-series) and, if so, completes registration with the Commission.
2. Record every field above with the evidence reference and the verification date.
3. Replace the placeholder in Privacy §1 (minor version bump per `versioning-and-effective-dates.md`; the document still needs counsel's approval before an effective date).
4. Update `../LEGAL_REVIEW_REQUIRED.md` A2 to Decided, `../operations/open-items.md` A2 to closed, and the changelog; run `npm run check:docs`.
