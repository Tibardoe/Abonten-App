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

> **Revision note (2026-09-07):** In-app messaging system — **Phases 1–10 + a support-ops follow-up, merged to `main`.** A production messaging layer for user ↔ event-organizer, user ↔ place, and user ↔ support conversations across mobile + web, with admin moderation. Replaces the "share the organizer's phone number" gap: the conversation represents the **organization / event / place**, not a private employee (`conversation_participant.role` + a nullable-target schema keep multi-member business inboxes possible later).
>
> **Schema (migrations `20260907090000`–`20260907094100` + `20260907095000_messaging_support_ops`, all applied live via MCP, `get_advisors` clean, replay cleanly from scratch).** Six tables: `conversation` (`type` event/place/support/direct, nullable `event_id`/`place_id` FKs `ON DELETE SET NULL`, denormalised `last_message_*`, `moderation_state` visible/hidden/removed/restricted + `moderated_at`/`_by`/`_reason`), `conversation_participant` (`role` member/organizer/place_owner/staff/admin, per-user `last_read_at`/`muted`/`archived`/`left_at`), `message` (`message_type` text/image/file/system, `content` ≤4000, `reply_to_message_id`, `client_generated_id` for optimistic dedupe, soft `deleted_at`, `edited_at`, same `moderation_state` set + audit cols), `message_attachment` (metadata for the **private** `message-attachments` Storage bucket — `place-claim-documents` pattern, path `<conversationId>/<uuid>.jpg`), `message_reaction` (schema only, no V1 UI), `conversation_block` (server-enforced, bidirectional). Partial unique indexes on `(event_id, created_by)` / `(place_id, created_by)` / open support make `open_conversation` a race-safe get-or-create. `report.target_type` CHECK widened with `message` / `conversation`.
>
> **Security model** — identical to the `issue_free_ticket` / `create_ticket_checkout` hardening: `conversation` / `conversation_participant` / `message` have **no client INSERT/UPDATE/DELETE grants**. Every mutation is a `SECURITY DEFINER` RPC keyed on `auth.uid()`: `open_conversation`, `send_message` (participant + block + closed + rate-limit [30/min, 500/hr] + attachment-prefix checks; idempotent on `client_generated_id`), `edit_message` (own, 15-min window), `delete_message` (own, soft), `mark_conversation_read`, `set_conversation_state`, `block_participant`; read RPCs `list_conversations` (keyset, per-conversation unread, `p_role_scope` all/member/business, moderated threads excluded) + `get_unread_conversation_count`. RLS SELECT on every table is "are you a participant" via `public.is_conversation_participant(conversation_id, user_id default auth.uid())` (`SECURITY DEFINER`, bypasses RLS internally to avoid recursion); staff also read via `is_staff()`. `open_conversation`/anti-spam caps 20 new conversations/hr.
>
> **Backend transports (`packages/services/src/messaging/**`)** — `openConversationCore`, `sendMessageCore` (+ best-effort notification/Expo-push fan-out to other non-muted, non-left participants across all their devices; message content only ever appears in the notification payload, never in a log/analytics/Sentry call), `editMessageCore` / `deleteMessageCore`, `markConversationReadCore` / `setConversationStateCore` / `blockParticipantCore`, and direct-RLS reads `fetchConversationsPage` / `getConversationContext` (404s a non-visible thread) / `getUnreadMessageCount` / `fetchMessagesPage` (keyset, `moderation_state = 'visible'` only, embeds attachments + reply previews, redacts soft-deleted). `messagingError.ts` maps RPC SQLSTATE → `{status,message}`. Two thin transports: **11 web Server Actions** (`apps/web/src/actions/*Conversation*`, `*Message*`) and **11 mobile routes** (`apps/web/src/app/api/mobile/messages/**`), typed by a `messaging` namespace on `@abonten/api-client` (parity guard green). Shared types `@abonten/types/messagingType`, validation `@abonten/validation/messageSchema`, realtime contract `@abonten/core/messagingRealtime`, thread-assembly `@abonten/core/messagingThread`.
>
> **Realtime** (`20260907091000`) — `message` / `conversation` / `conversation_participant` in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Two channels per open thread: a **private** `conversation:<uuid>` (broadcast "typing" only; gated by two `realtime.messages` policies to participants — a non-participant subscribe is refused, proven by an integration test) and a non-private `msgchanges:<uuid>` for `postgres_changes` on `message` / `conversation_participant` (authorised by those tables' own RLS — a private channel would also need a `postgres_changes` policy on `realtime.messages`, which by design doesn't exist). A separate `inbox:<uid>` channel keeps the list + nav badge live. Postgres is the source of truth: inbound rows trigger a React-Query invalidate, not a hand-merge; the socket auto-reconnects and refetches on each fresh `SUBSCRIBED`. Typing + presence are **ephemeral, never persisted**.
>
> **Mobile** (`apps/mobile`) — bottom nav **Wallets → Messages** (`chatbubble-ellipses-outline`, `tabBarBadge` = unread count; wallet screen unchanged, moved to `/(app)/wallet` reachable from Account › Wallets; `/messages` added to the protected-route allowlist; `navigation.messages` in all 6 locales). `src/features/messaging/**` React-Query hooks + optimistic-send outbox (retry, server reconciliation) + `useConversationRealtime` / `useInboxRealtime` + `attachments.ts` (expo-image-manipulator downscale → private bucket, on-demand signed URLs). Screens: `(tabs)/messages.tsx` (inbox — Active/Archived, plus All/As-customer/As-organizer for organizers/place-owners), `messages/[conversationId].tsx` (inverted `FlatList`, date separators, sender grouping, reply, edit sheet, delete, long-press menu, mute/archive/block/report, typing indicator, full-screen image viewer), composer (multiline + up to 4 photos, optimistic clear), read receipts via `last_read_at`. "Message organizer" on `event/[id]`, "Message this place" on `place/[id]`. Foreground push suppressed for the thread on screen. `/messages/<id>` deep link in `notificationLink.ts` + `+native-intent.ts`.
>
> **Web** (`apps/web/src/messaging/**`) — responsive `MessagingWorkspace` (desktop two-pane list+thread, mobile single-pane driven by the route). `/messages` + `/messages/[conversationId]` pages (auth-gated). Same hook set over the Server Actions, `useConversationRealtime` / `useInboxRealtime` on the `@supabase/ssr` browser client, canvas-downscale attachment upload. `ChatThread` (`flex-col-reverse` scroll, per-message + per-conversation menus, edit dialog, report via the shared `ReportDialog`). `MessagesNavLink` (unread badge) in the desktop header + mobile header cluster; `MobileNavBar` swaps Wallets → Messages (wallet stays in Settings). "Message" buttons on the event + place detail pages (`MessageSubjectButton`, hidden for owner / signed-out).
>
> **Moderation** (`20260907094000`/`094100`) — a reported `message` / `conversation` is actionable from the admin Reports workspace exactly like an event/place/review: `apply_moderation_action` flips `moderation_state` + stamps the audit columns + appends a `report_event`; `ReportModeratableTargetType` (`= ModeratableTargetType | "message" | "conversation"`, kept separate so the Content-browse module isn't forced to list conversations), `moderationActionSchema`, `MODERATABLE_SET`, `applyModerationActionCore`, and the report `ActionPanel` all accept the two types; the report detail's generic target snapshot renders the reported content. Hidden/removed/restricted conversations drop out of `list_conversations`, `get_unread_conversation_count`, `fetchMessagesPage`, and `getConversationContext`. Block + report UI ship on both platforms.
>
> **Support queue + blocked-users browser (`20260907095000_messaging_support_ops`, applied live via MCP, advisor-clean).** Two new admin permission keys `support.view` / `support.respond` (seeded to `support_admin` + `operations`; `super_admin` auto-grants via `ADMIN_PERMISSION_KEYS`). **Admin › Support** (`/support`, `apps/admin/.../support`) — a claim-and-route queue over `conversation.type = 'support'`: tabs Unassigned / Assigned to me / Open / Closed / All, and a thread view with a full transcript, claim / reassign / unassign, **reply as "Abonten Support"**, close / reopen, and internal notes (`admin_note.target_type = 'support_conversation'`). `conversation` gains `assigned_to` / `assigned_at` / `assigned_by` — an **admin-side ownership marker only**: the agent is deliberately *not* added as a `conversation_participant`, so their real name / avatar never reaches the requester (chat bubbles carry no sender identity; `getConversationContext` builds its participant list from `conversation_participant` rows). `supportAdminCore` follows the `claimsAdminCore` "guarded direct service-role write" pattern — no new RPC; the reply insert re-does `send_message`'s `last_message_*` denormalisation by hand, reopens a closed thread, claims an unassigned one, and fires a `createNotificationCore({ type: "message", title: "Abonten Support" })` to the requester (never the agent's name; no message body in the audit row). A "Contact Abonten Support" entry point is wired on both clients (mobile Account › Help & support; web `/messages` empty state), both calling `open_conversation({ type: "support" })`. **Admin › Blocked users** (`/blocks`, `users.view`) — a read-only browser over `conversation_block` (blocker / blocked / global-vs-per-conversation / when, filterable by user); blocks stay the user's own to make and undo, so there is no admin "lift block".
>
> **Not implemented by design (extensible without a rebuild):** voice/video calls, voice messages, emoji reactions (table only), AI features.
>
> **Verification:** `npm run typecheck` 11/11, `npm run build` (web + admin) green, `check-mobile-api-parity.mjs` green (100 routes), Biome clean. All 9 migrations (`20260907090000`–`094100` + `095000_messaging_support_ops`) applied live to `sderrexhawjbmsugndcq`, advisor security clean (the messaging RPCs' "SECURITY DEFINER executable by authenticated" notices are this repo's accepted pattern; `095000` adds only columns + indexes + RBAC rows, no new functions), and `execute_sql`-confirmed. **Integration suite green — 60 tests / 12 files** against a local stack rebuilt for every messaging migration: the pre-existing messaging suites, `messaging-moderation.integration.test.ts` (role-scope inbox split; hidden conversation leaves both inboxes; hidden/removed message leaves the thread), and `support-admin.integration.test.ts` (queue lists a fresh thread as unassigned + awaiting reply and drops it once claimed; transcript labels the requester line and never leaks the agent as a participant; an agent reply lands an RLS-visible message + claims the thread + notifies as "Abonten Support"; close blocks the requester's `send_message` and moves the thread between scopes; assign / unassign round-trips). *Note: `test:db:down` did not wipe the local Docker volume — pending messaging migrations had to be applied to the running DB with `supabase migration up --db-url` / `docker exec psql` before the suite passed.* **Web** was exercised locally by the owner (opened a support conversation from the `/messages` empty state and sent a message — round-trip OK). **Mobile device pass (Android emulator, against the prod deployment):** inbox loads; send + receive; cross-platform (a web-sent message shows on mobile); conversation menu Mute (persists) / Archive / Report, with Block correctly hidden for `support` type; soft-delete with confirm → "This message was deleted"; Edit correctly hidden past the 15-min window; realtime — a server-side INSERT appended to the open chat in ~6 s untouched, and the inbox preview + unread badges updated live. **Image attach — end-to-end on the owner's physical phone (Expo Go):** pick → client downscale (the stored object is 1200×1600, longest edge = the 1600px target) → upload to `message-attachments/<conversationId>/<uuid>.jpg` → `message_attachment` row + `message` type `image` → renders. Not yet exercised: typing indicator between two real clients, push delivery, "Message organizer / place" from the detail pages. (The earlier "Couldn't load messages" was `EXPO_PUBLIC_API_BASE_URL` pointing at a web deployment that predated the `/api/mobile/messages/**` routes — a 404, not a client bug; the merge deploys those routes.)
>
> **Three pre-existing mobile bugs found + fixed during the device pass** (`main`, follow-up commit) — all latent, surfaced because messaging is the first feature to render a react-navigation `<Badge>` (the Messages-tab unread count) and to reliably hit the root error boundary: **(1)** `color@4.2.3` (via expo-router / react-navigation) needs `color-string@1.9.x`, but `metro.config.js`'s `disableHierarchicalLookup` made Metro resolve the hoisted `color-string@2.1.4` (ESM, pulled in by `@react-pdf` on web only). React Navigation's `Badge` calls `Color(backgroundColor)` → `colorString.get` is undefined → "undefined is not a function" red-screen on **every tab-bar screen the moment unread > 0** (would ship in an EAS build too). Fixed with a Metro `resolveRequest` shim pinning `color-string` → the v1 copy for the mobile bundle. **(2)** `(tabs)/_layout.tsx` passed `tabBarBadgeStyle.backgroundColor: c.primary` — a space-separated `hsl(171 65% 45%)` token the `color` lib can't parse — now a plain hex `#0F9D8F`. **(3)** `RootErrorBoundary` rendered themed `@abonten/ui-native` `<AppText>`/`<Button>`, but expo-router mounts it *outside* `ThemeProvider`, so any render error triggered a second `useTheme must be used within <ThemeProvider>` crash that masked the first; rewritten with bare RN primitives + hardcoded colours so the error screen can't itself crash.

> **Revision note (2026-09-08):** Mobile chat polish pass — composer/keyboard/safe-area, "new messages" affordance, stuck-loading fix, attachment menu + preview, **voice notes**, and a full bottom-edge audit (branch not yet merged). **(1) New shared primitive `@abonten/ui-native` `BottomBar`** (+ a `useKeyboardHeight`/`useKeyboardVisible` hook extracted from `Sheet.tsx`) — a sticky-footer wrapper that pads its bottom by the device safe-area inset when the keyboard is closed and collapses to a hairline when it's open (no double safe-area pad). Rewired: the chat `Composer`, `buy/[eventId]` "Proceed to checkout", `MapPickerSheet` "Use this location"; `checkout/[sessionId]` scroll content now pads by `insets.bottom`. `Sheet` was already correct — only its keyboard listener moved to the shared hook. **(2) Composer + keyboard** — `[conversationId].tsx` gained a `useChatScroll` hook (inverted-list `atBottom` tracking + `scrollToBottom` + an unseen counter): the user's own send always follows to the latest; an incoming message follows only if already at the bottom, otherwise it raises a new floating **`NewMessagesPill`** ("↓ N new messages"); the keyboard opening holds the bottom if you were there. **(3) Stuck-loading on re-entry fixed at the root** — `packages/api-client` `request()` now aborts after a `timeoutMs` (default 20 s) so a hung mobile `fetch` rejects into the query's retry/error path instead of a permanent spinner; `useConversationMessages`/`useConversationDetail` get a 30-min `gcTime`; the thread screen only shows a full-screen spinner when there is genuinely no cached page (`messagesQ.data === undefined && !isError`), otherwise it renders cached rows and reconciles silently; a `RefreshControl` is a recovery affordance, never required. **(4) Realtime hardening** — `useConversationRealtime` builds/refs both channels synchronously (the async-IIFE `changesChannel` could leak on a fast back/forward → duplicate `msgchanges:<id>` subscriptions), removes any stale same-topic channel first, and re-pushes the token + reconciles on `AppState → active`. **(5) `+` attachment menu** — new `AttachmentSheet` (Photos & Videos · Take Photo · Choose File) replaces the direct gallery jump; `attachments.ts` gained `pickChatMedia` (multi, images+videos), `captureChatPhoto` (`expo-image-picker` camera), `pickChatDocument` (`expo-document-picker`, blocks executables, 10 MB cap) and a generic `uploadChatAttachment`. A single picked item goes through a new `AttachmentPreview` sheet (preview + optional caption); a multi-select gallery pick keeps the fast composer thumbnail strip. Non-image attachments render as a tappable `FileAttachmentCard` (signed URL → `expo-web-browser`). Videos are sent as a `file` for now (no inline player — deferred). **(6) Voice notes** — **one migration `20260908090000_messaging_voice_messages.sql` (applied live via MCP, advisor-clean, replays from scratch)**: widens `message.message_type` + `message_content_presence` CHECKs with `'audio'`, adds the audio MIME types to the private `message-attachments` bucket, and recreates `send_message` to accept `p_message_type = 'audio'` / auto-classify an audio-first attachment / **persist `message_attachment.duration_seconds`** (a column present since the schema but never written) / write a `'[Voice message]'` inbox preview. Shared: `MessageType += 'audio'`, `SendMessageAttachmentInput.durationSeconds`, `sendMessageAttachmentSchema.durationSeconds` (≤ 600), `conversationPreviewFor` + `messagePreview` "🎤 Voice message". **New dependency `expo-audio ~57.0.4`** (SDK-versioned; the `expo-av` replacement) — config plugin + `microphonePermission` added to `app.json`; **needs a dev-client / EAS rebuild** to activate. Because `apps/mobile` is a prebuild project, `expo-audio`'s `requireNativeModule('ExpoAudio')` throws at import until relinked — so **every `expo-audio` import is isolated behind `React.lazy` + a `VOICE_SUPPORTED` runtime check** (`requireOptionalNativeModule("ExpoAudio")` in `features/messaging/voiceSupport.ts`). Without a rebuild the chat screen renders normally: no mic button, and incoming voice notes show an "update the app to play" chip. `VoiceComposer.tsx` (lazy) holds the recorder UI; `VoiceMessageBubble` is a lazy default export. Mobile: `useVoiceRecorder` (hold-to-record, metering waveform, 5-min cap, mic-permission → Settings deep link), `VoiceRecorderBar` (composer-row recording UI: pulse, timer, waveform, slide-to-cancel, drag-to-lock), `uploadVoiceNote` → the same private bucket + the shared outbox/reconcile/retry path (message type `audio`); playback via `useVoiceBubblePlayer` (a module-level "one voice note at a time" pub/sub + `expo-audio` player, pauses on background/blur) rendered by `VoiceMessageBubble` (play/pause, seek-scrub waveform, elapsed/total). Web gets playback only — a minimal `<audio controls>` branch in `apps/web/src/messaging/components/MessageBubble.tsx` (no web recorder). The composer shows a **mic** button when the field is empty, a **send arrow** otherwise. **Verification:** `turbo run typecheck` 11/11, `turbo run build` (web + admin) exit 0, Biome clean on all touched files, **integration suite 78/78** (+1: `send_message` with an audio attachment persists `duration_seconds` + a `[Voice message]` preview, and a non-participant still can't attach) against a local stack rebuilt from scratch with the new migration. **Not yet device-verified** — the whole pass (safe-area on real iPhone/Android nav bars, keyboard behaviour, the hold-to-record gesture, voice record/playback, attachment pickers) needs a dev-client rebuild for `expo-audio` and an on-device run; iOS unverified as usual.

> **Revision note (2026-09-08, later same day):** **Premium chat interaction overhaul (mobile) + message reactions (mobile + web + reaction-aware backend).** The message and inbox-row long-press menus were **generic bottom sheets** (`Sheet`/`SheetOption`, `ConversationActionSheet`); they are replaced by a single shared **contextual-action overlay** that lifts the pressed item into its own layer. **(1) `apps/mobile/src/components/messaging/contextMenu/`** — `ContextualActionOverlay` (a transparent `Modal`: Reanimated scrim fades in, a `measureInWindow`-anchored clone of the pressed item springs up ~1.03× with a soft shadow, a compact rounded action card animates in beside it), `menuPlacement.ts` (pure `computePlacement` — picks above/below from the room left after `safe-area` insets, clamps the preview so nothing runs under the status bar / home indicator / off-screen; `computeMenuLeft` hugs the bubble's own edge), `useAnchorMeasure` (ref + promise-wrapped `measureInWindow`), `ReactionBar` (the 6-emoji strip floating above the menu), `MessagePreviewCard` (gesture-free, playback-free bubble clone). The overlay `Keyboard.dismiss()`es on open so it never fights the composer for space. **(2) `MessageBubble` rewritten with `react-native-gesture-handler` `Gesture.Race(pan, longPress)`** — long-press (260 ms, `hapticMedium`, `measureInWindow` → overlay) now works on **incoming** messages too (Reply / Copy / React), not just your own; **swipe-to-reply** (`Gesture.Pan().activeOffsetX([±14]).failOffsetY([±12])` so vertical scroll always wins) drags the bubble toward centre with resistance, reveals a reply glyph, fires one `hapticLight` at the 52 px threshold, and on release past threshold calls `onReply` then springs back; a brief `interpolateColor` wash highlights a bubble jumped-to from a reply quote. Reactions render as tappable pills under the bubble (`MessageReactions`, memoised). **(3) Message actions** (`MessageActionOverlay`): Reply (any non-deleted), **Copy** (text only — new dep **`expo-clipboard ~57.0.1`**, needs a dev-client/EAS rebuild, works in Expo Go, isolated behind `expo-clipboard`'s own module), Edit (own, ≤15 min), Delete (own, still `Alert.alert` confirm) + the reaction bar. `ChatToast` is a small fade pill for "Copied" etc. — not a sheet. **(4) Composer reply preview** redesigned (accent bar, "Replying to {name}" resolved from `context.participants[].profile`, type-aware line incl. `🎤 Voice message · 0:18` and a photo thumbnail via `useAttachmentUrl`, `FadeInDown`/`FadeOutDown`). Tapping a reply quote scrolls to + highlights the original (`scrollToIndex` with an `onScrollToIndexFailed` fallback; pages older messages in, capped, if not loaded). **(5) Inbox rows** (`ConversationRow` long-press → `measureInWindow` → `ConversationContextOverlay`) get the same overlay: a cached-data preview card + state-aware Mark read/unread · Mute/Unmute · Archive/Unarchive (all already optimistic in `useMessagingActions` with snapshot rollback). The existing `Swipeable` left/right swipe actions are unchanged; `ConversationActionSheet.tsx` deleted. Applied on `(tabs)/messages.tsx` **and** `messages/archived.tsx`. **(6) Reactions backend — migration `20260908133841_message_reactions.sql` (applied live via MCP, advisor-clean vs. baseline, replays from scratch).** The `message_reaction` table (schema-only since Phase 1) is turned on: a denormalized `conversation_id` (NOT NULL, backfilled, indexed) so realtime can filter it like `message`; **`toggle_message_reaction(p_message_id, p_emoji)` `SECURITY DEFINER`** — the single write path, self-authorizes on `auth.uid()`, re-checks `is_conversation_participant`, constrains the emoji to the fixed palette (`👍 ❤️ 😂 😮 😢 🙏`), toggles the caller's row, returns `{ added }`; `message_reaction` added to the `supabase_realtime` publication (`replica identity full`). `fetchMessagesPage` now loads a per-emoji rollup (`{ emoji, count, reacted_by_me }[]` on `MessageRow.reactions`, caller-id via `auth.getUser()`), and `loadReplyPreviews` joins `duration_seconds` for an `audio` reply target (`MessageReplyPreview.duration_seconds`). **`@abonten/services/messaging/reactionMutationsCore`** `toggleReactionCore`; web action `toggleMessageReaction` + `POST /api/mobile/messages/react` (`api.messaging.react`, parity guard green — 104 routes); shared `MESSAGE_REACTION_EMOJIS` / `MessageReactionSummary` / `toggleMessageReactionSchema`; both `useConversationRealtime` hooks subscribe to `message_reaction` changes; optimistic `useToggleReaction` (mobile + web) patches the messages cache with snapshot rollback + server-`added` reconciliation. **(7) Web (§28 — pointer, not gesture):** `MessageBubble` dropdown is now controlled and also opens on **right-click** (`onContextMenu`); adds a **Copy** item (`navigator.clipboard`) + the 6-emoji reaction row + reaction pills + a clickable reply quote (`scrollIntoView` + ring flash); `ConversationListRow` opens its actions dropdown on right-click. No web recorder / no web gestures. **Reactions / Forward decision:** reactions **built** (this note); **Forward is still not implemented** anywhere (no backend support) — listed as a follow-up. **Verification:** `turbo run typecheck` 11/11, `npm run web:build` compiled clean, `check-mobile-api-parity.mjs` green (104 routes), Biome clean on all touched files, **integration suite 82/82** (+4: `messaging-reactions.integration.test.ts` — add-then-toggle-off is idempotent and returns `{added}`; the rollup counts both sides and flags only the caller's own; a non-participant is refused 403 with nothing written; an off-palette emoji is refused 409) against a local stack replayed from scratch with the new migration. **Not device-verified** — the whole interaction pass (long-press lift + placement on real notches / home indicators, swipe-to-reply vs. scroll, haptics, `expo-clipboard` Copy) needs a dev-client rebuild (`expo-clipboard` native module) and an on-device run; iOS unverified as usual.

> **Revision note (2026-09-08, refinement pass):** Second high-fidelity pass on the mobile chat contextual interaction + a real reaction data-flow fix. **(1) The reaction tap did nothing visible** — `ReactionBar` fired the toggle but the overlay stayed open and its bubble clone doesn't show pills, so the added pill was hidden behind the dim. Fixed: `ContextualActionOverlay`'s `accessory` prop became `renderAccessory(dismiss)` and `MessageActionOverlay` now calls `dismiss(() => onReact(id, emoji))` — the overlay animates out (120 ms) *then* the mutation runs, so the pill lands on the real bubble the instant the menu clears (spec §21). A failure now shows a `ChatToast` ("Couldn't add reaction") and the optimistic pill reverts (§16). **(2) One reaction per user per message** — new migration **`20260908142212_message_reaction_single_per_user.sql`** (applied live via MCP, advisor-clean, replays from scratch): PK swapped `(message_id, user_id, emoji)` → `(message_id, user_id)`; `toggle_message_reaction` now upsert-replaces (`on conflict (message_id, user_id) do update set emoji = excluded.emoji`) so picking another emoji swaps it and tapping the active one removes it. `applyReactionToCache` (mobile + web) re-derives the rollup with the same replace rule — strips the caller's vote from the old emoji when adding a new one. **(3) Scrim + lift** — scrim is now translucent (`opacity → 0.45` of the theme overlay, no blur) so the conversation stays legible under it (§2); the lifted preview scales `1.045`, rises 3 px, and carries a real shadow while staying anchored to where it was pressed (§3–4). **(4) Cluster layout** — reaction bar + action menu now share one width (`CLUSTER_WIDTH 252`) and the reaction bar is always the affordance **closest to the bubble** in *both* orientations (`menuPlacement` "above" reordered to menu → reaction bar → message; §5–6). Menu compacted: 44 px rows, hairline border, no separators, `radius 14`, `AppText`-rendered labels in the brand font at 15 px, 18 px icons (§7). **(5) Reply previews** — `ReplyQuote` extracted to a shared `apps/mobile/src/components/messaging/ReplyQuote.tsx` used by the bubble, the preview clone, and (mirrored) web: image → rounded thumbnail + "Photo", video (`file` + `video/*` mime) → film glyph + "🎬 Video · m:ss", voice → mic glyph + "Voice message · m:ss", other file → doc glyph. `MessageReplyPreview` gains `attachment_path` / `attachment_mime`; `loadReplyPreviews` now fetches the first attachment's path/mime/duration for every non-text reply target (was audio-duration only). Composer reply preview handles video the same way. **(6) Typography / bubble sizing** — message bubble `max-w 78%`, `py-[7px]`; grouped-message gap `mt-[3px]` vs. `mt-2.5` on sender change; reply-quote line bumped `caption` → `meta` (13 px). **(7) Haptics** — reaction pick now fires `hapticSelection`; swipe-to-reply threshold dropped 52 → 44 px; long-press press-in scale softened. **Verification:** `turbo run typecheck` 11/11, `npm run web:build` compiled clean, Biome clean on all touched files, **integration suite 83/83** (+1: `messaging-reactions` "replaces the caller's previous emoji when they pick another" — only the new emoji remains, `message_reaction` holds one row for that user). Both reaction migrations replay cleanly from scratch; advisors unchanged vs. baseline. **Still not device-verified** — the lift/placement on real notches + home indicators, the swipe-vs-scroll gesture arbitration, haptics, and `expo-clipboard` Copy all need a dev-client rebuild (`expo-clipboard` native module) and an on-device pass on Android *and* iOS. **The mobile reaction POST also needs this branch deployed** — `/api/mobile/messages/react` only exists here, so on-device against the current prod API it 404s and the optimistic pill reverts until merge + Vercel deploy.

> **Revision note (2026-09-08, chat interaction pass 6 — owner-requested refinements):** Six interaction changes, plus the three open items from pass 5 closed. **(1) The lifted long-press clone now keeps its delivery tick** — `MessagePreviewCard` omitted it, so the clone was a few px narrower than the bubble it replaced and the message visibly re-flowed on press and again on dismiss. It now draws the same footer (edited marker, time, tick) and takes `seen` from the screen. **(2) Media lifts out as the same object:** the clone rendered a bespoke 200px `ImagePreview` while the bubble used `ChatImage`'s `fittedSize`, so a photo changed size mid-transition. The clone now renders `ChatImage`/`FileAttachmentCard` themselves — identical geometry, and it hits the already-warm signed-URL cache, so nothing reloads or flashes. **(3) The inbox peek is a real mini chat** (`PeekThread`), not the last line: it renders the tail of the actual thread as bubbles via `useConversationMessages`, so an already-opened thread paints instantly from cache; media/voice collapse to a labelled chip so a peek never starts signing URLs. Tapping it still opens the full screen. **(4) The chat's "..." menu is an anchored drop-down** (`AnchoredMenu`), not a bottom sheet — positioned from the button's own `measureInWindow` frame, clamped to the safe area, over a light scrim that leaves the thread legible. **(5) The reaction bar gained a "+"** that opens the **system emoji keyboard** (`EmojiPickerSheet`) rather than a bundled emoji catalogue, so every emoji the device knows is available with search and skin tones for free; the first emoji typed is taken and confirmed immediately. **(6) Picked emoji are remembered** (`recentReactions`, SecureStore, per-user) and prepended to the bar most-recent-first, capped so the defaults are never fully displaced. **Schema:** the six-emoji allowlist could no longer hold, so `20260908215500` + `20260908222031` replace it with a SHAPE rule enforced identically in three places — the `message_reaction_emoji_shape` CHECK, the `toggle_message_reaction` RPC, and `isValidReactionEmoji` in `@abonten/core` (moved there from `@abonten/validation` so it is unit-testable and reusable by the picker): 1–16 chars, no ASCII letter, no whitespace, and at least one code point above U+00FF. That accepts every real emoji including ZWJ sequences, skin tones, flags and keycaps, while still making readable text unstorable — which matters because the table has an own-row RLS INSERT policy. **Also fixed:** the emoji cluster regex wrote the skin-tone modifier as a bare range inside an alternation instead of a character class, so `👍🏾` matched as `👍` — which both stored the untoned base from the picker and stopped a skin-toned emoji-only message from rendering large. **Verified on-device (Android 15 emulator):** the anchored menu, the mini-chat peek and tap-through, the tick on the lifted clone, the "+" opening the real OS emoji panel, picking 🤣 from it, and that emoji then appearing first in the reaction bar and persisting to the database as a reaction. **Counts:** typecheck 11/11, mobile lint 305 files clean, unit 141 (core, +19) + 12 (services), integration **93/93** (+6) on a from-scratch database carrying all five new migrations, web + admin builds clean.

> **Revision note (2026-09-08, production hardening pass 5 — first real device QA of the chat overhaul):** Ran the messaging branch on an Android 15 emulator against a local API, and did a genuine from-scratch migration replay + object-level diff vs production. **Four real defects found on device and fixed, none of which any automated check had caught.** **(1) Reply quotes collapsed.** `ReplyQuote`'s panel had `minHeight` but no `minWidth`, and a bubble sizes to its widest child — so a short reply ("T", "Slick") squeezed the quote until its label truncated to "P…" / "Voice me…". It now claims a screen-relative minimum so the bubble opens up to fit the quote. **(2) A reply-to-photo quote stretched to the full height of the photo.** The 46px thumbnail used `alignSelf: "stretch"` with a `height: "100%"` child; inside that auto-height row the percentage resolves against an undefined height, so expo-image fell back to the image's intrinsic size and blew the bubble out to fill the screen. It only ever reproduced once a signed thumbnail URL actually resolved, which is why it survived review — now a definite `QUOTE_H` square. **(3) The lifted long-press clone re-wrapped its text.** `ContextualActionOverlay` pinned the preview to the measured `anchor.width` and then re-applied the bubble's own horizontal padding — an exact fit that sub-pixel rounding tipped into an extra line, so a one-line message visibly became two as it lifted and stopped reading as the same object. The clone is now anchored to the same screen edge the bubble hugs and sizes to content under the same max-width rule a real bubble uses. **(4) `message_type='file'` for plain text** — see §7.6 item 11; pre-existing on `main`, silently disabling emoji-only rendering and Copy. **Verified on-device (Android 15 emulator, dev client, live prod Supabase):** inbox layout; conversation long-press lift-out (no duplicate row, no drift, list recedes, action card pixel-centred on the peek); swipe-down return; message long-press (genuine lift, no ghost, reaction bar adjacent, icon+label one line, contextually-correct actions); swipe-to-reply; and the **full reaction lifecycle add → change → remove**, each confirmed by `POST /api/mobile/messages/react 200` and by reading `public.message_reaction` back (one row per user enforced, trigger-derived `conversation_id` correct, 0 rows left behind). **Also:** `reactionRealtimePatches` extracted from both realtime hooks into `@abonten/core/messagingReactions` so the realtime reducer is unit-tested rather than buried in a subscription callback (17 new tests covering INSERT/DELETE/UPDATE, emoji switch, own-echo suppression and 9 malformed-payload shapes); 2 new integration tests prove a participant cannot forge a reaction under another user's id nor tamper with theirs. **Counts:** typecheck 11/11, mobile lint 301 files clean, unit 122 (core) + 12 (services), integration **87/87 on a from-scratch database**, web + admin builds clean, Android bundle exports clean.

> **Revision note (2026-09-08, hardening pass 4):** Correctness / performance / security pass over the reaction data flow, plus a schema-drift finding. **(1) Reaction rollup logic moved to `@abonten/core/messagingReactions`** (`rollReaction`, 13 unit tests) — it was duplicated verbatim in `apps/mobile/src/features/messaging/cache.ts` and `apps/web/src/messaging/hooks/cache.ts`, and neither copy could express "somebody *else* reacted": adding an emoji always claimed it as the caller's and stripped the caller's vote off its previous emoji. `applyReactionToCache` now takes a `mine` flag. Sorting is a stable count-only sort (was `localeCompare` on emoji — locale-dependent, and it reshuffled pills as counts moved). **(2) The realtime `message_reaction` handler no longer invalidates the thread.** Both apps responded to every reaction event by invalidating `messagingKeys.messages(id)`, refetching *every loaded page* — including the echo of the device's own optimistic toggle, so a single reaction tap on a 5-page thread fired 5 refetches. It now patches the affected message in place from the payload (the table is `REPLICA IDENTITY FULL`), ignores its own `user_id`, and maps INSERT/DELETE/UPDATE to add / remove / remove-then-add (an emoji switch arrives as an UPDATE carrying both). **(3) `fetchMessagesPage` no longer calls `supabase.auth.getUser()`**, an auth-server round trip added on the hottest messaging read path — per page, for both transports — purely to flag "my" reactions. It takes an optional `callerId`; `getConversationMessages` and `GET /api/mobile/messages/:id/messages` both already had the user resolved and now pass it (the lookup remains as a fallback for tests). **(4) Long-press no longer hides a message's reaction pills.** `hiddenForMenu` set `opacity: 0` on the whole row, contradicting `MessagePreviewCard`'s design (its clone deliberately omits pills so its height matches the measured anchor); it now applies to the bubble only. **(5) Accessibility:** the bubble is a `GestureDetector` child with no accessible affordance, and long press is the only route to Reply / React / Copy / Delete — it now carries `accessibilityRole`, a composed label (naming the attachment kind for text-less messages) and a standard `longpress` accessibility action, deliberately *not* `activate`, which must stay free to open an image viewer. **(6) DB hardening — `20260908170944_message_reaction_table_hardening.sql`** (applied live, advisor-clean). `message_reaction` carries an own-row RLS INSERT policy from the Phase-1 schema, so a participant can write to the table straight from the client SDK, bypassing `toggle_message_reaction`. Two things were only enforced inside the RPC: the **emoji palette** (the column's only constraint was `char_length between 1 and 16`, so any short arbitrary string could be stored and would render verbatim in the other participant's thread) — now a CHECK pinned to the same six emoji; and **`conversation_id` integrity** — denormalized only so realtime can filter, but untied to the parent message, so a forged value would broadcast on the wrong conversation's channel and the real participants would never see it — now derived by a `BEFORE INSERT OR UPDATE` trigger that ignores the client value entirely. Both proven live against the production DB (off-palette insert rejected with `23514`; a forged `conversation_id` silently rewritten to the message's own) and covered by two new integration tests. **(7) Migration filename drift:** the two reaction migrations were committed as `20260908140000` / `20260908150000` but applied as `20260908133841` / `20260908142212`; renamed to their true production versions (filename only, zero SQL change), per the 2026-09-05 convention. **This is a recurrence of a wider, still-open discrepancy — see §7.6.**

> **Revision note (2026-09-08, contextual-UX pass 3):** Third mobile chat polish pass — interaction quality + a purpose-built inbox long-press. **(1) The inbox long-press was reusing the message overlay** (`ConversationContextOverlay` → the bubble-oriented `ContextualActionOverlay`), which positioned a full-width row clone at `left: anchor.x` but clamped its width to `screen*0.92` — a duplicate-looking row pulled left with dead space on the right, under a weak scrim. Replaced by a dedicated **`ConversationPeekOverlay`** (`apps/mobile/src/components/messaging/ConversationPeekOverlay.tsx`; `ConversationContextOverlay.tsx` deleted, used on `(tabs)/messages.tsx` + `messages/archived.tsx`): a translucent-scrim `Modal` (wrapped in `GestureHandlerRootView` for Android gestures-in-Modal) with a **perfectly-centred** chat-peek card (`width = screen − 32`, `left: 16`, never offset) — grabber handle, avatar, name, event/place context, 2-line last-message preview, timestamp, muted/"N new" chips — built from the cached list row (no refetch). Reanimated + a `Gesture.Exclusive(pan, tap)`: **swipe down** → card follows the finger and, on release past threshold/velocity, drops back to its exact original list position (`anchorOffset` interpolation as `progress → 0`) then dismisses; **swipe up** → card follows + shrinks (`dragScale` to 0.86) toward the top, past threshold hands off into the chat; **tap** → opens the chat after a 170 ms exit (connected transition, no loading screen); scrim opacity recedes with drag distance. Compact action card below (clamped above the home indicator): `[icon] label` rows, 46 px, read/unread · mute · archive only (no fake Delete — none exists). Hardware-back + scrim-tap dismiss; `accessibilityViewIsModal` + labels + a swipe hint. **(2) Emoji-only messages** — new `features/messaging/emojiOnly.ts` (`classifyEmojiOnly` via a runtime-built `\p{Extended_Pictographic}` cluster regex with a coarse-range fallback; rejects anything with a letter/digit): `MessageBubble` + `MessagePreviewCard` render a bare-text bubble (no chrome) at 46/38/28/22 px for 1 / ≤3 / ≤6 / more clusters. **(3) Reply previews enlarged** (`ReplyQuote` rewritten) — a tinted rounded container (44 px min height) with a 3 px accent rail: 46 px real thumbnail for photo/video (video gets a play badge), a mic tile + 7-bar mini-waveform for voice, both with `· m:ss` duration; text shows two comfortable lines at 13.5 px. **(4) Typography / sizing** — message body 15 → 16 px; bubble padding `px-3 py-[7px]` → `px-3.5 py-2`, `max-w` 78 → 80 %; reaction pills 22 → 27 px tall, emoji 12 → 14, `hitSlop`; conversation rows `py-3 gap-3` → `py-3.5 gap-3.5`, name → 16 px, preview → 14 px; action-menu rows 44 → 46 px, icons 18 → 19; reaction-bar buttons 38 → 40 px. **(5) Message lift-out** — the clone now keeps the bubble's exact width + x (safety clamp only, `screen*0.94`); scale `1.045 → 1.055`, rise `3 → 6 px`. No backend / schema / query / realtime / navigation changes — reactions data-flow from pass 2 is untouched. **Verification:** `turbo run typecheck` 11/11, Biome clean on every touched file. **Not run this pass:** `web:build` and the services integration suite (changes are 100 % `apps/mobile` presentational + one pure helper — neither path is exercised). **Not device-verified** — the peek gesture arbitration (down-return / up-handoff / tap), `Modal` + `GestureHandlerRootView` gestures on Android, the emoji-cluster regex on Hermes, safe-area clamping on real notches/home indicators, and all typography at true phone DPI need a dev-client rebuild and an on-device pass on Android *and* iOS.

> **Revision note (2026-09-08, contextual-UX pass 4 — iMessage/WhatsApp polish):** Visual-standard pass on the same surfaces. **(1) Action menu** — rows were `[icon] label` (icon leading, label trailing, one line). Reworked to the iOS-menu convention: **label leading (16 px, `flex: 1`), icon trailing (20 px), hairline separators between rows, edge-to-edge 44 px rows, no border, `radius 13`, stronger shadow**. Same in `ContextualActionOverlay` (message) and `ConversationPeekOverlay` (inbox). **(2) Long-press lift-out** — entrance is now `withSpring` (damping 19 / stiffness 230 / mass 0.8) for an iMessage-style "pop" with slight overshoot; scrim `0.45 → 0.5`; preview rise `6 → 7 px`, scale `1.055 → 1.045` (spring gives the extra); cluster translate-in `±6 → ±10 px`, scale-in from `0.94`. **(3) Reaction bar** — a rounded-full pill (was rounded-26 w/ border), 38 px buttons, 23 px emoji, tighter shadow, no border. **(4) Bubbles** — `min-w-[56px]` + `max-w-[86%]` + `px-4 py-2.5` (from pass 3's 80 % / `px-3.5 py-2`); radius `rounded-2xl → rounded-[20px]`, tail corner `6 → 7 px`; a whisper of elevation (`shadowOpacity 0.06`, `elevation 1`) so bubbles sit above the thread; sender-change gap `mt-2.5 → mt-3`, within-run `mt-[3px] → mt-[2px]`; meta row `mt-1 → mt-0.5`. **(5) Reply quote** (`ReplyQuote`) — WhatsApp model: 4 px coloured rail, bright accent title (kind + `· m:ss`), quoted text (2 lines) or a 7-bar mini-waveform for voice, and a **real thumbnail on the trailing edge** (full-height, 46 px) for photo/video with a play badge; non-media types get a small inline leading glyph. Composer's own reply strip restyled to match (rail + accent title + trailing thumb/glyph tile + `×`). **(6) Conversation list** (`ConversationRow`) — divider now **inset to the text start** (`left-[82px]`, hairline) instead of full-width; name `16 → 16.5 px`; timestamp `12.5 → 13 px` (semibold when unread); unread pill `18 → 20 px`. **(7) Attachment UI** — `AttachmentSheet` is now a **row of three tinted icon tiles** (Gallery · Camera · File — 64 px `rounded-[22px]` `accent` squares, `primary` glyphs) instead of a stacked `SheetOption` list; `AttachmentPreview` gets a **WhatsApp-style caption bar** (rounded-22 field + inline circular send button) in place of the generic footer `Button`, a taller `rounded-18` image, and an `accent`-tile icon for non-image files. **(8) Composer** — input `rounded-2xl → rounded-[22px]`, `py-2 → py-2.5`, text `15 → 16 px`; `+` glyph `add-circle-outline → add`; send / mic button `36 → 40 px`; staged-attachment thumbs `56 → 62 px`, `rounded-lg → rounded-xl`, remove badge given a card-coloured ring. No backend / schema / data-flow / navigation changes. **Verification:** `turbo run typecheck` 11/11, Biome clean on all touched files. **Still not device-verified** — same caveats as pass 3 (Modal gestures on Android, spring feel, safe-area on real hardware, typography at true DPI); needs a dev-client rebuild and an on-device pass on Android *and* iOS.

> **Revision note (2026-09-08, contextual-UX pass 5 — kill the ghost + iMessage bubbles):** **(1) Long-press "ghost" fixed** — the lifted clone showed with the *real* item still visible behind it under the (translucent) scrim → a doubled look. Now the source is hidden while its clone is up: `MessageBubble` takes `hiddenForMenu` and `ConversationRow` takes `hidden` (→ `opacity: 0`, layout kept so the list doesn't jump), wired from `[conversationId].tsx` (`menuTarget?.message.id`) and `(tabs)/messages.tsx` + `messages/archived.tsx` (`menuFor?.item.conversation_id`). The `close()` animations already fire `onDismiss` only *after* the exit tween, so the real item reappears exactly as the clone finishes settling back — a clean hand-off. Scrim also deepened `0.5 → 0.62` (no `expo-blur` in the build; a darker veil is the closest approximation to iMessage's blurred backdrop). **(2) Action-menu rows rebuilt** — each row is now a dedicated inline `flexDirection: "row"` `<View>` (label `flexGrow/flexShrink` + `numberOfLines={1}` + `marginRight` gap, trailing `Icon`) instead of relying on `flex: 1` + `justifyContent: "space-between"` on the `Pressable` itself — label and icon can no longer wrap onto separate lines. iOS metrics kept: label leading / icon trailing, hairline separators, 44 px rows, `radius 13`, no border. Same treatment in `ConversationPeekOverlay`. **(3) Bubbles → iMessage** — incoming is now a **flat grey pill**: `bg-secondary` (distinct from the 97 %/9 % thread bg in both themes; `muted` was too close), **no border, no shadow** (dropped the pass-4 whisper elevation); geometry `rounded-[18px]` + a 5 px tail corner (`rounded-bl-[5px]` / `rounded-br-[5px]`), `px-3.5 py-2`, `min-w-[52px] max-w-[85%]`, 16 px body. Outgoing unchanged but same geometry. `MessagePreviewCard` clone matches. **(4) Conversation peek → cleaner iOS preview** — grabber handle removed, borderless, `radius 24 → 22`, deeper shadow, same darker scrim. **(5) Reaction bar** — rounded-full pill, borderless, 38 px targets, 23 px emoji. **Verification:** `turbo run typecheck` 11/11, Biome clean on all touched files. **Not device-verified** — the ghost-hide hand-off timing, the darker scrim, the flat-grey incoming bubble contrast, and the rebuilt menu rows all need an on-device look on Android *and* iOS.

> **Revision note (2026-09-07, later same day):** Messaging inbox redesigned to a WhatsApp-inspired information hierarchy on **both** mobile and web, replacing the stacked-`SegmentedTabs` list. New order on every inbox: header → debounced search bar → horizontally-scrollable filter chips (`All` / `As Customer` / `As Organizer`, one always active + a `+` that adds predefined `Unread` / `Events` / `Places` / `Muted` chips) → a quiet "Archived ›" navigation row → the conversation list. **Archived is a destination, never a peer tab** — mobile: a dedicated `/(app)/messages/archived` screen; web: an in-pane view with a back chevron inside the two-pane `MessagingWorkspace`. Rows are rebuilt WhatsApp-style: participant avatar (type-icon medallion fallback), an identity line, an event/place context line, preview, time, unread pill; mobile adds swipe-to-archive / swipe-to-mark-unread (`react-native-gesture-handler` legacy `Swipeable`) with a long-press action sheet as the accessible equivalent, web adds a per-row dropdown. Last mode + added chips persist per user (mobile `expo-secure-store`, web `localStorage`, keyed by user id — no cross-account carry-over). **The three role chips show for everyone**, not just event/place owners (an empty "As Organizer" is a contextual empty state). **Migration `20260907100000_messaging_inbox_search_filters` (applied live via MCP, advisor-clean):** `list_conversations` gains `p_search` (ILIKE over the other participant's name + the event/place/conversation title), `p_type`, `p_muted`, and returns resolved `subject_title` + `other_user_id` / `other_display_name` / `other_username` / `other_avatar_*` (single primary other participant, via a lateral join — no N+1 in the transport); it keeps the moderation `not in ('removed','hidden','restricted')` filter from `20260907094000`. New `mark_conversation_unread(p_conversation_id)` RPC rewinds the caller's `last_read_at` to just before the last inbound message (no-op when nothing is inbound); wired through `markConversationUnreadCore`, a `markConversationUnread` web action, and `POST /api/mobile/messages/unread` (`api.messaging.markUnread`, parity guard green — 101 routes). Custom filters are predefined-only (`type` / `muted` / the existing `unread` filter value) — never arbitrary client SQL. **Bottom nav (Home/Search/Tickets/Messages/Account) and the unread tab badge were already in place from the initial messaging merge — unchanged.** **Verification:** `turbo run typecheck` 11/11, `turbo run build` (web + admin) exit 0, Biome clean on all touched files, integration suite **63/63** (3 new `list_conversations` narrowing / resolved-fields / `mark_conversation_unread` tests) against a local stack with the migration applied. ESLint (`next lint`) could not be run — the script is stale (`next lint` was removed in Next 16), a pre-existing tooling gap (Biome is the enforced linter and is clean). **Android emulator device pass done** (dev client, driven via adb): layout/hierarchy, role-scope filtering, the add-filter sheet, chip add/remove + horizontal scroll, the dedicated Archived screen, swipe archive/unarchive round-trip with live list + tab-badge recompute, the long-press action sheet, avatar/context rows, and dark mode all verified; the `expo-router/entry` Metro bundle builds clean (a stronger check than tsc). Merged to `main` (`adc84de`, `--no-ff`); the Vercel prod deploy completed and a **post-deploy device re-test confirmed search filtering and `mark_conversation_unread` working live** (search "Isaac" narrowed the list; mark-as-unread from the long-press sheet restored the unread pill and bumped the tab badge). Not separately re-checked: the Events/Places/Muted chip result sets (same `list_conversations` path as the verified search/role/unread filters; integration-test-covered). iOS not checked (no simulator); the web inbox was not opened in a browser (it's a straight mirror of the mobile hooks/RPC and the build passed).

**Round-2 device-testing fixes (merge `281177b`):** the filter-chip `ScrollView` was ballooning to fill vertical space (chips floated mid-screen) — pinned with `flexGrow:0` + `flex-1` on the list; the tab unread badge and the row unread pills were stretched ovals (react-navigation `<Badge>` / `AppText` auto line-height) — both rebuilt as hand-rolled 18px circles; and **opening a conversation never cleared its unread state on either platform** — `markNewestRead` passed `upTo: message.created_at`, a Postgres timestamptz string that `z.string().datetime()` rejects (so `/messages/read` 400'd) and which, even normalised, truncated below the message's microsecond precision — fixed by dropping `upTo` so the RPC uses `now()`, plus `datetime({ offset: true })` on the schema. Verified on the emulator against the prod DB. **ESLint fixed too:** `apps/web/eslint.config.mjs` used a `FlatCompat` wrapper incompatible with `eslint-config-next@16`, which crashed ESLint outright — rewritten to the native flat configs with the React version pinned (ESLint 10 removed `context.getFilename()`), and `lint:next` re-pointed at `eslint .` (`next lint` is gone in Next 16). ESLint had never actually run here; the ~161-finding pre-existing backlog (mostly `no-explicit-any` and unescaped entities) is demoted to warnings so the command exits 0, and is real debt to triage separately.

> **Revision note (2026-09-06):** Cross-platform fix pass — ticket-purchasing date rules, review-response CRUD, mobile media viewer, no-service booking (branch `fix/purchasing-dates-review-responses-media-booking`). **(1) Ticket-sale window is now stricter and server-authoritative.** New shared helper `@abonten/core/eventPurchaseEligibility` (`resolveOccurrenceState` / `validatePurchaseOccurrence`, unit-tested) is the single source of truth for "can a ticket be sold right now": a ticket may only be sold against a **strictly future** occurrence, so an event that is **currently in progress** (a single-date event past its start, or a multi-date event whose only remaining occurrence is ongoing) is no longer purchasable — previously only a fully-*ended* event was blocked (product decision: walk-up sales are intentionally closed). `validateCheckoutCore` / `registerForFreeEventCore` use it; migration `20260906213323_checkout_rpc_time_guards` moves the same rule **inside** `create_ticket_checkout` (evaluated against `now()`) so a direct RPC call — the function is granted to `authenticated` — can't bypass it. `generateTicket` still issues a ticket if the event ends between payment and fulfilment (payment already taken) but flags `metadata.issued_after_event_end`. Web `EventDateSelector` / `AttendingButton` and mobile `event/[id]` / `buy/[eventId]` / `FreeRsvpCard` recompute the ongoing/ended/next-date state on a 30s tick (`apps/mobile/src/lib/useNowTick`, `AppState`-aware) so a screen left open across an occurrence boundary self-corrects. **(2) Review responses are editable + deletable.** New `@abonten/services/reviews/reviewResponseCore` (`respondTo{Place,Event}ReviewCore` — create OR edit — + `delete{Place,Event}ReviewResponseCore`) is now the single source of truth (`respondToPlaceReviewCore` moved here from `placeBookingsReviewsCore`); trims + rejects empty, caps 500, blocks hidden/removed content and suspended/banned accounts, notifies the reviewer only on the first reply. RLS already permitted the owner/organizer to write **and null** the response columns; migration `20260906214445_review_response_length_guard` adds a DB-level `<=1000` CHECK (the mobile event-review path writes straight through RLS). New web actions `delete{Place,Event}ReviewResponse`; DELETE handler on the mobile place-review route + api-client method; both mobile organizer review screens gain Edit/Delete; mobile event public detail now shows the organizer reply (parity). Admin: `clearReviewResponseCore` (`moderation.remove` + audit) + a "Clear owner/organizer reply" button on the report detail; report target snapshot now includes the response columns. **(3) Shared mobile MediaViewer.** `apps/mobile/src/components/MediaViewer` — one full-screen viewer (pinch-zoom + pan, double-tap, swipe paging, drag-to-dismiss, safe-area chrome, loading spinner + broken-image fallback); `ReviewPhotoStrip` / `PhotoGallery` / `ImageViewer` all route through it. Web `ReviewPhotoLightbox` gained arrow-key nav. **(4) No-service booking.** `requestPlaceBookingCore` now rejects an unpublished / permanently-closed / moderation-hidden place; a serviceless request is still valid (a "general reservation request"). Web `RequestBookingModal` + mobile `BookPlaceSheet` show a "no services available — continue?" prompt (Cancel / Continue) instead of an empty picker when the place lists zero `place_service` rows. All migrations applied live via MCP + `get_advisors` (no new warnings). **(5) Free-RSVP direct-insert bypass closed.** Migration `20260906222054_issue_free_ticket_rpc` adds a `SECURITY DEFINER issue_free_ticket` RPC that does the whole free-RSVP mutation atomically (sales-window re-check against `now()`, free `ticket_type` lookup, atomic 1-unit reserve, ticket + attendance insert); `registerForFreeEventCore` now keeps only QR generation + Cloudinary upload and calls it. `ticket_owner_insert` RLS is **dropped** and `INSERT on public.ticket` **revoked from `authenticated`/`anon`** — nothing needs a client-session ticket insert anymore (paid = `issue_tickets_for_checkout`, free = `issue_free_ticket`, admin/webhook = service role). **(6) Suspended/banned accounts are now enforced.** `setUserStatusCore` revokes every Supabase session on suspend/ban (`auth.admin.signOut` global); the web `updateSession` middleware redirects a signed-in but restricted account off every protected route to a new top-level `/account-restricted` page; `getMobileAuth` returns 403 for a restricted caller (one choke point for every `/api/mobile` route). **(7) Event-detail page banner** ("ended / in progress") was extracted from the server component to a client `EventStatusBanner` that ticks every 30s, so it never lags the CTA on a long-open tab. **Verification:** full integration suite (30 tests incl. the 2 new ones) run green against a local Supabase stack; TypeScript + Biome + `npm run build` for web & admin all pass; **mobile device-verified on an Android emulator** — occurrence-chip gating (past date dimmed + labelled, first future auto-selected), the no-service booking prompt → serviceless form, and the full MediaViewer flow (open, safe-area chrome, progressive load, swipe paging, drag-to-dismiss); a real gesture bug found on device (`MediaViewer` pan swallowed horizontal swipes) was fixed. **Not verified:** MediaViewer pinch-zoom (adb can't synthesise a pinch), the mobile organizer review-response Edit/Delete UI, `useNowTick` real boundary transitions, the live Paystack money path, and iOS.

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
  - `apps/web/src/app/api/notifications/deliver/route.ts` — called only by the `notification-delivery` pg_cron job (token check) to send reward pushes and emails (§27.10).
  - `apps/web/src/app/api/notifications/unsubscribe/route.ts` — RFC 8058 one-click unsubscribe (POST only) from a reward email's `List-Unsubscribe` header (§27.11).
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
- **Check-in**: `checkInTicketCore` flips a ticket `active ↔ used` (organizer-scoped, 403 unless the caller owns the event). It now accepts **either** the ticket UUID (the attendee-list toggle on web + mobile) **or** the `TKT-XXXXXXXX` code (2026-09-06). Mobile added a **camera QR scanner** — `apps/mobile/src/components/organizer/TicketScannerSheet.tsx` (`expo-camera` `CameraView` + `useCameraPermissions`), opened from the organizer attendee screen; it parses the `TKT-…` code out of the scanned QR (`JSON.stringify("<base>/verify/<code>")`) and calls the same check-in path. `expo-camera@~57.0.4` + its config plugin were added — **needs a dev-client / EAS rebuild** before it runs on device. Web still has manual list check-in only. Note: the `<base>/verify/<code>` URL the QR encodes has no matching web route (pre-existing — scanning it in a generic reader 404s; only the in-app scanner uses it).
- **Promo codes**: `getPromoCode`, `InsertPromoCodeUsage`.
- **User profile & social**: `/user-account`, `/user-account/[username]`, `/(userPage)/user/[username]/{favorites,posts,reviews,places,bookings}`; actions `getUserDetails`, `getUserProfileDetails`, `updateUserDetails`, `getUserPosts`, `getUserFavoritePosts`, `getUserReviews`, `postReview`, `getUserRating`, `getUserHighlights`, `uploadHighlight`. **`bookings` + `favorites` are private/self-scoped** — the underlying actions ignore `:username` and always read the signed-in viewer's own rows; both pages `notFound()` when `:username` isn't yours (added 2026-09-06) so the URL can't render your data under someone else's name. `posts` / `places` / `reviews` are genuinely per-username public views.
- **Social scope — what does NOT exist** (verified 2026-09-06, no tables and no code): there is **no post-comment or reaction/like system**. User-generated content is (a) **highlights** — story-style photo/video, with owner delete + viewer report; and (b) **reviews** — event/place/user reviews with a single owner reply and viewer report. "Replies" in the product = the review owner-response only. If threaded comments or reactions become a requirement they are net-new (schema + service + UI), not a wiring gap.
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

10. **Migration ledger vs. repo — RE-AUDITED 2026-09-08 against a real from-scratch replay; the earlier, alarming version of this entry was WRONG.** The repo now replays cleanly and reproduces production's messaging behaviour exactly. Method: `npm run test:db:up` on a wiped volume (162 migrations applied from scratch), then a normalized object-by-object diff against production (`sderrexhawjbmsugndcq`). **Correction:** an earlier note here claimed `messaging_inbox_search_filters_moderation_fix` was "the only definition of production's current `list_conversations`" and that a replay would build a different function. **That is false** — `list_conversations` hashes IDENTICALLY on both sides, as do all 13 messaging functions, once SQL comments are normalized away (the Supabase MCP apply path strips comments from function bodies, which is what made the raw hashes differ). Of the 9 migrations applied in production with no repo file, **8 had already been folded into repo files** — proven by comparing normalized bodies of all 111 comparable functions, only 2 of which differ at all. **The 9th was real and is now fixed:** `20260831122456_add_device_token_for_push` was genuinely missing, so `public.device_token` did not exist in a from-scratch replay at all, while `@abonten/services/notifications/deviceTokenCore.ts` + `sendPushNotification.ts` depend on it — a fresh environment could not register a push token. Restored verbatim from production's own ledger (`supabase_migrations.schema_migrations.statements`) at its true version; a subsequent full replay confirms the table, its RLS, 1 policy, 3 indexes and 6 columns now match production exactly. **After that fix, `information_schema.columns` matches production EXACTLY (1170 columns, identical fingerprint), as does the realtime publication.** Remaining, fully-explained, all NON-messaging: (a) **`place_promotion` / `place_promotion_checkout` / `place_promotion_tier` have RLS DISABLED in a replay** (production: enabled, 6 policies) because `scripts/test-db/setup-local-test-db.mjs` neutralizes an RLS block in `20260825105513_enable_rls_places_batch3.sql` that references tables not created until `20260826090000` — a real ordering defect, so **a brand-new environment built from this repo would ship place-promotion tables with no row-level security**; (b) a **stale `get_filtered_events(… p_event_type text …)` overload** survives a replay because `20260902120000_add_public_attendance_count_rpcs.sql` re-creates the pre-multi-type signature *after* `20260826095846` correctly dropped it (production has only the `text[]` form, so a replay has 2 overloads where production has 1); (c) `user_info_id_key` persists in a replay (production dropped it; the harness neutralizes that DROP as documented-irreducible) — accounts for the +1 constraint and +1 index; (d) `pgsodium.key` / `vault.secrets` triggers exist only on hosted Supabase, not the local CLI stack — not repo-owned. **(a) and (b) were FIXED 2026-09-08** by forward-only migrations rather than by editing history: `20260908215345_place_promotion_rls_replay_fix` re-enables RLS and recreates all six policies after the tables exist (policy bodies copied verbatim from production's `pg_policy`; a no-op there, and the resulting policy set now hashes IDENTICALLY to production), and `20260908215414_drop_stale_get_filtered_events_text_overload` drops the resurrected signature. After both, a from-scratch replay has **114 functions (was 115) and 201 policies (was 195) -- the same counts as production** -- with `information_schema.columns` and the realtime publication still byte-identical. Only (c) `user_info_id_key` and (d) the pgsodium/vault platform triggers remain, both documented above as not repo-owned.

11. **⚠️ OPEN (found 2026-09-08, device QA): plain text messages sent from mobile were stored as `message_type='file'`.** `apps/mobile/src/components/messaging/Composer.tsx`'s send path read `anyAudio ? "audio" : anyImage ? "image" : "file"` — with no `"text"` branch, a typed message with no attachment fell through to `"file"`. Pre-existing on `main`, not a branch regression. It silently disabled two shipped features, because both are gated on `message_type === "text"`: **emoji-only large rendering** (`classifyEmojiOnly`) and the **Copy action** in the message context menu; it also made a reply preview of a text message read "Attachment". Fixed (`toUpload.length > 0 ? "file" : "text"`) and verified on-device end-to-end — a newly sent message now persists as `text`. **The existing rows are NOT repaired:** at the time of the audit production held 11 such rows, all in one test conversation, and all 11 `file`-typed messages were mistyped (there are no legitimate file messages yet). **RESOLVED 2026-09-08** by `20260908215129_backfill_mistyped_text_messages` (applied to production on the owner's instruction). The predicate is self-limiting -- a row qualifies only with ZERO attachments -- and was dry-run first: 11 rows matched, 0 `file` rows with an attachment were at risk, 0 would have been left contentless. Production now reports 0 mistyped rows and 0 `file` messages, and emoji-only rendering plus the Copy action were confirmed working on-device afterwards.

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

### 8.1 Email OTP sign-in (added 2026-09-08)

A third end-user sign-in option — **"Continue with email"** — alongside Google and phone. **Email one-time code only; no magic link** (rationale + full reference: [docs/architecture/email-auth.md](docs/architecture/email-auth.md)).

- **Mechanism:** `supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } })` (no `emailRedirectTo` → no redirect surface, no token in any URL) → 6-digit code email → `supabase.auth.verifyOtp({ email, token, type:'email' })`. **Supabase owns the entire code lifecycle** (issue, hash, expiry, single-use, per-IP verification cap). The app generates no token and stores no email-OTP state (unlike phone, which needs `phone_otp_state` because Hubtel owns that lifecycle).
- **Shared core:** `@abonten/core/emailOtp.ts` (`EMAIL_OTP_CODE_LENGTH = 6`, `isLikelyEmail`, `normalizeEmail`, `maskEmail`, enumeration-safe copy) + `@abonten/services/profile/emailAuthCore.ts` (`requestEmailOtpCore` / `verifyEmailOtpCore` — validation, app-level per-email + per-IP send cap via the existing `consume_rate_limit` RPC, enumeration-safe result mapping).
- **Web:** `AuthModal.tsx` gains the email view; `src/actions/requestEmailOtp.ts` (send, anon client) + `src/actions/verifyEmailSignIn.ts` (verify on the SSR cookie client → cookies on the response, then a full-page nav, exactly like phone) + the idempotent profile-completion nudge.
- **Mobile:** `app/(auth)/email.tsx` (enter address) → `app/(auth)/verify.tsx` extended with a `channel: "phone" | "email"` param. Send goes through `POST /api/mobile/auth/email/request` (rate-limit + enumeration guard server-side); **verify is client-direct** (`supabase.auth.verifyOtp` on the native client → session persists to secure-store natively), the same asymmetry as mobile Google sign-in.
- **Account linking:** relies on Supabase's own semantics — a Google user who later uses Email OTP with the same (verified) address is **auto-linked to one account**; a phone-only user unifies via **Settings → Security → Add email** (`updateUser({email})` → `verifyOtp({type:'email_change'})`, runs on the live session, no sign-out). No custom "same email ⇒ merge" logic anywhere.
- **Settings email flow unified onto OTP** (web `SecurityInputFields.tsx` + mobile `settings/security.tsx`): the old confirmation-**link** flow (which dead-ended on `/auth/callback`, a route that only parses `?code=`) is replaced by the same 6-digit `OtpInput` + `verifyOtp({type:'email_change'})`.
- **No migration, no new env var.** The on_auth_user_created trigger already makes exactly one `user_info` row for a new email user. Owner-side config is required before production: **custom SMTP (Resend) in Supabase Auth settings** (the built-in sender caps at ~2–4/hour) and adding `{{ .Token }}` to the "Magic Link" + "Confirm email change" templates — see the doc.
- **Admin app is untouched** — stays Google-only + `ADMIN_EMAIL_ALLOWLIST` + step-up.

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
- **Resend** — transactional email (ticket purchase receipts). `RESEND_API_KEY`. **Also the intended custom SMTP for Supabase Auth emails** (email-OTP sign-in codes, added 2026-09-08) — configured in the Supabase dashboard's Auth → SMTP settings, NOT in any app env; the built-in Supabase sender's ~2–4/hour cap makes it unusable for production auth. See [docs/architecture/email-auth.md](docs/architecture/email-auth.md).
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
- **Mobile keyboard handling (2026-09-06)**: every full-screen form in `apps/mobile` scrolls through the shared `KeyboardAwareScrollView` primitive (`@abonten/ui-native`) — a plain `ScrollView` with `automaticallyAdjustKeyboardInsets` (iOS) + generous bottom padding + `keyboardShouldPersistTaps="handled"` + drag-to-dismiss, no native dependency. Bottom sheets are the exception: `adjustResize` doesn't apply inside a RN `<Modal>`, so `<Sheet>` keeps its own `KeyboardAvoidingView` (now `behavior="padding"` on **both** platforms — Android was previously falling through to the inert `adjustResize` path and hiding footer inputs behind the keyboard).

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

**Explore filtering (shared, 2026-09-06)**: `@abonten/core/exploreFilters` is the single framework-free definition of the Explore Filter modal's field set (`EventFilters` / `PlaceFilters`) and its client-side predicates (`filterEventList` / `filterPlaceList` / `eventMatchesFilters` / `placeMatchesFilters`). Consumed verbatim by the web Explore page (`EventsTabContent` / `PlacesTabContent`) and the native Explore screen (via `apps/mobile/src/features/discovery/exploreFilters.ts`, which re-exports it and adds RN-only describe/clear/option-list helpers). Both platforms now place the category-chip row **directly under the Events/Places tabs, above every curated section** (Featured / Around You / Happening This… / Top Rated), and the active filter drives those curated sliders as well as the "All" list — previously the curated sliders ignored the filter.

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
  post-deploy. Auth is the shared `OBSERVABILITY_INGEST_SECRET` in the `x-observability-secret`
  header (query `?secret=` still accepted for a manual curl). **`run_scheduled_health_check()`
  self-reports** (migration `20260907091900`): each tick it reconciles the *previous* dispatch's
  `net._http_response` and writes a synthetic `check_key='self'` row — `ok=true` on 2xx, else
  `ok=false` with `{http_status, reason}` (e.g. a 401 = "endpoint rejected the shared secret —
  check `OBSERVABILITY_INGEST_SECRET` on the web deployment"). So a broken pipeline shows on the
  Admin Monitor as **Endpoint reachability — down** instead of an empty panel. The panel is only
  truly empty if the cron has never run once. (Route env-var fix same migration wave: the probe
  was reading `HUBTEL_CLIENT_ID/SECRET` + `CLOUDINARY_CLOUD_NAME`; corrected to
  `HUBTEL_API_CLIENT_ID/SECRET` + `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — those two probes were
  silently skipped before.)
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
- ~~Mobile report affordance parity~~ **DONE (2026-09-06)**: the native app previously only
  surfaced `ReportSheet` on place detail (place + place_review). It now also covers **event
  detail** ("Report this event"), **event reviews** (per-review "Report"), **user profile**
  (header `⋯` → report user), and the **native `HighlightViewer`** (non-owner `⋯` → "Report",
  with the sheet hoisted into `HighlightsRow` so it isn't nested inside the viewer's `Modal`).
  All route through `POST /api/mobile/reports` → `submitReportCore` (server-derived reporter id,
  dedupe, rate-limit) — no client-trusted identity.
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

#### 23.14b Automated payout transfers (Paystack Transfers) — 2026-09-06, **flag-gated OFF**

Closes the "payouts don't actually move money" gap — but disabled by default so production
behaviour is unchanged until the owner opts in.

- Migration `20260906125504_payout_transfer_tracking` (applied live via MCP) adds
  **additive nullable** columns to `payout`: `transfer_code`, `transfer_recipient_code`,
  `transfer_status` (`none`/`pending`/`success`/`failed`/`reversed`, default `none`),
  `transfer_failure_reason`, `transfer_initiated_at`; partial unique index on `transfer_code`.
- `@abonten/services/payments/gateway/paystackTransfer.ts` — `paystackTransfersEnabled()`
  (`process.env.PAYSTACK_TRANSFERS_ENABLED === "true"`), `resolvePaystackDestination()` (maps the
  `payout_account.provider` free-text to a Paystack `/bank?currency=GHS` code — throws a
  user-safe error rather than guessing), `createTransferRecipient()` (`POST /transferrecipient`),
  `initiatePaystackTransfer()` (`POST /transfer`, `source: "balance"`).
- `sendPayoutAdminCore` (`financeActionsCore.ts`) + `sendPayout` action + `sendPayoutSchema` +
  `finance.payout` permission + step-up. With the flag unset it returns `409` and does nothing.
  With it set it initiates a real transfer on a `processing` payout, stamps
  `transfer_code`/`transfer_status='pending'`, audits `finance.payout.send` — and **does not**
  touch `payout.status`.
- The Paystack webhook (`api/paystack/webhook`) now handles `transfer.success` /
  `transfer.failed` / `transfer.reversed`: look the payout up by `transfer_code` where
  `transfer_status='pending'` (idempotent), set `transfer_status`, and call `admin_settle_payout`
  (`completed` on success, `failed` otherwise) so the ledger releases/holds correctly.
- **To activate**: enable Transfers on the Paystack account (secret key with the transfer
  permission), set `PAYSTACK_TRANSFERS_ENABLED=true` on `apps/web` (webhook) + `apps/admin`
  (action), add a "Send via Paystack" button on `/finance/payouts` (server action `sendPayout`
  exists; the UI button is not built yet). **Not verified against live Paystack** —
  transfer-recipient / transfer / webhook shapes are coded to Paystack's docs, not exercised.
- Verified: `turbo typecheck` 11/11; `next build` apps/web + apps/admin green; biome clean;
  `get_advisors` — both new RPCs are `service_role`-only, `search_path`-pinned, not flagged.
  Rolled-back live SQL smokes: `admin_settle_payout` completed (status flips, hold retained) /
  failed (one `payout_release` of `+amount`) / re-settle raises; `admin_create_payout` rejects a
  foreign account, a non-positive amount, and an over-balance draw. **The refund path itself was
  NOT re-exercised live** (it calls Paystack) — the wrapper adds only the permission check +
  audit over the already-verified `issueRefundCore`.

---

## 24. Read-Path Caching & Optimistic Reconciliation (performance pass, 2026-09-07)

A platform-wide performance audit established the baseline below and changed
the client caching architecture. Measurements are from production
(`pg_stat_statements`, `EXPLAIN ANALYZE`) and the repo itself, not estimates.

### 24.1 Baseline: where the time actually goes

- **The database is not the bottleneck at current volume.** Production holds
  18 events, 4 places, 26 tickets, 11 messages, 24 notifications. The top
  entries in `pg_stat_statements` by total time are all infrastructure:
  pg_net's response-queue cleanup (43.3M calls), `cron.job_run_details`
  bookkeeping (80.5K runs, 232s), and `pg_timezone_names` (618 calls at a
  217ms mean).
- **`get_nearby_events` is fast, but only when warm.** First call in a backend
  costs ~142ms (1,383 shared buffer hits, PostGIS library + plpgsql plan
  load); measured warm over 20 iterations it is **0.276ms**
  (`get_nearby_places`: 0.470ms). The 69–145ms means recorded in
  `pg_stat_statements` are therefore dominated by per-connection cold-start,
  not query work. **Do not "optimise" these queries or add indexes for it** —
  the fix, if it is ever worth one, is connection reuse/pool warmth.
- **The real cost was client-side**: mobile had 127 `invalidateQueries` calls
  against 5 `setQueryData` and 2 `onMutate`. The web `QueryClient` was
  constructed with **no options at all** — library defaults meant
  `staleTime: 0` plus `refetchOnWindowFocus`, so every query refetched on
  every remount and every tab focus.

### 24.2 Inbox: targeted reconciliation instead of invalidation

`mark_conversation_read`, `mark_conversation_unread` and
`set_conversation_state` all write to `conversation_participant` **only** —
never to `conversation`. The inbox realtime channel watches `conversation`, so
it never fires for them, which means the blanket
`invalidateQueries(messagingKeys.lists())` those mutations ran was the *sole*
mechanism refreshing the inbox — and it refetched **every loaded page of every
cached (filter × roleScope × search × type × muted) view** just because a
thread was opened. On web this is always a visible refetch, because the
two-pane workspace keeps `ConversationList` mounted beside the open thread.

Replaced by pure transforms in
[packages/core/src/messagingInboxCache.ts](packages/core/src/messagingInboxCache.ts)
(11 unit tests), applied through per-app plumbing
(`apps/{mobile/src/features,web/src}/messaging/.../inboxCache.ts`):

- read / unread / mute are optimistic with snapshot rollback on failure;
- archive removes the row from the list it is leaving immediately;
- the tab/nav badge moves by the row's own unread count rather than refetching
  the count endpoint;
- realtime `conversation` UPDATEs apply the `last_message_*` payload directly
  and re-seat the row at the top — the same result a refetch produces, with no
  round-trip. Invalidation remains the fallback for the two cases a client
  genuinely cannot synthesise: a conversation not present in the cached list,
  and a brand-new one.

Every transform returns the **identical object reference** when nothing
matched, so views that do not hold the row notify no observers.

### 24.3 Render stability

`ConversationRow` and `MessageBubble` were already wrapped in `memo`, but the
memo was inert: `renderItem` built fresh inline closures for every callback on
every render, so every prop was a new reference and every visible row
re-rendered on any list state change. `renderItem` and its handlers are now
stable (`useCallback`), with the item bound inside the row component.

### 24.4 Web QueryClient defaults

`staleTime: 30_000` (matching native), `gcTime: 10min`, `refetchOnWindowFocus:
false`, and a retry predicate that does not retry terminal errors (401/403/404,
expired JWT) — those previously burned ~7s of backoff before a screen could
show its error state. Money-path freshness is unchanged and explicit: the
checkout modal keeps its own 20s ticket-availability poll, and checkout/payment
state is re-validated server-side at the write, never trusted from cache.

### 24.5 Known scalability limits (found, not changed — need a decision)

- **`get_nearby_events` builds its LATERAL aggregates before `LIMIT`.** The
  `matched` CTE computes min-price, the occurrences JSON and a `MIN(starts_at)`
  sort key for *every* event inside the radius, then takes 20. Fine at 18
  events; quadratic-feeling once a city has thousands. It also returns
  `description`, the full `location` geography and every occurrence to a feed
  that renders none of them (§12 payload reduction).
- **Rating averages are computed in JS over unbounded fetches** in
  `getEventRating`, `getPlaceRating`, `getUserRating`, `getPlaceBySlug` and
  `catalogAdminCore` (×2) — every approved rating row is transferred to
  compute a count and a mean. The reason is now confirmed: **PostgREST
  aggregate functions are disabled on this project** (a live request returns
  `PGRST123: Use of aggregate functions is not allowed`), so `.select("rating.avg()")`
  is not available. Fixing it needs either `db-aggregates-enabled` turned on or
  a `SECURITY DEFINER` aggregate RPC — both owner decisions.
- **Highlight videos are delivered untransformed.** Both
  `apps/web/src/actions/uploadHighlight.ts` and
  `apps/mobile/src/features/profile/useHighlights.ts` deliver the raw uploaded
  clip with only `so_`/`eo_` trim offsets — no `q_auto`, no width cap. A
  phone-shot 1080p/4K clip streams at full source bitrate. Adding a transform
  is a one-line change per platform but risks Cloudinary returning `423 Locked`
  while it derives the video on first request, so it wants an eager/streaming
  profile at upload time plus a device test before shipping.

---

## 25. Deferred Performance Items, Resolved (2026-09-07)

The three items 24.5 left open are now done. Everything below is measured, not
estimated; the benchmark harness ran against a **local** Supabase stack, never
production.

### 25.1 `get_nearby_events` scalability

Benchmarked by generating events in a ring around Accra on the local stack and
timing 20 warm calls per data point. The old implementation degraded linearly
with the number of candidates in the radius while always returning 20 rows:

| candidates in radius | before | after | speedup |
| --- | --- | --- | --- |
| 18 (production today) | 0.276 ms | 0.258 ms | ~1x |
| 1,093 | 7.08 ms | ~1.7 ms | ~4x |
| 9,055 | 66.29 ms | ~14 ms | ~4.5x |
| 44,454 | 375.82 ms | 94.99 ms | 4.0x |

Root cause was ordering: the old `matched` CTE ran three probes against
`event_occurrence` (a correlated `MIN`, an `EXISTS` and a `NOT EXISTS`), a
`ticket_type` aggregate and a `json_agg` of occurrences **for every event in
the radius**, then applied `ORDER BY` + `LIMIT`. Now `candidate` narrows to
`(id, sort_key)` with one index-only probe, `page` applies the cursor and the
limit, and the wide row + expensive aggregates run only for that page.

Two indexes, both justified from the plan rather than added speculatively:
`idx_event_geo_discoverable` (partial GIST over exactly the discoverable rows
— confirmed chosen by the planner for a 2 km radius) and
`idx_event_occurrence_event_ends_starts` (makes the probe index-only; it was
157k of the old plan's 247k buffers). Buffers for the candidate stage fell
247,478 → 147,175.

`description` was dropped from the returned columns — `UserPostType` does not
declare it and no card renders it, while the rows average over a kilobyte of
text. `location` was **kept**: `EventsMapView` parses it with `parseWKBHex`.

**Security is unchanged and was verified, not assumed.** Still SECURITY
INVOKER, same `search_path`, same grants, same visibility predicates. A
harness compared old vs new over **290 page-comparisons** spanning 7
geographies / radii / page sizes with full keyset pagination walks, checking
ids, ordering and payload: **0 mismatches**.

### 25.2 Rating aggregation

The audit found six JS-aggregation call sites; there were **twelve** — four
more in mobile (`useEventDetail`, `usePlaceDetail`, `usePublicProfile`,
`useProfileTabs`) and the batch one in `getUserFavoritePlaces`. `useProfileTabs`
was the worst: its two list queries embedded `place_review(rating, status)`,
pulling every review row for every place on the page.

PostgREST aggregates stay **disabled** — enabling `db-aggregates-enabled`
would let any anon caller aggregate over every readable table, which is a
materially wider surface on a public consumer app. Instead: four
purpose-specific SECURITY INVOKER RPCs (`get_event_rating`, `get_place_rating`,
`get_user_rating`, `get_place_ratings`) plus covering partial indexes, behind
one shared implementation (`@abonten/core/ratings` for the pure parts,
`@abonten/services/reviews/ratingsQuery` for the client-taking wrappers).
`apps/mobile` calls the RPCs directly, since it must not import
`@abonten/services`.

Two real defects fixed on the way:
- **No call site filtered `moderation_state`**, so a review an admin had
  hidden or removed still counted toward the average. RLS masked that for anon
  callers but *not* for the admin console's service-role client, so admin saw
  a different rating than the public did.
- The admin aggregates capped at `.limit(5000)`, which silently returns a
  **wrong** average past 5000 reviews rather than failing.

### 25.3 Highlight video delivery

Measured against this project's own Cloudinary account before designing
anything — and the measurements changed the design twice:

| source | sync derive | result |
| --- | --- | --- |
| 576x1024, 4.79 MB, 1.29 Mbps | 16,960 ms | 18.7% smaller |
| 496x480, 0.36 MB, 0.31 Mbps | 1,810 ms | 40.9% smaller (of 0.36 MB) |
| 576x576, 0.57 MB, 0.60 Mbps | 2,337 ms | **9.1% LARGER** |

1. Derivation is far too slow to block a request on (17 s for a 4.8 MB clip,
   against a 90 MB upload ceiling), so it has to be asynchronous.
2. **Blanket re-encoding is not a win.** An already-small, already-low-bitrate
   phone clip can come out bigger. So `@abonten/core/videoDelivery`
   decides per source: re-encode only when the long edge exceeds 1280 px or
   the average bitrate exceeds 2.5 Mbps — the 1080p/4K phone clips the audit
   was actually worried about. All three clips above are correctly skipped.

Pipeline: upload (unchanged) → conditional eager derivation through the
Cloudinary Admin API → `highlight.playback_url` stored beside `media_url` →
players prefer `playback_url` and fall back to `media_url` on a load error.
That fallback is what makes the `423 Locked` problem structurally impossible:
`media_url` is always the original and always immediately playable.

**The upload signature is deliberately untouched.** The 2026-09-05 incident in
§0 (an unrecognised signed param broke 100% of uploads everywhere) is exactly
why the derivation is requested separately, server-side, instead of as an
`eager` upload param.

`apps/mobile` cannot hold the Cloudinary secret and must not import
`@abonten/services`, so it calls `POST /api/mobile/highlights/playback`, which
runs the same shared service and re-checks that the `publicId` sits in the
caller's own upload folder.

**A device test caught a real bug in the first version of the fallback.**
`player.replaceAsync()` does **not** reject for a source that 404s -- expo-video
resolves the promise and ExoPlayer reports the failure asynchronously on its
own thread (`ExoPlaybackException: Source error / Response code: 404`). The
original `try/catch` around `replaceAsync` therefore never fired and the viewer
sat on a spinner forever. Verified on an Android emulator by pointing
`playback_url` at a deliberately broken URL. The fallback now lives in the
player's `statusChange` listener (`status === "error"`), which was re-tested the
same way: the 404 is still logged, the viewer swaps to `media_url`, and the
video plays. Playback straight from a real optimised rendition was then
confirmed with zero ExoPlayer errors.

---

## 26. API Latency Pass (2026-09-10)

Follow-up to the production-readiness audit's performance table (Profile
median 1,375 ms, Organizer dashboard 1,113 ms, Messages inbox 1,083 ms).
Every figure below was measured, not estimated.

**Where the time actually went.** Not the database. Every query behind the
"slow" endpoints executes in under 25 ms warm (`user_profile_details` 0.3 ms,
`list_conversations` 16 ms, the five dashboard RPCs ~76 ms combined). The cost
was geography: Supabase runs in **`eu-west-3` (Paris)** and the Vercel
functions ran in **`iad1` (Virginia)** — confirmed from the deployment's
`regions` and the `x-vercel-id` header — so every request paid a transatlantic
round trip for `auth.getUser()` and again for the handler's query, on top of
the edge hop from `cpt1` (Cape Town) to Virginia.

**Changes**

1. **Function region pinned to Paris.** `apps/web/vercel.json` and
   `apps/admin/vercel.json` set `"regions": ["cdg1"]`, the Vercel region in
   the same city as the database. Both Server Actions and the `/api/mobile`
   routes benefit. Hobby plan permits one region.

2. **Discovery RPCs re-plan ~3× cheaper.** `get_filtered_events` showed
   min 0.1 ms / mean 165 ms / max 2.5 s over 510 production calls on a table
   of 19 events — a plan-cache-miss profile under Supavisor's transaction
   pooling. The plan was expensive because the functions ran as the caller,
   so the planner inlined the RLS policy of every joined table; the
   public-read policies on `event_occurrence`, `ticket_type`, `event_review`
   and `attendance` all re-check "parent event is published", and the
   `get_filtered_events` plan carried ~85 sub-plans, mostly that lookup
   repeated. Migration **`20260910163552_discovery_plan_cost_and_dashboard_aggregate`**
   makes `get_filtered_events`, `get_nearby_events`, `get_nearby_places`,
   `get_filtered_places`, `get_active_place_promotions`,
   `get_events_in_window` and `get_similar_events` `SECURITY DEFINER`
   (`search_path` pinned; none read `auth.uid()`; each already restricts its
   top-level rows to published/non-archived/non-hidden, which is exactly the
   condition the child policies re-derived — no row RLS would hide is
   exposed) and collapses `get_filtered_events` to one lateral per table
   instead of four scans of `event_occurrence`. Measured with `DISCARD PLANS`
   before every call on the local stack (identical hardware, same data):
   `get_filtered_events` 5.3 → 1.9 ms per re-plan, `get_nearby_places`
   2.1 → 0.7, `get_similar_events` 2.2 → 0.6; warm execution on production
   5.6 → 1.0 ms. The security advisor now lists these under "anon can
   execute SECURITY DEFINER function" — expected: they are the public
   discovery endpoints and `anon` was already granted.
   **`get_similar_events` was also still returning archived events** (missed
   by `20260909130000`); fixed in the same migration and covered by a new
   integration test.

3. **`get_nearby_events` returns availability inline.** Two appended columns,
   `attendance_count bigint` and `ticket_types json` (`[{price, currency,
   quantity}]`, `quantity` = remaining stock, null = unlimited). The mobile
   Explore screen was making a second serial round trip
   (`get_event_attendance_counts` + a `ticket_type` read) for exactly this
   after every nearby fetch; `withEventAvailability` now uses the inline
   figures and only fetches for rows that lack them. The web `getNearByEvents`
   action dropped its extra attendance query the same way.

4. **Organizer dashboard: one round trip.** New `get_organizer_dashboard(
   p_start, p_end, p_prev_start, p_prev_end, p_bucket) → jsonb` runs the
   seven existing RPCs (overview ×2, timeline, performance, upcoming,
   attention, activity) inside one SQL call; `authenticated` only, `anon`
   revoked (verified: `42501`). `fetchOrganizerDashboard` in
   `organizerDashboardQuery.ts` backs `GET /api/mobile/organizer/dashboard`,
   whose payload gains `overview` (additive — `OrganizerDashboardWidgets.overview?`).
   The mobile screen reads it from the single query and falls back to the
   separate `overview()` request only when talking to an older deploy.
   `GET /api/mobile/organizer/overview` and the seven web actions are
   unchanged. 30–40 ms warm for all seven sections.

**Not changed, on purpose.** The JWT is HS256 (symmetric), so
`supabase.auth.getUser()` must stay a network call. Migrating the project to
asymmetric signing keys would let `getClaims()` verify locally and remove
one round trip from every authenticated request — but it would also mean a
revoked session's access token stays valid until it expires (up to an
hour), which today's `getUser()` catches immediately (verified: sign-out
takes 5 sessions → 0 and the next call 401s). That is the owner's trade to
make, not this pass's.

**Also verified.** `app_request_metric` was empty for 14 days because the
mobile client samples 0% in `__DEV__` and no production build has run yet —
a test beacon ingested fine (`202`, row landed). Verification: typecheck
11/11, web + admin builds clean, integration **111/111** (+4), Biome clean.

**Measured after deploy (medians, same harness, same machine):** 401 floor
372 → 307 ms; Profile 799 → **373**; Notifications 679 → 363; Messages inbox
877 → **362**; Organizer dashboard 1,453 → **391**; Organizer events 873 →
379; Checkout pending 941 → 390. The 5–6 s outliers disappeared (worst
sample 648 ms). Every authenticated route now sits within ~60–100 ms of the
unauthenticated floor; what remains is the client's own edge round trip.

### 26.1 The audit's six "reported, not changed" findings — now changed

Migration **`20260910165605_audit_deferred_findings`** (applied live; local
suite green) plus code:

1. **"Top-rated organizers" is now ranked by rating.** `get_nearby_events`
   gains `organizer_avg_rating` / `organizer_rating_count` (one pass over
   `review` for the page's distinct organizers, `get_user_rating`'s
   visibility predicate). `filterEventsByWindow(…, "top-rated-organizers")`
   in `@abonten/core` keeps events whose organizer has ≥1 visible review,
   best-rated first, ties by review count; rows that carry no rating field
   at all pass through unchanged so a stale page never blanks the slider.
   Both apps' sliders and the web "see all" page use it. 5 unit tests.
2. **A failed message survives leaving the screen.** Rows that reach
   `failed` are written per conversation to the document directory
   (`features/messaging/failedOutbox.ts`) and restored as failed rows with
   Retry on the next visit; removed on successful retry, discard, or when
   reconcile finds the server has the message after all. Still never
   auto-retried.
3. **Wizard field errors clear as you type.** Each Basics text setter clears
   its own error (`clearTextError`), so a corrected field stops being red
   immediately instead of on the next Next press.
4. **Legacy avatars can be restored.** `enforce_avatar_public_id_owner` also
   accepts a path present in the user's own `user_image_history`; new
   uploads are still forced under `user_profiles/<id>/`. The six legacy
   avatars in production were backfilled into history. Verified live: a
   history path is accepted, a foreign path still raises `23514`.
5. **`GET /messages/<id>/messages` answers 404 for a non-participant**, the
   same as the detail read. `fetchMessagesPage` checks membership
   (`is_conversation_participant`) only when a *first* page comes back
   empty, so the common path costs nothing. Integration test added; the
   web action shares the body.
6. **Place list ratings exclude hidden/removed reviews**, matching
   `get_place_rating` — `get_filtered_places`, `get_nearby_places`,
   `get_active_place_promotions`. Verified live: list and detail averages
   agree on every published place.

Unit **164/164** (+5), integration **112/112** (+1), typecheck 11/11.

### 26.2 The audit's untested flows — driven on device (2026-09-10)

Every flow the audit had marked *Partial* or *Not tested* was driven end to
end on the Android emulator against production, with server-side
verification after each step and zero JavaScript errors across the pass.
Defects found were fixed in the same pass.

- **Event drafts (save → resume → publish).** Save wrote flyer + basics;
  the drafts list showed both drafts with relative times; delete used the
  confirm dialog; resume restored flyer/title/description/category; the
  wizard then went through calendar (past days disabled), Places
  autocomplete, tickets and review to a live event that appeared in both
  discovery RPCs with `attendance_count` and `ticket_types` inline and
  rendered "0 going · 5 spots left" on the card. **Two defects:** (1) the
  draft was **left behind after publishing** — the web action sent
  `draftId` to `postEventCore` but the mobile path dropped it at all three
  hand-offs (wizard `submit`, `EventCreateBody`, the route); wired through.
  (2) "Save as draft" saved a **completely empty draft** (one sat in
  production as "Untitled draft"); the wizard now exposes `hasDraftContent`
  and the button stays disabled until something has been entered.
- **Wallet (add / set default / remove).** Mobile-money add, "Make default"
  moving the DEFAULT badge, and "Remove" via confirm all verified against
  `payment_method`. **Two defects:** momo numbers were stored as typed
  (`0241234567`) on mobile but as E.164 on web — `addPaymentMethodCore` now
  normalises through `normalizePhoneNumber`; and re-verifying the same card
  saved an identical row each time (production held two "visa ···· 4081"
  rows) — the core now returns the existing active card instead. 4 unit
  tests (`paymentMethodCore.test.ts`).
- **Payout accounts + withdrawal.** Added a mobile-money payout account,
  requested a GHS 1 withdrawal to it: `payout` row `processing`,
  `payout_hold −1.00`, available 484 → 483, `transfer_code` null (the
  transfers flag is off, so no Paystack call), history lists it. The same
  E.164 normalisation was applied to `payoutAccountCore`.
- **Card verification.** "Start card verification" opens Paystack Checkout
  ("Pay GHS 1", test mode) in a Custom Tab; abandoning it returns to the
  app with "Couldn't verify your card. Please try again." — correct.
  Completing it (Paystack's test checkout offers one-tap "Success" /
  "Declined" outcomes, then "Pay GHS 1"; the callback lands on
  abontenhub.com, close the tab to return) ended in "Card added." and — with
  the de-duplication deployed — left the active card count at two rather
  than inserting a third identical row.
- **Highlights.** Two gallery photos posted from the profile composer →
  two `highlight` rows in one group under the owner's Cloudinary folder.
- **Place creation.** Five-step wizard (cover, gallery, basics with
  autocomplete, hours, review) → published place present in both place
  RPCs, 7 opening-hours rows, correct "Closed" state at 5:58 PM against
  9–5 hours.
- **Place claiming.** Deep-linked to another user's place, submitted a
  claim with a reason and a photo → `place_claim_request` pending with the
  note, `place_claim_document` row, object present in the **private**
  bucket under `<user>/<claim>/`, detail shows "awaiting review".
- **Failed-message persistence** (§26.1 item 2) proven: two offline sends
  survived leaving and reopening the thread, retried once online, and the
  on-device file was cleared. **It exposed a scroll defect:** the sender's
  own message could land just below the viewport (`followOwnMessage`
  scrolled before the optimistic row was laid out, and
  `maintainVisibleContentPosition` held the old position). `useChatScroll`
  now pins to the bottom on content growth *only when already at the
  bottom*; verified online and offline.

Still not device-verified: completing a phone-OTP sign-in (needs a
handset), completing Google sign-in (needs real credentials), iOS.

---

## 27. Abonten Rewards (credit ledger) — Phase 1 (2026-09-10)

One unified **Abonten Credit** account per person (`user_info.id`),
whatever their role. It's a closed-loop promotional liability: never mixed
with organizer earnings, non-transferable, and **no cash withdrawals in
version 1** (owner decision 2026-09-10, along with: 1% event referral capped
at 35% of net revenue; GH₵ 3 + GH₵ 2 friend referral; 20% organizer
net-revenue rebate as promotion credit; monthly budget max(GH₵ 1,000, 25% of
trailing net revenue); credit purchases recorded as `transaction` rows;
Playwright / Maestro / Android Install Referrer approved). Full reference and
runbook: [docs/architecture/rewards-ledger.md](docs/architecture/rewards-ledger.md).

**Migrations** (applied live via MCP, files renamed to the recorded
versions, every function hash-identical to a from-scratch local replay,
advisors show only the intended additions):
- `20260910193609_credits_ledger_core`: `credit_account` (cached balances),
  `credit_ledger_account` (double-entry buckets + system accounts),
  `credit_journal` (UNIQUE idempotency key), `credit_entry` (pesewas; zero-sum
  deferred trigger), `credit_lot` (per-grant remaining / expiry / scope);
  append-only triggers; `credit_grant` / `credit_release_lot` /
  `credit_void_lot` / `credit_debit_available` / `credit_expire_due_lots`
  (pg_cron `credit-expire-lots`, daily) / `credit_set_account_status` /
  `credit_close_account`; `get_my_credit_summary` / `get_my_credit_activity`;
  `credit_reconciliation_checks`. Credit tables have **no FK to user_info**
  so history outlives a deleted user.
- `20260910193657_rewards_config_and_permissions`: `reward_program_setting`
  (everything off, audience `staff`), versioned `reward_rule` (seeded at the
  approved rates, all inactive), `reward_campaign`, `reward_budget_period`,
  `rewards_enabled_for_user`, `get_rewards_program_public`; admin permissions
  `rewards.view/review/freeze/goodwill/configure/withdrawals` (manual
  adjustments reuse the previously unused `finance.adjust`).
- `20260910193728_payment_dispute_and_credit_reconciliation`:
  `payment_dispute` + `record_payment_dispute` (**chargebacks were not
  tracked anywhere before**; the webhook now records `charge.dispute.*` and
  opens one incident per new dispute); `run_financial_reconciliation` keeps
  its four checks and adds the credit invariants.
- `20260910194315_credit_admin_operations`: `credit_adjustment_request`
  (maker-checker at ≥ GH₵ 500), `credit_grant_goodwill` (GH₵ 50 per user per
  month, enforced under the account lock), `admin_rewards_overview`.

**Security:** every credit-moving function is `service_role`-only;
`authenticated`/`anon` can't write any credit table (grants revoked, not just
RLS), and **service_role itself has SELECT only** on the ledger tables:
credit moves through the functions and nowhere else. Users read their own
account/lots under RLS and their activity through the definer RPC.

**Code:** `@abonten/core/rewards/*` (`creditAmount`, `rewardMath`,
`creditActivityCopy` + unit tests), `@abonten/types/rewards`,
`@abonten/services/rewards/{creditsQuery,rewardsProgramQuery}`,
`@abonten/services/admin/rewards/rewardsAdminCore`; web actions
`getCreditSummary` / `getCreditActivity` / `getRewardsProgram`, page
`/rewards` (404 until the program is on for the user) + a Header/SideBar
entry that only appears when enabled; mobile routes `/api/mobile/rewards/
{summary,activity,program}` + `api.rewards.*` + screen
`app/(app)/rewards/index.tsx` + an Account-tab row (enabled users only);
Admin › **Rewards** (overview with liability / flows / ledger health /
second-approver queue / rules; credit accounts list; per-account balances,
lots, full double-entry trace, adjust / goodwill / freeze; program settings
with step-up, where switches for unbuilt phases are shown locked).
`deleteAccountCore` closes the credit account before deleting the user.
Notification kind `rewards` routes to the Rewards screen.

**Verified:** 20 new unit tests; 19 new integration tests (ledger lifecycle,
authorization with strict `42501` codes, 20-way concurrent spend and 10-way
same-key grant, admin maker-checker + goodwill cap + freeze) and the full
suite **131/131**; `turbo typecheck` 11/11; `next build` web + admin clean;
API parity 107 routes; a rolled-back production SQL smoke of every function.
UI driven for real against the local stack: Admin › Rewards (second-admin
approval, freeze, settings save with a one-field audit diff), web `/rewards`
as staff, and the mobile screen on the Android emulator (signed in to a local
staff account through email OTP). Two defects found in that pass and fixed:
input widths in the admin forms, and a reversed reward shown without
strikethrough on mobile.

**Not yet built (later phases):** spending credit on tickets (P3),
referral capture + reward engine (P4, shadow mode first), friend referral
(P5), organizer/venue rebate (P6). Withdrawals are out of scope for
version 1. Production is unchanged for users: the program is off.

### 27.1 Phase 2 — paying for promotions with credit (2026-09-10)

Migration `20260910215010_credit_reservations.sql` (applied to production via
MCP; function hashes identical to a from-scratch replay):

- **`credit_reservation`** — credit held for one checkout: `reserved` →
  `captured` (spent) or `released` (given back). Holds sit on lots
  (`credit_lot.held_minor`) and in the user's `reserved` bucket. One open
  reservation per checkout; one per payment attempt. Owner SELECT only.
- **Functions (service_role only):** `credit_spendable(user, scope)` (the
  single rule for what may be spent: program + `redeem_*_enabled` switches,
  account active, not in debt, scope, unexpired lots), `credit_reserve`,
  `credit_capture_reservation` (idempotent; if the hold had lapsed it takes the
  credit again from the current balance or refuses with `23514`),
  `credit_release_reservation`, `credit_release_stale_reservations` (pg_cron
  every 5 min: releases holds whose payment failed/was replaced, or that are
  past expiry — never while a payment is `processing` or `succeeded`).
  `credit_close_account` now releases holds first. Reconciliation gains
  "stuck reservation" and "captured ≠ transaction.credit_amount" checks.
- **Columns:** `payment_attempt.credit_amount`, `credit_reservation_id`;
  `transaction.credit_amount`. `amount` keeps meaning **cash**, so the
  Paystack amount check and every existing cash total are unchanged.
  `transaction.payment_method` is `paystack`, `paystack+credit` or
  `abonten_credit`.
- **Replay fix:** `payment_attempt_target_check` restored to production's
  definition (a replay had re-created it without `event_promotion_checkout_id`,
  so event-promotion payments failed in any freshly built database).

Code: `@abonten/core/rewards/creditAllocation` (how much credit an order can
use: whole order, or leave the GH₵ 1 minimum cash charge);
`@abonten/services/rewards/creditRedemptionCore` (quote, reserve, release,
capture — prices come from the promotion **tier**, not the owner-writable
`*_promotion_checkout.total_price`); `createPromotionPaymentAttemptCore` gains
`useCredit` (part-credit = Paystack charges the cash part; credit-only =
provider `abonten_credit`, amount 0, finalized immediately);
`finalizePaystackPayment` trusts the credit reservation (never the
user-writable attempt row), refuses forged credit-only attempts, compares
Paystack's amount with the reservation's cash part, captures before
activating, and gives the credit back when the checkout lapsed. Web: new
`createPromotionPaymentAttempt` + `getPromotionCreditQuote` actions and a
`UseCreditToggle` in `PaymentMethodSelector` (the old `createPaymentAttempt`
promotion branches are no longer called). Mobile: `GET
/api/mobile/checkout/promotion-credit-quote`, `useCredit` on both
promotion-attempt routes, the switch in `PromotionPaymentSection`. Admin:
"Featuring events and places" switch in Rewards › Program settings;
`updateRewardsSettingsCore` refuses switches for unshipped features.

**Verified:** 7 new unit tests; `credits-redemption.integration.test.ts`
(9 tests: privileges, quote/reserve/overdraw, switches + frozen account,
3-way race, credit-only purchase end to end, a forged credit-only attempt,
part-credit with Paystack's amount checked both ways, the sweep, account
closure) with Paystack's HTTP call mocked; full suite **140/140**; typecheck
11/11; parity 108 routes. Driven for real on the local stack: web checkout
(part-credit amounts, switch off/on, a credit-only feature activated and shown
as "Used on a feature for …" on /rewards), the admin switch, and the Android
app (part-credit display, then a credit-only feature → "Payment successful").
Not verified against live Paystack: a part-credit order's real charge.

**Found while building this:** the promotion and transaction tables were
writable by any signed-in user through RLS — fixed in §27.2 (owner-approved).

### 27.2 Money-path lockdown: clients can no longer write payments (2026-09-10)

Owner-approved security fix. Before it, any signed-in user could — straight
from the REST API with the public anon key and their own session — create a
promotion checkout for **any** event/place and rewrite its price/status,
insert the promotion row itself (free featuring), insert/edit "successful"
`transaction` rows, insert/edit `payment_attempt` rows, rewrite their pending
`ticket_checkout` price and then issue the tickets as "free" through
`issue_tickets_for_checkout` (or open a checkout at a price of their choosing
through `create_ticket_checkout`, which stored the caller's line amounts),
and edit their own `ticket` (e.g. set a refunded ticket back to `active`).
Reproduced on a local replay before the fix: two GH₵ 50 tickets issued for
nothing, and a fake successful transaction.

Migration `lock_money_path_client_writes`:
- Drops the owner INSERT/UPDATE policies and **revokes INSERT/UPDATE/DELETE/
  TRUNCATE from `anon`/`authenticated`** on `event_promotion_checkout`,
  `place_promotion_checkout`, `event_promotion`, `place_promotion`,
  `transaction`, `payment_attempt`, `ticket_checkout`. SELECT is unchanged.
- `ticket` UPDATE is organizer-only (`ticket_organizer_update`, check-in);
  buyers no longer edit tickets.
- `create_ticket_checkout` / `issue_tickets_for_checkout`: EXECUTE for
  `service_role` only.
- `expire_stale_{ticket,event_promotion,place_promotion}_checkouts` are now
  `SECURITY DEFINER` (authenticated + service_role). Side fix: as invoker, a
  buyer-triggered sweep expired their own stale checkout but silently skipped
  the `ticket_type` / `promo_code` restock (organizer-only rows under RLS), so
  those units were lost.

Code: every write to those tables now runs on the service-role client after
the service has checked ownership and priced the order itself —
`insert{Event,Place}PromotionCheckoutCore`, `upsertPaymentAttemptForSession`,
`paystackInit` (no client parameter any more), both attempt cores,
`finalizePaystackPayment` (takes only the attempt id; verify/retry keep their
ownership check before calling it), `issueRefundCore`, `cancelUserTicketCore`,
`cancelTicketCheckoutSessionCore`, `validateCheckoutCore` (RPC), web
`generateTicket` (RPC), `deleteTicketSummaryCheckout`,
`updateTicketCheckoutQuantity`. The cash promotion path now prices from the
tier like the credit path. `activate{Event,Place}Promotion` moved from
`src/actions/` (public Server Action endpoints) to `src/utils/`, and refuse to
run without a verified payment (`promotionPaymentProof.ts`). The unused
`createPaymentAttempt` action (its promotion branches had been replaced in
§27.1; nothing called its ticket branch) is deleted. Also fixed while
verifying: the free-RSVP confirmation email never sent (web and mobile passed
no email to the helper, whose admin-API fallback needs the service role).

Verified: `money-path-lockdown.integration.test.ts` (5 tests: every table
refuses client inserts with 42501, the free-ticket route is closed at each
step, a buyer can't revive a ticket while the organizer can still check it
in, a buyer-triggered sweep restocks, the server still opens a correctly
priced checkout); existing tests moved to the service role where they used to
write as the user; full suite **145/145**. Driven on the local stack: paid
ticket checkout → quantity change → a **real Paystack test-mode MoMo charge**
→ tickets issued, organizer earning + platform fee recorded; checkout removal
restocks; free RSVP + cancel; a credit-only promotion; and a part-credit
promotion paid through a real Paystack test charge (GH₵ 281.21 cash + GH₵
18.79 credit — the part-credit path §27.1 could only test with a mock).

Still client-writable at the time, flagged: `subscription_checkout` and
`promo_code_usage` — both locked in §27.4.

### 27.3 Phase 3 — paying for tickets with credit (2026-09-11)

Migration `20260910233238_credit_ticket_redemption` (applied to production via
MCP before the code deploy — it's additive; function hashes identical to a
from-scratch replay; advisors unchanged):

- `credit_spendable` also returns the ticket-order limits
  (`max_share_bps`, `allow_full_credit`).
- `record_platform_fee` is credit-aware: service fee = (cash + credit) −
  ticket revenue; new `platform_fee_entry.credit_applied`. Credit is not
  subtracted from `net_revenue` again (it was booked as an expense when
  granted). Before this, a part-credit order would have recorded a zero fee.
- `credit_refund_redemption(transaction, amount)`: journal `redeem.refund`,
  new `refund` lots mirroring the scope/withdrawable flag of the lots used,
  idempotent per transaction; `transaction.credit_refunded_amount`.
- `cancel_event_and_release_tickets` includes orders paid entirely with
  credit (it filtered `amount > 0`, so they would never have been refunded on
  cancellation); `transaction_amount` = total paid.
- `get_user_transaction_history` counts credit in the fee/total and returns
  `credit_used` (dropped and re-created: new OUT column).
- Payout review: `payout.review_status/review_reason/review_details/
  reviewed_by/reviewed_at/review_note`; `BEFORE INSERT` trigger flags payouts
  when an event settled in the last 180 days had > 20% credit-funded ticket
  revenue; `BEFORE UPDATE` guard refuses `completed` until
  `admin_clear_payout_review`.

Code: `@abonten/core/rewards/creditAllocation.apportionCredit`,
`refundTenderSplit` (+ tests); `@abonten/services/rewards/ticketCreditCore`
(`loadTicketOrder`, `quoteTicketCredit` — own-event block);
`quoteCredit` generalized in `creditRedemptionCore`;
`createMultiCheckoutPaymentAttemptCore` gains `useCredit` (credit reserved for
the payment group, per-attempt cash/credit split, credit-only orders
finalized immediately); `finalizePaystackPayment` handles ticket groups
(reservation target = payment group, credit-only groups, lapsed-session check,
real provider in ticket metadata); `issueRefundCore` splits refunds by tender
and finishes a failed credit step on retry; `cancelUserTicketCore` refunds
credit-paid tickets; admin `clearPayoutReviewAdminCore` +
`sendPayoutAdminCore` guard; admin payout list/transaction detail/refund
panel show credit; the `redeemTicketsEnabled` / `allowFullCreditTicketOrders`
switches are unlocked. Web: the prepare step returns `credit`, the "Use
credit" switch on ticket checkout (the basket now refreshes the total after a
quantity change — it used to keep the old "Pay GHS …" label), `/transactions`
shows "incl. GH₵ X credit". Mobile: shared `CreditSwitch`, ticket
`PaymentSection` credit switch + credit-only path, transactions list credit
line; `api.checkout.attempt` takes `useCredit` / optional `paymentMethodId`,
`prepare` returns `credit`.

**Verified:** 12 new unit tests (`apportionCredit`, `splitRefundTender`);
`credits-ticket-redemption.integration.test.ts` (6: part-credit quote + min
cash + own-event refusal; credit-only order end to end incl. fee/earning
records and an instant credit refund; part-credit with Paystack's amount
checked and a split refund GH₵ 28.57 credit / GH₵ 71.43 cash, retry
idempotent; event cancellation returns credit-only orders; payout held →
settle refused → cleared → settled, cleared event not re-flagged; failed
reservation leaves no open attempt); full suite **151/151** on a fresh
replay; typecheck 11/11; web + admin builds; parity 108. Driven on the local
stack: web part-credit ticket order paid through a **real Paystack
test-mode charge** of the cash part (GH₵ 226.16 + GH₵ 25.84 credit; fee
recorded as GH₵ 12.00 with credit_applied 25.84), including a Cloudinary
failure that landed in "Retry" and then completed without charging again;
credit-only ticket order; self-cancel → "GH₵ 80.00 is back in your Abonten
Credit" (fee retained); `/transactions` and `/rewards` lines; Admin payout
held → completion refused → review cleared → completed, audit entries
written; settings save; transaction detail and refund-split copy. Android:
ticket checkout credit switch (on/off), part-credit order paid through a real
Paystack test MoMo charge, transactions list with credit lines and a
"Refund issued" credit refund.

**Not verified / known limits:** iOS; a live (not test-mode) Paystack
charge; the first-order/welcome credit scope (Phase 5). The `refund.failed`
case for mixed orders is fixed in §27.4.

### 27.4 Security follow-ups (2026-09-11)

Three items flagged at the end of §27.2 / §27.3, all fixed:

- **Admin "confirm your identity" stamp was forgeable.** `admin_stepup_at`
  held a bare timestamp, so anyone holding an admin's session cookies could
  write a fresh one and skip the step-up check for bans, refunds, payouts and
  settings. It is now `<ms>.<HMAC(user id, ms)>`
  (`@abonten/services/admin/stepUpToken.ts`, key derived from the
  service-role key by `security/signing.ts`, so no new env var; rotating that
  key just means admins confirm again). The OAuth callback signs it for the
  user the code exchange proved, `requireAdmin()` only accepts one signed for
  the current user, and the Confirm identity button always shows Google's
  account chooser. Existing unsigned cookies simply read as "not confirmed".
- **Promo codes and subscriptions were client-writable** (migration
  `20260911005153_lock_promo_subscription_writes_and_partial_refund_release`):
  `promo_code` UPDATE is organizer-only (any signed-in user could reset a
  code's `times_used` to 0 and use it past `max_uses`, or max it out);
  `promo_code_usage`, `subscription`, `subscription_checkout` and
  `subscription_plan` lose client INSERT/UPDATE/DELETE (a buyer could delete
  their own "already used" row and apply a once-per-customer code again);
  `expire_stale_subscription_checkouts` is cron-only. `promoUsage.ts` now
  writes with the service role (dead `claimPromoUsage` removed) and the basket
  actions look promo codes up per event (a code shared by two events made the
  lookup fail and the usage was never released).
- **A mixed (cash + credit) refund whose cash part Paystack later fails:**
  `record_refund_release` now gives back only the cash share of the organizer
  hold when credit was already returned, and `record_refund_hold` tops the
  hold up to the full amount on a retry instead of adding a second full hold.
  Both work from the net outstanding hold, which also fixes an older bug: a
  refund that failed twice released both earlier holds and over-credited the
  organizer by one refund. The `refund.failed` notification says when credit
  was already returned; a retried refund doesn't repeat the credit message;
  the admin refund panel says the credit share went back on an earlier
  attempt.

Deployed code first (the service-role promo writes work either way), then
the migration; production function bodies match a from-scratch replay.
Verified: step-up unit tests (7), a local admin server honouring a signed
stamp and rejecting a bare timestamp and a stamp signed for another user;
`promo-subscription-lockdown.integration.test.ts` (3) and the mixed refund
failure → retry → second failure path in `credits-ticket-redemption`
(organizer hold net −28.57 → −100 → −28.57, credit returned once).

### 27.5 Phase 4 — event referrals (2026-09-11)

Share an event → a friend buys through the link → after the event the sharer
earns 1% of the ticket price in credit (capped at 35% of that sale's net
revenue). **Ships switched off, in shadow mode.** Full design:
`docs/architecture/rewards-ledger.md` › Event referrals.

Migrations (applied to production before the code — additive; function hashes
identical to a replay; advisors: only the expected "RLS, no policy" INFO on the
new service-only tables):

- `20260911015208_referral_capture`: `referral_code` (one 7-character code per
  user, no look-alike characters; owner can read their own), `referral_touch`
  (click log with salted IP/UA hashes, 90-day purge job — a plain table, not
  partitions, at today's volume), `referral_attribution` (a signed-in
  visitor's latest touch per event), `device_install` (install/browser ids per
  user, a fraud signal only), `event_share.channel/referral_code`,
  `ticket_checkout.referrer_user_id/referral_code/referral_touched_at/
  referral_source` (immutable once stamped, by trigger),
  `reward_program_setting.referral_attribution_window_days` (7). Functions
  (service role only): `referral_ensure_code`, `referral_record_touch`,
  `stamp_checkout_referral` (re-checks everything: capture on, real code, not
  the buyer's own, not the organizer's, inside the window, referrer in good
  standing), `record_device_install`, `referral_purge_old_touches`.
- `20260911015504_rewards_engine`: `reward_event` (one decision record per
  referred checkout: amount, calculation, risk score and flags, status),
  `reward_outbox`, `risk_signal`; AFTER triggers on `ticket_checkout`,
  `ticket`, `transaction`, `event`, `payment_dispute` that queue an outbox row
  (only for referred sales); `rewards_process_outbox` (every minute, SKIP
  LOCKED, back-off, dead-letter after 8 tries + critical incident),
  `rewards_settle_due` (every 15 minutes: releases pro rata to the tickets
  still valid once the event has settled, voids refunded/cancelled sales,
  holds disputed/moderated ones), `rewards_notify_pending` (daily digest),
  `reward_review_decision`, `reward_rule_set_active`, `rewards_health`;
  `reward_program_setting.risk_weights`.
- `20260911015614_reward_event_rule_index`: covering index.

Engine rules: the `event_referral` rule must have a live version (none by
default); monthly budget ceiling enforced at accrual (over budget → deferred
to a later month, never dropped); caps per buyer per event, per referrer per
event and per month; deterministic risk score (blocking: self, organizer,
same email/phone/card or wallet; weighted: same device, new buyer account,
referrer refund rate, event concentration, velocity, open dispute; a
check-in lowers it) → pass / hold for review / reject; live credit only
unlocks for a referrer with a verified phone. **Shadow:** while
`shadow_mode` is on (default), or the referrer isn't in the program's
audience, every decision is recorded but no credit is posted and nobody is
notified. Orders paid entirely with credit earn no referral reward (no cash
revenue; the fee entry has no net revenue).

Code: `@abonten/core/rewards/referralCode`, `referralAttribution` (last touch
wins, window, the capped keyed store shared by cookie and app), `riskScore`
(+ 15 tests); `@abonten/services/rewards/referralCookie` (signed `abn_ref`
cookie, + tests), `referralCore` (link/code, touch logging, checkout
stamping, event-share logging, device sightings — honours
`REWARDS_KILL_SWITCH`); `validateCheckoutCore` stamps the winning touch after
opening a checkout (never blocks it); admin `referralAdminCore` (decision
list, shadow projection, held-reward decisions, rule versions with the
second-admin rule for cost increases; unbuilt rules can't be made live);
health check `rewards`. Web: `proxy.ts` stores `?ref=` in the signed httpOnly
`abn_ref` cookie and sets a random `abn_did` browser id (no database work);
`ReferralTouchLogger` logs the visit; the validate action reads only its own
signed cookie; share buttons add `?ref=` for signed-in users and log
`event_share`; /rewards shows the code. Mobile: `+native-intent` captures
`?ref=` into SecureStore (30 days) and logs the touch (signed out too); the
checkout sends the stored hint; an install id header on every API call;
share links carry the code; the Rewards screen shows it. Admin: Referrals
(projection, flags, top referrers, decision list), Review queue, Reward rules
(versions, make live / switch off, publish a new version), and the capture /
shadow / window settings are unlocked.

**Verified:** full integration suite **163/163** on a fresh replay (new:
`rewards-event-referral` 9 — stamping, accrual → settlement → release, refund
void, own/organizer/stale links refused, held → approved → released, same
card rejected, shadow posts nothing, rule off does nothing, clients locked
out); typecheck 11/11; parity 110; unit tests core 214 + services 35. Local
stack, real UI: admin made the rule live through the Rules page (a
self-published 2% version was refused activation by the same admin); web
share link carried `?ref=`; a second account opened it (signed cookie +
touch + attribution recorded), paid through a **real Paystack test-mode MoMo
charge**, the pg_cron job evaluated the sale within a minute (live pending
GH₵ 1.00), settlement released it, the referrer's /rewards and in-app
notification updated; Android: `https://abontenhub.com/events/…?ref=` opened
in the app signed out (touch logged with the install id), sign-in, checkout
stamped from the device-stored hint, event share sheet carried the user's
code and logged the share.

**Not verified / known limits:** iOS (universal links still wait on the Apple
Team ID); the real production cron run (the schedule is live but nothing is
stamped while capture is off); push for reward notifications (they are
in-app only, written by the engine in SQL, like the review-posted ones);
the daily stats rollup from the blueprint isn't built (the Referrals page
aggregates on the fly). Friend referrals, invite links and the Android
install referrer are Phase 5.

### 27.6 Phase 5 — friend invites (2026-09-11)

Invite a friend → they join with your link or code → when they first buy a
ticket of GH₵ 30 or more (or their own event sells to 10 verified buyers, or
an admin approves their place claim) you earn GH₵ 3 once it has settled;
they get GH₵ 2 welcome credit for that first order once their phone is
verified. **Ships switched off and in shadow mode** (both friend rules have
no live version; capture is off). Full design:
`docs/architecture/rewards-ledger.md` › Friend invites.

Migration `20260911032237_friend_referrals` (applied to production before
the code — additive, plus function replacements that keep every existing
call working; all 24 function hashes and grants identical to a replay;
advisors: nothing new):

- `user_referral` (one inviter per person for life: first bind wins; status
  bound → qualified → rewarded, or rejected / expired; the friend can read
  their own row). `reward_event.source_type` gains `user_referral`, `event`,
  `place_claim`; `reward_outbox` gains `claim_changed`.
- `referral_bind` (capture on + inviter rule live; refuses own code,
  unknown/disabled codes, accounts older than 7 days or that have bought,
  published or had a claim approved, circles up to 3 levels, restricted
  inviters), `referral_stats` (counts, earnings, recent friends as first
  name + initial, "invited by", whether a code can still be entered),
  `referral_resolve_code` (the invite page), all service-role only.
- Welcome credit: `_reward_grant_welcome` — a `reward_event` released at
  once through a new `immediate` branch in `_reward_accrue` (budget-gated,
  `welcome` lot, scope `first_order`, 30 days); needs a verified phone
  (`rewards_settle_due` sweeps for friends who verify later); refused if the
  friend already bought or shares the inviter's email/device.
- `first_order` credit is now spendable: `credit_spendable` takes the order
  total (new optional 3rd argument; the 2-argument version was replaced) and
  `credit_reserve` uses the same scopes — welcome credit counts only on a
  first ticket order of at least GH₵ 30 by someone with no paid order that
  still stands, and is spent before general credit.
- Inviter reward: `_reward_friend_decide` + the three qualification paths
  (`_reward_friend_qualify_order` / `_organizer` / `_claim`), triggered from
  the outbox (paid checkouts of a bound friend or of an event a bound friend
  organizes; claim status changes). Caps: 10 per inviter per month, review
  flag past 50 lifetime; risk as for event referrals plus "many friends
  joined within an hour" and the organizer block (a friend buying the
  inviter's own tickets is rejected). `_reward_settle_one` now handles the
  new sources (all-or-nothing release; the organizer path recounts buyers at
  settlement; the claim path checks the place is still theirs) and waits for
  the friend's phone too. A voided reward puts the friend back to `bound`
  so a later order can still qualify.
- Hardening: `place_claim_request` inserts must be `pending` with no
  reviewer (the policy only checked the claimant, so a user could file an
  already-"approved" claim row; ownership itself was never at risk).

Code: `@abonten/core/rewards/invite` (invite/Play Store links, install
referrer parsing, the cookie invite entry, result wording, + tests);
`@abonten/services/rewards/inviteCore` (`bindReferralCodeCore` — rate
limited 5/hour; `getReferralInviteCore`; `resolveReferralCodeCore` — 20/min
per IP; `invitesLiveCore`), `referralCookie` invite helpers (+ tests),
`getSpendableCredit(…, orderTotalMinor)`; admin `referralAdminCore`
(friend rules can be made live; friend stats on the Referrals summary),
`rewardsAdminCore` (referral graph on the account page,
`setReferralCodeDisabledCore`). Web: `proxy.ts` stores `/invite/CODE` (and
`?ref=` on pages that aren't events/places) in the signed cookie plus a
readable `abn_inv` flag; `InviteBinder` binds after sign-in; public
`/invite/[code]` page with Open Graph tags; "Have an invite code?" on
sign-in; /rewards Invite friends panel (link, WhatsApp share, stats, enter
a code) and a welcome-credit line. Mobile: `/invite/CODE` and
`abonten://invite/CODE` deep links, the Play install referrer
(`expo-application`, already in the dev/production build via
expo-notifications — now a direct dependency), a SecureStore pending
invite bound by `useInviteBinding` after sign-in, the invite screen,
Rewards › Invite friends (QR code via `qrcode` + react-native-svg, WhatsApp
share with a share-sheet fallback), the sign-in invite field. Routes:
`GET /api/mobile/rewards/invite`, `POST /rewards/referral/bind`,
`GET /rewards/referral/resolve` (public). Admin: friend rules on the Rules
page, friend stats on Referrals, labels in the decision table, referral
card + disable/enable code on the account page.

**Verified:** integration suite **174/174** on a fresh replay (new
`rewards-friend-referral` 11: link/offer/resolve, bind rules — own code,
circle, 8-day-old account, organizer, unknown/invalid — welcome only after
phone verification and only on a first order of GH₵ 30+, first order →
pending → released with the welcome credit spent on it, refund voids and a
later order re-qualifies, the inviter's-own-event block, organizer path
(2 buyers on a test rule) and approved place claim (release in 14 days),
monthly cap, shadow mode, same-device welcome refused, invites off, clients
locked out, a forged "approved" claim insert refused); unit tests core 220
+ services 36; typecheck 11/11; parity 113. Local stack, real UI: admin made
both friend rules live on the Rules page; web invite page (OG title "Ama M.
invited you to Abonten"), signed-out → sign-up by email with the invite
field prefilled → bound with a toast, cookie cleared; phone verified →
welcome credit on /rewards; checkout offered the GH₵ 2 on the first order,
a credit-only first order spent the welcome lot first and (correctly) did
not qualify the inviter; admin Referrals/account pages, disabling a code
made its invite page invalid. Android: `abonten://invite/CODE` signed out →
invite screen → sign-in with the code prefilled → email sign-up → bound
(device install recorded); Rewards showed the welcome credit; Invite
friends screen rendered the QR code and the WhatsApp share fell back to the
share sheet with the right message.

**Not verified / known limits:** the Play install referrer end to end (it
needs an install from the Play Store; the app isn't listed yet —
`ANDROID_APP_LISTED` in `@abonten/core/rewards/invite` hides the store link
until it is); `https://abontenhub.com/invite/…` opening the Android app
needs a new build (the `/invite` intent filter is added in `app.json`); iOS
(Team ID); a cash-paid qualifying first order through real Paystack
(covered by the integration test with Paystack mocked); push for the new
notifications (in-app only, like Phase 4).

### 27.7 Security: staff-only columns (2026-09-11)

Found while building Phase 6 and fixed straight away (migration
`20260911080616_staff_managed_column_guards`, applied to production first):

- **Any signed-in user could make themselves a platform admin** (or lift
  their own suspension/ban). `protect_user_info_privileged_columns()`
  (20260903231755) let a write through when `current_user` was `postgres`
  -- but the function was `SECURITY DEFINER`, and inside a definer function
  `current_user` is always the owner, so the guard passed for everyone.
  Reproduced on the local stack (`update user_info set is_admin = true
  where id = auth.uid()` succeeded as an ordinary user). Now `SECURITY
  INVOKER`: a browser session is `authenticated` and refused; the service
  role, migrations and `sync_is_admin_from_admin_user` still pass.
  Production had no abuse: the only `is_admin` user is the owner (also an
  active `admin_user`), nobody is suspended or banned.
- **Owners could undo moderation and self-verify places.** The owner UPDATE
  policies on `event` / `place` / `highlight` / `review` / `event_review` /
  `place_review` only checked ownership and `authenticated` could update
  every column, so an organizer could un-hide a removed event and a place
  owner could set `verified` / `claimed` (also on INSERT). New trigger
  `guard_staff_managed_columns()` refuses those changes from direct client
  writes unless `is_admin()`; staff paths (service role, an admin's session
  in `approve_place_claim`, `apply_moderation_action`) are unaffected.
  Production: no place verified/claimed and nothing moderated yet, so
  nothing to repair. Covered by `rewards-rebates.integration.test.ts`.

### 27.8 Phase 6 — organizer and venue rebates (2026-09-11)

Each month (pg_cron `rewards-monthly-rebates`, 03:00 on the 3rd, for the
previous month) `rewards_run_monthly_rebates(period)` looks at every event
that settled in the month (last end + 48 h) and decides, once per event:

- **Organizer rebate** (`organizer_rebate`, launch rate 20%) — a share of the
  **cash net revenue** Abonten kept on the event's standing sales: each paid
  checkout's share of `platform_fee_entry.net_revenue` (service fee minus
  Paystack), pro rata to tickets still valid and to the part paid in cash.
  Buyers who are the organizer or look like the same person (email, phone,
  device, the card they pay with) and disputed payments are left out.
- **Venue rebate** (`venue_rebate`, 5%) — the same basis, to the owner of the
  **verified** place the event was held at, only for other organizers'
  events; a venue owner who shares a device with the organizer is held for
  review, same email/phone rejected.
- **Organizer milestone** (`organizer_milestone`, GH₵ 20, once per
  organizer per threshold) — the first event that sells to 50 unique
  verified, unlinked buyers.

All three are **promotion credit** (lot kind `promotion`, scope
`promotions`, 180 days): it pays for featuring events and places only —
never tickets, never withdrawn. Gates (recorded as rejected): event
cancelled or removed, refund rate ≥ 10% (`max_event_refund_rate_bps`),
organizer account under 30 days old when the event settled
(`min_account_age_days`), no net revenue. A rebate at or above the
second-approver threshold (GH₵ 500) is held for review (`large_rebate`).
Budget-gated like every reward; released in the same run once the
beneficiary's phone is verified (otherwise `rewards_settle_due` releases it
later). **Shadow mode** records under a separate `:shadow` key, so a month
can be run in shadow and then again for real; a live decision is final and
re-runs skip decided events. One notification per person per run
(`promotion_credit_earned`, `milestone_reached`, in-app).

Migration `20260911083155_monthly_rebates` (additive + replaces
`_reward_settle_one` / `_reward_accrue` / `_reward_risk_weight` /
`get_rewards_program_public`; all 10 function hashes and grants identical to
a replay; advisors: only the expected "RLS, no policy" INFO for the new
service-role table `reward_rebate_run`). Nothing runs until a rebate rule is
live (all ship inactive).

Code: `@abonten/services/rewards/promotionCreditCore`
(`getPromotionCreditCore` — spendable-on-promotions, promotion-only
balance, rebate history via `rebate_stats`, live terms), web action
`getPromotionCredit` + `GET /api/mobile/rewards/promotion-credit`
(`api.rewards.promotionCredit()`); admin `rebateAdminCore`
(`getRebateSummaryCore`, `runMonthlyRebatesCore` — `rewards.configure` +
step-up + audit). UI: web Finances › Promotion credit card ("Feature an
event"), mobile Organizer › Finances card, "How to earn" copy on both Rewards
pages; admin Rewards › Rebates (rule status, run a month, runs, cost, top
earners, why events got nothing, decisions), the three rules can be made
live on Reward rules, rebate labels in the decision table.

**Verified:** integration suite **180/180** on a fresh replay (new
`rewards-rebates` 6: nothing while rules are off; shadow first then live for
the same month, 20% of cash net revenue with the organizer's own purchase —
paid without a card fingerprint — left out, promotion lot, promotion-only
spend, notifications, idempotent re-run, milestone once; young account and
refund-rate gates; venue 5% on a verified place, nothing on an unverified
one, held when the venue owner shares the organizer's device; waits for the
organizer's phone then releases; clients can't run it, read it, self-verify
a place, undo moderation or make themselves admin). Unit tests core 220 +
services 36; typecheck 11/11; parity 114; web + admin production builds.
Local stack, real UI: admin made the three rules live, ran the month in
shadow, turned shadow off in Program settings and ran it again (organizer
GH₵ 3.54 + milestone GH₵ 20, venue GH₵ 0.88, notifications, audit rows,
reconciliation clean); web Finances card showed GH₵ 23.54 and "Feature an
event" → featured a new event for 24 h paid fully with the promotion credit;
Android Organizer › Finances card rendered and its button opened My Events.

**Not verified / known limits:** a real month-end cron run in production
(first one on the 3rd after a rule is made live); a chargeback on a counted
sale after a rebate is released isn't clawed back (a rebate is ~0.6% of
ticket value; disputes open at run time are excluded); rebates go to the
place's owner at run time; push/email for the new notifications (in-app
only); iOS.

### 27.9 Phase 8 — loyalty, promoter commissions, place visits (2026-09-11)

Phase 7 (cash withdrawals) is skipped: the owner ruled cash out of version 1.
Owner decisions for Phase 8 (2026-09-11): promoters are paid their
organizer-funded commission in **Abonten Credit**, not cash; **anyone who
shares** can earn it (the existing `?ref` links, the organizer only sets the
rate); the loyalty reward is the **service fee back as credit**, not a fee
waiver at checkout. Migration `20260911104206_rewards_p8_loyalty_promoters_visits`
(all 26 new/replaced function hashes and grants identical to a fresh replay;
advisors: only INFO items — `place_visit_key` has RLS and no policy by
design, `event_promoter_commission.updated_by` has no index). All three
rules ship **inactive**; everything respects shadow mode.

- **Loyalty fee rebate** (`loyalty_fee_rebate`, Abonten-funded, budget-gated):
  every 5th paid ticket order of GH₵ 20+ on a **different** event within 90
  days gets the service fee it paid **in cash** back as reward credit
  (100%, max GH₵ 10), pending until that event settles; tickets to your own
  events don't count; a reward starts a new count; refunded / cancelled
  orders drop out (the reward is voided and the next order can earn it).
  Evaluated on `checkout_paid` (`_reward_loyalty_evaluate`; the outbox
  trigger now emits every paid order while the rule is live). Progress:
  `loyalty_progress(user)` → `getLoyaltyProgressCore`, web action
  `getLoyaltyProgress`, `GET /api/mobile/rewards/loyalty`; a "Service fee
  back" card on both Rewards pages.
- **Promoter commission** (`promoter_commission`, **organizer-funded**,
  outside the reward budget): the organizer offers 1–30% on an event
  (`event_promoter_commission`, public read, service-only write via
  `setEventPromoterCommissionCore`); a paid checkout stamped with someone's
  referral code earns that promoter rate × ticket price as reward credit
  after the event. The same amount is **charged to the organizer at once** as
  a negative `organizer_ledger_entry` of type `promoter_commission` (so it is
  pending with the event's earnings and can never be paid out first) and
  given back as `promoter_commission_reversal` when the sale is refunded,
  cancelled, rejected in review or charged back, pro rata for cancelled
  tickets. Same risk checks as event referrals (self / organizer / same
  email, phone, card rejected; shared device held). Stacks with the 1% event
  referral (different payer). The four organizer balance functions
  (`get_organizer_finance_overview`, `get_organizer_pending_earnings`,
  `request_organizer_payout`, `admin_create_payout`) and
  `get_organizer_ledger_transactions` include the new types; admin finance
  and the event finance summary show "Promoter commissions". Offered only
  while referral capture is on. UI: web Manage event › Promotion tab and the
  app's Event Insights ("Promoter commission" card: rate, stop, sales and
  commission figures); "share and earn X%" under an event's share button
  (web) / on the event screen (app) for signed-in sharers.
- **Place visits** (`place_visits`, Abonten-funded, monthly): the owner shows
  a QR code that **changes every 30 seconds** (`place_visit_code`, HMAC of
  the place and the 30-second window with a per-place secret in
  `place_visit_key`; the previous code is still accepted). It opens
  `/places/<slug>?visit=CODE`; the visitor checks in on the web (browser
  location) or in the app (App Link, or the in-app scanner) —
  `place_visit_record` accepts it within 150 m (+ up to 100 m of reported GPS
  accuracy), not for the owner, not from a mocked location (Android), once
  per person per place per day (`place_visit`). Once a month is over, the
  monthly run pays the owner of a **verified** place GH₵ 0.50 promotion
  credit per different visitor with a verified phone, older than a day, not
  looking like the owner (max 40 a month). Owner panel: web Manage place ›
  Insights (QR, "Show on a screen", today / this month / last month /
  credit) and the app's Place insights › Visitor check-in code. Admin:
  decided on Rewards › Rebates with the other monthly rewards.

Admin: the three rules on Reward rules; new Rewards › **Promoters &
loyalty** page (live rules, events offering a commission, promoter sales,
commission charged to organizers, loyalty rebates, shadow projections, top
promoters, decisions); place visits on Rebates.

**Verified:** integration suite **187/187** on a fresh replay (new
`rewards-p8` 7: loyalty on the 5th different event only, own events and
repeat orders don't count, reset after a reward, released after the event,
voided on refund; commission charged to the organizer at once (pending
balance 90 of 100), half released and half returned for a cancelled ticket,
full return on refund, nothing charged in shadow, no stamp for the
promoter's own purchase, stop = later sales earn nothing, only the organizer
can set it and only within the bounds; check-in accepted only with the
current code, at the place, not mocked, once a day, not the owner; monthly
visits reward 3 of 5 visitors counted (no phone / owner's device left out),
shadow then live, current month not decided; clients can't read the new
figures, write the tables or call the functions). Unit tests core 223 +
services 36; typecheck 11/11; parity 118; web + admin production builds.
Local stack, real UI: admin made the rules live; organizer offered 10% on
web; the sharer saw "the organizer pays promoters 10%"; a sale through the
link → organizer Finances pending GHS 390 = sales − GHS 10 commission, a
"Promoter commission −GHS 10, pending" ledger line and the Promotion-tab
figures; the promoter's Rewards activity showed GH₵ 10 pending; the loyalty
buyer's 5th order → GH₵ 5 pending, count back to 0; owner's rotating QR (new
image every 30 s, full-screen view); web check-in refused when 4 km away,
accepted at the place, "already checked in" on a repeat; admin ran last
month from Rebates → Osu Courtyard GH₵ 1.50 (3 of 3 visitors). Android:
Event Insights commission card (changed to 12%), finance summary and ledger
lines, check-in from the `?visit=` link at the place (recorded, 35 m),
in-app scanner sheet opened, owner's check-in QR screen (today 2, last
month 3, GH₵ 1.50), Rewards loyalty card and "how to earn", "share this
event and earn 12%" on the event screen.

**Not verified / known limits:** scanning a real QR with a phone camera (the
link it opens and the in-app sheet were tested separately); a live cron run
in production; iOS; push/email for the new notifications (in-app only). A
refund an admin makes **after** an event settled doesn't take back a
commission already paid (only chargebacks do) — the organizer keeps the
deduction for that sale. A commission held for review or waiting for the
promoter's phone keeps the organizer's deduction until it's released or
voided (at most 90 days). Test-card purchases never earn (shared card
fingerprint), same as Phase 6.

### 27.10 Push and email for reward notices; shadow data switched on (2026-09-11)

Every reward notice is written in SQL by `_reward_notify`, so until now none
of them reached a phone or an inbox (in-app only — createNotificationCore's
push never ran for them). Migration
`20260911152213_reward_notification_delivery` adds a delivery queue:

- `_reward_notify` also inserts `notification_delivery` rows: a **push** for
  every reward notice, and an **email** for the three about credit someone
  can use now (`reward_available`, `welcome_credit`,
  `promotion_credit_earned`). Pending / reversed / "friend joined" notices
  are push-only.
- The `notification-delivery` pg_cron job (every minute,
  `run_notification_delivery`) re-queues claims older than 5 minutes, drops
  stale rows (push > 1 day, email > 7 days) and — only when something is
  due and `notification_delivery_config.dispatch_url` is set — makes one
  `net.http_post` to `POST /api/notifications/deliver` with the config
  row's random token in `x-delivery-token` (no env var needed; the route
  reads the row with the service role and compares in constant time).
- The route runs `@abonten/services/notifications/deliveryCore`:
  `notification_delivery_claim` (skip-locked), one Expo push per person
  (several notices → "N Abonten Rewards updates"), one email per person
  (React email `RewardUpdateEmailTemplate`, sent by
  `apps/web/src/utils/sendRewardUpdateEmail.ts` from
  `rewards@abontenhub.com`), then `notification_delivery_finish`
  (sent / skipped no_device, no_email, channel_off / back in the queue,
  failed after 5 tries). `sendPushToUser` now returns what happened
  (`sent` / `no_devices` / `failed`); its other callers ignore it.
- **When:** pushes wait out the night (21:00–08:00 Accra); at most one
  reward email per person per 12 hours (later notices go in the next one).
  Phone-only accounts have no email and get the push only.
- **Switches:** `reward_program_setting.notify_push_enabled` /
  `notify_email_enabled` (both on), Admin › Rewards › Program settings ›
  Notifications, which also shows the last 7 days' sent / waiting / skipped
  / failed counts. Nothing is sent in shadow mode (no notices are written).
- `proxy.ts` excludes `api/notifications` (the cron call carries no cookie).
- Production `dispatch_url` = `https://www.abontenhub.com/api/notifications/deliver`
  (set after the deploy; NULL in the migration so a local replay never
  calls production).

**Shadow data switched on in production (owner's request, 2026-09-11):**
Referral capture on and all nine v1 rules live, shadow mode still on,
program visibility unchanged (off, staff) — decisions are recorded, no
credit is posted, nobody is notified. Done in SQL with ten
`admin_audit_log` rows (actor NULL, `request_meta.source = claude-code`).
August 2026 was run in shadow at once: 2 events decided, both rejected (a
50% refund rate; the only buyer was linked to the organizer), cost GH₵ 0 —
production has had almost no real ticket sales yet. Side effect: the
sign-in screen's "Have an invite code?" field now shows for everyone
(invites are "live" = capture on + inviter rule live); only staff can see
their own code, and a bound friend's welcome credit is recorded in shadow,
not paid.

**Verified:** integration suite **192/192** on a fresh replay (new
`rewards-notification-delivery` 5: welcome credit queues push + email and
the inviter's notice is push-only; delivered once with the notice's text
and the person's name; no device → skipped; failed email retried and failed
for good after 5 tries; switched-off channels skipped; only the config
token accepted; clients can't read the queue or call the functions). psql
checks on the local stack: the 12-hour email wait, stale push dropped,
expired claim re-queued, one HTTP call queued only when something is due.
End to end on the local stack: pg_cron → pg_net → the local web route → a
real Expo push on the Android emulator ("Your credit is ready"; tapping it
opened Rewards) and two real Resend emails to Resend's test inboxes (one
carrying two notices, subject "Abonten Rewards: 2 updates"). Admin switch
saved and audited. All 5 function hashes and grants identical in
production; advisors: only INFO (the two new tables have RLS and no
policy by design; new index unused yet). Types regenerated from production.

**Not verified:** a production delivery (no reward is paid live yet); iOS
push; email in real inboxes (Gmail/Outlook rendering). No per-person opt-out
for reward emails (they are account notices about credit); the other
SQL-written notifications (review posted, event cancelled) still don't push.
(All three followed up in §27.11. Production delivery was confirmed the same
day with a labelled test notice to the owner: push accepted by Expo, email
delivered by Resend.)

### 27.11 Reward email opt-out, review / cancellation pushes, email client check (2026-09-11)

Migration `20260911163306_notification_preferences_and_app_push`:

- **Stop reward emails, per person.** `notification_preference`
  (`reward_emails`, default on; RLS on, no client grants — written by
  `@abonten/services/notifications/rewardEmailPreferenceCore` with the
  service role). Three ways: the "Email me when credit is ready" switch on
  the Rewards page (web `getRewardEmailPreference` / `setRewardEmailPreference`;
  app `RewardEmailCard` → `GET/PUT /api/mobile/notifications/reward-emails`),
  the footer link in every reward email (`/unsubscribe/rewards?u=&t=`, public
  page — added to the middleware's public routes — that asks before changing
  anything and offers to turn them back on; `setRewardEmailsByLink`, web
  only), and one-click `List-Unsubscribe` / `List-Unsubscribe-Post` headers
  (`POST /api/notifications/unsubscribe`, POST only so link scanners can't
  unsubscribe anyone). The link carries the user id and
  `HMAC(deriveSigningKey("reward-email-unsubscribe:v1"), userId)` — no sign-in,
  no expiry, no new env var; rotating the service-role key invalidates old
  links. `notification_delivery_claim` skips a queued email for someone who
  opted out (`opted_out`). Phone-only accounts see the switch off and
  disabled (no address).
- **"New review" and "Event cancelled" now push.** An AFTER INSERT trigger on
  `notification` (`_notification_queue_app_push`, only for types
  `review_received` / `event_cancelled` — both written in SQL, neither by
  `createNotificationCore`, so nothing pushes twice) queues a push with
  `source = 'app'`. A cancellation is `urgent` (no night wait); a review
  waits for 08:00 like reward pushes. A BEFORE INSERT trigger gives the
  cancellation `data = {kind: 'ticket', ticketsSection: 'refunds' |
  'cancelled'}`, so a tap opens the app's Tickets tab on that section
  (`tickets.tsx` reads `?section=`); it used to open nothing. Several of
  these for one person are sent one by one (each opens its own screen); the
  program's push/email switches and the admin counts cover reward notices
  only (`source = 'rewards'`).
- **Email clients.** `RewardUpdateEmailTemplate` rewritten for Gmail and
  Outlook after a caniemail check (`@jsx-email/doiuse-email`, run outside the
  repo): plain inline styles, a Helvetica/Arial font stack (Outlook for
  Windows falls back to Times New Roman on `ui-sans-serif`), react-email
  `<Button>` (Outlook ignores padding on a plain link), no `<style>` block,
  class selectors or `display:none` logo swap (Gmail's mobile web client and
  Outlook drop them — the old template would have shown two logos there),
  and the logo on a white tile (`ABONTEN_LOGO_EMAIL_TILE_URL`) so it stays
  readable when a mail app darkens the email. What's left in the report is
  cosmetic: square button corners in Outlook for Windows, and react-email's
  standard hidden preview text. (The ticket-purchase and event-cancellation
  emails were moved onto the same parts right after — see below.)

**Verified:** integration suite on a fresh replay (3 new tests in
`rewards-notification-delivery`: opted-out email skipped while the push
still goes; the signed link works without sign-in and refuses another
person's / a tampered token; a review and a cancellation each queue their
own push, the cancellation urgent and routed to Tickets › Cancelled,
unaffected by the reward switches; clients can't read or write
`notification_preference`). Local stack, real UI: web Rewards page switch
(saved, toast); signed-out unsubscribe page (Unsubscribe → "You're
unsubscribed" → Turn them back on; a tampered link → "This link isn't
valid"); one-click POST → off, GET → 405. Android emulator: the Rewards
card switch (saved, toast); a real review → "New review" push → tap opened
the event's Reviews screen; a real cancellation → "Event cancelled" push →
tap opened Tickets › Cancelled. A real reward email through the local
pipeline to Resend's test inbox (footer link and Outlook button markup
present). Rendered screenshots at 640 px, 375 px and a forced-dark
approximation.

**Not verified:** Outlook for Windows and the Gmail apps themselves (no
access to those clients here — the owner can open the next reward email in
Gmail); iOS push.

**All emails on one client-safe layout (2026-09-11, code only).** The three
emails (`TicketPurchaseEmailTemplate`, `EventCancellationEmailTemplate`,
`RewardUpdateEmailTemplate`) are now built from shared parts in
`apps/web/src/components/organisms/EmailParts.tsx` (`EmailShell` with the
tiled logo and heading, `EmailIntro`, `EmailDetailRow`, `EmailButton`,
`EmailFooter`, …), so the Gmail / Outlook / dark-mode rules above live in one
place. Same wording and data as before; the purchase email's label / value
rows are a fixed two-column table that wraps on a phone instead of a media
query that stacked them, and ticket codes use a Courier stack. The white
logo (`ABONTEN_LOGO_EMAIL_DARK_URL`) was removed — nothing uses it now; the
ticket PDF keeps the plain logo. doiuse-email before → after for the
purchase email: `display:none` ×3, class selectors, `@media` and the
`ui-sans-serif` / `ui-monospace` stacks → only react-email's hidden preview
text and the button's rounded corners in Outlook for Windows. Checked:
rendered HTML of all three at 640 px, 375 px and forced dark; web typecheck
and production build. Not sent through a real purchase or cancellation.


---

## 28. Field Ops — regional promotion & field operations programme, Phases 0–6 (2026-09-11/12)

A modular, switchable programme: a ~12-person regional team (team lead,
content creator, offline + online members) is assigned to the towns of one
region, onboards businesses and organizers, and earns a configurable
commission per successful onboarding (GH₵ 5 at launch). Design reference and
runbook: [docs/architecture/field-ops.md](docs/architecture/field-ops.md);
the approved 23-section plan (9 phases) lives with the owner. Owner
decisions 2026-09-11: workers/leads use the **web app** (`/field`, Phase 1;
Expo section optional later); ownership is proven by an **OTP the business
owner enters** (Phase 2); a commission needs the **team lead's review + a
7-day holding period re-checked by a sweep** (Phase 3); payouts are **weekly
manual MoMo batches** approved by a second admin (Phase 4).

**Naming:** everything is prefixed `fieldops` (`fieldops_*` tables and
functions, `fieldops.*` permissions, role `field_ops_manager`, `/field-ops`
in the console, `fieldOps/` folders, `FIELD_OPS_KILL_SWITCH`) so the module
can be found, switched off and removed as one unit; "promotion", "campaign"
and "commission" already mean paid featuring, `reward_campaign` and
`event_promoter_commission`.

**Phase 0 (migration `20260911174652_fieldops_core`, applied to production
via MCP, replays cleanly locally; ships OFF — `program_enabled = false`, 8
seeded rule versions all inactive, no campaign):**
- `fieldops_program_setting` (singleton: master switch, verification
  defaults, duplicate-detection thresholds, housekeeping, push switch; the
  worker-UI / commission-generation / payout switches exist but are refused
  by the service until their phases ship), `fieldops_region`,
  `fieldops_territory` (PostGIS point + radius, optional polygon that wins;
  generated `centre_lat/lng` + `boundary_geojson` so PostgREST reads plain
  values; `fieldops_territory_contains` is the one containment rule),
  `fieldops_campaign` (draft → active → paused → winding_down → completed →
  archived via `fieldops_set_campaign_status`; one live campaign per region;
  activation needs an active territory + an active team lead),
  `fieldops_team` + `fieldops_team_member` (roles team_lead /
  content_creator / offline_member / online_member; invited / active /
  suspended / left; phone invitations bind through
  `fieldops_bind_invited_memberships`; payout MoMo columns column-level
  revoked from clients), `fieldops_commission_rule` (versioned, immutable
  by trigger, programme default or per-campaign override, one live per key
  via `fieldops_commission_rule_set_active`).
- **Access:** team leads and workers are ordinary accounts — never
  `admin_user` rows (`addTeamMemberCore` refuses admins, because an
  `admin_user` row flips `user_info.is_admin` and the staff bypasses with
  it). Clients have SELECT only, scoped by the self-only helpers
  `fieldops_is_member` / `fieldops_is_lead_of_team`; no client
  INSERT/UPDATE/DELETE on any `fieldops_` table. Admin permissions
  `fieldops.view / manage / rules / verify / commissions.approve /
  commissions.pay` (manage, rules, approve, pay need step-up); role
  `field_ops_manager`; `operations` gets view/manage/verify, `finance_admin`
  view/approve/pay, `analyst` view. A costlier self-published rule version
  needs another admin to activate it; nothing can be made live until the
  phase that pays it ships (`SHIPPED_ACTIVITIES`).
- **Code:** `@abonten/types/fieldOps`, `@abonten/core/fieldOps/
  {campaignLifecycle,territory}` (pure, unit-tested),
  `@abonten/validation/fieldOpsSchemas`, `@abonten/services/fieldOps/shared/
  {fieldOpsContext,killSwitch}` (`resolveFieldOpsContext` = the member/lead
  authorization primitive, mirrors `resolveAdminContext`),
  `@abonten/services/admin/fieldOps/*` (settings, regions/territories +
  optional Google geocoding, campaigns, team, rules, overview — every fn
  re-checks its permission and audits), Admin › **Field Ops** (Overview,
  Campaigns + detail with status controls and team management, Regions &
  territories, Commission rules, Settings), 11 server actions.
- **Verified:** core unit tests 18; integration `fieldops-rbac` (10: every
  client write refused with 42501, scoped reads, payout columns and
  rules/settings unreadable, stranger sees nothing, self-only helpers,
  permission checks, admin-as-member refused, one lead per team, immutable
  rules + one live per key + second-approver rule) and `fieldops-lifecycle`
  (4: activation guards, full state walk incl. invalid moves refused by TS
  and SQL, one live campaign per region, polygon-over-radius containment,
  phone invitation binding) — all green on a fresh local replay; services +
  admin typecheck; admin production build; `get_advisors` shows only the
  expected authenticated-executable WARNs for the four self-only helpers
  (same class as `is_staff`). CI gained a `unit-tests` job (core + services
  vitest + `check:api-parity`), which were not in CI before.
**Phase 1 — field shell (migration `20260911181444_fieldops_assignments`,
applied to production via MCP; still inert until an admin switches the
programme on and activates a campaign):**
- `fieldops_assignment` — one member × one territory × a date range
  (`starts_on = ends_on` for a day); `assigned → started → completed |
  cancelled`; reassignment is cancel + a new row; one open assignment per
  member per territory (partial unique); offline members check in with the
  device's GPS (`start_location`, generated `start_lat/lng`,
  `start_accuracy_m`, `start_distance_m` from the territory centre —
  informational, shown to the lead, never refused on). The
  `fieldops_assignment_check` trigger enforces member ∈ team ∈ campaign,
  `member_user_id` = the membership's user, active offline/online member,
  mode matches role, territory active and in the campaign's region.
  `fieldops_prospect` — a business/organizer a member identified in a
  territory (`identified → contacted → interested | declined | converted`,
  `contact_attempts` jsonb appended by the member, optional
  `matched_place_id` for "already on Abonten"); the same integrity trigger.
  RLS on both: SELECT own rows (`member_user_id = auth.uid()`) or
  `fieldops_is_lead_of_team(team_id)`; no client writes.
- **Services** (`packages/services/src/fieldOps/`): `shared/fieldOpsRows`
  (row mappers, `pointWkt/polygonWkt`, `notifyFieldOps` → in-app + push via
  `createNotificationCore`, honouring the programme's push switch);
  `member/{myFieldOpsQuery,assignmentsCore,prospectsCore}` and
  `lead/{leadDashboardQuery,leadTerritoriesCore,leadAssignmentsCore,
  leadTeamCore,announceCore}` — every core `(serviceClient, userId, input)`
  re-derives the caller's membership with `resolveFieldOpsContext` +
  `requireMembership(role)` and gates on the campaign status (plan §6:
  planning in draft/active, starting only while active, prospects while
  active/winding_down, team changes in draft/active/paused). A lead never
  reads payout details, never appoints another lead, never edits their own
  row; suspending/removing a member cancels their open assignments.
  `getMyFieldOpsCore` also binds pending phone invitations
  (`fieldops_bind_invited_memberships`) and honours the
  `worker_ui_enabled` switch (now editable in Admin › Field Ops › Settings).
- **Transports:** 18 web Server Actions in `apps/web/src/actions/fieldOps/`
  (shared plumbing `apps/web/src/utils/fieldOpsAction.ts`: cookie session →
  zod → service-role client → core) and 15 `/api/mobile/field-ops/**` route
  handlers built on one `fieldOpsRoute` helper
  (`api/mobile/field-ops/_lib/handler.ts`), typed as `api.fieldOps.*` /
  `api.fieldOps.lead.*` in `@abonten/api-client` (parity: 134 routes).
- **Web UI** (`apps/web/src/app/(pages)/field/**`, components in
  `apps/web/src/fieldOps/{atoms,molecules,organisms}`): the layout 404s
  unless the programme + worker UI are on and the visitor holds a membership
  (`loadFieldOpsMe` = request-cached `getMyFieldOps`). Members: `/field`
  Today (campaign banner, today's assignments with Start [GPS check-in for
  offline] / Complete, quick stats), `/field/assignments`,
  `/field/territory/[id]` (territory, own assignments, "Add a business",
  prospects with contact logging). Team lead: `/field/lead` (coverage board
  covered / completed / uncovered + coverage %, today's assignments, team
  headcount), `/field/lead/territories` (add/edit with "Find on the map" via
  the existing `/api/geocode` proxy, mark completed / reopen),
  `/field/lead/assignments` (day picker, create member × territory × dates,
  cancel with reason), `/field/lead/team` (invite by phone, suspend /
  reactivate / remove), `/field/lead/announce`. A "Field work" link
  (`FieldOpsNavLink`, `useFieldOpsMe`) appears in the header and side menu
  only for people with a membership while the programme is on. English
  only for now (same as Rewards; the i18n namespace is deferred).
- **Notifications:** `fieldops_assignment_created`,
  `fieldops_assignment_changed`, `fieldops_membership_added`,
  `fieldops_announcement` with `data.kind = "fieldops"` + `fieldOpsRoute`
  (new `NotificationEntityKind`; mobile's `notificationTarget()` falls
  through to `link` until Phase 9).
- **Verified:** integration `fieldops-assignments` (10: lead-only planning
  and cross-campaign refusal, one open assignment per member/territory +
  reassignment history, wrong role / past date / foreign territory refused
  by the trigger, RLS self-or-lead reads with no client writes, GPS start →
  distance recorded → second start refused → complete, paused campaign
  blocks starting, prospects need an open assignment + contact attempts
  move status + phone masked for the lead, coverage board + lead territory
  scope, phone invites + lead-appointment refused + suspension cancels open
  work + self-edit refused, announcements reach every active member but the
  sender) plus the Phase 0 suites and the full integration run on a fresh
  local replay; core / services unit tests; services, admin, web and
  api-client typecheck; web production build; `check:api-parity`. The
  `/field` pages are not yet exercised in a browser.
**Phase 2 — place onboarding wizard, owner OTP, evidence, lead review
(migration `20260911215206_fieldops_onboarding`, applied to production via
MCP):**
- **Model.** `fieldops_onboarding` is the activity record from wizard
  start to the lead's decision: member/team/campaign/assignment/territory/
  prospect links, `mode`, `kind`, `activity_key`, the business and its
  owner (`owner_phone_e164`, OTP-resolved `owner_user_id`, prior place/
  event counts), the real entity (`place_id` FK on delete set null;
  `client_request_id` is the one handed to `create_place`, so a retried
  submission finds the same place), the member's position at submission
  (`submission_location`, `submission_distance_m` to the pin,
  `inside_territory`), the duplicate-search snapshot (`similar_matches`,
  `duplicate_acknowledged`), and the lifecycle `draft → submitted →
  verified | needs_changes | rejected` (`needs_changes → submitted`,
  `verified → succeeded | flagged | rejected` reserved for the Phase 3
  sweep, `withdrawn` from draft/submitted/needs_changes). CHECKs:
  owner ≠ member, reviewer ≠ member; partial uniques: a place/event is
  onboarded once programme-wide, one live onboarding per owner per campaign
  unless an admin waives it. `fieldops_onboarding_evidence` (private
  bucket `fieldops-evidence`, key `<campaign>/<onboarding>/<uuid>.<ext>`,
  captured GPS + accuracy, `uploaded_at` set when the service sees the
  object) and the append-only `fieldops_onboarding_event` timeline
  (trigger refuses UPDATE/DELETE; service_role has only SELECT/INSERT).
  `fieldops_prospect.onboarding_id` links a prospect to the onboarding it
  became (`converted` on submission). `phone_otp_state.purpose` gained
  `fieldops-owner`.
- **Functions (service_role only):** `fieldops_transition_onboarding` —
  the one way a status changes (row lock, lifecycle table, owner-verified
  guard for `submitted`, self-review guard, timestamp stamping, timeline
  row); `fieldops_find_similar_places` — pg_trgm name similarity within a
  radius OR exact phone/WhatsApp digits match anywhere, ordered by phone
  match → similarity → distance; `fieldops_phone_belongs_to_member` — is
  this phone any team member's (invited phone or `auth.users.phone`).
  RLS: members SELECT their own onboardings (owner phone/user columns are
  column-level excluded — the number is masked in every client view and
  only an admin with `users.view_pii` sees it), leads their team's;
  evidence/timeline follow the onboarding; no client writes.
- **Owner OTP** (`fieldOps/member/ownerOtpCore`): the code goes to the
  OWNER's phone through Hubtel with its own purpose; refused outright when
  the number is the member's own or any team member's; rate-limited per
  member (`consume_rate_limit`, 20/hour) and per phone (60 s cooldown, 5
  attempts, 5-minute TTL from `phoneOtpStore`). Verifying runs the same
  `findOrCreateUserByPhone` as phone sign-in (now exported from
  `phoneAuthCore`) — the owner's account exists from that moment with a
  confirmed phone and no session — then `attachOwnerCore` pins it (owner
  ≠ member, owner not a team member, prior counts). Online members get a
  **consent link** `/consent/field/<token>` (HMAC token from
  `deriveSigningKey("fieldops-consent")`, 30-minute TTL) the owner opens
  on their own phone; the public page is token-authorised and per-IP
  rate-limited.
- **Submission** (`submitOnboardingCore`): needs the owner verified, an
  active campaign (winding_down only for fixes to returned work), the
  daily cap (`daily_submission_cap` counts submissions per member per UTC
  day), photos uploaded under the member's own signed Cloudinary folder,
  the member's GPS position for offline work, storefront + interior
  evidence for offline work (confirmed against the bucket), and a
  server-side duplicate re-check (a strong match must be acknowledged; a
  same-phone match is refused outright pending claim assistance in P5).
  It then calls the existing **`postPlaceCore`** with the OWNER's user id
  on the service role (so `place.owner_id` is the owner from the first
  instant; the gallery rows are inserted directly because
  `addPlacePhotoCore` checks the folder against the owner), records
  distance / territory containment (`fieldops_territory_contains`),
  snapshots the matches, transitions to `submitted`, marks the prospect
  converted and notifies the active team lead
  (`fieldops_submission_received`).
- **Review** (`fieldOps/lead/reviewCore`): the lead's queue (submitted
  first) and decision; a note is required unless verifying; `verified`
  snapshots the rule in force (`rule_id`: campaign override, else
  programme default) and `holding_until` (campaign override → rule
  `holding_days` → programme default); the member is notified
  (`fieldops_submission_reviewed`). Admin › Field Ops › Onboardings lists
  everything (status / campaign filters), the detail shows evidence
  (signed URLs), timeline, similar listings and the **eligibility
  checklist**, and `fieldops.verify` can decide a submitted onboarding in
  the lead's place (recorded as an override, audited
  `fieldops.onboarding.<decision>`).
- **Pure logic** (`@abonten/core/fieldOps`): `duplicateScore` (phone match
  decisive; name similarity discounted by distance; "strong" needs ≥ 0.6
  similarity inside the radius) and `eligibility` (`evaluateEligibility`
  = plan §8.2 as hard/soft/info checks; the TS copy drives the checklist,
  the Phase 3 SQL sweep will be the authority) — 11 unit tests.
- **Web UI:** `/field/onboard/[id]` five-step wizard (business + pin +
  duplicate check → owner code / consent link → details with the existing
  category picker and opening-hours editor → cover + gallery via the
  existing signed Cloudinary upload and evidence via
  `storage.uploadToSignedUrl` → review & submit), state kept in
  `sessionStorage` per onboarding; `/field/submissions` + `[id]`;
  `/field/lead/review` + `[id]` with the decision form; "Onboard this
  business" on the territory page and on each place prospect;
  `/consent/field/[token]` public owner page. 15 new web actions, 12 new
  `/api/mobile/field-ops/**` routes (`api.fieldOps.*onboarding*`,
  `api.fieldOps.lead.review/decide`; parity 146).
- **Verified:** integration `fieldops-onboarding` (11: assigned-territory
  gate + idempotent start, own/team phone refused as owner + cooldown,
  wrong code / consumed code, owner ≠ member at service and CHECK level,
  consent token round-trip + expiry, GPS/evidence/photo-folder gates then
  a place owned by the owner with the onboarding's client_request_id,
  similarity by name and by phone + same-owner/same-place refused by the
  partial uniques, RLS self-or-lead with the owner phone column
  unreadable and the timeline append-only, self-review refused →
  needs_changes → resubmit (one place still) → verified with holding,
  admin decision with/without `fieldops.verify` + audit row, prospect
  conversion), plus the P0/P1 suites; core/services unit tests; services,
  admin, web and api-client typecheck; web + admin builds; parity.
  Hubtel is faked in the suite (`sendOtp`/`verifyOtp` deps); the real SMS
  path and the wizard in a browser are not yet exercised.
**Phase 3 — commission ledger + eligibility sweep (migrations
`20260911223818_fieldops_commissions`, `20260911223847_fieldops_reconciliation`
and `20260911230537_fieldops_sweep_array_fix`, all applied to production via
MCP, advisor-clean, replay from scratch; branch `feat/field-ops-p3`).**

- **Ledger.** `fieldops_commission` — minor units, currency, the
  `rule_id`/`rule_version`/`amount_minor` frozen at verification, statuses
  `pending → approved → in_payout → paid` plus `rejected` / `reversed`,
  `idempotency_key` unique (`onboarding:<id>`, `reverse:<id>`), a partial
  unique so one onboarding earns once, and CHECKs that an earning is never
  negative and an offset never positive. `fieldops_commission_guard` allows
  **only** the status and its stamps to change and only along that
  lifecycle; there is **no DELETE grant at all**, not even for
  `service_role` (the money-path posture, one step stricter). Append-only
  `fieldops_commission_event`; `fieldops_job_run` records every sweep and
  housekeeping run. Clients SELECT their own rows (a lead the team's) with
  the payout plumbing columns revoked, and write nothing.
- **The sweep.** `fieldops_run_eligibility_sweep(limit)` on pg_cron every 15
  minutes (`fieldops-eligibility-sweep`), a no-op unless `program_enabled`
  **and** `commission_generation_enabled`. It takes `verified` onboardings
  whose `holding_until` has passed (`for update skip locked`), calls
  `fieldops_evaluate_onboarding` — the SQL authority for plan §8.2, mirrored
  in TypeScript by `@abonten/core/fieldOps/eligibility` for the review
  checklist — and then: all checks pass → `succeeded` + commission
  `approved`; a **hard** failure (listing gone, unpublished, moderated away,
  owner changed, or not the place this onboarding created) → `rejected` with
  the failed keys in `flags` and the commission `rejected`; a **soft**
  failure or a `spot_check_bps` sample → `flagged` for an admin with the
  money left `pending`; over `budget_cap_minor` → stays `verified` with
  `budget_exhausted`; a rule that pays on `event_started` / `claim_approved`
  → parked with `awaiting_release_policy` until P5/P6. A per-row exception
  handler keeps one bad row from stopping a run. `fieldops_run_housekeeping`
  (daily 02:25) closes reviews left open past a completed campaign's grace
  period. `fieldops_decide_flag` resolves a flag (approve → payable with the
  admin as approver; the admin who verified a row may not decide its flag);
  `fieldops_reverse_commission` never edits the original — a **paid** one
  gains a negative offset beside it so the money that left stays on record.
- **Observability.** `fieldops_health()` (sweep lag and failures, overdue
  holding periods, stuck reviews, stale flags, successful onboardings with
  no commission, payable commissions with no rule, pending/approved totals)
  is check key `fieldops` on Admin › Monitoring — a switched-off programme
  reads healthy rather than lagging. `run_financial_reconciliation` gains
  two Field Ops invariants (every `succeeded` onboarding has exactly one
  live commission; nothing payable without a rule behind it).
- **Surfaces.** Member `/field/earnings` (four money buckets, per-commission
  lines with reversals struck through, the live rate, next release date) +
  `GET /api/mobile/field-ops/earnings` / `api.fieldOps.earnings` (parity
  147). Admin gains **Review queue** (`/field-ops/review`, each flag
  explained in plain words, approve/reject inline) and **Commissions**
  (`/field-ops/commissions` + `[id]`, per-status totals, full history,
  reversal behind `fieldops.commissions.approve` + step-up); the Overview
  adds "waiting on a lead / on an admin / in holding / ready to pay".
  `commissionGenerationEnabled` is now editable in Settings and
  `SHIPPED_ACTIVITIES` admits the two place-onboarding activities, so a
  rule can finally be made live.
- **Verified:** integration `fieldops-sweep` (26: pending at verification
  with the rule frozen, nothing touched before the holding period, the
  approve / hard-reject / owner-changed / soft-flag / spot-check / budget
  branches, a rate rise mid-flight leaving the earned amount at 500, a
  second sweep adding no second row, the programme switch, `fieldops_job_run`,
  the admin flag queue + approve/reject + audit, ledger immutability
  [amount, illegal status move, DELETE, append-only events], reversal of an
  approved and of a paid commission with the offset netting to zero, RLS
  self/lead/stranger + client writes refused, health and reconciliation),
  full suite **35 files / 256 tests** on a stack replayed from scratch;
  core 252 + services 36 unit tests; `turbo typecheck` 11/11; web and admin
  `next build` clean with `/field/earnings`, `/field-ops/review`,
  `/field-ops/commissions` present; parity 147; Biome clean on touched
  files. The sweep has **never run against production data** — the
  programme is still switched off there.
- **Caught in testing:** the first cut of the sweep appended flag strings to
  a `text[]` with `flags || 'literal'`, which Postgres resolves to
  `anyarray || anyarray` and fails as `malformed array literal`. The per-row
  exception handler swallowed it, so every flagged and rejected branch
  silently left rows `verified`. `array_append` throughout is the fix
  (`20260911230537`); the integration suite is what exposed it.
**Phase 4 — manual MoMo payouts (migration `20260912000042_fieldops_payouts`,
applied to production via MCP, advisor-clean, replays from scratch; branch
`feat/field-ops-p4`).**

- **Model.** `fieldops_payout_batch` (`draft → approved → paid`, or
  `cancelled`) with a DB CHECK that `approved_by <> created_by` — the
  second-admin rule is a constraint, not a convention — and only one open
  batch per campaign so two admins can never split the same commissions.
  `fieldops_payout_item` is one member's share, carrying the destination as
  it stood when the batch was built (masked in the snapshot; the full number
  stays on the team-member row). Both tables have immutability guards that
  allow only the lifecycle columns to move, no client writes at all, and no
  batch DELETE even for `service_role`. The Phase 3 `payout_item_id` column
  finally gets its FK.
- **Flow.** `fieldops_build_payout_batch` sums every `approved` commission
  per member and moves them to `in_payout`; anyone without a mobile-money
  number is left out and their money waits for the next batch.
  `fieldops_mark_payout_item` records one transfer — **paid** (reference
  required) pays its commissions and pushes `fieldops_commission_paid` to
  the member; **failed** (reason required) returns them to `approved`
  immediately, so nothing is ever stranded in `in_payout`. The batch closes
  itself once nothing is pending. `fieldops_cancel_payout_batch` unwinds a
  batch that has paid nobody.
- **Surfaces.** Admin › Field Ops › **Payouts**: a preview of the next batch
  (including who is left out and why), build, second-admin approval,
  per-item paid/failed recording, cancel, and a finance CSV behind
  `fieldops.commissions.pay` **plus** `users.view_pii` — the one place a
  full number leaves the console, built in the browser from the action's
  reply rather than served as a URL, and audited. Members get a payout
  form and a payment history on `/field/earnings` (+ the
  `/api/mobile/field-ops/payout-destination` twin; parity 148). A member
  cannot change their number while a payment to the old one is in flight.
  `payoutsEnabled` is now editable, so `UNSHIPPED_SETTINGS` is empty.
- **Books.** `fieldops_payout_reconciliation` and three new
  `fieldops_health()` keys: what the ledger says was paid must equal what
  the payout items say was sent, nothing may sit in `in_payout` without a
  live batch, and nothing may be marked paid without a reference.
- **Bug found and fixed in the Phase 3 ledger:** reversing a commission that
  had **already been paid** was doing two things at once — moving the
  original to `reversed` *and* adding a negative offset — which took the
  money off the member's balance twice. A payment that really happened now
  keeps its `paid` row (that is what the payout item says) and the offset
  alone records the claw-back; only money that had not left yet becomes
  `reversed`. A second reversal of the same commission is refused. Caught
  by the new reconciliation check, before the programme was ever switched
  on.
- **Verified:** integration `fieldops-payouts` (22: destination masking and
  the in-flight lock, cross-campaign refusal, column-level revocation,
  preview + who is left out, grouping, the one-open-batch rule, the
  second-admin rule from both sides, PII gating, paid → commissions paid +
  notification + batch self-close, double-pay refused, failed → money
  straight back, cancel + rebuild, cancel refused after a payment, the
  member's history and own-row-only RLS, client writes refused, the CSV
  gate, and the books balancing after a post-payment reversal), full suite
  **36 files / 278 tests**; `turbo typecheck` 11/11; web and admin builds
  clean with `/field-ops/payouts[/id]` present; parity 148; Biome clean.
**Phase 5 — events and claim assistance (migrations
`20260912003951_fieldops_events_claims` and
`20260912005814_fieldops_notify_never_blocks`, both applied to production via
MCP, advisor-clean, replay from scratch; branch `feat/field-ops-p5`).**

- **Events.** The wizard gets an event branch (`EventOnboardingWizard`:
  organiser → the event → flyer) sharing one extracted
  `OwnerVerificationStep` with the business wizard. `submitEventOnboardingCore`
  creates the event through the ordinary `postEventCore` / `create_event`
  path under the **organiser**, with the onboarding's `client_request_id`, so
  the sweep can prove the team really listed it. The flyer must come from
  the member's own signed Cloudinary folder (new
  `getEventFlyerUploadSignature`), and an event that starts in the past is
  refused outright.
- **Claim assistance.** When the duplicate check finds the business already
  listed, the member can now help its owner claim it rather than withdraw.
  `submitClaimAssistCore` verifies the real owner by OTP and files a
  `place_claim_request` with `claimant_id = owner_user_id` — the member is
  never the claimant, can never claim their own listing, cannot claim one the
  owner already holds, and a second member filing the same claim gets a clean
  409 from the existing partial unique.
- **Real release gates.** The Phase 3 `awaiting_release_policy` parking is
  replaced: `event_started` waits for `starts_at` to pass (and rejects a
  cancelled or moderated event — note `event.status` spells it `canceled`,
  unlike every other status column in the schema); `claim_approved` waits for
  an admin and rejects when the claim is rejected. A row that is not due is
  left alone with no flag and counted as `waiting_on_release`;
  `due_not_swept` only counts gates that have actually opened.
  `fieldops_evaluate_onboarding` now branches per activity — a claim assist
  is not checked for photos, opening hours or a pin of the team's own.
- **Dispute flag.** `fieldops_flag_on_claim` (trigger on
  `place_claim_request`) flags any onboarding whose listing someone else
  later tries to claim. `SHIPPED_ACTIVITIES` now admits all five onboarding
  activities.
- **Bug found and fixed — a notification could undo a payment.**
  `_fieldops_notify` inserted straight into `notification`, whose `user_id`
  has a FK to `auth.users`. A recipient whose account had been deleted made
  that insert throw, and the error propagated out of the sweep's per-row
  work, **rolling back the status transition and the commission approval
  with it** — the row then sat `verified` forever and the member was never
  paid (the same hazard applied to `fieldops_mark_payout_item`). Notices are
  now best-effort: a missing recipient is skipped and any other write failure
  is swallowed with a warning. Caught by the integration suite, where a
  previous run's deleted test user reproduced it exactly.
- **Verified:** integration `fieldops-events-claims` (15), full suite **37
  files / 293 tests** on a stack replayed from scratch, and the same suite
  re-run against an already-dirty database to prove the sweep never errors;
  `turbo typecheck` 11/11; web and admin builds clean; parity 150; Biome
  clean.
**Phase 6 — the content creator (migration `20260912012308_fieldops_content`,
applied to production via MCP, advisor-clean, replays from scratch; branch
`feat/field-ops-p6`).**

- **Model.** `fieldops_content_brief` (what the campaign wants made; readable
  by everyone on the campaign) and `fieldops_content_submission` (platform,
  link, caption, the creator's **self-reported** figures). A trigger refuses
  anyone but the active content creator, a partial unique on `lower(url)`
  refuses the same post twice from anyone, and a CHECK refuses a self-review.
  The Phase 3 `content_submission_id` column finally gets its FK.
- **Same shape as an onboarding.** `fieldops_review_content` snapshots the
  live `content_deliverable` rule, starts a holding period and records a
  **pending** commission; `fieldops_sweep_content` (added to the same
  15-minute cron job) confirms it afterwards. Nothing about a post on
  someone else's platform is checkable from here, so the holding period is
  really a window for a human to retract; a creator who leaves the team
  mid-holding is not paid. Engagement numbers are never used to decide
  anything and are labelled self-reported in all three UIs.
- **Stipends.** `fieldops_run_monthly_stipends` is authorised by an admin
  (`fieldops.commissions.approve` + step-up, audited) and creates `approved`
  commissions for each active lead and creator at the live stipend rules —
  a stipend is payroll, not per-item work. Idempotent per member per month
  (`stipend:<member>:<yyyy-mm>`).
- **Surfaces.** `/field/content` for the creator (briefs, a submit form that
  says plainly that figures are not paid on, their own history) and
  `/field/lead/content` for the lead (write briefs, review the queue).
  Admin › Field Ops › **Content** lists everything across campaigns, can
  decide in the lead's place, and runs a month's stipends. Four new mobile
  twins (parity 154). `SHIPPED_ACTIVITIES` now admits all eight activities,
  so every rule the programme defines can finally be made live.
- **Bug found and fixed:** the submission URL CHECK used
  `url ~ '^https?://.{5,500}$'` — Postgres caps a bounded regex repetition
  at 255, so every insert failed with `invalid repetition count(s)`. The
  length is now its own check.
- **Verified:** integration `fieldops-content` (24), full suite **38 files /
  317 tests**; `turbo typecheck` 11/11; web and admin builds clean with
  `/field/content`, `/field/lead/content` and `/field-ops/content` present;
  parity 154; Biome clean.
- **Not yet built:** analytics (P7), Playwright + pilot readiness (P8).

---

*This document reflects only what was directly verified by reading the repository's code, configuration, and git history. Sections marked "Needs Investigation" should be confirmed with the project owner or by deeper runtime/schema inspection before being relied upon.*
