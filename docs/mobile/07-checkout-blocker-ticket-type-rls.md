# Phase 5.7 blocker — buyer cannot decrement `ticket_type.quantity` (pre-existing web bug)

**Status: RESOLVED 2026-08-31.** Fix: `src/utils/ticketInventory.ts`
(`reserveTicketQuantity` / `releaseTicketQuantity`) now builds the
**service-role client** (`getSupabaseServiceClient()`) instead of the cookie
client — that file was already server-only and only reachable through
Server Actions that do their own auth, so this changes no security posture,
adds no callable surface, and needs no migration. The compare-and-swap
`UPDATE` is unchanged and is still what prevents oversell. Verified on the
live DB (rolled back): a `service_role` reserve `UPDATE` affects 1 row where
the buyer's affected 0. Web build + typecheck green. Option A below (SD
RPCs) was considered and rejected — it would have added a buyer-callable
`reserve_ticket_quantity` RPC, a new stock-drain / oversell surface.

Original report follows.

---

Surfaced 2026-08-31 while starting the mobile checkout slice. **Not caused
by the mobile work** — it was a live web-app bug.

## What is broken

`validateCheckout` reserves inventory by calling
`src/utils/ticketInventory.ts` → `reserveTicketQuantity`, which does an
application-level compare-and-swap:

```ts
await supabase
  .from("ticket_type")
  .update({ quantity: ticketType.quantity - requestedQuantity })
  .eq("id", ticketTypeId)
  .eq("quantity", ticketType.quantity)
  .select("id");
```

This runs on the **cookie SSR client** (`@/config/supabase/server`
`createClient()`, anon key + user session → role `authenticated`), i.e. as
the **buyer**.

`ticket_type` RLS (from `20260825105356_enable_rls_events_batch2.sql`,
narrowed by `20260903110000`) has exactly two policies:

| policy | cmd | who |
|---|---|---|
| `ticket_type_public_select` | SELECT | anyone, published/canceled events |
| `ticket_type_organizer_all` | ALL | **only** `event.organizer_id = auth.uid()` |

There is **no policy letting a buyer UPDATE `ticket_type`**. So the CAS
update matches zero rows for a buyer, `reserveTicketQuantity` hits its
`!updated || updated.length === 0` branch and returns

```
{ status: 409, message: "This ticket was just claimed by someone else. Please try again." }
```

and `validateCheckout` rolls back and returns 409.

## Evidence (live DB, project `sderrexhawjbmsugndcq`, read-only / rolled back)

```
-- as buyer (non-organizer authenticated uid):   UPDATE ticket_type ... -> rows_affected = 0
-- as the event's organizer:                     UPDATE ticket_type ... -> rows_affected = 1
```

Ticket-type inventory in the DB today:

```
total = 11   finite quantity = 11   unlimited (quantity IS NULL) = 0   finite & paid = 8
```

Every ticket type is finite, so **every** real checkout hits the blocked
path. Unlimited (`quantity IS NULL`) ticket types would be fine —
`reserveTicketQuantity` returns early at `status: 200` before the UPDATE —
but there are none.

The rest of the checkout write path is fine for a buyer (verified): `ticket`
owner-insert/update, `attendance` owner-insert, `transaction` owner-insert,
`payment_attempt` / `payment_method` owner-*. **`ticket_type` quantity
mutation is the only gap.**

## Blast radius (all web, all pre-existing)

- `validateCheckout` → `reserveTicketQuantity` — paid **and** free
  finite-quantity events.
- `registerForFreeEvent` → `reserveTicketQuantity` — free finite-quantity
  events (one-click RSVP).
- `cancelTicketCheckoutSession`, stale-checkout expiry, `cancelUserTicket`,
  `generateTicket` rollback → `releaseTicketQuantity` — same missing buyer
  UPDATE, so inventory is never given back either.

## Options

**A — SECURITY DEFINER reservation RPCs (recommended).** One signed-off
migration adding `reserve_ticket_quantity(p_ticket_type_id uuid, p_qty int)`
and `release_ticket_quantity(...)` as `SECURITY DEFINER` functions owning the
CAS, `GRANT EXECUTE ... TO authenticated`. Rewrite `ticketInventory.ts` to
call them. Fixes web for real, and mobile reuses the exact same path with
**no behaviour fork**. Cost: DB migration + change to live inventory code +
its own test pass.

**B — narrow buyer UPDATE policy on `ticket_type`.** Add a permissive
`FOR UPDATE TO authenticated` policy. Hard to scope safely — a plain
`USING (true)` lets any buyer rewrite any ticket type's `quantity` (and
`price`, `type`, …) directly. Column-level UPDATE privilege + a guard helps
but is fiddly. Not recommended.

**C — pause the mobile checkout phase.** Keep mobile work strictly additive;
hand this web bug to whoever owns web checkout. Meanwhile do non-checkout
mobile slices (organizer read-only surfaces, push-notification groundwork,
Phase 6 EAS/build setup). Resume 5.7 once web checkout is fixed.

**D — mobile checkout runs service-role now.** Mobile would work while web
finite-quantity checkout stays broken — an explicit, temporary behaviour
fork in the money path. Against the project rules; only as a stopgap if the
web fix is imminent.

## Recommendation

**A** if the team wants checkout fixed now (it is currently broken for all
real events on web) — but it needs sign-off (migration + live payment-code
change). **C** if the mobile effort should stay additive and the web
checkout bug is owned/triaged separately.
