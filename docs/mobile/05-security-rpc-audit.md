# Phase 5.0 — SECURITY DEFINER RPC audit

Read-only audit (Supabase MCP, project `sderrexhawjbmsugndcq`) of every
`public` `SECURITY DEFINER` function and who may `EXECUTE` it, done before
exposing anything to direct `supabase.rpc()` from the shipped mobile bundle.

**Nothing was changed.** Grant changes need a deliberate, signed-off
migration (CLAUDE.md §2).

## Safe for direct `authenticated` calls (incl. from mobile)

Each guards the caller internally, so a hostile client can only touch its
own data:

| RPC | Internal guard |
|---|---|
| `request_organizer_payout` | `auth.uid()`; payout-account ownership + `active`; advisory lock; recomputes available balance from the ledger and rejects over-withdrawal |
| `cancel_event_and_release_tickets` | `UPDATE … WHERE organizer_id = auth.uid()`; raises if not owner / wrong status |
| `get_event_cancellation_impact` | raises unless `organizer_id = auth.uid()` |
| `get_event_refund_breakdown` | returns nothing unless `organizer_id = auth.uid()` |
| `get_event_attendee_contacts` | raises unless event owner (PII gate) |
| `get_organizer_ledger_transactions` / `get_organizer_refund_breakdown` | rows filtered by `le.organizer_id = auth.uid()` |
| `get_transaction_refundable_amount` | read-only numeric; low risk |
| `is_admin` | reads caller's own `user_info` row |

## Over-granted — `authenticated` GRANT is not a real backstop

None of these check the caller. Today only the Paystack webhook (service
role) and `issueRefund.ts` (after admin/organizer checks) call them, so the
web app is not exploiting the gap — but a shipped mobile bundle can call
`supabase.rpc()` on any of them directly.

| RPC | Worst case for a hostile `authenticated` caller | Severity |
|---|---|---|
| `record_refund_hold(p_transaction_id)` | Flip **anyone's** `successful` transaction to `refund_pending` and write negative `refund_hold` entries against organizer balances. Adverse state change, not limited to caller's own data. | **High (griefing/DoS)** |
| `record_platform_fee(p_transaction_id, p_processing_cost)` | `p_processing_cost` is caller-supplied → poison `platform_fee_entry.net_revenue` (RLS-less internal analytics). Idempotent per txn. | Medium (internal data integrity) |
| `record_refund_adjustment` / `record_refund_release` / `record_fee_refund_adjustment` | Write ledger corrections for an arbitrary `transaction_id`. Only meaningful once a `refund_hold` exists, but still unguarded writes. | Medium |
| `record_organizer_earning(p_ticket_checkout_id)` | Prematurely materialise an `earning` row — but it credits the **true** organizer with the **true** price and is idempotent (`ON CONFLICT DO NOTHING`). | Low |

## Recommendation (needs a signed-off migration)

```sql
-- one migration, after review
revoke execute on function
  public.record_refund_hold(uuid),
  public.record_refund_release(uuid),
  public.record_refund_adjustment(uuid),
  public.record_fee_refund_adjustment(uuid),
  public.record_platform_fee(uuid, numeric),
  public.record_organizer_earning(uuid)
from authenticated;
-- service_role keeps EXECUTE; the webhook and issueRefund.ts are unaffected.
```

This is a **pre-existing web posture issue**, not introduced by the mobile
work. But it should land before Phase 5's payment/refund slices.

## Hard rule for Phase 5.x mobile

- Money/refund/fee/earning operations on mobile go through **`/api/mobile/**`
  wrappers of the existing Server Actions** — never `supabase.rpc()`.
- `request_organizer_payout` and `cancel_event_and_release_tickets` are the
  only money-adjacent RPCs safe to call directly from the app (well-guarded),
  and even those are better behind an endpoint for consistent error shapes.
- Direct `supabase` from mobile stays limited to **RLS-protected table
  reads** (discovery, tickets, reviews, favourites, notifications-as-fallback).

## Note: `@abonten/core/pagination` on React Native

`encodeCursor` / `decodeCursor` use Node's `Buffer` (absent in Hermes). The
mobile app must **not import or call those two** — cursors are opaque to
clients by design. `@abonten/api-client` already treats `nextCursor` as a
pass-through string, and the direct-Supabase list hooks (Phase 5.1) keep the
keyset cursor as an in-memory `{ sortValue, id }` object and use only
`keysetOlderThan` (Buffer-free). No `base-64` / `Buffer` polyfill needed
while that holds.
