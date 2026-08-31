# Phase 5 — feature parity, vertical slices

Each slice is one commit; `apps/web` untouched. `expo export --platform ios`
+ `turbo build`/`typecheck` green per slice.

| Slice | What | Data path | Commit |
|---|---|---|---|
| 5.0 | SECURITY DEFINER RPC audit (`05-security-rpc-audit.md`) | — | `f4213cd` |
| 5.1 | Nearby-events discovery (home feed) | direct `supabase.rpc("get_nearby_events")` (anon-granted) | `7eb59bf` |
| 5.2 | Notifications screen | `@abonten/api-client` `notifications.*` (Phase-3 endpoints) | `f2d890c` |

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

## Remaining Phase 5 slices

- **Tickets** — user's tickets list + ticket detail/QR (direct Supabase
  read under RLS; QR generation client-side).
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
