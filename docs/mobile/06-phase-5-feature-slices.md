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

## Remaining Phase 5 slices

- **Checkout + payments (5.7b, 5.7d)** — the deferred `/api/mobile/**` endpoints
  (`validateCheckout`, payment prep/verify, Paystack charge/OTP) wrapping
  the existing Server Actions, then the mobile checkout screens. Do the
  `revoke … from authenticated` migration from `05-security-rpc-audit.md`
  first.
- **Organizer surfaces** — dashboard, events, finances. `request_organizer_payout`
  and `cancel_event_and_release_tickets` are safe to call directly (audited);
  everything else via endpoints.
- **Push notifications** — `expo-notifications` + a device-token table +
  server send from the notification-creating Server Actions.
