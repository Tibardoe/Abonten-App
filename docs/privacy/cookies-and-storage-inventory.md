---
title: Cookies and storage inventory (internal)
purpose: The exact, code-referenced inventory of cookies, browser storage, device storage and third-party scripts behind the public Cookie Policy.
audience: Engineering, privacy reviewer
scope: apps/web, apps/admin, apps/mobile
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Cookies and storage inventory (internal)

Public version: `apps/web/src/content/legal/cookie-policy.md`. **When anything below changes, update both, and `npm run check:docs` will not catch it — this is a manual step.**

## Web cookies (`apps/web`)

| Cookie | Set in | Flags | maxAge | Purpose | Read by |
|---|---|---|---|---|---|
| `sb-<ref>-auth-token` (+ chunks) | `@supabase/ssr` via `src/config/supabase/middleware.ts`, `server.ts` | library defaults | session/refresh | Auth session | `updateSession`, every Server Action |
| `country` | `src/proxy.ts:30-35` | `httpOnly:false`, `secure` prod, `sameSite:lax`, `path:/` | none (session) | Country from `x-vercel-ip-country` / `x-country-code`, default `GH` | `fetchCountryMetaData.ts`, phone input |
| `NEXT_LOCALE` | `src/proxy.ts:47-53` (first visit), `src/actions/setUserLocale.ts` | `httpOnly:false`, lax | 1 year (`LOCALE_COOKIE_MAX_AGE`, `src/i18n/config.ts`) | Locale | `src/i18n/locale.ts` (server), `LocaleProvider.tsx` (`document.cookie`) |
| `abn_ref` | `src/proxy.ts:82-85`, `rememberInviteCode.ts`, `bindReferralCode.ts` | `httpOnly:true`, secure prod, lax | 30 days | HMAC-signed referral/invite map (`e:slug`, `p:slug`, `u`, `i`; purpose `referral-cookie:v1`) | `validateCheckout.ts` (stamp at checkout), `recordReferralTouch.ts` |
| `abn_inv` | `src/proxy.ts:90-93`, `rememberInviteCode.ts` | `httpOnly:false` | 30 days | "Invite pending" flag for the sign-in UI | `InviteBinder.tsx` |
| `abn_did` | `src/proxy.ts:103-110` | `httpOnly:true` | 1 year | Random UUID browser id — rewards fraud signal only | `recordReferralTouch`, device-install recording |

## Admin cookies (`apps/admin`)

| Cookie | Set in | Flags | maxAge | Purpose |
|---|---|---|---|---|
| Supabase session | `src/proxy.ts`, `src/lib/supabaseServer.ts` | defaults | session | Auth |
| `admin_stepup_at` | `src/app/auth/callback/route.ts:24-36` (only with `?stepup=1`) | `httpOnly`, secure prod, lax, `/` | 600 s (`STEP_UP_MAX_AGE_MS`) | Signed, user-bound step-up token (`stepUpToken.ts`) |

## Web browser storage

| Key | Storage | File | Content |
|---|---|---|---|
| `theme` | localStorage (next-themes default key) | `src/providers/ThemeProvider.tsx` | light/dark/system |
| `abonten:recent-searches` | localStorage | `src/utils/recentSearches.ts` | last 8 search strings |
| `<storageKey(userId)>` inbox prefs | localStorage | `src/messaging/hooks/useInboxPrefs.ts` | mode + filter chips |
| `fieldops-onboarding:<id>` | sessionStorage | `src/fieldOps/lib/wizardStorage.ts` | wizard draft incl. business phone/WhatsApp, coordinates |
| `abn-ref-logged:<path>:<code>` | sessionStorage | `src/rewards/atoms/ReferralTouchLogger.tsx` | dedupe flag |

## Mobile device storage (`expo-secure-store`, chunked by `src/lib/secureStore.ts`)

| Key | File | Content |
|---|---|---|
| Supabase session | `src/lib/supabase.ts` | tokens |
| `abonten.installId` | `src/lib/installId.ts` | random install id, sent as `x-abonten-install-id` (`src/lib/api.ts`) |
| `abonten.pendingInvite`, `install_referrer_checked` | `src/features/rewards/inviteCapture.ts` | invite code; Android install-referrer read flag |
| `abonten.referralTouches` | `src/features/rewards/referralCapture.ts` | referral touches |
| `abonten.explore-location` | `src/features/discovery/ExploreLocationProvider.tsx` | chosen location |
| `abonten.recent-searches` | `src/features/search/recentSearches.ts` | search strings |
| `evtreminder.index`, `recordKey(eventId)` | `src/features/reminders/eventReminders.ts` | local reminders |
| inbox prefs, recent reactions (per user) | `src/features/messaging/inboxPrefs.ts`, `recentReactions.ts` | UI prefs |
| Expo push token | `src/features/notifications/usePushRegistration.ts` | registered via `/api/mobile/devices/register` |

## Third-party scripts and SDKs

| Provider | Where | Notes |
|---|---|---|
| Google Maps JS (`@react-google-maps/api`) | `MapPicker.tsx`, `EventsMapView.tsx`, `PlacesMapView.tsx`, `LocationMapPreview.tsx`, `useUserLocation.ts`, `usePlacesAutocomplete.ts` | Google's own cookies possible on pages with a map |
| Paystack inline JS | `src/wallet/organisms/AddBankCard.tsx` (`<Script strategy="afterInteractive">`) and the payment pop-up (`usePaystackPopup.ts`) | Only on those screens |
| Cloudinary | image/video delivery (`res.cloudinary.com`) | no cookies set by Abonten |
| Sentry | `instrumentation-client.ts`, `sentry.*.config.ts` (web); `src/lib/sentry.ts` (admin, mobile) | `sendDefaultPii:false`, `tracesSampleRate 0.1`, prod only, **no Session Replay** |
| Analytics products | **none** — no Vercel Analytics, GA, GTM, PostHog, Plausible, Mixpanel, Segment in any `package.json` | |

## First-party product analytics (database, not cookies)

`place_analytics_event` (`logPlaceEngagement`: page views, call/WhatsApp/website/directions clicks), `place_visit` (rewards), `referral_touch` (90-day purge), `event_share`.

## Open questions

- Consent banner requirement for `abn_did`, `abn_ref`, `abn_inv` — legal B4 / decision S5.
- `country` cookie has no expiry and is client-readable — acceptable (non-personal), noted.
