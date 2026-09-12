---
title: Specification — official support, privacy and security contacts
purpose: List every place a contact channel is needed, the placeholders standing in for it, and the steps to publish the channels once the founder provides them.
audience: Founder, legal counsel, engineering, support
scope: Public legal pages, help centre, mobile app, admin support queue, incident response
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Specification — official support, privacy and security contacts

## 1. Current state

- The only support channel is the **in-app support conversation** (web: Messages › "Contact Abonten Support" and the help centre's contact card; app: Account › Help & support). It lands in Admin › Support.
- **No support, privacy or security email address exists** anywhere in the code, the public content or the documentation. None has been invented; the public pages carry explicit placeholders. The company's postal address (P.O. Box 465, Weija, Accra) is published as of 2026-09-12; the founder's personal phone numbers and email that appear on the registrar's forms are **not** public channels and must not be used.
- Vulnerability reports, privacy requests and legal notices all arrive through the same support conversation, which requires a signed-in account — so a person **without** an account (a business owner listed by the field programme, a security researcher, a regulator) has no published route today.

## 2. Placeholders in the public documents

| Placeholder text | Where | Replaced by |
|---|---|---|
| ~~Entity name, registration number, registered and postal address~~ | Terms §1, Privacy §1 and §15 | **Filled 2026-09-12** from the certified Form 3 — see `../legal/company-registration.md` (A1 Decided) |
| `[DPC REGISTRATION STATUS — TO BE CONFIRMED]` | Privacy §1 | Data Protection Commission status, only if verified (A2) |
| `[SUPPORT CONTACT — TO BE CONFIRMED]` | Terms §19 | Official support address (A3, O1) |
| `[PRIVACY CONTACT — TO BE CONFIRMED]` | Terms §19, Privacy §15 | Privacy address (A3) |
| `[SECURITY CONTACT — TO BE CONFIRMED]` | Security page §"Reporting a security issue" | Security / disclosure address (A3, S2) |
| `[EFFECTIVE DATE — TO BE CONFIRMED]` | Draft banner of all four documents; `effectiveDate` front matter | Set at approval per `legal/versioning-and-effective-dates.md` |

`scripts/check-docs.mjs` counts these tokens and **fails** if a legal document is marked Published or Approved while any remain.

## 3. Steps once the founder provides the channels

1. **Insert** the values into the four Markdown files above; remove the "will be published here once confirmed" sentences; bump each document's version per `legal/versioning-and-effective-dates.md` (still no effective date until counsel approves).
2. **Add a shared constant** — a new `contacts.ts` module (`SUPPORT_EMAIL`, `PRIVACY_EMAIL`, `SECURITY_EMAIL`, `POSTAL_ADDRESS`) next to `packages/core/src/brand/socialLinks.ts` — and read it from: the help centre contact card (`apps/web/src/components/molecules/ContactSupportCard.tsx`, as a secondary "or email us" line for signed-out visitors), the restricted-account page (`apps/web/src/app/account-restricted/page.tsx`), the mobile drawer and Settings rows (`apps/mobile/src/lib/legalLinks.ts`), and the footers. Extend the validator's social-link rule to assert the constants match the legal pages.
3. **Mailbox operations** — decide who reads each mailbox, how it feeds the admin Support queue (manually opening a support conversation on the user's behalf is not possible today; the first version is a shared inbox with the response target from O1), and how security reports are triaged into `incident-response/vulnerability-report.md`.
4. **Responsible-disclosure policy** (decision S2) — publish on the Security page: scope, what to include, a response target, a safe-harbour statement drafted by counsel, and what not to do (no data exfiltration, no denial of service, no access to other users' accounts).
5. **Update** the help pages that say "a contact address published on the Legal pages when available", the incident-response README's contact section, the data-inventory recipients table if a new processor (email host) is introduced, and the changelog. Run `npm run check:docs`.

## 4. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| ~~Entity, registration number, address~~ | Provided 2026-09-12 (certified company documents) | Legal A1 — Decided |
| Data Protection Commission registration status | Verified fact only — not shown in the company documents | Legal A2 |
| Support, privacy and security addresses | Founder provides | Legal A3 |
| Support hours and response target | Founder | Decision O1 |
| Disclosure policy text | Counsel | Decision S2 |

**Status: waiting on the founder. Placeholders stay until the official details are provided; nothing is to be invented.**
