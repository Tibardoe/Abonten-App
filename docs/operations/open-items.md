---
title: Open-item register
purpose: One table of every known open item across the programme — what kind of item it is, who owns it, what evidence closes it and whether it blocks anything — so no gap is mistaken for something finished.
audience: Founder, operations, engineering, legal counsel, compliance reviewer
scope: Items surfaced by the documentation programme (2026-09-12) plus pre-existing register items that remain open; detail lives in the linked registers and specifications
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Open-item register

Status vocabulary: **Decision required** (business) · **Legal review** (counsel) · **Verification required** (official evidence) · **Pending** (engineering or QA work not yet done) · **Closed** (with date). "Blocking?" says what the item blocks; "No" means the product can keep operating as documented.

Detail for each ID: legal items A–G in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md); business items O/R/F/M/W/P/S/D in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); designs in [../specifications/README.md](../specifications/README.md).

## Items named in the programme brief

| ID | Item | Category | Status | Owner | Evidence required | Blocking? | Detail |
|---|---|---|---|---|---|---|---|
| O1 | Support hours, timezone, response targets, escalation, goals-vs-commitments | Operations | Decision required | Business (founder) | Approved support operating policy recorded in the decision document | No — Terms §19 truthfully says none is published | [support-operating-policy.md](support-operating-policy.md) |
| S2 | Responsible disclosure and `security.txt` | Security / Legal | Implemented and **PRODUCTION VERIFIED** (2026-09-12: live file 200 / text-plain, policy anchor present); **Legal review** of safe-harbour wording still open (D3); `Expires` renewal due before 2027-03-12 | Security (founder) / Legal | Counsel-approved wording | No — page states no safe harbour is offered yet | [../security/responsible-disclosure.md](../security/responsible-disclosure.md) |
| A2 | Data Protection Commission registration | Compliance | Verification required | Company (founder with counsel) | Official registration evidence, or counsel's confirmation that registration is not required | Blocks publishing the Privacy Policy as final | [../legal/dpc-registration.md](../legal/dpc-registration.md) |
| A4 | Business Operating Permit | Compliance | Verification required; **Legal/business compliance review** of which permits apply | Company (founder) | Permit reference from the district assembly | No (internal record) | [../legal/business-operating-permit.md](../legal/business-operating-permit.md) |
| M1 | Mobile EAS update and device verification of the branch's mobile changes | Release | **BUILD VERIFIED** (preview build `598fdb7f`, preview update `d5102dde`, 2026-09-12) and **DEVICE VERIFIED** for sign-in links, drawer rows, social icons, support row and copyright (dev client + EAS preview APK, signed out). **DEVICE VERIFICATION PENDING** for Settings hub rows and non-English locales (needs a signed-in test account). **PRODUCTION: not applicable** — no production build exists; first production build and store release are a business decision | Engineering / QA; founder for the production decision | Signed-in device test record; production build and update ids | Before claiming the mobile changes are live to users | [../mobile/release-verification.md](../mobile/release-verification.md) |

## Further open items found during repository inspection

| ID | Item | Category | Status | Owner | Evidence required | Blocking? | Detail |
|---|---|---|---|---|---|---|---|
| L1 | Counsel review of the four legal drafts (Terms 1.2-draft, Privacy 1.2-draft, Cookie 1.0-draft, Security 1.2-draft) and effective dates | Legal | Legal review | Legal | Counsel's approval; effective dates set | Blocks status Published | `../legal/README.md` |
| B4 / S5 | Cookie consent for attribution and abuse-detection identifiers | Legal / Engineering | Legal review; implementation gated | Legal → Engineering | Counsel decision on B4 | No (Cookie Policy discloses everything) | `../specifications/cookie-consent.md` |
| B7 / O6 | Minimum age and age gate | Legal / Product | Legal review; decision required | Legal → Founder | Age set by counsel; option chosen | No (Terms §2 states none is set) | `../specifications/age-gate.md` |
| B5 / O3 / O2 | Data-export timelines, identity standard, self-service export | Legal / Product | Legal review; decision required | Legal → Founder | Confirmed statutory timeline; build approval | No (manual procedure exists) | `../specifications/data-export.md` |
| B3 / B9 / R1–R9 | Retention periods and purge jobs for nine data sets | Legal / Finance / Engineering | Legal review; decision required | Counsel, finance, founder | Periods recorded; jobs built | No (Privacy §9 says "to be confirmed") | `../specifications/retention-jobs.md` |
| O4 / M3 | Appeals workflow; reporter outcome notices | Product | Decision required | Founder | Approved workflow | No (contact-support path documented) | `../specifications/appeals-workflow.md` |
| O5 | Account-deletion grace period | Product | Decision required | Founder | Decision | No (immediate deletion is documented) | `../OPERATIONAL_DECISIONS_REQUIRED.md` |
| S1 | Incident commander deputy and on-call order | Operations | Decision required | Founder | Named deputy with provider access | Risk item; see disaster recovery | `../incident-response/README.md` |
| S6 | Disaster-recovery objectives, backup retention confirmation, restore drill | Operations | Decision required; drill pending | Founder / Engineering | Recorded objectives; drill report | No | `../deployment/disaster-recovery.md` |
| S3 / S4 | Secret-rotation schedule; `google-services.json` in git | Security | Decision required | Founder | Recorded schedule; decision | No | `../security/secrets-and-environment.md` |
| SEC-003 | Postgres minor-version patch; Supabase Auth hardening toggles | Security | Pending (owner's dashboard action) | Founder | Dashboard confirmation | No | `../security/README.md` |
| SEC-004 | Cron service-role JWT to Supabase Vault | Security | Pending | Engineering | Migration applied via MCP | No | `../security/README.md` |
| F1 / F3 | Payout cadence and minimum payout | Finance | Decision required | Finance | Recorded policy | No (help centre says no fixed turnaround) | `../finance/settlement-ledger-and-payouts.md` |
| F2 | Paystack Transfers switch-on | Finance / Engineering | Decision required; live test pending | Founder / Finance | Documented low-value live transfer | No (manual payouts work) | `../security/payment-security.md` |
| F6 / F7 | Reconciliation cadence; chargeback procedure | Finance | Decision required | Finance | Recorded routine | No | `../finance/README.md` |
| W1 / W2 | Rewards launch audience and rule order | Product | Decision required | Founder | Decision; programme switched on | No (shadow mode) | `rewards-operations.md` |
| P1–P4 | Field programme pilot, rates, payout day, contractor agreement | Operations / Legal | Decision required; E8 legal review | Founder / Legal | Decisions; signed agreements | No (programme off) | `../field-operations/README.md` |
| D2 | iOS build and release | Release | Pending (D-U-N-S blocker); F3 legal for store labels | Founder / Engineering | Apple developer account; TestFlight device test | No (documented as not available) | `../specifications/future-improvements.md` |
| D3 / D5 | Native review of drafted UI translations; localization of legal and help content | Product | Decision required | Founder | Reviewer sign-off; scope decision | No (English governs) | `../specifications/future-improvements.md` |
| F2 (legal) | Google Play Data safety form matches the Privacy Policy | Compliance | Verification required at each release | Founder | Play Console form reviewed | Before the next store release | `../LEGAL_REVIEW_REQUIRED.md` |
| E1–E9 | Payments and consumer-terms review (fee non-refundable, tax, liability, governing law, credit not e-money, incentives, contractor status, chargebacks) | Legal | Legal review | Legal | Counsel's decisions | Blocks Terms Published | `../LEGAL_REVIEW_REQUIRED.md` |
| M4 | Organizer access to attendee emails and phones | Trust / Engineering | Decision required | Founder | Decision (mask by default or accept) | No (Terms impose limits) | `../OPERATIONAL_DECISIONS_REQUIRED.md` |

## How to use

- Add a row when a new gap is found; never delete one — mark it **Closed (YYYY-MM-DD)** with the evidence reference.
- A row's status must match the linked register; update both in the same change and add a changelog line.
- `npm run check:docs` requires this file to exist and to be reachable from the hub; it does not (yet) check row consistency.
