---
title: Legal review register
purpose: List every point in Abonten's documentation and product that requires qualified legal counsel or an official confirmation before it can be relied on, with the decision each one needs.
audience: Founder, legal counsel, compliance reviewer
scope: Public legal documents, privacy programme, payments, consumer terms, app-store obligations
status: Approved
version: 1.1
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Legal review register

> **Every item in this register requires review by qualified legal or compliance counsel.** The engineering team has not made any of these decisions and must not make them; where a specification under [specifications/](specifications/README.md) describes how something could be built, that is a technical design awaiting the decision, not a decision.

The documents in `apps/web/src/content/legal/` are **professional drafts prepared from the codebase, not legal advice**. They describe what the product actually does. Nothing in them claims — and nothing in this repository may claim — that Abonten is legally compliant, registered with the Data Protection Commission, certified, licensed or approved, unless that fact has been explicitly verified and recorded here with its evidence. This register lists what a qualified reviewer must confirm or decide. Items are grouped by the law or topic they concern; no law beyond those named is asserted to apply.

Status values: **Open** · **In review** · **Decided** (record the decision and date).

## A. Identity and registration

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| A1 | Legal name, registration number and registered address of the operating entity | Terms §1, Privacy §1, §15 | Confirm entity and insert | **Decided (2026-09-12):** Abonten Hub Ltd, private company limited by shares, registration number CS015010126, registered address House No. 10, Purple Street, Weija Block Factory, Accra — from the Registrar-General's certified Form 3 dated 04-Feb-2026; inserted. Record: `legal/company-registration.md` |
| A2 | Whether the operator must register as a data controller with Ghana's Data Protection Commission (DPC) under the Data Protection Act, 2012 (Act 843), and its registration status | Privacy §1, §11 | Confirm status; register if required; insert reference | **STATUS: VERIFICATION REQUIRED** — record and dependent wording in [legal/dpc-registration.md](legal/dpc-registration.md); the company documents show no DPC registration; nothing may claim one |
| A3 | Dedicated contact channels for legal, privacy and security enquiries (email address, postal address) | Terms §19, Privacy §15, Security page | Choose channels; publish | **Decided (2026-09-12):** support@abontenhub.com, privacy@abontenhub.com, security@abontenhub.com (Google Workspace aliases on the founder's account) plus P.O. Box 465, Weija, Accra; published in Terms 1.2-draft, Privacy 1.2-draft, Security 1.1-draft and in the apps (`packages/core/src/brand/contacts.ts`). Mailbox operations: `operations/account-and-support-procedures.md`. Hours/SLA remain decision O1; disclosure policy remains S2 |
| A4 | Business Operating Permit (district assembly): Form 3 records a permit *request* with no reference number; which permits apply to Abonten's actual operations needs advice | Corporate record | Confirm whether the permit was issued; record the reference; adviser identifies applicable permits | **STATUS: VERIFICATION REQUIRED; LEGAL/BUSINESS COMPLIANCE REVIEW REQUIRED** — record in [legal/business-operating-permit.md](legal/business-operating-permit.md) |

## B. Data Protection Act, 2012 (Act 843)

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| B1 | Legal basis for each processing purpose (consent, contract, legitimate interest, legal obligation) | Privacy §3 | Map purposes to bases; confirm wording | Open |
| B2 | Cross-border transfers to processors outside Ghana (Supabase and Vercel in the EU; Cloudinary, Resend, Sentry, Expo, Google in the US/global) — safeguards and any DPC notification | Privacy §4 | Confirm safeguards (contracts, provider commitments) and whether notification is required | Open |
| B3 | Retention periods where none is implemented (transactions/tickets after deletion, messages, OTP send logs, observability records) | Privacy §9, `privacy/data-retention-and-deletion.md` | Set periods; engineering then implements jobs | Open |
| B4 | Whether `abn_did` / the app install id (fraud-signal identifiers, 1-year) and the referral attribution cookies require consent or a banner under Act 843 and DPC guidance | Cookie Policy, web `proxy.ts` | Decide consent model; if a banner is required, engineering builds it | Open |
| B5 | Data-subject request handling: response time limits, identity-verification standard, whether a self-service export must be offered | Privacy §11, `privacy/privacy-rights-operations.md` | Confirm statutory timelines and minimum process | Open |
| B6 | Breach notification: thresholds, timelines and recipients (DPC, affected users) | `incident-response/pii-exposure-and-data-breach.md` | Confirm obligations; set internal deadlines | Open |
| B7 | Children: minimum age for accounts, parental-consent requirements, whether ticketing for age-restricted events imposes duties on Abonten | Terms §2, Privacy §13 | Set minimum age; decide on age gate | Open |
| B8 | Organizers and place owners as independent controllers of attendee/booking data — whether Abonten must impose written terms on them beyond the current Terms §8/§9 | Terms §8, §9, Privacy §6 | Confirm adequacy of current clauses | Open |
| B9 | Retention of the rewards ledger, financial records and audit logs **after** account deletion — justification under Act 843 | Privacy §10 | Confirm and, if needed, define the period | Open |

## C. Electronic Transactions Act, 2008 (Act 772)

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| C1 | Validity of acceptance by "continuing" (implied consent line on sign-in) versus an explicit checkbox | Web `AuthModal.tsx`, mobile sign-in | Confirm the consent mechanism is sufficient | Open |
| C2 | Electronic records and receipts: whether ticket emails / PDFs meet any record requirements | Ticket email, PDF | Confirm | Open |
| C3 | Notice period and mechanism for changes to the Terms | Terms §24 | Confirm | Open |

## D. Cybersecurity Act, 2020 (Act 1038)

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| D1 | Whether Abonten falls within any licensing, registration or critical-information-infrastructure designation under Act 1038 (**to be verified, not assumed**) | Security docs | Confirm scope | Open |
| D2 | Incident-reporting obligations to the Cyber Security Authority, if any | `incident-response/README.md` | Confirm and add to escalation | Open |
| D3 | **Responsible-disclosure safe harbour** — the public Security page §Responsible disclosure states that no legal safe harbour is offered yet. Counsel must review and approve: safe-harbour wording, researcher authorisation language, prohibited-testing boundaries, liability language, disclosure timing, good-faith protections, statements about third-party providers, researchers' handling of personal data (Act 843) | Security page 1.2-draft; `security/responsible-disclosure.md`; `/.well-known/security.txt` `Policy` link | Approve or amend wording; decide whether any legal undertaking is given | Open — **LEGAL REVIEW REQUIRED**; engineering must not draft stronger wording |

## E. Payments and consumer terms

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| E1 | Bank of Ghana payment-service licensing: confirm that Abonten, as a merchant using Paystack, carries no licence obligation of its own; confirm the same for manual payouts to organizers and field-team commissions | Terms §6, §8; `finance/` | Confirm with counsel / Paystack | Open |
| E2 | Consumer-protection review of the refund terms: service fee non-refundable; no change-of-mind refunds; organizer cancellation refunds ticket price only | Terms §7 | Confirm enforceability and required disclosures | Open |
| E3 | Taxes: VAT / levies on Abonten's service fee and on promotions; whether prices must be shown tax-inclusive; organizer tax responsibilities | Terms §6, §8, §10 | Tax advice | Open |
| E4 | Liability caps and disclaimers (Terms §20–§21) under Ghanaian consumer law | Terms §20, §21 | Confirm | Open |
| E5 | Governing law and dispute resolution: whether to require mediation/arbitration before court | Terms §23 | Decide | Open |
| E6 | Abonten Credit as a promotional, non-cash balance: confirm it does not constitute stored value / e-money requiring a licence; confirm expiry and forfeiture-on-deletion terms | Terms §12 | Confirm | Open |
| E7 | Referral and promoter incentives: any marketing / lottery / inducement rules that apply | Terms §12 | Confirm | Open |
| E8 | Field-team commissions: employment vs contractor status of team members, and tax on commission payouts | `field-operations/` | Confirm | Open |
| E9 | Chargeback handling: pausing accounts and holding payouts during disputes | Terms §7 | Confirm | Open |

## F. Content, intellectual property and app stores

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| F1 | User-content licence wording and the copyright takedown process | Terms §13, §17 | Confirm | Open |
| F2 | Google Play Data safety form must match the Privacy Policy (data types, sharing, deletion) | Play listing | Compliance review at each release | Open |
| F3 | Apple App Store privacy labels and account-deletion requirement (when iOS ships) | Future iOS listing | Prepare when applicable | Open |
| F4 | Trademark status of the Abonten name and logo | Terms §17 | Confirm registration | Open |

## G. Communications

| # | Item | Affects | Decision needed | Status |
|---|---|---|---|---|
| G1 | If marketing emails or SMS are ever introduced: consent capture and opt-out under Act 843 | Privacy §8 | Decide before launch | Open |
| G2 | Reward-notice emails: confirm they are service messages, not marketing, given the existing opt-out | Privacy §8 | Confirm | Open |
| G3 | Recommendation push notices and alerts (Discovery): confirm that an explicit in-app opt-in, a per-category switch, one-tap stop and a two-week pause meet Act 843 for promotional push; confirm how long the opt-in record (`notification_prompt_state`) must be kept. No recommendation email is sent; if one is ever added it falls under G1. | Privacy §8; `architecture/discovery-search-and-recommendations.md` §4 | Confirm before switching shadow mode off for anyone outside staff | Open |

## H. Placeholders standing in for information not yet provided

These tokens appear verbatim in the public drafts. They are deliberate: the information has not been provided and must not be invented. `scripts/check-docs.mjs` counts them and fails if a legal document is marked Published or Approved while any remain.

| Placeholder | Documents | Provided by | Register item |
|---|---|---|---|
| ~~`[LEGAL ENTITY NAME — TO BE CONFIRMED]`~~ | Terms §1, Privacy §1 | **Filled 2026-09-12** from the certified Form 3: Abonten Hub Ltd | A1 (Decided) |
| ~~`[COMPANY REGISTRATION NUMBER — TO BE CONFIRMED]`~~ | Terms §1 | **Filled 2026-09-12**: CS015010126 | A1 (Decided) |
| ~~`[REGISTERED ADDRESS — TO BE CONFIRMED]`~~ | Terms §1, Privacy §1 and §15 | **Filled 2026-09-12**: registered address and P.O. Box 465, Weija, Accra | A1 (Decided) |
| `[DPC REGISTRATION STATUS — TO BE CONFIRMED]` | Privacy §1 | Verified fact only — never assumed; not shown in the company documents | A2 |
| ~~`[SUPPORT CONTACT — TO BE CONFIRMED]`~~ | Terms §19 | **Filled 2026-09-12**: support@abontenhub.com | A3 (Decided); hours/SLA still O1 |
| ~~`[PRIVACY CONTACT — TO BE CONFIRMED]`~~ | Terms §19, Privacy §15 | **Filled 2026-09-12**: privacy@abontenhub.com | A3 (Decided) |
| ~~`[SECURITY CONTACT — TO BE CONFIRMED]`~~ | Security page | **Filled 2026-09-12**: security@abontenhub.com | A3 (Decided); disclosure policy still S2 |
| `[EFFECTIVE DATE — TO BE CONFIRMED]` | Draft banner and `effectiveDate` of all four documents | Counsel at approval | See `legal/versioning-and-effective-dates.md` |

Procedure for filling them: [specifications/support-and-security-contacts.md](specifications/support-and-security-contacts.md) §3.

## H — Trust and verification

Abonten asks place owners and event organizers to send business documents so a reviewer can confirm the business is real and that the account belongs to the people who run it. Shipped 2026-09-12, switched off. Design: [architecture/trust-and-verification.md](architecture/trust-and-verification.md).

| # | Item | Where it appears | What counsel must confirm or decide | Status |
|---|---|---|---|---|
| H1 | Which documents Abonten may ask for and store: Registrar General's certificate, district-assembly Business Operating Permit, sector licences, TIN certificate, lease or tenancy agreement, utility bill, authorisation letter, and for organizers event permits and past-event material | `verification_evidence_type` seed; help `place-owners/getting-verified`, `organizers/getting-verified` | Confirm each category may lawfully be requested and held, and whether any should be removed. Nothing is mandatory: an applicant sends whatever they have. No identity documents are requested. | Open |
| H2 | Retention period for business documents under the Data Protection Act, 2012 (Act 843) | `verification_program_setting`; nightly purge job; help pages | Confirm a lawful period for unapproved and for revoked cases. Ships at 90 and 365 days as a working default, changeable by setting. Ties to decision V1 and to the R-items in [specifications/retention-jobs.md](specifications/retention-jobs.md). | Open |
| H3 | The public meaning of the Verified badge | `packages/core/src/verification/copy.ts`; badge popover on web and mobile; help pages | Confirm the wording: Abonten reviewed documents supporting the business's registration and its link to the account, and verification is **not** a guarantee of the business, its service, safety or quality. Nothing may be added that implies endorsement. | Open |
| H4 | Whether a verification decision is subject to the appeals route | [specifications/appeals-workflow.md](specifications/appeals-workflow.md); Terms | Decide whether a rejected or revoked applicant has a formal appeal beyond simply reapplying, which the product already allows. | Open |

## Specifications waiting on this register

| Specification | Blocking legal items |
|---|---|
| [specifications/cookie-consent.md](specifications/cookie-consent.md) | B4 |
| [specifications/age-gate.md](specifications/age-gate.md) | B7 |
| [specifications/data-export.md](specifications/data-export.md) | B5 |
| [specifications/retention-jobs.md](specifications/retention-jobs.md) | B3, B9, E3 |
| [specifications/appeals-workflow.md](specifications/appeals-workflow.md) | E4 (wording) |
| [specifications/support-and-security-contacts.md](specifications/support-and-security-contacts.md) | — (A1 and A3 Decided; remaining steps are decisions O1 and S2) |

Verified corporate identity: [legal/company-registration.md](legal/company-registration.md).

## How to use this register

1. Counsel works through each row and records the decision and date in the Status column.
2. Engineering implements any resulting change (for example a cookie banner, a retention job, an age gate) from the matching specification and updates the affected documents.
3. When every row a document depends on is Decided and every placeholder in section H is filled, the document can move from **Review required** to **Published** with an effective date (see `legal/versioning-and-effective-dates.md`). Never before.
