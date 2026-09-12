---
title: Operational decisions register
purpose: List every business or policy question the code does not answer, which the documentation therefore marks as undecided, with who decides and what changes once decided.
audience: Founder, operations lead, finance, engineering
scope: Product, operations, finance, support and field-programme policy
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Operational decisions register

Where a document says **NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED** or **POLICY DECISION REQUIRED**, the question is here. Legal questions are in `LEGAL_REVIEW_REQUIRED.md`; this register is for choices the business can make itself.

Status: **Open** · **Decided** (record the decision, date and follow-up).

## Support and account operations

| # | Decision | Where it is referenced | Default assumed in the docs | Status |
|---|---|---|---|---|
| O1 | Support hours and target first-response time for the in-app support queue | `operations/account-and-support-procedures.md`, help centre | None promised | Open |
| O2 | Identity-verification standard for privacy requests (signed-in session only? additional proof for high-risk requests?) | `privacy/privacy-rights-operations.md` | Signed-in session | Open |
| O3 | Whether to build a self-service data export | `privacy/privacy-rights-operations.md` | Manual export by staff | Open |
| O4 | Appeals: whether to add a formal appeal path for moderation and account actions, and who decides appeals | `operations/content-moderation-policy.md`, help centre | Contact support; admin with `users.restore` / `moderation.restore` reviews | Open |
| O5 | Account deletion grace period (currently immediate and irreversible) | `privacy/data-retention-and-deletion.md` | Immediate | Open |
| O6 | Minimum age and whether to add an age gate / date-of-birth field | Terms §2, Privacy §13 | None | Open (also legal B7) |

## Retention (no automatic job exists today)

| # | Data | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| R1 | `transaction`, `ticket`, `ticket_checkout`, `payment_attempt` after account deletion | `privacy/data-retention-and-deletion.md` | Indefinite | Open |
| R2 | `organizer_ledger_entry`, `payout`, `platform_fee_entry`, credit ledger | same | Indefinite (append-only by design) | Open |
| R3 | Messages and attachments (no expiry, no user-initiated conversation deletion) | same | Indefinite | Open |
| R4 | `notification` and `notification_delivery` rows | same | Indefinite | Open |
| R5 | `phone_otp_send_log` (per-IP send log) | same | Indefinite | Open |
| R6 | Observability: `app_error_event`, `app_error_group`, `app_request_metric`, `health_check_result`, `incident` | same | Indefinite | Open |
| R7 | Field-programme evidence photos: `evidence_retention_days` is 365 but housekeeping only *counts* due items — implement the purge or change the number | same, `field-operations/` | 365 days stated, not enforced | Open |
| R8 | Reports and `report_event` timeline after resolution | same | Indefinite | Open |
| R9 | `admin_audit_log` — permanent by design; confirm | same | Permanent | Open |

## Finance

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| F1 | Payout processing cadence and turnaround commitment to organizers | help centre, `finance/settlement-ledger-and-payouts.md` | "Working days, no fixed turnaround" | Open |
| F2 | Whether to switch on Paystack Transfers (`PAYSTACK_TRANSFERS_ENABLED`) after live verification | `finance/`, `security/payment-security.md` | Off; manual transfers | Open |
| F3 | Minimum payout amount (code enforces only > 0) | `finance/` | None | Open |
| F4 | Service fee rate (`platform_fee_config`, seeded 5%) and any per-currency overrides | `finance/` | 5% | Decided (5%, 2026-08-30) |
| F5 | Goodwill refund/credit policy for platform failures (who may grant, limits — code: goodwill credit GH₵ 50/user/month) | `finance/refunds-and-cancellations.md`, `operations/rewards-operations.md` | Admin discretion within the code limit | Open |
| F6 | Reconciliation cadence and who reviews `run_financial_reconciliation` output | `finance/reconciliation.md` | Daily review by finance admin | Open |
| F7 | Dispute (chargeback) response procedure with Paystack: evidence pack, deadlines | `finance/disputes-and-chargebacks.md` | Manual, case by case | Open |

## Moderation and trust

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| M1 | Report-volume thresholds for automatic hiding (none exist; all actions are manual) | `operations/content-moderation-policy.md` | Manual only | Open |
| M2 | Strike policy: what leads to suspension vs ban, and durations | same | Admin judgement | Open |
| M3 | Whether to notify reporters of outcomes | same, help centre | No detailed outcome shared | Open |
| M4 | Handling of `get_event_attendee_contacts` exposure (organizers see attendee emails and phones) — acceptable as-is, or mask by default | `security/application-security.md` | As-is, with Terms obligations | Open |

## Rewards programme (all rules currently in shadow mode, visibility off)

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| W1 | Launch date and audience (`reward_program_setting.audience`: staff → beta → all) | `operations/rewards-operations.md` | Staff only | Open |
| W2 | Which rules to switch from shadow to live, and in what order | same | None live | Open |
| W3 | Monthly budget (code default max(GH₵ 1,000, 25% trailing net revenue)) — confirm | same | Code default | Decided by owner 2026-09-10; confirm at launch |

## Field programme (shipped switched off)

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| P1 | Pilot region, campaign dates and team roster (owner's call per PROJECT.md §28) | `field-operations/README.md` | Not started | Open |
| P2 | Commission rates to make live (seeded rules inactive) | same | Seeded, inactive | Open |
| P3 | Weekly payout day and who is the second approver | `field-operations/earnings-and-payouts.md` | Weekly, second admin required by DB | Open |
| P4 | Contractor agreement / code-of-conduct sign-off process for team members | same | Handbook acknowledgement | Open (also legal E8) |

## Security operations

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| S1 | Incident commander / on-call rota (today: founder) | `incident-response/README.md` | Founder | Open |
| S2 | Responsible-disclosure policy and security contact | Security page | In-app support | Open |
| S3 | Secret-rotation schedule (Supabase keys rotated twice in 2026-09; others ad hoc) | `security/secrets-and-environment.md` | Ad hoc | Open |
| S4 | `google-services.json` tracked in git: accept (Firebase client config is not secret by design) or move to EAS secrets | same | Accepted, documented | Open |
| S5 | Cookie consent banner (depends on legal B4) | Cookie Policy | None | Open |

## Product

| # | Decision | Referenced in | Default assumed | Status |
|---|---|---|---|---|
| D1 | Facebook and LinkedIn presence — footers now show only X, Instagram and TikTok (the accounts that exist) | Footers, `SocialLinks.tsx` | Removed | Decided in this programme; confirm |
| D2 | iOS release timeline (blocked on D-U-N-S number) | `mobile/README.md`, help centre | Not available | Open |
| D3 | Translations of new UI strings (consent line, settings rows) — Akan and others currently English or machine-drafted | `changelog/README.md` | English fallback | Open |
| D4 | Whether the web app should get a QR ticket scanner (mobile only today) | `documentation-audit-matrix.md` | Mobile only | Open |
