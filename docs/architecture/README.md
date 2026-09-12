---
title: Architecture documentation
purpose: Index of the technical architecture documents for developers and technical administrators.
audience: Engineering
scope: Monorepo, database, APIs, jobs, integrations
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Architecture documentation

| Document | Covers |
|---|---|
| [system-overview.md](system-overview.md) | Runtime topology, repository structure, the "one rule", request paths, deployments |
| [feature-inventory.md](feature-inventory.md) | Every feature with app, role, entry point, tables, services/actions/API, permissions, notifications, payments, failure states |
| [roles-and-permissions.md](roles-and-permissions.md) | End-user roles (derived), admin RBAC, field roles, suspension, RLS map |
| [data-model-overview.md](data-model-overview.md) | Table groups, key relationships, status columns, partitions, unused tables |
| [integrations.md](integrations.md) | Each external service: what, where in code, config, failure behaviour |
| [observability.md](observability.md) | Self-hosted error/health/metric pipeline, Sentry projects, where to look, gaps |
| [shared-backend.md](shared-backend.md) | The service package and the A/B/C operation classification (existing) |
| [rewards-ledger.md](rewards-ledger.md) | Abonten Credit ledger and rewards engine (existing, with runbook) |
| [field-ops.md](field-ops.md) | The field programme (existing, with runbook) |
| [email-auth.md](email-auth.md) | Email OTP sign-in (existing) |
| Background jobs | `../operations/scheduled-jobs.md` |
| Environment variables | `../security/secrets-and-environment.md` |
| Deployment, CI, testing | `../deployment/`, `../development/` |

The engineering changelog and deep history remain in the repository-root `PROJECT.md` (§1–§29). The 2026-09-04 limitation audit (system map, register, roadmap) is in `../audit/`.
