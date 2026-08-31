# Phase 5 — feature parity, vertical slices

Each slice is one commit; `apps/web` untouched. `expo export --platform ios`
+ `turbo build`/`typecheck` green per slice.

| Slice | What | Data path | Commit |
|---|---|---|---|
| 5.0 | SECURITY DEFINER RPC audit (`05-security-rpc-audit.md`) | — | `f4213cd` |
| 5.1 | Nearby-events discovery (home feed) | direct `supabase.rpc("get_nearby_events")` (anon-granted) | `7eb59bf` |
| 5.2 | Notifications screen | `@abonten/api-client` `notifications.*` (Phase-3 endpoints) | `f2d890c` |
| 5.3 | My-tickets (Tickets tab) | direct `ticket` table read (`.eq user_id` + RLS) | `1c060dd` |

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

## Remaining Phase 5 slices

- **Ticket detail** — full QR view / cancel, from a tapped `TicketCard`.
- **Search** — `get_event_suggestions` / `get_filtered_events` (both
  anon-granted) into the Search tab.
- **Places** — `get_nearby_places` / `get_filtered_places` into a places
  list + detail.
- **Checkout + payments** — the deferred `/api/mobile/**` endpoints
  (`validateCheckout`, payment prep/verify, Paystack charge/OTP) wrapping
  the existing Server Actions, then the mobile checkout screens. Do the
  `revoke … from authenticated` migration from `05-security-rpc-audit.md`
  first.
- **Organizer surfaces** — dashboard, events, finances. `request_organizer_payout`
  and `cancel_event_and_release_tickets` are safe to call directly (audited);
  everything else via endpoints.
- **Push notifications** — `expo-notifications` + a device-token table +
  server send from the notification-creating Server Actions.
