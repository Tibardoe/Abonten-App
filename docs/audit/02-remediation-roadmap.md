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

**Follow-up (same pass, user asked to close out the deferrals)**:

- **`create_ticket_checkout(...)` RPC** (INV-001, INV-002) — **done**,
  migration `20260907094000`. Checkout creation is now one transaction:
  single-statement inventory decrement per line (also re-verifies the price
  hasn't moved since it was quoted — a correctness bonus over the old CAS,
  which only guarded quantity), promo claim, checkout-row insert. A new
  partial-unique index (`ticket_checkout_one_pending_per_user_event`, zero
  pre-existing violations confirmed) turns a concurrent duplicate-checkout
  race into a clean rollback instead of two checkouts contending for the
  same seats. `validateCheckoutCore` keeps all its pre-checks and pricing
  (unchanged) and calls the RPC only for the mutation — the manual
  `rollbackReservations()` compensation code is gone entirely, not just
  replaced.
- **DATA-003** — **done**, migration `20260907094100`. Confirmed via a
  repo-wide grep first that `event_media`/`wallet`/`story`/`event_share`/
  `media_audit` are referenced by no current app code. `event_media`/`wallet`
  are HASH-partitioned (no DEFAULT partition possible for hash strategy) →
  got real 4-way modulus/remainder partitions matching the existing
  `favorite_p1..p4` convention. The other three are RANGE-partitioned → each
  got one DEFAULT partition. **Deliberately not decided**: whether these
  unused tables should be built out or dropped — flagged for the owner, not
  resolved silently.
- **DATA-004** — **done**, same migration. Correction on re-verification:
  `review` already had a `review_default` catch-all, so this was never an
  outright insert-failure risk — only a "partition pruning silently stops
  working past december_2026" risk. `ensure_future_review_partitions()` now
  keeps 3 months of real partitions ahead of the current date, scheduled
  monthly via pg_cron (confirmed via `pg_inherits`: ran once as part of the
  migration and it was a true no-op, since Sep/Oct/Nov 2026 already existed).

Verification performed: full `turbo typecheck` (all 11 packages), `next build`
(web), `biome check --write` on every touched file, live SQL smokes (RPC
idempotent-replay against a real paid checkout — zero mutation;
`create_ticket_checkout`'s empty-lines and ticket-type-not-found error paths
raise the expected messages; `expire_stale_ticket_checkouts()` still runs
clean; partition counts and cron jobs confirmed via `pg_inherits`/`cron.job`),
security advisor re-run (only the expected new `authenticated`-executable
`SECURITY DEFINER` entries, same accepted class as the pre-existing ones).
**Not exercised**: a live end-to-end Paystack test-mode charge through the new
path, and a genuine concurrent-request race test — both need a human in the
loop per the existing project convention.

---

## Phase 3 — Scalability & abuse resistance

**Shipped** (this pass): **API-001 / OBS-001** — durable rate limiter,
migration `20260907094200_rate_limit_primitive.sql` (`rate_limit_bucket`
fixed-window table + `consume_rate_limit` `SECURITY DEFINER` RPC,
`service_role`-only, plus a daily cleanup cron) + `@abonten/services/
security/rateLimit`'s `checkRateLimit()` helper (fails open on an infra
error). Wired into the two endpoints that were genuinely unprotected:
`/api/geocode` (replaces the ineffective in-memory per-instance counter) and
`getPromoCodeCore` (closes a promo-code brute-force gap — covers the web
action, the mobile promo-preview route, and checkout validation, since all
three call this one function). On investigation, reports and OTP flows
already had adequate protection via this codebase's own established
COUNT-query pattern — the register entries were corrected to reflect that
rather than left overstated.

**Still open, not attempted this pass** (the same `checkRateLimit` helper
applies directly — each is a small, mechanical addition once picked up):
checkout-validate reservation churn, review posting, place-claim requests,
Cloudinary-signature requests, notification-broadcast preview. Also open:

- **Pagination audit**: confirm every list RPC / `.select()` in admin tables,
  organizer dashboards, Explore, Search, notifications has a bounded page size
  and keyset cursor (spot-checks show `pagination.ts` keyset is used widely —
  verify no unbounded `.select()` on `ticket`, `attendance`, `notification`,
  `app_error_event`).
- **Search**: `event_search` matview refresh every 15 min is fine to ~100k
  events; note the ceiling and the eventual move to incremental refresh /
  Postgres FTS trigger.
- Enable Vercel platform-level abuse protection (dashboard setting, not code).

## Phase 4 — Architecture consolidation

**Shipped**: **ARCH-001**'s structural fix landed as part of Phase 2 — the DB
mutation halves of ticket issuance and checkout creation now live in Postgres
RPCs, with only Next primitives (`revalidatePath`, `after`, email) left in
the `apps/web` wrappers. `issueRefundCore` was reviewed against the same
"multi-step, no transaction" pattern: it's already reasonably well-designed
for a flow that has to call an external API (Paystack) partway through — the
Paystack call happens first and DB state is only recorded after, so a
failure there leaves no partial DB state, and Paystack's own idempotency is
the backstop against a request retry double-refunding. Not rewritten;
lower risk than the issuance path was.

**Sweep of `apps/web/src/utils/*`/`apps/web/src/actions/*` and
`packages/services` for the same "multi-step, no idempotency guard" shape**
found and fixed one more: **INV-003** — `cancelUserTicketCore` (ticket
cancel → conditional refund → attendance update → conditional checkout-cancel
→ inventory release → promo-usage release) had no guard against being
re-run on an already-cancelled ticket, which would call `releaseTicketQuantity`
a second time and inflate available inventory. Fixed with an early-return
idempotency guard — cheaper and lower-risk than a full atomic RPC, and
sufficient to close the actual failure mode. `checkInTicketCore` was checked
too and is already correctly guarded (single-statement update, pre-checked
against the current status).

**Not attempted this pass**: consolidating the `status: 300` sentinel
pattern used across `validateCheckoutCore`/`generateTicket`/
`registerForFreeEventCore` into a real discriminated union or documented
error-code enum. This is a real maintainability wart (a plain `number`
doubling as both an HTTP-style status and an app-specific sentinel), but
fixing it touches every caller of these three functions across web and
mobile — a wide-blast-radius refactor for a cosmetic/type-safety win, not a
correctness fix. Recommended for a dedicated pass with its own review, not
as a rider on this audit.

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
| SEC-004 | Needs a coordinated service-role key rotation — investigated 2026-09-04, rotation not yet performed (owner's call) | Med — key exposure via schema/backup | Schedule rotation; move token to Vault |
| SEC-003 | Dashboard toggle + Postgres upgrade window — exact settings identified live 2026-09-04, not yet applied (owner's call) | Low-Med | Enable leaked-password protection; book minor-version upgrade |
| MOB-001 | Product call on server-side push volume/UX | Med — reminders silently lost | Decide if a server-side reminder sender is wanted |
| Unused indexes (DB-PERF-001 part 2) | Needs ~30 days production traffic to judge | Low — extra write cost | Re-run performance advisor, drop only truly-cold indexes |
