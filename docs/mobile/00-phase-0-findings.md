# Phase 0 — Prep findings

Read-only groundwork for the mobile migration. Nothing here changes app behaviour or the
database. See `PROJECT.md` for the full web architecture and the published blueprint for the
overall plan.

Date: 2026-08-30 · Supabase project `sderrexhawjbmsugndcq` (Abonten, Postgres 15).

---

## 0.1 — Generated database types

`src/types/database.types.ts` now holds the output of `supabase gen types typescript`
(pulled via the Supabase MCP). 94 table row types, generated `Database` type, `Json` helper.

- **Header** marks it generated / do-not-edit and records how to regenerate.
- Adoption is **incremental**: existing hand-written types in `src/types/*` stay as-is;
  new code and touched queries can start typing against `Database["public"]["Tables"][…]["Row"]`
  and the `.rpc()` return types instead of `as unknown as X` casts.
- In Phase 2 this file moves to `packages/types` and both `apps/web` and `apps/mobile`
  import it.
- `tsc --noEmit` passes with the file added (baseline held).

---

## 0.2 — Security / RLS audit

Method: `list_tables` (RLS flag per table) + `get_advisors(type: security)`.

### RLS coverage — good

**Every table in `public` has RLS enabled** (verified table-by-table). This is the
precondition for letting the mobile app talk to Supabase directly for reads.

### Advisor notices, triaged

| Notice | Tables / functions | Verdict for mobile |
|---|---|---|
| `rls_enabled_no_policy` (INFO) | `favorite_p1..p4`, `user_image_history_0..3`, `review_<month>_<year>`, `review_default` | **Not a gap.** These are partition *leaf* tables; policies live on the partitioned parent and are enforced through it. Access always goes via the parent. |
| `rls_enabled_no_policy` (INFO) | `phone_otp_state`, `phone_otp_send_log`, `platform_fee_entry` | **Intentional and correct.** No policy = deny-all for `anon`/`authenticated`; these are service-role-only tables. Mobile cannot read or write them. Keep it that way. |
| `anon_security_definer_function_executable` (WARN) | `get_event_attendance_count`, `get_event_attendance_counts` | **Acceptable.** Public attendance counts for public event pages; no private data. Safe to call from the mobile app unauthenticated. |
| `authenticated_security_definer_function_executable` (WARN) | `cancel_event_and_release_tickets`, `get_event_attendee_contacts`, `get_event_cancellation_impact`, `get_event_refund_breakdown`, `get_organizer_ledger_transactions`, `get_organizer_refund_breakdown`, `get_transaction_refundable_amount`, `is_admin`, `record_organizer_earning`, `record_platform_fee`, `record_refund_hold`, `record_refund_release`, `record_refund_adjustment`, `record_fee_refund_adjustment`, `request_organizer_payout` | **Review required before Phase 5.** Any signed-in user can invoke these over `POST /rest/v1/rpc/<name>` directly, bypassing the Server Action wrappers. This risk already exists on web (the anon/authenticated keys are public there too), but a mobile client makes direct RPC calls the normal path. |
| `auth_leaked_password_protection` (WARN) | Auth config | Hygiene. Enable HaveIBeenPwned check in the Supabase dashboard. Not a mobile blocker. |
| `vulnerable_postgres_version` (WARN) | Postgres 15.8.1.044 | Schedule a patch upgrade. Not a mobile blocker. |
| `extension_in_public` (WARN) | `pg_trgm` | Cosmetic. Leave unless a broader DB cleanup happens. |

### Action items (each is its own reviewed change — none done here)

1. **Audit the `authenticated`-executable `SECURITY DEFINER` functions above** for internal
   authorization. Expected findings, to confirm by reading each function body:
   - `record_organizer_earning`, `record_platform_fee`, `record_refund_hold/release/adjustment`,
     `record_fee_refund_adjustment` — prices everything server-side from the referenced
     `ticket_checkout` / `transaction`; idempotent. **Confirm** they cannot be abused to
     credit an attacker (e.g. do they check the caller relates to the row?). If not, the
     mitigation is: `REVOKE EXECUTE … FROM authenticated` and only call them from the
     service-role webhook / API — never from a device.
   - `cancel_event_and_release_tickets`, `get_event_cancellation_impact`,
     `get_event_refund_breakdown`, `get_event_attendee_contacts` — must verify
     `event.organizer_id = auth.uid()` internally. `PROJECT.md §21` says
     `cancel_event_and_release_tickets` "has already verified event ownership" — confirm in
     the function source.
   - `request_organizer_payout` — must verify the payout account belongs to `auth.uid()`
     and the amount is within available balance.
   - `get_organizer_ledger_transactions`, `get_organizer_refund_breakdown` — must scope to
     `auth.uid()` (they take no organizer id, so likely fine — confirm).
   - `is_admin` — read-only boolean; harmless.
2. **Rule for the mobile data contract**: money-moving and organizer-finance RPCs are
   **never** called directly from the device — only through the Phase 3 API layer with a
   re-check, or the service-role server paths. Direct-Supabase from the device is limited to
   read-only queries and RLS-protected user-owned CRUD (favorites, reviews, notifications
   read/mark, profile).
3. Enable leaked-password protection; schedule the Postgres patch upgrade. Dashboard-only,
   no migration.

---

## 0.3 — Mobile data contract

Which calls the Expo app makes **directly to Supabase** (anon key + user JWT, gated by RLS)
vs. **through the Phase 3 HTTP API** (`apps/web/src/app/api/mobile/**`, which re-checks auth
and can use server-only secrets).

### Direct to Supabase — read-only & RLS-safe

| Concern | Mechanism |
|---|---|
| Event discovery / search / filter | `rpc("get_filtered_events")`, `rpc("get_nearby_events")`, `rpc("get_similar_events")` — `anon`-granted, no `auth.uid()` reference |
| Place discovery / filter / open-now | `rpc("get_filtered_places")`, `rpc("get_nearby_places")`, `rpc("place_is_open_now")`, `rpc("get_active_place_promotions")` |
| Event / place detail | `.from("event")` / `.from("place")` selects with their child tables (`ticket_type`, `event_occurrence`, `place_photo`, `place_opening_hours`, `place_service`, …) — public rows |
| Public attendance counts | `rpc("get_event_attendance_count(s)")` |
| Reviews (read) | `.from("review")` / `.from("place_review")` / `.from("event_review")` — approved rows |
| Own tickets & attendance | `.from("ticket")` / `.from("attendance")` — RLS scopes to `auth.uid()` |
| Own notifications (read + mark) | `.from("notification")` select + update `read_at` — RLS owner-scoped |
| Own favorites (list / add / remove) | `.from("favorite")` / `.from("favorite_place")` — RLS owner-scoped |
| Own profile (read + update) | `.from("user_info")` / `user_profile_details` view |
| Own transaction history | `rpc("get_user_transaction_history")`, `rpc("get_user_transaction_summary")` — scope to `auth.uid()` internally |
| Search suggestions | `rpc("get_search_suggestions")` |
| Post a review (RLS-gated) | `.from("place_review")` insert; event reviews go through the API (organizer-attendance gate lives in `postReview.ts`) |

### Through the Phase 3 API — auth re-check and/or server secrets

| Concern | Why it can't be direct |
|---|---|
| Phone / OTP sign-in | Hubtel credentials + service-role session mint; must return tokens, not cookies |
| Google OAuth token exchange helper (if needed) | keep parity with `/auth/callback` |
| `validateCheckout` → reserve inventory + price + promo | multi-step atomic reservation with rollback; trust boundary |
| Payment: create/lookup `payment_attempt`, initiate Paystack charge, verify | `PAYSTACK_SECRET_KEY`; `finalizePaystackPayment` must stay authoritative |
| `generateTicket` / `registerForFreeEvent` | QR upload + ledger RPCs + email; must not be client-forgeable |
| Refunds, event cancellation, organizer payouts | `SECURITY DEFINER` money RPCs (see 0.2) — never from device |
| Cloudinary upload signature | `CLOUDINARY_API_SECRET` |
| `createNotification` for another user | `notification` has no INSERT policy — service-role / `SECURITY DEFINER` only |
| Organizer dashboard & finances | aggregation RPCs are `SECURITY DEFINER`; route through API for a consistent surface |
| Promo code validation at checkout | `getPromoCode` applies rules not enforced by RLS |
| Geocoding / Places Autocomplete | Google key + the existing `/api/geocode` rate-limited proxy |
| Ticket PDF | server `@react-pdf/renderer`; return a URL |
| Account deletion | `admin.deleteUser` (service role) |

### Unresolved for later phases

- Confirm `get_user_transaction_history/summary` scope internally to `auth.uid()` (they take
  no user id — likely fine).
- `place_review` insert RLS: confirm the policy matches what `postPlaceReview.ts` assumes
  (one review per user per place is a DB unique constraint, not RLS).
- Whether any `.from()` write the web app does through an action would *also* succeed directly
  under current RLS (it may — that's fine as long as the RLS policy is the real rule and the
  action added no extra validation). Spot-check favorites, reviews, profile update during
  Phase 5.
