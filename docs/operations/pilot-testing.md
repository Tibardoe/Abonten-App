---
title: Pilot testing programme
purpose: Where the pilot's working documents are, how the pilot is structured, what was set up for it, and which decisions and legal checks it is waiting on.
audience: Founder, engineering, support
scope: The closed pilot of app 1.0.0 before public launch; TestFlight group "Pilot testers"; Google Play internal testing; the pilot's WhatsApp community, forms and tracker
status: Draft
version: 1.1
lastReviewed: 2026-10-04
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Pilot testing programme

A four-week closed test of app 1.0.0 with about 40 invited people, run by the founder before public launch. It has not started: on 2026-10-04 it was planned and the documents were written.

## The working documents

These are living documents in the founder's Claude account, not files in this repository. They are edited there and exported as PDF to send to testers.

| Document | For | Link |
|---|---|---|
| Abonten Pilot Testing Run-book | The founder: targets, groups, the four weeks and their checkpoints, missions, reporting and triage, tools, weekly routine, rewards, risks, closing, the WhatsApp messages and the three forms question by question | https://claude.ai/code/artifact/0a5c0c77-3e36-4c5f-bfa5-b2934ef37c79 |
| Abonten Pilot Tester Confidentiality Agreement | Each tester, accepted on the sign-up form | https://claude.ai/code/artifact/48c5d976-11bb-470c-acfc-0b8e577d693b |
| Abonten Pilot Tester Handbook | Each tester, sent with the invitation | https://claude.ai/code/artifact/55a75604-6684-463f-a108-0511c1cfd37d |

The links open only for the founder's account.

## Structure in brief

- **Who:** 40 accepted testers and a waiting list of 10, in four groups: 20 explorers (A), 10 organizers (B), 5 place owners (C), 5 breakers (D). Each tester has a code (A01, B01 …) that goes on every report.
- **How long:** one preparation week, then four weeks: first steps, money and events, event day (one real meet-up checked in by QR code), polish and wrap.
- **Checkpoints:** one at the end of each week, passed or repeated. The last one is the launch decision.
- **Reporting:** a bug form (never the chat), a Friday check-in form, TestFlight's screenshot feedback on iPhone, and the app's own support chat. Levels: blocker, major, minor, idea.
- **Where testers act:** the production app. Payments stay in Paystack test mode for weeks 1 to 3 (the public test card), with one real-money day in week 4 only if the live cut-over has happened (`../finance/paystack-live-cutover.md`).

## What exists already

| Thing | State on 2026-10-04 |
|---|---|
| TestFlight group "Pilot testers" (outside testers, feedback on, no public link) | Created. Build 1.0.0 (20) added and submitted to Apple's beta review |
| Google Play internal testing | Not set up. Do it after Google's production review ends, with the testers' Gmail addresses |
| The three Google Forms (sign-up with the agreement, bug report, Friday check-in) and the "Abonten Pilot tracker" sheet they feed | Built in the founder's Google Workspace account by an Apps Script project there ("Untitled project", allowed to manage Forms and Sheets). The links are in the run-book, section "The three forms". The forms answer without a Google sign-in. Not yet shared with anyone |
| WhatsApp community | Not created |

## Rules that follow from how the product works

- **Testers post into production.** Until both store reviews have answered, obviously fake listings can get the app rejected. Missions start after the reviews; listings must be real-looking and use the tester's own pictures. Junk is hidden in Admin › Moderation.
- **Every phone sign-in sends a paid text message** and each number is limited to five codes an hour and ten a day. Testers who meet the limit use Google or email sign-in.
- **Fixes reach testers as over-the-air updates** on the `production` channel for runtime 1.0.0 (`../deployment/mobile-eas.md`). Try each update on one device before trusting it.
- **Clean up before launch:** pilot listings that are not real, the sample events and the test content hidden on 2026-10-04 (`../deployment/store-listings.md`, "Before the app is public").

## Waiting on

| Item | Register |
|---|---|
| The confidentiality agreement has not been read by a lawyer; neither has electronic acceptance on a form as the way of signing | `../LEGAL_REVIEW_REQUIRED.md` F6 |
| What testers are given, how long the tester list is kept, and the start date | `../OPERATIONAL_DECISIONS_REQUIRED.md` D10 |
| The testers' sign-up details are a new set of personal data (name, phone, email, phone model, city) held in Google Workspace. The forms exist but hold no answers yet | Add it to `../privacy/data-inventory.md` before the sign-up link is shared |
