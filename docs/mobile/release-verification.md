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
| Current production build / update group | **None.** `eas build:list` (2026-09-12) shows only `preview` and `development` builds; **no production build has ever been made**, no EAS Update had ever been published on any channel before 2026-09-12, and the app is not in Google Play. An update on the `production` channel would therefore reach no install. |
| Preview build containing this programme | EAS build `598fdb7f-2f23-4073-a5bb-028834c4c1cc` — profile `preview`, channel `preview`, runtime `0.2.0`, version code 2, commit `9b6c8b23` (main after the merge), finished 2026-09-12 19:28 UTC, fingerprint `6f87b7f6…`. Built because native dependencies (`expo-audio`, `expo-application`, `expo-clipboard`, an `/invite` intent filter) had changed since the previous preview build of 2026-09-06, so an update alone could not have been loaded safely by that build. |
| Preview update containing this programme | EAS Update group `d5102dde-714e-4b8a-82b3-1e07aab42cbf` (Android update `01a0971c-…`), branch/channel `preview`, runtime `0.2.0`, commit `9b6c8b23`, published 2026-09-12 |

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

Two device set-ups were used on 2026-09-12 (tester: engineering, driven over `adb`, both signed out — no test account session was available):

- **A — Development client + Metro**, AVD `abonten_a35` (emulator-5554): the debuggable dev client already installed there (version code 1) loaded the current `main` bundle from Metro. This exercises the exact JavaScript of the release but not the EAS artefact.
- **B — EAS preview build `598fdb7f`**, AVD `Pixel_10_Pro_XL` (emulator-5556): the APK downloaded from EAS and installed with `adb install` (version code 2 confirmed). This is the artefact users on the `preview` channel would receive.

| Change | SOURCE VERIFIED | BUILD VERIFIED | DEVICE VERIFIED | PRODUCTION VERIFIED |
|---|---|---|---|---|
| Sign-in legal links (Terms, Privacy) | Yes — `turbo typecheck` 11/11, Biome clean | Yes — build `598fdb7f`, update `d5102dde` | **Yes (A):** consent line renders; tapping "Terms" and "Privacy Policy" each opened a Chrome custom tab on `abontenhub.com` showing the Terms and Conditions / Privacy Policy 1.2-draft pages. Not repeated on B | **Not applicable yet** — no production build exists |
| Drawer legal rows (Terms, Privacy, Cookies, Security) and Help centre | Yes | Yes | **Yes (A and B):** on A each row opened the matching live page (Privacy Policy 1.2-draft, Cookie Policy 1.0-draft, Security at Abonten 1.2-draft with "Responsible disclosure" in the contents, Help centre); on B all five rows are present and Terms opened `abontenhub.com` in the custom tab | Not applicable yet |
| Drawer social icons (X, Instagram, TikTok) | Yes | Yes | **Yes (A):** each opened Chrome at `x.com/abontenhub`, `instagram.com/abontenhub`, `tiktok.com/@abontenhub` respectively; **B:** icons present, not tapped | Not applicable yet |
| Drawer support-email row | Yes | Yes | **Yes (A):** row shows `support@abontenhub.com`; tapping fired the mail intent and opened Gmail (the emulator's Gmail is not set up, so its welcome screen appeared — the intent resolution is what was under test); **B:** row present | Not applicable yet |
| Copyright line "© 2026 Abonten Hub Ltd" | Yes | Yes | **Yes (A and B)** | Not applicable yet |
| Settings hub rows (Help centre, Legal) | Yes | Yes | **DEVICE VERIFICATION PENDING** — the Settings hub requires a signed-in session and no test account could be signed in on either emulator (no Google account on the device; phone and email codes go to real inboxes) | Not applicable yet |
| i18n keys (six locales) | Yes (JSON valid, typecheck) | Yes | **DEVICE VERIFICATION PENDING** — English only was exercised; translations also await native review (decision D3) | Not applicable yet |

## What "production" means here, and why nothing was published to it

The `production` channel has no build listening to it (see the facts table). Publishing an EAS Update there would be a no-op, and producing the first production build (`eas build --profile production`, `autoIncrement`) is the first step of a store release — a business decision (Google Play listing, Data safety form: legal F2; iOS: decision D2), not a documentation task. **Decision required before any production release: none was made on 2026-09-12 and no production artefact was created.**

## Procedure to close the remaining cells

1. **Settings hub rows and locales (DEVICE):** sign a test account into either emulator (a Google account on the device, or a test phone/email the tester can read), open Account › Settings, confirm the Help centre and Legal rows open the live pages, then switch the device language to French and confirm the new strings render. Record device, date, tester and result.
2. **PRODUCTION:** when the founder decides to release, `eas build --profile production --platform android` from `main`, submit to Google Play, then publish updates with `eas update --channel production --environment production`; repeat the drawer and sign-in checks on a production install and record the update id and date here.

Open-item register: `../operations/open-items.md` (M1).
