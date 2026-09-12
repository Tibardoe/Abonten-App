---
title: Responsible disclosure framework (S2)
purpose: Define how Abonten receives, handles and closes vulnerability reports, what is published, what is deliberately withheld pending legal review, and how the security.txt file is maintained.
audience: Founder (incident commander), engineering, legal counsel
scope: The public "Responsible disclosure" section of /legal/security, /.well-known/security.txt, the security@ mailbox and the vulnerability-report runbook
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Responsible disclosure framework (S2)

## What is published (as of 2026-09-12)

| Artefact | Where | Content |
|---|---|---|
| Responsible-disclosure section | `apps/web/src/content/legal/security.md` → `/legal/security#responsible-disclosure` (Security overview 1.2-draft) | Reporting channel, what to include, acknowledgement process (no time target), safe-testing expectations, prohibited testing, personal-data expectations, handling of reports, coordinated disclosure, researcher conduct, and an explicit statement that **no legal safe harbour is offered yet** |
| `security.txt` | `apps/web/public/.well-known/security.txt` → `https://abontenhub.com/.well-known/security.txt` | RFC 9116 fields: `Contact: mailto:security@abontenhub.com`, `Expires`, `Policy` (the section above), `Canonical`, `Preferred-Languages: en`. No `Encryption` field: Abonten publishes no PGP key. No `Acknowledgments` or `Hiring` |
| Contact address | `packages/core/src/brand/contacts.ts` (`SECURITY_EMAIL`) | Google Workspace alias on the founder's mailbox; operating rules in `../operations/account-and-support-procedures.md` §Email channels |

### How security.txt is served (verified against code)

- Static file in the web app's `public/` folder; Next.js serves it with `text/plain; charset=utf-8`.
- The web proxy (`apps/web/src/proxy.ts`) matches `.txt` paths, so the request passes through `updateSession`; `/.well-known/` is already on the public allowlist in `apps/web/src/config/supabase/middleware.ts` (added for the Android and iOS app-link files), so a signed-out request is **not** redirected to sign-in. No allowlist or matcher change was needed.
- No redirect, rewrite or custom header in `apps/web/next.config.ts` touches the path; the only `.well-known` header rule sets the content type of the Apple app-site-association file.
- Vercel serves `public/` files from the edge; the project's region pin (`cdg1`) is irrelevant to a static file.

Verification status (2026-09-12): **SOURCE VERIFIED and locally served** — `npm run check:docs` passes the `security-txt` rule; a signed-out `curl` against `next dev` returned `200 OK`, `Content-Type: text/plain; charset=UTF-8`, the full file body and no redirect, and the rendered `/legal/security` page contains the `id="responsible-disclosure"` anchor the `Policy` field points at. **PRODUCTION VERIFIED: pending** — after the branch is deployed run `curl -i https://abontenhub.com/.well-known/security.txt` and record the result here.

### Maintaining the file

- `Expires` is **2027-03-12T00:00:00.000Z** (six months from publication; RFC 9116 recommends under a year). `scripts/check-docs.mjs` (`security-txt` rule) fails CI when the date has passed and warns when it is within 30 days. Renew by editing the date in the file and adding a changelog line; review the public section at the same time.
- If the security contact changes, change `packages/core/src/brand/contacts.ts` and the file together; the validator checks they agree.
- Keep `Policy` pointing at the anchor of the public section; if the heading is renamed, the slug changes and the validator fails.

## Intake and handling

1. Reports arrive at security@abontenhub.com (or, rarely, in the support conversation). Triage follows `../incident-response/vulnerability-report.md` — the founder is the incident commander (decision S1).
2. **Acknowledgement target: NOT YET DEFINED — BUSINESS POLICY DECISION REQUIRED** (decision O1 covers the urgent/security response target). The runbook's "1 working day" is an internal working target, not published and not a commitment.
3. Confirm and reproduce in a local stack, never on production with real users' data.
4. Fix, deploy, verify; record an incident row in Admin › Monitoring.
5. Tell the reporter when the fix is live and agree a publication date if they intend to publish.
6. Credit the reporter only with their consent; Abonten has no acknowledgements page and no bounty programme (a decision to introduce either would be a business decision).
7. If the report involves personal data exposure, the data-breach runbook (`../incident-response/pii-exposure-and-data-breach.md`) applies alongside; legal B6 governs notification duties.

## LEGAL REVIEW REQUIRED — RESPONSIBLE DISCLOSURE SAFE HARBOUR

The public section deliberately states that Abonten **does not yet provide a legal safe harbour**. Qualified legal counsel must review and approve the following before any stronger wording is published; engineering must not draft or publish it independently:

| Topic | What counsel must decide or approve |
|---|---|
| Safe-harbour wording | Whether Abonten will commit not to pursue civil or criminal action against good-faith researchers, and the exact wording under Ghanaian law (including the Cybersecurity Act, 2020 (Act 1038) and the Electronic Transactions Act, 2008 (Act 772)) |
| Researcher authorisation language | Whether the section constitutes authorisation to access Abonten systems for testing, and its limits |
| Prohibited-testing boundaries | Whether the current list is sufficient and enforceable, and how it interacts with the Terms and Conditions (§13 prohibited conduct) |
| Liability language | Any disclaimer of Abonten's liability for researcher actions, and researcher liability for out-of-scope testing |
| Disclosure timing | Whether to publish a fixed coordinated-disclosure period and what happens if Abonten cannot fix within it |
| Good-faith protections | Definition of "good faith" and the evidence Abonten would rely on |
| Third parties | Whether Abonten may state anything about researchers testing provider systems (Paystack, Supabase and others) |
| Personal-data handling by researchers | Whether the "delete what you retained" expectation needs to be a condition, given Act 843 |

Until counsel has approved, the only permitted statements are the ones in the public section as published on 2026-09-12: expectations, not undertakings. Register: `../LEGAL_REVIEW_REQUIRED.md` (new item D3) and `../OPERATIONAL_DECISIONS_REQUIRED.md` S2.

## Open points (tracked in `../operations/open-items.md`)

- S2: counsel review of the safe-harbour topics above; production verification of `security.txt` after deploy; renewal of `Expires` before 2027-03-12.
- O1: acknowledgement and resolution targets for security reports.
- Optional later: a PGP key (`Encryption` field), an acknowledgements page, a bounty programme — each a business decision, none assumed.
