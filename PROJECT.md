# Abonten Hub — Project Documentation

This document describes the current, verified state of the codebase for future development and AI-assisted coding. Everything under "Confirmed" was directly observed in the repository (code, config, or git history) at the time of writing. Items that could not be verified are explicitly marked "Needs Investigation" rather than assumed.

> **Revision note (2026-08-10):** Section 7 (Database / Supabase Structure) was rewritten from the actual pulled schema at [supabase/migrations/20260810084821_remote_schema.sql](supabase/migrations/20260810084821_remote_schema.sql), replacing the earlier version's table/column/relationship guesses that were inferred only from application query strings. Several confirmed discrepancies between the app code and the real schema were found in the process — see §7.6 — and related notes in §9, §16, and §17 were updated to match.

> **Revision note (2026-08-20):** Added §18 (Places Feature) documenting the new Places Discovery feature — a second first-class content type alongside Event, built incrementally across nine milestones and finished with this polish pass. Covers the new routes, the `place`/`place_category`/`place_photo`/`place_opening_hours`/`place_service`/`place_review`/`place_report`/`favorite_place`/`place_analytics_event` tables (plus the additive `event.place_id`), the new RPCs, and the Server Actions added under `src/actions/`. Verified against [supabase/migrations/20260820090000_add_places_feature.sql](supabase/migrations/20260820090000_add_places_feature.sql) and [supabase/migrations/20260821090000_add_place_id_to_create_event.sql](supabase/migrations/20260821090000_add_place_id_to_create_event.sql), the same way §7 was verified against its own migration file rather than assumed from application code.

> **Revision note (2026-08-21):** Applied §18's two Phase 1 migrations to the live database (previously undeployed — see §18's resolved note for how the pre-existing, unrelated migration-history drift was worked around) and fixed an unrelated, pre-existing bug found in the process: `get_organizer_finance_overview()`'s `RETURNS TABLE(currency text, ...)` created an implicit `currency` OUT-parameter colliding with real `currency` columns referenced unqualified in its CTEs, making `/finances` error on every load — fixed in a new migration qualifying every reference. Added §20 documenting Places Phase 2 (Milestones 2–5: Claim/Verification, Map/List view, Bookings, Featured Places paid promotion) — all migrations applied and verified live the same way as §18.

> **Revision note (2026-08-25):** An authentication/session-management audit found that every "no RLS policies exist" statement in this document (§7.1, §7.2's `notification` row, §7.6 items 6a/6c, §8's Needs Investigation, §17, §19) was stale — RLS was enabled on most tables via seven `enable_rls_*`/`security_cleanup_*` migrations dated 2026-08-25, after this document's previous revision. All affected passages were corrected in place rather than left standing; §7.1 and §8 carry the fullest explanation. Also fixed and documented: the middleware's duplicate `/auth` allowlist entry and its unintended `/user-account` public-route exposure (§7.6 item 7, §8). §8's description of phone/OTP as "incomplete" and of a `src/context/authContext.tsx` provider is also now out of date (phone/OTP is complete; there is no `authContext.tsx`) — flagged inline in §8 but not rewritten in full, as that was out of scope for this pass.

> **Revision note (2026-08-26):** The generic Membership/Plans product (a `/plans` page selling `subscription_plan` rows — "Daily/Weekly/Monthly/Unlimited" — via `/settings/membership`) was removed from the application layer. It is superseded by two already-existing, resource-specific promotion systems documented in §18/§20 and a newer one not previously written up here: **Event Promotion** (`event_promotion`/`event_promotion_checkout`/`event_promotion_tier`, migration `20260829090000_add_event_promotions.sql`, mirroring Featured Places exactly), purchased from `Manage → Events → [event] → Promotion`, same pattern as Featured Places' `Manage → Places → [place] → Promotion`. Neither promotion system ever shared code with Membership/Plans beyond generic payment plumbing (`payment_attempt`, `PaymentMethodSelector`, `finalizePaystackPayment.ts`, `/checkout/[checkoutId]`), so removal was a clean extraction, not an untangling. **What changed:** `/plans` and `/settings/membership` now redirect to `/settings/overview` instead of rendering the old UI (kept as thin redirect routes so old bookmarks/links don't 404); the `/settings` and `/settings/overview` pages' old "Plan Details" block was replaced by a new `PromotionDetails` organism (`src/settings/organisms/PromotionDetails.tsx`) backed by a new action, `getUserActivePromotions.ts`, which aggregates the signed-in user's currently-active `event_promotion`/`place_promotion` rows across every Event/Place they own; the Membership sidebar nav link, its `nav.membership` translation key (all 6 locales), `SubscriptionPlans.tsx`/`PlanContainer.tsx`/`src/data/plans.ts`, and the subscription-purchase actions (`getUserSubscription.ts`, `activateSubscription.ts`, `insertSubscriptionCheckout.ts`, `getSubscriptionCheckout.ts`) and type (`subscriptionType.ts`) were deleted; the `"subscription"` checkout kind was removed from `PaymentMethodSelector.tsx`, `/checkout/[checkoutId]/page.tsx`, `createPaymentAttempt.ts`, `paymentAttempt.ts`'s match-column unions, `paymentStatusCopy.ts`, `OrderSummary.tsx`, and `finalizePaystackPayment.ts`'s fulfillment branch (see trade-off below). **What was deliberately preserved (no DB migration was made — see §7.6 discrepancy #2's `Plan_Purchase`/`Promotion_Purchase` reason values, still both valid on `transaction`):** the `subscription`/`subscription_plan`/`subscription_checkout` tables, their RLS policies, and their RPCs (`compute_subscription_end_date`, `expire_stale_subscription_checkouts`) were left completely untouched at the database level — this was an application-layer-only removal (Phase 12 Option A). `/transactions`, `/transactions/[kind]/[id]`, `TransactionsHistoryList.tsx`, `TransactionsSummaryCards.tsx`, and their backing actions still read historical `subscription_checkout` rows via the existing `get_user_transaction_history`/`get_user_transaction_summary` RPCs — a past Membership purchase remains fully visible in a user's transaction history, unchanged. **Known, deliberate trade-off:** `finalizePaystackPayment.ts` no longer has a branch to activate a subscription upon Paystack verification — if any `payment_attempt` row from before this change is still sitting in `initiated`/`pending`/`fulfillment_failed` with a populated `subscription_checkout_id` and a delayed webhook delivery arrives for it, that payment will no longer be completable via the normal flow (it was judged low-probability given Paystack has only ever run in test mode, and is documented here rather than silently accepted).

> **Revision note (2026-08-27):** UX/UI polish pass across checkout, wallet, tickets, event/place discovery cards, popups, and the landing/explore page (no schema changes). Of lasting documentation relevance: (1) **every hand-rolled modal overlay in the app was migrated onto one shared primitive**, `src/components/atoms/ModalShell.tsx` (built on the already-installed `@radix-ui/react-dialog`, not a new dependency) — real focus-trap, Escape-to-close, and a single consistent `bg-overlay/50` backdrop now come from one place instead of ~20 independently hand-copied `fixed ... bg-overlay/NN z-NN` divs; `ConfirmDeleteModal`/`SaveDraftConfirmDialog` sit on a matching new `src/components/ui/alert-dialog.tsx`. `AuthModal` was deliberately left alone — despite its name, it's `/auth/signin`'s actual page content, not a dismissible popup. (2) Corrected several now-stale claims elsewhere in this document that all trace back to one root cause — they were written before Paystack's payment/refund pipeline was finished and never revisited: `payment_attempt` reaching `succeeded`/`failed` (§7.2, §16 items 5/18), `payment_method` no longer being partition-less (§7.5/§16 item 6b — it was fixed 2026-08-16 but this document's summary lists weren't updated to match its own §7.2 entry), `issueRefund` no longer being a stub (§5's Transactions entry), and bank cards being tokenized via a real Paystack charge rather than "no tokenization provider integrated" (§5's Wallet entry). Also removed `RefundButton` from §9's component inventory (deleted by §21, but the inventory list was never updated). See the corrected passages themselves for what's now accurate — not repeated here.

> **Revision note (2026-09-03):** Advanced mobile UX refinement pass (branch `feat/mobile-ux-refinement-advanced`). Two changes of lasting documentation relevance: **(1) First Supabase Storage bucket in the project.** Every other upload in the app goes to Cloudinary as a *public* delivery URL; place-claim supporting documents (proof of ownership / authorization — §12) are sensitive, so migration `20260903190000_add_place_claim_documents.sql` adds a **private** bucket `place-claim-documents` (`public=false`, 10 MB, image/* + pdf), `storage.objects` RLS scoped to it (`(storage.foldername(name))[1] = auth.uid()::text` for the claimant, plus `public.is_admin()` for reviewers), a `place_claim_document` metadata table (FK → `place_claim_request` ON DELETE CASCADE; claimant insert/select/delete + admin select RLS), and a service-role-only `purge_reviewed_claim_documents(interval)` retention function. Object key layout: `<claimant_id>/<claim_request_id>/<uuid>.<ext>`. Mobile `ClaimPlaceSheet` uploads via `supabase.storage` (RLS-gated, no `/api/mobile` route); web admin `AdminPlaceClaimsList` views them via short-lived signed URLs (`getPlaceClaimDocuments.ts`, admin-gated). New mobile dep: `expo-document-picker`. Applied live via MCP + verified with `get_advisors` (one follow-up needed: Supabase auto-grants EXECUTE on new public funcs to `anon`/`authenticated`, so the purge fn's grants were explicitly revoked — folded into the migration file). **(2) Shared checkout guard.** `@abonten/services/checkout/validateCheckoutCore` (the paid path) gained the sales-window guards the free path (`registerForFreeEventCore`) already had — event must be `published`, whole-event-ended → 409, selected past occurrence → 409 — so an ended/canceled event or a past date can no longer open a paid checkout even from a stale/tampered client (web UI already blocked this; behaviour is unchanged for normal users). Also: a shared status design system in `@abonten/ui-native` (`resolveStatus`/`StatusPill`) now backs Finances / Transactions / Payouts / Tickets / organizer dashboards so a given status reads identically everywhere. **(3) Mobile network layer.** `@react-native-community/netinfo` (new dep) is wired into TanStack Query's `onlineManager` (`src/lib/network.ts`); `queryClient` now uses `networkMode: "offlineFirst"` for queries (attempt once offline → screen's own error/retry state, not an infinite spinner) and `networkMode: "online"` + `retry: 0` for mutations (never silently re-fire a payment/cancel/claim). A root `OfflineBanner` shows when offline; `queryClient`'s `QueryCache.onError` + `SessionProvider` force a sign-out + full cache clear on a JWT-expired/401/`PGRST301` error so an expired or revoked-elsewhere session can't leave stale data or a broken screen. New mobile deps this pass: `@react-native-community/netinfo`, `expo-document-picker` — both need a dev-client/EAS rebuild. New cron job `purge-reviewed-claim-documents` (migration `20260903200000`, daily 03:00).

> **Revision note (2026-08-26, later same day):** Added §21 (Event Cancellation → Refund Flow) — organizer event cancellation now atomically cancels affected tickets/attendance/checkouts, notifies every affected attendee in-app (and by email for paid attendees), and drives the existing Paystack refund pipeline, none of which `cancelEvent.ts` did before this change (it only flipped `event.status`). Also removed the dead, unwired `RefundButton.tsx` stub that appeared on every event card's menu for every user. See §21 for full detail. In auditing this, found **10 migrations applied to the live database between `20260829090000_add_event_promotions.sql` (this document's prior latest-documented migration) and this change's own migration, none previously written up here**: `20260829090100_add_event_promotion_checkout_expiry`, `20260829090200_add_compute_event_promotion_end_date`, `20260830090000_add_event_explore_columns_to_get_filtered_events`, `20260901090000_add_event_review_lifecycle`, `20260902090000_add_search_suggestions`, `20260902100000_durable_phone_otp_state`, `20260902110000_fix_promotion_fulfillment`, `20260902120000_add_public_attendance_count_rpcs`, `20260902130000_multi_type_event_filter`, `20260902140000_fix_event_type_serialization` — none touch `ticket`/`transaction`/`ticket_checkout`/`payment_attempt`/`attendance` directly (closest is `20260902110000`'s `payment_attempt` status-check widening, already reflected in §7.3), so nothing in §7 needed correcting because of them, but a future documentation pass should give them a proper write-up rather than this placeholder list. Also confirmed live (via the Supabase advisors tool) that this repo's known migration-history drift (§18's resolved note) is still present: several migrations are applied to the live database under a different recorded version/timestamp than their local filename suggests (e.g. the local `20260902140000_fix_event_type_serialization.sql` is recorded remotely as version `20260826100454`) — pre-existing, not caused by this change, not fixed here (out of scope).

---

## 1. Project Purpose & Overview

**Confirmed**
- App name (from metadata): "Abonten Hub | Connecting people to experiences" ([src/app/layout.tsx](src/app/layout.tsx)).
- It is an event discovery and ticketing platform. Users can browse/search events, view event detail pages, buy tickets (with QR codes and PDF/email receipts), and organizers can create events, manage attendance, and set up payout accounts (Mobile Money or Bank).
- Location data strongly targets Ghana: default country code `"GH"` in [src/proxy.ts](src/proxy.ts), Ghanaian place names in [cache/*.json](cache), Hubtel (Ghanaian SMS/payment provider) integration, GHS-oriented mobile money fields.

**Needs Investigation**
- No product requirements document exists — [PRD.md](PRD.md) only contains "Coming Soon...".
- Business model (free platform, commission on tickets, paid resource promotion) — the generic Membership/Plans subscription product was removed 2026-08-26 (see the revision note above); the current purchasable product is paid Event/Place promotion (§18, §20), but the actual pricing/business terms behind it are not documented in-repo beyond the seeded tier tables.

---

## 2. Tech Stack

**Confirmed** (from [package.json](package.json))
- Framework: Next.js **16.3.0**, App Router, `next dev --turbopack`, `output: "standalone"` build ([next.config.ts](next.config.ts)).
- UI: React **19.2.8** / react-dom 19.2.8.
- Language: TypeScript, `strict: true` ([tsconfig.json](tsconfig.json)).
- Styling: Tailwind CSS 3.4, `tailwindcss-animate`, `tailwind-scrollbar-hide`, shadcn/ui ("new-york" style, see [components.json](components.json)), Radix UI primitives (`label`, `popover`, `slider`, `slot`).
- Forms: `react-hook-form` 7 + `@hookform/resolvers` (zod resolver) + `zod` 3.
- Data/cache: `@tanstack/react-query` 5 (provider wired app-wide; adoption is partial — see §11).
- Backend/DB/Auth: `@supabase/supabase-js` + `@supabase/ssr`.
- Media: `cloudinary`, `@cloudinary/react`, `@cloudinary/url-gen`, `next-cloudinary`, `react-image-crop`, `html2canvas`.
- Documents/QR: `qrcode`, `jspdf`, `@react-pdf/renderer`.
- Email: `resend`, `react-email` / `@react-email/components`.
- Maps/location: `@react-google-maps/api`.
- SMS/OTP: `twilio`, plus direct REST calls to Hubtel's OTP API.
- i18n: `next-intl` (active — see §16 revision note).
- Tooling: Biome (lint/format, primary linter per [biome.json](biome.json)), ESLint (`eslint-config-next`, secondary), Lefthook (git hooks, pre-commit runs Biome — [lefthook.yml](lefthook.yml)).
- Deployment: multi-stage Docker build ([Dockerfile](Dockerfile)) — base → prod-builder → prod-runner (Next standalone output) / dev stage; `compose.yaml`, `docker-compose.override.yml`, `docker-compose.prod.yml` also present.

---

## 3. Application Architecture

**Confirmed**
- Single Next.js App Router monolith. No separate deployed backend service — `apps/web` **is** the backend, by design (modular monolith).
- **Business logic lives in the framework-free `@abonten/services` package** (`packages/services/src/<domain>/`), the single source of truth: `(supabase, userId, input) => { status, message?, data? }`. Two thin transports consume it — web **Server Actions** (`apps/web/src/actions/**`, cookie session) and the **mobile HTTP API** (`apps/web/src/app/api/mobile/**` route handlers, Bearer JWT via `getMobileAuth`, typed by `@abonten/api-client`). `apps/mobile` never imports `@abonten/services`; it calls the HTTP API plus direct `supabase.*` for RLS-safe class-A reads. Full picture, incl. the A/B/C operation classification and the M1/S2 security changes: [docs/architecture/shared-backend.md](docs/architecture/shared-backend.md). (Established on `feat/shared-backend-architecture`, 2026-09-02.)
- Data mutations/reads for app logic go through those **Server Actions** (`"use server"` files in [src/actions/](src/actions)) called directly from client/server components — not a REST/GraphQL layer for the web app. Non-trivial actions are thin wrappers over an `@abonten/services` function.
- Route handlers under `src/app/api/` that are NOT `/api/mobile/**` (HTTP-semantics cases — webhooks/uploads/proxying, not general CRUD):
  - [src/app/api/geocode/route.ts](src/app/api/geocode/route.ts)
  - [src/app/api/upload-profile-picture/route.ts](src/app/api/upload-profile-picture/route.ts)
  - [src/app/api/user-profile/route.tsx](src/app/api/user-profile/route.tsx)
- Auth/session refresh + coarse route protection happens in [src/proxy.ts](src/proxy.ts) (Next.js 16's renamed `middleware.ts` — confirmed via `git show` of the "Project upgrade from next js 15 to 16" commit, which did a literal `middleware.ts → proxy.ts` rename).
- Every sensitive Server Action re-verifies `supabase.auth.getUser()` itself, in addition to the proxy-level check (defense in depth).
- Supabase is accessed through three separate client factories, each for its execution context:
  - [src/config/supabase/client.ts](src/config/supabase/client.ts) — browser client (`createBrowserClient`), used in client components/hooks.
  - [src/config/supabase/server.ts](src/config/supabase/server.ts) — server/RSC/Server Action client (`createServerClient` + `next/headers` cookies).
  - [src/config/supabase/middleware.ts](src/config/supabase/middleware.ts) — middleware client (`updateSession`) used by `proxy.ts`.
- No generated Supabase database types exist in the repo (no `database.types.ts` or similar). Query results are manually typed / cast (e.g. `as unknown as TicketWithEvent[]` in [src/actions/generateTicket.ts](src/actions/generateTicket.ts) and [src/actions/validateCheckout.ts](src/actions/validateCheckout.ts)).

---

## 4. Folder Structure

```
src/
  app/                     Routes only (App Router)
    (landing)/             Public marketing/landing route group
    (pages)/               Main authenticated-app shell (header/footer/mobile nav layout)
      (settings)/          Settings route group + its own layout
      (transactions)/      Transactions route group + its own layout
      (userPage)/           /user/[username]/* route group + its own layout
      around-you/, auth/, events/, manage/, plans/ (redirect-only, see revision note), search/, user-account/, wallet/
    api/                   geocode, upload-profile-picture, user-profile route handlers
    layout.tsx, globals.css
  actions/                 ~50 "use server" Server Actions — the app's data/mutation layer
  components/
    atoms/ molecules/ organisms/ ui/ lib/   Shared UI, atomic-design layered; ui/ = shadcn primitives
  config/supabase/         client.ts, server.ts, middleware.ts
  context/                 authContext/authProvider (session/user/loading)
  providers/               ReactQueryProvider
  hooks/                   useCountries, useUserLocation, useUserProfile
  services/                authService (Supabase auth + Hubtel OTP calls), googleApi, restCountriesApi
  data/                    Static/dummy data + local lookup tables (languages, plans, event categories, etc.)
  types/                   Hand-written TypeScript types (no DB-generated types)
  i18n/                    next-intl routing/navigation/request config (active — see §16)
  events/, wallet/, settings/, userAccount/, "landing Page"/
                           Feature-specific atomic-design folders (atoms/molecules/organisms/templates),
                           separate from the shared src/components tree
  utils/                   Helpers: zod schemas (eventSchema, receivingAcountSchema), slug/code generators,
                           geocoding, share URLs, network-provider data, etc.
messages/en.json           next-intl message catalogue (active — see §16)
cache/*.json               Precomputed per-locality "daily event" JSON snapshots
```

**Note (verified, not fixed by me):** the folder `src/landing Page` contains a literal space in its name.

**Needs Investigation**
- How/whether `cache/*.json` files are regenerated (no cron job or generation script was found in this pass).

---

## 5. Major Features (confirmed via route tree + actions)

- **Event discovery**: landing page, `/events`, `/events/location/[location]` (+ `explore/[type]`, `explore/similar-events`), `/search`, `/search/[searchTitle]`, `/around-you`.
- **Event detail & purchase**: `/events/[eventCode]`.
- **Event creation/management** (organizer side): `/manage/my-events`, `/manage/attendance/attendance-list`, `/manage/attendance/event-list`; actions `postEvent`, `deleteEvent`, `cancelEvent`, `getOrganizerEvents`.
- **Organizer Dashboard**: `/manage/dashboard` — cross-event overview (gross sales, tickets sold/registrations, active events, sales timeline chart, event performance ranking, upcoming events, needs-attention rules, recent activity), distinct from the single-event `EventAnalyticsDashboard` on `/manage/attendance/attendance-list`. Aggregation happens in six Postgres RPCs (`get_organizer_dashboard_overview`, `..._sales_timeline`, `..._event_performance`, `..._upcoming_events`, `..._needs_attention`, `..._recent_activity` — `supabase/migrations/20260816230724_add_organizer_dashboard_analytics.sql`), each scoped to `auth.uid()` internally (no organizer-id parameter accepted anywhere) and restricted to the organizer's `published` events; actions in `src/actions/getOrganizer{DashboardOverview,SalesTimeline,EventPerformance,UpcomingEvents,NeedsAttention,RecentActivity}.ts`. Nav link gated on actual organizer status (`useIsOrganizer()` in `src/hooks/useCurrentUser.ts`, wired from the previously-disabled `getUserEventRole` action) rather than "any signed-in user" like My Events/Manage Attendance. Not the same concept as `/transactions` (that page is the signed-in user's own payment/purchase history as a buyer — see below — organizer gross sales are a separate query against `ticket_checkout.total_price WHERE status='paid'`, scoped by event ownership, not by buyer `user_id`).
- **Ticketing**: `validateCheckout` → `generateTicket` (QR-coded tickets), `cancelUserTicket`, `issueRefund`, `getTickets`, `getUserAttendingEvents`, ticket PDF (`TicketModal.tsx`, via `html2canvas`+`jspdf`) and email (`ticketPurchaseNotification`, `TicketPurchaseEmailTemplate.tsx`).
- **Promo codes**: `getPromoCode`, `InsertPromoCodeUsage`.
- **User profile & social**: `/user-account`, `/user-account/[username]`, `/(userPage)/user/[username]/{favorites,posts,reviews}`; actions `getUserDetails`, `getUserProfileDetails`, `updateUserDetails`, `getUserPosts`, `getUserFavoritePosts`, `getUserReviews`, `postReview`, `getUserRating`, `getUserHighlights`, `uploadHighlight`.
- **Favorites**: `addEventToFavorite`, `removeEventFromFavorite`, `checkIfEventIsFavorited` (React Query optimistic update per recent commit history).
- **Wallet / saved payment methods**: `/wallet` — independent of checkout, lists/adds/removes the user's saved payment methods (`payment_method` table) via `getUserPaymentMethods`/`addPaymentMethod`/`removePaymentMethod`/`setDefaultPaymentMethod`; components `WalletManager`, `PaymentMethodCard`, `AddMomoWallet`, `AddBankCard`, `AddPaymentMethodPopup`. Only non-sensitive display data is stored in `payment_method.details` (network/brand, last 4 digits, expiry, label) — no full card number/CVV/PIN/mobile-money number ever touches this app's own storage. **Correction: Paystack itself is the tokenization provider** for bank cards — `AddBankCard.tsx` runs a real GHS 1 Paystack charge (`initCardVerification`/`confirmCardVerification.ts`) to obtain a reusable Paystack authorization code, which is what's actually stored and later charged against; the GHS 1 is refunded immediately. Mobile money wallets are saved as display data only (no verification charge). Distinct from the separate `wallet` table (a cash/store-credit balance concept, unused by the app). Payout accounts (organizer side) remain a separate concept — `postEvent` inserts into `receiving_account` (Mobile Money or Bank).
- **Checkout / order basket**: `/checkout`, `/checkout/[checkoutId]` (moved from `/wallet/[checkoutId]` — see §16 item 18) — the pending-checkout "basket" (`PendingCheckoutsBasket`) and single-session order summary/payment step, shared by ticket and subscription checkout via `PaymentMethodSelector`.
- **Subscriptions/plans**: removed 2026-08-26 (see the revision note above) — `/plans` and `/settings/membership` are now thin redirects to `/settings/overview`, and the `subscription`/`subscription_checkout`/`subscription_plan` tables are no longer written to by the application, though they remain in the schema for historical transaction reads.
- **Transactions**: `/transactions` — redesigned 2026-08-17 into an analytics overview (period-filterable stat tiles: Total/Successful/Pending/Failed/Tickets Purchased/Subscriptions + Amount Spent, DB-aggregated) plus an independently-paginated history list, `/transactions/[kind]/[id]` (`kind` = `ticket`|`subscription`) for detail. **Sourced from `ticket_checkout`/`subscription_checkout`, not the `transaction` table** — see §7.6 discrepancy #2: nothing in this codebase ever inserts a `transaction` row, so the page that used to read from it (`/transactions/[transactionId]`, `/transactions/date/[date]`, actions `getUserTransactions`/`getTransactionsByDate`/`getTransactionById`) was always empty and has been removed. New actions: `getUserTransactionSummary` (RPC `get_user_transaction_summary`), `getUserTransactionHistory` (RPC `get_user_transaction_history`, a `UNION ALL` merge of both checkout tables with SQL-side keyset pagination), `getUserTransactionDetail`. RPCs + `(user_id, created_at, id)` indexes on both checkout tables added in `supabase/migrations/20260817090000_add_user_transaction_history_analytics.sql`. User/attendee view only — no organizer-facing transactions view exists (organizer revenue stays on `/manage/dashboard`, a separate feature). **Correction (2026-08-27): refund tracking is implemented, not a stub** — `issueRefund.ts` calls Paystack's real refund API and records the result via the `record_refund_hold` RPC (see §21/§16 item 5), and a cancelled paid ticket's transaction moves to `refund_pending`/`refunded` rather than staying misreported as a successful transaction.
- **Settings**: `/settings`, `/settings/edit-profile`, `/settings/language`, `/settings/membership` (redirect only, see revision note above), `/settings/overview`, `/settings/security`, `/settings/switch-appearance`.
- **Auth**: `/auth/signin`.
- **Avatar/media management**: direct-to-Cloudinary upload with progress (`getAvatarUploadSignature` + `uploadToCloudinary.ts`, mirroring the review-photo/highlight upload pipeline), `saveAvatarToSupabase`, `ImageCropper.tsx`, `AvatarUploadModal.tsx`, `AvatarUploadButton.tsx`, `useAvatarUpload.ts`.

---

## 6. Routes / Pages (full list, verified via filesystem)

```
(landing)/                                         /
(pages)/(settings)/settings/                       /settings
(pages)/(settings)/settings/edit-profile           /settings/edit-profile
(pages)/(settings)/settings/language               /settings/language
(pages)/(settings)/settings/membership             /settings/membership (redirects to /settings/overview)
(pages)/(settings)/settings/overview               /settings/overview
(pages)/(settings)/settings/security               /settings/security
(pages)/(settings)/settings/switch-appearance      /settings/switch-appearance
(pages)/(transactions)/transactions                /transactions
(pages)/(transactions)/transactions/[kind]/[id]    /transactions/:kind/:id
(pages)/(userPage)/user/[username]/favorites       /user/:username/favorites
(pages)/(userPage)/user/[username]/posts           /user/:username/posts
(pages)/(userPage)/user/[username]/reviews         /user/:username/reviews
(pages)/around-you                                 /around-you
(pages)/auth/signin                                /auth/signin
(pages)/events                                     /events
(pages)/events/[eventCode]                         /events/:eventCode
(pages)/events/location/[location]                 /events/location/:location
(pages)/events/location/[location]/explore/[type]  /events/location/:location/explore/:type
(pages)/events/location/[location]/explore/similar-events /events/location/:location/explore/similar-events
(pages)/manage/attendance/attendance-list          /manage/attendance/attendance-list
(pages)/manage/attendance/event-list               /manage/attendance/event-list
(pages)/manage/dashboard                           /manage/dashboard
(pages)/manage/my-events                           /manage/my-events
(pages)/plans                                      /plans (redirects to /settings/overview)
(pages)/search                                     /search
(pages)/search/[searchTitle]                       /search/:searchTitle
(pages)/user-account                               /user-account
(pages)/user-account/[username]                    /user-account/:username
(pages)/wallet                                     /wallet
(pages)/checkout                                   /checkout
(pages)/checkout/[checkoutId]                      /checkout/:checkoutId
api/geocode                                        /api/geocode
api/upload-profile-picture                         /api/upload-profile-picture
api/user-profile                                   /api/user-profile
```

**Needs Investigation**
- `/user-account/[username]` and `/(userPage)/user/[username]/*` both exist as separate route trees for a user's profile — the relationship/difference between these two was not confirmed (possibly one is legacy, or they serve different purposes such as "my account" vs. "public profile").

---

## 7. Database / Supabase Structure

**Source of truth**: [supabase/migrations/20260810084821_remote_schema.sql](supabase/migrations/20260810084821_remote_schema.sql), pulled directly from the live Supabase project on 2026-08-10 (`supabase db pull`). Everything in this section is read from that file, not inferred from application code. Where the application code (as documented in §6–§9 of this file previously) disagrees with this real schema, it is called out explicitly under **"⚠️ Discrepancies with application code"** at the end of this section — that is now the authoritative discrepancy list; treat any earlier version of this document's guesses as superseded.

### 7.1 Extensions, roles, sequences

- Extensions installed: `citext`, `pg_prewarm`, `postgis`, `pg_cron`.
- `pg_graphql` is explicitly **dropped** (`DROP EXTENSION pg_graphql;`) — the project does not expose a GraphQL API; only PostgREST (REST) is available, consistent with the app never using GraphQL.
- A custom role `supabase_privileged_role` is created and granted to `postgres`. No further use of this role appears in the migration — its purpose could not be determined from this file.
- Default privileges: `postgres` grants `DELETE, INSERT, SELECT, UPDATE` on all tables (and matching sequence/routine grants) to **all three** of `anon`, `authenticated`, and `service_role` at the schema level, and every individual `CREATE TABLE` is followed by an explicit `GRANT ALL ... TO anon/authenticated/service_role`. **This was significant as pulled (2026-08-10) because no RLS existed yet to narrow these grants — see the updated RLS note below: RLS was enabled on most tables on 2026-08-25, which is what actually restricts row access today, not these grants.**
- Three smallint sequences back small lookup tables: `subscription_plan_id_seq`, `transaction_status_id_seq`, `user_status_id_seq`.

### 7.2 Tables (verified from `CREATE TABLE` statements)

| Table | Partitioning | Notes |
|---|---|---|
| `event` | — | Core event record. See columns below. |
| `event_occurrence` | — | One-to-many child of `event` for specific-date events. |
| `event_media` | HASH(`event_id`) | **No partitions defined in this migration** — see §7.5. |
| `event_share` | RANGE(`shared_at`) | **No partitions defined** — see §7.5. |
| `favorite` | HASH(`user_id`), 4 partitions (`favorite_p1`..`p4`) | Fully partitioned and usable. |
| `highlight` | — | User highlights/stories media. |
| `media_audit` | RANGE(`performed_at`) | **No partitions defined** — see §7.5. |
| `notification` | — | **New** (migration `20260823090000_add_notifications.sql`, Places Phase 2 Milestone 1). One general-purpose row per notification (`user_id → user_info` CASCADE, `type`, `title`, `body`/`link` nullable, `read_at` nullable). Indexed on `(user_id, created_at desc)` plus a partial index on unread rows. RLS was enabled on this table by `20260825105625_enable_rls_social_batch4.sql` (2026-08-25) — see the RLS note below. See §19. |
| `payment_method` | HASH(`user_id`), 4 partitions (`payment_method_p0`..`p3`) | **Resolved 2026-08-16** (migration `20260816150312_add_wallet_and_payment_attempt.sql`): partitions added, plus `status` (`active`/`removed`, soft-delete) and `updated_at` columns, and a partial unique index enforcing one default *active* method per user. Now the backing table for `/wallet`'s saved-payment-methods feature — see §5. |
| `payment_attempt` | — | **New** (same migration). Separates "an attempt to pay" from the checkout it pays for (`ticket_checkout` session via `checkout_session_id`, or `subscription_checkout` via `subscription_checkout_id` — exactly one required) and the `payment_method` used. Lifecycle `status`: `initiated/pending/processing/succeeded/failed/cancelled/refunded`. (The related `transaction.status` enum separately gained a `refund_pending` value via `20260819090000_transaction_refund_pending_status.sql` — that migration doesn't touch `payment_attempt` itself.) **Resolved 2026-08-27**: Paystack drives `payment_attempt.status` to `succeeded`/`failed` for real via `finalizePaystackPayment.ts` (called by both client-side verification and the webhook) — see §16 item 5/18. |
| `promo_code` | — | |
| `promo_code_usage` | — | Composite PK (`promo_code_id, user_id, event_id`). |
| `receiving_account` | — | Organizer payout details (Mobile Money or Bank). |
| `review` | RANGE(`created_at`), 5 monthly partitions covering **June 2025 – October 2025 only** | See §7.5 — no partition exists for the current system date. |
| `story` | RANGE(`created_at`) | **No partitions defined** — see §7.5. Not referenced anywhere in app code. |
| `subscription` | — | One row per user (`UNIQUE(user_id)`). |
| `subscription_checkout` | — | |
| `subscription_plan` | — | `id` is `smallint`, `name` is the natural key other tables reference. |
| `device_token` | — | **New** — applied **via Supabase MCP** (project `sderrexhawjbmsugndcq`, migration `add_device_token_for_push`), **not a `supabase/migrations/*` file**, for the mobile app's push notifications. One row per (device, user): `user_id → auth.users` CASCADE, `token` (Expo push token, `UNIQUE`), `platform` (`ios`/`android` check), `created_at`, `last_seen_at`. `device_token_user_id_idx` on `user_id`. RLS enabled, one `FOR ALL` owner policy (`auth.uid() = user_id`). Written only by `apps/web/src/app/api/mobile/devices/*` (service-role, behind a Bearer identity check) and read by the server-side push sender. See `docs/mobile/06` §5.10. |
| `event_reminder` | — | **New** — migration `20260904090000_add_event_reminder_table.sql`, also applied live via Supabase MCP (migration `add_event_reminder_table`), for the mobile app's cross-device event reminders. `(user_id → auth.users CASCADE, event_id → event CASCADE)` composite PK, `offsets integer[]` (chosen lead-times in minutes-before-start), `created_at`/`updated_at`. Indexes on `user_id` and `event_id`. RLS enabled, one owner-only `FOR ALL` policy. Web has no reminder UI — this is read/written only by the mobile app via **direct RLS-scoped CRUD** (`apps/mobile/src/features/reminders/reminderSync.ts`), same class-A pattern as `favorite`. The actual notification firing is a device-local `expo-notifications` schedule; this row only stores *which* offsets the user picked so another device can re-arm its own. See `docs/mobile/10` WP-M. |
| `ticket` | — | |
| `ticket_checkout` | — | |
| `ticket_type` | — | |
| `transaction` | — | Payment record; see §7.5. `flutterwave_txn_id` was renamed to `paystack_reference` 2026-08-18 (migration `20260818120000_transaction_table_paystack.sql`) — Paystack is the finalized/only payment gateway, and the table was empty (0 rows) so this was a pure rename. RLS added (`auth.uid() = user_id`). |
| `transaction_status` | — | Small lookup table (`id`, `name`); not referenced by any FK in the schema and not queried by app code. |
| `user_image_history` | HASH(`user_id`), 4 partitions (`user_image_history_0`..`3`) | Fully partitioned and usable. |
| `user_info` | — | Public profile row, 1:1 with `auth.users`. |
| `user_status` | — | Small lookup table backing `user_info.status_id`. |
| `wallet` | HASH(`user_id`) | **No partitions defined** — see §7.5. Not referenced anywhere in app code. |

**Views**:
- `user_profile_details` — aggregates `user_info` with counts from `event` (as organizer), `favorite`, and average `review.rating`. This is the real object; see discrepancy #1 below.
- `wallet_public` — a "safe" view over `wallet` that exposes `id, user_id, currency, created_at, updated_at` but **omits `balance`** — clearly designed so `balance` is never read through this view.

### 7.3 Key columns (verified, only columns relevant to app behavior are listed — see the migration file for the full column list of every table)

- **`event`**: `id` (uuid PK), `organizer_id` (uuid, FK → `user_info.id`, `ON DELETE CASCADE`), `event_category` (text, **required**), `event_type`, `title`, `slug` (unique), `description` (≤2000 chars, CHECK), `location` (`geography(Point,4326)`, **required**, PostGIS), `address` (jsonb, required), `website_url`, `capacity` (CHECK `> 0` if set), `flyer_public_id` (required, CHECK regex `^[a-z0-9_/-]+$`), `flyer_version`, `starts_at`, `ends_at` (CHECK `ends_at > starts_at`), `status` (varchar(10), **default `'draft'`**, CHECK one of `draft/published/canceled/completed`), `created_at`, `event_code` (unique, required), `require_registration` (boolean, default false). GiST index `idx_event_geo` on `location` for proximity search.
- **`event_occurrence`**: `id`, `event_id` (FK CASCADE), `starts_at`, `ends_at` (CHECK `ends_at > starts_at`).
- **`ticket_type`**: `id`, `event_id` (FK CASCADE), `type` (free text — **no CHECK constraint** restricting allowed values), `price` (numeric — **no CHECK `>= 0`**), `quantity` (integer — **no CHECK `>= 0`**), `available_from`, `available_until`, `currency` (free text), `created_at`.
- **`ticket_checkout`**: `id`, `user_id` (FK, `ON DELETE SET NULL`), `event_id` (FK CASCADE), `ticket_type_id` (FK `ON DELETE RESTRICT`), `quantity` (CHECK `> 0`), `unit_price`, `promo_code`, `discount` (default 0), `total_price`, `status` (default `'pending'`, **no CHECK constraint** on allowed values), `created_at`, `updated_at`, `checkout_session_id` (uuid, no uniqueness constraint).
- **`ticket`**: `id`, `user_id` (FK CASCADE), `transaction_id` (FK → `transaction.id`, **`ON DELETE CASCADE`** — deleting a transaction deletes its tickets), `seat_number`, `status` (default `'active'`, CHECK one of `active/used/expired/cancelled`), `qr_public_id` (required, CHECK regex), `qr_version` (required), `issued_at`, `expires_at` (required), `used_at`, `metadata` (jsonb), `created_at`, `updated_at`, `ticket_type_id` (FK CASCADE, required), `ticket_code` (text, nullable, **no `UNIQUE` constraint**). Indexes on `user_id`, `status`, `transaction_id`.
- **`attendance`**: `id`, `user_id` (FK → `user_info`), `event_id` (FK CASCADE), `ticket_type_id` (FK, nullable), `status` (default `'attending'`, CHECK one of `attending/cancelled`), `number_of_tickets` (CHECK `>= 1`), `for_someone_else` (boolean), `name`, `email`, `phone`, `created_at`, `ticket_id` (FK → `ticket.id`, nullable).
- **`promo_code`**: `id` (default `gen_random_uuid()`), `event_id` (FK CASCADE, nullable), `promo_code` (text, **nullable**, unique), `discount_percentage` (integer — **no CHECK restricting to 0–100**), `expires_at`, `max_uses`, `times_used` (default 0), `is_active` (default true — a static flag; the DB has no trigger to flip it automatically when `expires_at` passes), `created_at`.
- **`promo_code_usage`**: composite PK `(promo_code_id, user_id, event_id)`, FKs to `promo_code` (CASCADE) and `user_info` (no cascade specified — implicit RESTRICT).
- **`receiving_account`**: `id`, `user_id` (FK CASCADE), `event_id` (FK CASCADE, nullable), `full_name`, `email`, `payment_option` (CHECK `'Mobile Money'` or `'Bank'`), `phone`, `network_service_provider`, `bank_name`, `bank_branch`, `bank_account_number`, `created_at`.
- **`transaction`**: `id`, `user_id` (FK CASCADE), `full_name`, `email`, `phone_number` (nullable as of 2026-08-18 — this app never collects a general phone number for a user), `reason` (CHECK `'Ticket_Purchase'` or `'Plan_Purchase'`), `amount` (numeric(15,2)), `currency` (varchar(3), **default `'USD'`**), `status` (CHECK one of `successful/pending/failed/refunded`), `payment_method`, `payment_gateway_response` (jsonb), **`paystack_reference` (text, `NOT NULL`, `UNIQUE` — renamed from `flutterwave_txn_id` 2026-08-18)**, `transaction_date`, `created_at`, `updated_at`, `metadata` (jsonb). RLS enabled (`auth.uid() = user_id`). See discrepancy #2 below.
- **`subscription`**: `id`, `user_id` (FK CASCADE, **unique — one subscription per user**), `plan_id` (FK → `subscription_plan.id`, CASCADE), `start_date`, `end_date` (CHECK `end_date > start_date`), `events_used`, `stories_used`, `transaction_id` (FK → `transaction.id`, nullable, no cascade — implicit RESTRICT).
- **`subscription_plan`**: `id` (smallint), `name` (unique, referenced by name — not by id — from `subscription_checkout`), `price` (CHECK `>= 0`), `duration` (interval), `max_events` (CHECK `>= 0`), `max_stories` (CHECK `>= 0`), `highlight_delay` (interval), `retention` (interval, required), `highlight_window` (interval, required).
- **`subscription_checkout`**: `id`, `user_id` (FK CASCADE, nullable), `subscription_plan_name` (FK → `subscription_plan.name`, `ON DELETE RESTRICT`), `promo_code`, `discount` (default 0), `unit_price`, `total_price`, `status` (default `'pending'`), `created_at`, `completed_at`.
- **`user_info`**: `id` (uuid, PK, FK → `auth.users.id` `ON DELETE CASCADE`), `status_id` (smallint, FK → `user_status.id`, default 1), `username` (**`citext`** — case-insensitive, unique, CHECK regex `^[a-z0-9_]{3,30}$` applied case-insensitively), `full_name`, `avatar_public_id` (CHECK regex, 3–100 chars), `avatar_version`, `bio` (CHECK `<= 500` chars), `updated_at` (default now), `website`. **There is no `email`, `phone`, `displayName`, `createdAt`, or `lastSignInAt` column on this table** — see discrepancy #3.
- **`user_image_history`**: `user_id`, `public_id` (CHECK regex), `version`, `transformation`, `created_at`. PK is `(user_id, version)`.
- **`highlight`**: `id`, `user_id` (FK CASCADE), `content`, `media_url` (CHECK starts with `http(s)://`), `created_at`, `media_type` (CHECK one of `image/video/audio`), `thumbnail_url`, `media_duration`, `group_id` (required).
- **`review`**: `id`, `reviewer_id` (FK → `user_info`, CASCADE), `reviewed_id` (FK → `user_info`, CASCADE — i.e. a review targets a *user*, e.g. an organizer, not directly an event row via FK), `rating` (smallint, CHECK 1–5), `comment` (CHECK `<= 500` chars), `status` (default `'pending'`, CHECK one of `pending/approved/rejected`), `created_at`, `title` (required). PK is `(id, created_at)` because the table is range-partitioned.
- **`wallet`**: `id`, `user_id` (FK CASCADE), `balance` (numeric(15,2), default 0, CHECK `>= 0`), `currency` (varchar(3), required), `created_at`, `updated_at`. PK is `(id, user_id)`.
- **`payment_method`**: `id`, `user_id` (FK CASCADE), `method_type` (varchar(50)), `details` (jsonb), `is_default` (boolean, default false), `created_at`. PK is `(id, user_id)`.

### 7.4 Confirmed relationships (foreign keys, from the migration file — supersedes any relationship previously guessed from `select()` embed syntax)

- `event.organizer_id → user_info.id`
- `event_occurrence.event_id → event.id`
- `event_media.event_id → event.id`
- `event_share.event_id → event.id`, `event_share.user_id → user_info.id`
- `favorite.event_id → event.id`, `favorite.user_id → user_info.id`
- `attendance.event_id → event.id`, `attendance.user_id → user_info.id`, `attendance.ticket_type_id → ticket_type.id`, `attendance.ticket_id → ticket.id`
- `ticket_type.event_id → event.id`
- `ticket.ticket_type_id → ticket_type.id`, `ticket.user_id → user_info.id`, `ticket.transaction_id → transaction.id`
- `ticket_checkout.event_id → event.id`, `ticket_checkout.ticket_type_id → ticket_type.id`, `ticket_checkout.user_id → user_info.id`
- `promo_code.event_id → event.id`
- `promo_code_usage.promo_code_id → promo_code.id`, `promo_code_usage.event_id → event.id`, `promo_code_usage.user_id → user_info.id`
- `receiving_account.event_id → event.id`, `receiving_account.user_id → user_info.id`
- `review.reviewer_id → user_info.id`, `review.reviewed_id → user_info.id`
- `subscription.plan_id → subscription_plan.id`, `subscription.user_id → user_info.id`, `subscription.transaction_id → transaction.id`
- `subscription_checkout.subscription_plan_name → subscription_plan.name`, `subscription_checkout.user_id → user_info.id`
- `transaction.user_id → user_info.id`
- `wallet.user_id → user_info.id`
- `payment_method.user_id → user_info.id`
- `highlight.user_id → user_info.id`
- `story.user_id → user_info.id`
- `media_audit.user_id → user_info.id`
- `user_image_history.user_id → user_info.id`
- `user_info.id → auth.users.id`, `user_info.status_id → user_status.id`

### 7.5 Functions, triggers, and operational risks (confirmed)

- **`create_user_info_if_not_exists()`** — `SECURITY DEFINER` trigger function, attached via trigger `on_auth_user_created` (`AFTER INSERT ON auth.users`). Automatically creates a `user_info` row whenever a new Supabase Auth user is created, deriving `username` from `full_name`/`email`/`phone` metadata (sanitized to `[a-zA-Z0-9_]`, truncated to 20 chars) and `status_id = 1`. **This confirms account provisioning is fully automatic on sign-up** — the app never needs to (and does not) manually insert into `user_info` after auth.
- **`get_filtered_events(...)`**, **`get_nearby_events(...)`**, **`get_similar_events(...)`** — PostGIS-powered RPC functions doing filtering/proximity search server-side. **Confirmed used by the app**: `getQueriedEvents.ts` calls `supabase.rpc("get_filtered_events", ...)`, `getNearByEvents.tsx` calls `get_nearby_events`, `getSimilarEvents.ts` calls `get_similar_events`. Parameter names/order match what these actions pass. This is a correct, verified alignment between app and DB.
- **`log_user_changes()`** — a trigger function that inserts into a table called `audit_log` on `NEW` row changes. **`audit_log` is never created anywhere in this migration**, and no `CREATE TRIGGER` in the file attaches `log_user_changes` to any table. This function is effectively orphaned in the pulled schema: if it were invoked, it would fail with "relation audit_log does not exist." It may be dead/leftover, or the attaching trigger and `audit_log` table exist outside what was captured — unconfirmed.
- **`pg_cron`** extension is installed, but **no `cron.schedule(...)` calls appear anywhere in this migration** — no scheduled jobs are defined in the pulled schema. Its presence suggests scheduled jobs were planned or exist outside this dump (e.g. managed via the Supabase dashboard, which `db pull` does not always capture into schema SQL).
- **No Row Level Security policies exist anywhere in this file** — there is no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and no `CREATE POLICY` statement for any table. Combined with the schema-wide `GRANT ALL` to `anon`/`authenticated` noted in §7.1, this means (as captured in this migration) database-level access control is **not** enforced by Postgres/RLS — it relies entirely on the application layer (every Server Action re-checking `auth.getUser()`, as documented in §8/§9) and on PostgREST only being reachable with the anon/authenticated keys the app controls. This is a significant finding for anyone reasoning about security: **if this dump reflects the real remote state, any client with the anon key could theoretically read/write these tables directly (bypassing Server Actions) unless RLS is enabled elsewhere and simply wasn't captured by the pull.** This should be verified directly in the Supabase dashboard before relying on it either way.
- **Partition coverage gaps (verified by counting `CREATE TABLE ... PARTITION OF` statements per parent):**
  - `favorite` and `user_image_history` (both `HASH`) have their full set of partitions defined and are usable.
  - `event_media`, `payment_method`, `wallet` (all `HASH`) have **zero partitions defined** in this migration. A hash-partitioned table with no partitions cannot accept any row — inserts would fail with a "no partition of relation found for row" error unless partitions exist outside this dump.
  - `story`, `event_share`, `media_audit` (all `RANGE`) also have **zero partitions defined** — same failure mode.
  - `review` (`RANGE` on `created_at`) has exactly 5 monthly partitions, covering **1 June 2025 through 31 October 2025 only**. There is no partition for any date outside that window (including the current system date). Inserting a review today would fail unless additional partitions have been added outside this migration file.
  - This does not necessarily mean these tables are broken in production — `supabase db pull` can miss objects added via the dashboard or a different migration path — but as literally captured in this file, it is a real risk worth verifying directly against the live database.

### 7.6 ⚠️ Discrepancies between application code and the actual schema (confirmed, not guessed)

1. **`user_profile_details` vs `user_profile_detail` — now resolved.** The real database object is the view **`user_profile_details`** (plural), matching what [getUserProfileDetails.ts](src/actions/getUserProfileDetails.ts) queries. However, [src/app/api/user-profile/route.tsx](src/app/api/user-profile/route.tsx) queries **`user_profile_detail`** (singular) — **this object does not exist anywhere in the schema.** That route's query will fail at runtime (Postgres/PostgREST "relation does not exist"). This is a confirmed bug, not a naming-convention nitpick.
2. **Resolved 2026-08-18 — was: no payment gateway code / schema expected Flutterwave.** Paystack test-mode integration (popup + direct card/mobile-money charge, webhook with signature verification, idempotent finalization via `finalizePaystackPayment.ts`) is now implemented. The `transaction` table's `flutterwave_txn_id` (`NOT NULL UNIQUE`) was renamed to `paystack_reference` — the table was empty (0 rows) at migration time, so this was a pure rename with no data migration. `finalizePaystackPayment.ts` now inserts a real `transaction` row (`status: "successful"`, `payment_method: "paystack"`, the Paystack reference, the verify response as `payment_gateway_response`) once a payment is verified, and passes its id as `ticket.transaction_id` — closing the gap where tickets could be issued with no backing payment record. `issueRefund.ts` (previously a no-op stub) now calls Paystack's refund endpoint for real and marks the transaction `refunded`.
3. **`useUserProfile.ts` reads columns that don't exist on `user_info`.** [src/hooks/useUserProfile.ts](src/hooks/useUserProfile.ts) does `.from("user_info").select("*")` and then reads `data.displayName`, `data.email`, `data.phone`, `data.createdAt`, `data.lastSignInAt` — **none of these columns exist on `user_info`** in the real schema (the table only has `id, status_id, username, full_name, avatar_public_id, avatar_version, bio, updated_at, website`). Those fields will always resolve to `undefined` in the returned `userProfileType`. This looks like leftover code from an earlier schema version, or confusion between the `user_info` table and Supabase Auth's `user` object (which does have `email`/`phone`/`created_at`/`last_sign_in_at`, but is a different object entirely). This is a confirmed bug.
4. **`ticket_code` has no uniqueness guarantee at the database level.** [generateTicket.ts](src/actions/generateTicket.ts) generates a ticket code in application code and relies on it being unique, but the `ticket.ticket_code` column has no `UNIQUE` constraint in the schema — collisions are possible in theory and would not be caught by the database.
5. **Ticket type price/quantity/type are unconstrained in the database.** The app treats `ticket_type.type` as one of `"FREE"`, `"SINGLE TICKET"`, or an organizer-defined category, and assumes `price`/`quantity` are non-negative — but the schema has no `CHECK` constraints enforcing any of this on `ticket_type`. All such validation is application-only.
6. **Resolved 2026-08-16.** `payment_method` is now queried/written by `getUserPaymentMethods`/`addPaymentMethod`/`removePaymentMethod`/`setDefaultPaymentMethod`, backing a real `/wallet` page, independent of checkout — partitions and a soft-delete `status` column were added (migration `20260816150312_add_wallet_and_payment_attempt.sql`). The `AddMomoWallet`/`AddBankCard` forms were rewritten to only collect non-sensitive display data (network/brand, last 4 digits, expiry, label) since no tokenization provider is integrated. The separate `wallet` (cash/store-credit balance) table remains unused/out of scope — it models a different concept. Organizer payout info still goes through `receiving_account` (via `postEvent.ts`), unrelated to this.
7. **`story`, `event_media`, and `media_audit` tables exist in the schema but are not referenced anywhere in the current application code** (no `.from("story")`, `.from("event_media")`, or `.from("media_audit")` found). The app's actual "stories/highlights" feature uses the separate `highlight` table instead, which is fully wired up and has no partitioning (so no partition-gap risk). `story` appears to be a parallel/legacy feature that was never finished, and would additionally fail on insert today due to having zero partitions.
8. **Inconsistent UUID default generator across tables.** Some tables default `id` to `extensions.uuid_generate_v4()` (`attendance`, `event`, `event_occurrence`, `highlight`, `review`, `story`, `ticket`, `ticket_type`, `transaction`, `user_image_history`, `wallet`), while others use `gen_random_uuid()` (`promo_code`, `receiving_account`, `ticket_checkout`, `subscription_checkout`). Functionally equivalent, but inconsistent — not something application code needs to worry about, just a schema-authoring inconsistency.
9. **`review.reviewed_id` targets a user, not an event.** It has a foreign key to `user_info.id`, meaning the schema models reviews as being about a *person* (e.g. an organizer), not an event directly — worth keeping in mind since "review an event" UI copy could be misleading about what's actually being rated at the database level.

**Needs Investigation**
- **Resolved 2026-08-25**: RLS policies do exist on the live database (added after this `db pull`) — see §7.1's RLS note.
- Whether the missing partitions (`event_media`, `payment_method`, `wallet`, `story`, `event_share`, `media_audit`) and the stale `review` partition range are real gaps in production or artifacts of an incomplete pull — should be checked directly against the live Supabase project before assuming inserts are currently broken.
- The purpose of the `supabase_privileged_role` role and the `transaction_status` lookup table, neither of which appears to be used by any FK or by app code.
- Whether Supabase Storage buckets are used at all, given Cloudinary appears to hold most media (still unconfirmed — this schema file doesn't show storage bucket config).

---

## 8. Authentication / Authorization Flow

**Confirmed**
1. **Sign-in**: Google OAuth via `supabase.auth.signInWithOAuth({ provider: "google" })` in [src/services/authService.ts](src/services/authService.ts), triggered from [GoogleAuthButton.tsx](src/components/atoms/GoogleAuthButton.tsx). This is the functional sign-in path.
2. **Phone/OTP sign-in exists but is incomplete**: `signInWithPhone`/`verifyOtp` in `authService.ts` call Hubtel's REST OTP API (`api-otp.hubtel.com`) directly, but the corresponding `supabase.auth.signInWithOtp` / `supabase.auth.verifyOtp` calls that would create a real Supabase session are commented out in the same file.
3. **Session refresh & route gating** happens in [src/proxy.ts](src/proxy.ts), which calls `updateSession()` ([src/config/supabase/middleware.ts](src/config/supabase/middleware.ts)):
   - Refreshes/re-syncs the Supabase auth cookies on every matched request.
   - Public path allowlist (prefix match): `/`, `/events`, `/places`, `/explore`, `/user/` (trailing slash, so only `/user/[username]/...` sub-routes — not `/user-account`), `/reviews`, `/search`, `/auth`.
   - Any other path redirects unauthenticated users to `/auth/signin?next=<original-path-and-query>`.
   - **Resolved 2026-08-25**: the allowlist previously used a bare `/user` prefix match, which also unintentionally passed `/user-account` (Settings) as "public" at the proxy layer, and had a redundant duplicate `/auth` entry. Both fixed.
   - **2026-08-31**: `api/mobile` was added to the middleware `matcher`'s negative lookahead so `updateSession()` no longer runs on `/api/mobile/**`. Those routes are the native app's Bearer-token API (`getMobileAuth`) and carry no Supabase cookie, so the cookie-only `getUser()` here would 302 every one of them to `/auth/signin` (the app then saw HTML, not JSON). Each `/api/mobile/*` route still does its own `getUser()` + RLS. Other `/api/*` paths remain under the matcher.
4. **Server Action-level checks**: nearly every action in `src/actions/` independently calls `supabase.auth.getUser()` and returns `{ status: 401 }` if there's no user, rather than relying solely on the proxy.
5. **Client-side auth state**: [src/context/authContext.tsx](src/context/authContext.tsx) (`AuthProvider`/`useAuth`) mirrors the Supabase session via `onAuthStateChange` for UI purposes (e.g. showing/hiding auth-gated UI), not for authorization decisions.
6. **Sign-out**: `signOut()` in `authService.ts` calls `supabase.auth.signOut()` then hard-redirects to `/`.

**Needs Investigation**
- No role/permission model (e.g. "organizer" vs. "attendee") was found beyond implicit ownership checks (`organizer_id`, `user_id` equality checks in queries) — there is no visible RBAC table or middleware role check.

**Resolved 2026-08-25 (see updated RLS note in §7.1)**: RLS is now enabled on most tables, including `user_info`, `notification`, `wallet`, and the payout/ledger tables, via `20260825105233_enable_rls_ticketing_batch1.sql` through `..._batch7...sql` plus `20260825110112_enable_rls_wallet.sql`. Access control is now a combination of these RLS policies **and** the Server Action `auth.getUser()` checks described above — not app-layer-only as earlier revisions of this document stated.

Also note: §8 items 2 and 5 above (phone/OTP as "incomplete" with commented-out Supabase calls, and `src/context/authContext.tsx`) describe an earlier implementation. Phone/OTP sign-in is now a complete, working flow via Hubtel + a custom session-minting technique (see `src/actions/verifyPhoneSignIn.ts`, `requestPhoneVerification.ts`), and there is no `authContext.tsx`/`AuthProvider` in the current codebase — client auth state is a React Query cache (`src/hooks/useCurrentUser.ts`) kept fresh by a `supabase.auth.onAuthStateChange` subscription in `src/providers/ReactQueryProvider.tsx`. A full rewrite of §8 to match the current phone-auth/session architecture is out of scope for this change and is flagged here for a follow-up documentation pass.

---

## 9. API Routes / Server Actions

**Route handlers** (3 total, all under `src/app/api/`):
- `POST /api/geocode` — [src/app/api/geocode/route.ts](src/app/api/geocode/route.ts), uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `/api/upload-profile-picture` — [src/app/api/upload-profile-picture/route.ts](src/app/api/upload-profile-picture/route.ts), uploads to Cloudinary (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`) and updates `user_info`.
- `/api/user-profile` — [src/app/api/user-profile/route.tsx](src/app/api/user-profile/route.tsx), reads from `user_profile_detail`.

**Server Actions** (all `"use server"`, in [src/actions/](src/actions), ~50 files) — this is the primary backend interface. Full list observed: `addEventToFavorite`, `cancelEvent`, `cancelUserTicket`, `checkIfEventIsFavorited`, `deleteCheckout`, `deleteEvent`, `deleteTicketSummaryCheckout`, `deleteUser`, `fetchCountryMetaData`, `filteredByDateUserTransactions`, `generateTicket`, `getAttendace`, `getAttendanceList`, `getEventTitle`, `getFilteredEvents`, `getNearByEvents`, `getOrganizerEvents`, `getPromoCode`, `getQueriedEvents`, `getSimilarEvents`, `getSubscriptionCheckout`, `getTicketCheckout`, `getTickets`, `getUserAttendingEvents`, `getUserCheckout`, `getUserDetails`, `getUserEventRole`, `getUserFavoritePosts`, `getUserHighlights`, `getUserPhoneNumber`, `getUserPosts`, `getUserProfileDetails`, `getUserRating`, `getUserReviews`, `getUserSubscription`, `getUserTransactions`, `InsertPromoCodeUsage`, `insertSubscriptionCheckout`, `insertUserAttendance`, `issueRefund`, `postEvent`, `postReview`, `removeEventFromFavorite`, `saveAvatarToCloudinary`, `saveAvatarToSupabase`, `saveEventFlyerToCloudinary`, `saveEventQrCodeToCloudinary`, `sendOtpForPhoneUpdate`, `ticketPurchaseNotification`, `updateUserDetails`, `updateUserPhoneNumber`, `uploadHighlight`, `validateCheckout`, `verifyOtpAndUpdatePhone`.
- Convention: every action returns a plain object `{ status: number, message?: string, data?: ... }` rather than throwing — callers must check `status` (no shared error-handling wrapper/type was found).
- **Note: the list above predates several checkout/wallet features and is not exhaustive** (e.g. `deleteCheckout`/`getUserCheckout` no longer exist; `cancelTicketCheckoutSession`, `updateTicketCheckoutQuantity`, `getUserPendingTicketCheckouts`, `activateSubscription` are missing) — treat `src/actions/` itself as the source of truth for the current action list. **New in this pass** (wallet/payment domain, independent of checkout — see §5): `getUserPaymentMethods`, `addPaymentMethod`, `removePaymentMethod`, `setDefaultPaymentMethod`, `createPaymentAttempt`.

**Resolved 2026-08-18** — was: no payment-gateway charge action exists in this repo. Paystack (test mode) now sits between `validateCheckout`'s reservation and `generateTicket`'s issuance: `src/services/paystackService.ts` (Initialize/Verify/Charge Authorization/Charge/Refund), `src/utils/paystackInit.ts` (decides popup vs. direct charge), `src/utils/finalizePaystackPayment.ts` (the single authoritative verify+finalize path, called by both the frontend verify action and the webhook), `src/app/api/paystack/webhook/route.ts`. `transaction.flutterwave_txn_id` was renamed to `paystack_reference` (see §7.6 discrepancy #2) and is now actually populated.

---

## 10. External Services & Integrations

**Confirmed** (with the env vars each uses):
- **Supabase** — Postgres DB + Auth. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Cloudinary** — media storage for avatars, event flyers, ticket QR codes, highlights. `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (also a legacy commented-out `CLOUDINARY_CLOUD_NAME` in `.env.local`).
- **Google Maps Platform** — geocoding, autocomplete, map display (`@react-google-maps/api`, `/api/geocode`). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-exposed by design).
- **Hubtel** (`api-otp.hubtel.com`) — OTP send/verify, used by both phone sign-in/sign-up and Settings → Security's phone add/change flow (one unified provider as of 2026-08-23, see items 3/4/10 in §16). All calls are server-only, isolated in `src/services/hubtelOtpClient.ts` and called only from Server Actions (`requestPhoneVerification.ts`, `verifyPhoneSignIn.ts`, `updateVerifiedPhone.ts`). Env vars: `HUBTEL_API_CLIENT_ID`, `HUBTEL_API_CLIENT_SECRET` (Basic Auth credentials, server-only, never `NEXT_PUBLIC_`) — note these were previously misnamed `HUBTEL_API_USERNAME`/`HUBTEL_API_PASSWORD` in the code (matching neither `.env.local`'s actual keys nor Hubtel's own terminology), which silently broke every OTP send until corrected.
- **Resend** — transactional email (ticket purchase receipts). `RESEND_API_KEY`.
- **Expo push service** (`exp.host/--/api/v2/push/send`) — mobile push notifications, added 2026-08-31 for the mobile app. `createNotification.ts` fires a best-effort push to the target user's `device_token` rows after each in-app notification insert (`src/utils/sendPushNotification.ts`, plain `fetch`, no SDK). **No env var / secret** — Expo push tokens are per-device and supplied by the client. A `DeviceNotRegistered` receipt prunes the dead token. Mobile-only feature; the web app has no push UI. See `docs/mobile/06` §5.10.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` present in `.env.local` (actual OAuth is handled by Supabase Auth's Google provider, not a custom NextAuth flow — `NEXTAUTH_SECRET`/`NEXTAUTH_URL` exist in `.env.local` but no NextAuth package is in `package.json`, so these look unused/vestigial).
- **~~REST Countries API~~ — removed 2026-08-23.** The `restcountries.com` v3.1 endpoint this app called (`src/services/restCountriesApi.ts`, used by `useCountries`/`fetchCountryCode`) was deprecated by its provider and started returning an error for every request, silently breaking the phone country-code dropdown (it always resolved to an empty list) and the Security page's country auto-detection. Replaced with the app's existing static `src/data/countryDetails.ts` list (6 countries: NG/GH/ZA/KE/RW/BW, already used for currency handling) plus Unicode flag emoji — no external dependency, no image-host allowlisting needed. `useCountries.ts`, `restCountriesApi.ts`, `googleApi.ts`, and the `useUserLocation` default export were deleted as dead code.

**Needs Investigation**
- No payment gateway integration found (see §9).
- Whether `NEXTAUTH_SECRET`/`NEXTAUTH_URL`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are dead leftovers from an earlier auth approach or are consumed somewhere not found in this pass.

---

## 11. State Management & Data-Fetching Patterns

**Confirmed**
- **Server state**: primarily fetched via Server Actions called directly inside `useEffect`/event handlers or from Server Components (RSC) — not via a REST client.
- **React Query** (`@tanstack/react-query`) is installed and provided globally via [src/providers/ReactQueryProvider.tsx](src/providers/ReactQueryProvider.tsx) (wraps the whole app in [src/app/layout.tsx](src/app/layout.tsx)), but adoption is partial — the clearest example is optimistic favorite-toggling (per git history: "Update add to favorite button to use optimistic updates from react query"). Most other data fetching still uses direct action calls + local `useState`, not `useQuery`/`useMutation`.
- **Client-side global state via React Context**, not Redux/Zustand:
  - `authContext`/`authProvider` — user/session/loading. (As of 2026-08-15: previously also carried an unused `activeTab` field and `uiContext`/`ShowMenuProvider` and `settingsContext`/`SettingsProviderWrapper` existed alongside it — all confirmed to have zero real consumers and removed.)
  - `uiContext` — general UI state.
- **Custom hooks** wrap one-off data needs: `useUserProfile` (fetches `user_info` client-side via the browser Supabase client), `useUserLocation` (geolocation → dial code via Google APIs), `useCountries`.
- Supabase auth state is kept in sync client-side via `supabase.auth.onAuthStateChange` inside `AuthProvider`.

**Needs Investigation**
- No consistent policy found for when to use Server Actions directly vs. React Query — appears to be feature-by-feature/organic rather than a documented convention.

---

## 12. Forms & Validation Patterns

**Confirmed**
- `react-hook-form` + `@hookform/resolvers/zod` + `zod` is the standard stack, used in at least: `AddMomoWallet`, `AddBankCard`, `ReceivingAccountForms`, `UploadEventModal`, `ReviewModal`, `SecurityInputFields`, `EditProfileInputFields`, `EventUploadMobileModal`.
- Shared shadcn `Form` primitives in [src/components/ui/form.tsx](src/components/ui/form.tsx) (Radix `Label` + RHF context wiring), used alongside `src/components/ui/input.tsx`.
- Reusable Zod schemas live in `src/utils/` — e.g. [eventSchema.ts](src/utils/eventSchema.ts) (title, description, website_url regex, price, capacity) and [receivingAcountSchema.ts](src/utils/receivingAcountSchema.ts) (name, email, phone regex, bank account number/name/branch validation with explicit user-facing messages).
- Server Actions do **not** re-validate input against these Zod schemas (no shared schema import was found inside `src/actions/`) — validation appears to be client-side only via RHF/Zod at the form layer, with actions doing ad hoc presence/type checks (e.g. `postEvent` destructures `formData: PostsType` without a runtime schema check).

**Needs Investigation**
- Whether any server-side re-validation exists that wasn't caught by this pass (recommend confirming before treating client validation as sufficient for security-sensitive fields).

---

## 13. Styling / UI Conventions

**Confirmed**
- Tailwind CSS 3 with `darkMode: "class"` and a full shadcn CSS-variable theme (HSL tokens for `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1..5`) defined in [src/app/globals.css](src/app/globals.css) and mapped in [tailwind.config.ts](tailwind.config.ts).
- Custom brand colors: `mint: "#4FD9C4"`, `iconGray: "#544F4F"` (per recent commit history, mint is the current accent color, replacing an earlier scheme).
- Custom font: "Euclid Circular B" loaded via local `@font-face` (`public/fonts/*.woff2`) at weights 300–700; also imports Google Fonts "Inter" but the `body` font-family is set to Euclid Circular B, and `geist` is a dependency but not obviously wired into `body`.
- shadcn/ui component generation config in [components.json](components.json): style `"new-york"`, base color `"neutral"`, RSC-enabled, icon library `lucide` (`lucide-react`).
- Custom keyframe animations (`slideIn`, `slideOut`, `story`/progress-fill, `floatFast`, `floatFastReverse`, `floatMid`) for modals/stories/decorative motion, plus `framer-motion` as a dependency for richer animation.
- Component organization follows atomic design (`atoms/molecules/organisms/[templates]`), both in the shared `src/components` tree and duplicated per-feature (`src/wallet`, `src/settings`, `src/userAccount`, `src/events`, `src/landing Page`).

---

## 14. Important Reusable Components (non-exhaustive, verified to exist)

**Layout/navigation** (organisms): `Header`, `DesktopFooter`, `MobileFooter`, `MobileNavBar`, `SideBar`.

**Event-related**: `EventCard` (molecule), `EventCardMenuBtn`/`EventCardMenuModal`, `EventsSlider`, `UploadEventForm`/`UploadEventModal`/`EventUploadMobileModal`/`MobileUploadModal`, `CategoryFilter`, `TypeFilter`, `FilterModalPopup`, `LocationAndFilterSection`, `FilterSearchBar`.

**Checkout/ticketing**: `CheckoutModal`, `OrderSummary`, `TicketType`, `TicketInputs`, `PromoCodeInputs`/`PromoCodeBtn`, `CheckoutBtn`, `TicketModal`, `RecieptModal`/`ViewReciptButton`, `CancelUserTicketBtn`. (`RefundButton` — listed here in an earlier revision — was a dead, unwired stub deleted by §21's change; don't reintroduce it from this list.)

**Maps/location**: `MapPicker`, `MapModal`, `ChangeLocationModal`, `AutoComplete`/`PostAutoComplete` (Google Places autocomplete), `GetDirectionBtn`.

**Auth**: `AuthModal`, `GoogleAuthButton`, `PhoneInput`.

**Profile/social**: `UserAvatar`, `AvatarUploadButton`/`UploadAvatarModal`/`ImageCropper`, `UserHighlights`/`HighlightModal`, `ReviewModal`/`AddReviewButton`/`Rating`/`StarRatingInput`, `AddToFavoriteButton`.

**Wallet**: `AddMomoWallet`, `AddBankCard`, `AddPaymentMethodPopup`, `PaymentOptionCard`, `AddWalletButton`, `ReceivingAccountForms`.

**Settings**: `EditProfileInputFields`, `SecurityInputFields`, `MobileSettingsHeaderNav`.

**shadcn/ui primitives** ([src/components/ui/](src/components/ui)): `button`, `calendar`, `form`, `input`, `label`, `popover`, `slider`.

**Date/time**: `Calendar`, `DateTimePicker`, `DateBtn`/`DateTimeSelectorBtn`, `EventDateSelector`, `time-picker-input`/`timePicker`/`time-picker-utils` (built on `react-day-picker`).

**Transactions**: `TransactionsPeriodFilter`, `TransactionsSummaryCards`, `TransactionStatusIcon`, `TransactionsHistoryList`, `TransactionsPageClient`.

**Promotion Details**: `PromotionDetails` (`src/settings/organisms/`) — replaced the old Plans-era `PlanContainer`/`SubscriptionPlans` components (deleted 2026-08-26), backed by `getUserActivePromotions.ts`.

---

## 15. Important Business Logic (confirmed from action code)

- **Duplicate-purchase prevention**: `validateCheckout` and `generateTicket` both re-check whether the current user already has an `"active"` ticket for the event before proceeding, and `validateCheckout` also detects an existing `"pending"` `ticket_checkout` and returns it instead of creating a duplicate (status `300`).
- **Ticket type model**: an event can have a `"FREE"` ticket, a `"SINGLE TICKET"` type, and/or multiple named ticket categories with independent price/quantity/availability windows — all rows in `ticket_type` keyed by `event_id`.
- **Specific-date vs. start/end events**: `postEvent` branches on whether `specific_dates` is provided — if so, rows are inserted into `event_occurrence` and `event.starts_at`/`ends_at` are set to `null`; otherwise the event uses a single `starts_at`/`ends_at` on the `event` row itself.
- **Promo codes**: percentage-based discount (`discount_percentage`), with `max_uses`, `expires_at`, and an `is_active` flag computed at insert time as `expiryDate > new Date()`. Discount is applied per-unit in `validateCheckout` (`unitPrice - unitPrice * discountPercentage/100`).
- **Payout account model**: an event's `receiving_account` is either Mobile Money (`network_service_provider`, phone) or Bank (`bank_name`, `bank_branch`, `bank_account_number`) — exactly one row per event, chosen by the organizer's `paymentOption` at event-creation time.
- **Ticket generation**: for each purchased unit, a unique `ticket_code` (see [src/utils/generateTicketCode.ts](src/utils/generateTicketCode.ts)) is generated, a QR code is rendered and uploaded to Cloudinary, and a `ticket` row is inserted with `expires_at` set to the event's end date; attendance is recorded via `insertUserAttendance` and promo usage via `InsertPromoCodeUsage`.
- **Country detection**: `proxy.ts` reads `x-vercel-ip-country` (falls back to `x-country-code`, then `"GH"`) and persists it in a `country` cookie, refreshing it whenever it changes.

---

## 16. Known Issues & Technical Debt (Confirmed)

1. **Next.js 16 "Cache Components" migration is incomplete.** Every route file in the app carries a commented-out `// TODO: Cache Components adoption... export const instant = false;` left by the upgrade; only [src/app/(pages)/(settings)/settings/language/page.tsx](<src/app/(pages)/(settings)/settings/language/page.tsx>) has `instant = false` actually active. Confirmed via `git show` of the "Project upgrade from next js 15 to 16" commit.
2. **Correction (2026-08-15): next-intl is active, not disabled.** This item previously said next-intl was fully scaffolded but dead; that's no longer accurate. `NextIntlClientProvider` is wired into `src/app/layout.tsx`, and `useTranslations`/`getTranslations` are called from `Header.tsx`, `Landing.tsx`, `AuthModal.tsx`, `SideBar.tsx`, `MobileNavBar.tsx`, `DeletePopupModal.tsx`, `useEventUploadForm.ts`, `Language.tsx`, `SwitchAppearance.tsx`, `GoogleAuthButton.tsx`, and `eventSchema.ts`. Left here as a record of the correction rather than deleted, per this document's own practice of calling out discrepancies explicitly.
3. **Resolved 2026-08-23 — was: Hubtel OTP credentials exposed to the browser.** Hubtel calls are now server-only (`src/services/hubtelOtpClient.ts`, called only from Server Actions), using non-`NEXT_PUBLIC_` env vars `HUBTEL_API_CLIENT_ID`/`HUBTEL_API_CLIENT_SECRET`.
4. **Resolved 2026-08-23 — was: phone sign-in does not create a real session.** After Hubtel confirms an OTP, `src/actions/verifyPhoneSignIn.ts` finds-or-creates the `auth.users` row via the Supabase Admin API (service-role) and mints a real session (one-time random password → `signInWithPassword` through the SSR cookie-writing client → password rotated again immediately). See `src/actions/verifyPhoneSignIn.ts`'s own comment for the full mechanics and why this approach was chosen over Supabase's native phone OTP.
5. **Resolved 2026-08-18 — was: no payment-gateway integration, though the database expected one (Flutterwave).** Paystack (test mode) is now wired end-to-end between `validateCheckout` and `generateTicket`/`activateSubscription` — see §7.6 discrepancy #2 and §9's Server Actions section. `transaction.flutterwave_txn_id` was renamed to `paystack_reference`, and `finalizePaystackPayment.ts` now inserts a real `transaction` row (and links it via `ticket.transaction_id`/`subscription.transaction_id`) on every verified payment. `/transactions` still reads from `ticket_checkout`/`subscription_checkout` (2026-08-17 rebuild, see §5) rather than the `transaction` table — that's unaffected by this change, just worth noting they're separate data paths.
6. **No generated Supabase types.** All queries are untyped against the schema; several places use `as unknown as X` casts to work around this (`generateTicket.ts`, `validateCheckout.ts`).
6a. **Resolved 2026-08-25.** The pulled baseline schema (2026-08-10) had no Row Level Security policies — every table was schema-wide `GRANT ALL`-ed to `anon`/`authenticated`/`service_role` with no `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` statements. RLS has since been enabled on most tables via the `20260825105233_enable_rls_ticketing_batch1.sql` through `..._batch7...sql` migrations plus `20260825110112_enable_rls_wallet.sql`. Access control today is RLS **and** the application-layer `auth.getUser()` checks together, not application-layer-only. See §7.1's RLS note.
6b. **Several tables have no partitions and may not accept inserts.** `event_media`, `wallet`, `story`, `event_share`, and `media_audit` are declared as partitioned tables with zero partitions defined in the pulled schema; `review`'s partitions only cover June–October 2025. See §7.5 for details — this may be a pull artifact rather than a real production issue, but is worth verifying. **`payment_method` is no longer in this list** — `20260816150312_add_wallet_and_payment_attempt.sql` (2026-08-16) gave it 4 real partitions; inserts work today (see §7.2's table entry).
6c. **`useUserProfile.ts` reads non-existent columns.** It reads `data.displayName`, `data.email`, `data.phone`, `data.createdAt`, `data.lastSignInAt` from a `user_info` row, but none of those columns exist on the real `user_info` table (see §7.6 discrepancy #3). These fields are always `undefined` in practice.
7. **Resolved.** `pathname.startsWith("/auth")` was previously listed twice in the public-route array in `updateSession()`; the duplicate is removed and the `/user` prefix was tightened to `/user/` (see §8).
8. **Unintended prefix overlap**: `/user-account` matches the `/user` public-route prefix in the middleware, so it is treated as public even though it may be intended to require auth.
9. **Confirmed table/view-name bug**: `getUserProfileDetails` action correctly queries the real view `user_profile_details` (plural), but `api/user-profile/route.tsx` queries `user_profile_detail` (singular), which **does not exist** in the database at all (confirmed against the real schema — see §7.6 discrepancy #1). That API route will fail whenever it's called.
10. **Resolved 2026-08-23 — was: two OTP providers in use for different flows.** The Twilio-based phone-update flow (`sendOtpForPhoneUpdate.ts`, `verifyOtpAndUpdatePhone.ts`) was deleted; Settings → Security's phone add/change now shares the same Hubtel-based flow as sign-in (`requestPhoneVerification.ts` + `updateVerifiedPhone.ts`).
11. **Literal space in a directory name**: `src/landing Page/` — atypical and can cause friction with some shell tooling/scripts.
12. **Boilerplate README**: [README.md](README.md) is still the unmodified `create-next-app` default and does not describe this project.
13. **Correction from an earlier version of this document**: it was previously assumed (from `useUserProfile.ts`'s field mapping) that `user_info` had camelCase columns like `displayName`/`createdAt`/`lastSignInAt` alongside snake_case ones. The real schema shows this was wrong — `user_info` is consistently snake_case (`status_id`, `avatar_public_id`, `avatar_version`, `updated_at`, plus `username`, `full_name`, `bio`, `website`), and the camelCase fields simply don't exist in the database (see item 6c above and §7.6 discrepancy #3).
13a. **New: `audit_log` function has no matching table or trigger.** The database function `log_user_changes()` inserts into a table called `audit_log`, but no such table is created anywhere in the pulled schema, and no trigger currently invokes this function. It would error if called. See §7.5.
13b. **New: `ticket.ticket_code` is not unique at the database level**, `ticket_type` has no price/quantity/type CHECK constraints, and `promo_code.discount_percentage` has no 0–100 range check — all of this validation exists only in application code (Zod schemas, manual checks), not enforced by the database. See §7.6 discrepancies #4–#5.
14. **`.env.local` present locally with real-looking third-party secrets** (Supabase, Cloudinary, Twilio, Resend, Google OAuth, Hubtel). It is correctly excluded via `.gitignore` (`.env*`) and confirmed not tracked by git — noted for awareness, not a repo-tracking issue.
15. **Partial React Query adoption**: the provider is global but most data fetching still bypasses it in favor of ad hoc `useEffect` + Server Action calls, so caching/invalidation behavior is inconsistent across features.
16. **NextAuth-related env vars present but package not installed**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` exist in `.env.local` with no corresponding `next-auth` dependency in `package.json` — likely vestigial from an earlier auth approach.
17. **Resolved (2026-08-15): the root layout no longer forces every route dynamic.** It previously called `getLocale()`/`getMessages()` from `next-intl/server`, which reads the locale from `cookies()` — and since this happened in the root layout, it forced **every** page in the app into per-request dynamic rendering (confirmed via `npm run build`: all 34 routes showed as `ƒ (Dynamic)`, including static pages like `/plans`). Fixed by having the root layout always server-render the default locale (`en`) instead — `src/app/layout.tsx` no longer touches `cookies()` — and introducing `src/i18n/LocaleProvider.tsx`, a client component that corrects to the visitor's saved locale (from the `NEXT_LOCALE` cookie) right after hydration, and exposes `useLocaleSwitcher()` so `Language.tsx` can apply a locale instantly on selection. **Trade-off, accepted explicitly by the user**: visitors using a non-default locale (fr/es/de/pt/ak) see a brief flash of English text on first paint before the client correction runs. This does not affect `getTranslations()` (server-side) calls elsewhere in the app (e.g. the `(settings)` pages) — those remain cookie-based and correctly per-request, since those routes are already dynamic for auth reasons and lose nothing by staying that way. As a result of this fix, `npm run build` at the time showed `/`, `/around-you`, `/events`, `/plans`, `/wallet`, and `/_not-found` as `○ (Static)`. `/events/[eventCode]` and `/search/[searchTitle]` were also switched to the cookie-free `src/config/supabase/publicClient.ts` and given `export const revalidate = 60`; they still show as `ƒ` in the build output because they have no `generateStaticParams` (expected — Next.js can't know which event codes/search titles to prerender at build time), but per Next's documented `dynamicParams` behavior, params not in `generateStaticParams` are "generated at request time" and then follow normal ISR caching — this was not independently verified against live `x-nextjs-cache` response headers in this session, only against the documented behavior and the fact that no dynamic API (`cookies()`/`headers()`) remains in their render path. **Note (2026-08-16): `/wallet` is no longer in the static list** — see item 18, it now fetches per-user payment methods and is deliberately `force-dynamic`.
18. **Fixed (2026-08-16): `/wallet` was accidentally coupled to checkout state.** Since commit `94d3742`, `/wallet` and `/wallet/[checkoutId]` both rendered the pending-checkout "basket" component, so a completed purchase (whose `ticket_checkout` rows flip to `status='paid'`) made `/wallet` show "No pending checkouts." — wallet management was, in effect, unreachable without an active balance-due checkout. Fixed by giving the checkout basket its own routes (`/checkout`, `/checkout/[checkoutId]`) and making `/wallet` a real, checkout-independent payment-method management page (see §5, §7.6 discrepancy #6, §7.2's `payment_method`/`payment_attempt` rows). Ticket and subscription checkout now share one `PaymentMethodSelector` component for picking/adding a saved method during payment. **The "remaining limitation" this item originally noted (no payment gateway, `payment_attempt` stuck at `initiated`) is resolved as of 2026-08-27** — see item 5 and §17's 2026-08-27 entry: Paystack now drives `payment_attempt` to `succeeded`/`failed`/`refund_pending` for real.

---

## 17. Potential Improvements (derived from the above, not yet implemented)

- Resolve the Next.js 16 Cache Components TODOs left across every route rather than leaving them commented out indefinitely.
- **Resolved 2026-08-23**: Hubtel OTP requests moved server-side; the Supabase-session-issuing part of phone/OTP sign-in was completed. See §16 items 3/4/10.
- Generate and adopt Supabase TypeScript types (`supabase gen types typescript`) to remove manual `as unknown as X` casts and catch schema drift at compile time.
- **Resolved 2026-08-25**: RLS is now enabled on most tables (see §7.1/§8) — this item is no longer open.
- Verify directly against the live database whether `event_media`, `payment_method`, `wallet`, `story`, `event_share`, and `media_audit` truly have no partitions (or whether the pull simply missed them), and either add partitions or fix the pull. Add new monthly partitions for `review` going forward (currently stops at October 2025).
- **Resolved 2026-08-18**: Paystack payment flow implemented (test mode), and `generateTicket` now receives a real `transaction` row id for paid events (see §7.6 discrepancy #2).
- Fix `src/app/api/user-profile/route.tsx` to query the real `user_profile_details` view instead of the non-existent `user_profile_detail`.
- Fix `useUserProfile.ts` to stop reading `displayName`/`email`/`phone`/`createdAt`/`lastSignInAt` from `user_info` (columns that don't exist) — either add real columns for these or source `email`/`phone`/timestamps from the Supabase Auth user object instead.
- **Resolved 2026-08-16**: `payment_method` is wired up to a real, checkout-independent `/wallet` page (see §5, §7.6 discrepancy #6).
- **Resolved 2026-08-17**: `/transactions` was rebuilt into an analytics + history page sourced from `ticket_checkout`/`subscription_checkout` instead of the permanently-empty `transaction` table (see §5's Transactions entry, item 5 above). No organizer-facing transactions view was added; organizer revenue stays on the separate `/manage/dashboard`.
- **Resolved 2026-08-27** (supersedes the "remaining gap" notes previously attached to the two entries above): Paystack now drives `payment_attempt.status` all the way to `succeeded`/`failed` for real — popup checkout, saved-card/mobile-money direct charge, mobile-money OTP, and the webhook at `src/app/api/paystack/webhook/route.ts` all funnel through the one `finalizePaystackPayment` function, so client-triggered verification and the webhook race safely (whichever resolves first does the real work; see `src/utils/finalizePaystackPayment.ts`). `transaction` is populated by real charges, not unused. Refunds are implemented too, not a stub: `issueRefund.ts` calls Paystack's real refund API and flips `transaction.status` to `refund_pending`/`refunded` via the `record_refund_hold` RPC; `cancelUserTicket.ts` only requests one once every ticket sharing a transaction is cancelled (Paystack refunds a whole charge, not partial amounts).
- Add a `UNIQUE` constraint on `ticket.ticket_code`, and `CHECK` constraints on `ticket_type.price`/`quantity`/`type` and `promo_code.discount_percentage` to move validation into the database as a safety net alongside the existing Zod validation.
- Either attach `log_user_changes()` to a trigger and create the `audit_log` table it expects, or remove the function if it's dead.
- Consider a full Cache Components migration (`cacheComponents: true` in `next.config.ts`) to remove the English-first-paint flash accepted in item 17, using `<Suspense>` boundaries instead of a client-side locale correction. This is the officially-recommended long-term direction (matches the "Cache Components adoption" TODOs already left across ~30 route files) but is a large, incremental, multi-session migration with its own landmines (any `new Date()`/`Math.random()`/`crypto.randomUUID()` used during server render breaks the build immediately once the flag is on, opt-out or not) — not audited in this pass.
- Fix the duplicated `/auth` check and the `/user-account` vs `/user` prefix overlap in `updateSession()`'s public-route logic.
- Standardize on a single OTP provider for both sign-in and phone-update flows.
- Rename `src/landing Page` to remove the space, if/when a broader refactor touches that area.
- Update `README.md` to describe the actual project instead of the `create-next-app` default.
- Add a `PRD.md` or equivalent product doc, since the current one is a placeholder.

---

## 18. Places Feature (Phase 1)

**Confirmed** (verified against [supabase/migrations/20260820090000_add_places_feature.sql](supabase/migrations/20260820090000_add_places_feature.sql) and [supabase/migrations/20260821090000_add_place_id_to_create_event.sql](supabase/migrations/20260821090000_add_place_id_to_create_event.sql), the same way §7 was verified against its own migration rather than assumed from application code)

Places is a second first-class content type alongside Event — restaurants, pubs, gyms, hotels, and similar venues that users can discover and optionally connect to Events (an Event can happen "at" a Place). Built on branch `feature-places-discovery`, following the reuse-first conventions documented elsewhere in this file (Server Action `{status, message?, data?}` return shape, cursor-pagination via `src/utils/pagination.ts`/`src/types/pagination.ts`, the atomic-RPC pattern `create_event`/`create_place` both follow, the same Cloudinary upload chokepoint pattern). At the time this section was written, Place tables had no RLS, matching every other table in this schema as a deliberate decision — **that has since changed**: RLS was enabled on the `place`/`place_category`/`place_photo`/etc. tables by `20260825105513_enable_rls_places_batch3.sql` (see §7.1's RLS note).

**New routes**:
- `/explore`, `/explore/[location]` — the new primary discovery entry point, replacing `/events/location/[location]` as the destination linked from the landing page and primary nav (Header/SideBar/MobileNavBar). Has Events/Places tabs (`?tab=events|places`, shallow-URL-synced, same pattern as `/manage/my-events`'s `MyEventsTabs.tsx`). The old `/events/location/[location]` route is untouched and still reachable — not linked from primary nav anymore, but not removed.
- `/places/[slug]` — Place details page, `revalidate = 60`, mirrors `/events/[eventCode]`'s structure (hero, primary actions, About/Hours/Services/Photos/Location/Contact/Upcoming Events/Reviews/Similar Places).
- `/manage/places`, `/manage/places/[placeId]` — organizer-side list + tabbed management page (Details/Photos/Hours/Services/Reviews/Insights), gated by a new `useIsPlaceOwner()` hook (mirrors `useIsOrganizer()`).
- `/user/[username]/places` — a profile's owned places (public, like Posts — not gated to the profile owner the way Favorites is).
- `/user/[username]/favorites` was extended (not replaced) to show a second "Favorite Places" section alongside the existing "Favorite Events" section.

**New database tables** (all non-partitioned — deliberately, since several existing partitioned tables in this schema were pulled with zero partitions defined and can't accept inserts, see §7.5 — and none have RLS, per the confirmed decision above):
- `place_category` — a real lookup table (14 seeded rows: Restaurant, Food Spot, Pub, Nightclub, Gaming Center, Cinema, Gym/Fitness, Hotel, Supermarket, Skating, Go-Karting, Entertainment, Recreation, Other), unlike `event_category`/`event_type` which remain a hardcoded TS array (`src/data/eventCategoriesAndTypes.ts`).
- `place` — the core record (`owner_id → user_info`, `category_id → place_category`, `location geography(Point,4326)` + `address jsonb` mirroring `event`'s shape, `cover_public_id`/`cover_version`, `status`, `temporary_status`/`temporary_status_note` for owner-overridden closures, `claimed`/`verified` booleans as foundation-only columns for a future claim/verification flow — no claim UI exists yet).
- `place_photo`, `place_opening_hours` (multiple rows per `day_of_week` supported, for split shifts), `place_service` (price always nullable), `place_review` (`UNIQUE(place_id, reviewer_id)` — one review per user per place, enforced at the DB level; deliberately a separate table from `review`, not shared/polymorphic, since `review.reviewed_id` is hard-wired to a person via an organizer-attendance gate baked into `postReview.ts` that place reviews don't use), `place_report` (moderation foundation only, no admin UI), `favorite_place` (mirrors `favorite`'s shape rather than adding a polymorphic column to it), `place_analytics_event` (view/direction_click/phone_click/whatsapp_click/website_click/booking_click — Phase 1's "basic insights", explicitly not claiming verified physical visits).
- `event.place_id` — one additive, nullable column on the existing `event` table (`ON DELETE SET NULL`), so an Event can optionally reference a Place as its venue.

**New RPCs**: `create_place` (atomic multi-table insert — place + opening_hours + services — idempotent via `client_request_id`, same pattern as `create_event`), `get_nearby_places`/`get_filtered_places` (PostGIS radius search + filters, cursor-paginated on `(distance_km, id)`, mirroring `get_nearby_events`/`get_filtered_events`), `place_is_open_now` (single source of truth for open/closed, used by `get_filtered_places`'s "open now" filter; a separate pure-TypeScript mirror, `src/utils/computePlaceOpenStatus.ts`, drives the richer client-side "closes at X" display). `create_event`'s signature was changed (`DROP`+`CREATE`, since Postgres has no `ALTER FUNCTION ... ADD PARAMETER`) to add one trailing `p_place_id uuid DEFAULT NULL` param — existing callers are unaffected.

**Server Actions**: ~30 new files under `src/actions/` (`postPlace`, `updatePlace`, `getPlaceBySlug`, `getNearByPlaces`, `getQueriedPlaces`, `getOrganizerPlaces` — accepts an optional `username` to view any profile's places, falling back to the authenticated caller's own when omitted — `getPlaceCategories`, `addPlaceService`/`updatePlaceService`/`removePlaceService`, `updatePlaceOpeningHours`, `setPlaceTemporaryStatus`, `savePlacePhotoToCloudinary`/`getPlacePhotoUploadSignature`/`addPlacePhoto`/`removePlacePhoto`/`reorderPlacePhotos`, `addPlaceToFavorite`/`removePlaceFromFavorite`/`checkIfPlaceIsFavorited`/`getUserFavoritePlaces`, `postPlaceReview`/`getPlaceReviews`/`getPlaceRating`/`respondToPlaceReview`, `reportPlace`/`reportPlaceReview`, `getPlaceUpcomingEvents`, `logPlaceEngagement`/`getPlaceInsights`, `getUserPlaceRole`) — see `src/actions/` itself as the source of truth, same convention §9 already establishes for events.

**UI**: a new `src/places/` feature folder (atoms/molecules/organisms), following the same per-feature atomic-design precedent as `src/wallet/`/`src/settings/`/`src/userAccount/` (`src/events/` does not actually exist in this repo despite being referenced in some docs — `src/wallet/` is the real precedent). The "Post" button (`EventUploadButton.tsx`, `SideBar.tsx`) became a "Create" popover (`src/places/molecules/CreateMenu.tsx`) offering Event or Place.

**Explicitly deferred to Phase 2/3, not built in this pass**: map/list toggle view, Place verification badge UI, Claim Place flow UI (DB columns exist, no UI), Featured Places / paid promotion (no `Promotion` table — no consumer yet, and monetization was explicitly deferred until organic demand exists), bookings, verified-visit review signals, business subscriptions, and any new notification system (no notification infrastructure exists anywhere in this codebase to extend — a separate future initiative, not silently skipped). The Explore page's "Popular Places" and "Featured Places" sections were likewise omitted (no ranking RPC / no promotion flag exists yet); "Top Rated" uses a small client-side re-sort of an already radius-and-rating-filtered page rather than a dedicated rating-sort RPC parameter.

**Resolved (2026-08-21):** both migrations above have since been applied to the live linked Supabase project (`sderrexhawjbmsugndcq`) and verified by direct read-back (`place`/`place_category`/all Phase 1 RPCs confirmed present, `create_event`'s new signature confirmed live). They were not applied via `supabase db push` — the project's migration history has pre-existing drift unrelated to this feature (~33 remote-applied migrations with no matching local files, present before this branch started) that made `db push` refuse to run. Applied instead via `supabase db query --linked --file <path>`, then recorded in history via `supabase migration repair --status applied`. All Phase 2 migrations (§20) used this same verified path.

**Needs Investigation**
- `getPlaceUpcomingEvents`'s attendance/price joins were added to match `EventCard`'s expected shape, but weren't exercised against real ticket data.
- The pre-existing migration-history drift noted above (remote history references ~33 migration file names not present in this repo's `supabase/migrations/`) predates this feature and wasn't caused by it, but is worth investigating/reconciling properly (e.g. via a careful `supabase db pull`) before relying on `supabase db push` for future work.

---

## 19. Notifications (Places Phase 2, Milestone 1)

**Confirmed** (verified against [supabase/migrations/20260823090000_add_notifications.sql](supabase/migrations/20260823090000_add_notifications.sql), applied live before this milestone's code was written)

Genuinely new infrastructure — no notification system of any kind existed before this (§18 explicitly noted this as deferred). `src/components/atoms/Notification.tsx` is an unrelated stateless toast component and is not part of this system.

**Database**: one general-purpose `notification` table (see §7.2), RLS-enabled (2026-08-25, see §7.1), no partitioning.

**Server Actions** (`src/actions/`): `createNotification.ts` (internal helper only — not safe to call from `"use client"` code, since it performs no auth check; accepts an optional pre-built Supabase client so callers with no cookie session, e.g. webhooks/cron, can still write notifications, mirroring the `authOverride` precedent in `finalizePaystackPayment.ts`/`generateTicket.ts`), `getUserNotifications.ts` (auth required, cursor-paginated `PaginatedResult<NotificationType>`, same `SimpleCursor`/`keysetOlderThan` pattern as `getPlaceReviews.ts`), `getUnreadNotificationCount.ts` (auth required, count-only), `markNotificationRead.ts` and `markAllNotificationsRead.ts` (both auth + ownership-scoped via `.eq("user_id", user.id)`).

**Types**: `src/types/notificationType.ts` — manual `NotificationType`/`CreateNotificationInput` interfaces, matching this repo's no-generated-types convention.

**UI**: `src/components/organisms/NotificationBell.tsx` — a bell icon + unread-count badge in `Header.tsx`'s signed-in desktop nav row, shown to every signed-in user (not gated by `isOrganizer`/`isPlaceOwner`). Click opens a hand-rolled anchored popover (same convention as `src/places/molecules/CreateMenu.tsx` — click-outside + Escape to close) containing an `InfiniteList` of notifications. Unread rows are distinguished by both a background tint and a dot (not color alone). `src/hooks/useUnreadNotificationCount.ts` backs the badge with a 30s `staleTime`/`refetchInterval`. **Not added to `MobileNavBar.tsx`** — its bottom bar is a fixed 5-slot layout (Home/Search/Transactions/Wallet/Account) with no clean slot for a 6th icon; left as a future call if mobile needs it.

**Not built in this pass**: no notification-producing call sites were added anywhere (event reminders, place-review replies, etc.) — `createNotification` exists as infrastructure only, ready for a future milestone to actually call it from relevant flows. **Update (§20 below):** subsequent Phase 2 milestones did wire up real trigger points (claim review, booking status changes, promotion activation) — the "infrastructure only" state above describes Milestone 1 specifically, not the current state of `createNotification`'s callers.

**Update (mobile production-refinement pass, `20260905090000_add_notification_metadata.sql`, applied live via MCP):** the `notification` table gained `data jsonb NOT NULL DEFAULT '{}'` (`{ kind, eventId?, placeId?, placeSlug?, ticketId?, reviewId? }` — the structured target, preferred over parsing `link`), `image_public_id text`, `image_version varchar(10)` (the row's thumbnail — event flyer / place cover). No RLS change (still app-layer only). `createNotificationCore` / `CreateNotificationInput` / `NotificationType` carry the new fields; `sendPushToUser` ships `data` in the Expo push payload. New producers: `ticket_confirmed` (`generateTicket` `after()`, notifies the buyer), `event_featured` / `place_featured` (`activate{Event,Place}Promotion`), `review_reply` (`respondToEventReview` + `respondToPlaceReviewCore`, notifies the *reviewer*, skips self-replies). Mobile `notificationTarget()` (`apps/mobile/src/features/notifications/notificationLink.ts`) resolves a notification to a native route from `data` first; the mobile list is a grouped `SectionList` with thumbnails; the push-tap handler routes through the same translation.

**Update (refinement follow-up round, see `docs/mobile/16`):** two bugs meant most of the producers above never actually wrote a row. (1) `notification` **does** have RLS (owner-only SELECT/UPDATE, **no INSERT policy** — `20260825105625_enable_rls_social_batch4`; the "No RLS change / still app-layer only" note above was wrong), so every producer running on a session client silently failed the insert. `createNotificationCore` now always inserts via `getSupabaseServiceClient()` (fallback to the passed client only if the service-role env is unset) — one choke point, so all producers work regardless of transport. (2) `ticket_confirmed` was in an `after()` callback that the Paystack webhook path drops on suspend — now awaited inline. New producer **`review_received`** (`20260906090000_notify_on_review_posted`, applied via MCP): AFTER INSERT triggers on `event_review` / `place_review` notify the organizer / owner — `SECURITY DEFINER` (they write for a different user; `notification` INSERT is RLS-locked), `search_path=''`, `EXECUTE` revoked from `anon`/`authenticated`; `data.kind = "review_received"`, routes to the owner's review screen. This is the transport-agnostic answer to reviews being creatable from both the web action and a direct mobile client insert. Still **not** fixed: `payment_attempt.status` sync, and no INSERT RLS policy was added (service-role write is the deliberate route).

---

## 20. Claim/Verification, Map/List View, Bookings, and Featured Places (Places Phase 2, Milestones 2–5)

**Confirmed** — all migrations below applied and read-back-verified against the live linked Supabase project via the same `supabase db query --linked --file` + `migration repair` path documented in §18's resolved note.

### Claim / Verification (Milestone 2)
This schema had zero admin/moderator role before this migration — confirmed by grepping the whole codebase during planning. Adds `user_info.is_admin boolean DEFAULT false` (the one and only admin surface introduced) and `place_claim_request(place_id, claimant_id, note, contact_phone, contact_email, status: pending/approved/rejected, reviewed_by, reviewed_at)`, with a partial unique index allowing only one pending request per (place, claimant). Claiming never auto-transfers ownership — only the `approve_place_claim(request_id, admin_id)` RPC does that, atomically reassigning `place.owner_id` and setting `claimed = true, verified = true` (claim-review IS the verification signal in this phase — no separate document-upload flow exists). New actions: `getIsAdmin`, `submitPlaceClaimRequest`, `getPlaceClaimRequests`, `reviewPlaceClaimRequest`. New route `/admin/place-claims` — intentionally the only admin page in the app, gated both by the proxy's auth requirement and its own server-side `is_admin` re-check (not just hidden UI). `VerifiedBadge.tsx` shown on `PlaceCard`/details hero when `place.verified`.

### Map / List View (Milestone 3)
UI-only, no schema change — reuses `get_filtered_places`/`getQueriedPlaces` as-is. `src/places/organisms/PlacesMapView.tsx` (new — `MapPicker.tsx` is single-marker-only and wasn't reusable for multi-place discovery) renders one Google Maps marker per place with `map.fitBounds()`, marker-click opening a responsive bottom-sheet/side-panel preview. Toggle lives at `?view=list|map` on `/explore/[location]`, preserving every other active filter.

### Bookings (Milestone 4)
Confirmed scope: **reservation request only, no in-app payment** — the owner accepts/declines, money (if any) changes hands off-platform. `place_booking(place_id, service_id NULL, customer_id, requested_time, party_size, note, status: pending/accepted/declined/cancelled)`. New actions: `requestPlaceBooking`, `getPlaceBookings` (owner), `respondToPlaceBooking` (owner), `cancelPlaceBooking` (customer), `getUserBookings`. New "Bookings" tab on `/manage/places/[placeId]` (owner) and on the user profile (`/user/[username]/bookings`, `isCurrentUser`-gated like Favorites — a person's own bookings aren't public). Each status change fires a notification via `createNotification`. **Known pre-existing quirk, not introduced here:** like the existing Favorites tab, `/user/[username]/bookings` is self-scoped (always shows the signed-in viewer's own bookings) rather than genuinely reading the `:username` path segment — visiting another user's bookings URL directly shows your own data, not theirs.

### Featured Places (Milestone 5)
The one Phase 2 area touching real payments — confirmed design decisions, made explicitly with the user before implementation:
- **No `organizer_ledger_entry` row is written.** That table's columns/RLS/CHECKs are hard-wired to "money owed TO an organizer" (payout semantics) — verified by reading `20260819110000_add_organizer_finances_ledger.sql` in full. Promotion revenue is money Abonten keeps, the opposite direction, so it's recorded only via the existing gateway-agnostic `transaction` table (new `reason: 'Promotion_Purchase'`).
- **`place_promotion_checkout` mirrors `subscription_checkout`'s exact column shape** (verified live before writing the migration) — a genuine one-off, non-inventory purchase, not `ticket_checkout`'s reservation/promo-code machinery.
- **Pricing lives in a seeded config table**, `place_promotion_tier(duration_label, duration interval, price, currency, is_active)` — 4 seeded rows (24h/3-day/7-day/1-month) — not hardcoded UI constants, per the spec's explicit instruction. Editable later by direct DB edit, same precedent as `place_category`.
- **`place_promotion(place_id, tier_id, starts_at, ends_at, promotion_checkout_id)`** is the actual "currently featured" record — whether one is active is always computed (`ends_at > now()`), never stored.
- **`payment_attempt`** gained a third nullable `place_promotion_checkout_id` FK; its "exactly one checkout target" CHECK became a 3-way exactly-one check (integer-cast-and-sum idiom, `= 1`).
- **`src/utils/finalizePaystackPayment.ts` — the single authoritative verify+finalize path used by every payable thing in this app (tickets, subscriptions, and now promotions) — gained a third branch**, calling the new `activatePlacePromotion.ts` (mirrors `activateSubscription.ts`). `src/utils/paymentAttempt.ts`, `src/actions/createPaymentAttempt.ts`, and `src/components/organisms/PaymentMethodSelector.tsx` (new `kind: "promotion"` variant) were extended the same way — no parallel payment path was introduced.
- **`get_active_place_promotions()`** RPC (a fourth member of the `get_nearby_places`/`get_filtered_places`/`place_is_open_now` family) powers the Explore page's real Featured Places section — `ORDER BY random()` per request, so no single business can buy the top slot and permanently keep it, per the spec's explicit fairness requirement; PostgREST's query builder can't express `ORDER BY random()`, which is why this needed to be an RPC rather than a plain `.select()`. Each card is labeled "Sponsored" (`SponsoredBadge.tsx`, deliberately styled distinct from `VerifiedBadge`/rating colors so it never reads as a quality signal) and fires a `promotion_impression` `place_analytics_event` on render.
- New "Promotion" tab on `/manage/places/[placeId]` (tier picker → `insertPlacePromotionCheckout` → `/checkout/[checkoutId]?type=promotion`, a new branch alongside the existing ticket/subscription branches on that page).
- Same environment limitation as everywhere else in this session: Paystack itself operates in test mode (per §5/§9's existing notes) — this was not switched to live payments, and end-to-end payment success wasn't exercised against a real Paystack charge in this pass, only verified by schema/RPC read-back and `tsc`/build.

**Needs Investigation**
- End-to-end live testing of all four Milestone 2–5 flows (approve a real claim, toggle the map view, accept a real booking, complete a real Featured Places Paystack test-mode charge) has not been performed in this session — only static verification (`tsc`, Biome, `npm run build`, and direct read-back queries against the live schema) was done, consistent with every other Places milestone in this document.

---

## 21. Event Cancellation → Refund Flow

**Confirmed** (verified against `supabase/migrations/20260902150000_add_event_cancellation_refund_flow.sql`, applied and read-back-verified live on the linked project the same way every other migration in this document was)

**Before this change:** `cancelEvent.ts` was a one-line stub — `UPDATE event SET status='canceled' WHERE id=? AND organizer_id=?` — with no idempotency check (cancelling a `draft`/`completed`/already-`canceled` event silently "succeeded" again) and zero awareness of tickets, attendance, checkouts, transactions, or notifications. A real, working attendee-initiated refund pipeline already existed (`cancelUserTicket.ts` → `issueRefund.ts` → Paystack `/refund` → webhook confirms `refund.processed`/`refund.failed`), but nothing wired organizer-initiated cancellation into it. `RefundButton.tsx` (shown on every event card's menu, to every user) was a dead stub with no `onClick` handler at all — deleted as part of this change, not repurposed.

**What changed — two new `SECURITY DEFINER` Postgres functions, no new tables/columns:**
- **`get_event_cancellation_impact(p_event_id uuid)`** — read-only. Returns `paid_ticket_count`/`free_ticket_count`/`attendee_count` for the organizer's confirmation dialog, computed server-side (never trusting client assumptions). Must be `SECURITY DEFINER`: an organizer's own session can't read other users' `ticket`/`attendance` rows under RLS, even for their own event.
- **`cancel_event_and_release_tickets(p_event_id uuid)`** — the atomic operation. Gates on `event.status IN ('draft','published')` before flipping to `canceled`; a second/retried call always fails cleanly (distinguishable messages for "already cancelled" vs "not found/owned" vs "not cancellable") instead of re-running any side effect — this is the idempotency guard, no separate locking needed. In one `WITH`-chained statement it then cancels every `active`/`used` `ticket`, every `attending` `attendance` row, and every `paid` `ticket_checkout` row for the event, and **inserts one `notification` row per affected attendee** (not per ticket — deduplicated, copy branches on whether that attendee had a paid ticket). The notification insert had to live inside this `SECURITY DEFINER` function because `notification` has **no INSERT RLS policy at all** (`20260825105625_enable_rls_social_batch4.sql` — owner-only SELECT/UPDATE; its own comment says inserts are meant to be system-generated) — a normal session client, even the organizer's own, cannot insert a notification row for a different user. This is the same class of problem `record_organizer_earning`/`approve_place_claim` already solve the same way. **This also means the pre-existing cross-user `createNotification.ts` call sites (`reviewPlaceClaimRequest.ts`, `respondToPlaceBooking.ts`) are, on inspection, silently failing under RLS today** — a normal admin/owner session calling `createNotification` targeting a *different* user's `user_id` has no INSERT policy to satisfy. This is a pre-existing bug predating this change, flagged here per this document's own practice of surfacing discrepancies rather than silently living with or silently fixing them; **not fixed as part of this change** (fixing it generically is a broader decision than this task's scope — this change only routes its own notification writes around the gap via `SECURITY DEFINER`, the same way the ledger RPCs already do).
- The actual Paystack refund call is deliberately **not** inside the RPC (an HTTP call can't be part of a Postgres transaction). The function returns the deduplicated list of `(refund_transaction_id, attendee_user_id, paystack_reference, transaction_amount, transaction_currency, event_title)` for transactions that actually need a refund (`amount > 0`, filtering out free/fully-discounted tickets the same way `getUserTicketRefunds.ts` already does); `cancelEvent.ts` drives the **existing, unmodified** `issueRefund.ts` over that list afterward. `issueRefund.ts` is already idempotent (checks `transaction.status` before doing anything), so a partial failure here is safely retryable and never leaves the system claiming a refund succeeded when it didn't.

**Server Actions:**
- `cancelEvent.ts` — rewritten. Calls the RPC, maps its distinguishable error messages to clear product-language responses (409 already-cancelled, 403 not-owned, 409 not-cancellable), then `Promise.allSettled`s `issueRefund` over the returned transactions, and fires cancellation emails via `after()` (non-blocking, mirrors `ticketPurchaseNotification.ts`'s pattern) for paid attendees only. Returns `{refundsInitiated, refundsFailedToStart}` so the UI never overstates success.
- `getEventCancellationImpact.ts` — new, thin wrapper around the read-only RPC, powers the confirmation dialog.
- `eventCancellationNotification.ts` — new. Uses `getSupabaseServiceClient()` (not a cookie session) to resolve each affected attendee's email via the Admin API, since the organizer's own session can't look up other users' emails — the same "identity already proven before using the service client" precedent `serviceClient.ts` documents for its other callers (the organizer's identity and event ownership were already verified by `cancelEvent.ts`/the RPC before this ever runs). Env-gated on `RESEND_API_KEY` exactly like `ticketPurchaseNotification.ts`; never claims a refund is complete, only "processing," since `transaction.status` is `refund_pending` (not `refunded`) the moment this email is sent.

**UI:**
- `CancelButton.tsx` fetches `getEventCancellationImpact` when the confirm dialog opens and branches its copy: paid tickets sold → explicit refund warning; free registrations only → attendee-notification copy; no attendees → plain confirmation. All branches state the action cannot be undone. Cancel-label changed from "Keep Event" to "Go Back".
- `TicketsList.tsx` (My Tickets): a cancelled ticket's card now shows **"Cancelled by organizer"** vs plain **"Cancelled"**, derived from `ticket.event.status === 'canceled'` — no new query needed, since `event:event_id(*, ...)` was already selected by both `TICKET_WITH_EVENT_SELECT`/`TICKET_REFUND_SELECT`. A new **`RetryRefundBtn.tsx`** appears when `getRefundStatusLabel` reports "Refund failed" (i.e. `transaction.status` still `successful` but `refund_requested_at` is set), calling `issueRefund.ts` again — safe because it's already idempotent. No new tabs were added: a paid cancelled ticket already surfaces under the existing Refunds tab (`transaction.amount > 0`), a free one under the existing Cancelled tab — this flow only needed to populate those existing states correctly, not build new ones.
- `EventCardMenuModal.tsx`: the dead `RefundButton` stub removed entirely; "Cancel Event"/"Manage Promo Codes" are hidden once `event.status === 'canceled'`, replaced with a plain "This event has been cancelled" line.

**Refund behavior — be explicit about what actually happens:** A refund is **requested** from Paystack (test mode, same as every other payment path in this app) the moment `cancel_event_and_release_tickets` returns a transaction to refund — it is not "issued" or "completed" at that point. `transaction.status` moves `successful → refund_pending` on a successful request; only the Paystack webhook's `refund.processed`/`refund.failed` events (pre-existing, unmodified — `src/app/api/paystack/webhook/route.ts`) move it to the terminal `refunded` state or back with `refund_requested_at` marking a failed attempt. No UI or notification/email copy in this change ever states a refund has completed. The refund destination is whatever Paystack's original payment channel was for that transaction — **not** a specific phone number: `transaction.phone_number` is confirmed always `NULL` in the current insert path (`finalizePaystackPayment.ts`), so no copy anywhere claims money goes to "the Mobile Money number used" specifically, only "the payment method used for your ticket."

**Not built / explicitly out of scope:** fixing the general `createNotification.ts`/notification-RLS gap described above; keeping `payment_attempt.status` in sync with `transaction.status` on refund (still a dead status, pre-existing gap, §16 item unchanged); an organizer-entered cancellation reason (not requested); real-time push of the cancellation to an already-open attendee browser tab (no websocket infrastructure exists anywhere in this app — an attendee sees the update on their next fetch/navigation, same as every other piece of state in this app).

**Needs Investigation**
- End-to-end live testing (actually cancelling a real paid event, watching a real Paystack test-mode refund request and webhook confirmation, watching the email actually arrive) was not performed in this session — verified by `tsc`, Biome, `npm run build`, and direct function-signature read-back against the live schema only, consistent with how every other Paystack-touching milestone in this document is qualified.

---

## 22. Customer-Paid Service Fee Model

**Confirmed** (verified against `supabase/migrations/20260903130000_add_customer_paid_service_fee.sql` and its follow-ups `20260903140000` … `20260903190000` — all applied and read-back-verified on the live linked project via `mcp__supabase__apply_migration` + `execute_sql`, the same way every other migration in this document was. The `fix_*` follow-ups correct issues found by post-apply testing against a real organizer's data:
> - `20260903160000` / `20260903170000`: no `min()`/`max()` aggregate exists for `uuid` in PG15, so `record_platform_fee` and `get_user_transaction_history` use `(array_agg(...))[1]` instead. `record_platform_fee` had been erroring on every call since `20260903130000` (non-fatal — `finalizePaystackPayment` logs and continues).
> - `20260903180000` / `20260903190000`: **three pre-existing bugs in the organizer finance RPCs**, unrelated to the fee model but surfaced while checking that a purchase shows up in the organizer's pending balance. `get_organizer_finance_overview` threw *"column reference currency is ambiguous"* (a regression — `20260822090000` fixed it, then `20260826205840_add_refund_hold_ledger_accounting` re-`CREATE OR REPLACE`d it without the fix); `get_organizer_pending_earnings` and `get_organizer_ledger_transactions` threw *"character varying(3) does not match expected type text"* (the `varchar`→`text` cast for `organizer_ledger_entry.currency` that `20260822090000` added to `..._overview` was never added to these two). Net effect: **`/finances` Overview, its Pending-earnings list, and `/finances/transactions` all errored on every load** — the Overview rendering zeros is the symptom. Fixed by aliasing/qualifying and casting `currency::text` in all three.).

**Before this change** the fee model was self-contradictory: `src/utils/checkoutPricing.ts`'s `CHECKOUT_FEE_RATE = 0.02` was already added ON TOP of the ticket price for the customer to pay (in `createPaymentAttempt.ts` / `checkoutPaymentPreparation.ts`, previewed by `CheckoutModal.tsx` / `PendingCheckoutsBasket.tsx`), **and** `record_organizer_earning()` separately DEDUCTED 2% from the organizer's `organizer_ledger_entry` earning — so Abonten collected ~4% and the organizer never received the full ticket price they set.

**Now:**
- **Organizer receives 100% of the ticket price they set.** `record_organizer_earning()` was replaced: the `earning` row is `amount = gross_amount = ticket_checkout.total_price`, `fee_amount = 0`. Settlement (`is_event_settled()`, 48h after the event ends) and payout logic are unchanged — the organizer's full ticket price flows pending → available exactly as before. **Forward-only**: pre-existing `earning` rows keep their locked-in 2% split; nothing backfills historical balances.
- **Abonten's service fee (5% to start) is charged to the customer on top** of the ticket price at checkout. The rate is centrally configurable in the new **`platform_fee_config`** table (`fee_rate`, nullable `currency` for per-currency overrides, `effective_from`, `is_active`) — one seeded row at `0.0500`. Read by `get_active_platform_fee_rate(currency)` (used by the Postgres RPCs) and, for the client checkout preview, by `getServiceFeeRate.ts` → `useServiceFeeRate.ts` (React Query hook) / the server-side `src/utils/platformFee.ts` `getActiveServiceFeeRate()`. `checkoutPricing.ts` now exports `DEFAULT_SERVICE_FEE_RATE` (0.05) as a fallback only; `computeCheckoutFee(amount, feeRate?)` takes the rate. Checkout shows one combined **"Service fee"** line (no "(2%)").
- **Abonten fee revenue is recorded in the new `platform_fee_entry` table** — append-only, RLS-enabled with **no policy** (service_role / SECURITY DEFINER RPCs only; never exposed to buyers or organizers). One `fee` row per successful ticket transaction: `ticket_revenue`, `service_fee`, `total_customer_payment`, `processing_cost` (Paystack's own fee from the verify response `fees` field, threaded through `finalizePaystackPayment.ts`; NULL when Paystack doesn't report it — never assumed 0), `net_revenue` (`service_fee - processing_cost`, NULL when processing cost unknown), `fee_rate`, `currency`, nullable `event_id` (set only when the charge covers exactly one event). Written by `record_platform_fee(p_transaction_id, p_processing_cost)`, called from `finalizePaystackPayment.ts` after every ticket in the charge has been issued (ticket purchases only — promotions have no organizer/ticket split). Idempotent (`platform_fee_entry_fee_once`).
- **Refunds retain the service fee** (confirmed business rule). The refund pipeline moved into `src/utils/issueRefundCore.ts` (`issueRefund.ts` is now a thin buyer-auth wrapper — same core/wrapper split as `finalizePaystackPayment.ts`). It computes `get_transaction_refundable_amount(transaction_id)` — the proportional **`gross_amount`** (full ticket price, so legacy 2%-withheld sales still refund the customer the whole ticket price) for the transaction's tickets — and requests a **partial** Paystack refund of exactly that (via the new optional `amountInPesewas` arg on `refundTransaction()`), not the whole captured charge. If it resolves to 0, the core distinguishes a real ticket-backed accounting gap (falls back to a full refund) from an **orphan transaction with no tickets at all** (returns 400 "No tickets are linked to this payment" — the live DB has 5 such rows, early-2026 test payments where tickets were never created/linked; they are unreachable by the normal cancel flow anyway). `record_refund_hold` (organizer-ledger reversal) is unchanged. A new **`record_fee_refund_adjustment(p_transaction_id)`** writes an audit `fee_refund_adjustment` row (`ticket_revenue` negative, `service_fee` 0, `processing_cost` 0, `net_revenue` 0 — the fee was kept and a Paystack refund incurs no separate processing cost). The `refund_pending → webhook → refunded` / `refund_release` state machine is untouched; nothing marks a refund complete on request.
- **`cancelEvent.ts` (organizer-initiated event cancellation) now actually issues refunds.** It previously called the buyer-scoped `issueRefund` Server Action, which 404'd on every attendee transaction (`transaction.user_id` is the *buyer*, not the organizer). It now calls `issueRefundCore` with a **service-role client** — the `cancel_event_and_release_tickets` RPC has already verified event ownership and returned only that event's refundable transactions, so identity is proven before the core runs (same "identity already proven" precedent as `eventCancellationNotification.ts`).
- **`/transactions` (buyer history) now shows the customer-paid fee.** `get_user_transaction_history` gained `service_fee` + `total_paid` columns, and `get_user_transaction_summary`'s `amount_spent` is now fee-inclusive — both derived from `transaction.amount` (what Paystack captured) proportioned by each checkout row's ticket-revenue share, so multi-checkout basket payments split correctly and legacy sales stay exact with no rate assumption. The list headline shows `total_paid`; the detail page shows a "Ticket Price / Service fee / Total Paid" breakdown (`getUserTransactionDetail.ts` computes the same proportion in TS since `platform_fee_entry` is not buyer-readable).
- **`get_organizer_ledger_transactions()`** now suppresses the `platform_fee` display line when `fee_amount = 0` (new sales); historical 2% lines still render. **`EventFinanceSummary.tsx`** hides the "Abonten fees" row when `platformFee === 0`. The receipt email (`generateTicket.ts` → `ticketPurchaseNotification.ts`) now shows the true `transaction.amount` (ticket + fee) rather than the fee-exclusive subtotal.

**Known limitations / not done:**
- Live end-to-end payment/refund not exercised (Paystack is test-mode project-wide, per §5/§9) — verified by `tsc`, `npm run build`, Biome, and direct RPC read-back against the live schema with real transaction data.
- Paystack reports no separate per-refund processing cost (and keeps its original charge fee on a refund), so `fee_refund_adjustment.processing_cost` is recorded as a known `0`, not left NULL — this is complete, not a deferred wiring-up.

**Needs Investigation**
- The 5 orphan `Ticket_Purchase` transactions with zero tickets (2 already `refunded`, 2 `refund_pending`, 1 `successful`) — early test data; the `refund_pending` ones will never get a webhook confirmation. Harmless but could be cleaned up.

---

## 23. Admin Console (`apps/admin`) + Reporting + Observability — Phase 1

**A third app in the monorepo.** `apps/admin` (`@abonten/admin`) is a **separate, protected Next 16
App Router application** — the internal operations console. It is another authorized client of the
same `@abonten/services` shared backend; it never forks business logic. Deployed as its own Vercel
project on an internal subdomain; `SUPABASE_SERVICE_ROLE_KEY` lives only in that project's env
(never in `apps/web` client bundles, never in `apps/mobile`).

### 23.1 RBAC + admin identity (migration `20260907090000_admin_rbac.sql`)

- `admin_role` / `admin_permission` / `admin_role_permission` — seeded role→permission matrix.
  Roles: `super_admin`, `operations`, `moderator`, `finance_admin`, `support_admin`, `analyst`.
  ~38 permission keys (`reports.*`, `moderation.*`, `users.*`, `finance.*`, `monitoring.*`,
  `audit.view`, `settings.*`, `admins.manage`, …). Least-privilege: a moderator cannot touch
  finance/settings; an analyst is `*.view` only.
- `admin_user` (`user_id → auth.users`, `status active|disabled`) — presence + `active` is what
  grants console access. `admin_user_role` join grants roles; effective permissions = union.
- A trigger keeps `user_info.is_admin` in sync (true iff an active `admin_user` row exists) so the
  legacy `/admin/place-claims` page + `approve_place_claim` RPC keep working.
- Self-only SECURITY DEFINER helpers `is_staff()` / `admin_has_permission(text)` /
  `admin_effective_permissions()` — `auth.uid()`-based, matching the existing `is_admin()` pattern
  (no `p_user_id` parameter, so no cross-user disclosure).
- All RBAC tables: RLS on, **no `authenticated`/`anon` grant** — access is service-role only, from
  `@abonten/services/admin/**` behind `resolveAdminContext()` in app code.
- The mirror in code: `@abonten/core/adminPermissions` (`ROLE_PERMISSIONS`, `can()`,
  `requirePermission()`, `STEP_UP_PERMISSIONS`). Types in `@abonten/types/adminTypes`.

### 23.2 Admin auth (`apps/admin/src/lib/adminGuard.ts`)

`requireAdmin()` runs on every console page + server action:
1. Supabase SSR cookie session (Google OAuth) → a signed-in user, else redirect to sign-in.
2. `ADMIN_EMAIL_ALLOWLIST` env check → not listed: `/no-access` (console existence not revealed).
3. `resolveAdminContext(serviceClient, userId)` — re-derives active-admin status + roles from the
   DB **every request**. A disabled admin or changed roles take effect immediately.
4. **Step-up re-auth**: `users.ban` / `finance.*` / `admins.manage` / `settings.manage` require a
   fresh OAuth round-trip within 10 min (`admin_stepup_at` httpOnly cookie stamped by
   `/auth/callback?stepup=1`). `assertStepUpFresh(ctx)` guards those server actions.
`src/proxy.ts` (Next 16 middleware) is the coarse first gate — refresh cookie, bounce anon.

### 23.3 Audit log (migration `20260907090100_admin_audit_log.sql`)

`admin_audit_log` — append-only (no UPDATE/DELETE grant + a `BEFORE UPDATE/DELETE` trigger that
raises). Every mutating admin service calls `recordAdminAudit()` after the change: actor, roles,
action, target, before/after JSON, reason, request meta (ip/ua). Read-only in the console via the
Audit Logs module (`audit.view`).

### 23.4 Generic reporting (migration `20260907090200_generic_reports.sql`)

- **`report`** — polymorphic. `target_type` ∈ event/place/event_review/place_review/user_review/
  user/organizer/highlight; `category` (10 values); `status` new→under_review→awaiting_info→
  escalated→resolved/dismissed/false_report; `priority` (seeded high for fraud/safety/harassment/
  impersonation); `source` web|mobile; `dedupe_key` = `<type>:<id>`; `assigned_to`, `resolution*`.
  **Partial unique index** on `(reporter_id, dedupe_key) where status in (open set)` — one open
  report per user per target (dedup + anti-spam). RLS: a reporter may INSERT/SELECT **own** rows
  only; never UPDATE/DELETE. Triage is service-role-only.
- **`report_attachment`** + private Storage bucket `report-attachments` (`<uid>/…` key layout,
  owner-write, `is_staff()`-read; admin console mints 5-min signed URLs).
- **`report_event`** (investigation timeline) + **`admin_note`** (internal notes, immutable —
  edits create a new row w/ `supersedes_id`). Both staff-only.
- **`admin_report_group`** view + `admin_dashboard_counts()` RPC (migration `…090900`) — the
  grouped "this event has 17 reports" queue + the dashboard "needs attention" numbers in one call.
- Shared core: `@abonten/services/reports/submitReportCore.ts` — reporter id from session
  (client value ignored), target-exists + reportable check, self-report block, rolling-hour rate
  cap (10), friendly dedupe. Consumed by web action `submitReport.ts` and
  `POST /api/mobile/reports` (typed `api.reports.submit()` in `@abonten/api-client`).
- `place_report` (place-only, 0 rows) was migrated into `report` and **dropped**
  (`20260907091200`). `reportPlace.ts` / `reportPlaceReview.ts` now delegate to `submitReportCore`.

### 23.5 Content moderation (migration `20260907090300` + `20260907090800`)

- Additive nullable `moderation_state` (`visible|restricted|hidden|removed`) + `moderated_at/by` +
  `moderation_reason` on `event`, `place`, `highlight`, `review`, `event_review`, `place_review`.
  Independent of the existing `status` columns — those are untouched.
- **`moderation_action`** table (canonical log, `idempotency_key unique`).
- **`apply_moderation_action(...)` RPC** — atomic: insert action (idempotency guard) + flip
  target `moderation_state` + append `report_event` when linked. SECURITY DEFINER, service_role.
- **Public read paths exclude `hidden`/`removed`**: the 7 PostGIS discovery RPCs
  (`get_filtered_events`, `get_nearby_events` ×2, `get_events_in_window`, `get_similar_events`,
  `get_filtered_places`, `get_nearby_places`) each got
  `AND <alias>.moderation_state IS DISTINCT FROM 'hidden' AND … <> 'removed'` next to their
  `status = 'published'` filter (migration `20260907090800`, a deliberate reviewed change).
  `restricted` stays publicly visible (flagged, e.g. not featurable).
- **Every non-RPC public read is covered too** (migration `20260907091500`): the single public
  `SELECT` policy on `event`, `place`, `event_review`, `place_review`, `review`, `highlight` was
  tightened so its *public* branch (`status = 'published'/'approved'`, `USING (true)` for
  highlights) also requires `moderation_state IS DISTINCT FROM 'hidden'/'removed'`. The
  owner/organizer/reviewer branch is untouched — an organizer still sees their own hidden event on
  management pages, a place owner still sees a hidden review, the review's author still sees their
  own; the Admin Console (service-role) bypasses RLS. This is the single authoritative filter for
  detail pages, review lists, profile tabs, ratings and `/api/mobile` plain-table reads — no
  per-callsite `.or()` to forget. Verified: a real published event flipped to
  `moderation_state='hidden'` (in a rolled-back tx) became invisible to `anon` while the owner
  branch still returned it; `get_advisors` clean.

### 23.6 Observability — hybrid, self-hosted (migration `20260907090400` + `20260907091300`)

No third-party APM. Real pipeline:
- **`app_error_event`** (one row per captured error) + **`app_error_group`** (trigger-maintained
  rollup by `fingerprint`; reopens on new occurrence). Fed by `packages/core/reportError.ts`
  (`buildErrorEventPayload` + `sendErrorReport`) → `POST /api/observability/error` →
  `ingestErrorCore` (service role). Wired into `apps/web/src/app/global-error.tsx` +
  `src/lib/reportClientError.ts`, and on mobile into the root Expo Router `ErrorBoundary`
  (`apps/mobile/src/components/RootErrorBoundary.tsx`, re-exported from `app/_layout.tsx`) plus
  `ErrorUtils.setGlobalHandler` for uncaught JS errors (`src/lib/errorTracking.ts` +
  `src/lib/reportClientError.ts` — sends the Supabase bearer token when signed in).
- **`app_request_metric`** (sampled timings) + `app_request_metric_hourly` view → dashboard.
- **`health_check_result`** — `runHealthChecksCore` does **real probes** (DB, auth, storage,
  Paystack `/bank`, Resend, Hubtel, Cloudinary ping, Expo push) at `GET /api/observability/health`,
  called every 2 min by a `pg_cron` job (`abonten-health-check` → `run_scheduled_health_check()`)
  that reads URL + secret from the **`observability_config`** one-row table an operator fills in
  post-deploy. Until then the job is a no-op and the dashboard honestly shows "no health results
  yet".
- **`incident`** — minimal record; full incident workflow deferred.
- Designed with a Sentry-adapter seam: the Admin UI reads DTOs from the service layer and does not
  care about the source.

### 23.7 Admin service layer (`packages/services/src/admin/**`)

Framework-free, service-role client injected, every fn re-checks its permission via
`assertPermission(ctx, …)`, mutations audited + optimistic-concurrency guarded (`expectedUpdatedAt`
→ 409) + idempotent (RPCs). Modules: `adminContext` (resolveAdminContext / recordAdminAudit /
adminError), `reports/reportsAdminCore` (list, groups, detail, assign, status, requestInfo, note,
resolve), `moderation/applyModerationActionCore`, `users/usersAdminCore` (list, detail,
setUserStatus — writes `user_info.status_id`, no hard delete), `audit/listAuditLogCore`,
`observability/*`, `settings/adminSettingsCore` (staff list, matrix, grant/revoke role,
enable/disable admin), `dashboard/getDashboardCore` (real aggregates; `PLATFORM_TZ = Africa/Accra`
= UTC+0 so UTC day boundaries are local).

### 23.8 Admin Console modules (Phase 1)

`apps/admin/src/app/(console)/`: **Dashboard** (KPIs + dependency health + needs-attention, time
ranges), **Reports & Moderation** (queue list + grouped-by-target view + investigation workspace
with permission-gated actions: assign / under-review / escalate / request-info / note / hide /
restrict / remove / restore / resolve / dismiss / false-report), **Users** (search + status
filter; detail with PII gated by `users.view_pii`; suspend/unsuspend/ban/restore with required
reason + confirm + step-up for ban), **Audit Logs** (read-only), **Monitoring** (health / error
groups with ack-resolve-ignore / request-telemetry / incidents; a banner distinguishes real
telemetry from derived operational metrics), **Admin Settings** (staff list + role grant/revoke +
enable/disable, all step-up-gated; the role matrix is code-defined). Only **Finance** and
**Analytics** render disabled "soon" in the nav.

### 23.8b Phase 2 modules (Claims · Content moderation · Catalog)

Code-only — **no migration**. All new service modules take a service-role client + a resolved
`AdminContext` and re-check the specific permission, same as Phase 1.

- **Claims** (`packages/services/src/admin/claims/claimsAdminCore.ts` + `apps/admin/.../claims`).
  Folds the standalone `/admin/place-claims` web page into the console. `listClaimsCore` /
  `getClaimDetailCore` (signed doc URLs from `place-claim-documents`, PII gated by
  `users.view_pii`) / `reviewClaimCore`. Approve reuses the **existing `approve_place_claim` RPC
  verbatim** — the only path that reassigns `place.owner_id` — passing the resolved admin's id as
  `p_admin_id` (their `user_info.is_admin` is kept true by the `admin_user` sync trigger, so the
  RPC's own check passes on the service-role client). Reject is a `status='pending'`-guarded
  update. Both audited + notify the claimant (`createNotificationCore`). `claims.view` /
  `claims.review`; step-up not required. Live smoke (rolled back): non-admin `p_admin_id` →
  "not an admin"; admin → status `approved`, `owner_id` moved to claimant, `claimed`+`verified`
  set.
- **Content moderation** (`.../content/contentBrowseCore.ts` + `apps/admin/.../content`). One
  read-only browse per moderatable entity (event / place / event_review / place_review /
  user_review / highlight) showing each row's `moderation_state`, owner and report count, filtered
  by state (all-moderated / hidden / removed / restricted / everything) + a title/name/comment
  search. The **actions are unchanged** — the row's inline Hide/Restrict/Remove/Restore call the
  same `applyModeration` server action → `apply_moderation_action` RPC. Per-type permission
  (`events.view` / `places.view` / `reviews.view`).
- **Catalog** (`.../catalog/catalogAdminCore.ts` + `apps/admin/.../{events,places,organizers}`).
  Read-only list + detail for Events (`events.view`), Places (`places.view`), Organizers
  (`organizers.view` — anyone with ≥1 event or owned place). Detail pages show issued-ticket ×
  list-price sales (approximate; the authoritative money view is the Finance module), rating,
  reports-against, moderation state, internal notes, and deep-link to the report workspace / the
  Content tab / the Users record for any action. No mutations in these modules.

### 23.8c Phase 3 modules — Finance ops centre (READ-ONLY)

Code-only — **no migration, no mutations**. Admin-initiated refunds/payouts stay deferred (the
`finance.refund` / `finance.payout` step-up permissions exist for when that's built). New
`packages/services/src/admin/finance/financeAdminCore.ts` (`finance.view` / `transactions.view`,
service-role client, per-fn permission check):

- **Overview** (`getFinanceOverviewCore`, time-range aware, UTC=Africa/Accra): customer-payment
  totals from `platform_fee_entry` (total charged / ticket revenue / service-fee revenue /
  processing cost / net platform revenue), refund counts+amounts from `transaction.status`,
  organizer money from `organizer_ledger_entry` (earnings booked / **held** — `refund_hold` rows
  are stored NEGATIVE, magnitude withheld / outstanding = booked − paid-out − held), pending
  payouts from `payout`, plus the active `platform_fee_config` rate.
- **Transactions** — list (status / Paystack-ref-or-email search / date) + detail = full trace:
  the `transaction`, all its `payment_attempt` rows, `platform_fee_entry`, `organizer_ledger_entry`,
  tickets issued, linked `ticket_checkout`s, and the refundable-now amount via the existing
  `get_transaction_refundable_amount` RPC (fee retained). Payer email/phone gated by
  `users.view_pii`.
- **Refunds** — `transaction` rows with `status in ('refund_pending','refunded')`, showing charged
  vs refundable.
- **Payouts** — `payout` rows + organizer + masked destination (`@abonten/core/maskAccountNumber`).
- **Per-organizer finance** (`/finance/organizers/[id]`, linked from the Organizers module):
  earned / held / paid-out / outstanding, payout accounts (masked), recent ledger + payouts.

Sidebar: only **Analytics** now renders "soon". Verified: turbo typecheck 11/11 · next build
web + admin exit 0 · biome · live aggregate cross-check against prod (fee totals, tx-by-status,
ledger totals incl. the negative `refund_hold`, active rate 5%).

### 23.8d Phase 4 modules — Monitoring deepening · Incidents · Analytics

Code-only — **no migration, no new schema** (the `incident` table + `upsertIncidentCore` +
`incidentUpsertSchema` already existed from Phase 1; Phase 4 wires the UI + adds Analytics).

- **Error-group detail** (`/monitoring/errors/[fingerprint]`) — `getErrorGroupCore` (already
  present) now has a page: rollup KPIs, recent `app_error_event` samples with stack / route /
  platform / app-version / severity / context, and a from-samples breakdown by platform / version /
  route. Status controls (acknowledge / resolve / ignore / reopen) for `monitoring.manage`. The
  error-groups table row title now links here instead of an inline toggle.
- **Incident workflow** — new `upsertIncident` server action (`incidents.manage`, no step-up) +
  `IncidentPanel` client component on the monitoring page: create a new incident, inline-edit any
  incident's title / status / severity / component / summary. `status='resolved'` stamps
  `resolved_at`. CHECK-verified enums (investigating|identified|monitoring|resolved,
  low|medium|high|critical). Live insert+update smoke passed (rolled back).
- **Platform Analytics** (`packages/services/src/admin/analytics/analyticsAdminCore.ts`,
  `analytics.view`, `/analytics`) — `getPlatformAnalyticsCore`, time-range aware: all-time totals
  (users / organizers / events±published / places / tickets / gross customer payments / net
  platform revenue via head-counts + a `platform_fee_entry` sum), in-range deltas + active
  organizers, a daily series (raw `created_at` columns bucketed in JS, capped 50k rows) rendered as
  CSS bar sparklines, and top-10 events by tickets-issued-in-range + top-10 organizers by
  gross-in-range (derived from `platform_fee_entry.event_id` → `event.organizer_id`). No recharts —
  SSR CSS bars.

Sidebar: **no more "soon" items** — every planned nav entry is live. Verified: turbo typecheck
11/11 · next build web + admin exit 0 · biome · live aggregate cross-check against prod (users 10,
events 14/11 pub, tickets 18, fee gross 430 / net 17.7) + incident insert/update smoke.

### 23.8e Phase 5 modules — Global search · bulk report-group resolution

Code-only — no migration, no new schema.

- **Global search** (`packages/services/src/admin/search/globalSearchCore.ts`) — one search box in
  the console top bar → `/search?q=`. Searches users, events, places, transactions and reports by
  name / title / event-code / Paystack-ref / email, or by exact UUID (id or a report's target id).
  Each result group is only populated if the caller holds the matching view permission — you can
  only find what you can open. Read-only, per-group cap 8.
- **Bulk "resolve all N"** (`resolveReportGroupCore` in `reportsAdminCore.ts`) — the grouped
  reports view (`/reports?view=grouped`) gets a per-row control: resolve or dismiss **every open
  report sharing that `dedupe_key`** with one resolution note, optionally applying a single
  moderation action (restrict / hide / remove) to the shared target first via
  `apply_moderation_action`. Permission-gated (`reports.resolve` + the moderation perm for the
  chosen action), idempotent per report (replaying `resolve_report` on a terminal report is a
  no-op), one audit row summarising the count. Live rolled-back smoke: 3 reports on one target →
  all 3 resolved, 0 left open, replay no-op.

Verified: turbo typecheck 11/11 · next build web + admin exit 0 · biome · the group-resolve SQL
path smoke above.

### 23.9 Phase 1 — deferred / open

- ~~Admin-initiated refunds/payouts~~ **DONE** — see §23.14.
- ~~Sentry `also-send` adapter~~ **DONE** — see §23.10.
- ~~Sampled request-timing metrics / mobile request metrics~~ **DONE (mobile)** — see §23.11.
  Web + API request performance is now Sentry's job (`tracesSampleRate`); `app_request_metric`
  is fed by the mobile HTTP client only.
- ~~Runtime-editable role matrix~~ **DONE** — see §23.12.
- ~~Notification operations~~ **DONE** — see §23.13.
  _(Claims + content-browse + Events/Places/Organizers = Phase 2 §23.8b; read-only Finance = Phase 3
  §23.8c; error-group detail + incident workflow + Platform Analytics = Phase 4 §23.8d; global
  search + bulk report-group resolution = Phase 5 §23.8e.)_
- ~~Moderation filter reach~~ **DONE** (migration `20260907091500`): the public `SELECT` policies
  on all six moderatable tables now exclude `hidden`/`removed` on their public branch, so every
  non-RPC read path (detail pages, review lists, profile tabs, ratings, `/api/mobile` plain-table
  reads) is covered by one authoritative filter. See §23.5.
- ~~Mobile root `ErrorBoundary`/`ErrorUtils` → `reportError`~~ **DONE** (see §23.6).
- ~~Mobile report attachment picker~~ **DONE**: `apps/mobile/src/components/ReportSheet.tsx` now
  takes one optional screenshot/PDF, uploaded to the private `report-attachments` bucket at
  `<uid>/<uuid>.<ext>` (same pattern as the place-claim doc flow) before the report is submitted.
- ~~Web event-review / place-review / highlight report affordances~~ **DONE**: `ReviewListItem`
  renders a `ReportButton` (icon variant, hidden for the review's author) for both the event and
  place review sections; `HighlightViewer`'s `⋯` menu offers "Report this photo/video" to
  signed-in non-owners. Event detail, place detail and user profile were already wired.
- Still deferred: runtime-editable role matrix; Sentry adapter; the deep Web/Mobile/API monitoring
  dashboards + incident workflow.
- Ops: create the `apps/admin` Vercel project + `admin.abonten.*` DNS; set
  `OBSERVABILITY_INGEST_SECRET` in `apps/web` + insert the `observability_config` row; seed the
  first `super_admin` (`insert into admin_user … ; insert into admin_user_role …`).
- Not device/live verified: the reporting round-trip on a real device, the money-path admin
  actions (none in Phase 1), push, the health cron against a live deploy.

### 23.10 Sentry (apps/web + apps/admin + apps/mobile) — 2026-09-04

Manual setup (no wizard cruft), **one Sentry project per app**: `abonten-web`, `abonten-admin`
(both `@sentry/nextjs` v10, App Router), `abonten-mobile` (`@sentry/react-native` ~7.11, the
SDK-57-compatible version `npx expo install` picks). Same org (`abonten-hub`), one shared
org-level `SENTRY_AUTH_TOKEN`, three different DSNs.

- **Config files** (`<app>/src/`): `instrumentation.ts` (`register()` + `onRequestError =
  Sentry.captureRequestError` — covers Server Components, Route Handlers, Server Actions),
  `instrumentation-client.ts` (browser init + `onRouterTransitionStart`), `sentry.server.config.ts`,
  `sentry.edge.config.ts` (edge = `proxy.ts` / middleware). web's three inits are near-identical;
  **admin's three call one shared `src/lib/sentry.ts` factory** (`adminSentryOptions(runtime)`) so
  they can't drift — see the admin-hardening bullet below.
- **Gating**: every `Sentry.init` sets `enabled: Boolean(dsn) && NODE_ENV === "production"`, so
  local `next dev` never reports. Vercel **preview and production both send**, separated by the
  `environment` tag (`VERCEL_ENV` → `NEXT_PUBLIC_VERCEL_ENV` on the client, then `NODE_ENV`).
  `sendDefaultPii: false`. `tracesSampleRate: 0.1`. No session-replay / feedback widget.
- **Build plugin** — `import { withSentryConfig } from "@sentry/nextjs/config"` (the
  `@sentry/nextjs` root export is deprecated in v10, gone in v11). web wraps
  `withNextIntl(nextConfig)`, admin wraps `nextConfig` directly. Options: `org: "abonten-hub"`,
  `project` per app, `authToken: process.env.SENTRY_AUTH_TOKEN` (server/CI only — never
  `NEXT_PUBLIC_`, never committed; local builds skip upload when unset — one **org-level** token,
  reused across both projects), `widenClientFileUpload: true`,
  `sourcemaps.deleteSourcemapsAfterUpload: true` (maps uploaded to Sentry, not served publicly),
  `telemetry: false`, `silent: !CI`. Release name is auto-derived from the git SHA /
  `VERCEL_GIT_COMMIT_SHA`. (`disableLogger` was dropped — deprecated + a no-op under Turbopack.)
- **`global-error.tsx`**: web's also calls `Sentry.captureException` alongside its existing
  `reportClientError`; admin had no error boundary at all, so a minimal new one was added
  (`Sentry.captureException` + a plain recovery screen).
- **admin hardening** (`apps/admin/src/lib/sentry.ts`, 2026-09-04) — admin's Sentry project is its
  *only* monitoring sink, so the factory adds:
  - **noise filter** — `ignoreErrors` + a `beforeSend` that drops the guard's expected throws
    (`AdminUnauthenticatedError` / `AdminForbiddenError` — fired on every non-allowlisted or
    disabled-admin hit) plus `ResizeObserver` / `AbortError` browser noise. `redirect()` /
    `notFound()` control-flow is already dropped by the SDK.
  - **redaction** — `beforeSend` / `beforeSendTransaction` / `beforeBreadcrumb` strip
    `request.cookies`, sensitive headers (`cookie`, `authorization`, `x-*-token`, `x-supabase-*`,
    forwarded-IP), secret-looking keys in `extra` / `contexts` / `request.data`, and
    `?token=/code=/access_token=`-style query params from URLs. On top of `sendDefaultPii: false`.
  - **request identity** — `requireAdmin()` calls `tagAdminRequest(ctx)` after a caller is verified,
    setting `Sentry.setUser({ id })` + an `admin.roles` tag (role keys only, no email/PII;
    request-isolated by `@sentry/nextjs`).
  - **swallowed Server Action failures** — actions catch their throw and return an envelope, so
    `onRequestError` never sees them; `server/actions.ts` now routes non-expected errors through a
    local `adminError()` → `captureAdminActionError()` (`source: admin_server_action` tag).
  - **controlled test** — `GET /monitoring/sentry-check` (gated `monitoring.view`) sends one
    deliberate event and returns its id + whether the SDK is enabled; a "Send test event" button on
    the Monitoring page (`monitoring.manage`) triggers it.
- **also-send adapter (web only)**: `POST /api/observability/error` mirrors every ingested error
  into Sentry via `forwardToSentry()` — **only `platform === "web" | "api"`**, a no-op when the
  SDK is disabled. The self-hosted `app_error_event` / `app_error_group` pipeline is unchanged and
  still the primary store; Sentry is the secondary sink. (admin has no self-hosted error pipeline
  of its own — Sentry is its only client-side error monitoring.)
- **Env** (documented in each app's `.env.example`): `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN`
  (same value within an app; server fallback — **web and admin use different DSNs**),
  `SENTRY_AUTH_TOKEN` (CI/Vercel only, same value both apps), optional
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT`. `turbo.json`'s `build` task already declares `SENTRY_DSN` +
  `SENTRY_AUTH_TOKEN`; `NEXT_PUBLIC_*` is auto via Turborepo's Next.js framework inference.
  `.gitignore` excludes `.env.sentry-build-plugin`.
- **Mobile** (`@sentry/react-native`, project `abonten-mobile`): runs **alongside** the existing
  self-hosted `reportClientError` pipeline — that is untouched; Sentry is a second parallel sink.
  - `src/lib/sentry.ts` (new): `initSentry()` + the `reactNavigationIntegration` instance.
    `enabled: !__DEV__ && Boolean(dsn)` (DSN = `EXPO_PUBLIC_SENTRY_DSN`), `environment` from
    `EXPO_PUBLIC_SENTRY_ENVIRONMENT` else `"production"`, `tracesSampleRate: 0.1`,
    `sendDefaultPii: false`. **`release`/`dist` left unset** — auto-detected from the native
    build; setting them by hand breaks symbolication.
  - `app/_layout.tsx`: `initSentry()` at module scope (before the global JS error handler chains
    in, so uncaught errors reach both sinks); `useNavigationContainerRef()` →
    `navigationIntegration.registerNavigationContainer` for screen breadcrumbs; default export
    wrapped in `Sentry.wrap()`.
  - `src/components/RootErrorBoundary.tsx`: the route-level boundary catches render errors before
    `Sentry.wrap`'s would, so it now also calls `Sentry.captureException(error, {level:"fatal"})`
    next to `reportClientError`. `errorTracking.ts` is unchanged — Sentry's own global handler is
    already in the chain as `previous`.
  - `metro.config.js`: `getDefaultConfig` → `getSentryExpoConfig` (keeps `withNativeWind` +
    the monorepo `watchFolders` / `nodeModulesPaths`).
  - `app.json` `plugins`: `["@sentry/react-native/expo", { url: "https://sentry.io/",
    organization: "abonten-hub", project: "abonten-mobile" }]` — during `expo prebuild` (which
    EAS Build runs) this injects the Android Gradle + iOS Xcode source-map/debug-symbol upload
    steps. They read `SENTRY_AUTH_TOKEN` from the build env; nothing native is committed (CNG —
    `apps/mobile/android/` is gitignored).
- **Env**: web/admin — `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` (server fallback), `SENTRY_AUTH_TOKEN`
  (CI/Vercel only), optional `NEXT_PUBLIC_SENTRY_ENVIRONMENT`; documented in each `.env.example`,
  `turbo.json`'s `build` task declares the non-`NEXT_PUBLIC_` names. mobile —
  `EXPO_PUBLIC_SENTRY_DSN` (public, per EAS env) + optional `EXPO_PUBLIC_SENTRY_ENVIRONMENT`;
  `SENTRY_AUTH_TOKEN` as an **EAS secret** (sensitive, build-only, never bundled). `.gitignore`
  excludes `.env.sentry-build-plugin`.
- Verified: `turbo typecheck` (all 11) green; `next build` for web + admin green with the wrapper
  + admin hardening active, no deprecation / Sentry warnings; `expo config` + `expo export
  --platform android` green with the Sentry plugin + `getSentryExpoConfig`; biome clean. Not
  verified live —
  each app needs a deploy/build with its DSN set and a triggered test error; mobile also needs a
  dev-client / EAS build (native crash reporting is a no-op in Expo Go).

### 23.11 Mobile request-timing metrics — 2026-09-04

The `app_request_metric` table + `app_request_metric_hourly` rollup + the Admin › Monitoring ›
"Request telemetry" panel have existed since Phase 1 but nothing wrote to them. Now the **mobile
HTTP client feeds them**; web/API request performance is covered by Sentry Performance instead
(no 90-route retrofit, no duplicate signal).

- `@abonten/api-client` (`createApiClient`) gained a `metricSampleRate` option. Its internal
  `request()` times every call and, at that sample rate, fires a **fire-and-forget** beacon to
  `POST /api/mobile/observability/metric` with `{ route, method, statusCode, durationMs, ok }`.
  The route key has ids collapsed (`/events/:id/attendees`, `/x/:n`). The beacon never throws,
  is never awaited, and skips itself.
- New route `apps/web/src/app/api/mobile/observability/metric/route.ts` — Bearer-authed via
  `getMobileAuth` (the shared `OBSERVABILITY_INGEST_SECRET` can't ship in a mobile bundle), the
  identity is not stored, always answers `202`. Calls `ingestMetricCore(..., { platform:
  "mobile", ... })`. Added to the api-parity map (matched by the `METRIC_PATH` literal in
  `client.ts`).
- `apps/mobile/src/lib/api.ts` sets `metricSampleRate: __DEV__ ? 0 : 0.1` — off in dev so local
  traffic doesn't skew the panel.
- Admin Monitoring page copy updated: the panel is now titled "Request telemetry — mobile" and
  the banner points at the `abonten-web` Sentry project for web/API timing.
- Verified: `turbo typecheck` (web + mobile + api-client + admin) green; `next build` apps/web +
  apps/admin green; api-parity guard green; a rolled-back live `INSERT` into `app_request_metric`
  confirms `ingestMetricCore`'s column mapping and the hourly rollup. Not device-verified.

### 23.12 Runtime-editable role → permission matrix — 2026-09-04

`admin_role_permission` is now the **live source of truth** for what each role grants.
`@abonten/core/adminPermissions` keeps `ROLE_PERMISSIONS` only as the **seed** + the typed
`ADMIN_ROLE_KEYS` / `ADMIN_PERMISSION_KEYS` lists + a **safety fallback**.

- `resolveAdminContext()` (`packages/services/src/admin/adminContext.ts`) now reads
  `admin_role_permission` for the caller's roles and unions the grants (filtered to
  `ADMIN_PERMISSION_KEYS`). Fallbacks that make a bad edit non-fatal: on a read error → the
  compiled `effectivePermissions(roles)`; a role with **zero** rows → that role's compiled
  defaults; `super_admin` → **always** every known permission.
- Migration `20260907091600_admin_role_matrix_guard.sql` (live version `20260904031948`) adds
  `guard_super_admin_role_permissions()` — a `BEFORE INSERT/UPDATE/DELETE` trigger on
  `admin_role_permission` that raises `check_violation` for any `role_key = 'super_admin'` row.
  super_admin's grant set is immutable at the DB level; nothing can lock every admin out.
- `adminSettingsCore`: `getRoleMatrixCore(supabase, ctx)` is now async and returns the DB
  `{ roles, permissions, grants, lockedRoles }`; new `setRolePermissionCore(supabase, ctx,
  { roleKey, permissionKey, enabled })` — `settings.manage` + validates keys against the code
  lists + rejects `super_admin` + upsert/delete one cell + `admin_audit_log` (`action:
  "admin.role_matrix.set"`).
- Web action `setRolePermission` (`assertStepUpFresh` → core → `revalidatePath("/settings")`);
  schema `setRolePermissionSchema` in `@abonten/validation/adminSchemas`.
- Admin › Settings: the read-only matrix cards are replaced by `RoleMatrixEditor` — a
  permissions × roles checkbox grid; the `super_admin` column is 🔒 all-on/read-only; editing
  is gated on `settings.manage` + a fresh step-up. Each toggle is optimistic + `router.refresh()`.
- Verified: `turbo typecheck` 11/11 green; `next build` apps/web + apps/admin green; biome
  clean; `get_advisors` — no new lints (the new trigger fn sets `search_path`, isn't
  SECURITY DEFINER). Rolled-back live SQL smoke: a non-super cell toggles both ways +
  idempotently; a `super_admin` INSERT/DELETE (incl. `ON CONFLICT DO NOTHING`) is blocked by
  the trigger and `super_admin` still holds all 39 permissions.

### 23.13 Notification operations — 2026-09-04

Admin › Notifications: browse every user's in-app `notification` rows, re-send one, or broadcast
one to a segment.

- Migration `20260907091700_admin_notification_ops_permissions.sql` adds two permission keys:
  `notifications.send` (seeded to `operations`) and `notifications.broadcast` (super_admin-only —
  grantable later via the matrix editor). super_admin gets both from the `resolveAdminContext`
  hard-guarantee (its rows are immutable). Both are also added to `ADMIN_PERMISSION_KEYS` +
  `AdminPermissionKey`; `notifications.broadcast` joins `OPERATIONS_EXCLUDED` +
  `STEP_UP_PERMISSIONS`.
- `packages/services/src/admin/notifications/notificationsAdminCore.ts`:
  `listNotificationsAdminCore` (`notifications.view`, keyset paginated, filter type / recipient /
  unread / title-body search), `getNotificationAdminCore` (row + recipient name; email gated by
  `users.view_pii`), `resendNotificationCore` (`notifications.send` → re-runs
  `createNotificationCore` = fresh row + best-effort push; audited `notification.resend`),
  `broadcastNotificationCore` (`notifications.broadcast`; segments `all_users` /
  `event_attendees` (tickets `status in ('active','used')`) / `single_user`; chunked inserts of
  500; **in-app only, no push fan-out**; `BROADCAST_MAX_RECIPIENTS = 50_000`; audited
  `notification.broadcast` with the recipient count).
- Web actions `resendNotification` / `broadcastNotification` (the latter `assertStepUpFresh`);
  schemas `resendNotificationSchema` / `broadcastNotificationSchema` (discriminated union on
  segment `kind`).
- Admin app: sidebar entry (`notifications.view`), `/notifications` list + filter form +
  `BroadcastPanel` (client, step-up-gated), `/notifications/[id]` detail + `ResendButton`.
- Verified: `turbo typecheck` 11/11; `next build` apps/web + apps/admin green (`/notifications`
  + `/notifications/[id]` present); biome clean; rolled-back live SQL smoke — the resend row
  copy, an all-users broadcast insert, and the `event_attendees` resolve query all run clean.
  Not exercised end-to-end through the console UI.

### 23.14 Admin-initiated refunds & payouts — 2026-09-04

The Finance ops centre gains its first **money-path writes**. All three are `finance.refund` /
`finance.payout` (both in `STEP_UP_PERMISSIONS`), re-checked server-side, `assertStepUpFresh` in
the transport, and `admin_audit_log`ged with a required free-text reason.

- **Refund** — `refundTransactionAdminCore` is a thin wrapper over the existing `issueRefundCore`
  (the same second trust context `cancelEvent` uses: service-role client, no `expectedUserId`).
  No new money logic — `issueRefundCore` is idempotent, does the partial Paystack refund of the
  ticket revenue only (fee retained), and records the `refund_hold` + fee-adjustment via the
  tested `record_*` RPCs. UI: a `RefundPanel` on `/finance/transactions/[id]` (confirm step,
  hidden once `refunded` / `refund_pending`).
- **Payout settlement** — migration `20260907091800` adds `admin_settle_payout(p_payout_id,
  p_status, p_failure_reason)` (SECURITY DEFINER, `search_path=''`, `service_role`-only):
  `processing → completed` keeps the `payout_hold` (money is gone); `→ failed` / `→ cancelled`
  insert one `payout_release` ledger entry (`+abs(amount)`) so the reserved balance returns.
  Idempotent — only a `processing` payout moves, release written at most once. UI: `Settle…`
  row action on `/finance/payouts` (processing rows only).
- **Payout origination** — same migration adds `admin_create_payout(p_organizer_id,
  p_payout_account_id, p_amount, p_currency)` — a verbatim copy of `request_organizer_payout`'s
  body with the organizer id as a parameter instead of `auth.uid()` (re-verifies account
  ownership + recomputes available balance from the ledger with the same `is_event_settled` /
  `payout_hold` / `payout_release` filter). Support uses it when an organizer can't withdraw
  themselves. UI: `CreatePayoutPanel` on `/finance/organizers/[id]`. There is still no Paystack
  transfer integration anywhere — disbursement stays a manual bank transfer, then mark the
  payout completed.
- Schemas `adminRefundSchema` / `settlePayoutSchema` / `createPayoutSchema`; actions
  `refundTransaction` / `settlePayout` / `createPayout` in `apps/admin/src/server/actions.ts`.
- Verified: `turbo typecheck` 11/11; `next build` apps/web + apps/admin green; biome clean;
  `get_advisors` — both new RPCs are `service_role`-only, `search_path`-pinned, not flagged.
  Rolled-back live SQL smokes: `admin_settle_payout` completed (status flips, hold retained) /
  failed (one `payout_release` of `+amount`) / re-settle raises; `admin_create_payout` rejects a
  foreign account, a non-positive amount, and an over-balance draw. **The refund path itself was
  NOT re-exercised live** (it calls Paystack) — the wrapper adds only the permission check +
  audit over the already-verified `issueRefundCore`.

---

*This document reflects only what was directly verified by reading the repository's code, configuration, and git history. Sections marked "Needs Investigation" should be confirmed with the project owner or by deeper runtime/schema inspection before being relied upon.*
