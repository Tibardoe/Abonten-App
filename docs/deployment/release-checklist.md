---
title: Release checklist
purpose: The checks before, during and after a production release, so nothing that the tests cannot see is forgotten.
audience: Engineers, founder
scope: Any release touching web, admin, mobile, database or configuration
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Release checklist

## Before merging to `main`

- [ ] CI green: typecheck, Biome, unit tests + API parity, docs validation, web build, admin build, integration suite.
- [ ] Migrations (if any) applied to production via MCP, advisors clean, file names match the ledger.
- [ ] Env vars added to Vercel (web/admin), EAS (mobile), GitHub secrets, `.env.example` files and `docs/security/secrets-and-environment.md`.
- [ ] Documentation updated for behaviour/permission/job/table/integration changes; `docs/changelog/README.md` line added; legal text version bumped if user rights or data handling changed (with counsel where major).
- [ ] Public copy does not describe shadow/off programmes as live.
- [ ] `PROJECT.md` section for significant architectural changes.
- [ ] Manual checks for UI changes: web in a browser (signed out and in), Android emulator/device for mobile.

## Release

- [ ] Merge with `--no-ff`; watch the Vercel deployments for web and admin.
- [ ] Mobile: `eas update --channel production` for JS changes; `eas build` + store steps for native changes.
- [ ] If a URL/domain changed: `observability_config`, `notification_delivery_config`, Supabase Auth redirects, Paystack webhook URL, `EXPO_PUBLIC_API_BASE_URL`.

## After (first 15 minutes)

- [ ] Admin › Monitoring: health all green incl. `self`; no new error groups; Sentry release without spikes.
- [ ] Web smoke: `/`, `/events`, an event page, `/legal/terms`, `/help` signed out; sign in; `/manage/my-events`; a checkout to the payment step (test mode on preview only).
- [ ] Admin smoke: sign in, dashboard, one list per changed module.
- [ ] Mobile smoke on Android: open, Home, sign in, Tickets, a push test.
- [ ] Cron jobs still active (`cron.job`) if the database changed.
- [ ] Reconciliation incident list empty.

## After (day 1)

- [ ] Support queue for release-related reports.
- [ ] Reconciliation and rewards/field health clean.
- [ ] Close the release note in `docs/changelog/README.md` with the deploy date.
