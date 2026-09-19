---
title: Enterprise hardening pass — holistic audit 2026-09-19
purpose: Record what a whole-codebase audit of Abonten Hub found on 2026-09-19 after the four earlier audits, what was redesigned or fixed the same day, how each change was verified, and the few items that only the founder can complete.
audience: Founder, engineering, future auditors
scope: apps/web, apps/admin, apps/mobile, packages/*, supabase/, CI, production project sderrexhawjbmsugndcq
status: Approved
version: 1.1
lastReviewed: 2026-09-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Enterprise hardening pass — holistic audit 2026-09-19

Branch `audit/enterprise-hardening-2026-09-19`. The brief was a complete audit of the whole system with the instruction to redesign rather than patch, and to leave no discovered material problem deferred. This report is written for a reader who was not in the session.

## 1. Starting point

The four earlier audits (limitations register 2026-09-04, holistic audits of 2026-09-13 and 2026-09-18, the Android launch audit) had already closed the classes of defect that sink a launch: one idempotent payment finaliser with a compare-and-set lock, server-write-only money tables, privileged RPCs that derive identity from `auth.uid()`, refunds claimed before Paystack is called, account deletion that preserves the financial record, a replayed-migration integration suite. Baseline on the morning of this pass: typecheck 11/11, unit 121 + 540, integration 57 files, 40 cron jobs with zero failures in seven days, security advisor with no ERROR-level item, production web deployed from `main` at `2ca986d6`.

What this pass therefore looked for was the next layer down: what a stalled provider does to a serverless function, what the type system actually proves, what a browser is allowed to load, what a signed-out visitor gets for a bad link, what a screen reader hears, and whether any of that was tested.

## 2. What was audited

- **Backend integrations**: every outbound HTTP call in `@abonten/services` and the two Next.js apps (Paystack, Hubtel, Expo push, web push, Google Geocoding, Cloudinary, Resend, ipapi), their timeouts, error mapping and SDK configuration.
- **Data layer**: the Supabase client factories, the generated `Database` types versus the domain types (`UserPostType`, reviews, attendance, analytics), every `any` and `as` cast in web, admin and services, RPC argument nullability against the live function signatures.
- **Security**: security headers, the absence of a Content-Security-Policy, the session proxy's route model, function grants (every `SECURITY DEFINER` and trigger function executable by client roles), the realtime publication, OTP brute-force limits, webhook signature handling, rate limiting coverage, secret handling and boot-time configuration.
- **Web app**: error and not-found boundaries, metadata (titles, canonical URLs, robots) across all 88 pages, landmark structure, colour contrast, image alternative text, dead pages and routes.
- **Admin app**: module structure (the 2,157-line Server Action file), headers, CSP, configuration.
- **Mobile app**: accessibility roles on tappables, the API client's timeout/retry behaviour, the error boundary, list components, deep-link configuration.
- **Database**: advisors (security + performance), cron job health over seven days, index coverage on the hot tables, retry caps on the delivery queue, rate limits inside the messaging RPCs, replica identity and publication membership.
- **Dependencies**: `npm outdated`, `npm audit`, unused packages.
- **Tests and CI**: what the suites cover, what runs in CI, what had never been run in a browser.
- **Documentation**: statements that no longer matched the code.

## 3. Findings and what changed

Severity uses the earlier reports' scale. Every row was fixed in this pass unless marked otherwise.

| # | Severity | Area | Finding | Root cause | Change |
|---|---|---|---|---|---|
| F1 | HIGH · RELIABILITY | Integrations | 12 of 13 outbound `fetch` calls had no deadline: Paystack (initialise, verify, charge, OTP, refund, transfers), Hubtel OTP, Expo push, Google Geocoding, the Cloudinary playback probe. A provider that accepts the connection and stalls held the serverless function until the platform killed it — on the money path, a finaliser that neither succeeded nor failed. Resend and the Cloudinary SDK had no deadline either | Plain `fetch` everywhere; one health-check helper had its own AbortController | `@abonten/core/http/fetchWithTimeout` (`fetchWithTimeout`, `withDeadline`, per-provider `HTTP_TIMEOUTS`, a distinguishable `FetchTimeoutError`); every call site migrated; `apps/web/src/lib/email/sendEmail` wraps Resend with a 15 s deadline; `packages/services/src/media/cloudinaryClient` passes the SDK its timeout |
| F2 | MEDIUM · MAINTAINABILITY | Cloudinary | Twelve copies of `cloudinary.config({...})` across services and web actions; `deleteEvent` had none and only worked because another module had configured the process-global SDK first | Each module configured the SDK for itself | One configured instance and a typed `destroyAsset()` in `cloudinaryClient.ts`; the copies are gone |
| F3 | HIGH · TYPE SAFETY | Data layer | The public (cookie-free) Supabase client was created without the `Database` generic, so every public read returned `any`. Some 30 files carried the comment "no generated Supabase types exist in this repo"; `packages/types/src/database.types.ts` (15 k lines) has existed for weeks. Typing the client exposed 55 real mismatches: nullable columns assumed non-null (`username`, tier `price`/`currency`/`type`, event `starts_at`), a JSON `address` read as an object, a geography column typed `unknown` passed as a string, `null` sent to RPC arguments typed non-null, a repeated `?category` query sent as an array to a text parameter | An early decision never revisited | Client typed; `@abonten/core/eventAddress` proves the JSON shapes once at the RPC boundary; `UserPostType`, `Occurrence`, new `reviewType`, `eventAnalytics`, `managedEventType` describe the rows honestly; `AttendanceRow` and the insights result types are real; every `as any` on embedded rows in services removed (the client infers them from the select string). Behavioural fixes that fell out: a registration with no ticket can no longer be "checked in"; a payout account of an unknown type is refused before Paystack; the repeated category parameter is handled |
| F4 | HIGH · SECURITY | Web + admin | No Content-Security-Policy (documented as "needs an allow-list that has to be tested first") | Never done | `@abonten/core/security/contentSecurityPolicy` (unit-tested) builds the policy; each app's `proxy.ts` sets it per request. Web: scripts only from self, Paystack, Google Maps; frames only Paystack; connections to Supabase (https + wss), Cloudinary upload API, Maps, ipapi, Paystack, Sentry; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`; violation reports to Sentry's security endpoint. Admin: no third-party script or frame. Verified in the browser suite and by loading the public pages under it |
| F5 | MEDIUM · UX / SEO | Web routing | The session proxy protected everything not on a public allow-list, so an unknown URL redirected a signed-out visitor to sign-in instead of a 404, and `/api/geocode` (used before sign-in) was redirected to an HTML page | Deny-by-default route model | Explicit `PROTECTED_PREFIXES` (15 private sections); everything else is served; every private page still re-checks `auth.getUser()` and its layout is `noindex` |
| F6 | MEDIUM · UX / SEO | Web pages | A page that threw unmounted the whole document (only `global-error.tsx` existed); no `not-found.tsx` at all; a missing event or place rendered "No event found" with status 200 (a soft 404 to crawlers); 68 of 88 pages had no metadata; titles carried the brand suffix in four different spellings; three nested `<main>` landmarks; the site header was a `<nav>` | Grew page by page | `(pages)/error.tsx` keeps the chrome and offers a segment retry; `app/not-found.tsx` + `(pages)/not-found.tsx` share one body; a missing event or place is decided in the segment layout (`events/[eventCode]/layout.tsx`, `places/[slug]/layout.tsx`), which renders before the shell is flushed, so the response is a real 404 (see §5.2 for why the page body and `generateMetadata` could not do this); root title template, thirteen suffixes removed; noindex layouts for Settings, Finances, Transactions, Manage, Checkout, Auth, Admin, Consent, Field Ops; `generateMetadata` with canonical URLs for the location explore pages and public profiles; one `<main>`; a `<header>` landmark; the stub `/around-you` page (no links to it) removed |
| F7 | MEDIUM · ACCESSIBILITY | Design tokens | axe found two serious violations on every public page: brand mint text (`text-primary`, #28bda7 on white) at 2.35:1, and `muted-foreground` at 4.35:1 on muted surfaces; unlabelled `MaskIcon`s announced as unnamed images | The fill colour was also the text colour; icons always carried `role="img"` | New `--primary-text` token (the mint darkened to AA on light surfaces) in web `globals.css`, mobile `global.css` and `@abonten/ui-tokens`; Tailwind `textColor.primary` resolves `text-primary` to it on web and mobile while `bg-`/`border-primary` keep the mint (`text-primary-fill` opts back in); `muted-foreground` 46 % → 42 %; `MaskIcon` is `aria-hidden` when unlabelled. The axe scan of the public surface now passes with zero serious/critical violations |
| F8 | MEDIUM · ACCESSIBILITY | Mobile | 149 of 360 `<Pressable>`s carried no accessibility role; `PressableScale` (the app's touch primitive) set none | No default | `PressableScale` defaults to `button`; a codemod added `accessibilityRole="button"` to the 123 raw Pressables that handle a press (backdrops and gesture hosts left alone) |
| F9 | MEDIUM · OPERATIONS | Configuration | Nothing verified a deployment's environment; a missing `PAYSTACK_WEBHOOK_SECRET` or an empty `ADMIN_EMAIL_ALLOWLIST` surfaced at the first request | Variables read ad hoc in 48 places | `@abonten/core/env/checkEnv` + `instrumentation.ts` in both apps: required variables checked once per process; a production deployment missing one refuses to start, other environments log the names (values never printed) |
| F10 | MEDIUM · TESTING | Web | No browser-level test had ever run in CI; headers, redirects, 404s, SEO tags and accessibility were unverified | Only unit and integration suites existed | `apps/web/e2e` (Playwright + axe-core) run against `next start` by the `build-and-e2e-web` job: 17 tests. It found F5, F6 (status 200) and F7 in its first run |
| F11 | LOW · MAINTAINABILITY | Admin | `apps/admin/src/server/actions.ts`: 2,157 lines, 87 Server Actions, 68 imports, one file | Grew per feature | Sixteen domain modules under `src/server/actions/` plus `_shared.ts`; the 55 import sites name the module they depend on |
| F12 | LOW · SECURITY | Database grants | Five trigger functions (one `SECURITY DEFINER`) were executable by `anon` and `authenticated` over PostgREST | Default PUBLIC EXECUTE never revoked | Revoked (`20260919110000`). The same migration also revoked the three checkout sweeps from `authenticated`; the integration suite showed the app runs those sweeps on demand with the caller's session as a self-heal, so `20260919120000` restored that grant (they are `SECURITY DEFINER`, idempotent and touch only rows already past expiry). The revoke was live in production for about fifty minutes; the cron sweep kept running throughout, so the only effect was that a just-expired reservation could take up to five minutes longer to free |
| F13 | LOW · SCALABILITY | Realtime | The four messaging tables were still in the `supabase_realtime` publication with REPLICA IDENTITY FULL, the cut-over's last step (owed since 2026-09-18) | Waiting for client rollout; no store build of the mobile app exists and the web build with the trigger broadcasts is live | Removed from the publication, replica identity back to default (`20260919110000`) |
| F14 | LOW · OBSERVABILITY | Logging | `@abonten/core/logger` wrote free text; log drains and alert rules could not filter by level or field | Console wrapper | One JSON line per entry on a production server (`{time, level, msg, data}`, Errors serialised with stack); unchanged in browsers, React Native and development; unit-tested |
| F15 | LOW · HYGIENE | Repository | Biome writes LF, the Windows checkout had CRLF: a formatting pass over one folder showed 138 spurious modifications | Only `apps/mobile` had a `.gitattributes` | Root `.gitattributes` pins LF repo-wide |
| F16 | LOW · DEAD CODE | Web | `/api/user-profile` (no callers), `getUserCurrency` (no callers, wrong fallback), `/around-you` (stub), the `twilio` package (never imported), three suppression comments that suppressed nothing | Left behind | Removed |
| F17 | INFO · DEPENDENCIES | Monorepo | `npm audit`: 20 advisories, all transitive. Two are genuinely build-time only (`metro` → `image-size`; `@expo/config-plugins` → `xcode` → `uuid`, used by prebuild). **One is not**: `expo-router` → `query-string@7` → `decode-uri-component@0.2.2` is in the mobile app's runtime URL parsing (`getStateFromPath`), so it runs on every deep link | Upstream pins | Non-breaking `npm audit fix` applied. The runtime one cannot be fixed from this repository: the advisory covers `<=0.4.2` and the first patched release, `0.5.0`, is ESM-only (`"type": "module"`, no CJS entry) while `query-string@7` does `require('decode-uri-component')` — an `overrides` pin would break the Metro bundle. Corrected in §6 |

### Examined and found sound (no change)

- Money path concurrency, webhook acknowledgement, refund claiming, payout locking (re-read after the 2026-09-18 changes; the integration suite's redelivery tests pass on the replayed stack).
- OTP: sign-in verification counts attempts per phone (`registerVerifyAttempt`), email OTP is rate-limited on a hashed key; Supabase's own caps sit underneath.
- Messaging RPCs carry their own per-caller caps (`open_conversation` 20/hour, `send_message` and `send_story_reply` rate-checked in SQL); the notification delivery queue fails a row for good after five attempts.
- Every `SECURITY DEFINER` function the advisor lists as client-executable was read: the discovery/search set is read-only and identity-free; the rest derive identity from `auth.uid()` (`get_event_attendee_contacts`, `get_event_cancellation_impact`, `get_event_refund_breakdown`, `open_conversation`, …).
- Index coverage on `notification`, `message`, `conversation_participant`, `ticket`, `transaction`, `payment_attempt`, `event`, `place`, `content_post`, `follow` matches the access paths; the 182 "unused index" advisories reflect a production database with 11 users, not missing usage.
- The mobile API client already has a 20 s per-request deadline and exponential-backoff retries for reads only; writes never auto-retry.
- Cron: 40 jobs, 0 failures in seven days (the two storage-purge failures on record are from 2026-09-13, fixed that day).

## 4. Database changes

| Migration | Applied to production | Content |
|---|---|---|
| `20260919110000_audit_grants_and_realtime_publication.sql` | yes (Supabase MCP) | Revoke EXECUTE on five trigger functions from `public`/`anon`/`authenticated`; remove `message`, `conversation`, `conversation_participant`, `message_reaction` from `supabase_realtime`; replica identity back to default; (the sweep revoke it also carried was reverted by the next file) |
| `20260919120000_restore_checkout_sweep_grants.sql` | yes | Grant EXECUTE on the three checkout sweeps back to `authenticated` (on-demand self-heal path) |

No table, column, policy or trigger changed. Both files replay in the integration stack.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Type check, every workspace | `npm run typecheck` | 11/11 tasks successful |
| Core unit tests | `npx vitest run` in `packages/core` | 540 → 563 with the new `fetchWithTimeout`, `contentSecurityPolicy`, `eventAddress`, `checkEnv`, `logger` suites |
| Services unit tests | `npx vitest run` in `packages/services` | 121 |
| Integration suite on a replayed local stack (both new migrations) | `SUPABASE_TEST_PORT_OFFSET=-1000 npm run test:db:up` → `npm run test:integration` | first run: 547/548 (the sweep-grant regression, F12) → fixed → see §5.1 |
| Lint | `npx biome check --write <touched files>` (never the bare `npm run lint`, see below) | clean |
| API parity | `npm run check:api-parity` | see §5.1 |
| Docs | `npm run check:docs` | see §5.1 |
| Production build, web | `npm run build -w @abonten/web` | 218 static pages, exit 0 (three times during the pass) |
| Production build, admin | `npm run build -w @abonten/admin` | see §5.1 |
| Browser suite | `npx playwright test` in `apps/web` against `next start` with the app's `.env.local` | see §5.1 |
| Advisors after the migrations | `get_advisors` security / performance | no new items; trigger-function warnings gone |

### 5.1 Final run, after the last change

| Check | Result |
|---|---|
| `npm run typecheck` | 11/11 |
| `npx vitest run` (core) | 63 files, 561 tests |
| `npx vitest run` (services) | 16 files, 121 tests |
| Integration suite, replayed stack with both new migrations | 62 files, 548 tests |
| `npm run check:api-parity` | 217 route handlers, all reachable |
| `npm run check:docs` | OK — 169 internal + 32 public documents |
| `npm run build -w @abonten/web` | exit 0, 218 static pages, no warnings |
| `npm run build -w @abonten/admin` | exit 0 |
| `npx playwright test` (apps/web, against `next start`) | 17/17 — see §5.2 for what the suite found on the way |
| `npm audit --omit=dev` after `npm audit fix` | 16 moderate remain: two build-time, one mobile-runtime, none fixable from the repository (§6) |

### 5.2 What the browser suite found before it passed

1. An unknown URL returned 200: the session proxy redirected it to sign-in (F5).
2. A missing event returned 200 (F6). A `notFound()` from the page body arrived after the loading boundary had streamed the 200 shell, and `notFound()` in `generateMetadata` behaved the same for browsers and for Googlebot (Next streams metadata for bots that run JavaScript). The existence check moved into the segment layouts (`events/[eventCode]/layout.tsx`, `places/[slug]/layout.tsx`), which render before the shell is flushed; both listings now answer 404.
3. `text-primary` and `muted-foreground` contrast, and unnamed mask icons, on every public page (F7).
4. The site header was a `<nav>`, not a `<header>` landmark (F6).

**Not verified**: iOS (no Mac); a real CSP violation report arriving in Sentry (the report URI is derived from the DSN and unit-tested; Sentry's acceptance of the report is theirs); the browser suite against the deployed production host (it runs against a local production build with the same code and configuration); mobile screen-reader behaviour on a device (roles are set; VoiceOver/TalkBack not run).

## 6. Remaining items — only what cannot be done from the repository

- **Postgres upgrade** (15.8 → 17): eligible since 2026-09-18, about an hour of downtime, no downgrade; the founder schedules it in the Supabase dashboard.
- **Expo SDK upgrade** for the three remaining `npm audit` advisories, none of which can be resolved from this repository:
  - `metro` → `image-size` and `@expo/config-plugins` → `xcode` → `uuid` are **build-time only** (the bundler and `expo prebuild`); they never reach a device.
  - `expo-router` → `query-string@7` → `decode-uri-component@0.2.2` **is in the mobile runtime**: expo-router parses incoming URLs with it (`build/fork/getStateFromPath.js`), so it runs on every deep link and universal link. The advisory (GHSA-vcc3-ghjq-m6fr, moderate) is a denial of service — a crafted link with malformed percent-encoding makes the decoder burn CPU and the app freeze. There is no data exposure and no privilege gain; the victim force-quits and reopens. It is not fixable here: the advisory covers `<=0.4.2`, the first fixed release (`0.5.0`) is ESM-only while `query-string@7` requires it as CommonJS, and npm's own suggested "fix" is a downgrade of expo-router to a version predating SDK 57. It clears when Expo moves off `query-string@7`; the next SDK bump should be checked against it.
- **Retention periods** (R4–R6 in `OPERATIONAL_DECISIONS_REQUIRED.md`): the purge jobs are specified but gated on decisions the register reserves for the founder and counsel; the repository's rule is not to build a gated specification.
- **Leaked-password protection**: a Supabase Pro feature; there are no end-user passwords.
- **The mobile store build**: every mobile change here (roles, tokens) reaches devices with the next EAS build, which is the founder's to submit.

## 7. Health assessment

| Area | Note |
|---|---|
| Integrations | Every outbound call is bounded; one client per provider |
| Types | The compiler now checks the whole read path against the schema; the "no generated types" era is over |
| Browser security | CSP on both apps, explicit route protection, one 404 page, noindex on private sections |
| Accessibility | Public surface passes axe at the serious/critical level on web; mobile tappables announce as buttons |
| Operations | Deployments verify their configuration at boot; logs are structured; the browser suite runs in CI |
| Database | Grants match use; the realtime cut-over is complete; both migrations replay |

## 8. Adversarial pre-merge pass (version 1.1, same day)

Before the branch was offered for merge it was re-read as an attacker and as
a reviewer looking for what the pass itself had broken. Six more defects came
out of it — three introduced by this branch, one pre-existing bug the branch's
own typing exposed, one measured scalability defect, and one incorrect claim
in this report.

| # | Severity | What | Evidence | Resolution |
|---|---|---|---|---|
| F18 | MEDIUM · SECURITY (introduced by F5) | Inverting route protection made `/api/geocode` — a proxy to a **billed** Google API — reachable without an account. It had been protected only as a side effect of the old deny-by-default model | A route-by-route diff of old versus new protection across all 88 pages and every API route: `/api/geocode` was the single route whose protection changed | The route authenticates itself (`auth.getUser()`, 401 JSON rather than a 307 to HTML, which is what an API route owes a caller) and rate-limits per account instead of per IP. Asserted in `e2e/route-protection.spec.ts`. The comment claiming it was "used before login" was wrong: its only caller is the Field Ops lead territory form, which is behind `/field` |
| F19 | MEDIUM · RELIABILITY (introduced by F1) | Putting a deadline on Google Geocoding made a slow response **throw into the page render**. The location pages have no catch, so a transient Google slowdown would have taken `/explore/[location]`, `/events/location/[location]`, its `explore/[type]` children and the event detail page to the error boundary — where previously they simply waited | Read of `geocodeAddress` against its four call sites | `geocodeAddress` returns `{ lat: null, lng: null, error }` for a timeout or network failure, the same shape it already returned for an address Google cannot resolve, and logs it |
| F20 | MEDIUM · CORRECTNESS (pre-existing, exposed by F19's honest return type) | Those pages then passed `null` coordinates straight into `get_nearby_events` / `get_events_in_window` / `get_similar_events`, which take `double precision` — so a failed geocode silently queried with nulls and rendered as "there is nothing on in this city" | The build's type check, once `geocodeAddress` stopped returning `any` | Each page guards: the two location pages render a new `LocationUnavailable` ("We couldn't find X", with the location picker still on screen so it is not a dead end); the similar-events page and the event detail page skip the nearby query instead of calling it with nulls |
| F21 | MEDIUM · SCALABILITY | Admin › Monitoring read the health snapshot as `order by checked_at desc limit 300`, then kept the first row per check in JavaScript. The only index is `(check_key, checked_at DESC)`, so the sort had no usable index on the **largest table in the database** | `EXPLAIN (ANALYZE, BUFFERS)` on production: `Parallel Seq Scan` + top-N heapsort, **895 ms**, 2,207 buffers, over 127,462 rows / 29 MB. Retention is 30 days, so the steady state is roughly double | One indexed lookup per known check key (`HEALTH_CHECK_KEYS`, now exported as a value), issued together: **0.114 ms** and 4 buffers each on the same data. Semantics unchanged — still the latest result per check, however old; output order is now the canonical key order instead of shuffling with completion times |
| F22 | LOW · ACCURACY OF THIS REPORT | §6 said every remaining `npm audit` advisory was build-tooling only. One is not | `npm ls decode-uri-component` → `expo-router@57 → query-string@7 → decode-uri-component@0.2.2`, referenced from `expo-router/build/fork/getStateFromPath.js`, which parses incoming deep links at runtime | F17 and §6 corrected with the exploitability and with why it cannot be fixed here |
| F23 | LOW · TEST CORRECTNESS | Two of the new browser tests asserted the wrong thing: `/places` has no index page (404 is correct, not failure), and `/` is the landing group, which has no `<header>` | First run of the suite | Assertions corrected to the property actually under test |

### 8.1 The grant incident, investigated

The brief asked for this specifically.

- **Why the grant was revoked.** The migration treated "this function is a pg_cron job" as "only the scheduler calls it". That was true of the job, and false of the application: fourteen call sites run the same sweep with the caller's own session as a self-heal, so that a reservation which has just expired is released the moment someone looks at the checkout rather than at the next five-minute tick.
- **Why the migration did not prevent it.** Nothing in TypeScript, review or the build can see a grant. The only artefact that fails is a live call returning `42501`, and the one test that happened to make such a call (`money-path-lockdown`) is a money-path test, not a permissions test — it caught this by accident.
- **Is the correction safe.** Yes. Each sweep is `SECURITY DEFINER`, takes no arguments, returns no caller-specific data, is idempotent, and only touches rows already past `expires_at`. A signed-in caller gains nothing the next cron run would not do anyway.
- **Can deployment order reproduce it.** No. Both migrations are in the repository in order, the production history records them in order (`20260919202213` then `20260919211135`), and the integration stack replays both from scratch.
- **Do other jobs have the same risk.** Checked exhaustively, not sampled: all 215 RPC names called anywhere in the codebase were cross-referenced against `has_function_privilege('authenticated', …)` on production. Seventeen are not executable by `authenticated`; every one was traced to its call site and each is reached only through a `ServiceRoleClient` (content, weekly, recommendations, referrals, place visits, admin finance). Two — `account_deletion_blockers` and `expire_stale_subscription_checkouts` — have no application call site at all. **No other latent grant bug exists.**
- **Strengthened verification.** `function-grants.integration.test.ts` asserts both directions against a real authenticated session: thirteen session-callable functions must stay callable, seven service-role-only functions must stay refused. It was proved to work by re-running the incident on the local stack — revoking the grant made it fail with the exact diagnosis ("A migration revoked it; the app calls it with the caller's own session, so this is a production outage") — and pass again once restored. The refusal half calls each function as the service role first, so PostgREST's `PGRST202` can only mean "invisible to this role" and never "the test's arguments are wrong" — a trap the first draft of the test fell into.

### 8.2 CSP reporting, verified rather than assumed

Version 1.0 said a violation report reaching Sentry was unverified. It is now
verified as far as it can be without involving Sentry: `e2e/csp-reporting.spec.ts`
intercepts the configured `report-uri`, injects a script from a disallowed
origin, and asserts the browser posts a real `csp-report` whose
`violated-directive` is `script-src` and whose `blocked-uri` is the foreign
origin. Run against a server started with a DSN, both tests pass; without a
DSN the policy carries no `report-uri` and the test skips with that reason.
The same file also asserts the policy refuses nothing of the app's own, which
is the failure mode that would make the policy unshippable. What remains
unverified is only Sentry's own acceptance and rendering of the report, which
is external.

### 8.3 Accessibility: automated versus device

- **Automated, and now enforced:** axe-core over the public web surface (no
  serious or critical violations); semantic landmarks, canonical titles and
  `noindex` in the browser suite; and `scripts/check-mobile-a11y.mjs`, which
  fails the build if any `<Pressable>` with an `onPress` carries no
  accessibility role — the rule the 123-file codemod established, kept from
  rotting. Proved by planting a violating component and watching it fail.
- **Genuinely device-only:** how VoiceOver and TalkBack actually announce a
  screen — focus order, grouping, whether a label reads sensibly in context,
  gesture navigation. Roles being present is necessary and not sufficient.
  This has not been done and is not claimed.

### 8.4 What this pass did not find

Stated so the absence is on the record rather than implied. No unbounded N+1
was found: every awaited database call inside a loop iterates a bounded batch
(a post's media, one post's campaigns, one report group, a claimed queue
page). No TODO, FIXME, skipped or disabled test, or commented-out production
logic remains in the source. No further `any` remains on the read path. The
messaging tables' removal from the realtime publication is safe for current
clients — both apps use trigger broadcasts and no store build of the mobile
app exists — though an internal tester on a stale preview build would lose
live message delivery until they update.
