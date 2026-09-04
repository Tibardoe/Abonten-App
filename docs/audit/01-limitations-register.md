# Abonten — Limitations Register (2026-09-04)

Scope: system-wide limitation audit across web, mobile, admin, shared packages,
DB, integrations, observability, tooling. A *limitation* here includes anything
that weakens security, financial/data integrity, reliability, scalability,
maintainability, or cross-platform consistency — **not only bugs**. Items are
verified against current source / the live DB (project `sderrexhawjbmsugndcq`)
unless marked *(flagged — needs deeper review)*.

Severity: Critical / High / Medium / Low / Info. Likelihood: High / Med / Low.
Status: Not started / Planned / In progress / Fixed / Deferred.

Priority order applied (brief §4): security → financial integrity → data
integrity → authz → ticket/payment correctness → reliability → scalability →
architecture → performance → observability → maintainability → DX → UX.

---

## CRITICAL

### FIN-001 — Paid ticket issuance is non-atomic; retry path has a reconciliation black hole
- **Area**: Payments / Ticketing / Data integrity
- **Problem**: `apps/web/src/utils/generateTicket.ts` issues tickets as a sequence of independent PostgREST calls (QR upload → `ticket` insert → `attendance` insert → `ticket_checkout` → `paid` → `record_organizer_earning`). No DB transaction. Failure modes:
  1. Crash/error after `ticket` insert but before `ticket_checkout` → `paid`: tickets exist and consume stock, but the checkout stays `pending`; the next `expire_stale_ticket_checkouts` run **restocks inventory that was actually sold** (oversell) and the organizer earning is never recorded.
  2. Multi-row checkout, row 2 of 3 fails: rows-1 tickets are already committed; the function returns 500 and `releaseTicketQuantity` only gives back row 2's units. Rows-1 tickets are orphaned against a still-`pending` checkout → later restock → oversell.
  3. Retry via `finalizePaystackPayment` `fulfillment_failed` path re-enters `generateTicket`; the `alreadyBought` guard returns `status: 300`, which the finalizer treats as a failure (`!== 200`) → the attempt is stuck `fulfillment_failed` forever, checkout never marked `paid`, earning never recorded. Buyer charged, has no ticket, no automated recovery.
- **Root cause**: business logic that mutates 4 tables + calls an RPC was implemented as imperative client calls because it also needs `revalidatePath`/`after` (Next primitives), which kept it out of `@abonten/services` and out of a single DB function.
- **Impact**: silent oversell, silent organizer under-payment, unrecoverable "paid but no ticket" support tickets. Money + trust.
- **Severity**: Critical · **Likelihood**: Med (needs a mid-sequence failure — transient Cloudinary/DB error, cold-start timeout, webhook suspend) · rising with volume.
- **Current workaround**: manual support reconciliation; `record_platform_fee`/`record_organizer_earning` are individually idempotent so a *manual* re-run is safe.
- **Recommended solution**: move the DB mutation into one `SECURITY DEFINER` RPC `issue_tickets_for_checkout(p_checkout_session_id, p_user_id, p_transaction_id, p_qr jsonb[])` that, in a single transaction: locks the checkout rows, verifies ownership + `pending` + not-expired, inserts tickets + attendance, flips checkout → `paid`, calls `record_organizer_earning`. Make it **idempotent**: if the checkout is already `paid`, return the existing ticket ids with status 200. QR generation + Cloudinary upload stay in `generateTicket` (the only non-DB step); everything else becomes atomic. `finalizePaystackPayment` then treats "already issued" as success.
- **Dependencies**: touches `generateTicket`, `finalizePaystackPayment`, `registerForFreeEventCore` (free path shares issuance), `retryPaymentFulfillmentCore`. New migration.
- **Status**: **Fixed (Phase 2)** — migration `20260907093200_issue_tickets_for_checkout_rpc.sql`: `issue_tickets_for_checkout(checkout_session_id, user_id, transaction_id, metadata, ticket_expires_at, tickets)` does the lock + idempotency check + ticket/attendance insert + checkout→paid + `record_organizer_earning` in one transaction; returns existing tickets (`already_issued=true`) if the checkout is already paid. Authorization for a paid issuance requires a matching `payment_attempt` (`processing`/`succeeded`) **and** a `transaction.status='successful'` row owned by the caller — a free issuance requires every row priced at exactly 0 — so it's safe to grant `authenticated` (the client-verify fulfilment path runs as the buyer). `generateTicket.ts` now only does QR generation/Cloudinary upload, then calls the RPC; it also checks "all rows already paid" **before** the `alreadyBought` guard, closing the retry black hole. Live-verified: idempotent-replay smoke against a real paid checkout returned the existing ticket with `already_issued=true` and made zero writes. `registerForFreeEventCore` (the one-click RSVP path, no checkout row) was not touched — it was already a single ticket + attendance insert with a much smaller blast radius; revisit only if it shows the same failure class in practice.

### FIN-002 — `record_organizer_earning` failure is swallowed
- **Area**: Payments / Financial integrity / Observability
- **Problem**: `generateTicket.ts` fires `record_organizer_earning` for every checkout row via `await Promise.all(rows.map(r => ledgerClient.rpc(...)))` with **no error inspection**. A transient failure means the organizer is never credited for a completed paid sale, nothing retries it, and nothing alerts.
- **Root cause**: treated as fire-and-forget "ledger side-effect" rather than part of the financial transaction.
- **Impact**: organizer balance under-states real earnings; discovered only if an organizer disputes a payout. No detection.
- **Severity**: Critical (money) · **Likelihood**: Low per-call, but unbounded cumulative once volume is real.
- **Current workaround**: none. RPC is idempotent so a manual re-run fixes a known case.
- **Recommended solution**: fold the earning insert into the atomic `issue_tickets_for_checkout` RPC (FIN-001) so it cannot partially succeed. Until then: check each RPC result, and on failure `reportError` + emit an `app_error_event` tagged `ledger.earning_failed` with the checkout id so Monitoring surfaces it. A daily reconciliation query (`paid ticket_checkout with no matching earning entry`) as a safety net.
- **Dependencies**: FIN-001.
- **Status**: **Fixed (Phase 2)**, folded into `issue_tickets_for_checkout` — `record_organizer_earning` now runs inside the same transaction as the ticket insert and checkout state change, so it cannot silently fail independently of the purchase. A daily reconciliation query as an extra safety net is still Planned (Phase 5).

### FIN-003 — Transient Paystack verify error permanently fails a possibly-succeeded charge
- **Area**: Payments / Reliability / Financial integrity
- **Problem**: In `finalizePaystackPayment.ts`, a thrown error from `verifyTransaction` (network blip, Paystack 5xx, timeout) runs `markGroup("failed", …)`. The type contract says `failed` is "permanently terminal (a real decline)" and the CAS re-entry filter is `.in("status", ["initiated","pending","fulfillment_failed"])` — **`failed` is excluded**, so a later webhook delivery cannot recover. If the charge actually succeeded on Paystack, the buyer is charged with no ticket and no path back except manual support.
- **Root cause**: conflating "we couldn't reach Paystack" with "Paystack declined the card".
- **Impact**: money taken, nothing delivered, no auto-recovery. Worse on mobile-money (Ghana) where verify latency/timeouts are common.
- **Severity**: Critical · **Likelihood**: Med (Paystack transient errors are routine at scale).
- **Current workaround**: none automated.
- **Recommended solution**: on a thrown/transient verify error, revert the group to `pending` (retryable) instead of `failed`; only write `failed` when Paystack explicitly returns a terminal non-success status (`failed`/`abandoned`/`reversed`). Add `processing` older than N minutes to the re-entry set (see REL-001) so a stuck lock also recovers.
- **Dependencies**: REL-001 (stuck-`processing` reaper).
- **Status**: **Fixed (Phase 2)** — a thrown/network error from `verifyTransaction` now reverts the group to `pending` (retryable via the CAS lock and `retryPaymentFulfillmentCore`) instead of `failed`. `failed` is reserved for Paystack's own terminal `failed`/`abandoned`/`reversed` statuses or a real amount/currency mismatch — unchanged.

---

## HIGH

### REL-001 — No reaper for `payment_attempt` stuck in `processing`
- **Area**: Payments / Reliability
- **Problem**: `finalizePaystackPayment` CAS-locks an attempt to `processing`, then does ~6 more sequential calls. A crash/timeout after the lock leaves the row `processing` forever. The re-entry filter excludes `processing`, so neither the webhook nor the user's manual retry can pick it up. The checkout inventory is eventually freed by the 30-min expiry sweep, but the *payment* is orphaned.
- **Root cause**: the lock has no lease/expiry; no job sweeps stale locks.
- **Impact**: "payment stuck / can't retry" support load; orphaned money if the charge succeeded.
- **Severity**: High · **Likelihood**: Med at scale (serverless cold-start timeouts, webhook 10s limits).
- **Recommended solution**: pg_cron `*/5` job `recover_stale_payment_attempts()` that moves `processing` rows older than 15 min back to `fulfillment_failed` (if a `transaction` row exists) or `pending` (if not), so the existing retry paths take over. Alternatively add `updated_at < now() - interval '15 min'` to the re-entry filter.
- **Dependencies**: none.
- **Status**: **Fixed (Phase 2)** — both halves shipped: `recover_stale_payment_attempts()` runs every 5 min via pg_cron (`service_role`-only) and does exactly this; `finalizePaystackPayment` also self-heals a stuck `processing` primary attempt (>15 min old) at the top of its own next invocation, so a caller doesn't have to wait for the next cron tick. Live-verified: job present in `cron.job`, active, `*/5 * * * *`.

### DATA-001 — Checkout expiry ignores in-flight payments → oversell / charged-no-ticket
- **Area**: Ticketing / Data integrity / Concurrency
- **Problem**: `expire_stale_ticket_checkouts()` flips any `pending` checkout with `expires_at < now() - 1 min` to `expired` and **restocks its inventory**, with no regard for whether a `payment_attempt` (`initiated`/`pending`/`processing`) is attached to that `checkout_session_id`. Mobile-money OTP authorisation can legitimately outrun the 30-minute window; `finalizePaystackPayment` explicitly parks `pending`/`queued` charges "via the existing 30-minute expiry window" — but that window then *restocks* the seats. The subsequent successful webhook either issues tickets against an `expired` checkout (→ `generateTicket` returns 410, buyer charged, no ticket) or, if stock was resold in between, drives `ticket_type.quantity` negative.
- **Root cause**: the expiry sweep predates grouped payment attempts and was never made payment-aware.
- **Impact**: oversell; charged-with-no-ticket; negative inventory.
- **Severity**: High · **Likelihood**: Med (specifically Ghana mobile money).
- **Recommended solution**: exclude from the sweep any checkout whose `checkout_session_id` has a `payment_attempt` in a non-terminal state; **and** when a payment attempt is created, extend the checkout's `expires_at` (e.g. +30 min) so a genuine slow authorisation keeps its seats. Belt-and-braces: `reserveTicketQuantity`/restock should `GREATEST(0, …)` and the `ticket_type.quantity` column should get a `CHECK (quantity IS NULL OR quantity >= 0)` (DATA-002) so an oversell fails loudly instead of silently.
- **Dependencies**: DATA-002 (CHECK), overlaps FIN-001.
- **Status**: **Fixed (Phase 2)** — `expire_stale_ticket_checkouts()` now excludes any checkout whose `checkout_session_id` has a `payment_attempt` in `initiated`/`pending`/`processing`, so a slow mobile-money authorisation keeps its seats through the sweep. The "bump `expires_at` when a payment attempt starts" half of the original recommendation was **not** implemented — the exclusion alone removes the oversell/charged-no-ticket failure mode; a live-abandoned attempt still eventually times out and releases normally once it's no longer in a live status. DATA-002's CHECK constraints (`quantity >= 0`, etc.) also shipped as the belt-and-braces backstop.

### INV-001 — Inventory leak on crash between reservation and checkout-row insert
- **Area**: Ticketing / Data integrity
- **Problem**: `validateCheckoutCore` calls `reserveTicketQuantity` (real CAS decrement) for each ticket type, then claims promo usage, then inserts the `ticket_checkout` rows. If the process dies before the insert, the decrements are live but there is **no checkout row for the expiry sweep to reclaim** — the units are lost until an organizer manually edits the ticket type. Manual `rollbackReservations()` only covers in-request errors, not process death.
- **Root cause**: multi-resource reservation without a transaction or a durable "reservation intent" record.
- **Impact**: slow inventory bleed; tickets show sold-out while seats are really free.
- **Severity**: High · **Likelihood**: Low-Med.
- **Recommended solution**: fold reservation + checkout-row insert into one `create_ticket_checkout(...)` RPC (single transaction — the CAS becomes a `FOR UPDATE` decrement). Then a partial state is impossible. Interim: a low-frequency reconciliation job comparing `Σ ticket_type.quantity + Σ open reservations` against a known-good baseline is hard without an intent table — prefer the RPC.
- **Dependencies**: shares the "make checkout creation atomic" work with DATA-001.
- **Status**: **Fixed** — migration `20260907094000_create_ticket_checkout_rpc.sql`. `create_ticket_checkout(user, event, occurrence, promo, expires_at, lines)` reserves every line's inventory with a single-statement `UPDATE … WHERE (quantity IS NULL OR quantity >= n) AND price matches quoted RETURNING`, claims the promo code, and inserts the `ticket_checkout` rows — all in one transaction. A crash or any failure at any step now rolls back everything automatically; there is no manual compensation left to skip. `validateCheckoutCore` still does all its read-only pre-checks and pricing (unchanged, still the single source of pricing truth) and calls this RPC only for the mutation. Live-verified: empty-lines and nonexistent-ticket-type error paths both raise the expected user-safe message.

### DOS-001 — No upper bound on ticket quantity per checkout
- **Area**: Security / Cost / Reliability / Scalability
- **Problem**: neither the web action, the mobile route, nor `validateCheckoutCore` caps `quantities[ticketTypeId]`. The mobile route checks only `Number.isInteger(value) && value >= 0`. Against an unlimited (`quantity = null`) ticket type, one authenticated request can create a checkout for millions of units; `generateTicket` then loops generating that many QR codes and Cloudinary uploads.
- **Root cause**: quantity treated purely as a UI concern.
- **Impact**: Cloudinary/compute cost blow-up, function timeouts, effective DoS of the checkout path, giant `ticket`/`attendance` writes.
- **Severity**: High · **Likelihood**: Med (trivial to trigger; also happens by accident via a client bug).
- **Recommended solution**: enforce `MAX_TICKETS_PER_TICKET_TYPE` and `MAX_TICKETS_PER_ORDER` in `validateCheckoutCore` (the shared choke point → web + mobile both covered) with a named constant in `@abonten/core`; reject with a clear 400. **Implemented in Phase 1.**
- **Dependencies**: none.
- **Status**: Fixed (Phase 1) — `@abonten/core/checkoutLimits`, enforced in `validateCheckoutCore`.

### SEC-001 — `SECURITY DEFINER` functions broadly executable by `authenticated`; one has no authz check
- **Area**: Security / Database
- **Problem**: 13 `SECURITY DEFINER` functions are `EXECUTE`-able by `authenticated` via `/rest/v1/rpc/*` (Supabase advisor `0029`). Most self-authorize (`cancel_event_and_release_tickets`, `get_event_attendee_contacts`, `request_organizer_payout`, `get_organizer_ledger_transactions` all check `auth.uid()` internally — **verified**). But:
  - `get_transaction_refundable_amount(p_transaction_id uuid)` — **no authorization check at all**; any signed-in user can read the refundable amount for any transaction id. Only ever called from service-role service code (`issueRefundCore`, `financeAdminCore`) — **verified**, so it can simply be revoked.
  - The self-authorization in the other 12 is load-bearing and has **zero automated tests**.
- **Root cause**: functions exposed through PostgREST by default; authz lives in prose + function bodies.
- **Impact**: `get_transaction_refundable_amount` — minor info disclosure. The class — one missed internal check = privilege escalation / PII leak (`get_event_attendee_contacts` returns attendee emails + phones).
- **Severity**: High · **Likelihood**: Low (no known missing check beyond the one) but high blast radius.
- **Recommended solution**: `REVOKE EXECUTE … FROM anon, authenticated` on `get_transaction_refundable_amount` (**Phase 1**). Audit the remaining 12 line-by-line and add a regression test suite that calls each as an unauthorized `authenticated` user and asserts it raises (Phase 6). Consider moving purely-internal ones behind `service_role`.
- **Dependencies**: test harness (TEST-001).
- **Status**: In progress — revoke in Phase 1; full audit + tests Phase 6.

### API-001 — Rate limiting is inconsistent across the mobile API and Server Actions
- **Area**: Security / Scalability / Cost
- **Problem** (**corrected on closer inspection** — the original pass understated what already existed): OTP flows (`phoneAuthCore`, `updateVerifiedPhoneCore`, `requestPhoneVerification` — per-phone cooldown + per-IP cap via `phone_otp_send_log`) and report submission (`submitReportCore` — 10/hour per user, counted against the real `report` table) already have working, codebase-idiomatic protection (a plain COUNT query against the domain table, scoped to the last hour). What was genuinely unprotected: `/api/geocode` (in-memory counter, resets per cold start, doesn't share state across instances — effectively a no-op under real serverless traffic) and `getPromoCodeCore` (promo-code lookup has no domain-table row to count on a *failed* guess, so brute-forcing a short code was unthrottled). Checkout-validate reservation churn, review posting, place-claim requests, Cloudinary-signature requests, and notification-broadcast preview remain unthrottled and are not addressed by this pass.
- **Root cause**: no shared limiter primitive for the cases the existing COUNT-query pattern doesn't cover (unauthenticated proxy endpoints; attempt-based rather than success-based abuse).
- **Impact**: cost amplification via the geocode proxy; promo-code enumeration for a discount/free ticket. Remaining unthrottled endpoints: review/claim spam (partially caught downstream by moderation), reservation churn.
- **Severity**: High → **Medium** after correction (the two riskiest genuinely-open gaps are fixed) · **Likelihood**: Medium for the remaining unthrottled endpoints once the platform is public.
- **Recommended solution**: one durable limiter (`rate_limit_bucket(key, window_start, count)` fixed-window counter + `SECURITY DEFINER` `consume_rate_limit` RPC, `service_role`-only) wrapped in a small `@abonten/services/security/rateLimit` helper — deliberately matches this codebase's own existing pattern (a plain counted table) rather than introducing Redis/a queue.
- **Dependencies**: none.
- **Status**: **Partially fixed (Phase 3)** — migration `20260907094200_rate_limit_primitive.sql` + `checkRateLimit()` helper, wired into `/api/geocode` (replaces the in-memory counter, keyed by IP) and `getPromoCodeCore` (20/min per user, covers the web action, the mobile promo-preview route, and `validateCheckoutCore` — all three call this one function). Fails open on an infra error so a broken limiter never blocks a legitimate request. Live-verified: `consume_rate_limit` correctly allows the first N calls and rejects the (N+1)th within a window. **Still unthrottled, not attempted this pass**: checkout-validate reservation churn, review posting, place-claim requests, Cloudinary-signature requests, notification-broadcast preview — same helper applies directly to each, next candidate for a follow-up.

### SEC-004 — Service-role JWT embedded inline in a pg_cron command
- **Area**: Security / Secrets
- **Problem**: the `cleanupExpiredEvents` cron job's SQL literally contains `'Authorization', 'Bearer eyJ…service_role…'` — a long-lived service-role JWT (exp 2056) sitting in `cron.job.command`, readable by anyone with DB metadata access and captured in any `pg_dump`/schema pull.
- **Root cause**: quick wiring of an edge-function call from the dashboard.
- **Impact**: if the DB schema or a backup leaks, so does a full service-role key.
- **Severity**: High · **Likelihood**: Low.
- **Recommended solution**: store the token in Supabase Vault (`vault.decrypted_secrets`) and reference it in the cron command, or convert the job to call a `SECURITY DEFINER` SQL function directly instead of an HTTP round-trip. Rotate the exposed key afterward.
- **Dependencies**: needs a deliberate secret-rotation window.
- **Status**: Deferred — flagged for owner (needs key rotation coordination).

### INV-003 — Ticket cancellation was not idempotent (found during the Phase 4 architecture sweep)
- **Area**: Ticketing / Data integrity
- **Problem**: `cancelUserTicketCore` (ticket cancel + conditional refund + attendance update + conditional checkout-cancel + inventory release + promo-usage release) had no guard against being called twice for the same already-cancelled ticket. A retried call (client-side network retry re-hitting the server, for example) would call `releaseTicketQuantity` a second time, inflating available inventory with a phantom seat. `issueRefundCore` was already separately guarded against a double refund, but the inventory release wasn't.
- **Root cause**: same class as FIN-001/INV-001 — a multi-step sequence with no idempotency check at the top.
- **Impact**: inventory could read higher than actually available, eventually causing an oversell once the phantom seat is "sold."
- **Severity**: Medium · **Likelihood**: Low-Med (needs an actual retry, not just a user re-clicking a disabled button).
- **Recommended solution**: an early-return guard — if the ticket is already `cancelled`, treat the call as a no-op success instead of re-running every mutation.
- **Status**: **Fixed** — added the guard; no schema change needed. Not folded into a full atomic RPC like the issuance/checkout-creation paths, since the guard alone closes the actual failure mode at much lower cost/risk; revisit only if this function accumulates more steps.

---

## MEDIUM

### DATA-002 — Missing DB CHECK / UNIQUE constraints on money & inventory columns
- **Area**: Database / Data integrity
- **Problem**: no `CHECK` on `ticket_type.price >= 0`, `ticket_type.quantity >= 0`, `promo_code.discount_percentage BETWEEN 0 AND 100`; `ticket.ticket_code` has no `UNIQUE`. All enforced only in Zod/app code. An oversell or a bad admin/RPC write corrupts silently instead of erroring.
- **Severity**: Medium · **Likelihood**: Med (interacts with DATA-001).
- **Recommended solution**: add the constraints as `NOT VALID` first, backfill/validate, then `VALIDATE`. `ticket_code` UNIQUE needs a dup scan first. Additive, safe once pre-checked.
- **Status**: **Fixed (Phase 2)** — migration `20260907093100_phase2_ticketing_constraints.sql`. Pre-migration scan confirmed zero existing violations for all four (verified via `execute_sql` before applying), so each `CHECK` was added `NOT VALID` then `VALIDATE`d in the same migration, and `ticket_code` got a partial `UNIQUE` index (`ticket` isn't partitioned).

### INV-002 — Inventory CAS is a read-then-write over PostgREST, not a single-statement decrement
- **Area**: Ticketing / Performance / Scalability
- **Problem**: `reserveTicketQuantity` does `SELECT quantity` then `UPDATE … WHERE quantity = <read value>`; under contention for a hot ticket type this thrashes (many 409 retries client-side) and doubles round-trips.
- **Severity**: Medium · **Likelihood**: Med for popular on-sale events.
- **Recommended solution**: single statement `UPDATE ticket_type SET quantity = quantity - $n WHERE id = $id AND (quantity IS NULL OR quantity >= $n) RETURNING quantity` inside the checkout-creation RPC (INV-001). Atomic, one round-trip, no CAS loop.
- **Status**: **Fixed**, folded into `create_ticket_checkout` (INV-001) — each line is now a single-statement conditional decrement with no read-then-write window, and it additionally re-checks the price hasn't moved since it was quoted (a small correctness bonus beyond the original ask: an organizer changing a ticket price mid-checkout used to be silently ignored by the old CAS, which only guarded quantity). `reserveTicketQuantity`'s CAS-retry version is unchanged and still used by `registerForFreeEventCore` (single free ticket, no checkout row) and `generateTicket`'s failure-path `releaseTicketQuantity` — not part of this fix's scope.

### DATA-003 — Declared-partitioned tables with zero partitions
- **Area**: Database
- **Problem**: `event_media`, `wallet`, `story`, `event_share`, `media_audit` are partitioned parents with no partitions → any insert fails with "no partition of relation found". `story`/`event_media`/`media_audit`/`wallet` are currently unreferenced by app code, `event_share` is used by share tracking.
- **Severity**: Medium (latent) · **Likelihood**: Low now, High the day someone wires one up.
- **Recommended solution**: for the genuinely-unused ones, either drop the table or convert to non-partitioned; for `event_share`, add a default partition or a rolling monthly partition + a pg_cron partition-maintenance job (also needed for `review`, whose newest partition is `december_2026`).
- **Status**: **Fixed (the "any insert fails" landmine)**, migration `20260907094100_fix_empty_partition_tables.sql` — confirmed via a repo-wide grep first that none of these 5 tables are referenced by any current app code (web/mobile/admin), so this is a pure safety fix, not a behavior change. `event_media`/`wallet` are HASH-partitioned (Postgres has no DEFAULT partition for hash strategy), so they got real 4-way modulus/remainder partitions, matching the `favorite_p1..p4`/`payment_method_p0..p3` convention already in the schema. `event_share`/`story`/`media_audit` are RANGE-partitioned and got one DEFAULT partition each. **Deliberately not decided**: whether these tables should be built out, kept as an empty foundation, or dropped — that's a product/architecture call for the owner, not something to resolve silently as a side effect of a safety fix (per the standing "flag, don't silently fix" discrepancy rule). Live-verified: `pg_inherits` shows 4/4/1/1/1 partitions respectively. **Self-caught regression**: the first version of this migration left all 11 new partitions with RLS *disabled* on the partition itself — Postgres does not propagate a parent's RLS-enabled flag to a partition created afterward, so a direct PostgREST request naming the partition table (e.g. `/rest/v1/wallet_p0`) instead of the parent would have bypassed the parent's RLS-deny-by-default and hit the schema-wide legacy `GRANT ALL` to `anon`/`authenticated`. Caught immediately by re-running the security advisor after applying (`rls_disabled_in_public`, 11 ERROR-level hits) and fixed in a follow-up migration (`fix_new_partition_rls_regression`) before moving on. Recorded here rather than silently corrected, per this document's own standard.

### DATA-004 — `review` partition maintenance is manual
- **Area**: Database / Scalability
- **Problem**: `review` is range-partitioned monthly; partitions currently exist through `december_2026` with no job creating future ones.
- **Correction on re-verification**: `review` already has a `review_default` catch-all partition (confirmed via `pg_inherits` before touching anything) — so this was **never actually an insert-failure time bomb** the way the original pass assumed; rows past `december_2026` would have silently landed in `review_default` instead of erroring. The real (lower-severity) problem is that once that happens, partition pruning stops working for new rows — they'd all pile into one unbounded partition — which defeats the point of partitioning without breaking anything.
- **Severity**: Medium → **Low** after correction · **Likelihood**: High eventually, but no longer urgent.
- **Recommended solution**: pg_cron monthly job that ensures the next few months of `review` partitions always exist ahead of the default catching them.
- **Status**: **Fixed**, same migration as DATA-003 — `ensure_future_review_partitions()` keeps the next 3 months of named partitions ahead of the current date, scheduled monthly (`ensure-future-review-partitions`, 1st of month, 03:00). Live-verified: ran once as part of the migration (a confirmed no-op — Sept/Oct/Nov 2026 already existed, partition count unchanged at 20), and the cron job is present and active.

### ARCH-001 — Business logic still leaks into `apps/web` for the two paths that matter most
- **Area**: Architecture / Maintainability / Cross-platform
- **Problem**: `generateTicket.ts` and `issueRefund.ts` hold real multi-table logic in `apps/web/src/utils` / `src/actions` because they use `revalidatePath`/`after`/React-email. Mobile fulfilment reaches them only indirectly through `paymentFulfillmentDeps` injected into `finalizePaystackPayment`. The "no logic fork" rule holds *in effect*, but the DB-mutation core of issuance/refund isn't in `@abonten/services` and isn't independently testable.
- **Severity**: Medium · **Likelihood**: n/a (structural).
- **Recommended solution**: extract the DB mutations into `@abonten/services` (as the atomic RPCs of FIN-001) + keep only the Next primitives (`revalidatePath`, `after`, email) in the `apps/web` wrapper. This is the holistic fix that also resolves FIN-001/002.
- **Status**: Planned (Phase 4, delivered alongside Phase 2).

### ARCH-002 — PROJECT.md has decayed as a source of truth
- **Area**: Maintainability / DX
- **Problem**: 170 KB, edited in-place with "Resolved 2026-08-xx" notes layered over stale prose; many sections still cite `src/actions/*` / `src/utils/*` paths that moved to `packages/services` in the shared-backend refactor. New contributors (and audits) must cross-check every claim against source.
- **Severity**: Medium · **Likelihood**: n/a.
- **Recommended solution**: split into a short evergreen `ARCHITECTURE.md` (regenerated/verified each release) + an append-only `CHANGELOG`-style history; delete superseded prose rather than annotating it. Point CLAUDE.md at the new file.
- **Status**: Planned (Phase 6).

### OBS-001 — `/api/geocode` rate limit is in-memory (per serverless instance)
- **Area**: Observability / Cost / Security
- **Problem**: `RATE_LIMIT_*` counters live in a module-level `Map`; on Vercel each instance has its own, and instances recycle — the limiter is close to a no-op under real traffic on a billed Google proxy.
- **Severity**: Medium · **Likelihood**: Med.
- **Recommended solution**: fold into the durable limiter from API-001.
- **Status**: **Fixed** — folded into API-001's fix; `/api/geocode` now calls `checkRateLimit` (DB-backed, shared across instances) instead of the in-memory `Map`.

### TYPE-001 — Generated DB types exist but aren't used in the hot paths
- **Area**: Type safety / Maintainability
- **Problem**: `packages/types/src/database.types.ts` is generated and present, yet `generateTicket.ts`, `validateCheckoutCore.ts`, `finalizePaystackPayment.ts` still use `as unknown as X` and hand-rolled row types. Schema drift in exactly the riskiest code is invisible to `tsc`.
- **Severity**: Medium · **Likelihood**: Med.
- **Recommended solution**: type the Supabase clients with `SupabaseClient<Database>` in `@abonten/services` and remove the casts in the payment/checkout/ticket modules; add `supabase gen types` to a CI check so drift fails the build.
- **Status**: Planned (Phase 6).

### TEST-001 — Zero automated tests in the entire monorepo
- **Area**: Testing / Reliability
- **Problem**: no Jest/Vitest/Playwright config anywhere. Payments, inventory concurrency, RLS, refunds, promo allocation, `SECURITY DEFINER` authz — none have executable coverage. Every change is verified only by `tsc` + `next build` + manual smoke.
- **Severity**: Medium (High for the money path) · **Likelihood**: n/a.
- **Recommended solution**: add Vitest to `packages/services` and `@abonten/core`; seed with the highest-value cases — `computeLineAmount`/`allocatePromoEligibility` (pure, easy), then integration tests against a local Supabase for `reserveTicketQuantity` concurrency, `finalizePaystackPayment` idempotency/retry, and an RLS/`SECURITY DEFINER` authz matrix. Not coverage-chasing — these specific scenarios.
- **Status**: Planned (Phase 6).

### MOB-001 — Event reminders are device-local best-effort
- **Area**: Mobile / Notifications
- **Problem**: reminder firing is a local `expo-notifications` schedule per device; `event_reminder` stores only the chosen offsets so another device can re-arm. If the OS drops the schedule, the app is uninstalled/reinstalled, or notification permission is revoked, the reminder is silently lost. No server-side send.
- **Severity**: Medium · **Likelihood**: Med.
- **Recommended solution**: add a server-side reminder sender (pg_cron scanning `event_reminder` + `event.starts_at`, pushing via the existing `device_token` + Expo push path) as the source of truth; keep the local schedule as an offline fallback.
- **Status**: Deferred — product call on push volume/UX.

### BIZ-001 — "One ticket per event per user" rule is inconsistent and undocumented
- **Area**: Business logic / UX
- **Problem**: `validateCheckoutCore` and `generateTicket` both hard-block a purchase if the user already has an `active`/`used` ticket for the event (`status: 300 already_purchased`) — but a single checkout may contain `quantity > 1`. So "one per person" is enforced across sessions but not within one. It also permanently blocks legitimate re-purchase (different date of a multi-date event, buying for a friend later). Not stated in any product doc.
- **Severity**: Medium · **Likelihood**: High (real users will hit it).
- **Product decision (2026-09-04)**: no global one-ticket-per-event restriction — a customer may buy multiple tickets, including multiple ticket types, for the same event, limited only by each ticket type's own `quantity` and the per-order caps in `@abonten/core/checkoutLimits` (DOS-001).
- **Fix applied**: removed the `active`/`used`-ticket block from `validateCheckoutCore` (paid checkout creation), `generateTicket` (issuance-time defensive re-check), and the `create_ticket_checkout` RPC's in-transaction copy of the same guard (new migration `20260907095000`, applied live + verified with a rolled-back SQL smoke test against a real user with an existing active ticket). Removed the now-dead `already_purchased` branch from `CheckoutModal.tsx` and the `reason` union in both `ValidateCheckoutResult` types (`@abonten/services` + `@abonten/api-client`). The `pending_checkout` guard (at most one in-flight reservation per user+event) is unrelated — it's a concurrency safeguard, not a purchase-count limit — and was kept as-is.
- **Deliberately NOT touched — flagged for confirmation**: `registerForFreeEventCore` (the free "RSVP" path) has its own copy of the same `active`/`used` check, but it backs a fundamentally different UI — a binary "I'm Attending" / "Cancel Attendance" toggle (`AttendingButton.tsx` on web, `FreeRsvpCard.tsx` on mobile) with a hard-coded quantity of 1 and no ticket-type/quantity selector. The product decision as stated ("purchase multiple tickets... including multiple ticket types... subject to configured ticket-type quantities") reads as scoped to the paid, quantity-based checkout flow. Removing the free-RSVP guard would let one person accumulate multiple `attendance` rows for a feature whose UI has no concept of "how many" — a separate product call. Left as-is pending explicit confirmation either way.
- **Status**: **Fixed** (paid path) — verified live (RPC smoke test) + `turbo typecheck` (4/4 affected packages) + `next build` (apps/web) + biome. Free-RSVP path deferred to a separate product decision.

### SEC-002 — `enforce_avatar_public_id_owner` has a mutable `search_path`
- **Area**: Security / Database
- **Problem**: advisor `0011`; the trigger function doesn't pin `search_path`, so a crafted `search_path` at call time could resolve unqualified names unexpectedly.
- **Severity**: Medium · **Likelihood**: Low.
- **Recommended solution**: `ALTER FUNCTION … SET search_path = ''` + schema-qualify its body. **Implemented in Phase 1.**
- **Status**: Fixed (Phase 1).

### SEC-003 — Auth hardening toggles off; Postgres has pending security patches
- **Area**: Security
- **Problem**: Supabase "leaked password protection" (HaveIBeenPwned) is disabled; `supabase-postgres-15.8.1.044` has outstanding security patches (advisor).
- **Severity**: Medium · **Likelihood**: Low (Google OAuth is the main sign-in; passwords are only the internal one-time phone-auth rotation).
- **Recommended solution**: enable leaked-password protection in Auth settings; schedule the Postgres minor upgrade in a maintenance window.
- **Status**: Deferred — flagged for owner (dashboard toggle + upgrade window).

### DB-PERF-001 — Unindexed FKs and a large "unused index" set
- **Area**: Database / Performance
- **Problem**: 33 unindexed FKs — mostly `*_moderated_by_fkey` across `event`/`place`/`review*`/`highlight` (from the moderation-state migration), plus long-standing ones on `subscription.plan_id`, `subscription.transaction_id`, `subscription_checkout.subscription_plan_name`, `user_info.status_id`, `wallet.user_id`, `story.user_id`, `media_audit.user_id`. Separately, 65 indexes report zero scans — but most are freshly created (admin tables, the `20260907091000` FK covering set, promo/`payment_attempt`) so "unused" is expected for now.
- **Severity**: Medium (FKs) / Low (unused) · **Likelihood**: Med.
- **Recommended solution**: add covering indexes for the moderation FKs as **partial** `WHERE moderated_by IS NOT NULL` (they're almost all NULL) and plain btree for the subscription/user_info/wallet ones. **Implemented in Phase 1.** Do **not** drop any "unused" index this pass — re-run the advisor after ~30 days of production traffic and drop only then.
- **Status**: Fixed (FK indexes, Phase 1). Unused-index review → Deferred (needs traffic).

### DATA-005 — Orphaned `log_user_changes()` / `audit_log`
- **Area**: Database / Maintainability
- **Problem**: `log_user_changes()` inserts into `audit_log`, which is not created anywhere and is attached to no trigger. Dead code that would error if ever wired.
- **Severity**: Low-Medium · **Likelihood**: Low.
- **Recommended solution**: drop the function, or (if user-change history is wanted) create `audit_log` + the trigger deliberately. Given `admin_audit_log` + moderation tables already exist, most likely: drop it.
- **Status**: Planned (Phase 6).

---

## LOW / INFORMATIONAL

| ID | Area | Problem | Rec. | Status |
|---|---|---|---|---|
| LOW-001 | Web | `apps/web/src/app/api/user-profile/route.tsx` queries the non-existent view `user_profile_detail` (singular) → 500 whenever hit. | Point at `user_profile_details` or delete the route if unused. | Planned (Phase 7) |
| LOW-002 | Web | `useUserProfile.ts` reads `displayName/email/phone/createdAt/lastSignInAt` off `user_info` — columns don't exist, always `undefined`. | Source from the Auth user object or drop the fields. | Planned (Phase 7) |
| LOW-003 | DB | `pg_trgm` installed in `public` schema (advisor `0014`). | Move to `extensions` schema in a migration. | Deferred |
| LOW-004 | DX | `apps/web/src/landing Page/` has a literal space in the directory name. | Rename when a refactor next touches it. | Deferred |
| LOW-005 | DX | `README.md` is the `create-next-app` default. | Replace with a real overview + link to `docs/`. | Planned (Phase 6) |
| LOW-006 | Web | Next 16 "Cache Components" migration left half-done (`// TODO` across ~30 route files, one `instant=false` active). | Finish or formally defer with a tracking issue; don't leave TODOs indefinitely. | Deferred |
| LOW-007 | DB | Inconsistent UUID default (`uuid_generate_v4()` vs `gen_random_uuid()`) across tables. | Standardise on `gen_random_uuid()` opportunistically. | Deferred |
| LOW-008 | Config | Vestigial `NEXTAUTH_*` / `GOOGLE_CLIENT_*` env vars with no `next-auth` dependency. | Remove from env templates. | Deferred |
| LOW-009 | Admin | `admin_audit_log`, `admin_*`, `app_error_*`, observability tables show "RLS enabled, no policy" (advisor `0008`). Intentional (service-role only) but the advisor will keep flagging it. | Add an explicit `USING (false)` policy + a comment, so intent is legible and the advisor is quiet. | Planned (Phase 5) |
| LOW-010 | Mobile | `apps/mobile/src/features/discovery/useGeocode.ts` calls the web geocode proxy — subject to OBS-001's broken limiter. | Covered by API-001 fix. | Planned (Phase 3) |

---

## Cross-cutting observations

- **Idempotency is good where it was designed in** (`record_organizer_earning`, `record_platform_fee`, `transaction.paystack_reference` UNIQUE, the `payment_attempt` CAS lock) and **absent where it wasn't** (`generateTicket` as a whole, the `fulfillment_failed`↔`already_bought` interaction).
- **Atomicity is the recurring root cause.** FIN-001, FIN-002, DATA-001, INV-001, INV-002 all dissolve if checkout-creation and ticket-issuance each become one `SECURITY DEFINER` RPC. That single architectural move is the highest-leverage fix in this register.
- **The service-role-after-identity-check pattern is sound** and consistently applied. The gap is that the *identity checks inside `SECURITY DEFINER` functions* have no test coverage (SEC-001, TEST-001).
- **No overengineering needed.** Every recommendation stays within "modular monolith + Postgres RPCs + pg_cron + one durable rate-limit table". No queue, no Redis (unless chosen for API-001), no new service.
