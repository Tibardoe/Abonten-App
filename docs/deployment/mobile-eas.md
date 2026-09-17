---
title: Mobile builds and updates (EAS)
purpose: How the Android app is built, updated over the air and (eventually) submitted, with the environment model.
audience: Engineers
scope: apps/mobile, eas.json, EAS project @abonten-hub/abonten
status: Approved
version: 1.3
lastReviewed: 2026-09-17
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

Native release (build, then submit where configured) — `npm run release:native -w @abonten/mobile` (`apps/mobile/scripts/release-native.mjs`; `--platform android|ios`, `--no-submit`, `--dry-run`). It checks eas-cli ≥ 24.5.0 and `eas whoami`, refuses anything but a clean, pushed `main` (`--allow-branch` to override), type-checks, runs `eas build --profile production --non-interactive --wait`, then `eas submit --latest` for each platform with a `submit.production.<platform>` entry. iOS is configured (TestFlight); Android has no Play service account in `eas.json`, so its build is left on EAS for a manual Play Console upload. It never changes `version`: the `volume-observer` module (2026-09-17) is optional at runtime, so JavaScript updates still reach older binaries.

When to build vs update: a change to native modules, permissions (`app.json` plugins), or the Sentry/Expo config needs a **build**; TypeScript/asset changes ship as an **update**. Users receive updates on the next cold start (restart twice to force).

## Native config

`app.json`: package / bundle id `com.abonten.app` on both platforms, scheme `abonten`, associated domains / intent filters for abontenhub.com, plugins (secure-store, web-browser, image, sharing, dev-client, splash, notifications, font, image-picker, camera, audio, location, video, Sentry, two local plugins). `app.config.js` layers the Android Maps key and the EAS Update URL. Maps are Google on Android and Apple Maps on iOS (every `<MapView>` passes `PROVIDER_GOOGLE` only on Android); do not set `ios.config.googleMapsApiKey` — Expo's built-in Maps plugin then adds a `react-native-google-maps` pod that react-native-maps 1.x no longer has, and `pod install` fails. `google-services.json` (FCM client config) is tracked.

iOS specifics (2026-09-15): `ios.appleTeamId` is `KDDBR5P4D6` (Abonten Hub Ltd's Apple Developer team — a public identifier, not a secret; it also appears in `apps/web/public/.well-known/apple-app-site-association` as `KDDBR5P4D6.com.abonten.app`). `ITSAppUsesNonExemptEncryption` is `false` (the app only uses HTTPS, so the export-compliance question is pre-answered). The `expo-audio` plugin has `enableBackgroundPlayback: false` and the `expo-location` plugin declares the *when-in-use* permission string and no *always* strings — the app never plays audio in the background and never needs "always" location, and Apple rejects unjustified background modes. `NSMotionUsageDescription` **must stay**: expo-location 57 compiles in `CMMotionActivityManager` (its optional motion-activity API), so App Store Connect rejects any binary without the string (ITMS-90683 — build 0.2.0 (5) was rejected for exactly this after `motionUsagePermission: false` removed it). The app never requests motion access, so the string says so plainly rather than inventing a feature. Required Apple capabilities are exactly the two EAS derives from the config: **Push Notifications** (`aps-environment`, expo-notifications) and **Associated Domains** (`applinks:abontenhub.com`). Signing credentials (distribution certificate, provisioning profile, APNs push key) are EAS-managed on the `@abonten-hub/abonten` project — nothing signing-related lives in the repository.

## Stores

Android: Play listing not yet live (`ANDROID_APP_LISTED` false hides the store link on the invite page) — Data safety form must match the Privacy Policy (legal F2). iOS: Apple Developer enrolment complete (2026-09-15, team `KDDBR5P4D6`); the first production build needs one interactive `eas build --platform ios --profile production` from a terminal so EAS can sign in to Apple (two-factor), register the App ID `com.abonten.app` with Push Notifications + Associated Domains and create the EAS-managed distribution certificate, provisioning profile and push key — after that non-interactive builds work. Apple sign-in needs eas-cli ≥ 24.5.0 (older versions fail with "iTunes service key is empty"). Nothing submitted yet. Store submission steps: `../mobile/08-phase-6-release-prep.md` §9.

## After an update

Open the app on a device: Home loads; sign in; a push test (Admin › Notifications › Resend); check Sentry `abonten-mobile` for the new release.
