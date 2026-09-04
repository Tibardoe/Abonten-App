# Abonten — Remediation Roadmap (2026-09-04)

Derived from `01-limitations-register.md`. Phases follow the brief's priority
order; within a phase, items are ordered by leverage. Each phase ends at a
check-in with the repo owner before the next begins.

Guiding constraints (brief §48): stay a **modular monolith + Postgres RPCs +
pg_cron + one durable rate-limit table**. No new infrastructure unless a finding
genuinely forces it. Don't drop "unused" indexes without traffic data. Don't
weaken RLS. Don't fork business logic. Flag — don't invent — product rules.

---

## Phase 1 — Critical, safe, additive (THIS PASS)

| Item | Change | Risk |
|---|---|---|
| DOS-001 | `@abonten/core/checkoutLimits.ts` (`MAX_TICKETS_PER_TICKET_TYPE = 50`, `MAX_TICKETS_PER_ORDER = 100`); enforce in `validateCheckoutCore` before any reservation. Web + mobile both covered via the shared core. | Low — pure input guard; generous ceiling; exact numbers flagged as a product tweak. |
| SEC-001 | `REVOKE EXECUTE ON FUNCTION public.get_transaction_refundable_amount(uuid) FROM anon, authenticated`. Verified only service-role callers. | Low. |
| SEC-002 | `ALTER FUNCTION public.enforce_avatar_public_id_owner() SET search_path = ''` + schema-qualify body. | Low. |
| DB-PERF-001 | Migration: partial covering indexes for `*_moderated_by_fkey` (`WHERE moderated_by IS NOT NULL`) on `event`/`place`/`review`/`event_review`/`place_review`/`highlight`; plain btree for `subscription.plan_id`, `subscription.transaction_id`, `subscription_checkout.subscription_plan_name`, `user_info.status_id`, `wallet.user_id`, `story.user_id`, `media_audit.user_id`. `CREATE INDEX` (not `CONCURRENTLY`) inside the migration is acceptable at current table sizes; switch to `CONCURRENTLY` + out-of-migration if any table is large. | Low — additive; slight write cost. |

Verification: `turbo typecheck`, `next build` (web), `expo export` sanity (mobile
unaffected — no mobile code touched), `biome check` on touched files, live SQL
smoke (advisors re-run; `\df+` on the two functions; `pg_indexes` for the new
indexes).

**Deliverables also in this pass**: `00-system-map.md`, `01-limitations-register.md`,
this file — committed on the audit branch.

---

## Phase 2 — Financial & data integrity, reliability (NEXT — needs owner OK before starting)

The core move: **two atomic RPCs** replacing imperative multi-step sequences.

1. **`create_ticket_checkout(...)` RPC** — one transaction: single-statement
   inventory decrement (`… WHERE quantity IS NULL OR quantity >= n RETURNING`),
   promo claim, `ticket_checkout` insert. Kills INV-001, INV-002, and the
   partial-state half of DATA-001. `validateCheckoutCore` keeps the pre-checks
   (sales window, already-bought, promo lookup, price math) and calls the RPC
   for the mutation.
2. **`issue_tickets_for_checkout(...)` RPC** — one transaction: lock checkout
   rows, verify ownership + `pending` + not-expired, insert `ticket` +
   `attendance`, flip checkout → `paid`, call `record_organizer_earning`.
   **Idempotent**: checkout already `paid` → return existing ticket ids, status
   ok. Kills FIN-001, FIN-002, and the retry black hole. `generateTicket`
   shrinks to: resolve identity → generate QR + upload to Cloudinary → call the
   RPC → `revalidatePath`/`after`/notification.
3. **`finalizePaystackPayment` fixes** (FIN-003, REL-001): transient/thrown
   verify error → revert group to `pending`, not `failed`; only `failed` on an
   explicit Paystack terminal status. Add `processing` + `updated_at < now() -
   15 min` to the CAS re-entry set. Treat "already issued" from the idempotent
   RPC as success.
4. **`recover_stale_payment_attempts()` pg_cron** (`*/5`) — `processing` older
   than 15 min → `fulfillment_failed` (transaction exists) or `pending` (not),
   so existing retry paths resume.
5. **Payment-aware checkout expiry** (DATA-001): `expire_stale_ticket_checkouts`
   excludes checkouts with a non-terminal `payment_attempt`; creating a payment
   attempt bumps the checkout `expires_at`.
6. **Constraints** (DATA-002): `ticket_type.price >= 0`, `ticket_type.quantity
   >= 0` (NULL ok), `promo_code.discount_percentage BETWEEN 0 AND 100`,
   `ticket.ticket_code` UNIQUE — each `NOT VALID` → dup/violation scan →
   `VALIDATE`.
7. **DATA-003/DATA-004**: drop or de-partition the unused empty-partition
   tables; add a `review`/`event_share` partition-maintenance pg_cron job +
   default partitions.

Verification: full `turbo typecheck` + web/admin `next build` + `expo export`;
**concurrency smoke** (parallel `create_ticket_checkout` for the last unit →
exactly one succeeds); **idempotency smoke** (`issue_tickets_for_checkout` twice
→ one set of tickets, one earning row); **retry smoke** (`fulfillment_failed`
re-enter → success); advisors clean.

---

## Phase 3 — Scalability & abuse resistance

- **API-001 / OBS-001**: durable rate limiter — `rate_limit_bucket` table +
  `consume_rate_limit(key, limit, window)` `SECURITY DEFINER` RPC + a
  `@abonten/services/security/rateLimit` helper. Apply to reports, reviews,
  claims, checkout-validate, promo-validate, cloudinary-signature, broadcast,
  geocode. Enable Vercel platform protection.
- **DATA-004**: `review` (and any rolling-range table) monthly partition
  pre-creation job + `*_default` partitions.
- **Pagination audit**: confirm every list RPC / `.select()` in admin tables,
  organizer dashboards, Explore, Search, notifications has a bounded page size
  and keyset cursor (spot-checks show `pagination.ts` keyset is used widely —
  verify no unbounded `.select()` on `ticket`, `attendance`, `notification`,
  `app_error_event`).
- **Search**: `event_search` matview refresh every 15 min is fine to ~100k
  events; note the ceiling and the eventual move to incremental refresh /
  Postgres FTS trigger.

## Phase 4 — Architecture consolidation

- **ARCH-001**: land the Phase-2 RPC extraction as the structural fix — DB
  mutations in `@abonten/services` + Postgres, Next primitives only in the
  `apps/web` wrappers. Same for `issueRefund`.
- Sweep remaining `apps/web/src/utils/*` and `apps/web/src/actions/*` for any
  other file doing multi-table writes that should be a service core + RPC.
- Consolidate status/en/ sentinel values (`status: 300` sentinels → real
  discriminated unions or documented codes).

## Phase 5 — Observability & operations

- **FIN-002 safety net**: daily reconciliation queries surfaced in Admin ›
  Monitoring — `paid checkout with no earning entry`, `succeeded payment_attempt
  with no ticket`, `ticket_type.quantity < 0`, `processing payment_attempt >
  1h`. Each writes an `app_error_event` / `incident` if non-empty.
- Alerting: wire at least the money-path error groups to a real channel
  (Sentry alert rule or a webhook) — "3 AM" test from brief §24.
- **LOW-009**: explicit `USING (false)` policies + comments on the service-role
  only tables to quiet advisor `0008` and document intent.
- **SEC-004**: move the cron service-role JWT into Vault; rotate the key.

## Phase 6 — Maintainability, types, tests, deps

- **TEST-001**: Vitest in `@abonten/core` + `@abonten/services`; seed with
  pricing/promo pure tests, then the concurrency/idempotency/authz integration
  tests against local Supabase. `supabase gen types` in CI.
- **TYPE-001**: `SupabaseClient<Database>` in `@abonten/services`; remove `as
  unknown as` in payment/checkout/ticket modules.
- **SEC-001** full: line-by-line audit of the 12 self-authorizing
  `SECURITY DEFINER` functions + an authz regression suite.
- **ARCH-002 / LOW-005**: split PROJECT.md → evergreen `ARCHITECTURE.md` +
  history; rewrite README.
- **DATA-005**: drop `log_user_changes()`/`audit_log` (or build it deliberately).
- **Dependency pass**: `npm audit`, Expo `npx expo-doctor`, flag deprecated /
  single-use packages. No mass upgrades.

## Phase 7 — UX limitations rooted in architecture

- **LOW-001 / LOW-002**: fix or delete the broken `user-profile` route + the
  phantom `useUserProfile` fields.
- Stale-data sweep: confirm every mutation (ticket buy, cancel, refund, review,
  claim, promotion) invalidates the right TanStack Query keys on web **and**
  mobile and `revalidatePath`s the right routes — the Phase-2 idempotent issue
  path makes the event-card "spots left" chain trustworthy end to end; verify
  the card actually reflects it within one refresh cycle on both platforms.

---

## Items explicitly deferred to the owner (not code changes)

| ID | Why deferred | Risk if left | Next action |
|---|---|---|---|
| SEC-004 | Needs a coordinated service-role key rotation | Med — key exposure via schema/backup | Schedule rotation; move token to Vault |
| SEC-003 | Dashboard toggle + Postgres upgrade window | Low-Med | Enable leaked-password protection; book minor-version upgrade |
| BIZ-001 | Product decision on "one ticket per event" semantics | Med — real users blocked / confused | Confirm intended rule; then scope the guard to `(event, occurrence)` + allow post-cancellation re-purchase |
| MOB-001 | Product call on server-side push volume/UX | Med — reminders silently lost | Decide if a server-side reminder sender is wanted |
| Unused indexes (DB-PERF-001 part 2) | Needs ~30 days production traffic to judge | Low — extra write cost | Re-run performance advisor, drop only truly-cold indexes |
