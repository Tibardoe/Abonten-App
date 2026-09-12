---
title: Mobile release verification (M1)
purpose: State exactly how far each mobile change on the documentation branch has been verified — source, build, device, production — and what release mechanism carries it to users, so nobody reads "typecheck passes" as "live on phones".
audience: Engineering, QA, founder
scope: apps/mobile (Android; iOS has never been built) and the shared packages it bundles (@abonten/core brand constants, @abonten/i18n messages)
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile release verification (M1)

## Verification levels (use these words, nothing softer)

| Status | Meaning | Evidence |
|---|---|---|
| **SOURCE VERIFIED** | The code exists on the branch and the automated checks that cover it pass (`turbo typecheck`, Biome, unit tests where they exist) | CI run or local command output |
| **BUILD VERIFIED** | An EAS build or EAS Update containing the change was produced successfully | EAS build id or update group id |
| **DEVICE VERIFIED** | That build or update was installed on a physical device or emulator and the behaviour was exercised by hand | Test record (device, date, steps, result), screenshots |
| **PRODUCTION VERIFIED** | The change is in the build or update users actually receive, and was checked after release | Production channel update id; a test on a production install |
| **DEVICE VERIFICATION PENDING** | No device test has happened | — |

"Expo starts", "the dev build works on my machine", "TypeScript passes" and "the feature is in the source" are all **SOURCE VERIFIED at most**.

## App and release facts (from `apps/mobile/app.json`, `eas.json`, `package.json`)

| Fact | Value |
|---|---|
| App | Abonten — Android package `com.abonten.app`; iOS bundle id declared but **iOS has never been built** |
| App version | `0.2.0` (`expo.version`); EAS `appVersionSource: remote`, production builds `autoIncrement` |
| Runtime version policy | `appVersion` → runtime version `0.2.0`; an EAS Update only reaches installs whose native build has runtime version `0.2.0` |
| Update channels | `development`, `preview`, `production` (one per EAS build profile) |
| Updates library | `expo-updates` ~57.0.21 (Expo SDK 57) |
| Current production build / update group | **NOT DETERMINED FROM CODE** — read from the EAS dashboard (`eas build:list`, `eas update:list --channel production`) before releasing |

## Changes on the documentation-programme branch that affect the app

Commits `14c0bae8`, `00e42d28`, `adeb4693`, `4b22f8c1`.

| Change | Files | Native code touched? | Release mechanism |
|---|---|---|---|
| Sign-in screen links Terms and Privacy at `abontenhub.com/legal/*` (was the non-existent `abonten.com/terms`) via the in-app browser | `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/src/lib/legalLinks.ts` | No (`expo-web-browser` was already a dependency) | EAS Update |
| Drawer: four legal rows open the right pages; Help centre row; official X / Instagram / TikTok icons; support-email row; copyright reads "Abonten Hub Ltd" | `apps/mobile/src/components/app/AppDrawer.tsx` | No | EAS Update |
| Settings hub: "Help centre" and "Legal" rows | `apps/mobile/app/(app)/settings/index.tsx` | No | EAS Update |
| Shared constants bundled into the app | `packages/core/src/brand/{socialLinks,legalEntity,contacts}.ts` | No | EAS Update |
| New message keys `auth.consentNotice`, `settings.nav.help`, `settings.nav.legal` in six locales (Akan = English) | `packages/i18n/messages/*/{auth,settings}.json` | No | EAS Update |

No new native module, permission, config-plugin or `app.json` change is on the branch, so **an EAS Update on the `production` channel is sufficient**; no new native build, Google Play release or App Store release is needed. If the production install's runtime version is not `0.2.0`, a new native build is required first (check the dashboard).

## Verification status (as of 2026-09-12)

| Change | SOURCE VERIFIED | BUILD VERIFIED | DEVICE VERIFIED | PRODUCTION VERIFIED |
|---|---|---|---|---|
| Sign-in legal links | Yes — `turbo typecheck` 11/11, Biome clean | No — no EAS Update published from this branch | **DEVICE VERIFICATION PENDING** | Pending |
| Drawer legal / help / social / support / copyright rows | Yes | No | **DEVICE VERIFICATION PENDING** | Pending |
| Settings hub rows | Yes | No | **DEVICE VERIFICATION PENDING** | Pending |
| Brand constants | Yes | No | **DEVICE VERIFICATION PENDING** | Pending |
| i18n keys (six locales) | Yes (JSON valid, typecheck) | No | **DEVICE VERIFICATION PENDING** — translations also await native review (decision D3) | Pending |

Why device verification has not happened: no emulator or device was attached during the programme (`adb devices` empty on 2026-09-12) and the app is not installed on the available AVDs (`Pixel_10_Pro_XL`, `abonten_a35`); a device test needs a development or preview build that contains the branch, which has not been produced.

## Procedure to reach each level

1. **BUILD VERIFIED** — after merging to `main`: `eas update --channel preview --message "<commit>"` (preview first), then `eas update --channel production …`. Record the update group ids here.
2. **DEVICE VERIFIED** — install the preview build on the emulator (`emulator -avd abonten_a35`, then `adb install <apk>` or open the dev client), load the preview update, and check: sign-in screen → Terms / Privacy open the live legal pages in the in-app browser; drawer → each legal row, Help centre, each social icon (opens X / Instagram / TikTok), the support-email row (opens the mail app to support@abontenhub.com), copyright line; Settings → Help centre and Legal rows; switch the device language to French and confirm the new strings render. Record device, date, tester and result per row above.
3. **PRODUCTION VERIFIED** — after the production update: on a production install, repeat the drawer and sign-in checks; record the update id and date.

Until each cell above is filled with evidence, the mobile side of this programme is **SOURCE VERIFIED only**. Open-item register: `../operations/open-items.md` (M1).
