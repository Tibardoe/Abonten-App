---
title: Deployment
purpose: How each part of Abonten reaches production, the release checklist, and how to roll back or recover.
audience: Engineers, founder
scope: Vercel (web, admin), EAS (mobile), Supabase migrations and cron, provider configuration
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Deployment

| Page | Contents |
|---|---|
| [web-and-admin-vercel.md](web-and-admin-vercel.md) | The two Vercel projects, env, domains, build, redirects |
| [mobile-eas.md](mobile-eas.md) | EAS Build/Update, environments, channels, stores |
| [supabase-migrations.md](supabase-migrations.md) | Applying schema changes to production safely |
| [release-checklist.md](release-checklist.md) | Before / during / after a release |
| [rollback-and-recovery.md](rollback-and-recovery.md) | Rolling back each layer; database recovery; kill switches |
| [disaster-recovery.md](disaster-recovery.md) | Losing a system rather than shipping a bug: objectives (undecided), state and copies, scenarios, recovery order |

Operations view: `../operations/deployment-and-release.md`.
