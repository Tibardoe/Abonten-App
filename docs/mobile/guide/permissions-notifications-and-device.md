---
title: Mobile permissions, notifications and device storage
purpose: What the app asks the device for, why, and how notifications, reminders, deep links and secure storage behave.
audience: Support, QA, privacy reviewer, engineering
scope: apps/mobile/app.json, src/features/notifications, src/features/reminders, src/lib/secureStore.ts
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Mobile permissions, notifications and device storage

## Permissions (declared in `app.json`)

| Permission | Plugin | User-facing reason (exact string) | Used for |
|---|---|---|---|
| Photos | `expo-image-picker` | "Abonten needs access to your photos so you can set a profile picture." | Avatar, flyers, place photos, highlights, message images |
| Camera | `expo-camera` | "Abonten uses the camera so organizers can scan ticket QR codes to check attendees in." | Organizer QR check-in |
| Microphone | `expo-audio` | "Abonten uses the microphone so you can record and send voice messages in chat." | Voice notes |
| Notifications | `expo-notifications` | system prompt | Push notifications; local event reminders |
| Location | `expo-location` (no custom string — **default OS wording**) | — | Explore near you, distance sorting, field-team check-ins (web only today) |

Declining any permission leaves the rest of the app usable (e.g. type a location instead of allowing GPS). Note: the Play Store Data safety form must match this table and the Privacy Policy (legal F2).

## Push notifications

On sign-in the app requests permission, obtains an Expo push token (`getExpoPushTokenAsync` with the EAS project id) and registers it via `POST /api/mobile/devices/register` (`device_token`). Android uses a notification channel; the icon and accent colour are set in `app.json`. Sign-out calls `/devices/unregister`. Delivery: `packages/services/src/notifications/sendPushNotification.ts` → Expo push API → FCM (`google-services.json` client config). Tapping a notification routes via `notificationLink.ts` to the related screen. Dead tokens are pruned when Expo reports `DeviceNotRegistered`.

## Local reminders

Event reminders are **local** notifications scheduled on the device (`src/features/reminders/eventReminders.ts`, Android channel); they are not synced or server-side.

## Deep links

Scheme `abonten://`; universal/app links for `https://abontenhub.com/events/*`, `/places/*`, `/invite/*` (Android intent filters with `autoVerify`; iOS associated domains declared). `+native-intent.ts` maps incoming URLs to routes. Invite capture: `/invite/CODE` links and the **Android Install Referrer** (`inviteCapture.ts`) store a pending invite code until sign-in.

## Secure storage (`expo-secure-store`, chunked)

Session tokens; `abonten.installId` (fraud signal, sent as `x-abonten-install-id`); pending invite and referral touches; explore location; recent searches; reminders index; inbox preferences; recent reactions. Removed on uninstall; session and push token removed on sign-out. Nothing is stored in plain AsyncStorage.

## Error and performance telemetry

Sentry (`EXPO_PUBLIC_SENTRY_DSN`, prod only, `sendDefaultPii: false`) and the self-hosted error/metric endpoints; request timings sampled to `app_request_metric`.

## Updates

JS-only changes ship over the air via EAS Update on the `preview` / `production` channels; native changes (new permissions or modules) need a new EAS build.
