---
title: iOS vs Android
purpose: Record the actual platform differences in the codebase and the true state of the iOS build, so documentation never claims iOS behaviour that has not been verified.
audience: Product, support, QA, engineering
scope: apps/mobile
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# iOS vs Android

## Status

| Platform | Built? | Verified? | Store |
|---|---|---|---|
| Android | Yes (EAS preview APK, production) | Yes — repeated device QA on an emulator and devices | Not yet listed (`ANDROID_APP_LISTED` false) |
| iOS | **No** — no build has ever been produced; Apple Developer enrolment blocked on a D-U-N-S number | No | — |

User documentation therefore describes **Android only** and says an iPhone version is not yet available. Everything below about iOS describes code paths, not verified behaviour.

## Platform-specific code (`Platform.OS` checks)

| Area | Android | iOS (unverified) | Source |
|---|---|---|---|
| Keyboard avoidance | `KeyboardInsetView` (Reanimated `useAnimatedKeyboard`, UI-thread inset from the physical bottom edge — the window is edge-to-edge and the IME does not resize it) | full-screen forms: `automaticallyAdjustKeyboardInsets` on the scroll view; chat thread: the same `KeyboardInsetView` | `@abonten/ui-native` `KeyboardInsetView.tsx`, `KeyboardAwareScrollView.tsx`, `BottomBar.tsx`, `Sheet.tsx`, `useKeyboardLift.ts`; React Native's `KeyboardAvoidingView` is no longer used anywhere in the app |
| Maps provider | Google (`PROVIDER_GOOGLE`) with `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Apple Maps default | `NativeMap.tsx`, `SocialMap.tsx`, `MapPickerSheet.tsx` |
| Push channel | Android notification channel created | APNs via Expo (needs Apple push credentials — unchecked) | `usePushRegistration.ts` |
| Reminders | `channelId` set | — | `eventReminders.ts` |
| Install referrer (invites) | Play Install Referrer read once | not available | `inviteCapture.ts` |
| Opening app settings (permission denied) | intent to app settings | `app-settings:` URL | `TicketScannerSheet.tsx`, `PlaceCheckInSheet.tsx` |
| Native root background | decor view painted with the theme background (`expo-system-ui`) | window + root view controller painted (`expo-system-ui`) | `app/_layout.tsx`, `src/lib/nativeBackground.ts` |
| Directions | `geo:` intent (system chooser) | Apple Maps URL (`maps.apple.com`) | `src/lib/directions.ts` |
| Detail mini map | Google lite mode (static bitmap) | Apple Maps with gestures off; touch blocking on a wrapper view only, because a recycled map view kept `userInteractionEnabled = NO` and froze the next map | `src/components/map/StaticMapPreview.tsx` |
| Share sheet | `Share.share` message carries the link | `Share.share` with `url` too; must wait for any closing modal (`useModalHandoff`) | `src/lib/share.ts`, `EventCardMenu.tsx` |
| Universal links | intent filters with `autoVerify` for events/places/invite | `associatedDomains: applinks:abontenhub.com` (AASA served by web) | `app.json`, `apps/web/public/.well-known` |
| Picture-in-picture manifest | custom plugin | — | `plugins/withPictureInPictureManifest` |
| Native build fix | custom plugin | — | `plugins/withAndroidNativeBuildFix` |

## What to do when iOS ships

1. Obtain Apple Developer access; `eas build --profile preview --platform ios` and a device build; `eas device:create` for ad-hoc.
2. Verify: Google sign-in redirect (`abonten://auth/callback`), APNs push credentials, camera scanner, voice notes, maps, universal links (AASA), Sentry.
3. Update: this page, `../README.md`, the public help (`web-vs-app.md`, `getting-started.md`), App Store privacy labels (legal F3), and the account-deletion requirement (already satisfied by self-service deletion).
