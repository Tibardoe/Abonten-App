---
title: Access control model
purpose: One place that states who can access what — end users by ownership, staff by RBAC, field teams by membership — and the boundaries between them.
audience: Engineering, security and compliance reviewers, founder
scope: Application and database access control
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Access control model

Detailed matrices: `../architecture/roles-and-permissions.md` (end users + RLS), `../admin/settings-and-rbac.md` (staff), `../field-operations/roles-and-permissions.md` (field teams).

## Principals

| Principal | How identified | Scope of access |
|---|---|---|
| Anonymous visitor | no session (`anon` key) | Published, non-hidden events/places/reviews/highlights/public profiles; legal and help pages; invite pages |
| Signed-in user | Supabase session (`authenticated`) | Own rows (RLS) + public; own tickets, checkouts, transactions (read), favourites, bookings, messages as participant, notifications, credit account/lots |
| Organizer (derived: `event.organizer_id`) | same session | Own events, ticket types, attendee list + contacts, insights, finance ledger, payouts |
| Place owner (derived: `place.owner_id`) | same | Own places, photos, hours, services, bookings, review replies, insights |
| Field team member / lead (`fieldops_team_member`) | same session + membership | Read own campaign/territory data; lead reads team; writes only through services |
| Staff (`admin_user` active + roles) | Google + allowlist + roles + step-up | Console modules per permission; RLS bypass via service role **inside audited service functions only** |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` on servers and cron | Bypasses RLS; used only after identity/ownership proven; ledger tables still SELECT-only |
| Business owner giving field consent | OTP to their phone | Their new account and listing |

## Boundaries enforced by code or database

- **Clients cannot write money.** No INSERT/UPDATE/DELETE on transaction, payment_attempt, checkouts, promotions, promo usage, subscriptions, credit ledger, field tables, notification preferences.
- **Users cannot promote themselves.** `is_admin`, `status_id`, `place.verified`, `place.claimed`, `moderation_*` are trigger-guarded.
- **Admins cannot be field members and vice versa** (`addTeamMemberCore` refuses; `is_admin` sync).
- **Owners cannot be the team member who onboards them** (DB CHECKs + phone check).
- **Staff read users' private conversations only when reported or support** (console exposure; RLS grants staff read).
- **PII gate:** emails, phones, payout account numbers behind `users.view_pii`.
- **Separation of duties:** payout batch approver ≠ builder; rule activator ≠ publisher (when costlier); flag decider ≠ verifier; credit adjustment ≥ GH₵ 500 second admin.
- **Suspension** revokes sessions globally and is enforced at the web proxy and the mobile API gate.

## Provisioning and de-provisioning

| Event | Steps |
|---|---|
| New staff member | Create Abonten account (Google) → add email to `ADMIN_EMAIL_ALLOWLIST` (redeploy admin) → Admin Settings › add admin + roles (step-up) → record in access register |
| Staff leaves | Admin Settings › disable (immediate) → remove from allowlist → revoke provider dashboard access (Vercel, Supabase, Paystack…) → rotate any shared secret they knew |
| Field member joins/leaves | Lead invites by phone / removes (open assignments cancel; pending commissions in holding are not paid if they leave) |
| Quarterly review | Active admins vs need; allowlist; provider account list; `admin.*` audit entries |

## Logging of access

Admin mutations → `admin_audit_log`; PII views are not individually logged except the field finance CSV export (`fieldops.payout.export`) — improvement item: log `users.view_pii` reads. Database access by engineers via Supabase MCP/dashboard is logged by Supabase, not by Abonten.
