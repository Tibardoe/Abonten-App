# Phase 6 — release prep (EAS, assets, deep links, device pass)

Phase 5 is code-complete (slices 5.1–5.10, see `06-phase-5-feature-slices.md`).
Phase 6 is the release pipeline. Everything that needs an **Expo account**,
**Apple/Google credentials**, or **physical devices** is a handoff — this
doc is the checklist for it. What could be done from the repo is already
committed (see "Done in the repo" below).

---

## Done in the repo

| Item | File |
|---|---|
| EAS build profiles: `development` (dev client), `preview` (internal — Android APK, iOS simulator), `production` (auto-increment) | `apps/mobile/eas.json` |
| App icon / Android adaptive icon / splash / Android notification icon wired | `apps/mobile/app.json` |
| `expo-splash-screen` + `expo-dev-client` added; `expo-splash-screen` config plugin | `apps/mobile/package.json`, `app.json` |
| `runtimeVersion.policy = "appVersion"` (pairs with `eas.json` `appVersionSource: "remote"`) | `apps/mobile/app.json` |
| **TEMP placeholder assets** — solid brand mint (`#4FD9C4`) with a gray inset border so they read as placeholders. **Replace before any store build.** | `apps/mobile/assets/{icon,adaptive-icon,splash-icon,favicon,notification-icon}.png` |
| `eas init` output — `extra.eas.projectId` (`c0a45056-…`), `extra.router`, `owner: "abonten-hub"` | `apps/mobile/app.json` |

## Done on the EAS project

- Linked to `@abonten-hub/abonten` (project id `c0a45056-182f-47c5-b862-de14034a830a`).
- Env vars `EXPO_PUBLIC_SUPABASE_URL` (plaintext) + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (sensitive) created for **development / preview / production** — see step 3.

`eas.json` carries only the non-secret `EXPO_PUBLIC_API_BASE_URL`
(`https://abonten-benjamin-tibardoes-projects.vercel.app`, same value as
`apps/mobile/.env.example`).

---

## 1. Prerequisites — ✅ DONE

```bash
npm i -g eas-cli          # or: npx eas-cli@latest
eas login                 # done — accounts: big_ceo, abonten-hub (both Owner)
```

## 2. `eas init` — ✅ DONE (project linked)

Ran `eas login` + `eas init`. Linked to the existing EAS project
**`@abonten-hub/abonten`**, project id
**`c0a45056-182f-47c5-b862-de14034a830a`**. `eas init` wrote into
`app.json`: `extra.eas.projectId`, `extra.router: {}`, `owner: "abonten-hub"`
(committed). It did **not** write `updates.url` — that comes from
`eas update:configure` (step 4, optional).

**This armed push notifications (5.10).** `usePushRegistration.ts`'s
`resolveProjectId()` now returns the real id, so on a real device build
`getExpoPushTokenAsync({ projectId })` resolves and `device_token`
registration starts working. (On a bare simulator with no APNs/FCM it still
throws and is caught silently — expected.)

## 3. EAS environment variables — ✅ DONE

EAS Build does **not** read `apps/mobile/.env`, so the two Supabase
`EXPO_PUBLIC_*` vars were created as **project-scoped EAS environment
variables** (all three environments: development, preview, production):

| Variable | Value | Visibility |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://sderrexhawjbmsugndcq.supabase.co` | `plaintext` (PUBLIC) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the anon/publishable JWT from `apps/mobile/.env` (verified byte-identical by SHA-256) | `sensitive` — still inlined into the bundle at build (`EXPO_PUBLIC_` can't be `secret`), just masked in the EAS UI/logs |

Command used (for reference / re-running):
```bash
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://sderrexhawjbmsugndcq.supabase.co" \
  --environment development --environment preview --environment production \
  --visibility plaintext --type string --non-interactive
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key from apps/mobile/.env>" \
  --environment development --environment preview --environment production \
  --visibility sensitive --type string --non-interactive
```

`EXPO_PUBLIC_API_BASE_URL` stays in `eas.json` per profile (single source;
`eas.json` `env` overrides dashboard vars at build time anyway). If the
deployment origin ever differs per environment, move it to EAS env vars
too. **Never** add a service-role key, Paystack secret, or any
non-`EXPO_PUBLIC_*` value to `eas.json` or the EAS env — those stay
server-side behind `/api/mobile/**`.

Verify anytime with `eas env:list --environment production` (add
`--include-sensitive` to see the anon key value).

## 4. EAS Update (optional but recommended)

```bash
eas update:configure
```

Channels are already set per profile in `eas.json` (`development` /
`preview` / `production`). Publish JS-only changes with
`eas update --channel preview`.

## 5. Builds

```bash
# Android internal (APK, installs directly) — no Google account needed for the build itself
eas build --profile preview --platform android

# iOS simulator (no Apple account)
eas build --profile preview --platform ios

# Dev client (for `expo start --dev-client` against a real device)
eas build --profile development --platform android
eas build --profile development --platform ios     # needs an Apple Developer account + a registered device

# Production
eas build --profile production --platform all
```

Real-device iOS testing needs an Apple Developer account and
`eas device:create` (ad-hoc provisioning). Bundle identifiers are already
set: `com.abonten.app` (both platforms).

## 6. Replace the placeholder assets

Specs (all PNG, no transparency except where noted):

| File | Size | Notes |
|---|---|---|
| `icon.png` | 1024×1024 | Full-bleed app icon. |
| `adaptive-icon.png` | 1024×1024 | Android foreground. Keep artwork inside the **center 66%** (safe circle); `app.json` sets the background to `#4FD9C4`. |
| `splash-icon.png` | ~512×512, transparent | Centered logo over the splash background (`#FFFFFF` light / `#0B0B0B` dark, in `app.json`). `imageWidth` is 200. |
| `notification-icon.png` | 96×96, transparent | **Android only.** Must be pure white on transparent (Android tints it); `app.json` sets the accent color to `#4FD9C4`. |
| `favicon.png` | 48×48 | Web only, low priority. |

After replacing, `npx expo-doctor` and one `eas build --profile preview` to
eyeball them.

## 7. Deep links

`scheme` is `abonten` (`app.json`) and `expo-linking` is installed. Custom-
scheme links already in use:

| Link | Handler | Used by |
|---|---|---|
| `abonten://checkout/<sessionId>` | `app/(app)/checkout/[sessionId].tsx` | Paystack popup callback URL (`PaymentSection.tsx` → `WebBrowser.openAuthSessionAsync`) and `createMultiCheckoutPaymentAttemptCore`'s mobile `callbackUrlFor` |
| notification `data.link` (any in-app route, e.g. `/(app)/organizer/finance`) | `usePushRegistration.ts` `addNotificationResponseReceivedListener` → `router.push(link)` | tapped push notification (5.10) |

Verify on a dev/preview build:

```bash
# iOS simulator
npx uri-scheme open "abonten://checkout/TEST" --ios
# Android
adb shell am start -a android.intent.action.VIEW -d "abonten://checkout/TEST" com.abonten.app
```

Universal / App Links (`https://…` opening the app) are **not** set up —
they need `ios.associatedDomains` + `android.intentFilters` in `app.json`
**and** `apple-app-site-association` + `assetlinks.json` served from
`abonten-…vercel.app/.well-known/`. Only needed if links from email/SMS
should open the app directly; the custom scheme covers the payment flow.

## 8. Device + test-keys pass — what is still UNVERIFIED

Nothing below has been exercised on a real device. Build/typecheck/
`expo export` pass for all of it; the logic mirrors the web Server Actions
1:1 via the extracted cores.

**Paystack test keys first:** set `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` (test
`pk_test_…`) as an EAS env var, and point the **web** deployment's Paystack
secret at the matching `sk_test_…` for the environment the app talks to.

| Slice | Flow to verify on device |
|---|---|
| 5.7b | Paystack **popup** checkout → `abonten://checkout/<id>` return → `verify` poll → tickets issued |
| 5.7b | Paystack **direct MoMo** charge → phone approval → `verify` poll |
| 5.7b | Direct charge → `send_otp` → inline OTP field → `charge-otp` → resume poll |
| 5.7c | Add MoMo wallet, set default, remove; networks list loads from Paystack |
| 5.9 | Real withdrawal request against a saved payout account (available-balance guard) |
| 5.9 | Event cancel → confirm screen impact counts → refund fan-out starts → attendee emails queued |
| 5.10 | Permission prompt → token registered (`device_token` row appears) → push delivered → tap routes to `data.link` → `unregisterPushToken` on sign-out drops the row |

Phone-only accounts with no email still hit the existing 400 from
`checkout/attempt` ("needs a verified email to pay") — an inherited web
constraint, not a mobile bug.

## 9. Store submission

```bash
eas submit --profile production --platform android   # needs a Google Play service account key
eas submit --profile production --platform ios       # needs App Store Connect API key
```

## 10. Still deferred (not Phase 6 blockers)

- **Free-event RSVP** on mobile (`registerForFreeEvent` — deep cookie-client
  dependency tree; see 5.7 notes).
- **Card** payment methods on mobile (need a server-captured Paystack
  authorization code; MoMo works).
- **Promo codes** at mobile checkout (the validate route rejects a
  `promoCode`; `getPromoCode`/`claimPromoUsage` assume the cookie SSR
  context).
