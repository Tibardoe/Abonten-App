---
title: Security documentation (internal)
purpose: Index of Abonten's security documentation and a one-page summary of the security model as implemented.
audience: Engineering, founder, security reviewers
scope: Application, database, payments, infrastructure, access control, secrets
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Security documentation (internal)

Public summary: `apps/web/src/content/legal/security.md` (served at `/legal/security`). Everything here is internal; the public page must never gain detail from these files without review.

| Document | Covers |
|---|---|
| [application-security.md](application-security.md) | Auth paths, sessions, per-call checks, validation, rate limits, uploads, CSRF/XSS posture, server-only boundaries |
| [database-security.md](database-security.md) | RLS map, service-role boundaries, SECURITY DEFINER inventory, append-only triggers, column guards, migrations discipline |
| [payment-security.md](payment-security.md) | Paystack flow, idempotency, webhook verification, money-path lockdown, known register items |
| [infrastructure-and-provider-responsibilities.md](infrastructure-and-provider-responsibilities.md) | Vercel, Supabase, Cloudinary, Sentry, Expo/FCM, Google, Resend, Hubtel, Paystack — who does what |
| [secrets-and-environment.md](secrets-and-environment.md) | Every environment variable (names only), where it lives, rotation |
| [access-control-model.md](access-control-model.md) | End-user roles, admin RBAC, step-up, field-programme boundaries, staff data access |

## The model in one page

1. **Identity:** Supabase Auth — Google OAuth, phone OTP (Hubtel, app-side state and attempt budgets), email OTP (Supabase-owned). No passwords for end users. Admins: Google + allowlist + active `admin_user` + roles + step-up.
2. **Every request re-checks identity:** web Server Actions call `auth.getUser()`; mobile routes use `getMobileAuth` (Bearer JWT → anon-key client so RLS sees `auth.uid()`); admin `requireAdmin()` re-resolves permissions per request.
3. **Row-level security on every public table** (175 tables, 197 policies as of 2026-09-12); owner/organizer scoping; public branches exclude hidden/removed content; money tables have **no client write path**; staff-only columns guarded by triggers.
4. **Privileged writes** happen only in `@abonten/services` on the service-role client **after** the service proved ownership and priced the order; money moves through `SECURITY DEFINER` RPCs granted to `service_role` only.
5. **Append-only ledgers and audit** (organizer ledger, platform fees, credit journal, field commissions, admin audit log).
6. **Abuse controls:** Postgres-backed rate limits (18 keys), OTP budgets, upload signatures per user, checkout limits, rewards risk scoring, duplicate detection.
7. **Monitoring:** Sentry (3 projects, PII off, no replay), self-hosted error groups, real provider probes every 2 minutes, financial reconciliation every 30 minutes, incidents.
8. **No certifications** (PCI DSS scope is Paystack's; Abonten never handles PANs).

## Known weaknesses and open items (do not publish)

- `SEC-004`: service-role JWT inline in the `cleanupExpiredEvents` cron command — move to Vault (roadmap).
- `SEC-003`: Supabase Auth leaked-password protection / hardening toggles off; Postgres minor patch pending (owner's call).
- `get_event_attendee_contacts` exposes attendee emails/phones to organizers (decision M4).
- Rate limiter fails **open** on infrastructure error (deliberate: availability over strictness).
- Suspension enforcement relies on session revocation + app-layer checks; no RLS policy keys off `status_id`.
- No MFA for end users; step-up is re-authentication, not a second factor.
- `google-services.json` tracked in git (Firebase client config; accepted, decision S4).
- Cloudinary media of deleted accounts is not purged.
- Regression tests for the self-authorizing SECURITY DEFINER functions are partial (SEC-001 audit complete, tests outstanding).

Incident procedures: `../incident-response/`.
