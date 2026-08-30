# Phase 2 — Shared packages

Each sub-step is one commit. Web behaviour never changes — the only edits to
`apps/web/src` are import-specifier rewrites (codemods) verified by
`turbo run typecheck build` staying green.

Packages ship **raw TypeScript source** (no build step). Consumers compile them:
`tsc` via workspace symlinks + `exports` maps, Next via `transpilePackages`.

## Status — Phase 2 complete

| Sub-step | Package | State | Commit |
|---|---|---|---|
| 2.1 | `@abonten/types` | ✅ done | `8bfeca2` |
| 2.2 | `@abonten/core` | ✅ done | `690ec1b` |
| 2.3 | `@abonten/validation` | ✅ done | `588e12a` |
| 2.4 | `@abonten/i18n` | ✅ done | `20fa0d8` |
| 2.5 | `@abonten/ui-tokens` | ✅ done | `45d5fd5` |

`apps/web` now depends on all five. `next.config.ts` `transpilePackages` lists
the four with runtime code (`core`, `types`, `validation`, `i18n`, `ui-tokens`).
Every sub-step verified green with `turbo run build typecheck`; 26/26 static
pages and middleware unchanged throughout.

## 2.1 — `@abonten/types`

- `apps/web/src/types/*` → `packages/types/src/*`. Consumed via `exports: { "./*": "./src/*.ts" }`.
- Codemod: `@/types/X` → `@abonten/types/X` (164 files).
- No barrel: nothing imports the bare specifier, and `export *` collided on a
  duplicate `TicketType` (`favoriteEventTypes` vs `ticketType`).
- Deleted `authContextType.ts` — 100% commented out, unused, not a valid module
  under `isolatedModules`.
- Generated Supabase types live at `packages/types/src/database.types.ts`.
- Dep: `@supabase/supabase-js` (type-only use in `authOverrideType`/`userProfileType`).

## 2.2 — `@abonten/core`

44 framework-free modules moved to `packages/core/src` (rule: no `next/*`,
`react`, `react-native`, DOM). Deps: `@abonten/types` + `date-fns`.

**Moved:** `checkoutPricing`, `getDiscountAmount`, `paystackAmount`,
`checkoutExpiry`, `cloudinaryUrl`, `computePlaceOpenStatus`, `dayOfWeek`,
`eventCodeGenerator`, `formatExpiresIn`, `formatVideoDuration`, `geerateSlug`,
`getEventSoldOutStatus`, `getSafeRedirectPath`, `getSignInUrl`,
`imagePlaceholder`, `isImageFile`, `logger`, `maskAccountNumber`,
`networkProviderData`, `normalizePhoneNumber`, `organizerDashboardDateRange`,
`otpConstants`, `otpMessages`, `pagination`, `parseEventTypes`,
`parseFilterModalQueries`, `parseRawCoordinates`, `parseWKBHex`,
`paymentStatusCopy`, `phoneNumberFormatter`, `profileCompletion`, `queryKeys`,
`refundStatus`, `ticketSelect`, `transactionsDateRange`, `uploadLimits`,
`urlValidation`, `validateLocationInput`, `dateFormatter`, `eventStatus`,
`getEventStatusOverlay`, `shareUrl`, `dailyEventCache`, `ticketPdfData`.

**Codemod:** `@/utils/<moved>` → `@abonten/core/<moved>` (~314 files) + 5
sibling `./x` relative imports + 3 intra-core `@/utils/*` → `./*`.
`next.config.ts` gained `transpilePackages: ["@abonten/core", "@abonten/types"]`.

**Deliberately left in `apps/web`:**
- `*Schema.ts` (Zod) — go to `@abonten/validation` in 2.3.
- `recentSearches` (localStorage), `geocodeServerSide` (Next `fetch` opts),
  `animateMarker` (`requestAnimationFrame`), `getFormattedPlaceDetails` /
  `getCurrentPosition` (browser/`google.maps`), canvas/video utils.
- Anything importing `@/config/supabase`, `@/actions`, `@/services`, `react`,
  or `@tanstack/react-query` (`platformFee`, `ticketInventory`, `promoUsage`,
  `paymentAttempt`, `finalizePaystackPayment`, `paystackInit`, `issueRefundCore`,
  `checkoutPaymentPreparation`, `checkoutCancellation`, `insertReviewPhotos`,
  `mutationQueryInvalidation`, `useDebounceEffect`, `getUserCurrency`,
  `handleShare`). These become API-layer / mobile-adapter work in Phase 3+.

### Known follow-ups (not blocking web)

- `pagination.ts` uses `btoa`/`atob` — present on web and Node, **not** in
  React Native by default. Needs a `base-64` polyfill or a Buffer-based
  swap when the mobile app consumes it (Phase 4).
- `logger.ts` reads `process.env.LOG_LEVEL` / `NEXT_PUBLIC_LOG_LEVEL` — Expo
  exposes env differently; the fallbacks make it harmless, revisit in Phase 4.

## 2.3 — `@abonten/validation`

10 Zod schema files → `packages/validation/src`. Deps: `zod` + `@abonten/core`
(`WEBSITE_URL_REGEX`) only — no i18n framework.

- `eventSchema` / `placeSchema`: dropped the `next-intl` `useTranslations`
  param type. `getEventSchema` / `getPlaceSchema` take an explicit message-map
  object (`EventSchemaMessages` / `PlaceSchemaMessages`). The 4 web call sites
  (`useEvent{Upload,Edit}Form`, `use{Place,ManagePlaceDetails}Form`) build the
  map from their existing next-intl `t`. Identical messages/behaviour.
- Codemod: `@/utils/<schema>` → `@abonten/validation/<schema>` (19 sites).

## 2.4 — `@abonten/i18n`

`messages/` (6 locales × 6 namespaces = 36 JSON) → `packages/i18n/messages`.
`packages/i18n/src/catalog.ts` exposes `I18N_LOCALES`, `I18N_NAMESPACES`,
`loadNamespace`, `loadAllNamespaces` (same static-prefix dynamic import →
one lazy chunk per locale/namespace). `apps/web/src/i18n/messages.ts` is now
a 3-line wrapper; `request.ts` / `LocaleProvider.tsx` / the next-intl plugin
are untouched.

## 2.5 — `@abonten/ui-tokens`

- `palette.ts`: `brandColors` (`mint` `#4FD9C4`, `iconGray` `#544F4F`) +
  `semanticHsl` (light/dark `H S% L%` triples mirroring `globals.css`) +
  `resolveScheme()` for a concrete native theme.
- `tailwind.ts`: `radiusScale`, `fontFamily`, `backgroundImage`, `keyframes`,
  `animation` (the framework-neutral `theme.extend` slices).

`apps/web/tailwind.config.ts` imports and spreads these; the shadcn semantic
colours stay inline as `hsl(var(--x))` with `globals.css` as their web runtime
source. **Zero visual diff verified** — probe-compiling utilities against the
new config yields identical output (`text-mint` → `rgb(79 217 196)`,
`bg-iconGray` → `rgb(84 79 79)`, keyframes, `var(--radius)`, `var(--font-euclid)`).

## What's left in `apps/web/src/utils/` (26 files)

Everything DOM- / Next- / Supabase-bound: `canvasPreview`, `eventDateValidation`,
`generateVideoThumbnail(Strip)`, `getCurrentPosition`, `getFormattedPlaceDetails`,
`animateMarker`, `recentSearches`, `geocodeServerSide`, `useDebounceEffect`,
`mutationQueryInvalidation`, `getUserCurrency`, `handleShare`, and the
server-only payment/checkout/inventory modules (`ticketInventory`, `promoUsage`,
`paymentAttempt`, `platformFee`, `finalizePaystackPayment`, `issueRefundCore`,
`paystackInit`, `checkoutPaymentPreparation`, `checkoutCancellation`,
`insertReviewPhotos`, `generateTicketCode` (bundles the `qrcode` lib),
`generateTicketPdfBuffer` (`@react-pdf/renderer`)). These become Phase 3
API-layer and Phase 4 native-adapter work.
