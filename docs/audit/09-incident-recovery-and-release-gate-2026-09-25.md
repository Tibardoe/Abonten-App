---
title: Incident recovery and final release gate — 2026-09-25
purpose: Record the event-creation and organizer-dashboard incidents of 2026-09-25 (cause, timeline, impact, fix, verification), the problems fixed during the final release gate, what was and was not verified, and the exact production runbook.
audience: Founder, engineering, whoever deploys or is on call
scope: production project sderrexhawjbmsugndcq and Vercel projects abonten / abonten-app-admin (read-only evidence plus throwaway-account smoke tests), apps/web, apps/admin, apps/mobile, packages/*, supabase/migrations (local stack)
status: Approved
version: 1.0
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Incident recovery and final release gate — 2026-09-25

Follows [08-production-gate-2026-09-25](08-production-gate-2026-09-25.md).
Branch `gate/final-release-2026-09-25` (from `main` 23e13a5d). Wording in
this report is deliberate: **production** means checked against the live
system, **local** means the Docker stack replayed from the migrations,
**simulated** means a provider was replaced by a test double, **test mode**
means Paystack's test environment.

## 1. Production incident: organizers could not create events

### Cause

`create_event` is SECURITY INVOKER: it runs with the rights of whoever
calls it, and the apps called it with the organizer's own session. The
global-platform migration `global_markets_domain_columns` (production
**06:15:57 UTC**) made it read the `market` and `currency` tables, which
only the service role may read. Every call from an organizer failed.

The failing table depends on which code called it (reproduced on the local
stack by replaying the migrations in production order and calling the
function exactly as each deployed version did):

| Code calling it | Schema | Result |
|---|---|---|
| `main` of 2026-09-23 (deployed until 06:39) | before 06:15:57 | event created |
| `main` of 2026-09-23 | after `global_markets_domain_columns` | `permission denied for table market` |
| global-platform code (deployed 06:39:33) | same | `permission denied for table currency` |
| gate code (deployed 17:24:52), service role | same, and after every later migration | event created |

### Timeline (UTC, 2026-09-25 unless stated)

| When | What | Evidence |
|---|---|---|
| 22 Sep 19:55–20:00 | last three events created (HTTP 200) | Supabase API gateway log, `event.created_at` |
| 22 Sep 21:44 | `event_capacity_and_free_event_promo_guards` applied | migration ledger; replay shows creation still worked after it |
| 06:13:37 | `global_markets_foundation` applied | migration ledger |
| **06:15:57** | `global_markets_domain_columns` applied — **creation broken from here** | migration ledger; local replay |
| 06:39:33 | global-platform web code live (`c1c898ce`) | Vercel deployment `dpl_GHKPB…` ready time |
| 08:51:08 | `global_markets_per_currency_reports` applied — **organizer dashboard broken from here** (section 2) | migration ledger |
| **17:24:52** | gate code live (`8e0103c2`): `create_event` called with the service role — **creation restored** | Vercel `dpl_DTsfr…` ready time; production smoke tests at 17:26 and 17:31 created events |
| 17:28:15 | `audit_listing_column_guards`: clients can no longer execute `create_event` at all | migration ledger |

**Was it broken before today (the 22–25 September gap)?** No evidence of
it, and positive evidence against: the 22 September schema (including the
capacity migration applied after the last event) creates events for an
organizer session on the local replay, and the API gateway log for
22 Sep 12:00 → 25 Sep 18:00 shows **no call to `create_event` at all**
between the last event and our smoke test — no organizer tried. No event
drafts were saved in that period either, and the only account sign-in after
06:15 today was the gate's own admin session. The gap is inactivity, not an
outage.

### Impact

- **Affected**: event creation from the web app and the mobile app
  (the mobile app calls the same web API), 06:15:57 → 17:24:52 UTC
  (11 h 9 min).
- **People affected**: none observed. The database log for the day holds
  no "permission denied for table currency/market" from any real request
  (only the gate's own deliberate probes), and the API gateway shows no
  `create_event` call in the window.
- **Data and money**: none affected — no partial writes (the function is
  one transaction), no payments involved.

### Fix and verification

The service now calls `create_event` with the service role after resolving
the organizer, the market and the prices itself (`postEventCore`), and the
function is no longer executable by clients. The `market` and `currency`
tables stay service-only; organizers gained no database access.

- Local: `event-creation-recovery.integration.test.ts` — paid and free
  events (owner, market, currency, zone, status, tiers, promo codes, a
  client-sent currency ignored), draft → publish, edit, another organizer's
  edit refused, venue in a market that is not live or without a market,
  unknown currency refused by the database, restricted organizer refused
  (create and edit — edit now answers 403, it used to answer a generic
  500), a double-tapped Publish (8 simultaneous submissions → one event),
  8 parallel submissions → 8 events, a failed creation leaves nothing and
  its retry creates it once.
- Production: events created through the live API at 17:26, 17:31 and
  in the release check (section 4), then removed.

## 2. Second incident found: the organizer dashboard

The production release check's dashboard call answered 500:
`permission denied for table market`. `get_organizer_dashboard` →
`get_organizer_sales_timeline` → `default_market_currency()`, an INVOKER
helper reading the service-only `market` table, added by
`global_markets_per_currency_reports` (**08:51:08 UTC**). A scan of every
client-callable function for the same pattern (INVOKER, reads a service-only
table directly or through another function) found only this path in use by
the apps.

- **Fix**: `20260925111500` makes the three `default_market_*` helpers run
  as their owner (each answers one public fact). **Applied to production
  18:27:26 UTC**; the dashboard answered 200 in the next production check.
- **Window**: 08:51:08 → 18:27:26 UTC (9 h 36 min). **People affected**:
  none observed — the only dashboard call in the window was the gate's own.
- **Guard**: `session-rpc-reachability.integration.test.ts` calls the
  dashboard, sales timeline and event performance for every period as an
  organizer, and the helpers as a signed-in person and a visitor.

## 3. Fixes made during this gate

| # | Root cause | Change | Test | Result |
|---|---|---|---|---|
| F1 | Dashboard helpers INVOKER on a service-only table | `20260925111500` (applied) | session-rpc-reachability | pass (local), dashboard 200 (production) |
| F2 | Restricted organizer's edit answered 500 | `updateEventCore` checks restriction → 403 | event-creation-recovery | pass |
| F3 | Admin could not see an event's market; start time shown in server UTC without a zone | Admin › Events detail shows "Ghana (GH) · GHS" and the start in the event's zone | typecheck + admin build; production smoke "event detail shows … Ghana" | pass (production, after the 20:15 UTC deploy) |
| F4 | Any account could insert unlimited, unformatted push tokens; each push fanned out to all of them | `20260925111600`: Expo format, keep ten newest; sender reads ten | banned-window (added cases) | pass |
| F5 | A word in every listing made each search branch rank every match (2.6 s) | `20260925111700`: each ranking branch scores at most `greatest(p_limit, 1500)` matches, after all filters | results identical below the cap (6 query shapes compared); perf harness budget | 2.6 s → 115 ms; pass |
| F6 | Four calendars count UTC days | readiness `utc_calendar` check blocks activating a non-UTC+0 market | market.test.ts | pass |
| F8 | `place_is_open_now` (granted to visitors, SECURITY INVOKER) called `default_market_timezone()`, which visitors may not execute; Postgres checks that when it prepares the expression, so every signed-out call failed although the fallback never answers (`place.timezone` is NOT NULL) | `20260925111800`: dead fallback removed, grants unchanged | session-rpc-reachability now creates its own place (the old test skipped when none existed); reproduced against the old body ("permission denied for function default_market_timezone"), passes after | pass (local). Latent in production: its in-database callers are SECURITY DEFINER, no app calls it directly, 0 direct calls in 24 h of API logs |
| F7 | A replaced or abandoned image was destroyed outright; its id is client-sent, so one organizer could delete another's image | `destroyAssetIfUnused` at all eight destroy sites (listing, draft, gallery photo, event deletion) | asset-ownership (reproduced first) | pass |

Also new: `staff-access-regression.integration.test.ts` (every role in the
live matrix, with its own session, changes nothing — profiles, places,
events, claims, tickets, transactions, ledger, market and fee config, admin
records — and reads no admin or market table) and an XOF refund and
precision check in `international-checkout.integration.test.ts`.

## 4. Verified

**Production** (throwaway accounts created and deleted by the scripts; no
payment made; every test row removed and checked):

- Organizer: create paid event (with promo code), create free event, save a
  draft and publish it, edit, dashboard (after F1), add a payout account.
- Customer: event in signed-out discovery, event page with ticket price,
  reserve with promo code (no payment) and cancel, free registration.
- Admin: event found in Admin › Events; detail shows organizer, money,
  status (market row added by F3, deployed with this branch); Admin › Claims
  renders.
- Security probes through the Data API: an organizer cannot change their
  event's currency, country, zone or `featured`, cannot raise ticket
  quantity past capacity, cannot move a buyer's ticket, cannot restore a
  cancelled ticket; nobody can insert attendance; a buyer cannot list promo
  codes; `create_event` / `create_place` refused; payout accounts cannot be
  written directly; a banned organizer's token cannot read attendee
  contacts and is refused by the mobile API; no secret key value appears in
  the home page's 42 browser scripts.
- Android (emulator, debug build on current JavaScript, against the
  production API): cold launch, email-code sign-in, location permission
  (revoked → "Location off"; granted → "Near you"), discovery, event
  detail, ticket options and totals (GH₵1.00 + GH₵0.05), free registration
  → ticket Active, every tab, Spotlight, offline ("You're offline — showing
  saved data" with cached lists), reconnect, restart with the session kept.
  No errors in Metro or logcat.

**Local** (Docker stack replayed from all migrations): full integration
suite, unit suites, typecheck, API parity, docs check, web production build,
browser suite, perf harness — counts in section 8.

**Paystack test mode**: purchase, fulfilment, booking, partial refund
through Paystack's refund API, signed `refund.processed` webhook, idempotent
second refund (`paystack-sandbox.integration.test.ts`).

## 5. Not verified

- **iOS**: no device or simulator run. See the checklist in section 9.
- **Real Cloudinary under concurrency**: the in-memory upload path was
  tested with Cloudinary simulated (50 simultaneous uploads); the real
  service was not load-tested.
- **A live production payment or refund**: none made; payment mechanics
  are covered in Paystack test mode and simulated failure cases.
- **Production-scale load**: all load figures are from a laptop Docker
  stack with a synthetic catalogue.
- **Paystack webhook redelivery from Paystack's own dashboard**: duplicate
  and delayed deliveries were tested with signed synthetic webhooks, not by
  replaying from Paystack.

## 6. Blocking issues

- **Production takes Paystack TEST payments only** — blocking for selling
  real tickets. Evidence: the three most recent production transactions
  verify as `domain: "test"` with the test secret key, and production
  accepted (signature-verified) Paystack test-environment webhooks from the
  local sandbox runs at 10:02, 11:04 and 15:22 UTC today — its webhook
  secret is the test key. While this holds, anyone can "pay" with
  Paystack's public test cards and receive real tickets, and organizers are
  credited earnings that were never collected. There are no upcoming paid
  events today, so nothing is exposed yet. Fix (founder, not code): set the
  live `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` and
  webhook secret in Vercel production and `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`
  in the EAS production environment, point the live dashboard's webhook at
  `/api/paystack/webhook`, and keep the test dashboard's webhook off
  production.
- **Web and admin code**: none, once this branch is deployed (runbook below).
- **iOS App Store submission** (not a web blocker):
  1. **Paid promotions and Spotlight boosts are sold through Paystack in the
     app.** App Review Guideline 3.1.3(g): "Digital purchases for content
     that is experienced or consumed in an app, including buying
     advertisements to display in the same app (such as sales of "boosts"
     for posts in a social media app) must use in-app purchase." Event and
     place featuring and promoted Spotlights are exactly that, and
     production has `spotlight_promotions_enabled = true`. Tickets are not
     affected (3.1.3(e): services consumed outside the app).
  2. **Google sign-in without an equivalent login that keeps email
     private.** Guideline 4.8 requires, when Google Sign-In sets up the
     primary account, another option that limits data to name and email,
     lets the person keep their email private and does not track for ads.
     The app's email code needs the real address; the phone code collects a
     phone number. None of the exceptions applies (the app does not use
     *only* its own sign-in). Options: add Sign in with Apple (a native
     module and an Apple key — needs a native build), or not offer Google
     on iOS (existing Google accounts can still sign in with an email code
     to the same address).

## 7. Known risks (not blocking)

- **Production switches differ from the "ships off" defaults** in the
  docs, set by the founder's admin account: discovery search,
  recommendations (shadow off) and the recommendation **email** are on for
  everyone; Spotlight and Stories are on for everyone, including paid
  promotions. Recommendation email: nobody has opted in (0 preference rows,
  0 consent records, 0 emails ever), sending needs an explicit opt-in, and
  every email carries a signed unsubscribe link and a one-click header —
  but legal items G1 and G3 are still Open, and no kill switch
  (`RECOMMENDATION_EMAIL_KILL_SWITCH`) is set on Vercel. Founder's call;
  not changed.
- **Vercel variables marked "readable-secret"** by Vercel:
  `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` are stored as readable rather than *sensitive*.
- **The date-window feed** (`get_events_in_window`) still evaluates every
  listing in the radius: 363 ms at 100,000 events near one point (local).
- **An event ending just after midnight** shows "+1 more" on cards
  (counted as two days) — current design, noted.
- **Test content in production**: Big_Ceo's Spotlight "Test" post carries
  a third-party watermark.
- **Ticket email PDF step** logs "Attempt to access memory outside buffer
  bounds" twice per free registration (image parsing in the PDF library;
  code unchanged in this release; registration succeeds).
- The advisors' remaining findings (unused indexes, `rls_enabled_no_policy`
  on service-only tables, Postgres minor version, leaked-password
  protection) are pre-existing and unchanged.

## 8. Final test results

Recorded in section 8 of the changelog entry for this report and below.

All local, against the Docker stack replayed from every migration
(including `20260925111600`–`111800`), on the final commit of this branch.

| Suite | Command | Result |
|---|---|---|
| Database / RLS / services integration | `npm run test:integration` | 85 files: 84 passed, 1 skipped; 714 tests passed, 1 skipped, 0 failed |
| Core unit | `npx vitest run` in `packages/core` | 82 files, 733 passed |
| Services unit | `npx vitest run` in `packages/services` | 18 files, 142 passed |
| Typecheck | `npm run typecheck` | 11/11 workspaces |
| Mobile API parity | `npm run check:api-parity` | 222 route handlers, all reachable |
| Docs | `npm run check:docs` | OK |
| Web production build | `next build` in `apps/web` | exit 0, no warnings |
| Admin production build | `next build` in `apps/admin` | exit 0 |
| Browser suite | `npx playwright test` in `apps/web` (against `next start`) | 45 passed, 1 skipped |
| Search performance | `scripts/perf` harness, 100,000 events | broad cases p95 34.2 / 113.5 / 69.0 / 26.3 ms; 500 ms budget met |

Earlier runs of the full integration suite during this gate failed twice and
each failure was fixed at its cause, not retried away: the admin analytics
complement bucket (one small bucket left hidden, `smallSample.ts`) and F8.
One run also timed out in `content-comments-realtime` (no realtime message
within 20 s under full-suite load); the file passed on its own twice and in
the final full run. It is recorded as a timing flake, not a pass.

Not run: the Paystack sandbox suite (its test-mode webhooks post into
production while production uses test keys — section 6), mobile on iOS, and
any production load test.

## 9. iOS release checklist (static review only)

| Item | Evidence | Status |
|---|---|---|
| 3.1.3(g) boosts sold via Paystack | `promote.tsx` (event, place), `spotlight/promote/[postId].tsx`; production `spotlight_promotions_enabled = true` | **Blocking** — hide on iOS or use in-app purchase |
| 3.1.3(e) tickets via Paystack | tickets are for events attended in person | OK |
| 4.8 Login services | `app/(auth)/sign-in.tsx`: Google, email code, phone code | **Blocking** — add Sign in with Apple or drop Google on iOS |
| 5.1.1 purpose strings | photos and camera strings now name every use (`app.json`, commit 0e5717fd) | Fixed — ships with the next native build |
| iPad (`supportsTablet: true`) | never tested | Risk — iPad screenshots and layouts |
| Privacy manifest | relies on each pod's manifest | Check the first TestFlight upload for ITMS-91053 |
| Push | APNs key in EAS never verified end to end | Risk |
| Local native modules | `volume-observer` iOS code never built on a device; `system-gesture-exclusion` Android-only with a plain-View fallback | Risk (low) |
| Account deletion in app (5.1.1(v)) | exists | OK |

## 10. Production runbook

Current state (step 1) is described first; each later step lists the
action, what to expect, what counts as failure and how to recover.

**Step 1 — Production state before this release.** Code `23e13a5d`
(`8e0103c2` + docs); all migrations through `20260925111500` applied;
`20260925111600` (push tokens), `20260925111700` (search cap) and
`20260925111800` (visitor open-now check) not yet.
Event creation and the dashboard work. (Steps 2–10 were carried out on
2026-09-25 — see section 12.)

**Step 2 — Deploy application code.** Merge `gate/final-release-2026-09-25`
into `main` (`--no-ff`) and push; Vercel builds `abonten` and
`abonten-app-admin`. *Expect*: both deployments READY. *Failure*: a build
error or a deployment not READY. *Recovery*: Vercel "Instant Rollback" to
`dpl_J9aMEsFsJkhZZcNTgHo3CDXcytbJ` (web) / the previous admin deployment;
the schema needs nothing.

**Step 3 — Verify event creation.** Run `node scripts/release/production-smoke.mjs apps/web/.env.local` (creates
and deletes throwaway accounts): organizer creates a paid and a free event
through `/api/mobile/events`. *Expect*: HTTP 200 with an `eventId`; row with
`GH`/`GHS`/`Africa/Accra`, status `published`. *Failure*: any 500, or a
`permission denied` line in the Supabase Postgres log. *Recovery*: roll back
the deployment (step 2); the previous code also creates events.

**Step 4 — Organizer / customer / admin smoke.** Same script: draft →
publish, edit, dashboard, payout account; discovery, event page, promo
reservation and cancel, free registration; Admin › Events and Claims.
*Expect*: all pass, every test row removed. *Failure*: any step fails.
*Recovery*: roll back the deployment; investigate before retrying.

**Step 5 — Apply migrations** with the Supabase MCP `apply_migration`, one
at a time (never `supabase db push`): `20260925111600_gate_device_token_cap`,
then `20260925111700_gate_search_ranking_cap`, then
`20260925111800_gate_place_open_now_visitor`. All three are compatible with
the old and the new code. *Expect*: success. *Failure*: an error (the file runs
in one transaction, so nothing is left half-applied). *Recovery*: for
111600, `drop trigger device_token_keep_recent on public.device_token;
alter table public.device_token drop constraint device_token_expo_format;`;
for 111700, re-create `_search_event_pool` / `_search_place_pool` from
`20260925100300` and then re-run the rewrite block of `20260925111100`
(which changes their market filter in place — the definitions in `100300`
alone are older than production's); the result must fingerprint as
`md5(pg_get_functiondef(...))` = `a6d2d660…` / `a4444796…`; for 111800, re-create
`place_is_open_now` from `20260925100400` (visitors are refused again, as
before).

**Step 6 — Supabase advisors** (security and performance). *Expect*: no new
finding beyond the pre-existing ones in section 7. *Failure*: a new
client-executable SECURITY DEFINER function or a table without RLS.
*Recovery*: revoke or fix in a follow-up migration.

**Step 7 — Post-migration verification.** Rerun the release check; time
`search_events('accra')` from the SQL editor (a few ms at today's size);
insert a malformed push token through the Data API as a test user
(refused); call `place_is_open_now` signed out (a boolean, no permission
error). *Expect*: all pass. *Failure*: search errors or registration
failures from the apps. *Recovery*: the rollback statements in step 5.

**Step 8 — Payments and webhooks.** No live charge. Check in the Paystack
dashboard that recent webhook deliveries to `/api/paystack/webhook` are 200,
and in the database that `payment_webhook_event` has no rows stuck in an
error state and no `payment_attempt` in `processing` for over an hour.
*Failure*: webhook 4xx/5xx or stuck attempts. *Recovery*: Paystack
retries; resend from the Paystack dashboard once fixed.

**Step 9 — Security boundaries.** The release check's security section
(currency/country/zone/featured writes, capacity, ticket reassignment and
revival, attendance, promo enumeration, direct create functions, payout
accounts, banned-token PII, secrets in scripts). *Expect*: all refused.
*Failure*: any allowed. *Recovery*: treat as an incident; roll back code or
re-apply the guard migration concerned.

**Step 10 — Monitor** for the first hours: Vercel runtime errors per
deployment; the Supabase Postgres log filtered on `permission denied`
(anything other than a deliberate probe means a client path hits a
service-only table); Admin › Monitoring health checks; Sentry for
`abonten-web` / `abonten-admin`; `notification_delivery` failures.

## 11. Post-deployment monitoring

- Postgres log: `permission denied for table` / `for function` — the
  signature of both incidents.
- Vercel: 5xx on `/api/mobile/events`, `/api/mobile/organizer/*`,
  Server Actions of the organizer pages.
- Supabase API gateway: status of `/rest/v1/rpc/create_event`,
  `get_organizer_dashboard`, `search_*`.
- Paystack: webhook delivery status; `payment_orphan_capture` rows.
- Push: `device_token` count per account (≤ 10) and Expo receipt errors.

## 12. Deployment record (2026-09-25, UTC)

| Time | Step | Result |
|---|---|---|
| 20:08 | `gate/final-release-2026-09-25` merged into `main` (`be928ad7`) and pushed | — |
| 20:12 | Vercel `abonten-app-admin` `dpl_3hagGFG4pwpgqyThYNn9o5i5MZYd` | READY |
| 20:15 | Vercel `abonten` `dpl_C27e89gXsuDYT3mj7UXAZAoAk5QX` (abontenhub.com) | READY |
| 20:18 | `production-smoke.mjs` (steps 3, 4, 9) | 29 passed, 0 failed, every test row removed — including Admin › Events detail showing "Ghana" (F3) |
| 20:19 | `20260925111600_gate_device_token_cap` via MCP (all 5 production tokens pre-checked against the format; no account over 4) | applied |
| 20:22 | `20260925111700_gate_search_ranking_cap` via MCP — production's two pool functions were fingerprinted first and matched the version the migration was written against; afterwards they match the tested local version (`540d0ac2…`, `5ed43e04…`), grants still `service_role` only | applied |
| 20:22 | `20260925111800_gate_place_open_now_visitor` via MCP (fingerprint pre-checked) | applied |
| 20:23 | Advisors: security — nothing involving the three migrations; performance — INFO only (33 unindexed foreign keys, 180 unused indexes), none on the objects changed | no new finding |
| 20:25 | `production-smoke.mjs` extended with step 7 checks | 32 passed, 0 failed: signed-out search finds the new event (233 ms round trip), signed-out open-now answers a boolean, a malformed push token is refused (23514) and an account keeps 10 of 12 |
| 20:26 | Step 8: payment state (read-only) | no attempt in `processing` over an hour; 0 orphan captures; 20 webhooks in 7 days, all `settled` / HTTP 200; 4 `initiated` attempts from 18–24 Aug are abandoned checkouts from before this work |
| 20:27 | Step 10: logs since the deploy | Postgres: only the smoke script's own deliberate probes (`attendance`, `payout_account`); Vercel admin: no errors; Vercel web: Resend refused the throwaway `@example.com` buyers' ticket emails (expected; registration succeeded) |

| 20:31 | Final `production-smoke.mjs` run after fixing the script's own Ghana check (it held a literal backspace where `` was meant, and a bare "Ghana" could also match the test address): it now requires F3's rendering "Ghana (GH)" | 32 passed, 0 failed, every test row removed |

At deployment, production had no upcoming published events, so a direct
`search_events('accra')` returns no rows; the smoke script's search check
creates its own event to prove results come back.
