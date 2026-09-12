---
title: Mobile application documentation
purpose: Product-level documentation of the Abonten Android app (Expo) — navigation, screens, permissions, notifications, maps, camera/media, platform differences — plus the index of the historical build logs in this folder.
audience: Product, support, QA, engineering
scope: apps/mobile (Expo SDK 57, Expo Router)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile application documentation

| Guide | Contents |
|---|---|
| [guide/navigation-and-screens.md](guide/navigation-and-screens.md) | Tabs, drawer, every screen and what it does |
| [guide/permissions-notifications-and-device.md](guide/permissions-notifications-and-device.md) | Permissions requested, push, reminders, secure storage, deep links |
| [guide/ios-vs-android.md](guide/ios-vs-android.md) | What differs, what only exists on Android, iOS status |

## Status

- **Android:** built and device-verified (EAS `preview` APK and `production`); Play Store listing pending (`ANDROID_APP_LISTED` flag hides the store link until then).
- **iOS:** the code is universal, but **no iOS build has ever been produced** (Apple Developer enrolment blocked on a D-U-N-S number). Nothing iOS-specific is claimed in user documentation.
- Bundle/package `com.abonten.app`; scheme `abonten`; universal links `abontenhub.com/{events,places,invite}`; EAS project `@abonten-hub/abonten`.

## How the app talks to the backend

Two lanes (`../architecture/shared-backend.md`): **class A** direct Supabase reads/CRUD under RLS (`src/lib/supabase.ts`), and **class B/C** through the typed `@abonten/api-client` → `/api/mobile/**` (Bearer JWT; `getMobileAuth`). The app never imports `@abonten/services`. Every request carries `x-abonten-install-id` (fraud signal) and the platform header.

## Historical logs in this folder

`00-phase-0-findings.md` … `16-refinement-followups.md` are the build-out logs of the mobile app (monorepo split, packages, API layer, Expo skeleton, feature slices, release prep, parity rounds, redesigns). They are **history**, kept for context; several carry "superseded/RESOLVED" banners. Do not use them as current product documentation — use the guides above and the public help centre (`/help`, source `apps/web/src/content/help/`).

## Error monitoring

Sentry `abonten-mobile` (`src/lib/sentry.ts`, disabled in dev, navigation breadcrumbs, no PII) plus the self-hosted `reportClientError` pipeline (`/api/observability/error`) and request-timing metrics (`/api/mobile/observability/metric`).
