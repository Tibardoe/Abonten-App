# Phase 1 — Web ⇄ Mobile parity

Phases 4–6 built the mobile app as independent vertical slices. Phase 1 (this
doc) resets the goal: **the mobile app should read as the mobile version of the
existing Abonten web app** — same visual identity, IA, terminology, flows,
states and business logic, adapted to native patterns, *not* redesigned. The
deliberate product/UX optimisation pass is Phase 2 and comes after parity.

The web app (`apps/web`) is the source of truth.

---

## Decisions (2026-09-01)

| Question | Decision |
|---|---|
| Anonymous browsing | **Match web** — discovery / detail / search / public profiles render signed-out; redirect to sign-in only at checkout, tickets, favourites, reviews, settings, organizer. (Mobile currently force-redirects every signed-out user to `/sign-in` via `app/_layout.tsx` `useProtectedRoute`.) |
| Shared native UI | **New `@abonten/ui-native` package** — primitives + theme + i18n, consuming `@abonten/ui-tokens` and `@abonten/i18n`. |
| First work after the foundation | **WP-1 Navigation & IA.** |

---

## Parity gap summary (full audit in the session that created this doc)

Grouped the way the audit was requested:

1. **Navigation** — no app header; no notification bell in nav (+ no unread
   badge); no Create affordance; no profile/avatar entry; bottom tabs diverge
   from web (`Home·Search·Tickets·Places·Account` vs web
   `Home·Search·Transactions·Wallets·Account`); no `ManageMenu`/`SideBar`
   equivalent; signed-out users can't browse at all.
2. **Screens** — missing: landing, real Explore (`/explore/[location]`),
   map views, `/around-you`, full profile + its tabs, all of Settings, buyer
   `/transactions` analytics, `/manage/my-events` tab set, per-event/-place
   management, drafts, promotions, event/place creation, admin.
3. **UI/components** — no shared primitive layer at all (every screen
   re-implements button/card/badge/input/sheet inline); ad-hoc typography;
   system font instead of Euclid Circular B; spinners instead of skeletons;
   Ionicons + hard-coded hex instead of tokened icons; one-line empty states.
4. **Functionality** — no favourites, reviews, highlights, share, avatar
   upload, theme toggle, language switch, promo codes, free RSVP, card
   payment method, cancel-ticket/refund, ticket PDF, search suggestions,
   creation/management flows.
5. **User flows** — anonymous-browse→gated-checkout, landing→location→explore
   →filter→basket→pay, event→organizer profile, map discovery, ticket→refund,
   multi-session basket, settings sub-flows, organizer create→manage→check-in.
6. **States** — missing ended-event banner, sale-not-started, capacity, promo,
   fulfillment-recovery, refund states, "no address set", filter-aware empty
   states; loading is spinner-not-skeleton throughout.
7. **Data/logic** — promo codes rejected by the mobile validate route; free
   RSVP deferred; `"GHS"` hard-coded as currency fallback in several places;
   `@abonten/validation` Zod schemas re-implemented as ad-hoc regex; favourites
   optimistic cache + attendance-gated reviews absent.
8. **Visual/design system** — colour tokens + radius already shared and in
   sync (`global.css` mirrors `@abonten/ui-tokens/semanticHsl`); gaps are the
   font, the primitive layer, elevation, motion, skeletons, status badges.

---

## Work packages

| WP | Scope | Status |
|---|---|---|
| **WP-0 Foundation** | `@abonten/ui-native` (primitives + theme + i18n); font plumbing; runtime theme provider; wire into `apps/mobile` | **done** (2026-09-01) — see below |
| **WP-1 Navigation & IA** | anonymous browsing; app header (notification bell + badge + menu); bottom-tab realignment; themed native detail headers; side-sheet with legal/footer links | **done** (2026-09-01) — see below |
| **WP-2 High-traffic screens** | Explore (location switch, Events/Places tabs, filter sheet, chips, empty states); full Profile + tabs; Settings hub + 5 sub-pages; `/transactions` analytics; My-Tickets tab set; favourites + reviews + share; card status overlays | |
| **WP-3 Checkout & buyer** | pending-checkouts basket; promo codes; free RSVP; live expiry countdown; fulfillment recovery; cancel-ticket/refund; ticket PDF/receipt; AddBankCard | |
| **WP-4 Organizer & creator** | event/place creation; per-event management (analytics, attendance/check-in, promo CRUD, edit/delete, promotion); dashboard widgets; drafts; place management; payout detail; map views | |

---

## WP-0 — `@abonten/ui-native` (done 2026-09-01)

New workspace package `packages/ui-native` (`@abonten/ui-native`). Ships raw
`.ts(x)`, transpiled by Metro like the other `@abonten/*` packages.

- **`/theme`** — `ThemeProvider` + `useTheme()` / `useThemeColors()`. Mirrors
  the web `next-themes` setup: Light / Dark / System, persisted per device in
  `expo-secure-store`, drives NativeWind's colour scheme (so both `dark:`
  variants and the `.dark:root` CSS-var swap in `global.css` take effect).
  `tokens.ts` adds `space` / `radius` / `fontSize` / `lineHeight` / `shadow`
  scales mirroring the web Tailwind rhythm, plus a `family.body` slot for the
  brand font.
- **`/primitives`** — `AppText` + role components (`PageTitle`, `ScreenTitle`,
  `SectionTitle`, `CardTitle`, `Body`, `Muted`, `Label`, …) matching the web
  `ui/typography.tsx` roles; `Button` (primary/secondary/outline/ghost/
  destructive × sm/md/lg, loading, icons); `Card` / `PressableCard` / `CardRow`;
  `Badge` / `StatusBadge`; `Input` / `Field` (RHF-friendly); `Chip` / `Tag`;
  `Stepper`; `Skeleton` / `SkeletonText`; `EmptyState`; `Divider` / `Spinner` /
  `ScreenLoader` / `ScreenError`; `Avatar` (Cloudinary + web's anon fallback);
  `Sheet` (bottom sheet, RN `Modal`, same prop shape as web `BottomSheet`).
  Styled with NativeWind `className` on the shared token classes; the mobile
  `tailwind.config.ts` `content` glob now includes
  `../../packages/ui-native/src/**`.
- **`/i18n`** — `I18nProvider` + `useTranslations(namespace)` / `useLocale()`,
  next-intl-shaped, backed by a **static** import of all six
  `@abonten/i18n/messages/*` catalogs (Metro can't bundle that package's
  templated `import()`, and the JSON is small). Locale persisted in
  `expo-secure-store`, defaults to the device language when a catalog exists.
  `{placeholder}` interpolation only — upgrade to full ICU if a message ever
  needs plurals.
- **Wiring** — `apps/mobile/app/_layout.tsx` now wraps the tree in
  `ThemeProvider` → `I18nProvider`. `apps/mobile/package.json` depends on
  `@abonten/ui-native` + `@abonten/i18n`.

**Font:** only `.woff2` files exist (`apps/web/public/fonts/`); React Native
needs `.ttf`/`.otf`. Until those land the body font is the platform system
font. Drop-in when available: add the files under `apps/mobile/assets/fonts`,
`useFonts({ EuclidCircularB: require(...) })` in the app root, set
`family.body = "EuclidCircularB"` in `ui-native/src/theme/tokens.ts` — every
`AppText` reads that one slot.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform ios` clean,
`expo-doctor` 21/21. Not device-verified.

---

## WP-1 — Navigation & IA (done 2026-09-01)

- **Anonymous browsing.** `app/_layout.tsx` `useProtectedRoute` rewritten: it
  no longer bounces every signed-out visitor. `src/lib/authRedirect.ts` holds
  `isProtectedPath()` (the native mirror of the web proxy's public-route
  allowlist — protected prefixes: `/tickets`, `/ticket/`, `/wallet`,
  `/account`, `/notifications`, `/checkout`, `/organizer`) plus a
  `setPendingRedirect` / `consumePendingRedirect` slot (the native `?next=`).
  A signed-out tap on a protected route stores the path and redirects to
  `/(auth)/sign-in`; the root effect replays it after sign-in. `/` resolves to
  `(app)/index` (Home), so the app opens on the public feed.
- **App header.** `(app)/_layout.tsx` `Tabs` now render a themed native header
  on every screen (`headerStyle` = `sidebar` bg + hairline `sidebar-border`,
  `headerShadowVisible: false`, tint = `foreground`). `headerRight` =
  `NotificationBellButton` (`src/components/app/`, bell + unread badge derived
  from the loaded `useNotifications` pages, caps at "9+", → `/notifications`;
  renders null when signed out). `headerLeft` on the five tab screens =
  `MenuButton` (hamburger) → opens `AppMenuSheet`; detail screens keep the
  back button. Detail screens still set their per-item title via
  `navigation.setOptions`.
- **`AppMenuSheet`** (`src/components/app/`) — native stand-in for the web
  header's hamburger → `<SideBar>` Sheet. Mounted once in `(app)/_layout.tsx`,
  toggled through `MenuSheetProvider` / `useMenuSheet` context. Signed in:
  profile row → Account, Create (event/place → website), Manage (Dashboard /
  My events / Finances), account links (My Tickets / Wallets / Places /
  Notifications), the appearance control, Sign out, and the legal footer
  (Terms / Privacy / Cookies / Security → website) + copyright. Signed out:
  Sign in / Create account + appearance + footer.
- **`AppearanceToggle`** (`src/components/app/`) — Light / Dark / System
  segmented control on `useTheme()`, copy from `settings.appearance.*`. The
  `/settings/switch-appearance` control, surfaced early in the menu and on the
  Account screen (full Settings is WP-2).
- **Bottom tabs realigned** to the web `MobileNavBar`'s five slots:
  **Home · Search · Tickets · Wallets · Account** (icons
  home/search/receipt/wallet/person). `app/(app)/transactions.tsx` →
  `tickets.tsx` (it was always My-Tickets, not the web `/transactions`
  analytics page). `wallet` promoted from a hidden route to a tab (title
  "Wallets", was "Payment methods"). `places` dropped from the bar to a
  `href: null` route (web has no Places bottom tab — it's a tab inside
  Explore); still reachable from the menu, the Account screen, and every
  `PlaceCard`.
- **Account screen** rebuilt from the dev/debug screen into a real hub:
  profile card (avatar + name/username via new `src/features/profile/useProfile.ts`)
  or a sign-in CTA when signed out, nav rows, the appearance control, Sign
  out. The old `GET /api/mobile/profile` status card is gone.
- **Screens de-duplicated for the new header:** `index` / `search` / `tickets`
  / `places` / `notifications` lost their in-body page titles + `pt-16`
  spacer (the native header now carries the title) and moved their
  loading / empty states onto `ScreenLoader` / `Spinner` / `EmptyState`.

**Known WP-1 gaps (intentional, later WPs):**
- No wordmark asset — the header shows text titles, not the Abonten logo.
- Tab slot 3 is labelled "Tickets", not web's "Transactions"; WP-2 decides
  whether to add the buyer-analytics screen there and move Tickets under the
  Account/Manage group like web does.
- `AppMenuSheet` Manage links aren't role-gated (`useIsOrganizer` /
  `useIsPlaceOwner` don't exist on mobile yet) — every signed-in user sees the
  organizer links; web hides them. Add gating in WP-2/WP-4.
- Legal links open `abontenhub.com`, not per-page URLs (web uses `#`).
- Notification unread count comes from loaded pages only, not a dedicated
  count query like web's `useUnreadNotificationCount`.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform ios` clean,
`expo-doctor` 21/21, `biome check` clean on all touched files. Not
device-verified.
