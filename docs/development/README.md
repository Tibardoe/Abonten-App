---
title: Development guide
purpose: How to set up, run, test and contribute to the Abonten monorepo, and the conventions the codebase follows.
audience: Engineers (human and AI agents)
scope: Local development of apps/web, apps/admin, apps/mobile, packages/*
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Development guide

| Page | Contents |
|---|---|
| [setup.md](setup.md) | Prerequisites, install, env files, running each app |
| [testing.md](testing.md) | Unit tests, the Supabase integration suite, API parity, what is not tested |
| [ci.md](ci.md) | GitHub Actions jobs and what each guards |
| [conventions.md](conventions.md) | Architecture rules, code style, Server Action shape, Supabase clients, forms, styling, git flow |
| [documentation-validation.md](documentation-validation.md) | `npm run check:docs` — rules, running locally, fixing failures |

Working rules for AI agents live in the repository root `CLAUDE.md`; the engineering changelog in `PROJECT.md`.
