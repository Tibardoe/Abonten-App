---
title: Admin — Identity
purpose: How to review identity checks, settle a document seen on two accounts, look up a person's identity details when there is a reason to, revoke a check, and switch the programme and its requirements on in stages.
audience: Operations, moderation, support, finance
scope: Admin › Identity (Checks, a check, Settings), the identity.view / view_pii / review / revoke / configure permissions, the IDENTITY_KILL_SWITCH deploy flag, the identity-housekeeping job, and the identity status shown in Admin › Users and Admin › Finance › Payouts
status: Approved
version: 1.0
lastReviewed: 2026-10-24
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Admin — Identity

People who run events or places prove who they are with a government ID and a live selfie on Smile ID's secure page. Most checks are decided automatically; the ones Smile ID was unsure about, and every document already seen on another Abonten account, wait here for a person. How it works: [architecture/identity-verification.md](../architecture/identity-verification.md). Open decisions: L1–L6 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); legal items K1–K7 in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md).

**Abonten never has the photos.** Not the document, not the selfie. A reviewer decides from what Smile ID reported, the other accounts that match, and (when needed) the name and date of birth. If the photos are needed for an investigation, they are requested from Smile ID under the contract, not taken from Abonten's systems.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `identity.view` | The list, each check's status, what Smile ID said, fraud signals, the other accounts that match, the timeline; identity status on Users and Payouts. **No personal details** | operations, moderator, finance_admin, support_admin (super_admin always) |
| `identity.view_pii` | The name on the document, date of birth, last four characters of the number, expiry. Fresh step-up and a reason each time; every look is in the audit log as `identity.pii.view` | operations (super_admin always) |
| `identity.review` | Approve or reject a check in review | operations, moderator (super_admin always) |
| `identity.revoke` | Take a live check away. Fresh step-up | operations (super_admin always) |
| `identity.configure` | The settings. Fresh step-up | operations (super_admin always) |

## Checks

Admin › Identity opens with how many checks need review, how many people are verified and how many checks are in progress, then every check newest first. Filter by state: needs review, verified, rejected, revoked, failed, checking. Each row shows the person, the document, the state, what Smile ID said (clear, attention, blocked, error, and a fraud signal if any) and how many other accounts showed the same document or person.

Open a check to see what Smile ID reported, whether the person is an adult, the decision and its reason, how long the check is valid, when the person agreed and to which notice, and the timeline. A yellow card lists the **other accounts with the same document or person**, their own state, whether one of theirs was revoked before, and whether the account is still active.

## Deciding a check in review

A check comes to review when Smile ID said "attention", reported a fraud signal or its own duplicate, or the document or person is already on another Abonten account (or when automatic approval is off).

- **A match with another account.** Open both accounts. Usually it is one person with two accounts (an old one, a business one): approve, and consider whether one account should be closed. If the other account was banned or its check revoked, or the accounts look unrelated (different names, cities, activity), this may be a stolen or borrowed document: reject with a reason and look at both accounts' payouts. Never approve a document for a second person.
- **Attention or a fraud signal, no match.** Look at the person's activity (events, claims, payout requests, reports). If nothing is odd, approve; if the person is trying to get paid quickly for an event with no history, reject and ask support to follow up.
- **Reject needs a reason** (5 characters or more). The person is told the check didn't pass and to contact support; your reason is kept in the audit log, not shown to them.
- The panel refuses to approve a banned or deleted account.

## Seeing someone's details

Only with a reason: a duplicate to settle, a chargeback or fraud investigation, a request from the police (legal item K4: follow the law-enforcement process and record the request reference in the reason). Confirm it's you (step-up), type the reason, press **Show identity details**. The details show on that page only; nothing is listed or exported. Do not copy them into tickets or chats.

## Revoking a check

Use it when a document turns out not to be the person's, for fraud, or when the account is being closed for cause. Confirm it's you, give the reason, revoke. The "ID checked" badge goes at once, and everything that needs a checked identity (payouts, claims, badges, ticket sales, depending on the settings) stops for that person. They are told to contact support. If they try again, the new check goes to review, because it matches a revoked one.

## Settings

Admin › Identity › Settings (changes need `identity.configure` and a fresh step-up; every change is audited with its reason):

- **Switched on / audience** (staff, staff + beta user ids, everyone). Off hides the page on the website and in the app and stops every requirement. Approved checks keep their badge.
- **Approve clear checks automatically.** Off sends every check to review.
- **Require a checked identity for:** adding a payout account and being paid; having a place claim approved; getting a Verified badge; selling tickets. Only for people in the audience. Turn them on one at a time (decision L2), and tell organizers first.
- **Numbers:** attempts per day (3) and per 30 days (6) — each attempt is a paid check; minimum age (18); how long a check lasts (36 months, or until the document expires); how long the link lasts (24 hours); how long unsuccessful checks (1 year), checks of deleted accounts (2 years) and checks linked to fraud (5 years) are kept.

`IDENTITY_KILL_SWITCH=true` on the web **and** admin deployments closes the programme and every requirement at once, whatever the settings say (the settings page says so when it is set).

## Common questions

| Question | Where to look | What it usually is |
|---|---|---|
| "I did the check but nothing changed" | The person's check | Still "checking": Smile ID's answer is on its way (minutes). "Started" for hours: they closed the page before finishing; they can continue or start again |
| "It says my document is linked to another account" | The check, the matches card | One person, two accounts (approve and tidy up) or a borrowed document (reject) |
| "I can't add my payout account" | Users › the person › Identity | The payout requirement is on and they are not checked yet; send them to Settings › Identity verification |
| "Why was I rejected?" | The check: what Smile ID said, the reason | Face didn't match, selfie not live, document expired, under 18; they can try again with good light and the whole document in the frame |
| "Too many attempts" | The settings | 3 a day, 6 in 30 days; ask them to wait, or raise the limit for everyone if many hit it |

## Jobs

`identity-housekeeping` (pg_cron, daily 04:10 UTC) expires unfinished links and approvals past their date, and deletes old records by the retention settings above. It shows in Admin › Monitoring's cron check like every other job.
