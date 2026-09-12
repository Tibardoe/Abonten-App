# Field Ops: the regional promotion & field operations programme

_Phases 0-5 shipped 2026-09-11/12 (branches `feat/field-ops-p0` … `-p4`).
The owner approved the full plan and the four gating decisions: team leads
and workers use the web app (`/field`, Phase 1); business ownership is
proven by an OTP the owner enters (Phase 2); a commission needs the team
lead's review plus a holding period re-checked by a sweep (Phase 3); payouts
are weekly manual MoMo batches approved by a second admin (Phase 4). Events
and claim assistance joined in Phase 5. The full architecture is in the
approved plan; this file is the reference and runbook for what is live._

## What it is

A time-boxed, region-by-region programme: a team (team lead, content creator,
offline field members, online members) is assigned to the towns of one
region, onboards businesses and organizers onto Abonten, and earns a
configurable commission per successful onboarding. The onboarded place or
event is an ordinary Abonten place/event owned by the business owner from
the start; Field Ops only records *how it was acquired*.

## Naming and boundaries

- Everything is prefixed **`fieldops`**: tables and functions `fieldops_*`,
  permissions `fieldops.*`, admin route `/field-ops`, code folders
  `fieldOps/`, env `FIELD_OPS_KILL_SWITCH`. "promotion", "campaign" and
  "commission" already mean other things here (paid featuring,
  `reward_campaign`, `event_promoter_commission`).
- Team leads and workers are **ordinary Abonten accounts** with a
  `fieldops_team_member` row. They are never `admin_user` rows (that would
  flip `user_info.is_admin` and grant the staff bypasses in
  `guard_staff_managed_columns` / `place_admin_update` /
  `approve_place_claim`). `addTeamMemberCore` refuses admins.
- Commissions are their own ledger (`fieldops_commission`): never organizer
  money (`organizer_ledger_entry`), never user credit (`credit_*`).
- No core table gains a column. Field Ops tables point at `place`, `event`
  and `auth.users` with FKs; member/owner user ids are stored without an FK
  so history outlives a deleted account.

## Model (Phase 0)

| Table | Role |
|---|---|
| `fieldops_program_setting` | One row: `program_enabled` (ships **false**), verification defaults (holding days, spot-check share, GPS tolerance, daily cap), duplicate-detection thresholds, housekeeping, push switch. `worker_ui_enabled` / `commission_generation_enabled` / `payouts_enabled` exist but are refused by the service until their phases ship. |
| `fieldops_region` | Where a campaign runs (e.g. Ashanti). Optional centre; `centre_lat/lng` are generated columns for PostgREST reads. |
| `fieldops_territory` | A town or area: `centre` + `radius_m` (default model) and an optional `boundary` polygon that wins when set (`boundary_geojson` generated). `fieldops_territory_contains(territory, lat, lng)` is the single containment rule. |
| `fieldops_campaign` | One region run: status, currency, dates, budget cap, holding-period override. One live campaign per region (partial unique index). |
| `fieldops_team`, `fieldops_team_member` | One team per campaign in v1. Members have a role (`team_lead`, `content_creator`, `offline_member`, `online_member`) and status (`invited`, `active`, `suspended`, `left`); one membership per person per campaign; one active lead per team. Phone invitations bind when the person with that verified phone appears (`fieldops_bind_invited_memberships`). Payout columns are column-level revoked from clients. |
| `fieldops_commission_rule` | Versioned, immutable (only `is_active` may change; no deletes). Programme defaults (`campaign_id null`) or a per-campaign override. Seeded at GH₵ 5 for place/event onboarding, GH₵ 2 for claim assistance, placeholders for content and stipends; **all inactive**. |

## Model (Phase 1)

| Table | Role |
|---|---|
| `fieldops_assignment` | One member working one territory over a date range (a day when `starts_on = ends_on`). `assigned → started → completed \| cancelled`; reassignment = cancel + new row; one open assignment per member per territory. Offline members check in with GPS on start (`start_location`, `start_accuracy_m`, `start_distance_m` to the territory centre — informational, shown to the lead). `fieldops_assignment_check` keeps member/team/campaign/territory/role/mode consistent. |
| `fieldops_prospect` | A business or organizer a member identified in a territory: `identified → contacted → interested \| declined \| converted`, a `contact_attempts` log, optional `matched_place_id`. Needs an open assignment in that territory. |

Both: SELECT for the member's own rows or the lead's team; no client writes.

## Model (Phase 2)

| Table | Role |
|---|---|
| `fieldops_onboarding` | One business onboarding from wizard start to review: who, where, the owner (OTP-verified `owner_user_id`), the real `place_id` (created through `create_place` with the onboarding's `client_request_id`), the member's position at submission, the duplicate-search snapshot, `draft → submitted → verified \| needs_changes \| rejected` (+ `withdrawn`; `verified → succeeded \| flagged` belongs to the Phase 3 sweep). Owner ≠ member and reviewer ≠ member are CHECKs; a place is onboarded once, an owner once per campaign. |
| `fieldops_onboarding_evidence` | Storefront / interior / consent photos in the private `fieldops-evidence` bucket, with GPS + accuracy. Written and read only through service-issued signed URLs. |
| `fieldops_onboarding_event` | Append-only timeline (trigger-enforced). |

`fieldops_transition_onboarding` is the only way a status changes;
`fieldops_find_similar_places` (pg_trgm + radius, or same phone) is the
duplicate search; `fieldops_phone_belongs_to_member` backs the "owner is
never a team member" rule.

## Model (Phase 3)

| Table | Role |
|---|---|
| `fieldops_commission` | One earned commission in minor units, or a negative reversal offset. `pending → approved → in_payout → paid`, plus `rejected` and `reversed`. The amount, currency and `rule_id`/`rule_version` are frozen at verification, so a later rate change never rewrites history. `idempotency_key` (`onboarding:<id>`, `reverse:<id>`) makes a repeated posting a no-op. A trigger allows only the status and its stamps to change and only along that lifecycle; there is **no DELETE grant at all**, not even for `service_role`. |
| `fieldops_commission_event` | Append-only status trail (trigger-enforced), with the actor and reason behind every move. |
| `fieldops_job_run` | One row per sweep / housekeeping run: what it processed, how it ended, the last error. `fieldops_health()` reads the latest row per job. |

Clients read their own rows (a lead reads the team's) and write nothing.

## The eligibility sweep

`fieldops_run_eligibility_sweep(limit)` runs every 15 minutes
(`fieldops-eligibility-sweep`) and is a no-op unless both `program_enabled`
and `commission_generation_enabled` are on. For each `verified` onboarding
whose `holding_until` has passed, in a campaign that is active, winding down
or completed, it calls `fieldops_evaluate_onboarding` and then:

| Outcome | Onboarding | Commission |
|---|---|---|
| Every check passes | `succeeded` | `approved` (approver `null` = the sweep) |
| A **hard** check fails — the listing is gone, unpublished, moderated away, or no longer owned by the verified owner | `rejected` with the failed keys in `flags` | `rejected` |
| A **soft** check fails (photos, description, contact, opening hours, territory, on-site distance, an older duplicate) | `flagged` | left `pending` |
| Sampled by `spot_check_bps` although everything passed | `flagged` with `spot_check` | left `pending` |
| The campaign's `budget_cap_minor` would be exceeded | stays `verified`, flag `budget_exhausted` | left `pending` |
| Its rule pays on something later phases own (`event_started`, `claim_approved`) | stays `verified`, flag `awaiting_release_policy` | left `pending` |

A per-row exception handler keeps one bad row from stopping the run; the
failure count and message land in `fieldops_job_run` and then in
`fieldops_health()`. `@abonten/core/fieldOps/eligibility` is the TypeScript
copy of the same checks and drives the review checklist — the SQL is the
authority, because only it moves money.

Admins resolve a flag with `fieldops_decide_flag` (approve → the commission
becomes payable with the admin recorded as approver; reject → both are
rejected; the admin who verified a row may not decide its flag). A
commission is taken back with `fieldops_reverse_commission`: the original
row is never edited, and one that was already **paid** gains a negative
offset beside it so the money that actually left stays on record.

`fieldops_run_housekeeping` (daily, 02:25) closes reviews left open past a
completed campaign's grace period and counts evidence due for purging.

## Model (Phase 4)

| Table | Role |
|---|---|
| `fieldops_payout_batch` | One payout run for one campaign: `draft → approved → paid`, or `cancelled`. A DB CHECK refuses `approved_by = created_by`, so a second admin always signs off. Only one batch per campaign may be open at a time, so two admins can never split the same commissions. Totals are frozen once it leaves draft. |
| `fieldops_payout_item` | One member's share of one batch, with the destination as it stood when the batch was built (the number is **masked** in the snapshot; the full value lives on the team-member row). `pending → paid \| failed`. |

`fieldops_build_payout_batch` sums every `approved` commission per member
and moves them to `in_payout`; a member with no mobile-money number on file
is left out, and their money simply waits for the next batch.
`fieldops_approve_payout_batch` is the second signature.
`fieldops_mark_payout_item` records one transfer: **paid** (with a
reference) pays its commissions and notifies the member, **failed** (with a
reason) puts them straight back to `approved` so nothing is stranded. The
batch closes itself once nothing is pending.
`fieldops_cancel_payout_batch` unwinds a batch that has paid nobody yet.

A member sets their own destination on `/field/earnings`; it is read back
masked, and it cannot be changed while a payment to the old number is
already in flight. The finance CSV (`fieldops.commissions.pay` **plus**
`users.view_pii`, audited) is the one place a full number leaves the
console, and it is built in the browser from the action's reply rather than
served as a URL.

`fieldops_payout_reconciliation` and the Phase 4 keys in `fieldops_health()`
keep the two sides honest: what the ledger says was paid must equal what the
payout items say was sent, nothing may sit in `in_payout` without a live
batch behind it, and no item may be marked paid without a reference. A
commission reversed **after** it was paid keeps its `paid` row — the money
really did leave — and the negative offset beside it is what nets the member
down; reversing something that had not been sent yet simply makes it
`reversed`.

## Model (Phase 5): events and claim assistance

Both are the same onboarding record with a different activity and a
different moment of payment.

| Activity | What the member does | When it pays |
|---|---|---|
| `event_onboarding_*` | Verifies the **organiser** by OTP, then lists the event through the ordinary `create_event` path so the organiser owns it from the start. | `release_policy: event_started` — only once `starts_at` has passed and the event was neither cancelled nor moderated away. A flyer that never happens pays nothing. |
| `existing_place_claim_assist` | The business is already listed. Instead of creating a duplicate, the member verifies the **real owner** by OTP and files a `place_claim_request` with `claimant_id = owner_user_id`. | `release_policy: claim_approved` — only once an admin approves that claim through the existing Claims module. Worth less than a full onboarding, because less was done. |

The sweep now honours all three gates. A row that is not due yet is left
alone and looked at again next run — no flag, no noise — and counted as
`waiting` in the job row and `waiting_on_release` in health. `due_not_swept`
only counts rows whose gate has actually opened, so a six-week-away event is
never mistaken for a stuck one.

What the evaluator checks differs by activity: a claim assist has no photos,
opening hours or pin of the team's own, so those checks are skipped — what
matters is that the claim was filed for the verified owner and approved. An
event is checked for being published, unmoderated, still the organiser's,
created from this onboarding, and (if the rule says so) listed a real number
of days before it runs.

`fieldops_flag_on_claim` flags any onboarding whose listing someone **else**
later tries to claim: an ownership dispute is always worth a human look.

Guards that are worth stating plainly: the member can never be the claimant,
can never claim their own listing, and cannot file a claim the owner already
holds; two members cannot file the same claim (the existing partial unique
on `place_claim_request` makes the second one a clean 409); and the flyer,
like the place photos, must come from the member's own signed upload folder.

## Onboarding flow

1. Member opens a territory they are assigned to → **Onboard a business**
   (or from a logged prospect). A draft opens (idempotent per tap).
2. Business name + pin → duplicate check. A likely match now offers
   **claim assistance** instead: pick the existing listing and help its
   owner claim it, which is paid in its own right.
3. Owner's name + phone → a code goes to the OWNER's phone (never the
   member's or any teammate's). The owner types it on the member's phone,
   or — online mode — opens the consent link `/consent/field/<token>` on
   their own phone. Their Abonten account is created/found right there and
   will own the listing.
4. Details (category, description, address, contacts, opening hours) and
   photos (cover + gallery to Cloudinary; storefront + interior evidence to
   the private bucket with GPS — required for in-person work).
5. Submit: the service re-checks duplicates, creates the place under the
   owner, records distance / territory containment, and hands it to the
   team lead. The lead verifies (starts the holding period, snapshots the
   rule, records a **pending** commission), returns it with a note (one
   resubmission), or rejects. Admins can decide in the lead's place from
   Admin › Field Ops › Onboardings.
6. After the holding period the sweep re-runs every objective check and
   either approves the commission (onboarding `succeeded`), flags it for an
   admin, or rejects both. Nothing a worker or lead does moves money.

## Lifecycle

```
draft ─activate─► active ─pause─► paused ─resume─► active
                    │                 │
                    └─wind_down─► winding_down ─complete─► completed ─archive─► archived
draft ─archive─► archived · paused ─wind_down / complete─► …
```

`fieldops_set_campaign_status` is the authority (activation needs an active
territory in the region and an active team lead); the same table lives in
`@abonten/core/fieldOps/campaignLifecycle` for the UI and unit tests.

## Access

- **Admin console**: `fieldops.view` (read), `fieldops.manage` (campaigns,
  regions, territories, teams, settings — step-up), `fieldops.rules`
  (publish/activate rule versions — step-up), `fieldops.verify`,
  `fieldops.commissions.approve` (step-up), `fieldops.commissions.pay`
  (step-up). Role `field_ops_manager` holds all six plus read access to
  users, places, events, organizers and the audit log; `operations` gets
  view/manage/verify; `finance_admin` gets view + approve + pay; `analyst`
  gets view. Every mutation is audited (`fieldops.*` actions in
  `admin_audit_log`).
- **Clients** (members, leads): SELECT only, scoped by
  `fieldops_is_member(campaign)` / `fieldops_is_lead_of_team(team)`; no
  INSERT/UPDATE/DELETE grants on any `fieldops_` table. Member/lead services
  (`packages/services/src/fieldOps/{member,lead}/`) resolve
  `resolveFieldOpsContext(serviceClient, userId)`, assert the role with
  `requireMembership`, gate on the campaign status and write on the service
  role. Web: `apps/web/src/actions/fieldOps/*` (18 actions); mobile:
  `/api/mobile/field-ops/**` (15 routes) → `api.fieldOps.*`.
- **What a team lead may do** (`/field/lead`): add/edit territories in
  their campaign's region and mark them completed, plan and cancel
  assignments (draft/active campaign), invite field members by phone and
  suspend / reactivate / remove them (never another lead, never
  themselves), send announcements. They never see payout details, other
  campaigns, or anything outside `/field`.
- **What a member may do** (`/field`): see their own assignments, start
  today's (offline = GPS check-in; only while the campaign is active) and
  complete it, log and update their own prospects in a territory they hold
  an open assignment for, and read their own earnings (`/field/earnings`).
- A version of a rule that would pay **more** than the live one must be
  activated by a different admin from the one who published it. Nothing can
  be made live until the phase that pays that activity ships
  (`SHIPPED_ACTIVITIES` in `rulesAdminCore.ts`).

## Switching it off

- Operationally: Admin › Field Ops › Settings › "Programme switched on"
  (step-up, audited). Off = `/field` is a 404 and the "Field work" link
  disappears, no submissions, no commissions; the admin module stays
  readable. "Worker web area switched on" hides `/field` alone while the
  rest keeps running.
- Emergency: `FIELD_OPS_KILL_SWITCH=true` on the web and admin deployments
  (`isFieldOpsKillSwitchOn()`), mirroring `REWARDS_KILL_SWITCH`.
- Per region: pause / wind down / complete / archive the campaign.
- Removal: everything is found by grepping `fieldops|fieldOps|field-ops`;
  the plan's §20 lists the exact objects and folders.

## Runbook

- **Set up a region:** Admin › Field Ops › Regions › New region (optionally
  "Find on the map" — needs `GOOGLE_MAPS_API_KEY` or
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` on the admin deployment; otherwise type
  coordinates) → open it → add towns (centre + radius; paste a GeoJSON
  polygon to override the circle).
- **Start a campaign:** Campaigns › New campaign (draft) → open it → add the
  team lead (by phone invitation or an existing user id; members need a
  verified phone unless the setting is off) → Activate.
- **Change what an activity pays:** Rules › New version… (published switched
  off) → Make live (another admin if it pays more). Only activities whose
  engine exists can be made live (`SHIPPED_ACTIVITIES` in
  `rulesAdminCore.ts`: place onboarding today; events and claim assistance
  with Phase 5, content with Phase 6). A campaign-specific version is
  published from the campaign page in a later phase; the service already
  supports it.
- **Decide a flag:** Admin › Field Ops › Review queue lists what the sweep
  would not pay on its own, why, and the amount waiting. Approve or reject
  with a note; both are audited. Commissions and their history are under
  Admin › Field Ops › Commissions, where one can also be reversed
  (`fieldops.commissions.approve` + step-up).
- **Switch commission generation off without stopping the field work:**
  Settings › "Commissions being generated". The sweep becomes a no-op;
  submissions and reviews carry on.
- **Pay the team (weekly):** Admin › Field Ops › Payouts → pick the
  campaign → check the preview (it lists anyone left out for want of a
  mobile-money number) → **Build batch** → a **different** admin opens it
  and **Approve for payment** → export the CSV or work down the list,
  sending each transfer from the mobile-money account and recording its
  reference → a failed transfer is marked failed with a reason and that
  member's money returns to the pool for next week. The batch closes
  itself when nothing is pending. Cancel only unwinds a batch that has
  paid nobody.
- **Switch payouts off:** Settings › "Payouts enabled". Batches cannot be
  built; everything already approved just waits.
- **Run a team day (lead):** `/field/lead/territories` → add the towns
  ("Find on the map" or type coordinates) → `/field/lead/team` → invite
  members by phone (they join when they sign in with that number) →
  `/field/lead/assignments` → pick the day, assign member × territory →
  the member gets a notification; `/field/lead` shows coverage and who has
  checked in. Reassign = cancel (with a reason the member sees) + assign.
- **Work a day (member):** `/field` → Start (offline members allow
  location) → open the territory → "Add a business" for everyone you
  speak to, "Log a contact" as it progresses → Mark completed.
- **Tests:** `packages/core/src/fieldOps/*.test.ts` (lifecycle table,
  territory geometry), `packages/services/src/__integration__/fieldops-rbac`
  (client writes refused, scoped reads, self-only helpers, admin permission
  checks, immutable rules), `fieldops-lifecycle` (state machine,
  activation guards, one live campaign per region, territory containment,
  phone invitation binding), `fieldops-assignments` (lead-only
  planning, one open assignment per member/territory, RLS self-or-lead,
  GPS start / complete, paused campaign, prospects + contact log, coverage
  board, lead team management, announcements) and `fieldops-onboarding`
  (start gate, owner OTP rules with a faked Hubtel, place created under the
  owner, duplicates, RLS + append-only timeline, review round-trip, admin
  decision). `packages/core/src/fieldOps/{duplicateScore,eligibility}.test.ts`
  cover the pure scoring and checklist logic, and `fieldops-sweep` covers
  the commission ledger end to end (pending at verification, every sweep
  branch, budget cap, frozen rate across a version change, double-run
  idempotency, immutability and reversal, RLS, health and reconciliation),
  `fieldops-events-claims` covers the two Phase 5 activities (the event
  created under the organiser, the flyer-folder and past-date guards,
  waiting / paying / rejecting on the event gate, a real claim filed for the
  owner, the self-claim and already-owned refusals, the duplicate-claim
  refusal, paying on an approved claim through the real `approve_place_claim`
  path, rejecting on a rejected one, and the dispute flag), and
  `fieldops-payouts` covers the money leaving (destination masking and
  the in-flight lock, grouping and the missing-number case, the
  second-admin rule, paid/failed/cancel, the member's history, the CSV
  gate, and the books balancing after a post-payment reversal).
