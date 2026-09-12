---
title: Company registration record
purpose: The verified corporate identity of the operating entity, taken from the Registrar-General's certified documents, so every legal page, copyright line and contract uses the same facts — and a clear list of what those documents do not establish.
audience: Founder, legal counsel, finance, engineering
scope: Company-level facts only; no personal data of directors or officers is recorded here
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Company registration record

**Source documents** (certified true copies dated 4 February 2026, issued by the Registrar-General's Department / Office of the Registrar of Companies, Accra; held by the founder; **not committed to the repository** because they contain directors' personal data):

1. Form 3 — Company Details under the Companies Act, 2019 (Act 992)
2. Beneficial Ownership Profile — Company With Shares
3. Constitution for a Private Company Limited by Shares

## Verified facts (safe to publish)

| Fact | Value | Used in |
|---|---|---|
| Legal name | **Abonten Hub Ltd** | Terms §1, Privacy §1, copyright lines (`packages/core/src/brand/legalEntity.ts`) |
| Company type | Private company limited by shares | Terms §1, Privacy §1 |
| Incorporation | 24 January 2026, Accra, under the Companies Act, 2019 (Act 992) | Terms §1 |
| Company registration number (ORC) | CS015010126 | Terms §1, Privacy §1 |
| Registered address and principal place of business | House No. 10, Purple Street, near Mount Zion Church, Weija Block Factory, Accra, Ga South District, Greater Accra Region, Ghana | Terms §1, Privacy §1 |
| Postal address | P.O. Box 465, Weija, Accra | Terms §1, Privacy §15 |
| Digital address (GhanaPostGPS) | GS-0257-3290 | Terms §1, Privacy §1 |
| Principal activity (as registered) | Event advertisement and management; ticketing services | Context for counsel (legal E1, E3) |
| Industrial classification | ISIC 7310 Advertising (primary); ISIC 7990 Other reservation service and related activities | Context for counsel |

## Facts recorded for internal use only (not published)

| Fact | Value | Why internal |
|---|---|---|
| Company TIN | C0066767334 | Needed by finance for invoices, Paystack and tax filings; not required on the public pages. Counsel may ask for it to be added to the Terms (legal E3). |
| Auditor of record | Kyei and Tobil Consult, Accra | Finance contact for statutory accounts |
| Stated capital | GHS 1,000 (1,000 equity shares, fully paid) | Corporate record |
| Directors and company secretary | Named in Form 3 Part V (three directors; the founder is also company secretary) | Names, dates of birth, TINs, home addresses and personal phone/email are **personal data** and stay out of this repository |
| Beneficial owner | The founder holds 100% of shares and voting rights (Beneficial Ownership Profile) | Corporate record |

## What these documents do **not** establish

Do not treat any of the following as confirmed; each stays open in `../LEGAL_REVIEW_REQUIRED.md`.

| Not established | Register item |
|---|---|
| Registration as a data controller with the Data Protection Commission | A2 |
| Any official support, privacy or security contact channel — the phone numbers and email on Form 3 Part IV are the founder's personal registrar contacts, **not** public channels, and must not be published | A3 |
| Business Operating Permit: Form 3 records a BOP *request* with no reference number | A4 |
| Bank of Ghana, Cyber Security Authority or any other licence, registration or certification | D1, E1 |
| Trademark registration of the Abonten name and logo | F4 |
| Tax registration status beyond the TIN's existence (VAT etc.) | E3 |

## Maintenance

If the company changes its name, address, officers or registration, update `packages/core/src/brand/legalEntity.ts`, the two legal pages, this record and the changelog in the same change, bump the legal documents' minor version per `versioning-and-effective-dates.md`, and run `npm run check:docs`.
