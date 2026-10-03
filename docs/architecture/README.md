---
title: Architecture documentation
purpose: Index of the technical architecture documents for developers and technical administrators.
audience: Engineering
scope: Monorepo, database, APIs, jobs, integrations
status: Approved
version: 1.3
lastReviewed: 2026-10-02
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
| [trust-and-verification.md](trust-and-verification.md) | Place and organizer verification: model, state machine, evidence storage, permissions |
| [discovery-search-and-recommendations.md](discovery-search-and-recommendations.md) | Unified search and ranking, `@handle`, opt-in alerts, recommendation digests, preference centre, switches |
| [weekly-highlights.md](weekly-highlights.md) | Abonten Weekly: editions, sections and items, read-time validity, caching, editorial workflow, jobs, switches, rollout |
| [mobile-offline-media-and-sync.md](mobile-offline-media-and-sync.md) | Mobile offline query cache, Spotlight player lifecycle, live comments and likes, search vocabulary and date parsing, search filters, follower counts |
| [internationalisation.md](internationalisation.md) | The six languages: shared catalogs, how each surface picks a language, server and database text, number and date formatting, per-page messages on the website, the native app's Intl polyfills, the checks |
| [search-languages.md](search-languages.md) | Search in the reader's language: one folding rule for letters (accents, Twi and Ewe letters), date words in five languages as data, everyday words of four more languages in the vocabulary and their direction, the typo fallback of a dated search, and every other place typed text is compared |
| [explore-lists.md](explore-lists.md) | The lists of events and places on Explore: the one rule for which events are on and what each filter means, how a page and the Explore rows are chosen, the card every list returns, cursors, and what the apps send |
| [web-resilience.md](web-resilience.md) | What people see when a request fails or the database is unreachable (website, admin console, app start-up), 404 against 500, timed rebuilds, confirmations, and how few requests a page opens with |
| [perf/discovery-2026-09.md](perf/discovery-2026-09.md) | Measured search, Explore list and recommendation cost on a 100,000-event synthetic catalogue |
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
