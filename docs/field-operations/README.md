---
title: Field team handbook
purpose: Everything a member or team lead of an Abonten field team needs — what the programme is, how to work a day, how onboarding, review, earnings and payouts work, and the rules that protect business owners and the team.
audience: Field team members (offline, online, content creator), team leads; field_ops_manager admins for reference
scope: The field programme as built in Phases 0–8 (web app /field/**), switched off in production at the time of writing
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Field team handbook

> **Status:** the programme is built and tested but **switched off** in production. When the founder starts the pilot (decision P1), this handbook applies. Until then `/field` shows "not found".

## What the programme is

A regional team (roughly a dozen people — a team lead, a content creator, offline members who visit businesses, online members who work by phone and WhatsApp) is assigned to the towns of one region. They help businesses and event organizers get listed on Abonten **with the owner's verified consent**, and earn a fixed commission per successful onboarding (GH₵ 5 at launch, set by rules an admin controls) plus, for the lead and creator, a monthly stipend.

Two things define the programme:

1. **The owner owns the listing from the first second.** A team member never creates a listing under their own account; the business owner proves consent by entering a one-time code sent to *their* phone (or opening a consent link on their own phone), and the listing is created under the owner's account.
2. **Nothing a team member does moves money.** Commissions are proposed by the lead's review, confirmed by an automatic eligibility check after a holding period, and paid by Abonten's finance team in weekly batches approved by two administrators.

## Where you work

The **web app** at abontenhub.com, signed in with your normal Abonten account — the same one you would use to buy a ticket. The mobile app has no field-team screens; use your phone's browser. Once your lead has invited your phone number and the programme is on, a **Field work** link appears in the header and side menu, leading to `/field`.

| Page | Who | What |
|---|---|---|
| `/field` | members | Today: campaign banner, today's assignments with Start / Complete, quick stats |
| `/field/assignments` | members | All your assignments |
| `/field/territory/[id]` | members | The town, your assignments there, "Add a business", prospects and contact logging |
| `/field/onboard/[id]` | members | The onboarding wizard |
| `/field/submissions`, `/field/submissions/[id]` | members | Your submitted onboardings and their status |
| `/field/earnings` | members | Your commissions, holding dates, payout number, payment history |
| `/field/content` | content creator | Briefs and your submissions |
| `/field/lead`, `/field/lead/*` | team lead | Coverage board, territories, assignments, team, announcements, review queue, content briefs, performance |
| `/consent/field/[token]` | business owners | The public consent page (online mode) |

## The handbook

| Page | Read it when |
|---|---|
| [roles-and-permissions.md](roles-and-permissions.md) | You want to know exactly what you can and cannot do |
| [working-a-day.md](working-a-day.md) | Assignments, GPS check-in, prospects, contact logging |
| [onboarding-places.md](onboarding-places.md) | Listing a business — the wizard step by step |
| [onboarding-organizers-and-events.md](onboarding-organizers-and-events.md) | Listing an event for an organizer |
| [claim-assistance.md](claim-assistance.md) | The business is already on Abonten |
| [content-creator.md](content-creator.md) | Briefs, submissions, self-reported figures |
| [evidence-photo-and-content-standards.md](evidence-photo-and-content-standards.md) | What a good listing, photo and evidence look like |
| [duplicates-and-corrections.md](duplicates-and-corrections.md) | Duplicate detection, "needs changes", withdrawing, fixing mistakes |
| [earnings-and-payouts.md](earnings-and-payouts.md) | How and when you are paid; the admin batch procedure |
| [team-lead-guide.md](team-lead-guide.md) | Running the team, reviewing work, announcements |
| [conduct-privacy-security.md](conduct-privacy-security.md) | Rules, prohibited behaviour, privacy and security duties, escalation |

## Getting set up

1. Have an Abonten account with a **verified phone number** (Settings › Security) — invitations bind to the phone.
2. Your lead invites your number; sign in with it and the membership binds automatically.
3. Allow **location** in your browser when asked (offline members must check in with GPS; the distance is shown to your lead, never used to refuse you).
4. Add your **mobile-money number** on `/field/earnings` so you are included in payout batches. You cannot change it while a payment to the old number is in flight.

## Support and escalation

Your **team lead** first (announcements and the review notes are the channel; in-person or WhatsApp as your team agrees). Programme questions and disputes about a decision → the field programme manager at Abonten (admin console). Safety incidents → stop, leave the situation, tell your lead, and follow [conduct-privacy-security.md](conduct-privacy-security.md).

Abonten's general support (for the business owners and organizers you onboard, not for programme questions) is staffed Monday to Friday, 09:00–17:00 Ghana time, and aims to reply within two working days — a goal, not a promise you may make on Abonten's behalf (decision O1, `../operations/support-operating-policy.md`). Never quote a faster turnaround to an owner.
