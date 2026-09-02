# 13 — Web → Mobile Feature Parity Audit (Round 2)

Date: 2026-09-02
Scope: full sweep of `apps/web` user-facing features vs `apps/mobile`, plus the
UX-quality asks (checkout flow shape, map, drawer gesture, infinite scroll).

This is the **Phase 1 deliverable**. No implementation code has been written yet.
A branch + phased implementation follows once priorities are confirmed.

---

## 0. How mobile talks to the backend (recap, verified)

Two lanes, unchanged from the shared-backend work:

| Lane | Used for | Mechanism |
| --- | --- | --- |
| **Class-A** | RLS-safe reads + simple owner-scoped writes | `supabase.*` straight from the client (`apps/mobile/src/lib/supabase.ts`) |
| **Class-B/C** | privileged / multi-step / money / cross-user writes | typed `@abonten/api-client` → `apps/web/src/app/api/mobile/**` route handlers (Bearer JWT) |

`apps/mobile` never imports `@abonten/services` and never holds a service-role
key or Paystack secret. Every gap below is solved **within one of those two
lanes** — no new privileged surface in RN, no RLS weakening.

**Key finding for the three big consumer gaps:** `place_review`,
`place_claim_request` and `place_booking` **already have the exact RLS policies
that make them class-A** (`supabase/migrations/20260825105513_enable_rls_places_batch3.sql`):

- `place_review_reviewer_insert/update/delete/select` — `auth.uid() = reviewer_id`
- `place_review_photo_reviewer_all` — scoped through the review row
- `place_claim_request_claimant_insert/select` — `auth.uid() = claimant_id`
  (partial unique index enforces one pending claim per place+claimant)
- `place_booking_customer_insert/select/update` — `auth.uid() = customer_id`

So claims, place reviews and booking requests can be built on mobile with the
**same rules and the same rows the web Server Actions write**, no `/api/mobile`
route and no migration. The one wrinkle is the owner **notification** on a new
booking request (see §5).

---

## 1. Feature gap matrix

Legend — Mobile status: ✅ full · 🟡 partial · ❌ missing · ➖ N/A

### Discovery / listing

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Event discovery (home/explore, sliders, featured) | ✅ | ✅ | — | — |
| Place discovery (explore tab, featured, categories) | ✅ | ✅ | — | — |
| Filters (category, date range, price, distance, sort) | ✅ | ✅ `FilterSheet` | — | — |
| Map view of a listing | ✅ pins + callout | 🟡 pins + callout only | **Snapchat-style redesign: image markers, pull-up preview card, clustering** | **P1** |
| Nearby / around-you | ✅ | ✅ | — | — |
| Search — events by text + suggestions | ✅ | ✅ | — | — |
| Search — places in the full results list | 🟡 (suggestions only; results page is events-only) | 🟡 (same) | matches web; low value | P2 |
| Infinite scroll on feeds | ✅ cursor pages | ✅ (`useInfiniteQuery` in 16 hooks: events, places, search, notifications, reviews, tickets, transactions, profile tabs, organizer lists) | audit for **end/empty/error-next/retry states + dedupe**; a few horizontal carousels still slice arrays | P2 |

### Event detail + ticketing

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Event detail (hero, organizer, date/loc, map, about, tags, similar) | ✅ | ✅ | — | — |
| Favourite event | ✅ | ✅ optimistic | — | — |
| Share event | ✅ | ✅ | — | — |
| Event reminder | ➖ | ✅ (mobile-only, cross-device) | — | — |
| Free RSVP | ✅ | ✅ `FreeRsvpCard` | — | — |
| Paid checkout — ticket select, promo, qty, order summary, wallet, pay, success | ✅ multi-screen (`CheckoutModal` → `/checkout/[checkoutId]`) | 🟡 **works but flattened**: `TicketPicker` is inline on the detail page; wallet+pay share one screen | **Restructure into a stepped flow** (detail → Buy Ticket → select → promo → qty → summary → proceed → wallet → pay → success) | **P1** |
| Promo code apply / errors | ✅ dedicated box, live validate | 🟡 single field on `TicketPicker`, validated only on "Get tickets" | fold into the new promo step with explicit valid/invalid/expired/limit states | P1 |
| Pending-checkout basket / resume | ✅ | ✅ `PendingCheckoutsSection` | — | — |
| Checkout countdown / expiry | ✅ | ✅ | — | — |
| Fulfilment recovery (paid, ticket not issued) | ✅ | ✅ `PaymentSection` 207 path | — | — |
| Tickets list (active/past/cancelled/refunds) | ✅ | ✅ | — | — |
| Ticket detail + QR + receipt | ✅ | ✅ | — | — |
| Cancel ticket + refund status | ✅ | ✅ | — | — |

### Place detail

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Place detail (hero, badges, hours, services, photos, contact, map, upcoming, similar) | ✅ | ✅ | — | — |
| Favourite place | ✅ | ✅ | — | — |
| Share place | ✅ | ✅ | — | — |
| Directions / Call / WhatsApp | ✅ | ✅ | — | — |
| **Claim this place** | ✅ `ClaimPlaceButton` → `ClaimPlaceModal` → `submitPlaceClaimRequest` | ❌ **absent** | **Build full flow** (button gated to signed-in non-owner; note + contact phone/email; submitted/pending/error states; own-claim status on revisit) | **P0** |
| **Write / edit / delete a place review** | ✅ `AddPlaceReviewButton` + `PlaceReviewModal` (rating, optional title ≤150, comment ≤500, up to N photos; own-review Edit/Delete) | ❌ **read-only** (`usePlaceReviewsList` shows them; no compose) | **Build compose sheet + own-review card + edit/delete**, mirroring the event-review flow already on mobile | **P0** |
| **Book / request a reservation** | ✅ `RequestBookingButton` → `RequestBookingModal` → `requestPlaceBooking` (optional service, datetime, party size, note; request-only, owner accepts/declines; notifies owner) | ❌ **absent** | **Build booking-request flow** with native date/time + stepper; submitted/pending state; owner notification (see §5) | **P0** |
| My bookings list + cancel | ✅ `user/[username]/bookings` + `cancelPlaceBooking` | ❌ absent | add a "Bookings" surface (profile tab or account row) with cancel | **P1** |
| Report place / report review | ✅ `reportPlace` / `reportPlaceReview` | ❌ absent | overflow-menu action; `place_report` is class-A (`place_report_reporter_insert`) | P2 |

### Profile

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Public profile — events, places, favourites (events/places), reviews (event/place) | ✅ tabs | ✅ `ProfileTabBar` + `SegmentedTabs` | — | — |
| Profile — **bookings** tab | ✅ | ❌ | see "My bookings" above | P1 |
| Highlights ring + viewer + composer (crop/trim/upload progress) | ✅ | ✅ (rebuilt, gesture-driven) | — | — |
| Edit profile / avatar | ✅ | ✅ | — | — |
| Profile completion card | ✅ | ✅ | — | — |

### Organizer / place owner

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Dashboard, finance, payouts, payout accounts | ✅ | ✅ | — | — |
| Event create / edit / drafts | ✅ | ✅ wizard | — | — |
| Place create / edit / drafts / photos / hours / services / status | ✅ | ✅ | — | — |
| Promo codes manage | ✅ | ✅ | — | — |
| Event promote / place promote (paid) | ✅ | ✅ | — | — |
| Attendees list + check-in | ✅ | ✅ | — | — |
| Event cancellation + refund impact | ✅ | ✅ | — | — |
| Place bookings — accept / decline | ✅ | ✅ `usePlaceBookingsReviews` + `/organizer/places/[id]/bookings` | — | — |
| Place reviews — owner reply | ✅ | ✅ | — | — |
| Event review — organizer reply | ✅ `respondToEventReview` | 🟡 verify mobile has the reply action | check + fill if missing | P2 |

### Account / system

| Feature | Web | Mobile | Gap | Priority |
| --- | --- | --- | --- | --- |
| Auth — Google | ✅ | ✅ | — | — |
| Auth — phone OTP | 🟡 half-wired on web | ✅ wired on mobile (`/api/mobile/auth/phone`) | — | — |
| Settings — edit profile, language, appearance, security (change email/phone) | ✅ | ✅ | — | — |
| Notifications — list, mark read, mark all, deep links | ✅ | ✅ infinite + push | — | — |
| Wallet — payment methods (momo/card), default, remove | ✅ | ✅ | — | — |
| Transactions — history + detail | ✅ | ✅ | — | — |
| Delete account | ✅ `deleteUser` | 🟡 verify mobile Settings has it | check + fill if missing | P2 |
| Side menu | ✅ header hamburger → sheet | 🟡 `AppDrawer` opens by button; **swipe-to-close works, no edge-swipe-to-open** | **add edge-swipe-to-open + finger-tracked settle**; keep button, overlay-tap, Android back | **P1** |

---

## 2. P0 / P1 / P2 summary

**P0 — core product capability a mobile user simply cannot do today**
1. Claim a place
2. Write / edit / delete a place review
3. Request a place booking

**P1 — major capability present but weak, or important UX asks**
4. Restructure paid checkout into a proper stepped mobile flow
5. Snapchat-style map (image markers, pull-up preview card, clustering)
6. Side-menu edge-swipe-to-open gesture
7. "My bookings" list + cancel (follows from #3)
8. Promo-code step with full state handling (part of #4)

**P2 — useful, after the above**
9. Report place / report review
10. Infinite-scroll state-handling audit (end/empty/error-next/retry) + convert
    the few remaining `.slice()` carousels where a real feed is intended
11. Verify + fill: organizer reply to event review, delete-account in Settings
12. Places in the full search-results list (also a web gap — low value)

---

## 3. Detail on each P0

### 3.1 Claim a place

Web flow (`ClaimPlaceButton` / `ClaimPlaceModal` / `submitPlaceClaimRequest`):

- **Who:** signed-in user who is **not** the current `owner_id`. Button hidden otherwise.
- **Input:** optional `note`, optional `contact_phone`, optional `contact_email`.
- **Effect:** inserts one `place_claim_request` row `status='pending'`. Never
  transfers ownership — only an admin approval (`reviewPlaceClaimRequest` →
  `approve_place_claim` RPC) does that. Admin review stays web-only.
- **Duplicate:** partial unique index → friendly "you already have a pending
  claim" (Postgres `23505`).
- **States:** form → submitted ("an admin will review it soon") → error toast.

Mobile plan (class-A, no API/RLS change):
- `useSubmitPlaceClaim()` — `supabase.from("place_claim_request").insert(...)`,
  map `23505` to the friendly message, re-check owner client-side first.
- `usePlaceClaimStatus(placeId)` — read the caller's own row
  (`place_claim_request_claimant_select`) to show pending/approved/rejected on revisit.
- UI: `ClaimPlaceSheet` (bottom sheet) launched from a place-detail action /
  overflow item, gated to signed-in non-owner. States: intro (what claiming
  means) → form → submitting → success → pending badge on the place header →
  error+retry.

### 3.2 Place reviews (compose / edit / delete)

Web flow (`AddPlaceReviewButton` + `PlaceReviewModal` + `postPlaceReview` /
`updatePlaceReview` / `deletePlaceReview` / `getOwnPlaceReview`):

- **Who:** any signed-in user who is **not** the owner. **No** attendance gate
  (unlike events) — Phase 1 simplification, confirmed in the migration comment.
- **Rules:** rating 1–5 required; `title` optional ≤150 (title-cased server
  side); `comment` optional ≤500; up to `MAX_REVIEW_PHOTOS` photos to Cloudinary
  with a signed folder scoped to the user; `status='approved'` on insert.
- **One per user per place:** `place_review_unique_reviewer` → `23505` → "you've
  already reviewed this place".
- **Own review:** shows as "Your Review" with Edit / Delete.

Mobile plan (class-A, mirrors the existing **event** review flow exactly —
`useEventReviews.ts` is the template):
- `usePlaceReviewEligibility` (owner check + own-review fetch), `usePostPlaceReview`,
  `useUpdatePlaceReview`, `useDeletePlaceReview` — all direct `supabase.*`.
- Photo upload reuses `uploadToCloudinary(uri, "place_review_photo")` +
  `place_review_photo` insert (the RN event-review sheet already does the event
  equivalent).
- UI: reuse `AddReviewSheet` pattern → generalise to `ReviewComposerSheet`
  (rating input, title, comment, photo strip, char counters, keyboard-aware,
  submitting/success/error). Add the "Your review · Edit / Delete" card to
  `place/[id].tsx` (event detail already has it).
- Cache: invalidate `["mobile","place-reviews",id]`, `["mobile","place-rating",id]`,
  the place-detail query (avg + count), and the profile "reviews" tab.

### 3.3 Book a place (reservation request)

Web flow (`RequestBookingButton` + `RequestBookingModal` + `requestPlaceBooking`):

- **Who:** signed-in non-owner. **Request only** — no payment, no slot/inventory
  model. Owner later accepts/declines (`respondToPlaceBooking`, already on mobile
  for owners).
- **Input:** optional `service_id` (from the place's services), **required**
  `requested_time` (must be in the future — validated client + server), optional
  `party_size` (≥1), optional `note`.
- **Effect:** insert `place_booking` `status='pending'` **and** `createNotification`
  to `place.owner_id` (`type='place_booking_requested'`, link to `/manage/places/[id]`).
- **States:** form → "request sent, the owner will accept or decline" → error toast.

Mobile plan:
- Insert is class-A (`place_booking_customer_insert`). Cancel later is class-A
  (`place_booking_customer_update` → `status='cancelled'`).
- **Owner notification:** `notification` inserts are not the customer's to write.
  Two options — decide in Phase 2:
  - **(a) DB trigger** `AFTER INSERT ON place_booking` → `createNotification`-equivalent
    (SECURITY DEFINER). Cleanest; keeps mobile + web identical with zero transport code.
  - **(b) thin `POST /api/mobile/places/[placeId]/bookings`** that calls a shared
    `requestPlaceBookingCore` in `@abonten/services` (also lets web's action
    delegate — removes its logic fork). More work, matches the "no logic fork" rule.
  Recommendation: **(b)** for rule-consistency; **(a)** only if we want zero transport.
- UI: `BookPlaceSheet` — service selection sheet, native date + time
  (`@expo/ui` / RN pickers, future-only), party-size stepper, note field.
  States: form → submitting → success → "pending" chip on revisit → error+retry →
  "not bookable" when the place has no services *and* booking is not meaningful
  (web shows Book whenever signed-in non-owner; keep that unless we add a
  `bookable` flag — **open question**).
- "My bookings": new profile tab or `account` row → `place_booking_customer_select`
  list with status + cancel.

---

## 4. Checkout restructure (P1)

Backend/flow is complete and secure; this is **screen shape only**. Target,
matching web's conceptual steps:

```
event/[id]  ──"Buy tickets"──▶  buy/[eventId] (new stack screen)
   step 1  Ticket selection   (occurrence + per-type qty stepper, live subtotal)
   step 2  Promo code         (apply / remove; valid / invalid / expired / limit / min-spend)
   step 3  Order summary      (lines from api.checkout.prepare — server is source of truth)
      │  "Proceed to checkout"  → api.checkout.validate → checkoutSessionId
      ▼
checkout/[sessionId]  (existing screen, split)
   step 4  Select wallet      (list, set/add, invalid-wallet handling)
   step 5  Payment            (Paystack popup / direct-charge / OTP — unchanged)
   step 6  Success            (→ tickets)
```

- Move `TicketPicker` off `event/[id].tsx`; event detail keeps a compact
  "Tickets from GHS X · Buy tickets" CTA card + sold-out / ended / canceled / free states.
- Steps 1–3 are a single screen with a segmented progress indicator (or a
  swipeable pager); step 3's numbers come from the server, never recomputed on device.
- Split `checkout/[sessionId]` so wallet selection is its own visible step
  before the pay button (currently combined in `PaymentSection`).
- Keep every existing guard: countdown/expiry, pending-basket redirect (300),
  fulfilment recovery (207), OTP.
- Animations: shared-element-ish push between steps, sheet for promo, subtle
  total-changed pulse.

---

## 5. Map redesign (P1)

Current: `ExploreMap` / `NativeMap` render bare `<Marker>` pins with a title
callout; `event/[id]` + `place/[id]` show a static mini-map. No image markers,
no preview card, no clustering.

Target (Abonten design language, Snapchat-*interaction* quality):
- **Markers = the image**: circular flyer (event) / cover (place), ~44–52px, ring
  + shadow, selected = larger + accent ring, fallback glyph. Custom `<Marker>`
  child view in `react-native-maps` (already the dep).
- **Tap → select + pull-up preview card** anchored above the tab bar / safe area:
  - event: flyer, title, date, time, venue, distance, price/sold-out
  - place: cover, name, type, open/closed, rating, distance, venue
  - swipe-down to dismiss, tap card → detail screen. Reanimated + gesture-handler.
- **Clustering**: `supercluster` (or `react-native-map-clustering`) — cluster
  bubble shows the count, splits on zoom. Cap simultaneously-rendered image
  markers; recycle off-screen.
- Respect light/dark, safe areas, and the `MapConfigured` degradation path
  (unchanged — no API key ⇒ friendly empty state, never a native crash).
- Where used: the Explore map toggle, plus optionally a real map affordance on
  `around-you`.

---

## 6. Side-menu gesture (P1)

`AppDrawer` already: slides from left, Pan-to-close (`activeOffsetX(-20)` /
`failOffsetX(20)`), overlay fade, Android back via `Modal.onRequestClose`.

Missing: **edge-swipe-to-open**. Plan:
- A right-anchored... *left-edge* `Gesture.Pan()` on a thin (~20px) catcher
  overlaid on `(app)` content (outside scroll areas), `activeOffsetX(20)` /
  `failOffsetX(-20)`, translating the not-yet-mounted panel in from `-width`,
  settle on release by distance (>30%) or velocity (>600).
- Mount the drawer's `Animated.View` panel eagerly (cheap) so the open drag has
  something to move; keep the `Modal` for the backdrop + focus trap.
- Guard: `failOffsetY` so vertical scroll is untouched; the catcher sits only on
  screens where the drawer is valid (not on top of horizontal carousels — those
  already start past the 20px edge).
- Keep: button open, overlay-tap close, Android back, a11y (button is the
  non-gesture path).

---

## 7. Infinite scroll (P2 — mostly done)

Already cursor-paginated with `useInfiniteQuery`: filtered events, filtered
places, nearby events, nearby places, event search, notifications, event reviews
list, user event reviews, place reviews list, my tickets, transactions, attendees,
organizer events, organizer places, organizer ledger, all profile tabs.

Work remaining is **polish, not plumbing**:
- Standardise a `<ListFooter>` (loading-next spinner / "You're all caught up" end
  state / "Couldn't load more — Retry" error state) and use it on every
  `FlatList` `onEndReached`.
- Confirm keyset cursors dedupe on the `(sort, id)` tuple everywhere (they do in
  the files read; spot-check the rest).
- The horizontal "similar events / upcoming here / similar places" rails
  intentionally cap at 6 — leave as-is.

---

## 8. Proposed implementation phases

Branch: `feat/mobile-web-parity-round2` off `main`, one commit per chunk,
`--no-ff` merge per the standing git-flow rule, `Co-Authored-By: Claude Sonnet 5`.

| Phase | Chunks | Verify |
| --- | --- | --- |
| **A. Shared/API prep** | `requestPlaceBookingCore` in `@abonten/services` + `POST /api/mobile/places/[placeId]/bookings` + api-client method + web action delegates to it (option (b) in §3.3). No other backend change. | `turbo typecheck`, `next build`, api-parity guard |
| **B. Place reviews (P0)** | `ReviewComposerSheet` generalisation; place review hooks (post/update/delete/eligibility); own-review card + edit/delete on `place/[id]`; cache wiring | typecheck + `expo export` |
| **C. Place claim (P0)** | claim hooks + `ClaimPlaceSheet` + status badge on place detail | same |
| **D. Place booking (P0)** | `BookPlaceSheet` (native date/time, service sheet, party stepper) + submit/cancel hooks + "My bookings" tab | same |
| **E. Checkout restructure (P1)** | new `buy/[eventId]` stepped screen; move `TicketPicker`; promo step; split wallet step on `checkout/[sessionId]`; animations | same + manual smoke |
| **F. Map redesign (P1)** | image markers + preview card + clustering; wire into Explore map + detail mini-maps | same (native map ⇒ type/bundle-verified only) |
| **G. Drawer edge-swipe (P1)** | edge catcher + eager panel mount + settle logic | same |
| **H. Polish (P2)** | `<ListFooter>` standardisation; report place/review; verify-and-fill (event-review reply, delete account); a11y + dark-mode + small-screen pass | same |

Money-path (checkout), push, and native-map chunks are type/bundle-verified only
in this environment — they need a device pass, consistent with every prior mobile
round.

---

## 9. Open questions for the user

1. **Booking owner-notification**: shared-service + `/api/mobile` route (rule-consistent, more code) **or** a DB `AFTER INSERT` trigger (zero transport code)? Audit recommends the route.
2. **"Bookable" places**: web shows *Book* to any signed-in non-owner regardless of the place. Keep that, or gate on "has services" / a future `bookable` flag?
3. **Priority order**: audit proposes P0 (claim/review/booking) first, then checkout, then map, then drawer, then polish. Any reordering? (e.g. map first if it's the bigger perceived gap.)
4. **Scope of this pass**: do all phases A–H, or stop after the P0s + checkout and treat map/drawer/polish as a follow-up round?
