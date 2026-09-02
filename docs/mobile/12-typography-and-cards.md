# 12 — Mobile typography system + Event/Place card redesign

A dedicated, app-wide typography and card UI/UX pass on `apps/mobile` +
`@abonten/ui-native`. Goal: at a glance a user can tell what is important, what
is secondary and what is metadata — without squinting and without oversized or
noisy text. Merged to `main` in four branches:

| branch | scope |
|---|---|
| `feat/mobile-typography-tokens` | `AppText` ramp + `tone` prop, `fontScale`, `theme/layout.ts`, primitive polish |
| `feat/mobile-discovery-cards` | `EventCard` / `PlaceCard` redesign + responsive carousel width |
| `feat/mobile-header-nav` | header logo size, bottom-tab label font, `ProfileTabBar` |
| `feat/mobile-typography-sweep` | every raw `<Text>` / hard-coded `text-[Npx]` → semantic variant, whole app |
| `feat/mobile-chip-consolidation` | ~11 hand-rolled selectable pills (wizards, organizer dashboards, edit screens) → shared `Chip`; deletes 2 local `Chip` re-impls + a `ModeChip` helper (−222 lines) |

---

## 1. The type ramp (`packages/ui-native/src/primitives/Typography.tsx`)

Hierarchy is carried by **size + weight + two colour tokens** (`foreground` /
`muted-foreground`, matching web — there is no third grey tier) plus
`opacity-60` for disabled. Every rung has one job.

| variant | px / lh | weight | default colour | use for |
|---|---|---|---|---|
| `hero` | 30 / 36 | 700 | foreground | marketing / flow splash |
| `pageTitle` | 26 / 32 | 700 | foreground | screen header |
| `screenTitle` | 22 / 28 | 700 | foreground | sub-screen / empty-state heading |
| `sectionTitle` | 19 / 25 | 700 | foreground | dominant in-screen heading ("All events") |
| `sectionHeading` | 16 / 22 | 700 | foreground | quieter group heading |
| `cardTitle` | 16 / 22 | 700 | foreground | card / list-item title |
| `body` | 15 / 22 | 400 | foreground | body copy, row labels |
| `bodyStrong` | 15 / 22 | 600 | foreground | emphasised body |
| `bodyLg` | 16 / 24 | 400 | foreground | detail-screen prose |
| `label` | 13 / 18 | 600 | foreground | form field label |
| `metaStrong` | 14 / 20 | 600 | foreground | **primary metadata**: date, time, price, open/closed, status |
| `meta` | 13 / 18 | 400 | muted-foreground | **secondary metadata**: venue, distance, attendance, category |
| `small` | 13 / 19 | 400 | foreground | secondary text, inline links (+ `tone`) |
| `muted` | 13 / 19 | 400 | muted-foreground | muted supporting text |
| `overline` | 12 / 16 | 700 | muted-foreground | ALL-CAPS section kicker (tracking 0.8) |
| `caption` | 12 / 16 | 400 | muted-foreground | genuinely-tiny only |

**`tone` prop** overrides just the colour of a rung: `primary | secondary |
muted | disabled | brand | success | warning | error | inverse`. e.g. a
"2 spots left" warning is `<AppText variant="meta" tone="warning" …>`.

**Readable floor: 13px.** Nothing that a user needs to read is below 13px.
`fontScale` `MIN_MULT` is 0.95 so the 13px rung stays ≥ ~12.3px on the
smallest phones; `MAX_FONT_SIZE_MULTIPLIER` stays 1.4 (OS "larger text" cap).

### Legitimate exceptions to "no bare `text-[Npx]`"
Exact pixel values are still used, on `AppText` or `TextInput`, where the glyph
must be an exact size: `TextInput` fields, the wheel time-picker and calendar
day cells, text drawn over a photo or inside the dark media editors
(white / `text-white/NN`), emoji flag glyphs, the nav-bar title/Next button,
and the small numeric count badges on filter buttons.

## 2. Responsive carousel width (`packages/ui-native/src/theme/layout.ts`)

`useCarouselCardWidth()` → `clamp(300, round(viewportWidth * 0.84), 360)`.
Replaces the fixed `260`. Used by `ExploreSliderRow` and the "similar / upcoming"
strips on the detail screens. Always leaves a peek of the next card.

## 3. Event card (`apps/mobile/src/components/EventCard.tsx`)

Flyer is image-first: favourite toggle + `⋯` menu (both 40px targets),
"You're going" badge, and the canceled / sold-out / ended wash — **nothing
else**. The price pill is gone from the flyer.

Body hierarchy:

```
Title                       cardTitle 16/700, 2 lines
📅 Sat, 12 Sep · 8:00 PM    metaStrong 14/600, 1 line  (+"+N more" when multi-date)
📍 Venue                    meta 13, 1 line (truncates)
🏷  From GHS 50 / Free entry metaStrong 14/600
👥 120 going · 8 spots left  meta 13 — "spots left" turns amber+semibold when ≤10
```

`expo-image` has `recyclingKey` + `onError` → placeholder (broken-image
fallback). Missing flyer already handled.

## 4. Place card (`apps/mobile/src/components/PlaceCard.tsx`)

Cover is image-first: favourite toggle + optional "Sponsored" pill only. The
rating and distance pills are gone from the cover.

Body reads **What → Where → Open → Far → Good**:

```
Name                        cardTitle 16/700, 2 lines, verified tick inline
Type                        meta 13
● Open now / Closed          metaStrong 14/600, green / red dot + label
📍 Venue                     meta 13
★★★★☆ 4.6 (128) · 1.2 km    meta 13
```

Rating hidden when `avg_rating <= 0`; distance hidden when `distance_km` is not
a number; the whole rating/distance row is hidden when both are absent (no
placeholder values). `recyclingKey` + `onError` as EventCard.

## 5. Header & nav

- `AppHeader`: `AbontenLogo` 34 → 38 px, header height 52 → 54, centred title
  weight → bold.
- Bottom tabs: `tabBarLabelStyle` = 11px / 600 / Euclid (brand face on the nav).
- `ProfileTabBar` label 12 → 13.
- `SegmentedTabs` 13/medium → 14/semibold; `Chip` 12 → 13 + roomier hit box;
  `Badge` 10 → 11; `Button` sm label 13 → 14; `EmptyState` icon 28 → 32.

## 6. Verification

`turbo typecheck` (10/10) · `next build` (apps/web, clean) ·
`expo export --platform android` (bundle OK) · `biome check` on every touched
file.

**Device visual QA** was run on `emulator-5554` (Pixel 10 Pro XL, dark mode):
Home, Explore (Events + Places), Place Detail and Tickets all render the new
hierarchy correctly — card title bold, date `metaStrong`, venue/price/
attendance `meta`; the event flyer carries only the favourite toggle + `⋯`
menu + "You're going" badge (no price pill); the place cover carries only the
favourite toggle; the place card shows a red "● Closed" and omits the rating
row when `avg_rating` is 0. Still unverified: small / large screen widths,
iOS, and the money-path (Paystack) + native-module screens (type/bundle only,
as with prior mobile work).

## 7. Follow-ups

- The remaining inline `text-[13px]` classNames are colour-varying **status**
  pills (e.g. booking status warning/primary/destructive) and the
  Open/Closed toggle in the place-hours editor — legitimately not the
  selectable-chip pattern; they already meet the 13px floor.
- Visual QA at 320 dp and large (430 dp+) widths, and on iOS.
