---
title: Pilot testing programme
purpose: Where the pilot's working documents are, how the pilot is structured, what was set up for it, and which decisions and legal checks it is waiting on.
audience: Founder, engineering, support
scope: The closed pilot of app 1.0.0 before public launch; TestFlight group "Pilot testers"; Google Play internal testing; the pilot's WhatsApp community, forms and tracker
status: Draft
version: 1.5
lastReviewed: 2026-10-09
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Pilot testing programme

A four-week closed test of app 1.0.0 with about 40 invited people, run by the founder before public launch. It has not started: on 2026-10-04 it was planned and the documents were written, and on 2026-10-09 both install routes were ready. Nobody has signed up yet, because the announcement has not gone out.

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
- **What testers get:** no money (decided 2026-10-09). They are thanked by code in the community each week they finish, named as founding testers at launch if they agree, and given new versions first. The announcement says there is no payment and that testing uses their own data or Wi-Fi.
- **How long:** one preparation week, then four weeks: first steps, money and events, event day (one real meet-up checked in by QR code), polish and wrap.
- **When (decided 2026-10-09):** announce on Monday 12 October 2026; choose testers on Sunday 18 October; week 1 from Monday 19 October; week 2 from 26 October; week 3 from 2 November; week 4 from 9 November; last checkpoint and the launch decision on Sunday 15 November.
- **Checkpoints:** one at the end of each week, passed or repeated. The last one is the launch decision.
- **Reporting:** a bug form (never the chat), a Friday check-in form, TestFlight's screenshot feedback on iPhone, and the app's own support chat. Levels: blocker, major, minor, idea.
- **Where testers act:** the production app. Payments stay in Paystack test mode for weeks 1 to 3 (the public test card), with one real-money day in week 4 only if the live cut-over has happened (`../finance/paystack-live-cutover.md`).

## What exists already

| Thing | State on 2026-10-09 |
|---|---|
| TestFlight group "Pilot testers" (outside testers, feedback on, no public link) | Created. Apple approved build 1.0.0 (20) for outside testers. No tester added yet: invite each accepted tester by email (`asc testflight groups add-testers`) |
| Google Play internal testing | Set up on 2026-10-09, after Google approved the production release. Release "1.0.0 (6) pilot test" is the same bundle as production. The email list is "Abonten pilot testers"; it holds only the founder's Workspace account so far. The join link is on the track's Testers tab and in the run-book. Add each accepted tester's Gmail address to the list, then send the link |
| The three Google Forms (sign-up with the agreement, bug report, Friday check-in) and the "Abonten Pilot tracker" sheet they feed | Built in the founder's Google Workspace account by an Apps Script project there ("Untitled project", allowed to manage Forms and Sheets). The links are in the run-book, section "The three forms". The forms answer without a Google sign-in. Not yet shared with anyone |
| WhatsApp community "Abonten Pilot" | Created on 2026-10-09 on a company number kept for the pilot: Announcements (only admins post), General, Help Desk and groups A to D. The rules are in the description of Help Desk and of each lettered group. Members cannot add people or change group settings, joining a lettered group needs approval, and only admins can add groups. No member yet besides the founder. The founder linked that WhatsApp number to the browser Claude drives, so the groups can be checked from there; WhatsApp › Linked devices on the phone ends that access |

## Rules that follow from how the product works

- **Testers post into production.** Until both store reviews have answered, obviously fake listings can get the app rejected. Listings must be real-looking and use the tester's own pictures; new ones are looked at every morning and junk is hidden in Admin › Moderation. The start does not wait for Apple's review (see "Waiting on").
- **Every phone sign-in sends a paid text message** and each number is limited to five codes an hour and ten a day. Testers who meet the limit use Google or email sign-in.
- **Fixes reach testers as over-the-air updates** on the `production` channel for runtime 1.0.0 (`../deployment/mobile-eas.md`). Try each update on one device before trusting it.
- **The Play test does not publish the app.** An internal testing release goes live at once and leaves the approved production changes waiting in Publishing overview (`../deployment/store-listings.md`). Until those are published, Google shows testers the app under the name "com.abonten.app (unreviewed)"; the handbook tells them so.
- **A WhatsApp pin is not where the rules live.** A person who joins a group after a message was pinned cannot see that pin, and a pin lasts 30 days at most. The rules go in each group's description; the welcome message is pinned after testers have joined. The WhatsApp Business app cannot create a community. In a small group every member can add people and share the invite link unless that is switched off.
- **Clean up before launch:** pilot listings that are not real, the sample events and the test content hidden on 2026-10-04 (`../deployment/store-listings.md`, "Before the app is public").

## Waiting on

| Item | Register |
|---|---|
| The confidentiality agreement has not been read by a lawyer; neither has electronic acceptance on a form as the way of signing. The founder decided on 2026-10-09 to use it as written for the pilot | `../LEGAL_REVIEW_REQUIRED.md` F6 (still open for counsel) |
| How long the tester list is kept (what testers are given and the dates are decided) | `../OPERATIONAL_DECISIONS_REQUIRED.md` D10 |
| Apple's review of version 1.0.0 had not started on 2026-10-09. The pilot does not wait for it (founder, 2026-10-09): week 1 runs in full from 19 October, because real-looking listings are not a risk to the review. New events and places are looked at every morning and junk is hidden in Admin › Moderation | `../deployment/store-listings.md` |
| The testers' sign-up details are a new set of personal data (name, phone, email, phone model, city) held in Google Workspace. Recorded in `../privacy/data-inventory.md` §12 on 2026-10-09; the forms held no answers then | How long it is kept is still to decide (D10) |
