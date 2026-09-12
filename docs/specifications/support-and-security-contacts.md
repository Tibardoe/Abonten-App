---
title: Specification — official support, privacy and security contacts
purpose: Record the official contact channels, where they are published, how the mailboxes are operated, and the two decisions (support hours, disclosure policy) that remain open.
audience: Founder, legal counsel, engineering, support
scope: Public legal pages, help centre, mobile app, admin support queue, incident response
status: Approved
version: 1.1
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Specification — official support, privacy and security contacts

## 1. Current state (updated 2026-09-12)

- The primary support channel is the **in-app support conversation** (web: Messages › "Contact Abonten Support" and the help centre's contact card; app: Account › Help & support). It lands in Admin › Support.
- **Official email channels now exist**: support@abontenhub.com, privacy@abontenhub.com and security@abontenhub.com — Google Workspace aliases on the founder's primary Workspace mailbox, designated by the founder on 2026-09-12 (legal A3 Decided). They are defined once in `packages/core/src/brand/contacts.ts` and published in Terms §19, Privacy §11/§15, the Security page, the help centre contact card, the restricted-account page, both web footers and the mobile drawer. Mail lands in one mailbox; nothing routes into the admin Support queue (procedure: `../operations/account-and-support-procedures.md` §Email channels).
- The company postal address (P.O. Box 465, Weija, Accra) is published. The founder's personal phone numbers and email on the registrar's forms are **not** public channels and must not be used; the validator's `contacts` rule fails on any non-official or personal address in documentation.
- Still missing: published support hours and a response target (decision O1 — decision record `../operations/support-operating-policy.md`); counsel-approved safe-harbour wording for the responsible-disclosure section (legal D3). The section and `/.well-known/security.txt` themselves exist since 2026-09-12.

## 2. Placeholders in the public documents

| Placeholder text | Where | Replaced by |
|---|---|---|
| ~~Entity name, registration number, registered and postal address~~ | Terms §1, Privacy §1 and §15 | **Filled 2026-09-12** from the certified Form 3 — see `../legal/company-registration.md` (A1 Decided) |
| ~~Support, privacy and security contacts~~ | Terms §19, Privacy §11 and §15, Security page | **Filled 2026-09-12**: support@, privacy@, security@abontenhub.com (A3 Decided) |
| `[DPC REGISTRATION STATUS — TO BE CONFIRMED]` | Privacy §1 | Data Protection Commission status, only if verified (A2) |
| `[EFFECTIVE DATE — TO BE CONFIRMED]` | Draft banner of all four documents; `effectiveDate` front matter | Set at approval per `legal/versioning-and-effective-dates.md` |

## 3. Steps — done and remaining

| Step | Status |
|---|---|
| Insert the addresses into the legal pages and bump versions (Terms 1.2-draft, Privacy 1.2-draft, Security 1.1-draft; still no effective date) | Done 2026-09-12 |
| Shared constant `packages/core/src/brand/contacts.ts`, read by the help centre card (`apps/web/src/components/molecules/ContactSupportCard.tsx`), the restricted-account page (`apps/web/src/app/account-restricted/page.tsx`), both footers and the mobile drawer (`apps/mobile/src/lib/legalLinks.ts`) | Done 2026-09-12 |
| Validator asserts the legal pages quote exactly these addresses and that no other `@abontenhub.com` (outbound senders excepted) or personal address appears in documentation | Done 2026-09-12 (`contacts` rule) |
| Mailbox operations: who reads what, reply-as-alias setup, verification, no forwarding | Documented in `../operations/account-and-support-procedures.md` §Email channels; the Gmail "Send mail as" setup is a one-time action for the founder before any reply is sent |
| Help pages, privacy procedure, admin support page, vulnerability runbook, processor table (Google Workspace) updated | Done 2026-09-12 |
| Support hours and response target published | **Open — decision O1** |
| Responsible-disclosure section on the Security page and `/.well-known/security.txt` (served through the existing `/.well-known/` allowlist — no proxy change was needed) | **Done 2026-09-12** (`../security/responsible-disclosure.md`); safe-harbour wording remains **legal D3**; response target remains **O1** |
| Route email into the admin Support queue (for example a Workspace forwarding rule into a service that opens a support conversation) | Not built; product decision, not required for the channels to work |

## 4. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| ~~Entity, registration number, address~~ | Provided 2026-09-12 (certified company documents) | Legal A1 — Decided |
| Data Protection Commission registration status | Verified fact only — not shown in the company documents | Legal A2 |
| ~~Support, privacy and security addresses~~ | Provided 2026-09-12 (Workspace aliases) | Legal A3 — Decided |
| Support hours and response target | Founder | Decision O1 |
| Disclosure policy text | Counsel | Decision S2 |

**Status: channels published. Remaining work (O1 hours and response target; S2 disclosure policy) is gated on those decisions; nothing further is to be invented.**
