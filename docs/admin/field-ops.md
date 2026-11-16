---
title: Admin › Field Ops
purpose: The console side of the field programme — campaigns, regions, teams, onboardings, review queue, commissions, payouts, content, rules, settings.
audience: field_ops_manager, operations, finance_admin (approve/pay), super_admin
scope: /field-ops/*
status: Approved
version: 1.1
lastReviewed: 2026-11-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Field Ops

> **Production state (2026-11-16):** campaign **"Accra online, Osu first"** (region Greater Accra; territories Osu, 1.8 km, and Accra, 25 km) is **active** for online onboarding by staff: team lead `pilotexplorer_qa`, online member `pilotorganizer_qa`, both assigned to both territories until 30 June 2027. **Commissions being generated: off. Payouts enabled: off.** No live rule pays online place onboarding (the only live rule is the GH₵5 offline *event* onboarding). "Members need a verified phone" is off because both members are staff accounts without a phone: switch it back on before anyone outside the company joins. The programme switch is **on** (since 2026-11-16 23:00 UTC, after the Monitoring `fieldops` check learned to ignore the sweep while commissions are off; before that it read the unrun sweep as an outage). The old "Ashanti pilot" campaign is a draft from September 2026. Team handbook: `../field-operations/`. Reference: `../architecture/field-ops.md`.

Source: `packages/services/src/admin/fieldOps/*`.

| Screen | Shows | Actions (permission) |
|---|---|---|
| **Overview** | Live campaigns, active members, regions, territories (right now); waiting on a team lead, waiting on an admin, successful onboardings; commission money — in holding, ready to pay, in a payout batch (right now) and paid (all time) — summed in SQL per currency by `admin_fieldops_commission_totals()`, other currencies listed apart and never added in. Every tile carries its definition behind the ⓘ (`docs/admin/metrics.md`, "Field Ops") | — |
| **Regions › [id]** | Regions and their territories (centre + radius or polygon) | create/edit region and territories (`fieldops.manage`, step-up) — "Find on the map" needs a Google Maps key on the admin deployment |
| **Campaigns › [id]** | Status, team and members, rule overrides, **Figures** (territory coverage, successful onboardings, commissions committed, cost per successful onboarding; per-day charts over the last 30 days with a screen-reader table; the team and the towns; CSV). "Succeeded" is the one word used everywhere for an onboarding that passed every check | create; add team lead / members (by phone or user id); activate / pause / resume / wind down / complete / archive (`fieldops.manage`, step-up) |
| **Onboardings › [id]** | Every onboarding with status/campaign filters; detail: evidence (signed URLs), timeline, similar listings, eligibility checklist | **Decide in the lead's place** (`fieldops.verify`) — recorded as an override |
| **Review queue** | Flags the sweep would not pay on its own, each explained | **Approve / Reject** (`fieldops.commissions.approve`, step-up); the admin who verified a row cannot decide its flag |
| **Commissions › [id]** | Per-status totals (exact, per currency, for all campaigns or the chosen one), the list with status words from the shared registry, full history | **Reverse** (`fieldops.commissions.approve`, step-up) — a paid commission gains a negative offset, never an edit |
| **Payouts › [id]** | Next-batch preview (who is left out and why), batches, items | **Build batch** → **Approve** (a *different* admin) → mark items paid (reference) / failed (reason) → **Cancel** (only if nobody paid); **finance CSV** (`fieldops.commissions.pay` + `users.view_pii`, audited) |
| **Content** | Briefs and submissions across campaigns | decide in the lead's place; **Run monthly stipends** (`fieldops.commissions.approve`, step-up) |
| **Rules** | Versioned commission rules per activity | publish / make live (`fieldops.rules`, step-up) — a costlier version needs a different admin to activate |
| **Settings** | Programme switch, worker UI switch, commission generation, payouts enabled, verification defaults, duplicate thresholds, daily cap, spot-check rate, retention days, push switch | edit (`fieldops.manage`, step-up) |

## Weekly payout procedure (finance)

See `../field-operations/earnings-and-payouts.md` (admin section). Key controls: second-admin approval is a database constraint; a failed item returns the money to `approved` automatically; the batch closes itself.

## Switching off

Settings › "Programme switched on" (off = `/field` becomes 404, no submissions, no commissions; the console stays readable) · "Commissions being generated" (field work continues, sweep no-op) · "Payouts enabled" · pause/wind down a campaign · emergency `FIELD_OPS_KILL_SWITCH=true` on web and admin deployments.

## Boundaries the code enforces

Team members are never admins (`addTeamMemberCore` refuses); an owner is never a team member (DB CHECK + `fieldops_phone_belongs_to_member`); nothing a worker does moves money; the commission ledger has no DELETE grant at all.
