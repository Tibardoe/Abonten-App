---
title: Mobile navigation and screens
purpose: Every screen in the Android app, how it is reached, and what it does.
audience: Support, QA, product
scope: apps/mobile/app (Expo Router)
status: Approved
version: 1.4
lastReviewed: 2026-09-29
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Mobile navigation and screens

## Tabs (`app/(app)/(tabs)/_layout.tsx`)

**Home** (`index`) · **Search** · **Tickets** · **Messages** (unread badge, realtime) · **Account**. Each screen draws its own header (`AppHeader`). Wallet is not a tab; it is pushed from Account.

## Drawer (`src/components/app/AppDrawer.tsx`)

Opened by the header menu button or an edge swipe from the left on tab roots; closes by swipe, backdrop tap or Android back. Rows: Home, Explore/Places, My bookings, Notifications (signed in) or Sign in / Sign up; Appearance toggle; Sign out; legal rows (Terms, Privacy, Cookies, Security — open the website in the in-app browser), Help centre, official social links (X, Instagram, TikTok).

## Auth (`app/(auth)`)

`sign-in` (phone with country code, Google, email; invite code field; consent line linking Terms and Privacy) → `email` (address) → `verify` (code for phone or email).

## Screens (`app/(app)`)

| Route | Purpose |
|---|---|
| `explore/[type]` | Category/type lists; `places.tsx` place explore with map |
| `event/[id]` | Event detail: hero, organizer, dates, map, about, tags, similar; buy/RSVP, save, share, reminder, message, report |
| `buy/[eventId]` → `checkout/[sessionId]` → `payment/[attemptId]` | Ticket picker → order summary (promo, quantities, countdown, credit) → payment (saved method / card / MoMo OTP) and fulfilment retry |
| `ticket/[id]` | Ticket with QR, receipt share/PDF, cancel |
| `place/[id]` | Place detail: photos, badges, hours/open-now, services, call/WhatsApp/website/directions, reviews (write/edit), booking request, claim, message, report |
| `bookings` | My booking requests + cancel |
| `messages/[conversationId]`, `messages/archived` | Chat (text, images, files, voice notes, reactions, reply, edit/delete, copy), archived list |
| `notifications` | List, mark read/all, deep links |
| `transactions`, `transactions/[kind]/[id]` | History and detail (ticket price / fee / total; refund status) |
| `wallet` | Saved payment methods (card via GHS 1 verification, MoMo display) |
| `user/[username]` | Public profile: posts, places, favourites, reviews, highlights ring/viewer |
| `highlight/new` | Highlight composer (crop/trim, progress) |
| `settings/*` | Hub, edit profile, security (phone/email change, **delete account**), language, appearance, overview; **Help centre** and **Legal & policies** rows open the website |
| `rewards`, `rewards/invite` | Credit summary, activity, loyalty, invite link/share (shown only when the programme is enabled for the user) |
| `invite/[code]` | Deep-linked invite landing |
| `event/new`, `place/new` | Creation wizards |
| `organizer/*` | Organizer hub: events (list, drafts, `[eventId]` overview/attendees with **QR scanner**/edit/promo codes/promote/reviews), places (list, drafts, `[placeId]` overview/edit/photos/bookings/check-in/promote/reviews), finance, payouts, payout accounts, withdraw, cancel event |

## Account tab rows

Profile, Settings, Notifications, My Tickets, Transactions, Rewards (when enabled), Wallet, Places, Organizer (when applicable), **Help & support** (opens the support conversation), Appearance, Sign out.

## Gestures and feedback

Edge-swipe drawer; pull-to-refresh on lists; infinite scroll (16 hooks with `useInfiniteQuery`); haptics on key actions (`expo-haptics`); toasts instead of blocking alerts (app-wide, 2026-09); skeleton loaders.

Since 2026-09-15 (iOS TestFlight QA round 1):

- **Pull-to-refresh** shows the spinner only for the person's own pull (`<Refresher>` owns the state); background refetches never unfurl it.
- **Keyboard**: every form on `KeyboardAwareScrollView` scrolls the focused `<Input>` fully into view above the keyboard, including a growing multiline field; the chat composer resets its height on send.
- **Modals** hand off in sequence — a sheet or menu that opens another modal (location sheet → map picker, "…" menu → Report, message actions → emoji picker, highlight viewer → Report) closes fully first (`useModalHandoff` / `runAfterModalDismissal` in `@abonten/ui-native`).
- **Connection pill** under the status bar: Reconnecting… (amber, first 6 s of a drop), You're offline (red), Back online (green); offline is debounced 1.5 s so a return from the background never flashes it.
- **Side menu**: the identity card opens the public profile; tab rows switch tabs; any other route change closes the drawer.

Since 2026-09-16 (iOS TestFlight QA round 2):

- **Side menu is a navigation context**: going Back from a screen opened from the menu (Dashboard, Wallets, Notifications…) lands on the menu again; closing the menu (X, backdrop, swipe, Android back) returns to the screen underneath. Tab rows and Sign in don't reopen it; legal/help links open over it.
- **Bottom sheets**: the backdrop fades and the panel slides as separate animations (the backdrop used to slide up with the panel and read as a second sheet); `onDismiss` still fires only once the sheet is fully gone.
- **Keyboard on sign-in**: the whole phone/email card and the OTP block with its Verify button stay above the keyboard (`KeyboardRevealGroup`), not just the field.
- **Share** from the event card menu opens the native share sheet after the menu has closed (it silently did nothing on iOS); a failure shows a toast, cancelling is silent.
- **Detail maps**: the small map on event and place details is a static preview; tapping it (or Directions) opens the phone's maps app with the venue's coordinates. Place details show Directions and Check in beneath the map, like Event details.
- **Highlights**: a video highlight's progress bar moves smoothly with playback and stops while buffering or paused.

## Explore hero and status badges

The Abonten Weekly banner (`WeeklyTeaserCard`) when an edition is out for the area, then a **Featured banner** (`FeaturedBanner`, built on the same `WeeklyBanner`) for the current tab's paid events or places: listings rotate behind the text with story segments and a caption card, pausable, with a "Featured" / "Sponsored" disclosure chip; tapping opens the listing on show. A sponsored place logs a `promotion_impression` when its slide is shown, like the web slider. Featured (paid placement) is never removed by the filter sheet, and active filter chips sit a fixed gap below it. Event cards carry one bottom-left status pill (Cancelled / Sold out / Ongoing / Ended) instead of a full-image wash. Map clusters that share one spot open a "N at this spot" list on tap.

## Explore filters

The Filters button on the Events and Places tabs opens "Filter events" / "Filter places", built from the same parts as the Search screen's "Filter results" sheet (`components/filters/FilterSheetParts`), so the two look and behave alike: each section starts with its "any" choice, a set section shows a dot and "Clear", and the footer reads "Show results · N filters" with "Reset filters". Events: When (Any time, Today, Tomorrow, This weekend, Next 7 days, Next 30 days, Pick dates), Distance from the browsed area (Any distance, 1, 2, 5 km), Price (Any price, Free, and the Search sheet's two caps in the market's currency, plus Custom range), Category, Type, Rating (Any, 3+, 4+, 4.5+ stars). Places: Distance (also 10 km), Category, Open now (switch), Rating. The calendar and the price slider appear only under Pick dates and Custom range. The chips under the tabs read the same way ("This weekend", "Within 2 km", "Free", "4+ stars"). Explore still stores plain dates and amounts, so the web Explore page and the server filters are unchanged.

## Explore map

The Map button on the Events and Places tabs shows the list as a map (`components/map/SocialMap.tsx`, markers in `SocialMapPins.tsx`, card in `SocialMapCard.tsx`). Each event or place is its flyer or cover in a white ring; pins that would overlap become a small photo stack with a count, which splits as you zoom (tapping it zooms to its pins, or lists them when they share one spot). Tapping a pin fades a mint halo in around it and raises a card (photo, title, when/where or open status, price or rating, "View event" / "View place"); the map pans only if the pin would sit under the card or an edge. Tapping the map, the X, swiping the card down, or the pin dropping out of the filters all play the same exit: the card slides away and the halo fades. Tapping another pin swaps the card's details in place. A round button top right returns to the browsed area once the map has moved away from it; choosing a new area moves the map there. Google's own shop and transit pins are hidden, and the map follows the app's dark theme.

Android draws every marker as a bitmap, and react-native-maps 1.27 has two traps the map works around (both explained in the source): a marker inserted anywhere but the end of the map's children overwrites another marker's slot and leaves a pin nothing can remove (`useAppendOnlyOrder.ts`), and a marker's bitmap does not reliably follow later changes to its children, so the halo is its own marker faded with the map's alpha and a cluster whose count changes is a new marker. Coming back to the map from a detail screen redraws its markers.

## Choosing a location

"Set your location" (the area name under Explore, also on Places) leads with a search field, then "Use my current location" and "Choose on map". Tapping the field opens the search full screen with the keyboard up (`components/explore/LocationSearchOverlay.tsx`): suggestions fill the space between the field and the keyboard, with skeleton rows while they load and a "Search for “…”" row that uses the text as typed; with nothing typed it shows the two quick actions. Back closes the keyboard first, then returns to the sheet. Picking a place sets the area and closes both.

## Chat

The header leads with the other person's name and avatar (the event or place is the line beneath), which becomes "typing…" while they type and "In this chat" while they have the thread open (Realtime Presence on the private conversation channel — nothing stored). The composer grows with its text up to five lines and shows a characters-left count near the limit; the inbox loads with row skeletons. Own-message ticks and timestamps are drawn in the bubble's dark foreground ink (single = sent, double = read, clock = sending, "Tap to retry" = failed); deleted messages are dashed, muted tombstones with no ticks; http(s)/www links are tappable (own abontenhub.com event / place / weekly / invite / messages links open in the app, everything else in the in-app browser).

## Events at a place

The event wizard's Location step lets a place owner pin the event to one of their published places (sends `placeId`); Manage Place lists the place's upcoming events with **Add event**, which opens the wizard with the venue pre-selected. Pinned events appear under "Upcoming events here" on the public place page.

## Forms

Event and place creation are stepped wizards with autosaved drafts; phone inputs use the shared country picker; uploads show real progress (Cloudinary signed uploads).
