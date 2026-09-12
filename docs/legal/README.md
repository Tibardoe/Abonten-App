---
title: Legal documents register
purpose: Track the public legal documents, where their canonical text lives, their version, status and effective date, and the review each one still needs.
audience: Founder, legal counsel, engineering
scope: Terms and Conditions, Privacy Policy, Cookie Policy, Security overview
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Legal documents register

## Where the text lives

The canonical text of every public legal document is a Markdown file in **`apps/web/src/content/legal/`**, rendered by the website at `/legal/<slug>` (`apps/web/src/app/(pages)/legal/[slug]/page.tsx`) and opened from the mobile app in its in-app browser (`apps/mobile/src/lib/legalLinks.ts`). The short paths `/terms`, `/privacy` and `/cookies` redirect to the long ones (`apps/web/next.config.ts`).

Keeping the text in the web app (rather than in this folder) guarantees it is in the Vercel build context and is versioned with the page that renders it. This folder holds the register and the rules.

## Register

| Document | File | Route | Version | Status | Effective | Blocking review items |
|---|---|---|---|---|---|---|
| Terms and Conditions | `apps/web/src/content/legal/terms.md` | `/legal/terms` | 1.3-draft | Review required | not yet | B7, C1, C3, E1–E9, F1, F4 (A1, A3, O1 decided 2026-09-12) |
| Privacy Policy | `apps/web/src/content/legal/privacy-policy.md` | `/legal/privacy` | 1.3-draft | Review required | not yet | A2, B1–B9, G2 (A1, A3, O1 decided 2026-09-12) |
| Cookie Policy | `apps/web/src/content/legal/cookie-policy.md` | `/legal/cookies` | 1.0-draft | Review required | not yet | B4 |
| Security overview | `apps/web/src/content/legal/security.md` | `/legal/security` | 1.3-draft | Review required | not yet | D3 (safe-harbour wording); O1 acknowledgement goal decided 2026-09-12 |

Item codes refer to `../LEGAL_REVIEW_REQUIRED.md` (letters A–G) and `../OPERATIONAL_DECISIONS_REQUIRED.md` (S2). The verified corporate identity (name, registration number, addresses) is in [company-registration.md](company-registration.md). Compliance records awaiting evidence: [dpc-registration.md](dpc-registration.md) (A2), [business-operating-permit.md](business-operating-permit.md) (A4).

## What the documents are grounded in

Each clause was written from verified behaviour, recorded in:

- `../privacy/data-inventory.md` — every data category and the tables behind it
- `../privacy/cookies-and-storage-inventory.md` — every cookie and storage key
- `../privacy/data-retention-and-deletion.md` — what is deleted, kept or expired
- `../finance/` — fee model, refunds, settlement, payouts
- `../architecture/roles-and-permissions.md` — who can do what
- `../architecture/rewards-ledger.md`, `../architecture/field-ops.md` — the two programmes described in Terms §11–§12

When any of those change, the legal text must be re-checked (see `versioning-and-effective-dates.md`).

## Consent surfaces

Where users are shown or asked to accept the documents:

| Surface | Mechanism | File |
|---|---|---|
| Web sign-in | "By continuing you agree to Abonten's Terms and Conditions and Privacy Policy" under the sign-in options | `apps/web/src/components/organisms/AuthModal.tsx` (`auth.consentNotice`) |
| Mobile sign-in | Same sentence with links | `apps/mobile/app/(auth)/sign-in.tsx` |
| Web footers and side menu | Terms · Privacy · Cookies · Security · Help | `DesktopFooter.tsx`, `MobileFooter.tsx` |
| Mobile drawer and Settings | Legal rows and Help centre / Legal & policies entries | `AppDrawer.tsx`, `app/(app)/settings/index.tsx` |
| Field-programme owner consent page | "you agree to … the Abonten Terms and Conditions" | `apps/web/src/app/(pages)/consent/field/[token]/page.tsx` |
| Restricted-account page | Links to help and Terms | `apps/web/src/app/account-restricted/page.tsx` |

Whether "continuing" is sufficient acceptance is legal item C1.
