---
title: Account and support procedures
purpose: Standard procedures for the support desk — channel, tone, identity checks, common account operations, escalation.
audience: Support staff, operations
scope: The in-app support conversation; account status, sign-in, profile and deletion matters
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Account and support procedures

## Channel

Support is the in-app **support conversation** (Admin › Support). It is tied to a signed-in account, which is our identity check for routine matters. Requests arriving any other way (social media DMs, personal contacts) are asked to use the app or website so the record stays with the account. Hours and response targets: decision O1.

## Email channels (since 2026-09-12)

| Address | Purpose | Handled by | Procedure |
|---|---|---|---|
| support@abontenhub.com | People who cannot sign in (restricted accounts, lost phone/email), and general enquiries | Support | This page; `../admin/support-scenarios.md` |
| privacy@abontenhub.com | Access, correction, deletion, objection and complaint requests | Support, escalating to the founder | `../privacy/privacy-rights-operations.md` |
| security@abontenhub.com | Vulnerability reports and security concerns | Founder (incident commander) | `../incident-response/vulnerability-report.md` |

How they work: all three are **Google Workspace aliases** on the founder's primary Workspace mailbox (whose own address is never published or written into documentation). Mail to an alias lands in that one mailbox; nothing routes into the admin Support queue. The three addresses are defined once in `packages/core/src/brand/contacts.ts` and quoted verbatim in the legal pages (the validator checks they match).

Rules:

1. **Reply as the alias, not the personal address.** In Gmail: Settings › Accounts › "Send mail as" › add each alias (Workspace aliases need no SMTP verification; tick "Treat as an alias"), then pick the alias in the From field when replying. Until that is set up, replies would go out from the personal address — do not reply until it is.
2. **Move account matters in-app where possible.** If the writer has an account and can sign in, ask them to continue in the support conversation so the record is tied to the account; log the email in an admin note.
3. **Verify before acting.** For anything about an account, the email must come from the address on that account (`users.view_pii`), or the person must confirm from the app. Never act on a request about someone else's account.
4. **Never forward** customer email to personal or third-party addresses; never paste one-time codes, card details or attendee lists into email.
5. **Retention:** email lives in Google Workspace under Google's terms; it is not part of the database inventory. Treat the mailbox as personal data storage: delete threads once resolved and recorded, until a retention decision (R-series) covers it.
6. **Hours and response target:** none published (decision O1). Acknowledge privacy requests within 3 working days per the interim practice in the privacy procedure.
7. **Filters and labels:** set Gmail filters so each alias gets its own label and the security label is starred; check daily.

## Tone and limits

Plain, short, factual. Never ask for one-time codes, card numbers, PINs or passwords (there are none). Never promise refund completion, payout timing or moderation outcomes we do not control. Link the help centre article when it answers the question.

## Identity checks

| Request | Check |
|---|---|
| Anything about the requester's own account | Signed-in support conversation is sufficient |
| Changing the phone/email on an account the user cannot access | Cannot be done by support; the user must add the new contact from a signed-in session. If they cannot sign in at all, escalate (privacy procedure §3 identity standard, decision O2) |
| Requests about another person's account | Refuse; explain we only discuss an account with its holder |
| Law enforcement / legal | Escalate to founder and counsel |

## Common operations (what support can and cannot do)

| Operation | Support can | Who does it otherwise |
|---|---|---|
| Explain account status / reason | yes (Users detail, audit) | — |
| Restore a suspended account | no | operations/moderator with `users.restore`; bans: founder |
| Reset a sign-in method | no such thing — codes are one-time | — |
| Merge two accounts | no tool exists | — |
| Change username / name | no — user does it in Settings | engineer only for policy-violating names (as moderation) |
| Delete account | no — user self-service | engineer via privacy procedure if the user cannot sign in |
| Resend a notification / ticket email | yes (`notifications.send`) | — |
| Refund | no | finance_admin |
| Create payout | no | finance_admin |
| Goodwill credit | `rewards.goodwill` (support_admin has it): ≤ GH₵ 50/user/month, audited | finance for more |

## Record keeping

Every non-trivial case gets an **admin note** on the user (what was asked, what was done, decision reasons). Notes are immutable; add a new one to correct.

## Escalation matrix

| Topic | To |
|---|---|
| Money (refunds, payouts, disputes) | finance_admin |
| Content and behaviour | moderator |
| Claims | operations |
| Rewards decisions | finance_admin / rewards reviewer |
| Field programme | field_ops_manager |
| Privacy requests, complaints, breaches | founder (+ counsel) |
| Outages, bugs | engineering (open an incident) |
