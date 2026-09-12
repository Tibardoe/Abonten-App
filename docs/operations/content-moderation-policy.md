---
title: Content moderation policy (internal)
purpose: Define prohibited content and behaviour on Abonten, how it is detected, reviewed and acted on, what evidence is kept, and how decisions can be reversed.
audience: Moderators, operations, support, founder
scope: Events, places, reviews and responses, highlights, messages and conversations, user accounts, reports
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Content moderation policy (internal)

This policy operationalises Terms §13–§15. It describes what the team does with the tools that exist; it does not assert legal conclusions.

## 1. Prohibited content and behaviour

| Category (report reason) | Examples | Default action |
|---|---|---|
| **Fraud / scam** (`fraud_scam`) | fake events, tickets for events the poster cannot deliver, off-platform payment lures, fake payout requests | Hide immediately; hold payouts; investigate; remove + ban if confirmed |
| **Fake listing** (`fake_listing`) | non-existent business, duplicate created to hijack, wrong ownership | Hide; verify via Claims/field records; remove |
| **Misleading** (`misleading`) | wrong date/venue/price, bait titles | Contact owner via Support to fix; restrict if repeated; hide if unfixed |
| **Harassment** (`harassment`) | threats, abuse, targeted insults in messages, reviews, highlights | Hide message/review; suspend on repeat or severity |
| **Hate** (`inappropriate` / `safety`) | attacks on protected characteristics | Remove; ban |
| **Sexual content / exploitation** (`inappropriate` / `safety`) | explicit content; anything involving minors | Remove immediately; ban; preserve evidence; escalate to founder for reporting to authorities |
| **Illegal activity** (`safety`) | events or listings for illegal goods/services, incitement | Remove; ban; escalate |
| **Impersonation** (`impersonation`) | posing as a brand, venue, organizer or Abonten | Hide; verify with the real party; remove; ban |
| **Spam** (`spam`) | repetitive listings, link farms, mass messaging | Remove; suspend; disable referral code if reward-motivated |
| **Fake reviews** | self-reviews, paid/coordinated reviews, review bombing | Remove reviews; suspend accounts; note on organizer/owner |
| **Malicious links / uploads** | phishing URLs, malware attachments | Remove; ban; engineering destroys the asset |
| **Copyright** (`copyright`) | stolen flyers, photos | Hide on a credible notice; remove if not resolved |
| **Abuse of messaging** | unsolicited commercial messages, harassment | Hide; block guidance; suspend |
| **Misuse of data** | organizers/owners exporting attendee data, sharing owner phones | Suspend; founder decides on ban |

## 2. Detection

- **User reports** (10 reasons, 10 target types, attachments) → report queue with seeded priority.
- **Grouped view** shows items with multiple independent reporters.
- **Proactive sweeps** in Admin › Content (newest items).
- **Programme signals**: rewards risk flags, field-programme duplicate/claim flags, payment disputes → incidents.
- **No automatic hiding exists** (decision M1): every state change is a human action.

## 3. Review

Read the item and its context; check the account's history (reports against, previous actions in the audit log, admin notes); for messages, read only the reported thread. Apply the least action that removes the harm: **restrict** (still visible, not featurable) → **hide** (invisible to the public, owner still sees it) → **remove** (final) → account **suspend** → **ban**.

## 4. Action and record

Actions go through `apply_moderation_action` (idempotent; audited `moderation.*`) and `setUserStatusCore` (audited `user.status.*`); acting from the report workspace adds `action_taken` to the report timeline. Always write the reason. Resolve the report (or Resolve all N for a grouped item).

## 5. Evidence

Reports keep their attachments (private bucket) and timeline; moderation actions keep the reason; admin notes are immutable. For potential criminal matters, an engineer exports the record set before anything is changed and the founder decides on reporting to authorities (legal D2 / B6 for notification duties).

## 6. Appeals and reversals

No formal appeal exists (decision O4). A user contacts Support; a moderator or admin with `moderation.restore` / `users.restore` reviews and reverses if wrong, recording why. Repeatedly false reports are marked `false_report` and count against the reporter.

## 7. Permanent bans

`users.ban` (step-up) is intended as final. Reserve for: fraud, exploitation, hate, illegal activity, repeated harassment after suspension, coordinated fake reviews, data misuse, evasion of a previous ban. Decision M2 formalises durations for suspensions.

## 8. Reporting to the reporter

We confirm receipt in the UI and do not share detailed outcomes (decision M3).
