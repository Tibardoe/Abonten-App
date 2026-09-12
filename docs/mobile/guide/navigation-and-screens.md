---
title: Mobile navigation and screens
purpose: Every screen in the Android app, how it is reached, and what it does.
audience: Support, QA, product
scope: apps/mobile/app (Expo Router)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
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

## Forms

Event and place creation are stepped wizards with autosaved drafts; phone inputs use the shared country picker; uploads show real progress (Cloudinary signed uploads).
