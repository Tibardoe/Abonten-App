---
title: Abonten Hub documentation system
purpose: Explain how the documentation is organised, who owns it, how a document moves from draft to published, and how it is kept in step with the code.
audience: Everyone who writes or maintains Abonten documentation (engineering, operations, legal reviewers)
scope: The whole docs/ tree and the public content under apps/web/src/content
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Abonten Hub documentation system

Start at **[INDEX.md](INDEX.md)** — the hub that lists every document and the "symptom → procedure" index.

## Two homes, one rule

| Where | What lives there | Who reads it |
|---|---|---|
| `apps/web/src/content/legal/` and `apps/web/src/content/help/` | **Public** documents — Terms, Privacy Policy, Cookie Policy, Security overview, and the help centre for customers, organizers and place owners. Rendered by the website at `/legal/*` and `/help/*`, linked from the mobile app. | The public |
| `docs/` (this tree) | **Internal** documentation — handbooks, runbooks, policies, architecture, security, incident response, finance operations, troubleshooting, registers. | Abonten staff, field-team leads, engineers, reviewers |

The rule: **nothing in `docs/` is published to users, and nothing in `apps/web/src/content/` may contain internal detail** (file paths, table names, secrets, staff procedures, security weaknesses). `scripts/check-docs.mjs` enforces the second half mechanically as far as a script can.

Public content is kept inside the web app, not here, so that it is always present in the web build context and versioned with the code that renders it. `docs/legal/` holds the legal register, versioning rules and effective-date log that govern those files.

## Map of `docs/`

| Folder | Contents |
|---|---|
| `INDEX.md` | Hub and search index |
| `DOCUMENTATION_STANDARD.md` | Required metadata, templates, writing rules |
| `LEGAL_REVIEW_REQUIRED.md` | Register of items needing counsel or official confirmation |
| `OPERATIONAL_DECISIONS_REQUIRED.md` | Business/policy decisions the code cannot answer |
| `documentation-audit-matrix.md` | Feature × app × documented/accurate/gap |
| `documentation-coverage-matrix.md` | Feature × public / internal / technical document — where each thing is documented |
| `specifications/` | Technical specifications gated on open legal or business decisions (cookie consent, age gate, data export, retention jobs, appeals, contacts) and the P2 roadmap — designs, not approved policy |
| `legal/` | Legal register, versioning strategy, effective-date log |
| `privacy/` | Data inventory, retention and deletion, privacy-rights operations, cookies/storage inventory, processors |
| `security/` | Application, database, payment, infrastructure and access-control security; secrets and environment |
| `incident-response/` | Severity model and one runbook per incident family |
| `admin/` | Admin console handbook, one page per module, plus support scenarios |
| `field-operations/` | Field team handbook (members and leads) |
| `finance/` | Payments and ticketing runbook, state machines, refunds, settlement and payouts, reconciliation, disputes |
| `operations/` | "What do I do when…", moderation policy, notifications and email ops, rewards ops, account/support procedures, scheduled jobs, deployment and release |
| `troubleshooting/` | Problem → symptoms → causes → checks → resolution → escalation |
| `journeys/` | End-to-end journey maps per role |
| `web/`, `mobile/` | Product documentation for each app (`mobile/00–16` are historical phase logs) |
| `user-guide/` | Internal index of the public help set and the web-vs-app difference table |
| `architecture/` | System overview, feature inventory, roles and permissions, data model, integrations, background jobs, environment variables, plus the four existing deep dives |
| `development/` | Setup, testing, CI, conventions, documentation validation |
| `deployment/` | Vercel (web/admin), EAS (mobile), Supabase migrations, release checklist, rollback and recovery, disaster recovery |
| `changelog/` | Documentation changelog |
| `audit/` | The 2026-09-04 limitation audit (system map, register, roadmap) |

`PROJECT.md` at the repository root remains the engineering changelog and deep reference; `CLAUDE.md` holds working rules for AI agents. Neither is user documentation.

## Status system

Every document carries a `status`:

| Status | Meaning |
|---|---|
| **Draft** | Written, not yet checked by its owner |
| **Review required** | Complete, needs a named review (legal, compliance, finance, or the business owner) before it can be relied on |
| **Approved** | Reviewed and accepted by its owners; internal documents stop here |
| **Published** | Approved *and* live to the public (legal pages, help centre) |
| **Deprecated** | Superseded; kept for history, never linked from INDEX as current |

A generated document is never created as Approved. Legal documents move to Published only when counsel has reviewed them and an effective date is set (see `legal/versioning-and-effective-dates.md`).

## Ownership

Each document names a **technical owner** (who keeps it accurate to the code) and a **business owner** (who decides what the policy *should* be). Today both are the founder for most documents; the fields exist so responsibility can be split as the team grows.

## Keeping docs in step with code

1. A change that alters user-visible behaviour, a permission, a job, a table, an integration or an env var **updates the affected document in the same pull request**, and adds a line to `changelog/README.md`.
2. `npm run check:docs` runs in CI (`.github/workflows/checks.yml`). It fails on missing required files, missing metadata, broken internal links, code paths that no longer exist, placeholder URLs, wrong social links, and anything that looks like a secret. `npm run check:docs -- --external` also probes external links (run locally before a release).
3. `documentation-audit-matrix.md` is re-checked at every release; gaps are recorded there rather than papered over.
4. Review cadence: legal and privacy documents at least every 6 months or on any change to data handling; runbooks after every incident that used them; everything else at each release.

## Writing rules (summary)

Plain English, one idea per sentence, active voice, no unexplained acronyms. State facts the code supports; where the code does not decide something, write **`NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED`** and add a row to `OPERATIONAL_DECISIONS_REQUIRED.md`. Never describe a planned or shadow-mode feature as live. Full rules and templates: [DOCUMENTATION_STANDARD.md](DOCUMENTATION_STANDARD.md).
