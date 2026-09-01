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
| **WP-3 Checkout & buyer** | pending-checkouts basket; promo codes; free RSVP; live expiry countdown; fulfillment recovery; cancel-ticket/refund; ticket PDF/receipt; AddBankCard | **done** (2026-09-01) — 3a–3i, see below; money-path items not device/Paystack-verified |
| **WP-4 Organizer & creator** | event/place creation; per-event management (analytics, attendance/check-in, promo CRUD, edit/delete, promotion); dashboard widgets; drafts; place management; payout detail; map views | in progress (2026-09-01) — 4a place creation done, see below |

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

**Deferred out of WP-2 — all cleared in WP-2g (2026-09-01), except:**
- ~~Explore map view + `ChangeLocationSheet` autocomplete / map picker~~ →
  WP-2g-6 (needs a native rebuild to render; see that section).
- ~~Profile highlights~~ → WP-2g-2. ~~organizer link~~ → WP-2g-2.
- ~~Reviews **write** + To Review / Reviewed / Refunds tabs~~ → WP-2g-3.
- ~~Transaction detail screen~~ → WP-2g-4.
- ~~Settings avatar upload~~ → WP-2g-5.
- ~~Euclid Circular B font~~ → WP-2g-1.
- **Still deferred:** review photo attachments (Cloudinary signed upload
  flow), profile-completion checklist, promotion details, full OTP-based
  email/phone change, highlight upload/delete (creator tooling), video
  playback in the highlight viewer (`expo-video`), `user_image_history`
  write on avatar change (no client INSERT policy).

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

### WP-2g-2 — Organizer link + profile highlights (done 2026-09-01)

**Organizer card (event detail).** `useEventDetail` now also returns
`organizerRating` (`review` avg where `reviewed_id = organizer_id`, same as
the web page's `getUserRating`). `event/[id].tsx`'s "Organized by" block is
now a card `Pressable` → `/(app)/user/{username}`, with the 5-star rating
row and a `Posted {getRelativeTime(created_at)}` line — parity with the web
detail page's Organizer Card.

**Highlights.** `src/features/profile/useHighlights.ts` reads the
`highlight` table directly (`highlight_public_select` RLS is `USING(true)`),
grouped by `group_id` (newest group first, slides oldest-first).
`src/components/profile/HighlightsRow.tsx` — the horizontal strip of
mint-ringed covers on the profile header (replaces the placeholder line);
`HighlightViewer.tsx` — a story player (progress bars, tap L/R to step,
press-hold to pause, auto-advance, rolls to the next group). Image slides
play fully; video/audio slides show their thumbnail for the same dwell
(native video needs `expo-video` — deferred). Owner add/delete of
highlights stays deferred to creator tooling (WP-4).

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean. Not
device-verified.

### WP-2g-3 — Reviews write + To Review / Reviewed / Refunds tabs (done 2026-09-01)

`event_review` (reviewer-scoped RLS) + `ticket` (owner-scoped RLS) + `event`
(public) are all directly reachable, so the whole event-review flow is
client-side — no `/api/mobile` endpoint. Every rule the web server actions
enforce is re-checked in `src/features/reviews/useEventReviews.ts`, and the
DB's `UNIQUE(event_id, reviewer_id)` is the backstop.

- `useEventReviewEligibility(event)` — native `getEventReviewEligibility`:
  signed-in? organizer? own review? cancelled? ended
  (`resolveEventEndDate`)? checked-in (`ticket.status = 'used'`) ticket?
- `useEventsAwaitingReview()` / `useUserEventReviews()` (cursor-paginated) /
  `usePostEventReview()` (inserts `status:'approved'`,
  `is_verified_attendee:true`, title-cased title) / `useDeleteEventReview()`.
- `components/reviews/`: `StarRatingInput` (tappable 1–5),
  `AddReviewSheet` (rating + optional title ≤150 + comment ≤500 — photos
  deferred, need the Cloudinary signed upload), `EventsToReviewList`,
  `ReviewedEventsList` (with "Verified Attendee" badge + delete).
- `event/[id].tsx` — a "Write a review" button when eligible, or the user's
  own review card when they've already reviewed.
- `tickets.tsx` — the chip row goes from 3 to 6: Active / Past / Cancelled /
  **Refunds** / **To Review** / **Reviewed**. `useMyTickets` gained a
  `refunds` filter (`TICKET_REFUND_SELECT` + `transaction.amount > 0`, like
  `getUserTicketRefunds`); `TicketCard` gained `showRefundInfo` for the
  refund-status line.

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean. Not
device-verified (needs a signed-in user with a checked-in ticket).

### WP-2g-4 — Transaction detail screen (done 2026-09-01)

`app/(app)/transactions.tsx` became `transactions/index.tsx` under a new
`transactions/_layout.tsx` Stack (like `settings/`), plus
`transactions/[kind]/[id].tsx` — the native echo of the web
`/transactions/[kind]/[id]` page.

- `src/features/transactions/useTransactionDetail.ts` — native
  `getUserTransactionDetail`: one `ticket_checkout` /
  `subscription_checkout` row scoped by id **and** `user_id`
  (owner-scoped RLS), with the same service-fee attribution math (this
  checkout's proportional share of `transaction.amount`).
- The detail screen: amount banner, status banner (icon + contextual
  Completed/Expires/Date), and the labelled field block — Event / Ticket
  type / Quantity / Unit price / Discount / Ticket price / Service fee /
  Total paid / Date / Order reference / Cancelled / Refund (via
  `getRefundStatusLabel`), or the subscription equivalents.
- `transactions/index.tsx` rows are now `Pressable` → the detail route.
- `(app)/_layout.tsx` — the `transactions` tab screen is now
  `headerShown: false` (its Stack owns the header).

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean. Not
device-verified.

### WP-2g-5 — Settings avatar upload (done 2026-09-01)

`src/features/profile/useAvatarUpload.ts` — the native echo of the web
`getAvatarUploadSignature` + `saveAvatarToSupabase`:

1. `expo-image-picker` — pick a square image (`allowsEditing`, `aspect [1,1]`).
2. `api.uploads.signature("avatar")` → a short-lived Cloudinary signature
   scoped to `user_profiles/<user id>` (secret never leaves the server).
3. Multipart `POST` straight to `api.cloudinary.com/.../image/upload`.
4. `user_info.update({ avatar_public_id, avatar_version })` (RLS
   `user_info_self_update`); invalidates the profile queries.

`settings/edit-profile.tsx` — the avatar and a "Change photo" button now
run this (replacing the "change it on the web" caption). `app.json` gains
the `expo-image-picker` plugin with an iOS photo-permission string.

**Not ported:** the `user_image_history` insert the web action also does —
that table has no client `INSERT` RLS policy, so it stays server-side
(and the web action's treatment of a failed history insert as a hard
error looks like a latent post-RLS bug — flagged, not touched).

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean. Not
device-verified (needs a device photo library + Cloudinary round-trip).

### WP-2g-6 — Explore map view + map picker + Places autocomplete (done 2026-09-01)

`react-native-maps@1.27.2` added. **This is a native module** — the map
only renders after the app binary is rebuilt with it linked
(`npx expo run:android`, or a fresh EAS dev/preview build). On a stale
binary `MapErrorBoundary` (`src/components/map/NativeMap.tsx`) shows an
"update the app" message instead of crashing; everything else on the
screen keeps working.

- `app.config.js` (new) — layers `android.config.googleMaps.apiKey` /
  `ios.config.googleMapsApiKey` from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` so
  the key never lives in a tracked file. **EAS builds need
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` set in the project's EAS env vars**
  (dev / preview / production), like the Supabase vars.
- `components/explore/ExploreMap.tsx` — the Explore list rendered as pins
  (web `EventsMapView` / `PlacesMapView`). Locations parsed from the
  `location` geography column with the shared `@abonten/core/parseWKBHex`;
  tap a pin's callout → the detail screen. A **List / Map toggle** sits
  next to the Events/Places tabs on `app/(app)/index.tsx`.
- `components/explore/MapPickerSheet.tsx` — full-screen map with a fixed
  centre pin (web `MapModal` / `MapPicker`); "Use this location" commits
  the centre via the provider's new `setPickedLocation` (reverse-geocodes
  a label).
- `features/discovery/usePlacesAutocomplete.ts` — Google Places
  autocomplete via the REST endpoints (no DOM SDK on native), session
  tokens, `resolvePlace(placeId)` → `{lat,lng,address}`. Degrades to plain
  manual entry if the key is missing or referrer-locked. **The key must
  allow the Places API without an HTTP-referrer restriction for the
  suggestions to work from the app.**
- `ChangeLocationSheet.tsx` — the address field now shows autocomplete
  suggestions, plus a "Choose on map" entry into `MapPickerSheet`.
- `ExploreLocationProvider` — `setPickedLocation(lat, lng, label?)`.

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean (JS bundle only — native linking
and the rendered map are NOT verified here), `biome check` clean. Needs a
native rebuild + a device to verify the map, and a Places-enabled key for
autocomplete.

---

## WP-3 — Checkout & buyer completeness (COMPLETE 2026-09-01)

All nine items shipped as one-branch-per-item, `--no-ff` merged to `main`.
Every payment-path core follows the established contract: a
`*Core(supabase, userId, …)` extracted from the monolithic `"use server"`
action (thinned to an auth + `revalidatePath` wrapper, no logic fork), a
`/api/mobile/**` route with `getMobileAuth` + `apiJson`, an `@abonten/api-client`
method + types, then the mobile UI. **Money-path items (cancel/refund,
AddBankCard, and any real Paystack charge) are code-, type- and
bundle-verified but NOT device- or Paystack-verified** — same caveat as
phase 5.7; they need Paystack test keys + a device pass.

| Item | Branch / merge | Core + route |
|---|---|---|
| Live expiry countdown | WP-3a (`63a68b7`) | client-only |
| Profile-completion checklist | WP-3b (`4e2024b`) | client-only |
| Pending-checkouts basket | WP-3c (`b25a8fb`) | `getUserPendingTicketCheckoutsCore` + `GET /api/mobile/checkout/pending` |
| Fulfillment recovery | WP-3d (`55e4e66`) | `retryPaymentFulfillmentCore` + `POST /api/mobile/payments/retry` |
| Free RSVP | WP-3e (`430a4ad`) | `registerForFreeEventCore` + `POST /api/mobile/checkout/free-rsvp` |
| Cancel ticket + partial refund | WP-3f (`08a126c`) | `cancelUserTicketCore` (reuses `issueRefundCore`) + `POST /api/mobile/tickets/cancel` |
| Promo codes | WP-3g (`f951a90`) | `getPromoCodeCore` + optional client on `claim/releasePromoUsage`; `/checkout/validate` now forwards `promoCode` |
| AddBankCard | WP-3h (`8940a6d`) | `cardVerificationCore` (init + confirm) + `POST /api/mobile/payment-methods/card/{init,confirm}` |
| Ticket PDF/receipt | WP-3i | client-only (`expo-print` + `expo-sharing` + `expo-file-system`) |

### WP-3c — Pending-checkouts basket (done 2026-09-01)

`getUserPendingTicketCheckoutsCore(supabase, userId)` extracted; action
thinned; `PendingCheckoutSession`/`…Line` types re-exported for the web
import sites (`checkout` pages, `PendingCheckoutsBasket`,
`TicketCheckoutSessionCard`). `GET /api/mobile/checkout/pending` wraps it;
`api.checkout.pending()` added.

Mobile: `usePendingCheckouts()` + `components/checkout/PendingCheckoutsSection.tsx`
as the `ListHeaderComponent` of the **Active** tickets tab — one card per
session with live `useCheckoutCountdown`, line summary, **Resume** (→
`/checkout/{id}`) and **Release** (→ `api.checkout.cancel`). Line-level
quantity editing from the basket (web has it) is deferred to the checkout
screen you resume into.

### WP-3d — Payment fulfillment recovery (done 2026-09-01)

`retryPaymentFulfillmentCore(supabase, userId, paymentAttemptId)` — same
`finalizePaystackPayment` pipeline as the webhook/verify, never re-charges.
`POST /api/mobile/payments/retry`; `api.payments.retry()` reuses the
`VerifyPaymentResult` shape.

Mobile: a 207 from `verify()` in `PaymentSection` is no longer a dead-end
"contact support" — it becomes a "Payment received — finishing up" state
with **Retry issuing my ticket** (`useRetryFulfillment`). Native echo of
the web `FulfillmentRecoveryBanner`.

### WP-3e — Free-event RSVP (done 2026-09-01)

`registerForFreeEventCore(supabase, userId, eventId, occurrenceId?)` — the
core drives the chained helpers (`insertUserAttendance`,
`ticketPurchaseNotification`) through the existing `AuthOverride {
supabase, userId }` the Paystack webhook already uses, so no cookie
context; `reserveTicketQuantity` + the Cloudinary QR upload are unchanged;
the confirmation email is scheduled in the core (`after()`). Web wrapper
keeps `revalidatePath`. `POST /api/mobile/checkout/free-rsvp`;
`api.checkout.freeRsvp()`.

Mobile: the "Free RSVP is coming to the app soon" placeholder on the event
screen is replaced by `components/checkout/FreeRsvpCard.tsx` — occurrence
picker + one-tap **RSVP — get free ticket** (`useFreeRsvp`), signed-out
gate via `setPendingRedirect`, success + already-registered states.

### WP-3f — Cancel ticket + partial refund (done 2026-09-01)

`cancelUserTicketCore(supabase, userId, ticketId, transactionId)` — the
whole body + its three private helpers (all-siblings-cancelled gate,
checkout rollup, promo-usage release). The whole-order refund gate is
preserved: a paid ticket only triggers `issueRefundCore` (partial Paystack
refund of ticket revenue, fee retained) once **every** ticket sharing its
transaction is cancelled; otherwise the message says the refund is
deferred. Web wrapper keeps `revalidatePath` (core returns
eventId/eventCode). `POST /api/mobile/tickets/cancel`; `api.tickets.cancel()`.

Mobile: **Cancel ticket** / **Cancel ticket & request refund** on the
ticket detail screen (active tickets only), with a refund-aware confirm
`Alert`. Native echo of the web `CancelUserTicketBtn`.

### WP-3g — Promo codes at checkout (done 2026-09-01)

`validateCheckoutCore` already did promo end-to-end; the blocker was that
`getPromoCode` / `claimPromoUsage` / `releasePromoUsage` each built their
own cookie/anon client, so they 401'd or hit RLS from a Bearer route. Now:
`getPromoCodeCore(supabase, userId, code, eventId)` extracted;
`claim/releasePromoUsage` take an optional trailing `client`;
`validateCheckoutCore` threads its own `supabase` into all three;
`cancelTicketCheckoutSessionCore` + `cancelUserTicketCore` do too (was a
latent no-op on the mobile cancel path once promo is live). RLS confirmed
(`20260825105233`): `promo_code_authenticated_usage_update` (TO
authenticated USING(true), column-guarded by trigger) +
`promo_code_usage_owner_*` (auth.uid() = user_id) — the Bearer client is
the same authenticated role + uid. `/checkout/validate` stops rejecting
`promoCode`; `ValidateCheckoutBody.promoCode?` added.

Mobile: promo-code field in `TicketPicker`; applied at "Get tickets"
(validate); a bad code is surfaced inline instead of aborting checkout.
Live promo preview (web's `CheckoutModal` has one) is deferred.

### WP-3h — Add a card as a payment method (done 2026-09-01)

Ports the web `AddBankCard` verification flow (Paystack can't tokenise a
card without a charge). `cardVerificationCore.ts`:
`initCardVerificationCore(userId, userEmail)` starts a GHS 1
`card`-channel charge (now also returns `authorizationUrl` for the mobile
browser session); `confirmCardVerificationCore(supabase, userId,
userEmail, reference, label?)` independently verifies it, checks the
customer email matches the caller, captures the reusable authorization,
refunds the GHS 1 (best-effort), saves via `addPaymentMethodCore`. Both
actions thinned (explicit return types — the status-widening gotcha).
`POST /api/mobile/payment-methods/card/{init,confirm}`;
`api.paymentMethods.initCard()` / `confirmCard()`.

Mobile: **Add debit / credit card** on the wallet screen — `useAddCard`
opens the Paystack page in a `WebBrowser` auth session, then calls
`confirmCard` on return (the source of truth regardless of how the browser
closed). The "cards can't be added from the app" note becomes the GHS 1
verification-charge explanation.

### WP-3i — Ticket PDF / receipt (done 2026-09-01)

Native echo of the web `TicketModal` "Download As PDF" button. Client-only
— no `/api/mobile` route: the shared `@abonten/core/ticketPdfData`
(`buildTicketPdfData` / `buildTicketPdfFilename`) already normalises a
`UserTicketType` into the exact fields the receipt needs, and the mobile
ticket-detail query (`useTicketDetail`, `TICKET_WITH_EVENT_SELECT`) returns
that shape.

- `src/features/tickets/ticketReceiptHtml.ts` — `buildTicketReceiptHtml`, an
  HTML mirror of the web `@react-pdf/renderer` `TicketPdfDocument` (same
  layout, colours `#1a1a1a` / `#6b7280` / `#16a34a` / `#dc2626`, same
  fields: logo, "Receipt", issued date, flyer, title, attendee?, ticket
  type, code, status, location, date+time, QR, `www.abontenhub.com`
  footer). The Abonten logo URL is the same Cloudinary `f_png` asset the
  email uses (mirrors `apps/web/src/config/brandAssets.ts`, kept in sync by
  hand). All interpolated values are HTML-escaped.
- `src/features/tickets/useTicketReceipt.ts` — `downloadReceipt(ticket)`:
  `Print.printToFileAsync({ html })` → copy to
  `Abonten-Ticket-<code>.pdf` in the cache dir via the SDK 57
  `expo-file-system` `File`/`Paths` API (matches the web download filename;
  non-fatal fallback to the generated name) → `Sharing.shareAsync` with
  `application/pdf` / `com.adobe.pdf`. `isGenerating` state.
- `app/(app)/ticket/[id].tsx` — a primary **Download receipt (PDF)** button
  (download icon, spinner while generating) above "View event". The web
  surfaces the receipt through a modal; the mobile detail screen is that
  surface.
- **New deps:** `expo-print ~57.0.1`, `expo-sharing ~57.0.16`,
  `expo-file-system ~57.0.6` (was already resolved transitively; now a
  direct dep since it's imported directly). `expo-sharing` config plugin
  added to `app.json`. The EAS Update wiring (`expo-updates` +
  `updates.url`) that was sitting uncommitted was landed first as its own
  `chore(mobile): wire EAS Update` commit (`2253002`).

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean,
**`npx expo run:android` BUILD SUCCESSFUL** — the three new native modules
autolink and the `expo-sharing` plugin applies; APK installs on
`emulator-5554`. The actual PDF render + OS share sheet (remote images
loading, file naming in the target app) is **not** UI-verified from here.

### Earlier WP-3 items

### WP-3a — Live checkout expiry countdown (done 2026-09-01)

`src/features/checkout/useCheckoutCountdown.ts` — native port of the web
`hooks/useCheckoutCountdown.ts` (`useCheckoutCountdown` + `formatCountdown`,
120s warning threshold). Display-only; the server's
`expire_stale_ticket_checkouts` sweep is the real enforcement.

`app/(app)/checkout/[sessionId].tsx` now also calls `useCheckoutSession`
(the `/checkout/session/:id` route self-heals stale rows), reads the first
line item's `ticket_checkout.expires_at`, and renders a `CheckoutExpiryBanner`
(muted → destructive under 2 min → "expired"). On hitting zero it refetches
`prepare` + `session` once, so the screen flips into the existing
server-driven "expired / seats released" state.

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean. Not
device-verified.

**(All WP-3 items — pending basket, promo codes, free RSVP, fulfillment
recovery, cancel/refund, AddBankCard, ticket PDF/receipt — shipped
2026-09-01; see the table and per-item sections above.)**

### WP-3b — Profile-completion checklist (done 2026-09-01)

`src/features/profile/useProfileCompletion.ts` — native echo of the web
`getProfileCompletion` + `useProfileCompletion`, using the shared
`@abonten/core/profileCompletion` (`computeProfileCompletion`: name / real
username / verified email / avatar; computed on read, never stored).
Reads `user_info` directly for `username_is_generated` (not on the
`user_profile_details` view).

`components/profile/ProfileCompletionCard.tsx` — the 4-item checklist above
the Edit Profile fields; each row routes to the mobile equivalent of the
web `href`; the card renders nothing once complete.

Also: `src/lib/cloudinaryUpload.ts` — the signed-direct-upload helper
(previously inline in `useAvatarUpload`) extracted so review-photo and
highlight uploads can share it.

**Verified:** `turbo run typecheck --filter=@abonten/mobile` green,
`expo export --platform android` clean, `biome check` clean.

### Native rebuild status — RESOLVED (2026-09-01)

`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` **set as an EAS env var** for
development / preview / production (`eas env:create`, project
`@abonten-hub/abonten`).

`npx expo run:android` now **builds, installs and launches on
`emulator-5554` (Pixel_10_Pro_XL)** — `BUILD SUCCESSFUL`, `com.abonten.app`
installed, first full build ~5 min then incremental ~1–2 min. This
unblocks device verification of `react-native-maps` (WP-2g-6),
`expo-image-picker` → avatar upload (WP-2g-5), and review-photo / highlight
image pickers.

Three machine-level fixes got it there — all outside git
(`local.properties` is gitignored; the JDK pin is in
`~/.gradle/gradle.properties`):

1. **JDK 17.** AGP 8.12 (Expo SDK 57 / RN 0.86) runs the `prefab` tool as a
   subprocess on the Gradle daemon's JDK. Android Studio's bundled JBR had
   auto-updated to **25**, on which `prefab` prints a native-access warning
   to stderr that AGP treats as fatal
   (`:<module>:configureCMakeDebug … A restricted method in
   java.lang.System has been called`). Installed Microsoft OpenJDK 17
   (`winget install Microsoft.OpenJDK.17` →
   `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`) and pinned the
   Gradle daemon to it via `org.gradle.java.home` in
   `C:\Users\<user>\.gradle\gradle.properties`.
2. **CMake 3.30.5** — the version RN 0.86.3 targets
   (`ReactAndroid/build.gradle.kts`: `CMAKE_VERSION ?: "3.30.5"`). The SDK
   only had `3.22.1` (too old — `[CXX5304] SDK XML file of version 4`) and
   `4.1.2` (too new — `cmake_minimum_required` in
   `node_modules/expo-updates/android/CMakeLists.txt` is `VERSION 3.4.1`,
   below CMake 4's hard floor of 3.5). There's no `cmdline-tools`/
   `sdkmanager` on the machine, so installed it by hand: downloaded
   `https://dl.google.com/android/repository/cmake-3.30.5-windows.zip` and
   extracted it to `<SDK>\cmake\3.30.5\` (ships its own `bin/`,
   `source.properties`, `ninja.exe`).
3. **`cmake.dir=C:/AndroidSdk/cmake/3.30.5`** in
   `apps/mobile/android/local.properties` — forces every native module
   (RN community libs don't pin a CMake version, so they'd otherwise fall
   back to AGP's default 3.22.1 and re-trigger CXX5304).

To reproduce on another machine: JDK 17 + `cmake;3.30.5` (via Android
Studio SDK Manager or the direct zip) + the `cmake.dir` line.

EAS route still valid as an alternative:
`eas build --profile development --platform android`.

---

## WP-4 — Organizer & creator (in progress, 2026-09-01)

Makes the mobile organizer surface read-**write**. The read side (dashboard,
finance, events list, payouts, cancel-event) landed in phases 5.8/5.9 and
already has `api/mobile/organizer/*` routes. WP-4 adds creation +
management. Proposed chunking: **4a place creation** · 4b event creation ·
4c per-event management (analytics / edit / delete / promote) · 4d attendee
list + check-in (needs `expo-camera`) · 4e promo CRUD · 4f per-place
management · 4g dashboard widgets + drafts. Same per-chunk git flow.

### WP-4a — Place creation (done 2026-09-01)

Native echo of the web `PlaceUploadModal` (Places Milestone 3) — a 4-step
wizard (Basic info · Cover photo · Hours · Review) that publishes a place.
Create-only; save-as-draft is deferred to WP-4g.

- **`apps/web/src/utils/postPlaceCore.ts`** — `postPlaceCore(supabase,
  userId, input)` lifted from `postPlace`: location validation, slug, the
  `create_place` RPC, draft cleanup. The one platform difference — where
  the cover bytes reach Cloudinary (web: `savePlacePhotoToCloudinary` with
  a `File`; mobile: a signed direct upload from the device) — is resolved
  by the caller, which hands the core an already-uploaded
  `coverPublicId` / `coverVersion`. `postPlace` thinned to auth + cover
  resolution → core (explicit return type — the status-widening gotcha).
- **`POST /api/mobile/places`** — `getMobileAuth` + body validation →
  `postPlaceCore`. RLS confirmed (`20260825105513`): `place_owner_insert`
  = `auth.uid() = owner_id`, `place_opening_hours` / `place_service`
  owner_all keyed on the parent place's `owner_id`; `create_place` is
  `GRANT ALL … TO authenticated` and runs SECURITY INVOKER, so the Bearer
  `authenticated` client (same role + `auth.uid()` as the web cookie
  session) inserts identically. Same finding class as WP-3g.
- **`@abonten/api-client`** — `PlaceCreateBody` / `PlaceCreateResult` +
  `places.create(body)`; re-exports `PlaceOpeningHoursInput` /
  `PlaceServiceInput` from `@abonten/types/placeType`.
- **Mobile** — `src/features/places/useCreatePlace.ts` (upload cover via
  `uploadToCloudinary(uri, "place_photo")` → `api.places.create`);
  `src/lib/uuid.ts` (`uuidv4` for the `clientRequestId` idempotency key —
  no `crypto.randomUUID` dependency); `app/(app)/place/new.tsx` — the
  wizard, using `@abonten/ui-native` `Field`/`Input`/`Button`, the shared
  `@abonten/validation/placeSchema` for the text fields, `usePlaceCategories`
  (WP-2a) for the category picker, `usePlacesAutocomplete` (WP-2g-6) +
  `expo-location` reverse-geocode for the address, `expo-image-picker`
  (`allowsEditing`, `aspect [16,9]`) for the cover. `/place/new` added to
  `authRedirect` `PROTECTED_PREFIXES` (only matches `/place/new`, not the
  public `/place/<id>` detail). Entry points: `AppMenuSheet` "Create place"
  row (was → website) and an "Add place" button on `places.tsx`.
- **No new deps** — `expo-image-picker` / `expo-location` were already in
  the build; no native rebuild needed.

**Verified:** `turbo run typecheck` (`@abonten/web` + `@abonten/mobile` +
`@abonten/api-client`) green, `next build` exit 0 (`/api/mobile/places`
compiled), `expo export --platform android` clean, `biome check` clean.
Not device-verified — the wizard flow, the Cloudinary cover upload and the
`create_place` write from a Bearer client need a signed-in device pass.

### Map-pick for the address (deferred)

`place/new.tsx` covers address entry via autocomplete + current-location.
A map-pin picker (web's `MapModal`) is deferred: the existing
`MapPickerSheet` is wired to `ExploreLocationProvider`, so a standalone
"pick on map for this form" needs it generalised with an `onPick` callback
— a small follow-up, tracked here.
