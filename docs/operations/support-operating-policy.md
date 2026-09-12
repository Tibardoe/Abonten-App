---
title: O1 — Support operating policy (decision record)
purpose: Hold the business decision on support days, hours, timezone and response targets in one place, list every location that must change once it is made, and prevent any internal working target from being presented as a commitment before then.
audience: Founder (decision owner), support, documentation maintainers
scope: All public and internal statements about support availability and response times, across web, mobile, help centre, legal pages and handbooks
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# O1 — Support operating policy (decision record)

**Current public position (accurate, published in Terms §19):** Abonten does not publish support hours or response targets. Nothing in the product, the help centre or the legal pages promises a response time. This document does not change that; it records the decision that would.

## 1. Decision required

| Field | Decision |
|---|---|
| Support operating days | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** |
| Support operating hours | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** |
| Timezone | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** (Ghana observes GMT year-round; still a decision to state it) |
| Normal response target (first reply) | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** |
| Urgent / security response target | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** |
| Whether targets are goals or contractual commitments | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** — until decided, every target is an internal goal and must be published (if at all) as "we aim to", never as a guarantee |
| Escalation procedure (who, when, how the user is told) | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** (interim internal routing exists: `account-and-support-procedures.md`, `../privacy/privacy-rights-operations.md`, `../incident-response/README.md`) |
| Weekends and Ghanaian public holidays included? | **NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** |
| Emergency or 24/7 availability | **Not offered.** Do not state or imply otherwise anywhere |

Decision owner: the founder. Record the decision here (with date) and in `../OPERATIONAL_DECISIONS_REQUIRED.md` O1, then work through §4.

## 2. What the product exposes today (verified)

| Channel | Exists? | Where | Notes |
|---|---|---|---|
| In-app support conversation | Yes | Web: Messages › "Contact Abonten Support", help-centre card; app: Account › Help & support | Requires a signed-in account; lands in Admin › Support queue |
| Support email | Yes (since 2026-09-12) | support@abontenhub.com — Terms §19, help-centre card ("Can't sign in?"), restricted-account page, footers, mobile drawer | Workspace alias; not routed into the admin queue |
| Privacy email | Yes (since 2026-09-12) | privacy@abontenhub.com — Privacy §11, §15; help `account/privacy-and-your-data` | Same mailbox |
| Security / emergency-security contact | Yes (since 2026-09-12) | security@abontenhub.com — Security page, `/.well-known/security.txt` | No response target published |
| Support form | No | — | Nothing to document |
| Help centre | Yes | `/help` (26 pages) | Self-service |
| Phone support | No | — | The registrar's phone numbers are not support lines |
| Social media DMs | Not a support channel | Official X / Instagram / TikTok accounts | Procedure: redirect to app or email |

## 3. Every location that mentions support availability or timing (audit 2026-09-12)

Public statements are limited to "not published" or "working days" with no commitment. Internal documents hold working targets; each is labelled here as **internal — not a commitment**.

| Location | Current wording | Type | Action when O1 is decided |
|---|---|---|---|
| Terms §19 (`apps/web/src/content/legal/terms.md`) | "Support hours and response times have not yet been published." | Public | Replace with the decided days/hours/targets, worded as goals unless counsel approves a commitment (legal E4) |
| Privacy §11, §15 | "respond within the period required by law" | Public (statutory, B5) | Leave unless counsel changes it |
| Security page › Responsible disclosure | "has not yet published a target time for acknowledging or resolving reports" | Public | Insert the urgent/security target |
| Help `organizers/finance-payouts-and-settlement` | "processed by staff on working days; Abonten does not currently commit to a fixed turnaround" | Public (F1) | Update with F1, not O1 |
| Help-centre contact card, restricted-account page, footers, mobile drawer | Channels only, no timing | Public UI | Optionally add "Support hours: …" copy via i18n |
| `operations/account-and-support-procedures.md` §Email channels item 6 | "none published (decision O1)" | Internal | Record the policy; set Gmail auto-reply text if desired |
| `privacy/privacy-rights-operations.md` | "acknowledge within 3 working days; treat every request as due within 30 days" | **Internal interim working practice — not a commitment**; statutory period is legal B5 | Align acknowledgement with the normal target; the 30 days stays until B5 |
| `admin/support.md` | "Acknowledge within the target in decision O1" | Internal | Fill in |
| `admin/support-scenarios.md` §2 / `finance/reconciliation.md` | "refund pending < 3 working days → explain timing" | Internal (Paystack processing time, not a support target) | No change |
| `incident-response/README.md` severity table | "Same working day" and similar per severity | **Internal response targets for staff — not published, not contractual** | Reconcile the urgent target with S1/S2 rows |
| `incident-response/vulnerability-report.md` step 2 | "acknowledge receipt within 1 working day" | **Internal working target — not published** | Replace with the decided security target |
| `field-operations/conduct-privacy-security.md` | "report a lost phone to your lead the same day" | Internal conduct rule for team members (not a support promise) | No change |
| `specifications/appeals-workflow.md` | "a response target set with O1" | Internal spec | Fill in when O4 and O1 are decided |
| `specifications/data-export.md` | interim acknowledgement wording | Internal spec | Align with B5 |

## 4. Update list once the decision is made

1. Terms §19 (minor version bump per `../legal/versioning-and-effective-dates.md`; counsel confirms wording if any target is contractual — legal E4).
2. Privacy Policy §15 and Security page "What happens next" (minor bumps).
3. Help centre: `customers/getting-started` (or a new "Contacting support" page), `customers/reporting-a-problem`, `account/restricted-accounts`, `account/privacy-and-your-data`, `organizers/finance-payouts-and-settlement` (with F1).
4. Customer, organizer and place-owner guides (the help pages above are the public guides; `../user-guide/README.md` index).
5. Field operations handbook: `../field-operations/README.md` escalation section and `../field-operations/team-lead-guide.md`.
6. Admin handbook: `../admin/support.md`, `../admin/support-scenarios.md`, `../admin/README.md`.
7. Internal procedures: `account-and-support-procedures.md`, `../privacy/privacy-rights-operations.md`, `../incident-response/README.md`, `../incident-response/vulnerability-report.md`, `../security/responsible-disclosure.md`.
8. Contact / support UI if the founder wants hours shown: help-centre card, restricted-account page, mobile drawer (new i18n keys in six locales).
9. Registers: `../OPERATIONAL_DECISIONS_REQUIRED.md` O1 → Decided; `open-items.md` O1 → closed; changelog line; `npm run check:docs`.

## 5. Rule until then

No document, screen, email template or auto-reply may state hours, response times, resolution times, emergency support, 24/7 availability or an SLA. Internal working targets stay in internal documents, labelled as such.
