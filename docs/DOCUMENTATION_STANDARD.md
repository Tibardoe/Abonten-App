---
title: Documentation standard
purpose: Define the metadata, structure, language and review rules every Abonten document must follow.
audience: Anyone writing or reviewing documentation
scope: All files under docs/ and apps/web/src/content
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Documentation standard

## 1. Metadata block

Every Markdown document starts with a front-matter block. `scripts/check-docs.mjs` fails the build if a required key is missing or `status` is not one of the allowed values.

```yaml
---
title: <Document title>
purpose: <One sentence: what this document is for>
audience: <Who should read it>
scope: <What it covers and, where useful, what it does not>
status: Draft | Review required | Approved | Published | Deprecated
version: <major.minor, e.g. 1.0>
lastReviewed: <YYYY-MM-DD>
technicalOwner: <role or person>
businessOwner: <role or person>
legalReviewRequired: yes | no
complianceReviewRequired: yes | no
---
```

Legal documents add `effectiveDate` and `summary`. Help-centre pages use the shorter public block (`title`, `summary`, `order`, `lastUpdated`, `status`, `owner`) because their metadata is rendered on the site.

## 2. Required sections

Internal procedures and runbooks use this order; omit a heading only when it truly does not apply.

1. **Purpose** (may be covered by the metadata)
2. **Prerequisites** — access, permissions, tools
3. **Procedure** — numbered steps, one action per step
4. **Expected outcome** — what "done" looks like, how to verify it
5. **Exceptions** — what to do when a step fails
6. **Escalation** — who to involve, when
7. **Security and privacy notes** — data touched, what must not be shared

Troubleshooting entries use **Problem → Symptoms → Likely causes → Checks → Resolution → Escalation**. Support scenarios use **Situation → Diagnosis → Steps → Expected result → Escalation**.

## 3. Grounding rule

Every statement about system behaviour must be traceable to the code, the schema (`supabase/migrations/`), or a configuration file. Name the source in internal documents (a file path in backticks, a table or function name). Where the code does not establish a behaviour or policy, write exactly:

> **NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED**

and add a row to `OPERATIONAL_DECISIONS_REQUIRED.md`. Retention values without an implemented job are written as **POLICY DECISION REQUIRED**. Anything that needs a lawyer or an official confirmation goes to `LEGAL_REVIEW_REQUIRED.md`.

Three further conventions follow from this rule:

- **Placeholders, not inventions.** Facts the founder has not supplied (legal entity, addresses, contact channels, effective dates) appear in the public legal documents as `[NAME — TO BE CONFIRMED]` tokens, listed in `LEGAL_REVIEW_REQUIRED.md` §H. `scripts/check-docs.mjs` fails if a legal document is Published or Approved while any remain.
- **Recommendations are labelled.** Where a register offers a suggested default, the column or sentence says *recommendation, not approved policy*. No document may describe a recommendation as the current rule until the register row is Decided.
- **Specifications are gated.** A design for work that depends on an open decision lives in `docs/specifications/`, ends with an "Approval required before implementation" section naming the register items, and is never built before those items are Decided.

Never document a planned, flag-gated-off or shadow-mode feature as available. Say what state it is in.

## 4. Public vs internal

Public documents (`apps/web/src/content/**`) must not contain: file paths, table/function names, environment-variable names, staff procedures, permission keys, provider account details, security weaknesses, or any personal data. Internal documents may contain all of those except secrets and personal data.

Never include a real credential, key, token, connection string or personal phone/email anywhere. Use `<PAYSTACK_SECRET_KEY>`-style placeholders only when describing configuration.

## 5. Language

- Plain English, short sentences, active voice.
- Explain a technical term the first time it matters ("RLS — row-level security, Postgres rules that decide which rows a user can read or write").
- Consistent product terms: **Abonten Credit** (not wallet credit), **place owner** (not venue owner, except in the "venue rebate" reward name), **organizer**, **customer**, **field team / team member / team lead**, **admin console**, **service fee**, **payout**, **booking request**.
- Use tables for parallel facts, numbered lists for procedures, diagrams sparingly (Mermaid in fenced blocks when a flow is genuinely hard to follow in prose).
- No screenshots: they go stale silently. Describe the control by its label instead.

## 6. Links

Relative Markdown links within `docs/`; site paths (`/legal/terms`, `/help/...`) for public pages. Every link is checked by `npm run check:docs`; external links are checked with `--external`.

## 7. Versioning

Bump `version` (minor for clarifications, major for changes in substance) and `lastReviewed` on every meaningful change, and add a line to `changelog/README.md`. Legal documents follow the stricter rules in `legal/versioning-and-effective-dates.md`.

## 8. Templates

**Runbook**

```markdown
---
title: <Incident family or procedure>
purpose: …
audience: …
scope: …
status: Draft
version: 0.1
lastReviewed: YYYY-MM-DD
technicalOwner: …
businessOwner: …
legalReviewRequired: no
complianceReviewRequired: no
---

# <Title>

## When to use this
## Prerequisites
## Procedure
1. Detect …
## Expected outcome
## Exceptions
## Escalation
## Security and privacy notes
```

**Troubleshooting entry**

```markdown
### <Problem>
- **Symptoms:**
- **Likely causes:**
- **Checks:**
- **Resolution:**
- **Escalation:**
```
