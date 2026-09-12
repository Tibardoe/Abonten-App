---
title: Operational decisions register
purpose: The authoritative list of every business or policy question the code does not answer — what each one affects, what the system does today, a recommended default where one is appropriate, and who decides.
audience: Founder, operations lead, finance, engineering
scope: Product, operations, finance, support, security-operations and field-programme policy
status: Approved
version: 1.1
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Operational decisions register

Where a document says **NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED** or **POLICY DECISION REQUIRED**, the question is here. Legal questions are in [LEGAL_REVIEW_REQUIRED.md](LEGAL_REVIEW_REQUIRED.md); this register is for choices the business can make itself.

**How to read the "Recommended default" column.** It offers a common, industry-typical starting point so the decision is quicker to make. **A recommendation is not a policy.** Nothing in the product, the public documents or the internal procedures has been changed to assume any recommendation; each stays open until the founder records a decision in the Status column. Where a sensible default cannot be offered without legal or financial advice, the column says so.

**How to record a decision.** Change Status to `Decided (YYYY-MM-DD): <decision>`, then follow the "What changes once decided" note: update the documents named in "What it affects", add a line to [changelog/README.md](changelog/README.md), and open engineering work where a specification exists under [specifications/](specifications/README.md).

Status values: **Open** · **Decided** (with date and decision).

## Support and account operations

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| O1 | Support hours and target first-response time | Help centre and Terms §19 wording; privacy acknowledgement timing; incident communications | Support is the in-app support conversation (Admin › Support queue, assignment, replies). No hours or targets exist anywhere in code or copy. | Publish a coverage window in Ghana time and a first-response target of one working day, with same-day handling for payment and safety issues. Document in `operations/account-and-support-procedures.md` and the help centre once chosen. | Open |
| O2 | Identity-verification standard for privacy requests | `privacy/privacy-rights-operations.md`; DSAR handling (legal B5) | A signed-in support conversation is the only check. No procedure for people who cannot sign in. | Signed-in session for routine requests; for users locked out, verification by a one-time code to the registered phone or email; never collect identity documents. | Open |
| O3 | Self-service data export | `privacy/privacy-rights-operations.md` §1; Privacy Policy §11 (says "handled manually") | No export exists. An engineer with service-role access runs read-only queries per the data inventory. | Build the export described in [specifications/data-export.md](specifications/data-export.md) after legal B5 confirms timelines; keep the manual procedure as the interim path. | Open |
| O4 | Formal appeals path for moderation and account actions | `operations/content-moderation-policy.md` §6; help `account/restricted-accounts`; Terms §14 | No appeal record exists. Users contact support; an admin holding `users.restore` or `moderation.restore` reverses an action and the reversal is audited. | Adopt the recorded, second-reviewer workflow in [specifications/appeals-workflow.md](specifications/appeals-workflow.md); publish the route and a response target once O1 is set. | Open |
| O5 | Account-deletion grace period | `privacy/data-retention-and-deletion.md` §2; help `account/deleting-your-account`; Terms §15 | Deletion is immediate and irreversible: the credit account is closed (pending rewards voided, balance forfeited), then the auth user is deleted and the database cascades. | Many consumer services use a 14–30 day soft-delete window that signing in again cancels. This needs engineering (a pending-deletion state, a scheduled hard delete) and a Privacy Policy change; decide before building. | Open |
| O6 | Minimum age and age gate | Terms §2; Privacy §13; sign-in flows | No date-of-birth field exists in the schema and no age check exists in any sign-in path. Events carry no age-restriction field. | Counsel sets the age (legal B7). If a gate is required, start with the attestation option in [specifications/age-gate.md](specifications/age-gate.md); a ticketing and payments product commonly requires users to be adults. | Open (also legal B7) |

## Retention (no automatic job exists for these data sets)

What retention affects in every row: Privacy Policy §9 and §10, `privacy/data-retention-and-deletion.md` §4, the scope of any access request, storage cost, and the retention-job design in [specifications/retention-jobs.md](specifications/retention-jobs.md). Periods for financial records and audit logs need counsel and finance input (legal B3, B9, E3); **no number is chosen in this register**.

| # | Data | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|
| R1 | `transaction`, `ticket`, `ticket_checkout`, `payment_attempt` after account deletion or after the event | Kept indefinitely; survive account deletion by design | Retain for the statutory financial record-keeping period counsel confirms, then anonymise rather than delete (ledgers reference them). | Open |
| R2 | `organizer_ledger_entry`, `payout`, `platform_fee_entry`, credit ledger | Append-only, kept indefinitely | Same period as R1; these are the books of account. | Open |
| R3 | Messages, attachments, reactions | No expiry; no user-initiated conversation deletion | Keep while either participant's account exists; purge a fixed period after both accounts are deleted or a conversation is archived by both sides. Period to be decided. | Open |
| R4 | `notification`, `notification_delivery` | Kept indefinitely | Delivered or read rows are commonly purged after 90–180 days; failed deliveries kept for the same window for diagnosis. | Open |
| R5 | `phone_otp_send_log` (per-IP send log) | Kept indefinitely | 30–90 days is typical for abuse analysis; longer adds no value. | Open |
| R6 | Observability: `app_error_event`, `app_error_group`, `app_request_metric`, `health_check_result`, `incident` | Kept indefinitely | Raw events and metrics 30–90 days; error groups and incidents kept (they are small and are the incident history). | Open |
| R7 | Field-programme evidence photos (`evidence_retention_days` = 365) | Housekeeping counts items due for purge but never deletes them | Keep 365 days as configured and implement the purge (spec R7 in `specifications/retention-jobs.md`). | Open |
| R8 | Reports, attachments and `report_event` after resolution | Kept indefinitely | Keep for the strike or appeal window decided in M2 and O4, then anonymise the reporter and purge attachments. | Open |
| R9 | `admin_audit_log` | Permanent by design (append-only, no delete grant) | Keep permanent; confirm with counsel (legal B9). | Open |

## Finance

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| F1 | Payout processing cadence and turnaround commitment | Help `organizers/finance-payouts-and-settlement`; Terms §8; `finance/settlement-ledger-and-payouts.md` | Earnings settle 48 hours after the event; an organizer requests a payout; an admin makes a manual bank or mobile-money transfer and records it. No cadence or promise exists. | Publish a processing window (for example "requests are processed within three working days") only after operations confirms it can be met. | Open |
| F2 | Switching on automated Paystack Transfers | `finance/`, `security/payment-security.md`; admin Finance | Code exists behind `PAYSTACK_TRANSFERS_ENABLED`, default off, never verified against live Paystack. | Keep off until a documented low-value live test succeeds; then enable for the finance role only and keep the manual path as fallback. | Open |
| F3 | Minimum payout amount | Payout request validation; help centre | Code enforces only an amount greater than zero. | Set a minimum that covers the transfer cost of the chosen payout method. Amount to be decided by finance. | Open |
| F4 | Service fee rate | `platform_fee_config` | 5%, configured in the database | — | Decided (2026-08-30): 5% |
| F5 | Goodwill refund and credit policy for platform failures | `finance/refunds-and-cancellations.md`; `operations/rewards-operations.md` | Admins may grant goodwill credit; the code caps it at GH₵ 50 per user per month. Cash goodwill refunds are admin-initiated refunds with step-up. | Keep the code cap; require a second admin above a threshold finance sets; record the reason in the audit note every time. | Open |
| F6 | Reconciliation cadence and reviewer | `finance/reconciliation.md`; admin Finance overview | `run_financial_reconciliation` exists and can be run from the console; nothing schedules a review. | Run and review every working day; monthly written sign-off by the finance role. | Open |
| F7 | Chargeback response procedure | `finance/disputes-and-chargebacks.md`; Terms §7 | Disputes are recorded from Paystack webhooks and surfaced in admin Finance; response is manual. | Standard evidence pack (ticket issuance record, check-in record, communications) submitted inside Paystack's deadline; pause the buyer's account only after review. | Open |

## Moderation and trust

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| M1 | Automatic hiding at a report-volume threshold | `operations/content-moderation-policy.md`; admin Reports | Every moderation action is manual; reports are prioritised by category. | Auto-hide (not remove) after several distinct reporters in high-priority categories, with mandatory human review within a working day. Threshold to be decided; needs engineering. | Open |
| M2 | Strike policy and durations | Same; admin Users | Admins choose suspend, ban or restore case by case; no strike count exists. | A published ladder (warning → short suspension → longer suspension → ban) with severe cases skipping steps. Durations to be decided. | Open |
| M3 | Notifying reporters of outcomes | Same; help `customers/reporting-a-problem` | Reporters see no outcome. | Send a generic outcome notice ("action taken" / "no action") without details about the other party. Needs engineering. | Open |
| M4 | Organizer access to attendee emails and phones | `security/application-security.md`; Terms §8 | Organizers can view attendee contact details for their events; the Terms impose use limits. | Mask by default and reveal on demand with a logged reason. Needs engineering; decide whether the Terms alone are acceptable meanwhile. | Open |

## Rewards programme (all rules currently in shadow mode, visibility off)

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| W1 | Launch date and audience | `operations/rewards-operations.md`; help `customers/rewards-and-credit` | Programme visibility is off; audience setting is staff. | Staff → small beta → all, with the shadow decisions reviewed at each step. | Open |
| W2 | Which rules go live, in what order | Same | All rules record decisions without posting credit. | Enable low-risk rules first (loyalty fee rebate), referral rules last, each after a budget check. | Open |
| W3 | Monthly budget | Same | Code default: the greater of GH₵ 1,000 or 25% of trailing net revenue | — | Decided by owner 2026-09-10; confirm at launch |

## Field programme (shipped switched off)

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| P1 | Pilot region, dates and team roster | `field-operations/README.md` | Programme flag off; no campaign exists. | Owner's call (PROJECT.md §28). | Open |
| P2 | Commission rates to activate | Same | Seeded rules are inactive. | Activate the seeded rates for the pilot only; review after the first payout batch. | Open |
| P3 | Weekly payout day and second approver | `field-operations/earnings-and-payouts.md` | The database requires a second admin to approve a batch; no day is fixed. | A fixed weekday, with the second approver named in the register. | Open |
| P4 | Contractor agreement and code-of-conduct sign-off | Same; legal E8 | Handbook acknowledgement only. | Written agreement before first assignment; counsel drafts it (E8). | Open (also legal E8) |

## Security operations

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| S1 | Incident commander and on-call rota | `incident-response/README.md` | The founder is the only responder. | Name a deputy and a contact order; review quarterly. | Open |
| S2 | Responsible-disclosure policy and security contact | Public Security page; `incident-response/vulnerability-report.md` | Reports arrive through the in-app support conversation; no dedicated address or policy. | Publish a security contact and a short policy (safe-harbour statement, what to include, response target). See [specifications/support-and-security-contacts.md](specifications/support-and-security-contacts.md). | Open (also legal A3) |
| S3 | Secret-rotation schedule | `security/secrets-and-environment.md` | Supabase keys rotated twice in 2026-09; other secrets rotated ad hoc. | Rotate all third-party secrets on a fixed cadence (annually is common) and immediately on any suspected exposure. | Open |
| S4 | `google-services.json` tracked in git | Same | Tracked; it is Firebase client configuration, not a secret by design. | Accept and document (current state), or move to EAS secrets for tidiness. | Open |
| S5 | Cookie consent banner | Cookie Policy; `apps/web/src/proxy.ts` | No banner. Attribution and abuse-detection cookies are set on first visit. | Depends on legal B4. If required, implement the gated design in [specifications/cookie-consent.md](specifications/cookie-consent.md). | Open (depends on legal B4) |
| S6 | Disaster-recovery objectives: recovery time and data-loss tolerance, backup retention confirmation, restore-drill cadence | `deployment/disaster-recovery.md`; `security/database-security.md` | Supabase-managed backups; retention and point-in-time recovery depend on the plan and are not recorded in the repository. No restore drill is recorded. | Confirm the plan's backup retention in the Supabase dashboard and record it; set objectives; perform a restore drill into a scratch project at least twice a year. | Open |

## Product

| # | Decision | What it affects | Current implementation (from code) | Recommended default — *recommendation, not approved policy* | Status |
|---|---|---|---|---|---|
| D1 | Facebook and LinkedIn presence | Footers, `apps/web/src/components/molecules/SocialLinks.tsx`, mobile drawer | Only the three official accounts (X, Instagram, TikTok) are shown; the unused Facebook and LinkedIn icon files remain in the repository. | Keep only accounts that exist and are monitored. | Decided in this programme (icons removed); confirm |
| D2 | iOS release timeline | `mobile/README.md`; help `customers/web-vs-app` | iOS has never been built (blocked on a D-U-N-S number). | Owner's call; see [specifications/future-improvements.md](specifications/future-improvements.md). | Open |
| D3 | Translation of new UI strings | `changelog/README.md` | Consent line and Settings rows exist in six locales; Akan uses English; other translations were drafted without a reviewer. | Have a native reviewer check the drafted strings before the next mobile release. | Open |
| D4 | Web QR ticket scanner | `documentation-audit-matrix.md` | Mobile only. | Build only if organizers ask; the mobile scanner covers event day. | Open |
| D5 | Localization scope for public legal and help content | Legal pages, help centre (English only) | UI strings exist in six locales; legal and help Markdown are English only. | Translate legal text only after counsel approves the English original; translate the help centre by demand, starting with the most-viewed pages. | Open |
