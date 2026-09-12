---
title: Deployment and release (operations view)
purpose: The release routine from an operator's point of view — what ships where, in what order, and what to check afterwards. Engineering detail is in docs/deployment.
audience: Operations, founder, engineering
scope: apps/web, apps/admin (Vercel), apps/mobile (EAS), supabase/migrations
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Deployment and release (operations view)

| Part | How it ships | Trigger |
|---|---|---|
| Database | Migration files in `supabase/migrations/` applied to the live project **via the Supabase MCP `apply_migration`**, never `supabase db push` (the local ledger and the remote ledger differ by design — see `../deployment/supabase-migrations.md`) | An engineer, before the code that depends on it |
| Web (`abontenhub.com`) | Vercel project `abonten`, region `cdg1`, builds from `main` | Merge to `main` |
| Admin (`admin.abontenhub.com`) | Vercel project `abonten-app-admin` | Merge to `main` |
| Mobile (Android) | EAS Build (`preview` APK, `production`); JS-only changes via EAS Update on the matching channel | Manual `eas build` / `eas update` |
| Cron / edge | Part of migrations; edge function deployed via Supabase | Engineer |

## Order for a change that touches everything

1. Migration applied live (additive first; never drop columns the running code reads).
2. Merge to `main` → web and admin deploy.
3. Mobile: `eas update --channel production` for JS changes; a new build when native modules or permissions changed (e.g. `expo-camera` was added in 2026-09 and needed a build).
4. Post-release checks (below).

## Post-release checks (10 minutes)

- Admin › Monitoring: health all green including `self`; no new error groups; Sentry release has no spike.
- A signed-out visit to `/`, `/events`, `/legal/terms`, `/help` on the web; sign in; open `/manage/my-events`.
- Admin console signs in and the dashboard loads.
- Mobile: open the app on an Android device; Home loads; a push arrives for a test notification (Notifications › Resend to yourself).
- `npm run check:docs` passed in CI (documentation validation).

## Communicating

User-visible changes to policies: version bump + effective date per `../legal/versioning-and-effective-dates.md`, and a Broadcast when material. Downtime: Broadcast before and after, incident row throughout.

## Rollback

Vercel: promote the previous deployment. Mobile: `eas update --republish` of the previous update or roll the channel back. Database: forward-only — write a new migration that reverts; never edit applied files. Programme kill switches: `REWARDS_KILL_SWITCH`, `FIELD_OPS_KILL_SWITCH`, `PAYSTACK_TRANSFERS_ENABLED`. Detail: `../deployment/rollback-and-recovery.md`.
