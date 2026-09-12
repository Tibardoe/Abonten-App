---
title: Documentation changelog
purpose: One line per meaningful documentation change, newest first, so reviewers can see what changed and when.
audience: Everyone maintaining documentation
scope: docs/** and apps/web/src/content/**
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Documentation changelog

Format: `YYYY-MM-DD · area · change · (doc versions affected)`.

## 2026-09-12 — Operating entity confirmed from company documents

- Legal item A1 **Decided**: the founder supplied certified true copies (Registrar-General's Department, 04-Feb-2026) of Form 3, the Beneficial Ownership Profile and the Constitution. Terms 1.1-draft §1 and Privacy Policy 1.1-draft §1/§15 now name **Abonten Hub Ltd** (private company limited by shares, registration number CS015010126), the registered address in Weija, Accra, P.O. Box 465 Weija Accra and digital address GS-0257-3290. Still drafts, Review required, no effective date.
- Not filled, deliberately: DPC registration status (the documents show none — A2), support/privacy/security email channels (A3; the personal contacts on the registrar's forms are not public channels). New A4: Business Operating Permit reference not recorded.
- New `legal/company-registration.md` (company-level facts only; directors' personal data excluded; source PDFs not committed). New `packages/core/src/brand/legalEntity.ts`; copyright lines in emails and the mobile drawer now read "Abonten Hub Ltd".
- `legal/README.md` register, versioning log, `LEGAL_REVIEW_REQUIRED.md` §H and the contacts specification updated. Placeholders in the legal drafts: 15 → 9.

## 2026-09-12 — Registers enriched, gated specifications, master index, coverage matrix

- `OPERATIONAL_DECISIONS_REQUIRED.md` 1.1: every open decision now states what it affects, the current implementation from code, and a recommended default explicitly labelled as a recommendation, not approved policy; added S6 (disaster-recovery objectives) and D5 (localization scope).
- `LEGAL_REVIEW_REQUIRED.md` 1.1: review-required banner; §H lists the exact placeholders in the public drafts and who supplies each; specifications mapped to their blocking items.
- Public legal drafts: prose "will be stated once confirmed" replaced by explicit placeholders — `[LEGAL ENTITY NAME — TO BE CONFIRMED]`, `[COMPANY REGISTRATION NUMBER — TO BE CONFIRMED]`, `[REGISTERED ADDRESS — TO BE CONFIRMED]`, `[DPC REGISTRATION STATUS — TO BE CONFIRMED]`, `[SUPPORT CONTACT — TO BE CONFIRMED]`, `[PRIVACY CONTACT — TO BE CONFIRMED]`, `[SECURITY CONTACT — TO BE CONFIRMED]`, `[EFFECTIVE DATE — TO BE CONFIRMED]`. Still 1.0-draft, Review required, no effective date.
- New `docs/specifications/` (Draft): cookie consent, age gate, data export, retention jobs, appeals workflow, support and security contacts, future improvements (P2 roadmap). Each ends with "Approval required before implementation"; nothing in them is built.
- New `architecture/observability.md` and `deployment/disaster-recovery.md` (the latter Review required: objectives undecided, no restore drill recorded).
- `INDEX.md` 1.1: master index (PUBLIC / INTERNAL / TECHNICAL); new `documentation-coverage-matrix.md` mapping every feature to its public, internal and technical documents.
- `scripts/check-docs.mjs`: new **coverage** rule (every document reachable from the hub or its folder README; every public page referenced from the coverage matrix) and **legal-placeholders** rule (a Published/Approved legal document may not contain `TO BE CONFIRMED` or lack a real effective date); required-files list extended. `development/documentation-validation.md` 1.1.

## 2026-09-12 — Documentation programme, initial release

- Created the documentation system: `docs/README.md`, `DOCUMENTATION_STANDARD.md`, `INDEX.md`, `LEGAL_REVIEW_REQUIRED.md`, `OPERATIONAL_DECISIONS_REQUIRED.md`, `documentation-audit-matrix.md`.
- Public legal documents (drafts, **Review required**, no effective date): Terms and Conditions 1.0-draft, Privacy Policy 1.0-draft, Cookie Policy 1.0-draft, Security overview 1.0-draft — served at `/legal/*`; short redirects `/terms`, `/privacy`, `/cookies`.
- Public help centre (26 pages, Draft) at `/help` for customers, organizers, place owners and account topics.
- Internal: privacy programme (inventory, retention, rights operations, cookies/storage inventory, processors); finance runbooks; admin handbook (16 pages + support scenarios); field team handbook (12 pages); operations (WDIDW, moderation policy, notifications, rewards, support procedures, scheduled jobs, deployment); troubleshooting KB; security package (7); incident response (README + 14 runbooks); journeys (5); web and mobile product docs; architecture (system overview, feature inventory, roles and permissions, data model, integrations); development (setup, testing, CI, conventions, validation); deployment (Vercel, EAS, migrations, checklist, rollback).
- Code: `/legal` and `/help` routes, Markdown renderer (`@abonten/core/markdown`), shared brand constants (`@abonten/core/brand/socialLinks`), footers and mobile drawer linked to official X / Instagram / TikTok accounts (Facebook and LinkedIn icons removed — no accounts), consent line on web sign-in, mobile sign-in fixed from `abonten.com` to abontenhub.com legal pages, Settings rows for Help centre and Legal, `scripts/check-docs.mjs` + CI job.
- i18n: `auth.consentNotice`, `settings.nav.help`, `settings.nav.legal` added to all six locales; Akan uses English for the consent line pending translation (decision D3).
- `README.md` rewritten from the create-next-app boilerplate; `PROJECT.md` §29 pointer; `CLAUDE.md` pointer to the documentation system.
