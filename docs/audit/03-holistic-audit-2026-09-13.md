---
title: Holistic platform audit — 2026-09-13
purpose: Record what a whole-platform, adversarial audit of Abonten Hub found on 2026-09-13 (product, money, security, reliability, growth, cost, operations), what was fixed the same day, what was deliberately deferred and why, and an honest health assessment.
audience: Founder, engineering, operations, future auditors
scope: apps/web, apps/mobile, apps/admin, packages/*, supabase/, production project sderrexhawjbmsugndcq, Vercel, third-party providers
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Holistic platform audit — 2026-09-13

Branch `feat/holistic-audit-hardening`. Everything marked **fixed** shipped on that branch with tests; the four migrations were applied to production the same day. Everything marked **deferred** is listed with the reason.

## 1. Executive summary

Abonten Hub is, technically, far ahead of its market stage. The money path (Paystack verify + webhook racing through one idempotent finaliser, customer-paid fee model, double-entry credit ledger, reconciliation cron opening incidents), the access model (RLS plus service-role-only money tables plus per-action identity checks), the admin console (RBAC, step-up, append-only audit) and the documentation programme are of a quality most companies reach only after their first serious incident. The 2026-09 audits already closed the obvious gaps.

The audit therefore concentrated on what previous passes had not looked at across boundaries, and found **three production defects that could lose money or break legal promises**, all verified against the live database and all fixed:

1. **Deleting an account erased the financial record.** The live foreign keys cascade from the Auth user through `user_info` into transactions, tickets, payment attempts, organizer ledger entries, payouts, fee entries and every event the person organized — including other people's tickets. One tap on "Delete account" removed all of it; no refund, payout or reconciliation could be reconstructed afterwards.
2. **Two retention jobs had failed on every run.** Supabase refuses direct deletes from `storage.objects`; the claim-document and verification-evidence purges did exactly that, so the 30-day and retention-period promises were not being kept (and, before the guard existed, the same statements never removed the files anyway).
3. **A refund could be requested twice.** The Paystack refund call preceded the status compare-and-set, so two simultaneous callers (double tap, or customer + admin) could both send a partial refund, which Paystack accepts.

Beyond defects, the largest business risk is not technical: production holds **10 users, 19 events (1 upcoming), 4 places** and GH₵ 1,344 of lifetime volume. The platform is built for scale it does not yet have; the binding constraint is supply (events and places worth discovering) and the organizer/place-owner acquisition motion, not the code.

## 2. Critical findings (fixed)

| # | Finding | Attack / failure | Impact | Fix |
|---|---|---|---|---|
| C1 | Account deletion hard-deleted the Auth user; cascades removed `transaction`, `ticket`, `payment_attempt`, `organizer_ledger_entry`, `payout`, `payout_account`, `platform_fee_entry` (via `transaction`) and `event` (+ attendees' tickets) | A buyer deletes their account after a refund dispute → the transaction is gone. An organizer deletes after selling tickets → every attendee's ticket and the organizer's ledger vanish; attendees cannot be refunded; the 20% credit-review payout guard has nothing to look at | Loss of financial records (tax, dispute, reconciliation), silent loss of customers' tickets, organizer balance disappears (could also be used to erase a negative balance after chargebacks) | Migration `20260913200100`: `account_deletion_blockers()` (409 while attendees, payout in flight, unpaid earnings or admin), `anonymize_deleted_account()`, then `auth.admin.deleteUser(id, shouldSoftDelete = true)`; `user_status` 4 "Deleted"; proxy / mobile auth / admin Users module aware; web signs out after deletion; help centre and privacy docs rewritten. Integration + unit tests |
| C2 | `purge-reviewed-claim-documents` and `purge-verification-evidence` failed nightly (`storage.protect_delete`) | Documents people uploaded to prove ownership (IDs, registrations) stayed in the bucket indefinitely | Privacy promise broken (Privacy Policy says 30 days); incident not surfaced (cron failures are not on the health panel) | Migration `20260913200000`: `storage_purge_queue` + `storage_purge_config`; retention SQL enqueues; `storage-purge-dispatch` cron → `POST /api/maintenance/storage-purge` → `@abonten/services/platform/storagePurgeCore` deletes through the Storage API (claim/finish, 8 attempts). Verified by hand in production: both functions now run clean |
| C3 | `issueRefundCore` called Paystack before `record_refund_hold`'s status transition | Double-tap "Cancel ticket", or a customer cancelling while an admin refunds; both read `successful`, both request a partial refund; Paystack accepts partial refunds up to the full charge | Customer refunded twice for one ticket; organizer ledger holds once | Migration `20260913200200`: `claim_transaction_refund()` (CAS on a new `refund_claimed_at` column, released on failure, 2-minute expiry; migration `20260913200300`) gates the Paystack call; `cancelUserTicketCore` flips the ticket with a CAS. Integration test proves one of three concurrent claimants wins |

## 3. Other findings and what was done

### Security

| Finding | Status |
|---|---|
| No security headers on web or admin (no `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; HSTS only implicit from Vercel) — the admin console could be framed for clickjacking of finance/ban actions | **Fixed**: headers on every response of both apps |
| No Content-Security-Policy | **Deferred**: Paystack inline script, Google Maps and Cloudinary need an allow-list tested in report-only mode first |
| Postgres `15.8.1.044` has outstanding security patches; Supabase leaked-password protection off | **Owner action** (dashboard); both already on the security register (SEC-003) |
| 16 `SECURITY DEFINER` discovery RPCs callable by `anon` | Reviewed: intentional (public discovery with moderation filtering inside); no data beyond the public branch. No change |
| `get_event_attendee_contacts`, `cancel_event_and_release_tickets`, `issue_free_ticket`, `request_organizer_payout` callable by `authenticated` | Reviewed: each re-checks `auth.uid()` ownership inside the function. No change |
| Webhook: signature over the raw body, `timingSafeEqual`, replay-safe through the idempotent finaliser | Sound. No change |
| Rate limiting is database-backed (`consume_rate_limit`), so it works across Vercel instances | Sound. No change |
| Money-path lockdown (client grants revoked), `guard_staff_managed_columns`, `protect_user_info_privileged_columns` | Sound. Deletion function runs as owner, which the guards allow by design |

### Financial integrity

| Finding | Status |
|---|---|
| `finalizePaystackPayment`: CAS lock, amount + currency verified against Paystack, self-healing stuck locks, per-member fulfilment retry | Sound |
| Payout request: advisory lock per organizer/currency, available balance recomputed inside the lock | Sound |
| Reconciliation cron (`run_financial_reconciliation`, every 30 min) covers paid-without-earning, succeeded-without-ticket, negative inventory, stuck attempts, credit invariants, field-ops | Sound; no incidents open |
| Refund of a multi-ticket order fires only when every ticket sharing the transaction is cancelled | Sound (see C3 for the race that remained) |
| Account deletion could erase a negative organizer balance | Closed by C1 (unpaid/negative balances are visible; deletion is refused while money is owed *to* the organizer; a negative balance is preserved against the anonymised profile) |

### Reliability and operations

| Finding | Status |
|---|---|
| Cron failures are invisible unless someone queries `cron.job_run_details` (that is how C2 hid for days) | **Deferred**: add a `cron` health check that surfaces the last failed run per job on Admin › Monitoring (small; uses the existing health-check pattern) |
| 29 pg_cron jobs, all healthy except the two in C2 | Verified |
| Disaster recovery: objectives, backup retention and a restore drill are undetermined (S6) | **Owner action**; unchanged |
| Single operator holds all provider access (S1) | **Owner action**; unchanged |

### Growth, discovery and SEO

| Finding | Status |
|---|---|
| No `robots.txt`, no `sitemap.xml`, no structured data; event and place pages had Open Graph but nothing search engines can turn into rich results | **Fixed**: `/robots.txt`, `/sitemap.xml` (published events ending within 30 days, published places, static pages; hourly), schema.org `Event` and `LocalBusiness` JSON-LD, `metadataBase` |
| Ticket holders received no reminder before the event unless they set one in the app | **Fixed**: hourly `event-reminders` job, in-app + push, once per person per session, respects self-set reminders and quiet hours |
| Root metadata description was a placeholder | **Fixed** |
| Supply: 1 upcoming event, 4 places | **Business**: the platform cannot retain users without content. Recommendation below |
| Rewards (referrals, invites, rebates) and Discovery (alerts, digests) and Abonten Weekly all exist but ship off / shadow | Correct for the stage; nothing to switch on before supply exists |

### Cost

| Finding | Status |
|---|---|
| Health check every 2 min → ~720 Vercel invocations/day; notification delivery and purge dispatch only call out while something is due | Negligible at any plausible scale |
| Sentry `tracesSampleRate` 0.1 across all three apps | Reasonable |
| Google Maps key restrictions, Cloudinary transformation quotas | Not inspectable from the repository; **owner to confirm** HTTP-referrer / package restrictions on the browser key |
| Supabase: 130 MB database; 186 indexes the advisor reports as unused, 27 unindexed foreign keys | No action at this volume; revisit at 100k rows |

### Product and UX (not changed)

- Web has no push channel; time-critical notices (cancellation, reminder) reach web-only users in-app and, for cancellations, by email. Web push or an email fallback for reminders is a product decision.
- Web "Delete account" had no confirmation and left the person on the settings page afterwards — **fixed** (confirm, sign out, go home).
- The mobile deletion warning said tickets and places "will be gone for good" — **fixed** to describe what actually happens (source only; reaches devices with the next EAS update).
- `/events` without a location shows "No address set"; explore depends on geolocation. A default city (Accra) for signed-out and no-permission visitors would remove the emptiest first impression. **Deferred** (product call).

## 4. Implemented changes (files)

- `supabase/migrations/20260913200000_storage_purge_queue.sql`, `…200100_account_deletion_preserves_records.sql`, `…200200_refund_claim_and_event_reminders.sql`, `…200300_refund_claim_column.sql` — applied to production via the Supabase MCP.
- `packages/services/src/profile/deleteAccountCore.ts` (+ unit test), `organizer/issueRefundCore.ts`, `tickets/cancelUserTicketCore.ts`, `platform/storagePurgeCore.ts`, `admin/users/usersAdminCore.ts`.
- `packages/types/src/database.types.ts` (new tables/functions), `adminTypes.ts` (`Deleted` status).
- `apps/web`: `next.config.ts` (headers), `src/proxy.ts` (matcher), `src/config/supabase/middleware.ts` and `api/mobile/_lib/authedClient.ts` (status 4), `api/maintenance/storage-purge/route.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx` (`metadataBase`, description), `components/atoms/JsonLd.tsx`, `utils/structuredData.ts`, event and place pages, `components/organisms/SecurityInputFields.tsx`, help page `account/deleting-your-account.md`.
- `apps/admin`: `next.config.ts` (headers), Users list/detail/actions (Deleted status).
- `apps/mobile/app/(app)/settings/security.tsx` (wording).
- Integration tests: `account-deletion`, `refund-claim-and-reminders`, `storage-purge`.
- Docs: privacy retention and rights-operations, scheduled jobs, application security, changelog, PROJECT.md §33, this report.

## 5. Deferred changes

| Item | Why not now |
|---|---|
| Content-Security-Policy | Needs a report-only rollout with Paystack, Maps and Cloudinary allow-lists verified in a browser |
| Cron-failure health check on Admin › Monitoring | Worth doing; kept out to keep this change set reviewable. Small follow-up |
| Cloudinary purge of a deleted account's media | Needs the HTTP purge route design in `specifications/retention-jobs.md`; not a data-loss risk |
| Product analytics (funnel: visit → sign-up → view → checkout → paid) | The admin Platform Analytics reads the database; a client-side funnel needs a tool choice and a cookie-consent decision (cookie policy is still a draft) |
| Web push / email fallback for reminders | Product decision; reminders are transactional but email volume policy is undecided (legal G1/G3) |
| Default city for visitors without a location | Product decision |
| Indexes for the 27 unindexed foreign keys | No measurable effect at current volume |
| Retention framework (`retention_policy` table) | Gated on decisions R1–R9 |

## 6. Remaining manual work

- **Founder**: apply the Postgres minor upgrade and enable leaked-password protection (Supabase dashboard); confirm Google Maps browser-key restrictions; decide DR objectives (S6), a second operator (S1), analytics tooling, default-city behaviour; iOS remains unbuilt (D-U-N-S).
- **Deploy**: merge to `main` so Vercel ships `/api/maintenance/storage-purge`, the headers, robots, sitemap and JSON-LD. Until then the dispatcher receives 404s (harmless; the queue is empty).
- **Counsel**: reviews and messages of deleted users are kept anonymised rather than deleted (B9); the help page and privacy docs now say so.
- **Device**: the reminder push and the reworded deletion dialog need the next EAS update and an Android check; iOS unverified.
- **Not verified**: a real deletion in production (integration-tested on the replayed stack only); the storage purge route against a real bucket object (core tested with a stubbed Storage call; SQL side tested for real).

## 7. Growth and revenue notes (no code)

- **Supply first.** With one upcoming event there is nothing to retain users with. The highest-leverage work is operational: the Field Ops programme exists and is switched off; the Ashanti pilot decision is the unblocker. A lightweight organizer-import path (paste a flyer + date, staff publish on the organizer's behalf with their consent) would seed the catalogue faster than waiting for self-serve.
- **Revenue is already in place** (5% customer-paid fee, featuring for events and places, promoter commissions, rebates in credit). Do not add more monetisation before volume; the fee model is clean and defensible.
- **Growth loops exist** (referrals, invites, weekly editions, personalised alerts) and are correctly dormant. Switch them on in this order once supply exists: Weekly → event alerts → referrals.

## 8. Health assessment

| Area | Score (1–5) | Note |
|---|---|---|
| Product | 3 | Complete feature set; empty marketplace |
| UX | 3 | Mobile polished; web explore depends on geolocation; first impression thin |
| Growth | 2 | Mechanisms built, none live, no funnel analytics |
| Revenue | 3 | Clean model, negligible volume |
| Security | 4 | Strong access model; headers now in place; CSP and Postgres patch outstanding |
| Financial integrity | 4 | Ledgers, reconciliation, idempotency; C1/C3 closed today |
| Performance | 4 | Region pinned, ISR on listing pages, measured search |
| Scalability | 4 | Nothing in the architecture breaks before 100k users; costs are linear |
| Reliability | 3 | Cron failures invisible (C2 hid); no DR drill |
| Operations | 4 | Admin console covers the workflows; single operator |
| Maintainability | 4 | Shared service layer, tests, documentation discipline |

Overall: a well-engineered platform waiting for a marketplace. The code is not what stands between Abonten and growth; supply and distribution are.
