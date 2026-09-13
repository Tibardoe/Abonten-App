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

## 2026-09-13 — Discovery: unified search and opt-in recommendations (switched off)

- **New capability**: one ranked search across events, places and organizers with `@handle` for organizers; a private "Notify me" on organizers and places; opt-in prompts after a ticket, RSVP, favorite, review or second check-in; capped recommendation digests (push and in-app only); For you; Settings › Notifications on web and mobile; Admin › Discovery. Ten migrations `20260913090000`–`20260913090900` applied to production via the Supabase MCP. Ships **off**: search and recommendations for nobody, shadow mode on, prompts off.
- **Behaviour change (already live)**: the two old suggestion RPCs no longer return hidden, removed or archived listings. The failing `refresh_search` job was removed; the `event_search` materialised view it refreshed never existed, and five documents described it.
- **Behaviour change (on deploy, whatever the switches)**: the `/search` filter page no longer multiplies distance by 1,000 and no longer drops free events whenever the price filter is at "Any". `notification_preference.social_push` (default on) now decides whether messages, reviews, replies and booking updates push; the in-app row is always written.
- **New permissions**: `discovery.view` (operations, analyst), `discovery.configure` (operations, step-up).
- **New env flags**: `SEARCH_V2_KILL_SWITCH`, `RECOMMENDATIONS_KILL_SWITCH`. The existing `VERIFICATION_KILL_SWITCH` was missing from the secrets inventory and is now listed.
- **New scheduled jobs**: `search-log-purge`, `recommendations-generate`, `recommendations-digest` (every 10 minutes, acting in the digest hour), `recommendations-purge`.
- **New docs**: [architecture/discovery-search-and-recommendations.md](../architecture/discovery-search-and-recommendations.md), [architecture/perf/discovery-2026-09.md](../architecture/perf/discovery-2026-09.md), [admin/discovery.md](../admin/discovery.md). Updated: `operations/scheduled-jobs.md`, `operations/notifications-and-email-operations.md`, `security/secrets-and-environment.md`, `architecture/{README,data-model-overview,feature-inventory}.md`, `troubleshooting/README.md`, `operations/{what-do-i-do-when,open-items}.md`, `journeys/{customer,organizer}.md`, `admin/README.md`, `INDEX.md`, `documentation-audit-matrix.md`, `documentation-coverage-matrix.md`.
- **New registers**: operational decisions **N1–N4**, legal item **G3** (promotional push consent and how long the opt-in record is kept). Caps, digest hour and retention periods are working defaults, not approved policy.

## 2026-09-12 — Verification device pass: the mobile badges

- **Device pass** on the Android emulator against production closed open item **M2**. The whole lifecycle was driven on the device (start → upload → submit → admin asks for more → resubmit → approve → badge), with the programme switched on for the `staff` audience only.
- **Behaviour change**: the mobile Verified badge is now tappable and explains itself in the same legal-reviewed words as the web popover, and a **Verified organizer** badge now appears on the event organizer card and the public profile. Before this, mobile showed a bare "Verified" pill with no explanation, and organizer verification produced nothing visible on mobile at all.
- **Still missing on mobile** (cosmetic, tracked in PROJECT.md §30.10): per-place verification status chips and the place-setup checklist.

## 2026-09-12 — Trust & Verification shipped (switched off)

- **New capability**: place owners and event organizers can ask Abonten to review documents supporting their business and its link to their account; an admin decides; a Verified badge follows. Migration `20260912120000_trust_verification.sql` applied to production via the Supabase MCP and replayed clean from scratch locally. Ships **off** (`verification_program_setting` both switches false, audience `staff`, plus `VERIFICATION_KILL_SWITCH`).
- **Behaviour change**: approving a place claim no longer sets `place.verified`. Claims transfer ownership only; verification is a separate reviewed step. A reviewer may tick "Also mark this place verified" on a claim that carries documents (`verification.review` required). Existing verified places were backfilled as approved cases.
- **New permissions**: `verification.view`, `verification.evidence`, `verification.review`, `verification.revoke` (the last behind step-up).
- **New docs**: [architecture/trust-and-verification.md](../architecture/trust-and-verification.md), [admin/verification.md](../admin/verification.md). Updated: `admin/claims.md`, `admin/settings-and-rbac.md`, `architecture/roles-and-permissions.md`, `architecture/README.md`, `admin/README.md`, `INDEX.md`, `documentation-coverage-matrix.md`, `operations/open-items.md`.
- **New registers**: operational decisions **V1–V6**, legal items **H1–H4**. Retention periods and the badge wording are working defaults pending counsel, not approved policy.
- **Public help**: `organizers/getting-verified.md` added; `place-owners/claiming-and-verifying-a-place.md` rewritten. The old page wrongly said a field-team listing is verified through the owner's one-time code — Field Ops has never written `place.verified`, and that claim has been removed.

## 2026-09-12 — O1 support operating policy decided

- Founder's decision: support staffed **Monday to Friday, 09:00–17:00 Ghana time (GMT)**, Ghanaian public holidays excluded; **two-working-day reply goal** for support and privacy enquiries; **two-working-day acknowledgement goal** for security reports; all published as goals, never as contractual commitments. Escalation procedure not decided — new decision **O7**.
- Applied: Terms 1.3-draft §19, Privacy Policy 1.3-draft §15, Security overview 1.3-draft "What happens next", help pages `account/restricted-accounts` and `account/privacy-and-your-data`, `operations/support-operating-policy.md` (decision record), `operations/account-and-support-procedures.md`, `privacy/privacy-rights-operations.md` (acknowledgement 3 → 2 working days), `admin/support.md`, `incident-response/vulnerability-report.md`, `security/responsible-disclosure.md`, registers, legal register and versioning log.

## 2026-09-12 — Merged to main; production and device verification

- The documentation-programme branch merged to `main` (`9b6c8b23`, no-fast-forward) and deployed by Vercel (production deployment `dpl_6HMSpPGYBNFkmeubVkrYZuKifNAJ`). `/.well-known/security.txt` **PRODUCTION VERIFIED**: `200`, `text/plain; charset=utf-8`, `X-Matched-Path: /.well-known/security.txt`, policy anchor present on `/legal/security`; `/terms` → `308` `/legal/terms`.
- Mobile: EAS preview build `598fdb7f` (runtime `0.2.0`, version code 2, from `main`) and the first EAS Update ever published for the project, group `d5102dde` on the `preview` channel. Device checks (two emulators, signed out): sign-in Terms/Privacy links, all drawer legal/help rows, X/Instagram/TikTok icons, support-email row and the "Abonten Hub Ltd" copyright — all **DEVICE VERIFIED**; Settings hub rows and non-English locales **DEVICE VERIFICATION PENDING** (need a signed-in test account). **No production build exists** and none was created; a production release is a business decision. Full record: `mobile/release-verification.md`.
- `operations/open-items.md`: S2 and M1 rows updated with the evidence above.

## 2026-09-12 — Open items made explicit: O1, S2, A2, A4, M1

- **S2 implemented (policy text; legal review still open):** Security overview 1.2-draft replaces "Reporting a vulnerability" with a full "Responsible disclosure" section — channel, what to include, acknowledgement process (no time target), permitted and prohibited testing, personal-data expectations, handling, coordinated disclosure, conduct, and an explicit statement that **no legal safe harbour is offered yet**. New `apps/web/public/.well-known/security.txt` (RFC 9116: Contact, Expires 2027-03-12, Policy, Canonical, Preferred-Languages) — served signed-out through the pre-existing `/.well-known/` allowlist; no proxy, redirect or header change was needed. Verified against `next dev`: `200 OK`, `text/plain; charset=UTF-8`, no redirect; the `Policy` anchor exists on the rendered page. Production verification pending deploy. Framework and the **LEGAL REVIEW REQUIRED — SAFE HARBOUR** list: `security/responsible-disclosure.md`; new legal item D3. Validator: new `security-txt` rule (file present, Contact = security@abontenhub.com, Expires valid ISO date and in the future — warning inside 30 days — Policy points at the live section anchor).
- **O1 decision record:** `operations/support-operating-policy.md` — every field NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED; audit of every location that mentions support availability; channels the product exposes; update list once decided. Internal working targets in the incident README, vulnerability runbook and privacy procedure are now labelled "internal — not published, not a commitment".
- **A2 / A4 compliance records:** `legal/dpc-registration.md` (STATUS: VERIFICATION REQUIRED, with the privacy-policy wording that depends on the outcome) and `legal/business-operating-permit.md` (STATUS: VERIFICATION REQUIRED; LEGAL/BUSINESS COMPLIANCE REVIEW REQUIRED for which permits apply). No status is inferred from code or company documents.
- **M1 mobile release verification:** `mobile/release-verification.md` — SOURCE / BUILD / DEVICE / PRODUCTION VERIFIED vocabulary; every mobile change on the branch is SOURCE VERIFIED only, DEVICE VERIFICATION PENDING; release mechanism identified as an EAS Update on the `production` channel (runtime version `0.2.0`, no native change).
- **Open-item register:** `operations/open-items.md` — O1, S2, A2, A4, M1 plus every other open decision, legal review, verification and pending engineering item with owner, evidence and blocking status. Linked from the hub, the master index and the coverage matrix.

## 2026-09-12 — Official contact channels published

- Legal item A3 **Decided**: the founder created Google Workspace aliases support@abontenhub.com, privacy@abontenhub.com and security@abontenhub.com. Published in Terms 1.2-draft §19, Privacy Policy 1.2-draft §11/§15 (Google Workspace added to the §4 processor table), Security overview 1.1-draft "Reporting a vulnerability"; help pages `account/restricted-accounts` and `account/privacy-and-your-data` updated. Still drafts, Review required, no effective date. Placeholders in the legal drafts: 9 → 5 (DPC status and the four effective dates).
- Code: `packages/core/src/brand/contacts.ts` (single source); help-centre contact card gains "Can't sign in? Email support@…"; restricted-account page links the support mailbox; both web footers gain "Contact"; mobile drawer gains a support-email row (`openSupportEmail` in `apps/mobile/src/lib/legalLinks.ts`).
- Internal: `operations/account-and-support-procedures.md` §Email channels (aliases land in one mailbox, reply-as-alias setup, verification, no forwarding, no routing into the admin queue); privacy-rights procedure accepts email requests with address verification; admin Support page, vulnerability runbook, appeals spec, audit matrix, processors table, legal register and versioning log updated; contacts specification marked done except O1 (hours) and S2 (disclosure policy).
- Validator: new **contacts** rule — official addresses must be present and quoted exactly; no other `@abontenhub.com` or personal mailbox may appear in documentation.

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
