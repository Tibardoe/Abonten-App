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
| **WP-2 High-traffic screens** | Explore (location switch, Events/Places tabs, filter sheet, chips, empty states); full Profile + tabs; Settings hub + 5 sub-pages; `/transactions` analytics; My-Tickets tab set; favourites + reviews + share; card status overlays | **done** (2026-09-01) — 2a–2f, see below |
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

---

## WP-2a — Explore screen (done 2026-09-01)

Native equivalent of the web `/explore/[location]` page (`page.tsx` +
`LocationAndFilterSection` + `ExploreTabs` + `EventsTabContent` /
`PlacesTabContent`). `app/(app)/index.tsx` was a bare nearby-events list;
it is now the Explore screen.

- **Shared category data moved into `@abonten/core`.** The
  `eventCategoriesAndTypes` and `distances`/`rating` constant arrays now
  live in `packages/core/src/{eventCategoriesAndTypes,distanceAndRating}.ts`
  (framework-free; `@abonten/core` exports `./*`). `apps/web/src/data/*.ts`
  are kept as one-line re-export shims so no web import site changes; mobile
  imports `@abonten/core/...` directly. One source, so the category list and
  the Distance / Rating ladders can't drift between platforms.
- **`ExploreLocationProvider`** (`src/features/discovery/`) — the active
  Explore location, the native stand-in for the web `[location]` URL slug.
  Seeded from device GPS (reverse-geocoded to a city label), overridable,
  persisted per device in `expo-secure-store` (`abonten.explore-location`),
  falls back to Accra (same coords as `useDeviceLocation`). Mounted in
  `app/(app)/_layout.tsx`.
- **`ChangeLocationSheet`** (`src/components/explore/`) — the web
  `ChangeLocationModal` ("Set your location"): type an address
  (`Location.geocodeAsync`) or "Use my current location".
- **Events / Places tabs** — the web `ExploreTabs`, as a two-chip switch.
- **`CategoryChipsRow`** (`src/components/explore/`) — the web
  `EventCategoryChips` / `PlaceCategoryChips`: a horizontal pill row, "All"
  + one chip per category (event categories from `@abonten/core`, place
  categories from the new `usePlaceCategories` hook → `place_category`
  table).
- **`FilterSheet`** (`src/components/explore/`) — the web `FilterModalPopup`,
  tab-aware: Events = Category / Type (of the picked category) / Price /
  Date range / Min rating / Distance; Places = Category / Open now / Min
  rating / Distance. Edits a local draft; Apply lifts it, Clear all resets.
  Price is a dual-thumb `PriceRangeField` (PanResponder, no dep — the web
  `PriceRangeSlider`); date range is `DateRangeField`, a pure-JS month
  calendar with range select (no dep — the web `DateRangePickerSheet`).
- **`ActiveFilterChips`** (`src/components/explore/`) — the applied filters
  as removable chips (tap to drop one, "Clear all"). The web app shows only
  a count badge on the Filters button; mobile keeps that badge **and** adds
  this row.
- **Filter-aware empty states** — distinct copy + a "Clear filters" action
  when filters are active vs. "No events/places in {location}" when not,
  mirroring the web `NoEventsFound` vs `NoEventsInLocation` split.
- **Data hooks** — `useFilteredEvents` (`get_filtered_events`) and
  `useFilteredPlaces` (`get_filtered_places`), direct anon RPC calls with
  in-memory cursors, same pattern as `useNearbyEvents` / `useEventSearch`.
  **`get_filtered_places` is confirmed `GRANT`ed to `anon`** — migration
  `20260820090000_add_places_feature.sql:581` (not an assumption).
- **Curated sliders** — `useExploreEventSliders` (one bounded
  `get_nearby_events` 10km fetch + the `event_promotion` id set →
  `getFeaturedEvents` / `filterEventsByWindow` from `@abonten/core`) drives
  Featured / Around you / Top-rated organizers / Happening today-week-month;
  `useExplorePlaceSliders` (`get_active_place_promotions` +
  `get_nearby_places` 5km + two `get_filtered_places` calls) drives
  Featured / Around you / Open now / Top rated. Rendered by
  `EventSliderRow` / `PlaceSliderRow` (web `EventsSlider` / `PlacesSlider`)
  above the "All …" list; only the "All …" list honours the filter sheet,
  same split as web. The pure `filterEventsByWindow` was moved
  `apps/web/src/actions/getFilteredEvents.ts` → `@abonten/core/eventDateWindow`
  (web file kept as a re-export shim). *`filterEventsByWindow(…, "top-rated-organizers")`
  is a pass-through on web too — it returns all nearby events; parity
  preserved, not a new gap.*
- Tab header now reads **"Explore"** (matches the web `<h1>`); the bottom-tab
  slot keeps its **"Home"** label (`tabBarLabel`).

**Known WP-2a gaps (deferred, need a decision):**
- **Map view** (`ViewToggle` list/map — web `EventsMapView` / `PlacesMapView`)
  and **`ChangeLocationSheet` map picker / Google autocomplete suggestions**
  all require `react-native-maps` (a native module → new `app.json` plugin
  entry → fresh dev/EAS build) **plus** a Google Maps API key for Android
  that is **not currently provisioned for mobile** (`apps/mobile/.env` has
  only Supabase + API base URL). Flagged for a go/no-go: add the dep + the
  user supplies `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, or stay list-only for
  Phase 1.
- Slider headings aren't linked to "see all" window pages (web links to
  `/explore/.../happening-today` etc.) — those routes don't exist on
  mobile yet; a card tap still opens the detail screen.
- The hidden `places.tsx` route still uses `useNearbyPlaces` (unfiltered);
  Explore's Places tab is the parity surface.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on all touched files, web `next build` exit 0
(`@abonten/core` moves). Not device-verified.

---

## WP-2b — Card status overlays + favourites (done 2026-09-01)

- **`EventCard` status overlay** — `CardStatusOverlay` (a non-interactive
  centred wash over the flyer, card stays tappable) with the exact web
  `EventCard` `centerOverlay` precedence: `status === "canceled"` →
  "Event Canceled" (dark-red), else `getEventSoldOutStatus({capacity,
  attendeeCount})` → "Sold Out", else `getEventStatusOverlay(...)` →
  "Ongoing" / "Event Ended". Upcoming shows nothing. Helpers are the
  shared `@abonten/core` ones the web card uses.
- **`PlaceCard` open status** — now `derivePlaceCardOpenStatus(is_open,
  temporary_status)` from `@abonten/core/computePlaceOpenStatus` (the same
  call the web `PlaceCard` makes), so `temporarily_closed` /
  `permanently_closed` win over the SQL `is_open` boolean and render as a
  dot + label like the web `PlaceOpenStatusBadge` (was a bare
  "Open"/"Closed").
- **Favourites** — `src/features/favorites/useFavorites.ts`: `useIsFavorited`
  + `useToggleFavorite` (kind `"event"` | `"place"`), direct RLS-scoped CRUD
  on `favorite` / `favorite_place` (both have a single
  `FOR ALL USING (auth.uid() = user_id)` policy — migrations `20260825105625`
  / `20260825105513`), optimistic cache update + rollback, matches the web
  `AddToFavoriteButton` / `AddPlaceToFavoriteButton` pattern.
  `favoritesListKey(kind)` is invalidated on every toggle for the Profile
  Favourites tabs (WP-2c).
- **`FavoriteButton`** — an optimistic heart. On the cover of every
  `EventCard` / `PlaceCard` (top-right, translucent chip) and in the
  `headerRight` of the event / place detail screens (via
  `navigation.setOptions`). Signed-out taps store the path
  (`setPendingRedirect`) and route to sign-in, mirroring the web
  `useRequireAuth()` gate.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on touched files. Not device-verified (the
favourites write path in particular needs a signed-in device check).

---

## WP-2c — Public profile + tabs (done 2026-09-01)

Native equivalent of the web `user/[username]` route group
(`layout.tsx` + `ProfileDetails` + `posts` / `places` / `favorites` /
`reviews` pages). New screen `app/(app)/user/[username].tsx` (public,
`href: null`).

- **`usePublicProfile(username)`** — reads the public `user_profile_details`
  view + the average of `review.rating` where `reviewed_id = user_id`
  (the web `getUserRating`). Both anon-readable.
- **`ProfileHeader`** — avatar + username, full name, bio, and the
  **Posts / Favorites / Rating** counts, mirroring the web `ProfileDetails`
  mobile layout. "Edit profile" (own profile only) → `account` for now
  (points at Settings once WP-2d lands). *Highlights are a placeholder line
  — deferred.*
- **Tabs** (`Chip` segmented): **Events / Places / Favorites / Reviews**.
  - Events — `event` where `organizer_id = user_id` + `ticket_type` +
    `event_occurrence`, min-price folded in; rendered with the shared
    `EventCard` (so it gets the WP-2b status overlay).
  - Places — `place` where `owner_id = user_id` + `place_category`; raw
    rows have no `is_open` / rating / distance from the list RPCs, so they
    use a lighter `ProfilePlaceRow` rather than the full `PlaceCard`.
  - Favorites — inner Events/Places switch. `favorite` / `favorite_place`
    are RLS-scoped to the viewer, so this tab only has rows on **your own**
    profile (same constraint as the web pages) and shows a "Sign in to see
    favourites" state when signed out.
  - Reviews — `review` where `reviewed_id = user_id` (reviews *received*),
    with the reviewer's username; `ProfileReviewRow` (stars + title +
    comment + date).
- **Wiring** — `account.tsx` profile card is now a `PressableCard` →
  `/(app)/user/[username]`; `user/[username]` registered in
  `(app)/_layout.tsx`.

**Known WP-2c gaps (later passes):**
- Highlights (Instagram-style) not ported.
- The web Reviews page's event-vs-place sub-tabs are collapsed into one
  "reviews received" list.
- `EventCard` still doesn't link to the organizer's profile from the
  discovery lists / event detail (only the Account card and deep links
  reach the profile screen so far).
- All profile tab reads are direct table selects — if `event` / `place`
  table RLS turns out to block anon SELECT on another user's rows, the
  Events/Places tabs would be empty for signed-out viewers (web uses the
  same direct selects via the viewer's session; needs a device check).

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on touched files. Not device-verified.

---

## WP-2d — Settings hub + sub-pages (done 2026-09-01)

Native echo of the web `(settings)` route group + `SettingsDesktopSidebar`.
New nested stack `app/(app)/settings/` (registered `href: null`,
`headerShown: false` on the tab so the stack owns its header); `/settings`
added to `authRedirect` `PROTECTED_PREFIXES`.

- **Hub** (`settings/index.tsx`) — the five sidebar entries in web order,
  `settings.nav.*` labels: Overview · Edit Profile · Security · Switch
  Appearance · Language.
- **Overview** — the "Quick links" card (Manage payment method → Wallet,
  View transaction history → Tickets for now). *PromotionDetails deferred.*
- **Edit Profile** — controlled form validated on submit with the shared
  `@abonten/validation/editProfileSchema` (`username` / `full_name` /
  `website` / `bio`); `useUpdateProfile` writes straight to `user_info`
  (RLS `user_info_self_update`) and invalidates the profile caches. Added
  `@abonten/validation` (+ transitive `zod`) as a mobile dep — closes the
  audit's "Zod schemas re-implemented as ad-hoc regex" gap for this form.
  *Avatar upload + profile-completion checklist deferred; `username_is_generated`
  flag not flipped (web-side profile-completion nicety).*
- **Security** — read-only summary (email / phone + verified state from
  `session.user`, linked Google identity) + "manage on the web" note. The
  web page's full Hubtel OTP change flows aren't ported (mobile phone-auth
  is half-wired per CLAUDE.md).
- **Language** — the six `@abonten/i18n` locales via
  `useLocale()` / `I18N_LOCALES` / `LOCALE_LABELS` (the web `Language`
  organism), persisted per device.
- **Switch Appearance** — reuses the shared `AppearanceToggle` +
  `settings.appearance.*` descriptions (the web `SwitchAppearance`).
- **Wiring** — `account.tsx` gains a "Settings" row; the profile header's
  "Edit profile" now points at `settings/edit-profile`.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on touched files. Not device-verified (the
profile-write path needs a signed-in device check).

---

## WP-2e — Transactions analytics + ticket tabs + share (done 2026-09-01)

- **`/transactions`** (`app/(app)/transactions.tsx`, `href: null`) — native
  echo of the web `/transactions` page. `useTransactionSummary(period)` +
  `useTransactionHistory(period)` call the `get_user_transaction_summary` /
  `get_user_transaction_history` RPCs directly (they scope to `auth.uid()`
  internally). Period filter chips (`TRANSACTION_PERIOD_LABELS`), four
  summary tiles (Spent / Transactions / Tickets / Successful), and the
  merged ticket+subscription history timeline with a status + refund line.
  Reachable from Account and Settings → Overview.
- **My-Tickets tab set** — `tickets.tsx` gains **Active / Past / Cancelled**
  tabs; `useMyTickets(filter)` filters by `ticket.status` and splits
  active-vs-past client-side on `getEventStatus(...) === "ended"` (the web
  switcher's split). *Refunds / To Review / Reviewed deferred — they need
  the transaction-refund join and the attendance-gated review flow.*
- **Share** — `src/lib/share.ts` (`eventShareUrl` / `placeShareUrl` against
  the canonical `abontenhub.com` origin + RN `Share.share`).
  `DetailHeaderActions` (share + favourite) replaces the lone favourite
  button in the event / place detail `headerRight`.

**Known WP-2e gaps:**
- Bottom-tab slot 3 stays **"Tickets"**, not web's "Transactions" — the
  deliberate mobile call (tickets are the more common need); `/transactions`
  lives one tap away under Account. WP-1's "reconcile" note is resolved this
  way.
- Refunds / To Review / Reviewed ticket tabs, and the transaction detail
  screen (`/transactions/[kind]/[id]` on web), not built.
- `active`/`past` client-side split can make a fetched page render fewer
  rows than `PAGE_SIZE` while more exist (web fetches per-tab server-side).
- Share deep links resolve on the web until native universal links are set
  up.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on touched files. Not device-verified.

---

## WP-2f — Role gating (done 2026-09-01)

`src/features/roles/useRoles.ts` — `useIsOrganizer()` / `useIsPlaceOwner()`,
native echoes of the web `hooks/useCurrentUser.ts` hooks: a cached
`event` where `organizer_id = uid` / `place` where `owner_id = uid`
existence check (`limit 1`). UI gating only — organizer screens re-check
ownership themselves.

- `AppMenuSheet` — the **Manage** section (Dashboard / My events /
  Finances) now renders only for organizers, matching the web `SideBar`'s
  `ManageMenu` gate. Create event / Create place stay visible to every
  signed-in user (anyone can start).
- `account.tsx` — the **Organizer** nav row is organizer-only.

**Verified:** `turbo run typecheck` 9/9, `expo export --platform android`
clean, `biome check` clean on touched files. Not device-verified.

---

## WP-2 complete (2026-09-01)

All six chunks merged to `main`: 2a Explore (`dd2bc70`) + curated sliders /
filter controls (`4f423d4`), 2b card overlays + favourites (`b2c1a82`),
2c public profile + tabs (`303c183`), 2d Settings hub + sub-pages
(`c54fc87`), 2e transactions analytics + ticket tabs + share (`e35d3fd`),
2f role gating.

**Deferred out of WP-2 (candidates for a WP-2g or folded into later WPs):**
- Explore map view + `ChangeLocationSheet` autocomplete / map picker — need
  `react-native-maps` + a Google Maps API key not yet provisioned for
  mobile (go/no-go).
- Profile highlights (Instagram-style); organizer link from `EventCard`.
- Reviews **write** (attendance-gated `AddReviewSheet` + star input) and the
  My-Tickets **To Review / Reviewed / Refunds** tabs.
- Transaction detail screen (`/transactions/[kind]/[id]`).
- Settings: avatar upload, profile-completion checklist, promotion details,
  full OTP-based email/phone change.
- Euclid Circular B font (still `.woff2`-only; needs `.ttf`/`.otf`).

---

## WP-2g — Deferral cleanup (2026-09-01)

Env: `apps/mobile/.env` gained the three client-safe keys mirrored from
`apps/web/.env.local` — `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`,
`EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
(publishable keys only; server secrets stay behind `/api/mobile/**`).

### WP-2g-1 — Euclid Circular B font (done 2026-09-01)

- `apps/mobile/assets/fonts/Euclid-Circular-B-{Light,Regular,Medium,SemiBold,Bold}.ttf`
  — converted from `apps/web/public/fonts/*.woff2` with `fonttools`
  (same five weights the web app loads via `next/font/local`).
- `src/lib/fonts.ts` — `euclidFonts` map (face name → `require`).
- `app/_layout.tsx` — `useFonts(euclidFonts)`; the root holds a blank
  themed view until the faces register (falls through on load error).
- `app.json` — `expo-font` config plugin with the five files, so a native
  build embeds them too.
- `@abonten/ui-native` `theme/tokens.ts` — `family.body` is now
  `"EuclidCircularB-Regular"` and `family.byWeight` maps a `fontWeight`
  to the matching face.
- `Typography.tsx` `AppText` (the single text chokepoint) resolves each
  render's weight from an explicit `style.fontWeight`, else a `font-*`
  utility in `className`, else the variant's baked weight, and applies the
  matching face. `Input.tsx`'s `TextInput` gets `family.body`.

**Verified:** `turbo run typecheck` (`@abonten/mobile` + `@abonten/ui-native`)
green, `expo export --platform android` clean (fonts listed in the bundle),
`biome check` clean. Not device-verified (rendered face needs a device).
