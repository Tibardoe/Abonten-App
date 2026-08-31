# Phase 5 — feature parity, vertical slices

Each slice is one commit; `apps/web` untouched. `expo export --platform ios`
+ `turbo build`/`typecheck` green per slice.

| Slice | What | Data path | Commit |
|---|---|---|---|
| 5.0 | SECURITY DEFINER RPC audit (`05-security-rpc-audit.md`) | — | `f4213cd` |
| 5.1 | Nearby-events discovery (home feed) | direct `supabase.rpc("get_nearby_events")` (anon-granted) | `7eb59bf` |
| 5.2 | Notifications screen | `@abonten/api-client` `notifications.*` (Phase-3 endpoints) | `f2d890c` |
| 5.3 | My-tickets (Tickets tab) | direct `ticket` table read (`.eq user_id` + RLS) | `1c060dd` |
| 5.4 | Event search (Search tab) | direct `supabase.rpc("get_filtered_events")` (anon-granted) | `aca4878` |
| 5.5 | Nearby places (Places tab, replaces Wallet) | direct `supabase.rpc("get_nearby_places")` (anon-granted) | `aca4878` |
| 5.6 | Event / place / ticket detail screens (from a tapped card) | direct `event` / `place` / `ticket` reads (RLS public-select / owner-select) | — |
| 5.7a | Checkout session: ticket picker → validate → review screen (no payment yet) | `/api/mobile/checkout/{validate,prepare,session/[id],cancel}` wrapping extracted cores | — |
| 5.7c | Payment methods + Wallet screen (add/list/remove/default mobile money) | `/api/mobile/payment-methods/*` + `/paystack/momo-networks` wrapping extracted cores | — |
| 5.7b | Paystack payment: attempt → direct charge (phone approval + OTP) / popup → verify | `/api/mobile/checkout/attempt` + `/api/mobile/payments/{verify,charge-otp}` wrapping extracted cores | — |
| 5.8 | Organizer read-only surfaces: dashboard KPIs, my-events list, finances (balance + ledger) | `/api/mobile/organizer/{overview,finance,events,ledger}` wrapping extracted cores | — |
| 5.9 | Organizer write actions: payout accounts CRUD, withdrawal request + history, event cancel | `/api/mobile/organizer/{payout-accounts,payout,payouts,events/cancel,events/cancellation-impact}` wrapping extracted cores | — |

## Running Expo (fix, commit `082d025`)

`npx expo start` **must run from `apps/mobile`** — the repo root has no Expo
entry, so Expo falls back to its bare `AppEntry` and fails with
`Unable to resolve "../../App"`. From the root use `npm run mobile` /
`mobile:ios` / `mobile:android`. `apps/mobile/README.md` has the details.
`web.output` is `single` (SPA) — static web export prerenders on a server
and crashes on `expo-secure-store`; web is a dev convenience only.

## 5.1 — discovery

- `useDeviceLocation` (`expo-location`) → coords or Accra fallback.
- `useNearbyEvents` — `useInfiniteQuery` over `get_nearby_events`; keyset
  cursor `{ sortKey, id }` kept in memory and passed through, so **no
  `encodeCursor`/`decodeCursor`** (no Node `Buffer`).
- `EventCard` — `@abonten/core` `buildCloudinaryUrl` + `formatDateWithSuffix`,
  `expo-image`. Home screen is a `FlatList` with pull-to-refresh + infinite
  scroll; `event/[id]` is a stub.

## 5.2 — notifications

- `useNotifications` — `useInfiniteQuery` over `api.notifications.list`
  (opaque string cursor) + `markAllRead` / `markRead` mutations.
- `app/(app)/notifications.tsx` — unread dots, tap-to-read, mark-all,
  pull-to-refresh, infinite scroll. `href: null` (navigable, not a tab),
  reached from Account.

## 5.3 — my tickets

- `useMyTickets` — `useInfiniteQuery` over a direct `ticket` read
  (`.eq("user_id", …)` + RLS), `TICKET_WITH_EVENT_SELECT` +
  `keysetOlderThan` from `@abonten/core`, in-memory `{ sortValue, id }`
  cursor. Same simple-path query as `getUserAttendingEvents`.
- `TicketCard` — Cloudinary QR (lossless), event title/date, active/used
  badge, `ticket_code`. Lives in the renamed **Tickets** tab.

## 5.4 / 5.5 — search + places

- `useEventSearch` — 350ms debounce, `useInfiniteQuery` over
  `get_filtered_events` (same params as `getQueriedEvents`), `>=2` chars,
  in-memory `FilteredEventsCursor`. Search tab = input + `EventCard` list.
- `useNearbyPlaces` — `useInfiniteQuery` over `get_nearby_places`, in-memory
  `{ distanceKm, id }` cursor. `PlaceCard` (cover, category, rating,
  open/closed, distance). The **Places** tab replaces the empty Wallet
  placeholder — Wallet returns with the checkout phase.

## 5.6 — detail screens

- `useEventDetail` / `usePlaceDetail` / `useTicketDetail` — plain `useQuery`
  hooks over direct table reads (no RPC, no endpoint). `event` allows a
  public select for `status in ('published','canceled')`; `place` and its
  children for `status = 'published'`; `ticket` is owner-select RLS
  (`.eq("user_id", …)` kept explicit). Event attendance still comes from the
  `get_event_attendance_count` SECURITY DEFINER aggregate, same as web.
- Screens: `app/(app)/event/[id].tsx` (flyer, date/time, venue, attendance,
  organizer, description, category/tags; ticket CTA disabled — "checkout
  coming soon"), `app/(app)/place/[id].tsx` (cover, open/closed via
  `computePlaceOpenStatus`, rating, address/phone/site, opening hours,
  services), `app/(app)/ticket/[id].tsx` (large lossless QR, valid/used
  badge, type, date, venue, "View event"). All three registered in
  `(app)/_layout.tsx` as `href: null` + `headerShown` screens; the
  event/place per-item title is set from the screen via
  `navigation.setOptions`. `PlaceCard` now navigates to the place screen,
  `TicketCard` to the ticket screen (was the event screen).

## 5.7a — checkout session (no payment yet)

Prereq fixed first: buyers couldn't reserve `ticket_type` inventory on web
at all (RLS gap) — see `07-checkout-blocker-ticket-type-rls.md`.

- **Web cores extracted** (behaviour byte-identical, "no logic fork"): the
  post-auth body of `validateCheckout`, `getTicketCheckout` and
  `cancelTicketCheckoutSession` moved to `src/utils/*Core.ts` taking
  `(supabase, userId, …)`; the `"use server"` actions became thin
  `createClient()` + `getUser()` + delegate shells. `prepareCheckoutPayment`
  gained an optional `client?` param. No promo-code path on mobile yet
  (`getPromoCode` / `claimPromoUsage` still assume the cookie SSR context) —
  the validate route rejects a `promoCode` rather than silently dropping it.
- **Endpoints** (`apps/web/src/app/api/mobile/checkout/`): `POST validate`
  (`{eventId, quantities, occurrenceId?}`), `POST prepare`
  (`{checkoutSessionIds}` → subtotal/discount/**fee**/total + grandTotal),
  `GET session/[sessionId]`, `POST cancel`. All run on the caller's
  Bearer-scoped client (RLS still enforced) via `getMobileAuth`.
- **api-client**: `checkout.validate / prepare / getSession / cancel`.
- **Mobile**: `TicketPicker` on the event screen (per-type steppers,
  on-sale / sold-out / “N left” states, occurrence chips when >1 date,
  live subtotal, "Get tickets" → `validate`). Absolutely-free events show
  "Free RSVP coming soon" instead (deferred with `registerForFreeEvent`).
  New `app/(app)/checkout/[sessionId].tsx` review screen — `prepare`
  breakdown, expired-session handling, "Cancel checkout", Pay button
  disabled pending 5.7b.
- `experiments.typedRoutes` **disabled** — in this monorepo the generator
  emitted cross-package garbage (route entries for `apps/web/src/...` and
  non-route `src/features/*` files) and misclassified `checkout/[sessionId]`.
  DX-only feature, no runtime effect. Expo's own sync then trimmed
  `.expo/types` / `expo-env.d.ts` out of `tsconfig.json` and added a
  local `apps/mobile/.gitignore`.

## 5.7c — payment methods (⚠ Paystack flows not device-verified)

- **Web cores extracted** (behaviour byte-identical): `paymentMethodCore.ts`
  with `list / add / remove / setDefault`; the 4 `"use server"` actions
  become thin shells. `PaymentMethodRow` + detail types moved to the core
  and re-exported from `getUserPaymentMethods.ts` for existing web imports.
  `getTicketCheckoutCore`'s return type was also tightened to an explicit
  discriminated union (a 5.7a follow-up — the inferred version widened
  `status` to `number` and broke `.data` narrowing on the web checkout
  page under a full typecheck).
- **Endpoints** (`apps/web/src/app/api/mobile/`): `GET/POST payment-methods`
  (POST accepts **momo only** — a card needs a server-captured
  authorization code the app has no flow for), `POST payment-methods/remove`,
  `POST payment-methods/default`, `GET paystack/momo-networks`. All
  Bearer-scoped via `getMobileAuth`.
- **api-client**: `paymentMethods.list / addMomo / remove / setDefault`,
  `paystack.momoNetworks`.
- **Mobile**: `app/(app)/wallet.tsx` ("Payment methods", reached from
  Account, not a tab) — list saved methods, make-default, remove, and an
  inline "add mobile money" form (live network chips + Ghana phone field).
  Cards direct users to the website.
- **Not verified**: the add-momo write is a plain DB insert (safe), but
  nothing here has been exercised against real Paystack — the networks list
  is a live Paystack call and the saved wallet is only *used* in 5.7b.

## 5.7b — Paystack payment (⚠ NOT device-verified — build/typecheck/export only)

Folds in what was going to be 5.7d (OTP) — one payment-execution commit.

- **Web cores extracted** (behaviour byte-identical): `createMultiCheckoutPaymentAttemptCore`
  (takes `(supabase, userId, email, input, callbackUrlFor)` — the callback
  is a web URL on web, an `abonten://checkout/<id>` deep link on mobile,
  built from the first *valid* session id exactly as before),
  `verifyPaystackPaymentCore`, `submitPaystackChargeOtpCore`. The 3
  `"use server"` actions become thin shells. `upsertPaymentAttemptForSession`
  gained an optional `client?` param (same pattern as `prepareCheckoutPayment`).
- **Endpoints** (`apps/web/src/app/api/mobile/`, Bearer-scoped): `POST
  checkout/attempt` (`{checkoutSessionIds, paymentMethodId}` → `{paymentGroupId,
  attempts, paystack:{mode:"direct"|"popup", …}}`), `POST payments/verify`
  (200 issued / 202 poll again / 400 failed / 207 paid-but-unfulfilled),
  `POST payments/charge-otp` (`{paymentAttemptId, otp}`). These use
  `fromActionResult` (not `apiJson`) to pass the discriminated-union results
  straight through.
- **api-client**: `checkout.attempt`, `payments.verify`, `payments.submitChargeOtp`.
- **Mobile**: `PaymentSection` on the checkout review screen — pick a saved
  method (default preselected; "Add payment method" → Wallet when none),
  "Pay {currency} {total}". `mode:"direct"` → "approve on your phone" +
  poll `verify` every 4s (cap 20), or `send_otp` → inline OTP field →
  `charge-otp` → resume polling. `mode:"popup"` → `expo-web-browser`
  `openAuthSessionAsync(authorizationUrl, abonten://checkout/<id>)` → poll.
  Success → "View my tickets" (Tickets tab).
- **Not verified**: no real Paystack charge, MoMo phone-approval, OTP,
  popup redirect, or deep-link return has been exercised. Phone-only
  accounts with no email get a 400 from `attempt` ("needs a verified email
  to pay") — an existing web constraint the app inherits.

## 5.8 — organizer read-only surfaces

Read-only parity for an organizer's own dashboard / events / finances.
Nothing here mutates — no payout request, no event cancel (those RPCs are
audited-safe but out of scope for a read-only slice).

- **Web cores extracted** (behaviour byte-identical): the post-auth bodies
  of `getOrganizerDashboardOverview`, `getOrganizerFinanceOverview`,
  `getOrganizerEvents` and `getOrganizerLedgerTransactions` moved to
  `src/utils/organizerReadQuery.ts` as `(supabase, …)` helpers; the four
  actions became thin `createClient()` + `getUser()` + delegate shells with
  explicit return types. `getOrganizerEvents`' pre-existing quirk of
  returning **500** (not 401) on no-session is preserved.
- **RPC posture** (verified via MCP, project `sderrexhawjbmsugndcq`):
  `get_organizer_dashboard_overview` / `get_organizer_finance_overview` are
  `SECURITY INVOKER` and filter on `auth.uid()` internally;
  `get_organizer_ledger_transactions` is `SECURITY DEFINER` but scoped to
  `organizer_ledger_entry.organizer_id = auth.uid()` (audit §"safe"). The
  events list is a direct `event` read gated by RLS `event_organizer_select`
  (`auth.uid() = organizer_id`), so drafts are visible to their owner only.
  No grant/RLS/schema change; no migration.
- **Endpoints** (`apps/web/src/app/api/mobile/organizer/`, all GET,
  Bearer-scoped via `getMobileAuth`): `overview?period=today|7d|30d|all`,
  `finance`, `events?cursor=&pageSize=`, `ledger?cursor=&pageSize=`. Cursor
  encode/decode stays server-side (Buffer-free client, same as
  `/notifications`).
- **api-client**: `organizer.overview / finance / events / ledger`; new
  types `OrganizerDashboardPeriod`, `OrganizerOverviewRow/Result`,
  `OrganizerFinanceResult`, re-exported `OrganizerFinanceOverviewRow`,
  `OrganizerLedgerTransactionRow`, `UserPostType`.
- **Mobile**: `app/(app)/organizer/{index,events,finance}.tsx` (reached from
  Account → "Organizer", `href: null` header screens).
  `src/features/organizer/useOrganizer.ts` — `useOrganizerOverview(period)`
  (`useQuery`), `useOrganizerFinance`, `useOrganizerEvents` /
  `useOrganizerLedger` (`useInfiniteQuery`). Dashboard: period chips + Sales
  / Tickets / Events stat blocks (per-currency money rows) + "no events yet"
  empty state. Events: paginated status-badged list, taps through to the
  public event screen. Finances: per-currency balance cards
  (available / pending / total) as the list header over a paginated ledger
  feed.
- **Verified**: `turbo build` + `turbo typecheck --force` (8/8, no cache),
  `expo export --platform ios`, `biome check` on all touched files, mobile
  `npm run lint` (44 files) — all clean. Not exercised against a running
  device; the reads are RLS-gated and side-effect-free.

## 5.9 — organizer write actions (⚠ money path — NOT device-verified)

Payout-account management, withdrawal requests, and event cancellation.

- **Web cores extracted** (behaviour byte-identical): `payoutAccountCore.ts`
  (`list / add / remove / setDefault / listPayouts`),
  `requestOrganizerPayoutCore.ts`, `cancelEventCore.ts`
  (`getEventCancellationImpactCore` + `cancelEventCore` — the latter carries
  the full path: RPC → per-transaction `issueRefundCore` on a **service-role**
  client → `after()` attendee-notification fan-out). The 8 actions
  (`getOrganizerPayoutAccounts`, `addPayoutAccount`, `removePayoutAccount`,
  `setDefaultPayoutAccount`, `getOrganizerPayouts`, `requestOrganizerPayout`,
  `getEventCancellationImpact`, `cancelEvent`) are now thin auth + delegate
  shells; each keeps its `revalidatePath` calls (Next-only) in the wrapper,
  fired only on a 200 core result. One deliberate reorder: `addPayoutAccount`
  now checks auth **before** Zod-parsing the body (was parse-first) — the Zod
  parse moved into the core; unobservable for any real caller (all
  authenticated), 401-before-400 only for an unauthenticated malformed call.
- **RPC posture** (audit §"safe for direct authenticated calls"):
  `request_organizer_payout` re-verifies payout-account ownership + recomputes
  the available balance from the ledger; `cancel_event_and_release_tickets` +
  `get_event_cancellation_impact` both `WHERE organizer_id = auth.uid()` and
  raise otherwise. The payout-account table ops are RLS-scoped
  `.eq("organizer_id", userId)`. **No grant/RLS/schema change, no migration.**
- **Endpoints** (`apps/web/src/app/api/mobile/organizer/`, Bearer-scoped):
  `GET/POST payout-accounts`, `POST payout-accounts/{remove,default}`,
  `GET payouts?offset=&limit=`, `POST payout`, `GET events/cancellation-impact
  ?eventId=`, `POST events/cancel`. All return the core result via
  `fromActionResult`.
- **api-client**: `organizer.{payoutAccounts, addPayoutAccount,
  removePayoutAccount, setDefaultPayoutAccount, payouts, requestPayout,
  eventCancellationImpact, cancelEvent}` + types (`AddPayoutAccountBody` is a
  dependency-free structural mirror of the Zod schema).
- **Mobile**: `src/features/organizer/usePayouts.ts` (mutations invalidate the
  finance/overview/events read caches). Screens:
  `app/(app)/organizer/payout-accounts.tsx` (list + make-default + remove +
  momo/bank add form), `withdraw.tsx` (currency + account picker, amount
  capped at the shown available balance, confirm), `payouts.tsx` (withdrawal
  history), `cancel-event.tsx` (server-verified impact counts + an explicit
  "I understand… refunds all buyers" checkbox that gates the destructive
  button). Reached from the Finances screen's new nav rows; "Cancel event"
  links from each draft/published row on the events list.
- **Verified**: `turbo build` (all 11 `organizer/*` routes present) +
  `turbo typecheck --force` (8/8, no cache), `expo export --platform ios`,
  `biome check` (35 files) + mobile `npm run lint` (49 files) — all clean.
  **Not exercised against a device or real Paystack**: no real withdrawal,
  refund fan-out, or attendee email has been sent from the app. The RPC
  guards + idempotency are the protection (see `cancelEventCore` header).

## Remaining Phase 5 slices

- **Push notifications** — `expo-notifications` + a device-token table +
  server send from the notification-creating Server Actions (needs a
  migration).
- **Free-event RSVP** (`registerForFreeEvent`) and **mobile card payment
  methods** — both still deferred (see 5.7 notes).
- Everything Paystack / money-path (5.7b/c, 5.9) still needs a device +
  test-keys pass.
