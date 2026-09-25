---
title: Full-system adversarial audit — 2026-09-25
purpose: Record what a whole-system audit (security, money, data integrity, global platform, UX and accessibility) found on 2026-09-25, how each problem was reproduced, what was changed, how it was verified, and what still needs the founder or a deployment.
audience: Founder, engineering, future auditors
scope: apps/web, apps/admin, apps/mobile, packages/*, supabase/ (local stack), read-only checks against production project sderrexhawjbmsugndcq
status: Approved
version: 1.0
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Full-system adversarial audit — 2026-09-25

Branch `audit/full-system-2026-09-25` (from `main` 611c820e). The brief was an
exhaustive audit of every surface, testing as every kind of user and as an
attacker, with the new global platform (markets, currencies, providers,
phones, time) called out explicitly. This report is written for a reader who
was not in the session. Every finding below was **reproduced** before it was
fixed (a failing test, a probe against the local stack, or a screen), unless
it says otherwise.

## 1. How the system was exercised

| Surface | How | What was covered |
|---|---|---|
| Database (local Supabase stack, all 288 migrations) | SQL sweeps of RLS, policies, grants, SECURITY DEFINER functions, triggers, constraints; probes as signed-in users through the Data API | every client-writable table, every client-callable definer function, storage policies |
| Services | 3 new integration suites + additions to 2, full integration suite 615 → 657 tests (all passing, 1 skipped without a Paystack key; the Paystack sandbox suite was also run with the test key and passed), unit suites (core 731, services 140) | payments, payouts, check-in, listings, bookings, promo codes, OTP routing |
| Real payment provider | Paystack **test** API: the existing sandbox suite, plus a real popup purchase driven in the browser | GH purchase → tickets → ledger → fee |
| Web app | `next dev` against the local stack, Playwright MCP driving a signed-in buyer and organizer; axe-core WCAG 2 A/AA on 11 pages; full e2e suite on a local production build (45 passed) | discovery, event page, checkout, basket, Paystack popup, transactions, my tickets, rewards, search, help, messages, settings |
| Admin console | `next dev` against the local stack as a **super admin** and a read-only **analyst** | RBAC on Finance / Markets / Settings / Users / Audit, a hostile provider edit, axe on 4 pages |
| Android app | debug build on the `abonten_a35` emulator against the local stack | location denied → allowed, email-code sign-in, notification prompt, transactions list/detail, event detail, cross-surface consistency with a purchase made on the web |
| Production (read-only) | MCP SQL: pre-checks that every new constraint/index holds on live data; advisors | no writes were made to production |

Personas actually used: signed-out visitor, new buyer, returning buyer with
tickets, organizer, place owner, place customer, stranger/attacker account,
restricted (suspended/banned) account, super admin, analyst (view-only
admin), provider-config attacker with `markets.manage`.

## 2. Findings and fixes

Severity: **H** high (money, other people's data, or a way around a paid
feature), **M** medium, **L** low. All are fixed on the branch.

### 2.1 Money and payments

| # | Sev | Problem (reproduced) | Root cause | Fix |
|---|---|---|---|---|
| 1 | H | Paying for checkout A, then A+B together, handed back the Paystack page opened for **A alone** (GH₵52.50 instead of GH₵105) — test failed `5250 ≠ 10500`. | An open attempt was reused on "same method" without comparing the amount, and the group's primary was whichever row came first. | An attempt is bound to the charge it started (`charge_minor` in metadata); a changed charge retires the attempt (cancelled, reference kept) and a fresh one starts; only the group's primary may carry a live reference. |
| 2 | H | A stale tab paid **after** the combined order succeeded was acknowledged and **kept** (no refund). | A non-primary member kept its old live reference; `finalizePayment` answered "succeeded" for it. | #1, plus: a succeeded attempt whose reference is not its transaction's is treated as a second charge and refunded (orphan capture). |
| 3 | H | A double-tapped **Pay** opened **three** provider checkouts for one order. | Read-then-insert with no uniqueness. | Partial unique indexes: one open attempt per checkout (tickets, both promotion kinds, Spotlight campaigns); the attempt is **claimed** (reference written) before the provider is called; a reference is never overwritten. |
| 4 | M | Retrying payment could cancel an attempt that the finalizer was confirming. | The upsert cancelled any open attempt, including `processing`. | A `processing` attempt is never cancelled; the buyer is told to wait. |
| 5 | M | An organizer could request a payout of an NGN balance to a **GHS** payout account; amounts finer than the currency (10.005 GHS) were accepted; a restricted account could still request one with a live token. | `request_organizer_payout` / `admin_create_payout` never compared the account's currency or precision or status. | Both refuse a currency mismatch, sub-minor amounts and restricted accounts; web and app withdraw screens list only accounts in the balance's currency. |
| 6 | M | The basket's summary could disagree with the charge by a pesewa and ignored exclusive tax. | Fee computed client-side on the combined total, fixed 2 decimals. | The basket shows the server's own preparation (per-checkout fee, tax line); `computeCheckoutFee` rounds to the order currency. |
| 7 | L | A mixed-country basket failed with "Something went wrong". | `MixedMarketCheckoutError` surfaced as 500. | 409 with "pay for them separately". |

Verified end to end on the web against Paystack's test API: 2 tickets,
GH₵105, transaction `105.000 GHS`, organizer earning `100.000`, attempt bound
to 10500 minor units. The Paystack sandbox suite still passes.

### 2.2 Authorization and data isolation (Data API / RLS)

| # | Sev | Problem (probed as a signed-in user) | Fix |
|---|---|---|---|
| 8 | H | An organizer could set `event.featured = true` directly — the Featured banner without paying for a promotion. | `guard_listing_market_columns` trigger: `featured`, `currency`, `country_code`, `timezone`, `published_at`, `archived_at`, `client_request_id` are the service's. |
| 9 | H | `create_event` / `create_place` ran as the caller, were executable by every signed-in account (and anon), and took owner, country, zone, currency and `featured` as parameters — skipping every service check. | Service-role only; `postEventCore` / `postPlaceCore` call them as the server after checking the account is not restricted. Direct client INSERT into `event`/`place` refused. |
| 10 | H | Any account could INSERT an `attending` attendance row for **any event** with any size — rows count against capacity, so one account could sell out someone else's event. | Client INSERT revoked; clients may only mark their row cancelled. |
| 11 | H | An organizer could move a buyer's paid ticket to another account, change its expiry, detach it from its transaction, or revive a cancelled one. | Clients may only move a ticket `active ↔ used` (check-in / undo). |
| 12 | H | Every signed-in account could list **every promo code on every event** (`USING true`), around the per-user guessing limit. | Readable by the event's organizer and staff; buyer lookups go through the service after the rate limit. |
| 13 | H | `markets.manage` could point a provider's **public key** variable at `SUPABASE_SERVICE_ROLE_KEY` (sent to every buyer at checkout) or at another market's secret; the audit log recorded neither name. Reproduced in the console. | Per-provider, per-field variable families, suffixed for the market; enforced on save and again whenever an account is built; names recorded in the audit entry. |
| 14 | M | The exchange-rate app-id variable could name any secret (sent to Open Exchange Rates) and the scheduler URL any host (it posts the job token). | Variable must be `OPEN_EXCHANGE_RATES_APP_ID[_X]`; URL must be this app's `https …/api/jobs/exchange-rates`. |
| 15 | M | `issue_free_ticket` was executable by any account and trusted the caller's ticket code, QR and expiry. | Service-role only. |
| 16 | M | Payout accounts could be written directly, skipping the market's rail rules (a Ghana wallet filed as NGN). | Client writes revoked; the service writes them. |
| 17 | M | A customer could create or move their own booking to `accepted`; either party could rewrite its time or size. | Clients make only the service's transitions. |
| 18 | M | A place owner could review their own place from the app (the web refused it). | DB trigger refuses it for every client. |
| 19 | M | A Server Action POSTed to a **public** page skipped the suspended/banned check (the middleware checked private sections only). | Every Server Action request is checked (403 JSON when restricted). |
| 20 | L | A participant could delete the other person's message attachments. | Only your own uploads. |
| 21 | L | 77 paths returned raw Postgres errors ("violates row-level security policy for table …") to people. | `userFacingError`: logged with context; people see the database's own sentence only when an Abonten function raised it for them. |

### 2.3 Abuse and cost

| # | Sev | Problem | Fix |
|---|---|---|---|
| 22 | M | `resolveListingMarket` answered signed-out callers with no limit; each new point can be a billed Google call. `/api/mobile/markets/context` resolved any point for signed-out apps. | Signed-in + 60/min per account; the context route rate-limits point lookups per account/address and falls back to the request country. |
| 23 | M | OTP: no per-country ceiling (SMS pumping), and codes were sent for markets still being set up (Twilio is configured). | Hourly ceiling per country (5,000 default market, 300 elsewhere; logged as an error when tripped); no codes for draft/preparing markets. |
| 24 | L | `place_analytics_event` took unlimited anonymous inserts with a client-chosen timestamp. | Server timestamp; at most 60 rows per place per event type per minute. |
| 25 | L | Owner-written text had no database length bound. | Limits on titles, names, links, phone fields, booking notes, party size. |

### 2.4 Global platform (the "new global support" pass)

Besides #1–#6, #13, #14, #22, #23:

- **Money shown with a code glued to a number** on ~30 web and app screens
  ("From GHS 50", `toFixed(2)`) — wrong for XOF/JPY (0 decimals) and KWD (3).
  All go through `formatMoney` now.
- **OTP and home market for shared calling codes**: +44 7911 … is Guernsey
  and +1 876 … Jamaica to libphonenumber; with no market of their own those
  numbers would be refused even after a UK or US market opens. One
  `marketForPhone` rule (main country of the calling code) now decides OTP
  routing and the home market. Tested.
- Checked and **holding**: a paused/draft market sells nothing and hides its
  listings; card tokens only charge on the account that issued them; a
  foreign wallet is refused; per-currency admin reports; the analyst role
  sees Markets read-only (activate/pause disabled with the reason).

### 2.5 Integrity at the door and in the app

| # | Sev | Problem | Fix |
|---|---|---|---|
| 26 | H | Two doors scanning the same QR at the same moment **both admitted** it (4 concurrent scans → 4 admissions before the fix). | Conditional update from the status read; a multi-date ticket is refused on another date. |
| 27 | H | Two uploads with the same file name ("image.jpg") at the same moment could swap content between people: flyers/place covers/QRs went through `os.tmpdir()/<client file name>`. | Upload from memory; the bytes (not the browser MIME type) decide it is an image. |
| 28 | H | An event whose address has no full-address line **crashed the whole event page**; every view also paid for a Google geocode although the row has exact coordinates. | Stored coordinates; `geocodeAddress` never throws. |

### 2.6 UX and accessibility

- axe (WCAG 2 A/AA): the success colour (3.9:1 with white, 3.4:1 on its tint)
  → 29% lightness (5.6:1 / 4.9:1); quantity steppers, the checkout close
  button, the remove-line button and the header profile link had no names;
  the transactions list put links in a `<ul>`; the Weekly skeleton labelled a
  bare div. All pages listed in §1 now report no violations.
- Basket: duplicate "Order Summary" heading, zero discounts shown, "Your ticket
  is ready" for two tickets. Bare `/explore` and `/events` were a dead end
  ("Unknown Location / No address set").
- App: long transaction values (order reference) ran past the card.

## 3. Database changes (all on the branch, **not yet applied to production**)

| Migration | What |
|---|---|
| `20260925110000_audit_payment_integrity` | one open attempt per checkout (4 partial unique indexes); payout currency/precision/restriction checks; `issue_free_ticket` service-only |
| `20260925110100_audit_listing_column_guards` | `guard_listing_market_columns` (event, place); ticket price precision; `create_event` / `create_place` service-only |
| `20260925110200_audit_attendance_ticket_payout_account_writes` | attendance INSERT revoked + update guard; ticket update guard; payout_account client writes revoked |
| `20260925110300_audit_place_booking_transitions` | booking transition guard |
| `20260925110400_audit_promo_code_and_attachment_visibility` | promo_code SELECT to organizer/staff; attachment delete = own uploads |
| `20260925110500_audit_otp_send_log_created_index` | index for the OTP ceiling count |
| `20260925110600_audit_place_analytics_throttle` | analytics throttle + server timestamp |
| `20260925110700_audit_text_length_limits` | length/range checks (validated against production data first) |
| `20260925110800_audit_place_review_not_own_place` | self-review guard |

Every constraint and index was checked against production data (read-only)
before being written: zero violations.

**Rollout order matters.** The new code works on the old schema, but the old
code does not work on the new schema (it writes `timezone`/`country_code`
and payout accounts with the user's session, and calls `create_event`,
`issue_free_ticket` and `promo_code` as the user). So: **deploy web and
admin first, verify, then apply the nine migrations**, then re-check the
advisors. Mobile builds need nothing new from the database; the app's own
code changes (money formatting, withdraw filter, transaction rows) reach
phones with the next build/OTA.

## 4. Tests added

- `payment-attempt-reuse` — changed basket, stale tab refunded, double-tap →
  one charge (verified to fail without the index: 3 charges).
- `payout-integrity` — payout currency, precision, restricted account,
  `issue_free_ticket` refused, concurrent door check-in admits once.
- `listing-guards` — 25 cases: listing columns, direct inserts, attendance,
  ticket, payout account, booking transitions, promo visibility, analytics
  throttle, place self-review, create/edit through the service path.
- `otp-routing` — preparing market, ready market, country ceiling, shared
  calling code.
- `function-grants` — `create_event`, `create_place`, `issue_free_ticket`
  refused for clients.
- Unit: provider variable names, `userFacingError`, currency-aware fee,
  check-in race and date rules.

## 5. What was not done, and why

- **Production**: no migration was applied and nothing was deployed; see §3
  for the order. A live Ghana purchase and refund on the new build is still
  owed (it was owed before this audit too).
- **iOS**: not run (no Mac/simulator here). Android was exercised on the
  emulator only, with a debug build.
- **Other markets' providers** (Paystack NG/KE/ZA/CI, Stripe): no keys exist,
  so those adapters were exercised only by unit tests and stubs.
- **Scale**: reasoned about (indexes checked for every new count query), not
  load-tested.
- **Banned accounts and direct Data API writes**: a revoked session's access
  token stays valid for up to an hour. Tables with the
  `guard_restricted_account` trigger refuse writes in that window; tables
  without it (and `request_organizer_payout`, now checked) were reviewed —
  a DB-level session check on every table was judged too costly for a
  one-hour window already bounded by session revocation.
- **Dependencies**: `npm audit --omit=dev` reports 16 moderate advisories, all
  from two roots already assessed on 2026-09-19 (`decode-uri-component`,
  aliased in Metro; `uuid` < 11.1.1 in Expo build tooling, v3/v5/v6 with a
  buffer argument — not used at runtime).
- The emulator was left on the local debug build (the release build that
  was installed was uninstalled to install it).
