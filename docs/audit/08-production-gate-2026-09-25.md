---
title: Final production gate — 2026-09-25
purpose: Record the go/no-go verification of the full-system audit branch before it reaches production — what was re-tested, what new problems were found and fixed, the deployment rehearsal, and the exact rollout order.
audience: Founder, engineering, whoever deploys the branch
scope: apps/web, apps/admin, apps/mobile, packages/*, supabase/migrations (local stack), read-only checks against production project sderrexhawjbmsugndcq
status: Approved
version: 1.1
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Final production gate — 2026-09-25

Branch `audit/production-gate-2026-09-25`, built on the full-system audit
branch (`audit/full-system-2026-09-25`, report
[07-full-system-audit-2026-09-25](07-full-system-audit-2026-09-25.md)). This
pass treated that report as claims to check, not as facts. Nothing in
production was changed: every production check below was a read-only query
or a log search.

## 1. The finding that changes the rollout order

**Creating an event through the web or mobile app has been failing in
production since the global-platform migrations landed on 2026-09-25 at
06:13 UTC.** `create_event` runs with the caller's rights (SECURITY INVOKER)
and, since `global_markets_foundation`, reads the `currency` table, which
only the service role may read. The code on `main` calls it with the
organizer's own session, so the call fails with "permission denied for
table currency".

- Reproduced on the local stack with the production schema.
- Confirmed read-only in production: `create_event` is not SECURITY DEFINER,
  reads `currency`, and `authenticated` has no SELECT on `currency`.
- No event has been created since 2026-09-22; the production logs show no
  failed attempt yet, so no organizer is known to have hit it.
- `create_place` is **not** affected (it does not read `currency`); verified
  the same way.
- The gate branch calls `create_event` with the service role after the
  restriction check, so **deploying the code fixes it**. That is why the
  code goes out first (section 7).

## 2. New problems found in this pass, all fixed

Every one was reproduced before it was fixed, except where the
Reproduction column says "code read".

| # | Problem | Reproduction | Fix | Proof |
|---|---|---|---|---|
| G1 | Staff accounts had blanket Data API powers: with `user_info.is_admin`, a staff member's own session could edit any profile, any place, approve claims directly, and every staff read policy ignored the permission matrix | authz matrix: 9 roles × 15 tables | migration `20260925110900`: owner-only update policies, staff reads keyed on `admin_has_permission(...)`, the `is_admin()` bypass removed from the guard triggers; legacy web `/admin` claims page and its actions deleted (Admin › Claims replaces it) | `authz-matrix.integration.test.ts` |
| G2 | A banned organizer's still-valid token could read their attendees' emails and phone numbers | `banned-window.integration.test.ts` | migration `20260925111000`: `get_event_attendee_contacts` refuses restricted accounts | same test; the whole banned-token window is classified there |
| G3 | 20 simultaneous code requests for one phone number sent 20 texts; the cooldown was per purpose; a 5-guess budget allowed 20 simultaneous guesses | `otp-send-limits.integration.test.ts` against the old code; the old verify store run directly | migration `20260925111200`: `phone_otp_claim_send` (one locked check-and-record before the provider: 1 per minute per number across purposes, 5/hour and 10/day per number, 10/hour per address) and `phone_otp_take_attempt` (one conditional UPDATE); the public action no longer accepts the Field Ops purpose | same test (5 cases) |
| G4 | Signed-out visitors could make the server geocode any text in `/explore/<text>` and `/events/location/<text>` with Google, unlimited | code read (not reproduced against Google: every request would have been a billed call) | migration `20260925111300` (`geocode_cache`) + `@abonten/services/geo/placeNameGeocode`: market cities without a call, 30-day cache of every answer, 20 lookups / 10 min per address, 300 / hour overall | `geocode-budget.integration.test.ts` |
| G5 | Every discovery function called `listing_market_visible()` once per row (a SECURITY DEFINER function Postgres cannot inline): 560 ms of `get_events_in_window`'s 870 ms on 100,000 events | EXPLAIN / timing on the perf catalogue | migration `20260925111100` rewrites the 11 functions to read `hidden_listing_countries()` once per query | `market-visibility.integration.test.ts` (7 functions, Ghana vs draft market); 873 → 363 ms |
| G6 | A spent, expired or inactive promo code answered 401, which the mobile app treats as a possibly dead session | load test | 409 in `getPromoCodeCore` | `load-gate.integration.test.ts` asserts no non-409 refusal |
| G7 | iOS photo and camera purpose strings described less than the app does (App Review 5.1.1) | code read | `apps/mobile/app.json` (needs a native build) | — |
| G8 | The performance seed no longer ran (listings need a market since 2026-09-24) | ran it | `scripts/perf/discovery-perf-seed.sql` | ran it |

## 3. Re-verification of the audit's claims

| Area | How | Result |
|---|---|---|
| Payments (stale page, basket change, double tap, two tabs, timeout then success, webhook duplicate / delayed / retried, cancelled order, sold-out race, totals, fee, earning, refund) | `payment-gate.integration.test.ts`, 10 cases, Paystack as a double | all pass |
| Paystack for real (test mode) | `paystack-sandbox.integration.test.ts` with the test key: charge, fulfil, book, refund the ticket price through Paystack's refund API, signed `refund.processed` webhook, idempotent second refund | pass |
| Door scanning | `checkin-gate.integration.test.ts`: 100 simultaneous scans from 5 devices, by code and by id, late reconnect, undo racing re-scans, another organizer's device | one admission per ticket, 3 runs; `main`'s code admitted 20 of 100 with the ticket guard off |
| Checkout under load | `load-gate.integration.test.ts`: 10 / 50 / 100 simultaneous buyers, 7 seats, a 5-use code | exactly 7 sold every wave, code never over-redeemed; p50 100 / 316 / 842 ms (laptop Docker) |
| Authorization matrix | 9 roles (signed out, customer, buyer, organizer, place owner, banned, field ops, analyst, admin, super admin) × 15 tables through the Data API | see G1 |
| International money | `international-checkout.integration.test.ts`: a whole XOF checkout | provider asked for 5250 (not 525000); transaction 5250, earning 5000, fee 250 XOF |
| Upload concurrency | the old temp-file path re-run with 50 simultaneous `image.jpg` uploads; the new in-memory path unit-tested the same way | old: 4 people's pictures published under someone else's listing, 46 failed; new: every upload its own bytes |

## 4. Deployment rehearsal (local stack)

| State | Code | Schema | Result |
|---|---|---|---|
| A | `main` | `main` (276 migrations) | 615 passed, 1 skipped |
| B | gate branch | `main` | 648 passed, 26 failed — every failure is a test of a new database protection that is not there yet; every user flow passed (payments, check-in, listing create/edit, promo codes, OTP) |
| C | gate branch | + the 11 audit/gate migrations, applied in order, each in one transaction (≈0.6 s each) | 675 passed, 1 skipped |
| D | same, after restarting every container | | 675 passed, 1 skipped |
| wrong order | `main` | new schema | 2 of `main`'s own tests fail: promo codes cannot be applied (`main` reads them with the buyer's session, 20260925110400 hides them) and a test fixture that re-admits a cancelled ticket; this is why the schema must not go first |

The three later migrations (`111100`–`111300`) were added after this
rehearsal; they were applied to the same database and then the whole
database was rebuilt from all migrations and the full suite rerun
(section 8).

## 5. Migration review

- **Order and dependencies**: `110000`–`111300` are independent of each other
  except `110900`, which redefines the guard triggers `110100`/`110200`
  create; they apply in filename order. `111100` rewrites whatever discovery
  functions exist, so it must run after `20260925100300` (it does, by name).
- **Transactions and locks**: no `CONCURRENTLY`, no explicit transaction
  control; each file runs in one transaction. The tables they touch are tiny
  in production (payment_attempt 99 rows, event 25, place 4, user_info 11);
  the `ACCESS EXCLUSIVE` locks from `ALTER TABLE … ADD CONSTRAINT` last
  milliseconds.
- **Data compatibility** (read-only against production): no duplicate open
  payment attempt per checkout (the four new unique indexes will build); no
  row over any new length limit; no party size out of range; no listing with
  an unknown currency or country; no ticket price finer than its currency;
  no stuck `processing` attempt; the one `is_admin` user is an active
  `admin_user`. 4 attempts have been open for over a day — harmless: the new
  code retires them when their checkout is next paid.
- **Rollback**: every migration is additive or replaces a function/policy
  in place; none drops data. Rolling back code alone is safe after the
  schema is applied **except** for promo codes (section 4, wrong order) — so
  if the code must be rolled back after the migrations, re-grant promo-code
  reads first:
  `create policy promo_code_select_active on public.promo_code for select to authenticated using (is_active);`
  (forward-recovery statement, not applied). To undo `111100`, re-running
  the rewrite in reverse is not needed: `listing_market_visible()` still
  exists and returns the same answers; restore any function from
  `20260925100300`.

## 6. Load and query plans

Laptop Docker, PostgREST pool of 10 connections, 100,000 events and 20,000
places near Accra (the perf catalogue — far denser than production's 25
events). **These are laptop numbers, not a production capacity figure.**

| Call | c=10 p50 / p95 | c=50 p50 / p95 | c=100 p50 / p95 |
|---|---|---|---|
| nearby events / places | 6 / 22 · 3 / 7 ms | 24 / 49 · 19 / 24 ms | 74 / 317 · 37 / 73 ms |
| event detail, reviews (3,000), credit summary, admin counts | ≤ 7 / 25 ms | ≤ 43 / 117 ms | ≤ 119 / 401 ms |
| events in a date window (after G5) | 461 / 642 ms | 1.9 / 5.7 s | pool exhausted, 23 of 400 timed out |
| filtered events with text | 595 / 714 ms | 1.9 / 6.5 s | 44 of 400 timed out |
| search events, common word | 4.2 / 4.7 s | pool exhausted | pool exhausted |
| search suggest | 1.5 / 1.7 s | 5.7 / 10 s | pool exhausted |

Read: point lookups scale fine. The text and window queries cost in
proportion to how many listings match: a word in 91% of 100,000 events
("accra") costs ~28 µs per matching event in `search_events`. Production
today has 21 published events, so none of this is visible; it becomes
visible around 10,000 matching listings. Recorded as a scaling item, not a
blocker (section 9).

## 7. Deployment sequence

1. Merge the branch to `main`; let Vercel deploy **web and admin** (the web
   deployment fixes event creation — section 1).
2. Smoke-test production web: create an event as an organizer; open
   `/explore/accra`; request a phone code once.
3. Apply the migrations in filename order with the Supabase MCP
   `apply_migration` (never `supabase db push` here), one at a time:
   `20260925110000` … `20260925110800`, `20260925110900`, `20260925111000`,
   `20260925111100`, `20260925111200`, `20260925111300`. Run the advisors
   after the last.
4. Repeat the smoke test, plus: apply a promo code at checkout; scan a
   ticket at the door; open Admin › Claims.
5. Mobile: nothing server-side changed its API shape. The iOS purpose
   strings ship with the next native build.

**Correction found while rolling out:** migrations `111200` and `111300`
were added after the rehearsal, and the new code *calls* `111200`'s
functions — so between the code going live and step 3, phone sign-in
would have failed (the code check answers "Something went wrong", and
verifying a code is refused). Both migrations only add things the old code
never touches, so they belong **before** the code, not after. The order
actually used is below.

### 7.1 Rollout record (2026-09-25)

| Time (UTC) | Step | Result |
|---|---|---|
| 17:21 | `main` ← `audit/production-gate-2026-09-25` (merge `8e0103c2`), pushed; Vercel builds web and admin | web `dpl_DTsfrHUpRwhCXQmBmfxSHu7GRfJi`, admin `dpl_AXd1LTEDr5XTxWt74Zss8RMriqmb`, both READY |
| during the web build | `gate_otp_send_claim` and `gate_geocode_cache` applied first (see the correction above) | success |
| after web READY | smoke test 1 with two throwaway accounts (created and deleted by the script) | 12/12: paid event with a promo code and a free event created (event creation works again); `/explore/accra` and an unknown place 200; promo code applied at checkout (GH₵1 → 0.90) then cancelled; free RSVP; two simultaneous scans admit once; one phone code sent to the owner's own verified number, the second request held by the cooldown; every test row removed |
| then | the remaining 12 migrations, one at a time, in filename order: `110000` … `110800`, `110900`, `111000`, `111100` | all succeeded; no discovery function still calls `listing_market_visible()` per row (11 rewritten); `authenticated` can no longer execute `create_event` |
| then | smoke test 2 | 11/11: as above plus the new event appears in signed-out discovery (nearby and date window), and a buyer can no longer list promo codes (0 rows; 1 before the migrations); every test row removed |
| then | Admin › Claims opened as the allowlisted admin (session minted in memory, signed out after) | HTTP 200, "Place Claims … No claims in this view" (production has no claim requests) |
| then | advisors | new objects only raise expected notices (`geocode_cache` has RLS with no policy — service only, like 101 others; `hidden_listing_countries` callable by clients, by design; new indexes not used yet). One real item: `throttle_place_analytics_event()` still had EXECUTE for clients → `20260925111400` revokes it (tested: inserts still fire the trigger) |

So the final count is **15 migrations**: `20260925110000`–`110800` (nine), `110900`, `111000`, `111100`, `111200`, `111300` and `111400`.

Production logs after the rollout show no errors except Resend refusing the
test accounts' `@example.com` addresses (no email sent). The ticket-PDF
step logs "Attempt to access memory outside buffer bounds" twice per free
RSVP; the PDF and email code did not change in this release, and the RSVP
succeeds — noted, not investigated here.

## 8. Final regression

- Database rebuilt from all 290 migrations (none failed, including the
  function rewrite in `111100`), then the full integration suite: **692
  passed, 1 skipped** (the Paystack sandbox suite, which needs a key; run
  separately with the test key, it passed).
- Unit: core 731, services 142. Typecheck: all 11 workspaces. API parity:
  222 routes. Docs check: pass. Web production build: no warnings.
- Web browser suite (Playwright, `next start` against the local stack):
  **45 passed, 1 skipped**. A first run failed 3 tests on a sitemap that
  listed a place an integration test had created and deleted — Next's
  persisted fetch cache (`.next/cache/fetch-cache`) survives rebuilds;
  cleared, rebuilt, all pass. A local test artefact, not a product fault.
- Android was not re-driven in this pass: no mobile code changed; the one
  behaviour a phone sees (a spent promo code answers 409) was tested at the
  service layer.

## 9. Remaining risks (not blockers)

- **Search and window queries scale with match count** (section 6). Fix
  before the catalogue reaches ~10,000 listings in one city: cap the
  candidate set before ranking.
- **Production has discovery fully on**, including the recommendation
  *email*, switched on by the founder's admin account on 2026-09-18, while
  legal items G1 and G3 are still Open. No recommendation has been sent (no
  upcoming events). Founder decision; not changed here.
- **Day boundaries assume UTC+0** in the organizer dashboard, transactions
  page and admin ranges (correct for Ghana). Must be fixed before a market
  in another time zone goes live.
- **Dependencies**: `npm audit` reports 16 moderate advisories from two
  roots, neither reachable: `decode-uri-component` (replaced in the mobile
  bundle by a Metro alias, checked in CI) and `uuid` < 11.1.1 inside
  `xcode` (a build-time tool that only calls `uuid.v4()`; the advisory is
  about v3/v5/v6 with a buffer).
- **iOS** (static review only, no device run): see
  [the iOS release-risk list](#10-ios-release-risk-list).
- The production smoke test after deployment is the only live
  verification; no live production payment was made in this pass.

## 10. iOS release-risk list

Static review of `apps/mobile` — nothing here was run on an iPhone.

| Risk | Why | Severity |
|---|---|---|
| Paid promotions and Spotlight campaigns bought through Paystack inside the iOS app | App Review 3.1.1: boosting your own content in the app is a digital purchase; Apple has required in-app purchase for "boosts" | High — product decision (hide on iOS, or IAP) |
| Google sign-in without Sign in with Apple | App Review 4.8 asks for an equivalent privacy-preserving login when a social login is offered; phone and email codes may or may not be accepted as that | High — decide before submission |
| iPad (`supportsTablet: true`) | iPad screenshots are required and every screen must work at iPad sizes; never tested | Medium |
| Privacy manifest | no app-level `ios.privacyManifests`; relies on each pod's own manifest | Medium — check the first TestFlight upload for ITMS-91053 |
| Push credentials | APNs key in EAS never verified end to end | Medium |
| Local native modules | `volume-observer` has an iOS implementation never built on a device; `system-gesture-exclusion` is Android-only and falls back to a plain View | Low |
| Permission strings | fixed in G7; take effect with the next native build | Low |
