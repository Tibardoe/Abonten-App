# Phase 2 — Shared packages

Each sub-step is one commit. Web behaviour never changes — the only edits to
`apps/web/src` are import-specifier rewrites (codemods) verified by
`turbo run typecheck build` staying green.

Packages ship **raw TypeScript source** (no build step). Consumers compile them:
`tsc` via workspace symlinks + `exports` maps, Next via `transpilePackages`.

## Status

| Sub-step | Package | State | Commit |
|---|---|---|---|
| 2.1 | `@abonten/types` | ✅ done | `8bfeca2` |
| 2.2 | `@abonten/core` | ✅ done | `690ec1b` |
| 2.3 | `@abonten/validation` | pending | — |
| 2.4 | `@abonten/i18n` | pending | — |
| 2.5 | `@abonten/ui-tokens` | pending | — |

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
