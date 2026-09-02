# Shared backend / API architecture

_Established on `feat/shared-backend-architecture`, 2026-09-02. This is the
canonical reference for where business logic lives and which operations may
talk to Supabase directly._

## The one rule

> **One source of business logic (`@abonten/services`), one secure backend
> contract, consumed by web and mobile through two thin transports.**

Abonten is a modular monolith. `apps/web` (Next.js) **is** the backend —
there is no separate deployed service, and this is deliberate.

## Layers

```
   Web (Next.js)                         Mobile (Expo)
   apps/web/src/actions/**               @abonten/api-client  ──HTTP──►  apps/web/src/app/api/mobile/**/route.ts
   "use server", cookie session          Bearer JWT (getMobileAuth)
        │                                                                    │
        │        resolve identity · zod-validate · map to { status, … } envelope   (thin, per transport)
        └───────────────────────────────────────┬────────────────────────────┘
                                                ▼
                                     @abonten/services   ← the single source of business logic
                                       checkout/ payments/ tickets/ events/ organizer/
                                       places/ promotions/ promo-codes/ profile/
                                       notifications/ reviews/ uploads/ platform/ supabase/
                                     framework-free · server-only · injected SupabaseClient
                                       may use node:* + cloudinary + Paystack/Hubtel
                                       NO next/* · NO react · NO DOM
                                                ▼
                                     Supabase  (Postgres — RLS + SECURITY DEFINER RPCs)

   Class-A operations (see below) skip @abonten/services entirely:
     web action / mobile hook  ──►  supabase.*  directly, under RLS
     shared *decision* logic (not queries) comes from pure fns in @abonten/core
```

- **`@abonten/services`** — one exported function per operation,
  `(supabase, userId, input) => Promise<{ status, message?, data? }>`. The
  same envelope the Server Actions and the `/api/mobile` routes already used.
  `apps/mobile` **must not** depend on this package; it reaches this logic
  only over HTTP.
- **Web transport** = Server Actions (`apps/web/src/actions/**`). Kept —
  SSR/RSC-native, no CORS, progressive enhancement. Each action:
  `createClient()` → `auth.getUser()` → call a service.
- **Mobile transport** = `apps/web/src/app/api/mobile/**` route handlers,
  typed by `@abonten/api-client`. Each route: `getMobileAuth(req)` (validates
  the Bearer JWT, gives a Supabase client scoped to that user exactly like a
  cookie session) → call the same service.
- **Framework primitives stay in the transport.** A service that needs
  `revalidatePath`, `after()`, or a React email template takes a callback /
  injected dependency instead — see `payments/fulfillmentDeps.ts` and the
  `onRegistered` / `onRefundsInitiated` hooks on the free-RSVP and
  cancel-event cores.

## Operation classification

### A — safe direct client → Supabase (no service, no endpoint)

Governed entirely by RLS; identical rows whichever client asks.

| Operation | Why safe |
|---|---|
| `get_filtered_events` / `get_nearby_events` / `get_similar_events` / `get_events_in_window` / `get_event_suggestions` / `get_place_suggestions` / `get_nearby_places` / `get_filtered_places` | anon-`GRANT`ed, no `auth.uid()`, read-only PostGIS |
| `get_event_attendance_count(s)` | public counts, no PII |
| `get_user_transaction_summary` / `get_user_transaction_history` | `SECURITY DEFINER`, scope to `auth.uid()` internally |
| `event` / `event_occurrence` / `ticket_type` / `place` / `event_review` / `place_review` reads | RLS `*_public_select` (published) |
| own `ticket` reads | `ticket_owner_select` |
| `favorite` / `favorite_place` CRUD | `*_owner_all (auth.uid() = user_id)` |
| own `event_review` / `event_review_photo` / `place_review` CRUD | `*_reviewer_*` + column trigger + `UNIQUE(event_id, reviewer_id)` |
| `user_info` self text update | `user_info_self_update` + `protect_user_info_privileged_columns` trigger |
| `notification` read / mark-read | `notification_owner_*` (also has an API fallback) |
| Realtime on any of the above | same RLS |

Shared **decision** logic for class-A lives in `@abonten/core` (e.g.
`eventReviewEligibility.ts`) so web and mobile can't drift — the queries stay
per-platform, the verdict is one function.

### B — backend/API operations (go through `@abonten/services`)

Business-critical mutations and reads with consistent server-side rules:
ticket checkout (`validateCheckout`), inventory reservation
(`ticketInventory` — service-role compare-and-swap), free RSVP, promo-code
validate/claim, payment-attempt creation, event/place create & update,
drafts, organizer dashboards / finance / ledger reads, payout accounts +
`requestOrganizerPayout`, event cancellation, ticket check-in, promotions,
saved payment methods + card verification, upload signatures.

Mobile → `/api/mobile/**`; web → Server Action; **both → the same service
module.** `request_organizer_payout` and `cancel_event_and_release_tickets`
are well-guarded internally but are still kept behind an endpoint for
consistent error shapes.

### C — server/privileged-only (never reachable from a client)

Paystack verify / charge / refund (secret key —
`payments/gateway/paystackService.ts`), the Paystack webhook
(signature-verified, service-role), `finalizePaystackPayment`, the six
`record_*` ledger RPCs, Supabase Admin API (phone attach, delete user),
`ticketInventory` writes, the push sender, Cloudinary signing. All isolated
behind `@abonten/services/supabase/serviceClient` or a server-only core, and
never imported by a client component.

## Security posture

- RLS is enabled on every `public` table (7 batch migrations, 2026-08-25).
  Owner-scoped + organizer-scoped (`EXISTS` on `event.organizer_id`) +
  `status='published'` public-read. Partition leaves get RLS-on / no-policy.
  Dual-writer tables use a `BEFORE UPDATE` `SECURITY DEFINER` trigger for
  column-level privilege.
- `wallet` / `payout` / `organizer_ledger_entry` are `SELECT`-only for the
  owner; balance moves only via trusted server code.
- **M1 (this branch, applied 2026-09-02):** the six `record_*`
  `SECURITY DEFINER` financial functions had a default `EXECUTE` grant to
  `authenticated` with no caller guard. Every remaining `authenticated`-role
  call path was moved to the service-role client
  (`finalizePaystackPayment` → `record_platform_fee`; `generateTicket` →
  `record_organizer_earning`; `issueRefundCore` → `record_refund_hold` /
  `record_fee_refund_adjustment`), then
  `supabase/migrations/20260903200000_revoke_record_fns_from_authenticated.sql`
  revoked the grant. **Applied via Supabase MCP and verified:**
  `has_function_privilege('authenticated', …, 'EXECUTE') = false` on all six;
  a direct call as `role authenticated` fails with "permission denied";
  `service_role` still executes them; `get_advisors(security)` no longer
  lists any `record_*` under `authenticated_security_definer_function_executable`
  (no new findings).
- **S2 (this branch):** `PendingCheckoutsBasket` called `generateTicket`
  directly from a client component. Replaced with
  `actions/issueFreeCheckoutTickets.ts`, which re-verifies every checkout row
  is pending, caller-owned, and priced at 0 before delegating.
  `generateTicket` moved to `apps/web/src/utils/generateTicket.ts`, dropped
  its `"use server"` directive — it is a server-only module function now,
  imported only by `issueFreeCheckoutTickets` and `paymentFulfillmentDeps`.

## Known residual items

- `apps/web/src/app/api/user-profile/route.tsx` queries a non-existent
  `user_profile_detail` (singular) — pre-existing bug (PROJECT.md §7.6 #1),
  out of scope for this phase.
- Net-new mobile endpoints for event-review write etc. were **not** added —
  mobile already does event reviews as a class-A direct-Supabase flow
  (`apps/mobile/src/features/reviews/useEventReviews.ts`), so there is no gap.
- M2 (add the `CHECK` / `UNIQUE` constraints app logic assumes on
  `ticket_type` / `promo_code` / `ticket.ticket_code`) is not written —
  it needs a data scan for existing violations first.

_Resolved during this phase: `generateTicket` is now a plain server-only
module function; `@abonten/api-client` `ProfileData` / `CheckoutSessionRow`
are properly typed._
