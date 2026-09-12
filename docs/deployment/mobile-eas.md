---
title: Mobile builds and updates (EAS)
purpose: How the Android app is built, updated over the air and (eventually) submitted, with the environment model.
audience: Engineers
scope: apps/mobile, eas.json, EAS project @abonten-hub/abonten
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile builds and updates (EAS)

Detailed history and one-off setup: `../mobile/08-phase-6-release-prep.md`.

## Profiles (`eas.json`)

| Profile | Distribution | Channel / environment | Notes |
|---|---|---|---|
| `development` | internal, dev client | development | `expo start --dev-client` on a device |
| `preview` | internal | preview | Android **APK**; iOS simulator build (never produced) |
| `production` | store | production | `autoIncrement` version |

`appVersionSource: remote`; runtime version policy `appVersion` (`app.json` `version` 0.2.0) — a native change requires bumping the app version so updates target the right runtime.

## Environment

EAS project-scoped environment variables (not `eas.json` `env` blocks): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT`; `SENTRY_AUTH_TOKEN` as an EAS secret for source maps. `apps/mobile/.env` mirrors them for local `expo start`. **Never** a server secret.

## Commands

```bash
eas build --profile preview --platform android      # internal APK for QA
eas build --profile production --platform android   # store build
eas update --channel preview                        # JS-only change to preview installs
eas update --channel production                     # JS-only change to production installs
```

When to build vs update: a change to native modules, permissions (`app.json` plugins), or the Sentry/Expo config needs a **build**; TypeScript/asset changes ship as an **update**. Users receive updates on the next cold start (restart twice to force).

## Native config

`app.json`: package `com.abonten.app`, scheme `abonten`, associated domains / intent filters for abontenhub.com, plugins (secure-store, web-browser, image, sharing, dev-client, splash, notifications, font, image-picker, camera, audio, video, Sentry, two local plugins). `app.config.js` layers the Maps key and the EAS Update URL. `google-services.json` (FCM client config) is tracked.

## Stores

Android: Play listing not yet live (`ANDROID_APP_LISTED` false hides the store link on the invite page) — Data safety form must match the Privacy Policy (legal F2). iOS: blocked on Apple Developer enrolment (D-U-N-S); nothing submitted. Store submission steps: `../mobile/08-phase-6-release-prep.md` §9.

## After an update

Open the app on a device: Home loads; sign in; a push test (Admin › Notifications › Resend); check Sentry `abonten-mobile` for the new release.
