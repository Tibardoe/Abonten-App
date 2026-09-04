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

## Phase 2 — Financial & data integrity, reliability

**Shipped** (this pass, on `audit/limitations-2026-09`):

1. **`issue_tickets_for_checkout(...)` RPC** (migration `20260907093200`) —
   one transaction: lock checkout rows, idempotency check (already `paid` →
   return existing ticket ids, `already_issued=true`, no mutation — **live
   smoke-tested against a real paid checkout**), authorize (paid: matching
   `payment_attempt` + successful `transaction` owned by the caller; free:
   every row priced at 0), insert `ticket` + `attendance`, flip checkout →
   `paid`, call `record_organizer_earning` — all atomic. Kills FIN-001,
   FIN-002, and the retry black hole. `generateTicket.ts` now only generates
   QR codes/uploads to Cloudinary and calls the RPC; it checks "already fully
   paid" **before** the `alreadyBought` guard so a redelivered webhook or a
   post-crash retry converges instead of stranding.
2. **`finalizePaystackPayment` fixes** (FIN-003, REL-001) — a thrown/network
   verify error now reverts the group to `pending` (retryable) instead of the
   previously-permanent `failed`; a stuck `processing` primary attempt older
   than 15 minutes self-heals on the function's own next invocation.
3. **`recover_stale_payment_attempts()` pg_cron** (`*/5`, migration
   `20260907093300`) — the systemic backstop: `processing` older than 15 min
   → `fulfillment_failed` (transaction exists) or `pending` (not). Verified
   present, active, in `cron.job`.
4. **Payment-aware checkout expiry** (DATA-001, same migration) —
   `expire_stale_ticket_checkouts` now excludes any checkout with a live
   `payment_attempt` (`initiated`/`pending`/`processing`). The "bump
   `expires_at` on payment-attempt creation" half was **not** added — the
   exclusion alone closes the oversell/charged-no-ticket failure mode.
5. **Constraints** (DATA-002, migration `20260907093100`) —
   `ticket_type.price >= 0`, `ticket_type.quantity >= 0` (NULL ok),
   `promo_code.discount_percentage BETWEEN 0 AND 100`, `ticket.ticket_code`
   UNIQUE (partial index). Pre-checked for zero existing violations, then
   `NOT VALID` → `VALIDATE`.

**Still open from the original Phase 2 scope** (deferred, not attempted this
pass — flagged rather than rushed):

- **`create_ticket_checkout(...)` RPC** (INV-001, INV-002) — checkout
  *creation* (inventory reservation + promo claim + row insert) is still the
  imperative multi-call sequence in `validateCheckoutCore`, with the same
  "crash before the checkout row exists" inventory-leak risk it always had.
  Lower likelihood than the issuance path this phase fixed (a leak here needs
  a mid-request crash, not just a slow payment), but the same atomic-RPC
  pattern applies directly. Next candidate for a Phase-2 follow-up.
- **DATA-003/DATA-004** — the empty-partition tables and `review`'s
  partition-maintenance job are untouched.

Verification performed: full `turbo typecheck` (all 11 packages), `next build`
(web), `biome check --write` on every touched file, live SQL smokes (RPC
idempotent-replay against a real paid checkout — zero mutation; `expire_stale_
ticket_checkouts()` still runs clean; cron job + grants confirmed via
`pg_indexes`/`pg_proc`/`cron.job`), security advisor re-run (only the expected
new `authenticated`-executable `SECURITY DEFINER` entry for
`issue_tickets_for_checkout`, same accepted class as the pre-existing ones).
**Not exercised**: a live end-to-end Paystack test-mode charge through the new
path (needs a human in the loop per the existing project convention), and a
genuine concurrent-request race test.

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
