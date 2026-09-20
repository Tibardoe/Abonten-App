---
title: Expo SDK and mobile dependency migration 2026-09-19
purpose: Record why Abonten Mobile stays on Expo SDK 57, how the decode-uri-component advisory was resolved without a dependency override, and what an Android release candidate built from the result was verified to do.
audience: Founder, engineering, future auditors
scope: apps/mobile, scripts/, .github/workflows, the Android release candidate
status: Approved
version: 1.0
lastReviewed: 2026-09-19
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Expo SDK and mobile dependency migration 2026-09-19

Branch `chore/expo-sdk-57-dependency-migration`. The brief was a production-grade
Expo SDK migration, prompted by the `decode-uri-component` advisory that
`05-holistic-audit-2026-09-19.md` recorded as unfixable from this repository.

The investigation reversed both halves of that brief. No SDK upgrade was
appropriate, and the advisory was fixable. This report is written for a reader
who was not in the session.

## 1. The target SDK is the one already in use

`expo install --check` reports the project up to date, and every native module
matches the version Expo pins for SDK 57 in `bundledNativeModules.json`. The
question was therefore whether to move to SDK 58.

| Evidence | Source |
|---|---|
| `expo@57.0.24` is npm's `latest` | `npm view expo dist-tags` |
| SDK 58 exists only as `58.0.0-preview.3` / canary | same |
| SDK 58 is built on **React Native 0.88.0-rc.0** | `api.expo.dev/v2/versions/latest` |
| SDK 58 has no published changelog URL | same |
| **`expo-router@58.0.4` still declares `query-string: ^7.1.3`** | `npm view expo-router@58.0.4 dependencies` |

The last row settles it. Migrating to SDK 58 would put a production app on a
React Native *release candidate* and still ship the vulnerable package. SDK 57
at its latest patch is the safest supported combination, and the project is
already on it.

**`@sentry/react-native` was also left alone, deliberately.** Version 7.11.0 is
on an unmaintained major — the last 7.x release was 7.13.0 on 2026-02-12, the
day 8.0.0 shipped. But Expo pins `~7.11.0` in SDK 56, SDK 57 *and* the SDK 58
preview, so moving to 8.x would leave the supported set and fail `expo-doctor`.
Sentry 8's breaking changes are native (Sentry Android Gradle Plugin 6, Sentry
CLI 3, iOS 15+), which is the kind of thing Expo's pin exists to control. There
is no advisory against 7.11.0: `npm audit` flags `@sentry/react-native` only
through the `expo → @expo/config-plugins → xcode → uuid` build-time chain. Move
it when Expo moves its pin.

## 2. `decode-uri-component`, resolved

### What the advisory actually costs

GHSA-vcc3-ghjq-m6fr. When `decodeURIComponent()` throws on malformed
percent-encoding, `decode-uri-component@0.2.2` bisects the token list and
re-decodes both halves, once per starting split. Measured against the
replacement, on this machine:

| Tokens | Link length | Original | Replacement |
|---|---|---|---|
| 140 | 422 chars | 548 ms | 2.6 ms |
| 300 | 902 chars | 2,672 ms | 5.0 ms |
| 450 | 1,352 chars | **6,115 ms** | **8.8 ms** |

Six seconds of blocked JS thread, from a link that fits in a text message, is
an ANR.

### How exposed Abonten actually is

Stated precisely, because two earlier attempts at this got it wrong.

- A grep for importers of the module that calls `queryString.parse` finds none.
  That is **misleading**: react-navigation's core barrel re-exports it, and
  `useLinking.native` and `useLinkBuilder` both name it as their default
  `getStateFromPath`. It is live code, not dead code.
- But that default is **never taken in this app**. `ExpoRoot` renders
  `fork/NavigationContainer` with `linking={store.linking}`; that becomes
  `LinkingContext.options`; and `getLinkingConfig()` always defines
  `getStateFromPath`, which delegates to `fork/getStateFromPath` — a fork that
  parses query parameters with `expo.parseQueryParams` and does not import
  `query-string` at all.
- Sending the 450-token payload to a real device, to a build containing the
  vulnerable decoder and to one containing the replacement, produced no
  measurable difference. That is consistent with the above.

**Conclusion: a latent risk, not an exploit in flight.** Real code, a real cost,
one upstream change away from running. `05-holistic-audit`'s claim that it "runs
on every deep link" was too strong, and its stated call site
(`build/fork/getStateFromPath.js`) was simply the wrong file.

### Why it could not be fixed the obvious ways

- **Upgrade the package.** The advisory covers every release up to 0.4.2. The
  first patched release, 0.5.0, is ESM-only (`"type": "module"`, default
  export) while `query-string@7` reaches it through `require()`. An npm
  `overrides` pin makes `decodeComponent` an object rather than a function, so
  every call throws `TypeError: decodeComponent is not a function` — trading a
  denial of service for a hard crash while making `npm audit` look clean.
- **Upgrade Expo.** No SDK drops the chain (§1).
- **Upgrade `query-string`.** v8 and v9 are ESM-only and still depend on
  `decode-uri-component`; forcing a major onto a package that declares `^7`
  would also affect expo-router's Node and web builds.

### What was done instead

Metro resolves `decode-uri-component` to
`apps/mobile/vendor/decode-uri-component.js` — the same mechanism already used
in `metro.config.js` to pin `color-string` to v1. The npm dependency graph is
untouched, so expo-router's Node and web builds keep the package they declare;
only what the app bundles changes.

The replacement keeps the original's structure and its quirks deliberately: the
same pre-seeded byte-order-mark entries, the same replacement-map shape, the
same trailing `%C2` entry, and the same lossy tokeniser that drops a bare `%`.
Only the bisection is gone, replaced by one left-to-right pass that relies on
UTF-8 being self-synchronising. Getting that right took three attempts — the
first two disagreed with the original on 329 and then 1 of 433 inputs.

**Proved against the shipping artifact.** In the exported Android bundle,
`decodeComponents` (the bisecting function, unique to the vulnerable package)
is present before and absent after; `decodePass` and `decodeUriComponent`,
unique to the replacement, are absent before and present after. The same holds
for the bundle embedded in the release APK.

**`npm audit` is unchanged at 18 moderate, and that is correct.** The package is
still in the dependency graph; it is no longer in the app. A lower audit count
would have meant an override, which is the outcome this avoided.

## 3. Guards added

`npm run check:deep-link-decoder`, in CI. It fails the build if:

1. the Metro alias is missing;
2. the replacement disagrees with the original on any of **3,033** corpus
   inputs, including non-string inputs, which must throw the same `TypeError`;
3. the replacement stops being linear on the payload that defeats the original;
4. `expo-router`'s `getLinkingConfig` stops defining `getStateFromPath` — the
   single fact that keeps the vulnerable path unused. If that changes, the
   check says so and names the consequence.

Each failure mode was proved by causing it: removing the alias, breaking the
decoder (112 disagreements), and disabling `getStateFromPath` in the installed
expo-router.

## 4. Other fixes

- **`app.config.js` now takes the config Expo passes in** rather than re-reading
  `app.json`, which is what `expo-doctor`'s config check wanted. Verified by
  diffing `expo config --type prebuild` before and after, including the Google
  Maps key injection this file exists for. `expo-doctor`: 19/21 → 20/21.
- **The `disableHierarchicalLookup` comment was wrong.** It credited the flag
  with fixing EAS entry resolution; on SDK 57 Gradle resolves the entry through
  `expo/scripts/resolveAppEntry`, which reads package.json `main` and never
  loads the Metro config. Measuring what the flag actually buys: the Android
  bundle is 10,224,011 bytes with it and 11,075,409 without — **851 KB** of
  duplicate nested copies. Kept, with the real reason recorded. This is the one
  remaining `expo-doctor` finding, and it is deliberate.

## 5. Nothing else was changed

`react-native-url-polyfill`, `@gorhom/portal`, `react-dom` and
`react-native-web` were each checked for removal and each is genuinely used
(Supabase URL parsing, four sheet/keyboard call sites, and the `expo start
--web` target). No dependency was added, removed or pinned; `package-lock.json`
is untouched.

## 6. Verification

**Static.** typecheck 11/11 · `packages/core` 561 tests · `packages/services`
121 tests · `check:api-parity` 217 route handlers · `check:mobile-a11y` ·
`check:docs` · `check:deep-link-decoder` · Biome clean on every changed file ·
`expo-doctor` 20/21 (§4) · `expo install --check` up to date.

**Build.** The EAS cloud build could not run: the account's free-plan Android
builds are exhausted until 2026-10-01, and `eas build --local` requires
macOS or Linux. The release candidate was therefore built through Gradle
(`expo run:android --variant release`), which exercises the same clean
prebuild, all five config plugins (verified applied to the generated project),
the same Metro bundle including the alias, and R8. It is signed with the debug
keystore rather than the EAS upload key, so it is valid for emulator
verification and not for Play.

**Android emulator** (Pixel 10 Pro XL, Android 17 / API 37), release build,
`pkgFlags` without `DEBUGGABLE`:

| Area | Result |
|---|---|
| Cold start | 3360 / 2443 / 2496 / 2315 ms |
| Sentry | initialises with the correct DSN, native integrations and `libsentry.so` loaded |
| Email OTP sign-in | works end to end; OTP rate limiting fires correctly and is handled |
| Push | permission prompt on sign-in; a new `ExponentPushToken` row reached `device_token` at the moment of granting |
| Deep links | `/events/<code>` resolves code → id and renders the event; `/weekly`, `/spotlight` route correctly |
| Malformed deep link | 1,391-character payload: app launched, stayed responsive, no ANR |
| Navigation | all five tabs, stack push/pop, back, cold and warm start |
| Search | type-ahead through the API, full search, empty state with recovery |
| Messages | inbox with filters and avatars; send reached the database; **a server-side insert appeared in the open chat with no refresh** |
| Tickets | Active/Cancelled/Refunds/To review, ticket cards, QR and cancel actions |
| Keyboard | composer stays anchored above the keyboard; no regression of the fixed sheet/keyboard behaviour |
| Crashes | zero `FATAL EXCEPTION` and zero ANR across the session |

The messaging row matters most: it confirms the migrated build uses the current
broadcast architecture and does not depend on the `supabase_realtime`
publication the 2026-09-19 hardening removed the messaging tables from.

**Performance.** The only runtime code that changed is the decoder, and the
exported bundle is 235 bytes smaller (10,224,246 → 10,224,011). The cold-start
figures above are not compared against the previously installed build, because
that one was a **debug** build; the comparison would be meaningless.

## 7. Not verified

- **The map.** There is no event or place data in Accra, so the map renders its
  empty state and no `MapView` mounts. The Google Maps key is present in the
  generated manifest and no Maps authorisation error appeared, but the map
  itself was not seen drawing. `plugins/withAndroidMinification.js` already
  records this as needing an EAS build.
- **Checkout, payments, event and place creation, media upload, reviews and
  reports.** Not exercised in this pass.
- **iOS.** Not built or run.
- **An EAS cloud build**, and therefore the upload-keystore signing, source-map
  upload to Sentry, and a Play-installable artifact. Blocked on the build quota
  until 2026-10-01.

## 8. Still open elsewhere

`vitest@3.2.7` carries GHSA-82fw-gwwq-j7x9 (path traversal via
`@vitest/mocker`), fixed in 4.1.11. It is test tooling in `packages/core` and
`packages/services`, unrelated to mobile, and a major bump across 682 tests
does not belong on a mobile release-candidate branch. It should be its own
change.
