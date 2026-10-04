---
title: Mobile builds and updates (EAS)
purpose: How the Android app is built, updated over the air and (eventually) submitted, with the environment model.
audience: Engineers
scope: apps/mobile, eas.json, EAS project @abonten-hub/abonten
status: Approved
version: 1.6
lastReviewed: 2026-10-04
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

`appVersionSource: remote`; runtime version policy `appVersion` (`app.json` `version` 0.3.0 since 2026-10-04) — a native change requires bumping the app version so updates target the right runtime. **An update may only load native modules every binary of its runtime has**: guard an optional one with `requireOptionalNativeModule("Name")` before requiring its package — a try/catch around `require` does not help, because Metro reports a failed module initialisation as fatal first (update `f4d1a5bc` crashed 0.3.0 installs for ten minutes on 2026-10-04 and was rolled back with `eas update:roll-back-to-embedded`). 0.3.0 was cut because installed 0.2.0 binaries lack native modules today's JavaScript uses (iOS build 17 of 2026-09-27 has no `expo-blur` for the glass tab bar; the Android preview APKs of 2026-09-15 also lack the volume and gesture-exclusion modules and `expo-system-ui`): an update published on 0.2.0 would have reached them.

## Environment

EAS project-scoped environment variables (not `eas.json` `env` blocks): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT`; `SENTRY_AUTH_TOKEN` as an EAS secret for source maps. `apps/mobile/.env` mirrors them for local `expo start`. **Never** a server secret.

## Commands

```bash
eas build --profile preview --platform android      # internal APK for QA
eas build --profile production --platform android   # store build
eas update --channel preview                        # JS-only change to preview installs
eas update --channel production                     # JS-only change to production installs
```

Native release (build, then submit where configured) — `npm run release:native -w @abonten/mobile` (`apps/mobile/scripts/release-native.mjs`; `--platform android|ios`, `--no-submit`, `--dry-run`). `submit.production.ios` carries the App Store Connect app id (`ascAppId` 6812440895, a public identifier) so a submission never needs an interactive prompt — `eas submit --platform ios --profile production --url <ipa> --non-interactive` uploads a finished archive when a build's status hangs (build 0.3.0 (18) stayed "in progress" on EAS for an hour after its archive was uploaded on 2026-10-04 and was submitted this way). It checks eas-cli ≥ 24.5.0 and `eas whoami`, refuses anything but a clean, pushed `main` (`--allow-branch` to override), type-checks, runs `eas build --profile production --non-interactive --wait`, then `eas submit --latest` for each platform with a `submit.production.<platform>` entry. iOS is configured (TestFlight); Android has no Play service account in `eas.json`, so its build is left on EAS for a manual Play Console upload. It never changes `version`: the `volume-observer` module (2026-09-17) is optional at runtime, so JavaScript updates still reach older binaries.

When to build vs update: a change to native modules, permissions (`app.json` plugins), or the Sentry/Expo config needs a **build**; TypeScript/asset changes ship as an **update**. Users receive updates on the next cold start (restart twice to force).

## Native config

`app.json`: package / bundle id `com.abonten.app` on both platforms, scheme `abonten`, associated domains / intent filters for abontenhub.com, plugins (secure-store, web-browser, image, sharing, dev-client, splash, notifications, font, image-picker, camera, audio, location, video, Sentry, two local plugins). `app.config.js` layers the Android Maps key and the EAS Update URL. Maps are Google on Android and Apple Maps on iOS (every `<MapView>` passes `PROVIDER_GOOGLE` only on Android); do not set `ios.config.googleMapsApiKey` — Expo's built-in Maps plugin then adds a `react-native-google-maps` pod that react-native-maps 1.x no longer has, and `pod install` fails. `google-services.json` (FCM client config) is tracked.

iOS specifics (2026-09-15): `ios.appleTeamId` is `KDDBR5P4D6` (Abonten Hub Ltd's Apple Developer team — a public identifier, not a secret; it also appears in `apps/web/public/.well-known/apple-app-site-association` as `KDDBR5P4D6.com.abonten.app`). `ITSAppUsesNonExemptEncryption` is `false` (the app only uses HTTPS, so the export-compliance question is pre-answered). The `expo-audio` plugin has `enableBackgroundPlayback: false` and the `expo-location` plugin declares the *when-in-use* permission string and no *always* strings — the app never plays audio in the background and never needs "always" location, and Apple rejects unjustified background modes. `NSMotionUsageDescription` **must stay**: expo-location 57 compiles in `CMMotionActivityManager` (its optional motion-activity API), so App Store Connect rejects any binary without the string (ITMS-90683 — build 0.2.0 (5) was rejected for exactly this after `motionUsagePermission: false` removed it). The app never requests motion access, so the string says so plainly rather than inventing a feature. Required Apple capabilities are exactly the two EAS derives from the config: **Push Notifications** (`aps-environment`, expo-notifications) and **Associated Domains** (`applinks:abontenhub.com`). Signing credentials (distribution certificate, provisioning profile, APNs push key) are EAS-managed on the `@abonten-hub/abonten` project — nothing signing-related lives in the repository.

## Stores

Android: Play listing not yet live (`ANDROID_APP_LISTED` false hides the store link on the invite page) — Data safety form must match the Privacy Policy (legal F2). iOS: Apple Developer enrolment complete (2026-09-15, team `KDDBR5P4D6`); the first production build needs one interactive `eas build --platform ios --profile production` from a terminal so EAS can sign in to Apple (two-factor), register the App ID `com.abonten.app` with Push Notifications + Associated Domains and create the EAS-managed distribution certificate, provisioning profile and push key — after that non-interactive builds work. Apple sign-in needs eas-cli ≥ 24.5.0 (older versions fail with "iTunes service key is empty"). Builds go to TestFlight (internal testing); the first external beta review (0.2.0 (6), 2026-09-15) was rejected under Guideline 2.1(a) because no demo account was given, which "App Review sign-in" below answers. Not yet submitted to the App Store. Store submission steps: `../mobile/08-phase-6-release-prep.md` §9.

## App Review sign-in

App Review (TestFlight external testing and the App Store) needs a demo account it can sign in with. Abonten signs people in only with one-time codes, which a reviewer cannot receive, so one phone number gets a fixed code instead of a text message (`packages/services/src/profile/otpProviders/appReviewOtpProvider.ts`, 2026-09-29):

- **Settings** — `APP_REVIEW_PHONE_E164` (the number, E.164) and `APP_REVIEW_OTP_CODE` (exactly six digits, random) on the web project's **Production** environment only. Both missing or malformed: off, and the number is an ordinary one again. The number must never belong to anyone's real Abonten account: whoever holds the number and code signs in to that account.
- **Scope** — only a sign-in routes there (`routeOtpForPhone(…, { purpose: "sign-in" })`); a phone change or a Field Ops owner's consent for the same number goes to the market's provider as usual. The usual limits still hold: five guesses a code, ten codes a day for the number. Each request and check is logged (`app_review_code_requested` / `app_review_code_checked`, never the code).
- **App Store Connect** — TestFlight › Test Information › Beta App Review Information (and the App Store version's App Review Information): "Sign-in required" on, user name = the number, password = the code, and notes saying to choose "Continue with phone", pick Ghana (+233) and enter the six-digit code. While production Paystack runs on test keys the notes also give Paystack's public test card, and must change when live keys go in. `asc testflight review edit` sets these from a terminal.
- **Rotation** — change the code in Vercel and in App Store Connect together. Remove both settings when no review is pending if you prefer; a pending review then fails to sign in.
- A phone sign-in on a second device signs the first out (every phone sign-in sets a new one-time password), so two reviewers at once can bump each other. Reviewers act in production: remove any test listing they create.
- **Every sign-in spends one of the number's codes** (five an hour, ten a day), and a reviewer who meets the limit sees "Too many codes" — so staff should not sign in to the demo account casually while a review is pending, and each staff sign-in also signs out a reviewer.
- **Sample content (2026-09-29):** production had no upcoming events, so the demo account (named "Abonten Events") organizes eight sample events in Accra, Kumasi and Cape Coast (10 October – 21 November 2026; five free, three paid) with original typographic flyers, each description ending "This is a sample event while Abonten gets ready to launch." It also holds one free ticket (Accra Tech Meetup). **Remove the sample events before switching Paystack to live keys** ([../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)) and before public launch.

## After an update

Open the app on a device: Home loads; sign in; a push test (Admin › Notifications › Resend); check Sentry `abonten-mobile` for the new release.
