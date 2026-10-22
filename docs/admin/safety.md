---
title: Admin — Safety
purpose: How to switch Abonten Safety on in stages, read whether alerts and texts reached people, answer support questions about it, and stop it safely.
audience: Operations, support
scope: Admin › Safety (Sessions, session detail, Settings), the safety.view / safety.configure permissions, the SAFETY_KILL_SWITCH deploy flag and the safety-dispatch and safety-housekeeping jobs
status: Approved
version: 1.0
lastReviewed: 2026-10-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Admin — Safety

Abonten Safety lets a person name trusted contacts and, from the website or the app, press **SOS**, ask Abonten to **check in on them**, or **share their live location**. The contacts get a text (and a push or email where possible) with a link to a live page. How it works: [architecture/safety.md](../architecture/safety.md). Decisions still open: J1–J6 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); legal items I1–I5 in [LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md).

**What staff can never see here:** where anyone was, and what a person wrote to their contacts. The console shows that a session has a note, how many positions arrived and when the last one did, never the positions or the note. Do not ask the database for them either; if a person needs their own history, they have it in the app.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `safety.view` | Sessions, session detail (who was told, how each message went, who answered, the timeline), the settings (read only) | operations, support_admin (super_admin always) |
| `safety.configure` | Change the settings. Needs a fresh step-up | operations (super_admin always) |

## Sessions

Admin › Safety opens on the last 30 days: open sessions, alerts (and how many were missed check-ins or mistakes), sessions by kind, messages sent / failed / waiting, and how many people have trusted contacts. Below, every session newest first, filterable by kind (SOS, check-in, share) and state (alert open, running, closed, ran out). Each row shows how many people were told, how many opened it and answered, and how many messages went or failed.

Open a session to see:

- **Who was told:** each contact (phone masked) or the event team, when they first opened it and how often, and their answer (on the way, calling, can't help).
- **Messages:** every text, email and push, what it was (invite, share, alert, missed check-in, safe, mistake, event team), its status, tries, and the provider's error when it failed. Texts are retried at 1, 2 and 5 minutes, so "pending" with tries 2 is normal for a few minutes.
- **Timeline:** started, alerted, note changed, more time, event team told, opened, answered, closed, ran out.

## Common questions

| Question | Where to look | What it usually is |
|---|---|---|
| "My contact never got the text" | The session › Messages | `failed` with "Payment required on account" (Hubtel balance), "not configured" (the web deployment lost its Hubtel variables), or the number has no text rail (outside Ghana: no SMS row at all; the app offered the person's own phone). `skipped … opted out` means the contact said no or stopped all texts |
| "It says my contact declined but they didn't" | Ask the contact to open their invite text again and tap Accept | Someone with the link tapped "No, thank you" |
| "My check-in alerted everyone but I was fine" | Timeline: "reminded" then "alerted" | The person did not tap "I'm safe" within the grace (5 minutes after the time). "That was a mistake" tells everyone |
| "My check-in time passed and nobody was alerted" | Admin › Monitoring › cron (`safety-dispatch`); the session's state | If the job is failing, missed check-ins are not escalated: treat as an incident |
| "My contacts can't see where I am" | Session detail: positions received, last position time | Location permission was off, or the app was closed (this version sends positions only while it is open) |

## Settings

Admin › Safety › Settings. Every change needs `safety.configure`, a fresh step-up, and a reason; it is audited field by field.

| Setting | Default | Notes |
|---|---|---|
| Abonten Safety switched on | off | Off hides SOS, check-ins and shares. Sessions already open keep working until they end, contacts can still open their links, and missed check-ins are still escalated |
| Audience | Staff only | Staff → Staff + beta users (ids one per line) → Everyone signed in. Everyone only after I1–I3, the privacy policy and store answers, and the help page (J1) |
| Check in on me / Share my location | on | Switch either off on its own |
| Tell the event team | **off** | Only after legal item I4 and J5 |
| Trusted contacts per person | 5 | |
| Alerts that send texts, per day | 6 | Beyond it the alert still goes by push and email and the app offers the person's own SMS. An alert is never refused |
| Invite texts per day | 10 | Limits texting strangers |
| Check-in grace | 5 minutes | |
| Alert stays open | 24 hours | |
| Longest share | 12 hours | |
| Delete positions / sessions after | 7 / 180 days | J2 |

The emergency numbers each SOS screen shows come from the market: Admin › Markets (`market.safety_config`); Ghana is seeded with 112, police 191, ambulance 193, fire 192 (J3).

## Stopping it

- **Normal:** untick "Abonten Safety switched on".
- **Emergency (deploy):** set `SAFETY_KILL_SWITCH=true` on the web deployment (and the admin deployment for the warning card) and redeploy. Same effect as switching off, whatever the setting says.
- Neither ever closes an open session: a person in the middle of an alert or a check-in keeps it until they say they are safe or it runs out.

## Rollout checklist

1. Staff: add a contact (a phone you hold), check the invite text arrives and the invite page works; press SOS and read the alert page on that phone; answer from it and see the answer in the app; start a check-in, let it lapse, and check the alert text; share for an hour and stop it.
2. Beta: add the pilot testers' ids; watch Messages for failures for a week.
3. Everyone: only when J1's conditions are met.
