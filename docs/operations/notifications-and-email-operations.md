---
title: Notifications and email operations
purpose: How in-app notifications, push and email are produced and delivered, how to check delivery, and how to fix the common failures.
audience: Operations, engineering, support
scope: notification, device_token, web_push_subscription, push_receipt, notification_delivery queue, Expo push, web push, Resend, Supabase Auth SMTP
status: Approved
version: 1.1
lastReviewed: 2026-09-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Notifications and email operations

## Three channels

| Channel | Produced by | Delivered by | Preference control |
|---|---|---|---|
| **In-app** (`notification` rows) | `createNotificationCore` from services; SQL triggers/RPCs for cancellations, reviews, rewards, field ops; admin Resend/Broadcast | Read by web bell / app list | none (part of the service) |
| **Push** (Expo) | `createNotificationCore` fires a best-effort push to the user's `device_token`s; reward and SQL-written notices go through the `notification_delivery` queue | `sendPushNotification.ts` → `exp.host/--/api/v2/push/send` (FCM on Android) | device settings; sign-out removes the token; `DeviceNotRegistered` in the send ticket or in the receipt read 15 minutes later (`push_receipt`, `pushReceiptsCore.ts`) prunes it |
| **Push** (browser) | The same `sendPushToUser` call also sends to `web_push_subscription` rows (`webPushCore.ts`, `web-push`, VAPID) | Browser vendor push service (FCM, Mozilla, Apple, Microsoft) → `apps/web/public/push-sw.js` | Settings › Notifications › Browser notifications; sign-out removes this browser; 404/410 from the push service deletes it. Needs `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` |
| **Email** (Resend) | Ticket confirmation (`ticketPurchaseNotification.ts`, PDF attached), event cancellation, reward updates (queue), **sign-in codes** (Supabase Auth with Resend SMTP) | Resend API / SMTP | reward emails: Rewards page toggle, signed unsubscribe link, RFC 8058 one-click (`notification_preference.reward_emails`) |

## The delivery queue (rewards + app pushes)

`notification_delivery` rows are claimed by `run_notification_delivery()` (pg_cron every minute) → `POST /api/notifications/deliver` (token from `notification_delivery_config`, **not** an env var) → `deliveryCore.ts` sends one push / one email per person and records the outcome. Rules: pushes only 08:00–21:00 Accra; one reward email per person per 12 h; stale rows dropped (push and recommendation email 1 day, other email 7 days); 5 failures → `failed`. The same route then reads due Expo push receipts; the minute job wakes it for those too. Switches: Admin › Rewards › Settings › Notifications. Statistics: same page (7 days).

## Recommendation notices and alerts (Discovery)

Shipped switched off. People opt in (organizer or place bell, "Enjoy events like this?" after a ticket or RSVP, "Like this place?" after a favorite, review or second check-in). The `recommendations-generate` and `recommendations-digest` jobs turn new listings into at most one digest a day and three a week per person, queued as `notification_delivery` rows with `source = 'recommendations'` (never urgent). At send time the claim skips a row as `channel_off` when the engine is off or in shadow, and as `opted_out` when the person turned that kind of notice off or paused. Push and in-app. A recommendation **email** of the same digest is built but switched off until legal item G1 is Decided; when on, it reaches only people who switched it on, is skipped at send time as `channel_off` / `opted_out` / `not_visible`, and every opt-in and opt-out is kept in `notification_consent_event` ([../architecture/discovery-search-and-recommendations.md](../architecture/discovery-search-and-recommendations.md) §4.4).

People control these in Settings › Notifications on web and mobile: organizer alerts, place updates, similar events and places, push for messages, reviews and bookings (`social_push`), a two-week pause, and a Stop button per subscription. Tickets, payments, refunds, cancellations, security and verification notices cannot be turned off. Operator handbook: [../admin/discovery.md](../admin/discovery.md).

## Checks

1. **Is the in-app row there?** Admin › Notifications, filter by recipient. If not, the producing action failed — look at Sentry / error groups.
2. **Push:** does the user have a `device_token`? (they must have signed in on the app and accepted permission). Health `expo` green? For queue rows: `select channel, status, detail, count(*) from notification_delivery where created_at > now() - interval '1 day' group by 1,2,3` — `waiting` at night is normal, `no_device` = no app install and no browser subscription, `failed` = provider error. Receipts not yet read: `select count(*), min(created_at) from push_receipt` (rows older than a day are dropped). Provider errors from receipts (`MessageTooBig`, `InvalidCredentials`, …) are logged as "Push receipt error" and reach Sentry.
3. **Email:** health `resend`; Resend dashboard → Emails (delivered/bounced/complained) and Suppressions; `no_email` = phone-only account; `opted_out` = reward emails off, or for a recommendation push or email the person's switch for that channel is off or they paused; `channel_off` = the Discovery engine is off or in shadow, or recommendation email is off; `email_disabled` = `RECOMMENDATION_EMAIL_KILL_SWITCH` is set. Sign-in codes: Supabase Auth logs and the SMTP setting (Resend); the built-in Supabase sender is rate-capped and must not be relied on in production.
4. **Route auth:** a 401 from `/api/notifications/deliver` means the header token ≠ `notification_delivery_config` row — never copy that token elsewhere.

## Fixes

- **Retry failed queue rows:** `update notification_delivery set status='queued', attempts=0 where status='failed' and created_at > now() - interval '1 day';` (engineer, after the cause is fixed).
- **Resend a specific notice:** Admin › Notifications › Resend (`notifications.send`).
- **Ticket email lost:** Resend the confirmation notification; the buyer can also download the PDF from the ticket.
- **Resend domain issues:** verify DNS (SPF/DKIM) in the Resend dashboard; check `RESEND_API_KEY` on Vercel.
- **Broadcast a service notice:** Admin › Notifications › Broadcast (in-app only).

## Templates

`apps/web/src/components/organisms/{TicketPurchaseEmailTemplate,EventCancellationEmailTemplate,RewardUpdateEmailTemplate,RecommendationDigestEmailTemplate}.tsx` (+ `EmailParts.tsx`), Tailwind email config `apps/web/tailwind.email.config.ts`. Supabase Auth templates (Magic Link with `{{ .Token }}`, Confirm email change) are configured in the Supabase dashboard — see `../architecture/email-auth.md`.

## Retention

`notification` and `notification_delivery` have no purge (decision R4).
