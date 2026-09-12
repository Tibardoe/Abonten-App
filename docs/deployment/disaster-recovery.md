---
title: Disaster recovery
purpose: State what would be lost and how it would be recovered in each disaster scenario, what is verified and what is not, and the objectives that still need a decision.
audience: Founder, engineering, on-call responder
scope: Supabase (database, auth, storage), Vercel (web, admin), EAS (mobile), Cloudinary, third-party providers, secrets
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Disaster recovery

This page is deliberately honest about what has **not** been verified. Rollbacks of a bad release are in [rollback-and-recovery.md](rollback-and-recovery.md); this page is about losing a system, not shipping a bug.

## Objectives

| Objective | Status |
|---|---|
| Recovery time objective (how long the service may be down) | **NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED** (decision S6) |
| Recovery point objective (how much data may be lost) | **NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED** (S6) |
| Backup retention | Governed by the Supabase plan; **not recorded in the repository** — confirm in the dashboard and record here (S6) |
| Point-in-time recovery | Depends on the Supabase plan; not confirmed |
| Restore drill | **None recorded.** No restore into a scratch project has been performed and documented |

## What holds state, and where the copies are

| System | State | Copy / recovery source | Verified? |
|---|---|---|---|
| Supabase Postgres | Everything: users, events, tickets, ledgers, messages, audit log | Supabase-managed backups; the schema is fully reproducible from `supabase/migrations/` (the integration suite replays it on every CI run) | Schema replay: yes (CI). Data restore: **no** |
| Supabase Auth | Identities, sessions | Part of the Supabase project backup | No |
| Supabase Storage buckets | Claim documents, field evidence, message attachments, exports | Part of the project; per-bucket backup behaviour is the provider's | No |
| Cloudinary | Event/place/highlight media, avatars, ticket QR images, voice notes | **No second copy.** Database rows hold the URLs; if Cloudinary lost assets, the rows would point at nothing | — |
| Vercel (web, admin) | Stateless; environment variables | Redeploy from `main`; env values must be re-entered from the secret owner's records (`../security/secrets-and-environment.md`) | Redeploy: routine. Env re-creation: depends on the owner's records |
| EAS / stores | Build artefacts, update channels | Rebuild from the repository; store listings are outside the repository | Android build: routine |
| Third-party accounts | Paystack (money, settlement history), Hubtel, Resend, Google Cloud, Expo, Sentry | Provider-held; account recovery follows each provider's process; who holds the credentials is in the secrets document | — |
| Database-side config | `observability_config`, `notification_delivery_config`, `reward_program_setting`, field-ops settings, `platform_fee_config`, `admin_role_permission` | Inside the database backup; **seed values** are in migrations, live values are not | — |

## Scenarios

### A. Destructive migration or bad data change

Most likely disaster. Procedure: stop further writes to the affected area (kill switch or maintenance flag if one applies), restore the Supabase backup or point-in-time snapshot **into a new project**, copy the affected rows back through audited RPCs or a reviewed migration, reconcile (`run_financial_reconciliation`), record an incident. Never restore over production wholesale without the founder's decision. See [supabase-migrations.md](supabase-migrations.md) and [rollback-and-recovery.md](rollback-and-recovery.md) §Database.

### B. Supabase region outage

The project is in the EU (Paris). During an outage the web, admin and mobile apps fail on every data call; the health cron cannot run, so the `self` row goes stale (Admin › Monitoring shows "down" only once Supabase is back). There is no multi-region failover. Actions: status message on the site (there is no status page — post on the official social accounts), monitor the provider's status page, verify with the recovery checklist afterwards. Payments started during the outage: Paystack may have charged; the webhook will retry and `finalizePaystackPayment` is idempotent, and `recover_stale_payment_attempts` handles attempts stuck in initiated/pending — run the payments runbook §6 afterwards.

### C. Vercel outage or account loss

Web and admin unavailable; the database and mobile direct reads keep working, but every mobile call to `/api/mobile/**` fails. Recovery: redeploy to a new Vercel project from `main`, re-enter environment variables, repoint DNS, update `observability_config` and `notification_delivery_config` with the new URL, re-verify the Paystack webhook URL in the Paystack dashboard.

### D. Cloudinary loss

Media disappears; tickets remain valid (the QR code text is in the database; the image is a convenience). Recovery: none for lost assets — organizers and users re-upload. Mitigation to consider: a periodic export of Cloudinary assets to a bucket (roadmap; `../specifications/future-improvements.md`).

### E. Secret or account compromise

Follow `../incident-response/leaked-secret.md`, `../incident-response/admin-compromise.md`, `../incident-response/database-exposure.md`. Supabase keys have been rotated twice before (2026-09), so that path is exercised.

### F. Loss of the single operator

The founder is today the only incident commander and holds provider access (decision S1). Recovery of the service depends on a second person having access to Vercel, Supabase, Paystack, the domain registrar, GitHub and the secret store. **Whether such a second person exists is NOT DETERMINED FROM CODE.**

## Recovery order (any scenario)

1. Database reachable and schema at the expected migration (`supabase migration list` against the project).
2. Web deploy healthy (signed-out page, sign-in, a Server Action).
3. Config rows point at the right URL and tokens (health cron, notification delivery).
4. Paystack webhook URL correct; a test payment on preview.
5. Health panel green; `run_financial_reconciliation` clean.
6. Mobile: nothing to redeploy unless the API URL changed (then an EAS update).
7. Incident row closed with a timeline; this page updated with what was learned.

## Decisions and actions required

| Item | Owner | Register |
|---|---|---|
| Set recovery objectives; confirm and record backup retention and point-in-time availability | Founder | S6 |
| Perform and document a restore drill into a scratch project | Engineering, after S6 | S6 |
| Second operator with provider access | Founder | S1 |
| Cloudinary secondary copy | Engineering, if approved | Roadmap |
