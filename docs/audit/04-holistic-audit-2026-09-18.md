---
title: Holistic production-readiness audit — 2026-09-18
purpose: Record what an adversarial, whole-stack engineering audit of Abonten Hub found on 2026-09-18, what was changed the same day and how it was verified, what was checked and found sound, and what is deliberately left open.
audience: Founder, engineering, future auditors
scope: apps/web, apps/mobile, apps/admin, packages/*, supabase/, production project sderrexhawjbmsugndcq
status: Approved
version: 1.0
lastReviewed: 2026-09-18
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Holistic production-readiness audit — 2026-09-18

Branch `audit/holistic-hardening-2026-09-18`. The brief was a full, adversarial audit of the whole platform with the rule "do not patch symptoms when the architecture is wrong". This report is written for the reader who was not in the session: what was inspected, what was found, what changed, what was verified and by which command, and what remains.

## 1. Executive summary

The platform is in good shape. The previous five weeks of audits (limitations register, holistic audit of 2026-09-13, Android launch audit, iOS QA rounds) already closed the classes of defect that usually sink a launch: the money path is one idempotent finaliser with a compare-and-set lock, money tables are server-write-only, every privileged RPC re-checks `auth.uid()`, refunds are claimed before Paystack is called, account deletion preserves the financial record, and there is a real integration suite that replays every migration against a disposable Postgres. Baseline on the morning of the audit: typecheck 11/11, unit 118 + 463, API parity 216 routes, docs check clean, no open production incidents, zero stuck payment attempts, zero duplicate ticket codes.

Three things were wrong enough to change, and each was an architecture-level fix rather than a patch:

1. **The Paystack webhook promised Paystack that every delivery was handled, even when it was not.** It answered 200 for every outcome, so a transient failure inside finalisation (a verify time-out, a database error between the lock and ticket issuance) put the attempt back into a retryable state and simultaneously told Paystack never to retry. The customer had paid and nothing would issue the ticket until they happened to tap "Check again". Fixed by making the HTTP status a function of the finalise outcome (settled → 200, unsettled → 503 so Paystack redelivers).
2. **Mobile had three competing keyboard mechanisms, and the chat thread used the worst one.** React Native's `KeyboardAvoidingView` reacts on Android only after the keyboard has finished sliding in, which is precisely the "keyboard appears, then the content jumps" the brief describes; on top of it sat a JS keyboard listener that scrolled the list, and the bottom bar flipped its padding on a third JS signal. Replaced by one UI-thread keyboard signal that every surface reads (sheets already did), with `KeyboardAvoidingView` removed from the app entirely.
3. **Documentation contradicted the database.** PROJECT.md still said `ticket_code` had no uniqueness guarantee and that price, quantity and discount ranges were unchecked; all of those constraints have existed since 2026-09-04. Corrected, and the duplicate copies of two of those constraints were removed from the database.

Everything else examined (§4) was found sound, or is a bounded, deliberately deferred item with its reason (§6).

## 2. Architecture map (as verified, not as documented)

```text
UI (apps/web Server Components + Client Components · apps/mobile Expo Router · apps/admin)
  ↓ hooks / TanStack Query (mobile: offlineFirst, reconnect refetch; web: partial adoption)
  ↓ transport: web Server Actions ("use server", cookie session) · mobile /api/mobile/** (Bearer JWT, getMobileAuth)
  ↓ @abonten/services  (framework-free; (supabase, userId, input) → { status, message?, data? })
  ↓ authorisation: per-call auth.getUser() + ownership checks in the service + RLS on the caller's client
  ↓ Postgres: SECURITY DEFINER RPCs for anything that moves money, inventory, credit, verification or content state;
              service-role client only after the service has authorised and priced the operation itself
  ↓ external: Paystack (verify + webhook → one finaliser) · Cloudinary · Resend · Hubtel · Expo push · Sentry
  ↓ pg_cron (40 jobs) for expiry sweeps, reconciliation, delivery queues, rewards, content, weekly editions
  ↓ response envelope → cache invalidation (react-query keys; revalidatePath on web) → UI
```

Money lifecycle, as traced: `validateCheckoutCore` (rate-limited, sales-window and occurrence checks, prices every line server-side) → `create_ticket_checkout` (one transaction: reservation + promo claim + rows) → `createMultiCheckoutPaymentAttemptCore` → Paystack → client `verify` **and** webhook both call `finalizePaystackPayment` (CAS lock `initiated|pending|fulfillment_failed → processing`; 15-minute stale-lock recovery by cron; verify amount/currency/reference against Paystack; credit reservation capture; per-member fulfilment; platform fee) → `issue_tickets_for_checkout` (service-role only) → `record_organizer_earning` → settlement 48 h after the event → payout request under an advisory lock → manual transfer or flag-gated Paystack transfer → webhook `transfer.*`. Refunds: `claim_transaction_refund` CAS → partial Paystack refund of ticket revenue only → `record_refund_hold` → webhook `refund.processed|failed` with a status-guarded update.

## 3. Findings

Severity uses the brief's scale. "Status" is what happened in this session.

| # | Severity | Subsystem | Finding | Root cause | Evidence | Impact | Status |
|---|---|---|---|---|---|---|---|
| F1 | HIGH · DATA INTEGRITY DEFECT | Payments / webhook | `POST /api/paystack/webhook` returned 200 for every `charge.success` regardless of the finalise outcome | The handler reasoned that the finaliser's lock made retries *safe* and concluded retries were therefore unnecessary; but `pending` (verify unreachable) and `fulfillment_failed` (ticket issuance failed after the money was confirmed) are outcomes only a retry can change, and nothing else re-drives them — `recover_stale_payment_attempts` only releases a stuck lock, it never re-runs finalisation | `route.ts` comment "Always ack with 200 once the signature is valid"; `finalizePaystackPayment` returns `pending` on a thrown verify and reverts the row to `pending`; no cron re-invokes finalise | Paid order with no ticket until the customer taps "Check again"; support-only recovery | **Fixed** — `webhookAck.ts` (200 for `succeeded` / `failed` / `not_found`, 503 for `pending` / `fulfillment_failed` / `already_processing`); refund and transfer branches 503 on DB error; unit test |
| F2 | HIGH · UX DEFECT / ARCHITECTURAL | Mobile keyboard | Chat thread wrapped in `KeyboardAvoidingView behavior="padding"`, plus a JS `useKeyboardVisible` effect calling `scrollToBottom`, plus `BottomBar` flipping its inset on a third JS listener | Three uncoordinated systems; on Android KAV listens to `keyboardDidShow` (post-animation), so the composer stayed under the keys during the slide and then leapt up — the exact anti-pattern in the brief. Sheets had already moved to Reanimated's UI-thread keyboard signal (2026-09-17) but the thread, the forms and the bottom bar had not | `[conversationId].tsx`, `BottomBar.tsx`, `KeyboardAwareScrollView.tsx` (Android branch), `EmojiPickerSheet.tsx` (RN Modal + KAV, which is a no-op on Android inside a Modal) | Visible jump on every focus/blur in chat and forms; two different keyboard behaviours in one app | **Fixed** — `useKeyboardLift` + `KeyboardInsetView` in `@abonten/ui-native`; all consumers migrated; `KeyboardAvoidingView` has zero usages in `apps/mobile`; emulator-verified (§5) |
| F3 | MEDIUM · PERFORMANCE / SCALABILITY | Database | 36 foreign keys without a covering index, including columns the app filters on (`content_reaction.user_id`, `content_not_interested.post_id`, `content_campaign.checkout_id`, `event_reminder_sent.event_id`, `verification_case` subject columns, `credit_reservation` journal columns) | Deferred in the 2026-09-13 audit as "no measurable effect at current volume" | Supabase performance advisor | Sequential scans that grow with the table on account anonymisation, feed exclusion, reminder anti-join, credit reconciliation | **Fixed** — migration `20260918100000`; advisor 36 → 17 (remaining are `*_by` admin audit columns, left on purpose) |
| F4 | LOW · MAINTAINABILITY | Database | Two identical CHECK constraints on each of `ticket_type.price`, `ticket_type.quantity`, `promo_code.discount_percentage` | A later migration re-added checks that already existed under other names | `pg_constraint` | Double evaluation; reads as two rules | **Fixed** — same migration drops one of each pair |
| F5 | LOW · DOCUMENTATION | PROJECT.md | §7.2, §7.6 #4–#5, §16 13b, §17 stated `ticket_code` was not unique and ranges were unchecked | Never updated after `20260904131325_phase2_ticketing_constraints.sql` | `pg_indexes` shows `ticket_ticket_code_key`; `pg_constraint` shows the checks | Future work planned against a false picture of the schema | **Fixed** |
| F6 | LOW · MAINTAINABILITY | Mobile / ui-native | `useKeyboardReveal.ts` still described `<Sheet>` as rendering inside an RN `<Modal>`; `useAnimatedKeyboard` was called with `is*TranslucentAndroid` flags that react-native-edge-to-edge ignores and warns about at runtime | Comment and options left over from the 2026-09-17 sheet rebuild | Metro log `WARN isStatusBarTranslucentAndroid … ignored` | Misleading guidance; a warning on every app start | **Fixed** |
| F7 | LOW · SECURITY (information) | Database | `get_transaction_refundable_amount(uuid)` is `SECURITY DEFINER` and executable by `authenticated`; a `REVOKE` from `authenticated` exists (`20260904130247`) but `PUBLIC` still holds EXECUTE, so the revoke has no effect | Postgres grants EXECUTE to PUBLIC by default; revoking from one role does not remove PUBLIC's grant | Security advisor lists it; `issueRefundCore` calls it with the buyer's session client, so it must stay callable by the owner | A signed-in user who guesses another transaction's UUID learns its refundable amount (a number, no identity); UUIDs are not enumerable | **Deferred** — the correct fix is an ownership check inside the function; no data beyond one amount is exposed, and the function is needed by the customer's own refund flow. Listed for the next SQL pass |
| F8 | TECHNICAL DEBT | Mobile dependencies | `expo-doctor`: nine Expo packages one patch behind SDK 57's expected versions | Patch releases since the last `expo install` | `npx expo-doctor` | None today; bumps change native code and belong with a native build | **Deferred** — run `npx expo install --fix` when the next EAS build is cut (one is already owed for the volume module) |
| F9 | SCALABILITY RISK | Messaging realtime | Each open thread subscribes to `postgres_changes` on `message` / `message_reaction` / `conversation_participant` filtered by conversation; the inbox subscribes on `conversation` | Correct and RLS-authorised today; `postgres_changes` evaluates RLS per subscriber per change on the realtime server, which is the documented scaling ceiling | `useConversationRealtime.ts`, `useInboxRealtime.ts` | Not a problem below thousands of concurrently open threads | **Deferred** with a named replacement: broadcast from a trigger on private channels (`realtime.messages` policies already exist) |
| F10 | LOW · PERFORMANCE | Database RLS | `content_comment`, `content_media`, `content_post` have two permissive SELECT policies for `authenticated` | Author-select and public-select were written as separate policies | Performance advisor `multiple_permissive_policies` | Both policies evaluated per row; negligible at current volume | **Deferred** — merging is an RLS policy change and, per repository rules, needs a deliberate decision |

### What was examined and found sound (no change)

- **Money path concurrency**: `create_ticket_checkout` and `issue_tickets_for_checkout` are single transactions; inventory is a compare-and-set with a `quantity >= 0` CHECK behind it; `expire_stale_ticket_checkouts` never expires a session whose payment attempt is in flight; `claim_transaction_refund` gates Paystack; `request_organizer_payout` takes a per-organizer advisory lock and computes the available balance inside it. Live counts: 0 attempts stuck in `processing`, 0 `fulfillment_failed`, 0 `refund_pending`, 0 duplicate ticket codes.
- **Webhook signature**: raw-body HMAC-SHA512 with `timingSafeEqual`; the proxy matcher excludes the route from the cookie session. `record_payment_dispute` upserts by dispute id and returns 500 on failure so disputes are redelivered.
- **Authorisation**: every `SECURITY DEFINER` RPC the advisor lists as executable by `authenticated` was read (`issue_free_ticket`, `cancel_event_and_release_tickets`, `request_organizer_payout`, `delete_message`, `block_participant`, `mark_conversation_unread`, …) and each derives identity from `auth.uid()` and refuses a mismatch. No mobile route or Server Action takes a caller-supplied user or organizer id.
- **Mobile session handling**: `getMobileAuth` verifies the JWT with the auth server, blocks suspended/banned/deleted accounts, never trusts the unverified `sub` except to start a parallel read that is discarded on mismatch. The API client has a 20-second per-request timeout; a 401 only condemns the session that actually sent the token and only after the auth server confirms.
- **Chat outbox**: client-generated idempotency keys, optimistic rows reconciled against the server thread by id, failed sends persisted to disk and restored, realtime inserts invalidate rather than hand-merge, reconnect and foreground both reconcile, reactions patched in place with own-echo suppression.
- **Network resilience**: NetInfo wired into react-query's `onlineManager` with a debounced offline transition; `offlineFirst` queries reach their own error state instead of spinning.
- **Search**: mobile and web search go through react-query keyed by the query text, so out-of-order responses cannot overwrite newer ones.
- **Static analysis**: no `@ts-ignore` / `@ts-expect-error` in source (only generated `.next` validators); 48 `any` occurrences, all in typed-gap casts already documented (`as unknown as Database[...]`); 174 `biome-ignore` lines, each with a reason.

## 4. Changes made

### Database

- `supabase/migrations/20260918100000_audit_fk_indexes_and_constraint_dedupe.sql` — applied to production via the Supabase MCP (`audit_fk_indexes_and_constraint_dedupe`) and replayed by the integration stack. 14 indexes (`idx_content_reaction_user`, `idx_content_comment_like_user`, `idx_content_share_user`, `idx_content_not_interested_post`, `idx_content_campaign_checkout`, `idx_content_post_cover_media` (partial), `idx_event_reminder_sent_event`, `idx_verification_case_place` (partial), `idx_verification_case_organizer_user` (partial), `idx_credit_reservation_reserve_journal`, `idx_credit_reservation_capture_journal` (partial), `idx_credit_reservation_release_journal` (partial), `idx_story_user`, `idx_wallet_user`); drops `ticket_type_price_nonneg`, `ticket_type_quantity_nonneg`, `promo_code_discount_pct_range`. No RLS, function or trigger change.

### API / backend

- `packages/services/src/payments/webhookAck.ts` (+ `.test.ts`) — the acknowledgement table; `apps/web/src/app/api/paystack/webhook/route.ts` uses it for `charge.success` and answers 503 on database errors in the refund and transfer branches. Contract change for Paystack only: unsettled outcomes are now redelivered. No change to any client-facing envelope.

### Mobile

- `packages/ui-native/src/primitives/useKeyboardLift.ts` (new; moved from `apps/mobile/src/lib`, flags removed), `KeyboardInsetView.tsx` (new), `BottomBar.tsx` (continuous inset from the UI-thread value), `KeyboardAwareScrollView.tsx` (Android branch on `KeyboardInsetView`), `Sheet.tsx` (shared hook), `useKeyboardReveal.ts` (comment), `index.ts` (exports).
- `apps/mobile/app/(app)/messages/[conversationId].tsx` — `KeyboardInsetView` replaces `KeyboardAvoidingView`; the keyboard-show scroll effect is gone. `src/features/messaging/useChatScroll.ts` — `onKeyboardShow` removed. `src/components/messaging/contextMenu/EmojiPickerSheet.tsx` — rebuilt on `<Sheet>` + `<Input>`. `src/components/content/SpotlightCommentsPanel.tsx`, `StoryViewer.tsx` — import the shared hook. `src/lib/useKeyboardLift.ts` — deleted.

### Web / admin

- Only the webhook route (above). No admin change.

### Documentation

- `PROJECT.md` §7.2, §7.6, §16, §17 corrected; new §35. `docs/changelog/README.md` entry. `docs/mobile/guide/ios-vs-android.md` keyboard row. `docs/INDEX.md` links this report.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Type check, every workspace | `npm run typecheck` | 11/11 tasks successful (before and after the changes) |
| Services unit tests | `npx vitest run` in `packages/services` | 15 files, 118 tests before; `webhookAck.test.ts` adds 3 |
| Core unit tests | `npx vitest run` in `packages/core` | 50 files, 463 tests |
| Integration suite on a replayed local stack (includes the new migration) | `SUPABASE_TEST_PORT_OFFSET=-1000 npm run test:db:up` → `npm run test:integration` | 56 files passed, exit 0 |
| Lint | `npx biome check --write <touched files>` | clean, no fixes needed |
| API parity | `npm run check:api-parity` | 216 route handlers, all reachable |
| Docs | `npm run check:docs` | OK (pre-existing draft/decision warnings only) |
| Production build, web + admin | `npm run build` | 2/2 successful; web 218 static pages generated; no new warnings |
| Supabase advisors after the migration | `get_advisors` performance | unindexed FKs 36 → 17; security list unchanged (no new items) |
| Android emulator, production API, founder's account | Pixel_10_Pro_XL, dev client + Metro on 8097 via `adb reverse` | Sign-in form: card and Send button above the keys during and after the rise. Chat: composer directly on the keyboard with no gap, newest bubble in view, dismissal returns to the identical resting layout; three-line draft grows the field and the thread stays anchored; send resets the field. Emoji picker sheet: lifts with the keyboard, rejection state, back dismisses keyboard then sheet. Edit-message sheet (footer + input): Save button clear of the keys. Test message deleted afterwards |

**Not verified**: iOS (no Mac; `eas simulator` not available to this org); a real Paystack redelivery in response to a 503 (the mapping is unit-tested; the retry schedule is Paystack's); frame-by-frame smoothness on hardware (the emulator's keyboard animation completes faster than `screencap` can sample — the design is UI-thread by construction, and the settled layouts are correct at both ends).

## 6. Remaining risks

Only genuine ones:

- **iOS has never run this code.** Every keyboard change is universal, but `KeyboardInsetView` on iOS relies on `useAnimatedKeyboard` reporting the keyboard's frame including the home-indicator area, which is what `BottomBar` assumes when it collapses its inset. First TestFlight build should open a chat and a form.
- **F7** (refundable-amount RPC readable for any transaction UUID) — low, bounded, listed.
- **F9** (realtime `postgres_changes` per thread) — a scaling ceiling, not a defect; the replacement is named.
- **Founder-side items unchanged from the previous audit**: Postgres minor upgrade and leaked-password protection in the Supabase dashboard; Expo patch bumps with the next native build.

## 7. Health assessment

| Area | Note |
|---|---|
| Money path | Sound; the one silent-failure mode (webhook ack) is closed. Reconciliation cron would have surfaced a paid-no-ticket case within 30 minutes as an incident, so the exposure was "delay and support work", not loss |
| Access control | Sound; every privileged RPC and transport derives identity server-side |
| Mobile interaction | One keyboard architecture now; sheets, forms, chat and bottom bars read the same UI-thread value |
| Database | Constraints match the documentation again; index coverage matches the access paths; 40 cron jobs active |
| Observability | Sentry on three apps plus the self-hosted pipeline; reconciliation opens incidents; nothing open |
| Documentation | Corrected where it had drifted; this report and PROJECT.md §35 record the session |
