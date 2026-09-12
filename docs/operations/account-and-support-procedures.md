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
