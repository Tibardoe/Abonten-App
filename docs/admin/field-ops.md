---
title: Admin › Field Ops
purpose: The console side of the field programme — campaigns, regions, teams, onboardings, review queue, commissions, payouts, content, rules, settings.
audience: field_ops_manager, operations, finance_admin (approve/pay), super_admin
scope: /field-ops/*
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Field Ops

> **Production state:** programme **switched off** (`fieldops_program_setting.program_enabled = false`); seeded rules inactive; no campaign. Nothing here affects users until an admin switches it on. Team handbook: `../field-operations/`. Reference: `../architecture/field-ops.md`.

Source: `packages/services/src/admin/fieldOps/*`.

| Screen | Shows | Actions (permission) |
|---|---|---|
| **Overview** | Campaign counts, waiting on lead / on admin / in holding / ready to pay, health | — |
| **Regions › [id]** | Regions and their territories (centre + radius or polygon) | create/edit region and territories (`fieldops.manage`, step-up) — "Find on the map" needs a Google Maps key on the admin deployment |
| **Campaigns › [id]** | Status, team and members, rule overrides, **Figures** (analytics + CSV) | create; add team lead / members (by phone or user id); activate / pause / resume / wind down / complete / archive (`fieldops.manage`, step-up) |
| **Onboardings › [id]** | Every onboarding with status/campaign filters; detail: evidence (signed URLs), timeline, similar listings, eligibility checklist | **Decide in the lead's place** (`fieldops.verify`) — recorded as an override |
| **Review queue** | Flags the sweep would not pay on its own, each explained | **Approve / Reject** (`fieldops.commissions.approve`, step-up); the admin who verified a row cannot decide its flag |
| **Commissions › [id]** | Per-status totals, full history | **Reverse** (`fieldops.commissions.approve`, step-up) — a paid commission gains a negative offset, never an edit |
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
