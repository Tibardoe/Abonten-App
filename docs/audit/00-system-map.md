# Abonten — System Map (Limitation Audit, 2026-09-04)

Branch: `audit/limitations-2026-09`. This is the reference map the limitations
register (`01-limitations-register.md`) and roadmap (`02-remediation-roadmap.md`)
point back to. It records **where each responsibility actually lives today**, not
where PROJECT.md's older revisions say it lives.

---

## 1. Runtime topology

```
┌───────────────┐   ┌────────────────┐   ┌────────────────┐
│  apps/web     │   │  apps/mobile   │   │  apps/admin    │
│  Next 16      │   │  Expo / RN     │   │  Next 16       │
│  App Router   │   │  Expo Router   │   │  ops console   │
│  Vercel       │   │  EAS build     │   │  Vercel (todo) │
└──────┬────────┘   └───────┬────────┘   └───────┬────────┘
       │ Server Actions      │ HTTPS Bearer JWT   │ Server Actions
       │ (cookie session)    │ /api/mobile/**     │ (cookie + allowlist
       │ ~200 actions        │ 88 route handlers  │  + resolveAdminContext)
       ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/services  —  @abonten/services (server-only)       │
│  framework-free business logic: (supabase, userId, input)    │
│    → { status, message?, data? }                             │
│  domains: checkout · payments · tickets · events · places ·  │
│  organizer · promo-codes · promotions · reviews · reports ·  │
│  notifications · profile · platform · admin/**               │
└───────────────┬──────────────────────────┬──────────────────┘
                │ anon/authenticated client │ service-role client
                │ (RLS enforced)            │ (RLS bypassed — used only
                ▼                          ▼   after an identity check
┌─────────────────────────────────────────────┐   in the caller)
│  Supabase Postgres 15.8 (project             │
│  sderrexhawjbmsugndcq)                        │
│  • RLS on most tables (25 Aug batch 1–7)      │
│  • ~90 RPCs (PostGIS discovery, atomic        │
│    create_event/create_place, ledger/fee      │
│    record_* [service_role only], admin_*)     │
│  • pg_cron: 9 jobs (search refresh, checkout  │
│    expiry ×4, draft cleanup, claim-doc purge, │
│    expired-event delete edge fn, health check)│
│  • partitioned: favorite, user_image_history, │
│    review (monthly); several declared-but-    │
│    empty (see DATA-003)                       │
└─────────────────────────────────────────────┘
```

### Shared packages

| Package | Role |
|---|---|
| `@abonten/services` | **single source of truth for business logic.** Consumed by all 3 apps. Never imported by `apps/mobile` (mobile calls the HTTP API + class-A RLS reads). |
| `@abonten/core` | pure helpers + constants, no server/framework deps (pricing math, date/status, query keys, upload limits, logger, `reportError`). Safe in RN + Node + browser. |
| `@abonten/types` | manual domain types **+ generated `database.types.ts`** (exists but not threaded into every hot path — see TYPE-001). |
| `@abonten/validation` | Zod schemas (event/place/profile/payout/report/review drafts). **No checkout-quantity schema.** |
| `@abonten/api-client` | typed client for `/api/mobile/**`; `check:api-parity` script guards drift. |
| `@abonten/ui-native`, `@abonten/ui-tokens`, `@abonten/i18n`, `@abonten/config` | presentation / config only. |

---

## 2. External dependencies & where each responsibility sits

| Service | Used for | Trust boundary / where it's called |
|---|---|---|
| **Supabase Postgres/Auth** | data, RLS, RPCs, auth (Google OAuth + custom phone-OTP session minting), pg_cron | RLS + per-action `auth.getUser()`. Service-role key server-only (`SUPABASE_SERVICE_ROLE_KEY`), never `NEXT_PUBLIC_`/`EXPO_PUBLIC_` — **verified**. |
| **Paystack** (test mode) | card / mobile-money / OTP charges, webhook, refunds | Init in `@abonten/services/payments/paystackInit` + `gateway/paystackService`. Webhook `apps/web/src/app/api/paystack/webhook/route.ts` — HMAC-SHA512 + `timingSafeEqual` **verified**. Finalization funnels through `finalizePaystackPayment` (client-verify + webhook race safely via a CAS lock on `payment_attempt`). |
| **Cloudinary** | event flyers, place covers/photos, avatars, highlights, **ticket QR images** | Signed uploads (`@abonten/services/uploads/cloudinaryUploadSignature`), size/format limits (`@abonten/core/uploadLimits`). QR upload is the only non-DB step inside `generateTicket`. |
| **Hubtel** | phone OTP send/verify (sign-in + Settings→Security) | server-only (`@abonten/services/profile/hubtelOtpClient`), non-public env vars. Per-phone 60s cooldown + per-IP cap in `phone_otp_send_log` / `phone_otp_state`. |
| **Resend** | transactional email (ticket receipt PDF, etc.) | `after()` in `generateTicket`; React-email templates stay in `apps/web`. |
| **Google Maps / Geocoding** | address geocode, map previews | `apps/web/src/app/api/geocode/route.ts` — **in-memory** per-IP limit (ineffective on serverless — OBS-001). |
| **Sentry** | crash/error (web + admin + mobile, 1 project each, org `abonten-hub`, 3 DSNs) | `@sentry/nextjs` v10 (web/admin), `@sentry/react-native` (mobile). Runs alongside the self-hosted `app_error_event`/`app_error_group` pipeline. Not live-verified. |
| **Self-hosted observability** | `app_error_event`/`app_error_group` (via `@abonten/core/reportError` → `/api/observability/error`), `health_check_result` (pg_cron every 2 min → `/api/observability/health`, `OBSERVABILITY_INGEST_SECRET`), `app_request_metric` (mobile only) | Admin console Monitoring module. Health cron self-reports a synthetic `self` row. |
| **Expo / EAS** | mobile build/submit/OTA, push (`device_token` + Expo push) | `eas.json`; push armed but not device-verified. |
| **Vercel** | web + admin hosting | admin project not yet created (ops item in memory). |

---

## 3. Critical data-flow: paid ticket purchase (the money path)

```
client picks {eventId, quantities, promoCode?, occurrenceId?}
        │  (client supplies quantities + code string ONLY — no price)
        ▼
validateCheckoutCore                          [packages/services/checkout]
  • expire_stale_ticket_checkouts()  (self-heal sweep)
  • block if pending checkout / already bought for this event
  • authoritative sales-window checks (status=published, not ended, occurrence valid)
  • getPromoCodeCore → discount %          (server-side)
  • FOR EACH ticket type: reserveTicketQuantity  (CAS decrement on ticket_type.quantity)
  • computeLineAmount  (server-side price × qty − discount)   [@abonten/core/checkoutPricing]
  • claimPromoUsage
  • INSERT ticket_checkout rows (status=pending, expires_at = now + 30 min)
        │   ⚠ no upper bound on quantity (DOS-001); non-atomic, manual rollback (INV-001)
        ▼
createMultiCheckoutPaymentAttemptCore → paystackInit          [packages/services/payments]
  • INSERT payment_attempt (status=initiated, amount from checkout rows)
  • Paystack transaction init → provider_reference
        ▼
   Paystack popup / direct charge / mobile-money OTP  (client)
        │
        ├── client verify (fast path)  ─┐
        └── webhook (authoritative)  ───┤  both call ▼
                                        ▼
finalizePaystackPayment(supabase, attemptId, deps)            [packages/services/payments]
  • CAS lock: payment_attempt initiated|pending|fulfillment_failed → processing
  • verifyTransaction(reference)  (Paystack)
        │   ⚠ transient/network error → marks 'failed' PERMANENTLY (FIN-003)
        │   ⚠ crash after lock → stuck 'processing', not re-enterable (REL-001)
  • INSERT transaction (status=successful)   — idempotent via paystack_reference UNIQUE
  • deps.issueTickets(checkout_session_id, transactionId, meta, authOverride)
        ▼
generateTicket  [apps/web/src/utils — NOT in @abonten/services: uses revalidatePath/after]
  • expire_stale_ticket_checkouts()  + re-read checkout
  • alreadyBought guard → returns status:300  ⚠ retry black hole (FIN-001)
  • FOR EACH checkout row:
      – generate QR + upload to Cloudinary (concurrent)
      – INSERT ticket rows (batch)          ⚠ partial commit across rows (FIN-001)
      – insertUserAttendanceCore
  • UPDATE ticket_checkout → status=paid
  • record_organizer_earning(checkout_id)   ⚠ errors swallowed (FIN-002)
  • record_platform_fee(transaction_id)     (best-effort by design — OK)
  • revalidatePath(...) ; after(() => email) ; createNotificationCore
```

**Nothing in this chain is a database transaction.** Each step is a separate
PostgREST round-trip. The register's FFIN-/REL-/DATA- items all trace to this.

## 4. Critical data-flow: organizer earnings → payout

```
generateTicket → record_organizer_earning  (SECURITY DEFINER, service_role only)
   → organizer_ledger_entry (entry_type='earning', amount = 100% of ticket price)
        │
   is_event_settled(event_id)  — true 48h after event end
        ▼
request_organizer_payout(account, amount, currency)  (SECURITY DEFINER, authenticated;
   internal checks: account ownership + status, pg_advisory_xact_lock per
   organizer+currency, available = Σ settled earning/refund entries + Σ payout entries,
   reject if amount > available)   ✅ this RPC is solid
        ▼
   payout row + organizer_ledger_entry (entry_type='payout_hold', −amount)
        ▼
admin_settle_payout / admin_create_payout  (SECURITY DEFINER, service_role only,
   finance.payout permission + step-up + audit)  — NO Paystack transfer integration yet
```

## 5. Auth / authorization layers

| Layer | Mechanism |
|---|---|
| Route gate (web) | `apps/web/src/proxy.ts` (Next 16 renamed middleware) — public-path allowlist, else redirect to `/auth/signin`. `/api/mobile/**` excluded from the cookie session middleware. |
| Per-call (web) | every Server Action re-checks `supabase.auth.getUser()`. |
| Per-call (mobile) | `getMobileAuth(req)` — validates Bearer JWT via `auth.getUser()`, returns an anon-key client with the token attached so RLS sees `auth.uid()`. **Verified correct.** |
| Row access | RLS on most tables. Privileged writes (ledger/fee, cross-user notification inserts, inventory CAS) run on the **service-role client, only after the caller's identity/ownership is proven** in the service function. |
| Admin | Supabase OAuth + `ADMIN_EMAIL_ALLOWLIST` + `resolveAdminContext()` per request + `admin_role_permission` live matrix + step-up re-auth for ban/finance/settings + append-only `admin_audit_log`. |

## 6. Background jobs (pg_cron)

| Job | Schedule | Failure behaviour |
|---|---|---|
| `refresh_search` (matview) | */15 min | silent on failure; no alert |
| `expire-stale-ticket-checkouts` / `-subscription-` / `-place-promotion-` / `-event-promotion-` | */5 min | releases inventory/promo usage from **expired checkout rows only** — orphaned reservations & in-flight payments not covered (INV-001, DATA-001) |
| `cleanup-expired-drafts` | */30 min | queues Cloudinary asset cleanup |
| `purge-reviewed-claim-documents` | 03:00 | storage retention |
| `cleanupExpiredEvents` | 00:00 | `net.http_get` to an edge function, `timeout_milliseconds:=1000` — **service-role JWT is inline in the cron command** (SEC-004) |
| `abonten-health-check` | */2 min | self-reports; feeds Monitoring |

No job has retry/dead-letter/duplicate-execution protection beyond each function's
own idempotency. No cron reaps stuck `payment_attempt` rows (REL-001).
