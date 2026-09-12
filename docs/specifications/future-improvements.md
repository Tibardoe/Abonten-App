---
title: Future improvements (P2 roadmap)
purpose: Document, for planning only, the security, localization, iOS and operational improvements identified during the documentation programme — each tied to the register item or verified gap it addresses.
audience: Founder, engineering, operations
scope: Items not required for the current release and not gated on a single decision
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Future improvements (P2 roadmap)

Nothing here is scheduled. Items are grouped by theme; each names the evidence (a register item, a security-register entry or a verified gap) so the roadmap stays grounded.

## Security

| Improvement | Evidence | Notes |
|---|---|---|
| Move the cron service-role JWT to Supabase Vault | SEC-004 (`security/README.md`) | Migration plus cron command change; no app change |
| Apply pending Postgres minor-version patches; enable Supabase Auth leaked-password protection and related toggles | SEC-003 | Owner's dashboard action; record in the changelog |
| Log staff views of personal data (`users.view_pii`) as audit entries, not only edits | `security/access-control-model.md` §Logging | Small change in the admin service layer |
| Purge Cloudinary media on account deletion and on content removal | Security register; retention spec | Needs the HTTP purge route described in `specifications/retention-jobs.md` |
| Row-level enforcement of account status (RLS keyed on `status_id`) so a stale session cannot act | `security/README.md` | Today enforcement is session revocation plus app-layer checks |
| Second factor for admin sign-in (beyond Google OAuth, allowlist and step-up) | Security register: no MFA | Consider requiring Google Workspace 2-step for allowlisted accounts first |
| Security headers review (content security policy, permissions policy) for web and admin | `security/application-security.md` §Improvement items | Test with Paystack inline script and Google Maps before enforcing |
| Regression tests for every self-authorising SECURITY DEFINER function | SEC-001 follow-up | Integration suite |
| Secret-rotation calendar | Decision S3 | Procedure exists in `security/secrets-and-environment.md` |

## Localization

| Improvement | Evidence | Notes |
|---|---|---|
| Native review of the machine-drafted consent and Settings strings (fr, es, de, pt) and an Akan translation of the consent line | Decision D3 | UI strings only |
| Translate the legal documents **after** counsel approves the English originals | Decision D5; legal register | Translated legal text needs its own review; publish English as the governing version |
| Translate the help centre by demand, most-viewed pages first | Decision D5 | The Markdown loader would need a locale-aware folder layout (`content/help/<locale>/…`) and a fallback to English |
| Mobile: localized app-store listing text | Decision D5 | Store metadata is outside the repository |

The current state, stated plainly: the product UI exists in six locales; **all public legal and help content is English only**; the Akan locale falls back to English for the newest strings.

## iOS

| Fact | Evidence |
|---|---|
| The iOS app has **never been built**; every "Android app" statement in the public help centre is deliberate | `mobile/README.md`, `mobile/guide/ios-vs-android.md`, decision D2 |
| Blocker: a D-U-N-S number for the Apple developer account | Memory of the 2026-09-06 programme; decision D2 |
| iOS push credentials have never been configured or checked | `documentation-audit-matrix.md` (Push row) |
| App Store privacy labels and the account-deletion requirement must be prepared before submission | Legal F3 |
| Universal links and the `abonten` scheme are declared for both platforms in the Expo config; only Android has been verified | `mobile/guide/permissions-notifications-and-device.md` |

Work when D2 is decided: developer account, EAS iOS build profile, push key, TestFlight run, device verification of every flow in `journeys/`, then update the help centre's platform wording.

## Operational

| Improvement | Evidence | Notes |
|---|---|---|
| Named deputy incident commander and contact order | Decision S1 | `incident-response/README.md` |
| Scheduled reconciliation review and monthly sign-off | Decision F6 | `finance/reconciliation.md` |
| Published support hours and response target | Decision O1 | Help centre, Terms §19 |
| Admin action to cancel an event with refunds (today an engineer runs it via the service role) | `documentation-audit-matrix.md` (Event cancellation row) | Reuse the existing cancellation core with step-up and audit |
| Account deletion should cancel the user's upcoming events (refunding attendees) or block deletion until they do | `privacy/privacy-rights-operations.md` §3 (engineering gap) | Decide the behaviour first (extends O5) |
| Per-type notification preferences for users (today only reward emails can be switched off) | `documentation-audit-matrix.md` (Notifications row) | `notification_preference` already exists as the storage |
| Web QR ticket scanner | Decision D4 | Mobile covers event day today |
| Google Play Data safety form review at each release | Legal F2 | Add to `deployment/release-checklist.md` once counsel confirms the mapping |
| Disaster-recovery drill and recorded objectives | Decision S6 | `deployment/disaster-recovery.md` |
| Enforce field-evidence purge (365 days configured, only counted) | Decision R7 | Part of the retention framework |
| Add web push or email fallbacks for time-critical notices (web has no push) | `documentation-audit-matrix.md` (Push row) | Product decision first |
