# Phase 4 — Expo Router app skeleton

`apps/mobile` (`@abonten/mobile`). Net-new; changes nothing in `apps/web`.
Expo SDK 57, Expo Router 57, React 19.2.8, React Native 0.86.3, TypeScript
strict, typed routes.

## Status

| Sub-step | What | Commit |
|---|---|---|
| 4.1 | Expo Router skeleton + monorepo Metro | `2e2aab0` |
| 4.2 | NativeWind v4 + `@abonten/ui-tokens` | `1f88988` |
| 4.3 | Native Supabase client (secure-store session) | `1e6c489` |
| 4.4 | `@abonten/api-client` + TanStack Query + phone-OTP auth | `26aaed5` |
| 4.5 | Tab navigation + Google sign-in | `114cec1` |

Verified each step: `expo export --platform ios` bundles clean (1657
modules at 4.5), `expo-doctor` 21/21, `turbo run build` (web 33/33) +
`turbo run typecheck` (8/8) green. No native run yet (no simulator here).

## Monorepo integration

- `metro.config.js`: `watchFolders = [repoRoot]`,
  `nodeModulesPaths = [app, repoRoot]`, wrapped with `withNativeWind`.
- Workspace `@abonten/*` packages ship raw `.ts`; Metro transpiles them via
  `babel-preset-expo`. `tailwind.config.ts` imports from
  `@abonten/ui-tokens/tailwind` — tailwind's jiti loader resolves the
  `.ts` export.
- **Version pins to keep single native-module copies** (Expo `57.0.18`'s
  `bundledNativeModules.json` lags its own published `expo-*@57.0.x`
  patches). Root `overrides` forces `react-native` `0.86.3`;
  `apps/mobile` pins `react-native-reanimated` `4.6.0` /
  `react-native-worklets` `0.12.1` to match what `expo-router` pulls. All
  four are in `expo.install.exclude` so `expo install --check` stays quiet.
  `react` / `react-dom` stay `19.2.8` (shared with web, one copy).
- TypeScript stays `^5` monorepo-wide; Expo SDK 57 suggests `~6.0.3` — in
  `expo.install.exclude`, revisit when the whole monorepo moves to TS 6.

## Auth

- `src/lib/supabase.ts` — supabase-js for the same project, session in
  `expo-secure-store` via a **chunked adapter** (`src/lib/secureStore.ts`;
  a session JSON exceeds SecureStore's ~2 KB per-value limit).
  `AppState`-driven token auto-refresh. `flowType: "pkce"`.
- `src/auth/SessionProvider.tsx` — context: `session`, `initializing`,
  `signOut`; subscribes to `onAuthStateChange`.
- `app/_layout.tsx` `useProtectedRoute` — once `initializing` clears,
  redirects between `(auth)` and `(app)` on session state.
- **Phone OTP** (`app/(auth)/sign-in.tsx` → `verify.tsx`): calls
  `POST /api/mobile/auth/phone/request` then `.../verify`, then
  `supabase.auth.setSession(tokens)`.
- **Google** (`src/auth/googleSignIn.ts`): `signInWithOAuth` (skip browser
  redirect) → `WebBrowser.openAuthSessionAsync` → `exchangeCodeForSession`.
  **Needs `abonten://auth/callback` in the Supabase Auth redirect allow
  list**, and Google configured as a provider (same project the web uses).

## Data

- `src/lib/api.ts` — `@abonten/api-client` with `getAccessToken` reading the
  live Supabase session token. `baseUrl` = `EXPO_PUBLIC_API_BASE_URL`.
- `src/lib/queryClient.ts` + `QueryClientProvider` in the root layout.
- `app/(app)/account.tsx` does a live `GET /api/mobile/profile` via React
  Query as an end-to-end smoke of the authed path.

## Navigation

`app/(app)/_layout.tsx` — `Tabs` mirroring the web `MobileNavBar`:
Home · Search · Transactions · Wallet · Account. Tab-bar colours from
`@abonten/ui-tokens` `resolveScheme()`. Search / Transactions / Wallet are
placeholders.

## Env

`apps/mobile/.env` (gitignored) — `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`. Only PUBLIC
values — `EXPO_PUBLIC_*` is inlined into the bundle. `.env.example` is
committed (the root `.gitignore` `.env*` rule now has a `!*.env.example`
negation).

## Not done / follow-ups

- No native device/simulator run yet — bundle-verified only.
- `@abonten/core/pagination` uses `btoa`/`atob` (absent in Hermes) — add a
  `base-64` polyfill before the mobile app consumes cursor pagination.
- EAS Build / Update, app icons + splash, deep-link testing → Phase 6.
- Checkout / payments screens → Phase 5 (with the deferred API endpoints).
- Discovery, tickets, notifications, organizer surfaces → Phase 5 vertical
  slices.
