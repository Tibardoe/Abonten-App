# Abonten Hub — Project Documentation

This document describes the current, verified state of the codebase for future development and AI-assisted coding. Everything under "Confirmed" was directly observed in the repository (code, config, or git history) at the time of writing. Items that could not be verified are explicitly marked "Needs Investigation" rather than assumed.

> **Revision note (2026-08-10):** Section 7 (Database / Supabase Structure) was rewritten from the actual pulled schema at [supabase/migrations/20260810084821_remote_schema.sql](supabase/migrations/20260810084821_remote_schema.sql), replacing the earlier version's table/column/relationship guesses that were inferred only from application query strings. Several confirmed discrepancies between the app code and the real schema were found in the process — see §7.6 — and related notes in §9, §16, and §17 were updated to match.

---

## 1. Project Purpose & Overview

**Confirmed**
- App name (from metadata): "Abonten Hub | Connecting people to experiences" ([src/app/layout.tsx](src/app/layout.tsx)).
- It is an event discovery and ticketing platform. Users can browse/search events, view event detail pages, buy tickets (with QR codes and PDF/email receipts), and organizers can create events, manage attendance, and set up payout accounts (Mobile Money or Bank).
- Location data strongly targets Ghana: default country code `"GH"` in [src/proxy.ts](src/proxy.ts), Ghanaian place names in [cache/*.json](cache), Hubtel (Ghanaian SMS/payment provider) integration, GHS-oriented mobile money fields.

**Needs Investigation**
- No product requirements document exists — [PRD.md](PRD.md) only contains "Coming Soon...".
- Business model (free platform, commission on tickets, subscription plans) — a `plans`/`subscription` feature exists in code (see §5, §6) but the actual pricing/business terms are not documented in-repo.

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
- Single Next.js App Router monolith. No separate backend service in this repo.
- Data mutations/reads for app logic go through **Server Actions** (`"use server"` files in [src/actions/](src/actions)) called directly from client/server components — not through a REST/GraphQL API layer.
- Only 3 route handlers exist under `src/app/api/`, used for cases that need HTTP semantics (webhooks/uploads/proxying), not general CRUD:
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
      around-you/, auth/, events/, manage/, plans/, search/, user-account/, wallet/
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
- **Ticketing**: `validateCheckout` → `generateTicket` (QR-coded tickets), `cancelUserTicket`, `issueRefund`, `getTickets`, `getUserAttendingEvents`, ticket PDF (`TicketModal.tsx`, via `html2canvas`+`jspdf`) and email (`ticketPurchaseNotification`, `TicketPurchaseEmailTemplate.tsx`).
- **Promo codes**: `getPromoCode`, `InsertPromoCodeUsage`.
- **User profile & social**: `/user-account`, `/user-account/[username]`, `/(userPage)/user/[username]/{favorites,posts,reviews}`; actions `getUserDetails`, `getUserProfileDetails`, `updateUserDetails`, `getUserPosts`, `getUserFavoritePosts`, `getUserReviews`, `postReview`, `getUserRating`, `getUserHighlights`, `uploadHighlight`.
- **Favorites**: `addEventToFavorite`, `removeEventFromFavorite`, `checkIfEventIsFavorited` (React Query optimistic update per recent commit history).
- **Wallet / payout accounts**: `/wallet`, `/wallet/[checkoutId]`; components `AddMomoWallet`, `AddBankCard`, `AddPaymentMethodPopup`; action `postEvent` inserts into `receiving_account` (Mobile Money or Bank).
- **Subscriptions/plans**: `/plans`; actions `getSubscriptionCheckout`, `insertSubscriptionCheckout`, `getUserSubscription`; data in `src/data/plans.ts`.
- **Transactions**: `/transactions`, `/transactions/[transactionId]`, `/transactions/date/[date]`; actions `getUserTransactions`, `filteredByDateUserTransactions`, `deleteCheckout`, `deleteTicketSummaryCheckout`.
- **Settings**: `/settings`, `/settings/edit-profile`, `/settings/language`, `/settings/membership`, `/settings/overview`, `/settings/security`, `/settings/switch-appearance`.
- **Auth**: `/auth/signin`.
- **Avatar/media management**: `saveAvatarToCloudinary`, `saveAvatarToSupabase`, `ImageCropper.tsx`, `UploadAvatarModal.tsx`.

---

## 6. Routes / Pages (full list, verified via filesystem)

```
(landing)/                                         /
(pages)/(settings)/settings/                       /settings
(pages)/(settings)/settings/edit-profile           /settings/edit-profile
(pages)/(settings)/settings/language               /settings/language
(pages)/(settings)/settings/membership             /settings/membership
(pages)/(settings)/settings/overview               /settings/overview
(pages)/(settings)/settings/security               /settings/security
(pages)/(settings)/settings/switch-appearance      /settings/switch-appearance
(pages)/(transactions)/transactions                /transactions
(pages)/(transactions)/transactions/[transactionId] /transactions/:transactionId
(pages)/(transactions)/transactions/date/[date]    /transactions/date/:date
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
(pages)/manage/my-events                           /manage/my-events
(pages)/plans                                      /plans
(pages)/search                                     /search
(pages)/search/[searchTitle]                       /search/:searchTitle
(pages)/user-account                               /user-account
(pages)/user-account/[username]                    /user-account/:username
(pages)/wallet                                     /wallet
(pages)/wallet/[checkoutId]                        /wallet/:checkoutId
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
- Default privileges: `postgres` grants `DELETE, INSERT, SELECT, UPDATE` on all tables (and matching sequence/routine grants) to **all three** of `anon`, `authenticated`, and `service_role` at the schema level, and every individual `CREATE TABLE` is followed by an explicit `GRANT ALL ... TO anon/authenticated/service_role`. See the RLS note below — this is significant.
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
| `payment_method` | HASH(`user_id`) | **No partitions defined** — see §7.5. Not referenced anywhere in app code (`grep` found no `.from("payment_method")`). |
| `promo_code` | — | |
| `promo_code_usage` | — | Composite PK (`promo_code_id, user_id, event_id`). |
| `receiving_account` | — | Organizer payout details (Mobile Money or Bank). |
| `review` | RANGE(`created_at`), 5 monthly partitions covering **June 2025 – October 2025 only** | See §7.5 — no partition exists for the current system date. |
| `story` | RANGE(`created_at`) | **No partitions defined** — see §7.5. Not referenced anywhere in app code. |
| `subscription` | — | One row per user (`UNIQUE(user_id)`). |
| `subscription_checkout` | — | |
| `subscription_plan` | — | `id` is `smallint`, `name` is the natural key other tables reference. |
| `ticket` | — | |
| `ticket_checkout` | — | |
| `ticket_type` | — | |
| `transaction` | — | Payment record; see §7.5 — requires a Flutterwave transaction ID. |
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
- **`transaction`**: `id`, `user_id` (FK CASCADE), `full_name`, `email`, `phone_number`, `reason` (CHECK `'Ticket_Purchase'` or `'Plan_Purchase'`), `amount` (numeric(15,2)), `currency` (varchar(3), **default `'USD'`**), `status` (CHECK one of `successful/pending/failed/refunded`), `payment_method`, `payment_gateway_response` (jsonb), **`flutterwave_txn_id` (text, `NOT NULL`, `UNIQUE`)**, `transaction_date`, `created_at`, `updated_at`, `metadata` (jsonb). See discrepancy #2 below — this column name reveals the intended payment provider.
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
2. **No payment gateway code exists in this repo, and the schema confirms the intended provider is Flutterwave.** `transaction.flutterwave_txn_id` is `NOT NULL` and `UNIQUE`, meaning a `transaction` row cannot be created without a Flutterwave transaction ID. A repo-wide search found **zero** references to "Flutterwave" (or any payment SDK) in `src/`, and no Server Action ever performs `supabase.from("transaction").insert(...)` — only reads (`getUserTransactions`, `filteredByDateUserTransactions`) and one read via `cancelUserTicket`. This means: **ticket purchases can currently be recorded (via `generateTicket`) without ever creating a `transaction` row**, since `ticket.transaction_id` is nullable and `generateTicket`'s `transactionId` parameter is optional. Real payment collection and `transaction` row creation must happen outside this repo (e.g. a Flutterwave webhook handled by a Supabase Edge Function or another service) — or it simply hasn't been built yet. This directly confirms and sharpens what was previously only suspected.
3. **`useUserProfile.ts` reads columns that don't exist on `user_info`.** [src/hooks/useUserProfile.ts](src/hooks/useUserProfile.ts) does `.from("user_info").select("*")` and then reads `data.displayName`, `data.email`, `data.phone`, `data.createdAt`, `data.lastSignInAt` — **none of these columns exist on `user_info`** in the real schema (the table only has `id, status_id, username, full_name, avatar_public_id, avatar_version, bio, updated_at, website`). Those fields will always resolve to `undefined` in the returned `userProfileType`. This looks like leftover code from an earlier schema version, or confusion between the `user_info` table and Supabase Auth's `user` object (which does have `email`/`phone`/`created_at`/`last_sign_in_at`, but is a different object entirely). This is a confirmed bug.
4. **`ticket_code` has no uniqueness guarantee at the database level.** [generateTicket.ts](src/actions/generateTicket.ts) generates a ticket code in application code and relies on it being unique, but the `ticket.ticket_code` column has no `UNIQUE` constraint in the schema — collisions are possible in theory and would not be caught by the database.
5. **Ticket type price/quantity/type are unconstrained in the database.** The app treats `ticket_type.type` as one of `"FREE"`, `"SINGLE TICKET"`, or an organizer-defined category, and assumes `price`/`quantity` are non-negative — but the schema has no `CHECK` constraints enforcing any of this on `ticket_type`. All such validation is application-only.
6. **`wallet` and `payment_method` tables are not queried anywhere in the app code found**, despite a `/wallet` route and wallet UI components (`AddMomoWallet`, `AddBankCard`, `AddPaymentMethodPopup`) existing in `src/wallet/`. Organizer payout info instead goes through the separate `receiving_account` table (via `postEvent.ts`), which *is* wired up correctly. It is unconfirmed whether the wallet UI is fully built but simply not yet connected to a Server Action, or is still a work-in-progress mock. This is compounded by `wallet`/`payment_method` having no partitions (§7.5), so even if wired up today, inserts would likely fail.
7. **`story`, `event_media`, and `media_audit` tables exist in the schema but are not referenced anywhere in the current application code** (no `.from("story")`, `.from("event_media")`, or `.from("media_audit")` found). The app's actual "stories/highlights" feature uses the separate `highlight` table instead, which is fully wired up and has no partitioning (so no partition-gap risk). `story` appears to be a parallel/legacy feature that was never finished, and would additionally fail on insert today due to having zero partitions.
8. **Inconsistent UUID default generator across tables.** Some tables default `id` to `extensions.uuid_generate_v4()` (`attendance`, `event`, `event_occurrence`, `highlight`, `review`, `story`, `ticket`, `ticket_type`, `transaction`, `user_image_history`, `wallet`), while others use `gen_random_uuid()` (`promo_code`, `receiving_account`, `ticket_checkout`, `subscription_checkout`). Functionally equivalent, but inconsistent — not something application code needs to worry about, just a schema-authoring inconsistency.
9. **`review.reviewed_id` targets a user, not an event.** It has a foreign key to `user_info.id`, meaning the schema models reviews as being about a *person* (e.g. an organizer), not an event directly — worth keeping in mind since "review an event" UI copy could be misleading about what's actually being rated at the database level.

**Needs Investigation**
- Whether RLS policies exist on the live database but were not captured by this particular `db pull` (the migration file shows none — see §7.5).
- Whether the missing partitions (`event_media`, `payment_method`, `wallet`, `story`, `event_share`, `media_audit`) and the stale `review` partition range are real gaps in production or artifacts of an incomplete pull — should be checked directly against the live Supabase project before assuming inserts are currently broken.
- Where/how `transaction` rows and Flutterwave webhook handling are actually implemented, if at all (not present in this repo).
- The purpose of the `supabase_privileged_role` role and the `transaction_status` lookup table, neither of which appears to be used by any FK or by app code.
- Whether Supabase Storage buckets are used at all, given Cloudinary appears to hold most media (still unconfirmed — this schema file doesn't show storage bucket config).

---

## 8. Authentication / Authorization Flow

**Confirmed**
1. **Sign-in**: Google OAuth via `supabase.auth.signInWithOAuth({ provider: "google" })` in [src/services/authService.ts](src/services/authService.ts), triggered from [GoogleAuthButton.tsx](src/components/atoms/GoogleAuthButton.tsx). This is the functional sign-in path.
2. **Phone/OTP sign-in exists but is incomplete**: `signInWithPhone`/`verifyOtp` in `authService.ts` call Hubtel's REST OTP API (`api-otp.hubtel.com`) directly, but the corresponding `supabase.auth.signInWithOtp` / `supabase.auth.verifyOtp` calls that would create a real Supabase session are commented out in the same file.
3. **Session refresh & route gating** happens in [src/proxy.ts](src/proxy.ts), which calls `updateSession()` ([src/config/supabase/middleware.ts](src/config/supabase/middleware.ts)):
   - Refreshes/re-syncs the Supabase auth cookies on every matched request.
   - Public path allowlist (prefix match): `/`, `/events`, `/user`, `/reviews`, `/search`, `/auth` (checked twice, redundantly, for `/auth`).
   - Any other path redirects unauthenticated users to `/auth/signin?next=<original-path>`.
   - Because it's a prefix match, `/user-account` also passes as "public" (it starts with `/user`), which may or may not be intended.
4. **Server Action-level checks**: nearly every action in `src/actions/` independently calls `supabase.auth.getUser()` and returns `{ status: 401 }` if there's no user, rather than relying solely on the proxy.
5. **Client-side auth state**: [src/context/authContext.tsx](src/context/authContext.tsx) (`AuthProvider`/`useAuth`) mirrors the Supabase session via `onAuthStateChange` for UI purposes (e.g. showing/hiding auth-gated UI), not for authorization decisions.
6. **Sign-out**: `signOut()` in `authService.ts` calls `supabase.auth.signOut()` then hard-redirects to `/`.

**Needs Investigation**
- No role/permission model (e.g. "organizer" vs. "attendee") was found beyond implicit ownership checks (`organizer_id`, `user_id` equality checks in queries) — there is no visible RBAC table or middleware role check.
- Row Level Security (RLS) policies on Supabase tables are not visible from this repo and could not be verified.

---

## 9. API Routes / Server Actions

**Route handlers** (3 total, all under `src/app/api/`):
- `POST /api/geocode` — [src/app/api/geocode/route.ts](src/app/api/geocode/route.ts), uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `/api/upload-profile-picture` — [src/app/api/upload-profile-picture/route.ts](src/app/api/upload-profile-picture/route.ts), uploads to Cloudinary (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`) and updates `user_info`.
- `/api/user-profile` — [src/app/api/user-profile/route.tsx](src/app/api/user-profile/route.tsx), reads from `user_profile_detail`.

**Server Actions** (all `"use server"`, in [src/actions/](src/actions), ~50 files) — this is the primary backend interface. Full list observed: `addEventToFavorite`, `cancelEvent`, `cancelUserTicket`, `checkIfEventIsFavorited`, `deleteCheckout`, `deleteEvent`, `deleteTicketSummaryCheckout`, `deleteUser`, `fetchCountryMetaData`, `filteredByDateUserTransactions`, `generateTicket`, `getAttendace`, `getAttendanceList`, `getEventTitle`, `getFilteredEvents`, `getNearByEvents`, `getOrganizerEvents`, `getPromoCode`, `getQueriedEvents`, `getSimilarEvents`, `getSubscriptionCheckout`, `getTicketCheckout`, `getTickets`, `getUserAttendingEvents`, `getUserCheckout`, `getUserDetails`, `getUserEventRole`, `getUserFavoritePosts`, `getUserHighlights`, `getUserPhoneNumber`, `getUserPosts`, `getUserProfileDetails`, `getUserRating`, `getUserReviews`, `getUserSubscription`, `getUserTransactions`, `InsertPromoCodeUsage`, `insertSubscriptionCheckout`, `insertUserAttendance`, `issueRefund`, `postEvent`, `postReview`, `removeEventFromFavorite`, `saveAvatarToCloudinary`, `saveAvatarToSupabase`, `saveEventFlyerToCloudinary`, `saveEventQrCodeToCloudinary`, `sendOtpForPhoneUpdate`, `ticketPurchaseNotification`, `updateUserDetails`, `updateUserPhoneNumber`, `uploadHighlight`, `validateCheckout`, `verifyOtpAndUpdatePhone`.
- Convention: every action returns a plain object `{ status: number, message?: string, data?: ... }` rather than throwing — callers must check `status` (no shared error-handling wrapper/type was found).

**Confirmed (via §7.6, using the real DB schema)**
- No payment-gateway charge action exists in this repo. `validateCheckout` computes pricing and reserves a `ticket_checkout`, and `generateTicket` issues tickets, but nothing in between calls an external payment API. The database schema confirms the intended provider is **Flutterwave** (`transaction.flutterwave_txn_id` is `NOT NULL UNIQUE`), but no code in `src/` references Flutterwave, and no action ever inserts into `transaction`. Payment verification, if it happens at all today, happens entirely outside this repository.

---

## 10. External Services & Integrations

**Confirmed** (with the env vars each uses):
- **Supabase** — Postgres DB + Auth. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Cloudinary** — media storage for avatars, event flyers, ticket QR codes, highlights. `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (also a legacy commented-out `CLOUDINARY_CLOUD_NAME` in `.env.local`).
- **Google Maps Platform** — geocoding, autocomplete, map display (`@react-google-maps/api`, `/api/geocode`). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-exposed by design).
- **Hubtel** (`api-otp.hubtel.com`) — OTP send/verify for phone sign-in, called directly from a client component. `NEXT_PUBLIC_HUBTEL_API_USERNAME`, `NEXT_PUBLIC_HUBTEL_API_PASSWORD` (see §16 — these are exposed to the browser bundle).
- **Twilio Verify** — OTP for phone-number *update* flow (separate from sign-in). `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- **Resend** — transactional email (ticket purchase receipts). `RESEND_API_KEY`.
- **Google OAuth** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` present in `.env.local` (actual OAuth is handled by Supabase Auth's Google provider, not a custom NextAuth flow — `NEXTAUTH_SECRET`/`NEXTAUTH_URL` exist in `.env.local` but no NextAuth package is in `package.json`, so these look unused/vestigial).
- **REST Countries API** — [src/services/restCountriesApi.ts](src/services/restCountriesApi.ts), used by `useCountries`/`fetchCountryMetaData` for country/dial-code data.

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

**Checkout/ticketing**: `CheckoutModal`, `OrderSummary`, `TicketType`, `TicketInputs`, `PromoCodeInputs`/`PromoCodeBtn`, `CheckoutBtn`, `TicketModal`, `RecieptModal`/`ViewReciptButton`, `CancelUserTicketBtn`, `RefundButton`.

**Maps/location**: `MapPicker`, `MapModal`, `ChangeLocationModal`, `AutoComplete`/`PostAutoComplete` (Google Places autocomplete), `GetDirectionBtn`.

**Auth**: `AuthModal`, `GoogleAuthButton`, `PhoneInput`.

**Profile/social**: `UserAvatar`, `AvatarUploadButton`/`UploadAvatarModal`/`ImageCropper`, `UserHighlights`/`HighlightModal`, `ReviewModal`/`AddReviewButton`/`Rating`/`StarRatingInput`, `AddToFavoriteButton`.

**Wallet**: `AddMomoWallet`, `AddBankCard`, `AddPaymentMethodPopup`, `PaymentOptionCard`, `AddWalletButton`, `ReceivingAccountForms`.

**Settings**: `EditProfileInputFields`, `SecurityInputFields`, `MobileSettingsHeaderNav`.

**shadcn/ui primitives** ([src/components/ui/](src/components/ui)): `button`, `calendar`, `form`, `input`, `label`, `popover`, `slider`.

**Date/time**: `Calendar`, `DateTimePicker`, `DateBtn`/`DateTimeSelectorBtn`, `EventDateSelector`, `time-picker-input`/`timePicker`/`time-picker-utils` (built on `react-day-picker`).

**Transactions**: `TransactionsFilterLinks`.

**Plans**: `PlanContainer`, `SubscriptionPlans`.

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
3. **Hubtel OTP credentials are exposed to the browser.** `NEXT_PUBLIC_HUBTEL_API_USERNAME`/`NEXT_PUBLIC_HUBTEL_API_PASSWORD` are used to construct a Basic Auth header inside `src/services/authService.ts`, which is called directly from the client component `AuthModal.tsx` — these values ship in the client JS bundle.
4. **Phone sign-in does not create a real session.** The Supabase `signInWithOtp`/`verifyOtp` calls in `authService.ts` are commented out; only the Hubtel-side OTP send/verify happens, so a phone number is never actually linked to a Supabase auth session through this path.
5. **No payment-gateway integration in this repo, though the database expects one (Flutterwave).** `validateCheckout`/`generateTicket` compute price and issue tickets, but no code path in this repo calls Flutterwave (or any payment API), and no action ever inserts a `transaction` row — see §7.6 discrepancy #2. Tickets can currently be generated without a linked transaction at all, since `ticket.transaction_id` is nullable.
6. **No generated Supabase types.** All queries are untyped against the schema; several places use `as unknown as X` casts to work around this (`generateTicket.ts`, `validateCheckout.ts`).
6a. **No Row Level Security policies found in the pulled schema.** Every table is schema-wide `GRANT ALL`-ed to `anon`/`authenticated`/`service_role`, with no `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements anywhere in the migration. Access control currently appears to rely entirely on the application layer (Server Actions checking `auth.getUser()`). See §7.5 — this should be verified directly against the live database, since a `db pull` can miss dashboard-managed policies.
6b. **Several tables have no partitions and may not accept inserts.** `event_media`, `payment_method`, `wallet`, `story`, `event_share`, and `media_audit` are declared as partitioned tables with zero partitions defined in the pulled schema; `review`'s partitions only cover June–October 2025. See §7.5 for details — this may be a pull artifact rather than a real production issue, but is worth verifying.
6c. **`useUserProfile.ts` reads non-existent columns.** It reads `data.displayName`, `data.email`, `data.phone`, `data.createdAt`, `data.lastSignInAt` from a `user_info` row, but none of those columns exist on the real `user_info` table (see §7.6 discrepancy #3). These fields are always `undefined` in practice.
7. **Redundant middleware check**: `pathname.startsWith("/auth")` is listed twice in the public-route array in `updateSession()`.
8. **Unintended prefix overlap**: `/user-account` matches the `/user` public-route prefix in the middleware, so it is treated as public even though it may be intended to require auth.
9. **Confirmed table/view-name bug**: `getUserProfileDetails` action correctly queries the real view `user_profile_details` (plural), but `api/user-profile/route.tsx` queries `user_profile_detail` (singular), which **does not exist** in the database at all (confirmed against the real schema — see §7.6 discrepancy #1). That API route will fail whenever it's called.
10. **Two OTP providers in use for different flows**: Hubtel for sign-in OTP, Twilio Verify for phone-number-update OTP — inconsistent provider choice across similar features.
11. **Literal space in a directory name**: `src/landing Page/` — atypical and can cause friction with some shell tooling/scripts.
12. **Boilerplate README**: [README.md](README.md) is still the unmodified `create-next-app` default and does not describe this project.
13. **Correction from an earlier version of this document**: it was previously assumed (from `useUserProfile.ts`'s field mapping) that `user_info` had camelCase columns like `displayName`/`createdAt`/`lastSignInAt` alongside snake_case ones. The real schema shows this was wrong — `user_info` is consistently snake_case (`status_id`, `avatar_public_id`, `avatar_version`, `updated_at`, plus `username`, `full_name`, `bio`, `website`), and the camelCase fields simply don't exist in the database (see item 6c above and §7.6 discrepancy #3).
13a. **New: `audit_log` function has no matching table or trigger.** The database function `log_user_changes()` inserts into a table called `audit_log`, but no such table is created anywhere in the pulled schema, and no trigger currently invokes this function. It would error if called. See §7.5.
13b. **New: `ticket.ticket_code` is not unique at the database level**, `ticket_type` has no price/quantity/type CHECK constraints, and `promo_code.discount_percentage` has no 0–100 range check — all of this validation exists only in application code (Zod schemas, manual checks), not enforced by the database. See §7.6 discrepancies #4–#5.
14. **`.env.local` present locally with real-looking third-party secrets** (Supabase, Cloudinary, Twilio, Resend, Google OAuth, Hubtel). It is correctly excluded via `.gitignore` (`.env*`) and confirmed not tracked by git — noted for awareness, not a repo-tracking issue.
15. **Partial React Query adoption**: the provider is global but most data fetching still bypasses it in favor of ad hoc `useEffect` + Server Action calls, so caching/invalidation behavior is inconsistent across features.
16. **NextAuth-related env vars present but package not installed**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` exist in `.env.local` with no corresponding `next-auth` dependency in `package.json` — likely vestigial from an earlier auth approach.

---

## 17. Potential Improvements (derived from the above, not yet implemented)

- Resolve the Next.js 16 Cache Components TODOs left across every route rather than leaving them commented out indefinitely.
- Move the Hubtel OTP request server-side (a Server Action or route handler) so `HUBTEL_API_USERNAME`/`PASSWORD` are not `NEXT_PUBLIC_` and are not shipped to the browser.
- Either complete the Supabase-session-issuing part of phone/OTP sign-in or remove the unused code paths so the feature isn't half-present.
- Generate and adopt Supabase TypeScript types (`supabase gen types typescript`) to remove manual `as unknown as X` casts and catch schema drift at compile time.
- Verify directly in the Supabase dashboard whether RLS policies actually exist on the live tables (the pulled schema shows none) — enable them if they're genuinely missing, since every table is currently `GRANT ALL`-ed to `anon`/`authenticated`.
- Verify directly against the live database whether `event_media`, `payment_method`, `wallet`, `story`, `event_share`, and `media_audit` truly have no partitions (or whether the pull simply missed them), and either add partitions or fix the pull. Add new monthly partitions for `review` going forward (currently stops at October 2025).
- Implement the Flutterwave payment flow (or confirm/document where it actually lives if it's genuinely external to this repo), and require a valid `transaction` row before `generateTicket` runs for paid events.
- Fix `src/app/api/user-profile/route.tsx` to query the real `user_profile_details` view instead of the non-existent `user_profile_detail`.
- Fix `useUserProfile.ts` to stop reading `displayName`/`email`/`phone`/`createdAt`/`lastSignInAt` from `user_info` (columns that don't exist) — either add real columns for these or source `email`/`phone`/timestamps from the Supabase Auth user object instead.
- Either wire the `wallet`/`payment_method` tables up to the existing Wallet UI, or remove/relabel that UI if it's not meant to persist yet.
- Add a `UNIQUE` constraint on `ticket.ticket_code`, and `CHECK` constraints on `ticket_type.price`/`quantity`/`type` and `promo_code.discount_percentage` to move validation into the database as a safety net alongside the existing Zod validation.
- Either attach `log_user_changes()` to a trigger and create the `audit_log` table it expects, or remove the function if it's dead.
- Fix the duplicated `/auth` check and the `/user-account` vs `/user` prefix overlap in `updateSession()`'s public-route logic.
- Standardize on a single OTP provider for both sign-in and phone-update flows.
- Rename `src/landing Page` to remove the space, if/when a broader refactor touches that area.
- Update `README.md` to describe the actual project instead of the `create-next-app` default.
- Add a `PRD.md` or equivalent product doc, since the current one is a placeholder.

---

*This document reflects only what was directly verified by reading the repository's code, configuration, and git history. Sections marked "Needs Investigation" should be confirmed with the project owner or by deeper runtime/schema inspection before being relied upon.*
