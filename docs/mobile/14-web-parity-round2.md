# 14 — Web → Mobile Parity, Round 2 (implementation)

Branch: `feat/mobile-web-parity-round2` (one branch, one commit per phase,
`--no-ff` merge to `main`). Companion to the audit in
[`13-web-mobile-parity-audit.md`](13-web-mobile-parity-audit.md).

## Architecture principles held

- No new privileged surface in React Native, no RLS weakening, no Paystack /
  service-role secret on the client.
- Consumer place features (claim / review / booking-request) are **class-A** —
  the existing `place_*` RLS policies (`*_reviewer_id` / `*_claimant_id` /
  `*_customer_id` `auth.uid()` checks) already permit them from the client.
- Anything privileged goes through a framework-free `@abonten/services` core
  consumed by BOTH the web Server Action and a thin `/api/mobile` route
  ("no logic fork").

## Phase A — shared place-booking service + routes

`packages/services/src/places/requestPlaceBookingCore.ts`
- `requestPlaceBookingCore(supabase, userId, input)` — future-time validation,
  owner block, `place_booking` insert (caller's client, RLS applies), then the
  owner notification.
- `cancelPlaceBookingCore(supabase, userId, bookingId)` — status guard,
  self-only check, `status='cancelled'` update, owner notification.
- **Owner notification** is written with `getSupabaseServiceClient()` because
  `notification` has RLS enabled with **no client INSERT policy**. This is the
  same pattern `sendPushNotification` / the webhook already use, and it
  repairs a latent bug: the pre-existing web actions passed their *cookie*
  client to `createNotification`, which RLS silently denied.

Web `requestPlaceBooking.ts` / `cancelPlaceBooking.ts` → thin wrappers over
the cores. Routes: `POST /api/mobile/places/[placeId]/bookings`,
`POST /api/mobile/places/[placeId]/bookings/cancel`. api-client:
`places.requestBooking(placeId, body)`, `places.cancelBooking(placeId, id)` +
`RequestPlaceBookingBody` / `*Result` / `CancelPlaceBookingResult`.

## Phase B — place reviews

`apps/mobile/src/features/reviews/usePlaceReviews.ts` (mirrors
`useEventReviews.ts`): `usePlaceReviewEligibility` (signed-in + non-owner +
own-review lookup — **no attendance gate**, matching web's Phase-1
simplification), `usePostPlaceReview`, `useUpdatePlaceReview` (add/remove
photos, `keptPhotoCount` start position), `useDeletePlaceReview`. All direct
`supabase.*`; `23505` → "you've already reviewed this place".

`PlaceReviewSheet.tsx` — rating (req) + title (≤150) + comment (≤500) + up to
`MAX_REVIEW_PHOTOS` (Cloudinary via `uploadToCloudinary(uri,
"place_review_photo")`), handles create + edit. Wired into `place/[id].tsx`
("Write a review" / "Your review · Edit / Delete"); `usePlaceExtras`
review-list select gained `place_review_photo` so list cards show photos.

Cache invalidation on write: `mobile/place-reviews`, `mobile/place` (avg +
count), `mobile/place-review-eligibility`, `profile/place-reviews`.

## Phase C — claim a place

`apps/mobile/src/features/places/usePlaceClaim.ts`: `usePlaceClaimState`
(reads the caller's latest `place_claim_request` row — `none | pending |
approved | rejected` + `canClaim`), `useSubmitPlaceClaim` (direct insert;
`23505` → "you already have a pending claim"). Ownership never changes on
mobile — admin approval on web (`approve_place_claim` RPC) still does that.

`ClaimPlaceSheet.tsx` — intro + optional note / contact phone / email, with
submitting / success / error. `place/[id].tsx` shows an "Own this place?"
card (signed-in non-owner, no active claim) or a "claim awaiting review" chip.

## Phase D — book a place + My bookings

`usePlaceBooking.ts`: `useRequestBooking` (Phase-A route), `useCancelBooking`
(Phase-A route), `useMyBookings` (RLS-scoped infinite read of `place_booking`,
`place` + `place_service` joined).

`BookPlaceSheet.tsx` — optional service (Chips + "No specific service"),
single future date (`DateRangeField mode="single"`), time (wheel `TimeField`),
party-size stepper, note. Future-time validated client + server.

`app/(app)/bookings.tsx` — status badge per row, cancel on pending/accepted,
infinite scroll with `<ListFooter>`. Linked from the drawer ("My bookings").

**Intentional divergence:** the Book CTA on `place/[id]` shows only when the
place has ≥1 service (web shows Book on any place for a signed-in non-owner).
Confirmed with the user.

## Phase E — stepped checkout

New `app/(app)/buy/[eventId].tsx` — a 3-step screen (`StepDots` + sticky
action bar): (1) occurrence + per-type quantity `Stepper`s, live subtotal;
(2) promo code — entry only, validated + claimed server-side by
`api.checkout.validate` at "Proceed" (a bad code bounces back to step 2 with
the server message); (3) order review (line items + subtotal + "fee/discount
on the next screen"). "Proceed" → `validate` → `checkout/[sessionId]`
(unchanged payment logic; 300 → resume pending checkout).

`event/[id].tsx` — the inline `TicketPicker` is replaced by a compact
"Tickets from …" CTA card. `checkout/[sessionId].tsx` gains "Order summary" /
"Payment" section labels. `src/features/checkout/TicketPicker.tsx` **deleted**
(dead after the move).

## Phase F — social map

`apps/mobile/src/components/map/SocialMap.tsx`
- Marker = the event flyer / place cover as a circular photo (white ring,
  shadow; larger + accent ring when selected) with a small pointer.
- **Clustering:** hand-rolled grid keyed off the visible `region`
  (`GRID = 5` → ≤25 markers rendered); a cluster shows a count bubble and
  `animateToRegion`s a zoom-in on tap that splits it.
- **Preview card:** Reanimated slide-up from the bottom (respects safe-area
  inset), `Gesture.Pan` swipe-down to dismiss, tap → detail screen;
  2–3 pre-formatted meta lines + a price/rating tag.
- Keeps the `MapConfigured` degradation (no native crash without the key).

`ExploreMap.tsx` → thin adapter: current tab's filtered rows →
`SocialMapItem[]` (date/time/venue/price for events; type/open/address/rating
for places). **No new dependencies.**

## Phase G — drawer edge-swipe

`AppDrawer.tsx` reworked from a mount-on-open `<Modal>` to an always-mounted
`StyleSheet.absoluteFill` overlay with `pointerEvents="box-none"`:
- `edgePan` on a ~22px left strip (only while closed) — rightward drag
  finger-tracks the panel + backdrop via shared values, settles open/closed
  on release by distance (>40% width) or velocity (>500); `failOffsetY` so it
  never fights a vertical scroll.
- `closePan` on the open panel unchanged.
- Android hardware-back closes via `BackHandler` (was `Modal.onRequestClose`);
  backdrop tap + menu button unchanged.
- Same menu contents (+ the new "My bookings" row).

## Phase H — infinite-scroll footers + delete account

- `packages/ui-native` `<ListFooter>` — loading-next spinner / "couldn't load
  more — Retry" / "you're all caught up". Wired into home events + places,
  search results, notifications, My bookings.
- `deleteAccountCore` in `@abonten/services/profile` (service-role
  `auth.admin.deleteUser`); web `deleteUser` delegates;
  `POST /api/mobile/account/delete` + `api.account.deleteAccount()`. Settings ›
  Security gains a double-confirmed "Delete account" card that signs out
  locally on success.

## Follow-up round (`feat/mobile-parity-round2-fixes`, merged `845a47b`)

User feedback after the first pass:

- **OTP cells** — `justify-between` spread them to the row edges; now
  `justify-center gap-2.5`.
- **Checkout** — the 3-step wizard was unwanted. `buy/[eventId]` is now one
  scroll (occurrence + quantity steppers + promo field + running subtotal +
  Proceed), matching the web checkout modal. Promo still validated at
  `api.checkout.validate`.
- **Social map** — markers/preview weren't working:
  * photo markers switched from `expo-image` to react-native `Image` — an
    expo-image often snapshots empty inside a `<Marker>` on Android, so
    markers fell back to the default red pin (this was "event flyers not
    showing");
  * marker tap did nothing because it bubbled a `MapView.onPress` that
    cleared the selection before the card could mount — guarded with a
    350 ms marker-tap timestamp;
  * removed the nested `GestureHandlerRootView` (root already has one) — it
    was blocking the preview card's pan;
  * `tracksViewChanges` is now per-marker (until image `onLoad`, or while
    selected) instead of one shared 1.5 s window;
  * no-image fallback is a solid coloured circle + glyph, not a faint icon.
- **Drawer edge-swipe** — now only armed on the tab-root screens
  (`useSegments().includes("(tabs)")`). On a pushed screen the left edge is
  the native stack back-swipe, so it no longer opens the drawer when you
  meant to go back.

Remaining-gap items from the first pass, now closed:

- **Report place / report review** — `useReportPlace` (class-A insert into
  `place_report`, `place_report_reporter_insert`) + `ReportSheet` (reason
  chips + free-text detail joined into the `reason` column). "Report this
  place" link + a per-review "Report" on `place/[id]`.
- **Organizer reply to EVENT reviews** — `event_review` has
  `event_review_organizer_select` / `_organizer_update` (scoped through the
  owning event), so it's class-A for the organizer. `useEventReviewsManage`
  / `useRespondToEventReview` + new `organizer/events/[eventId]/reviews.tsx`
  (inline Respond form) + a link from the event manage screen.

## Still open

- Device verification of the money path, native map (markers / clustering /
  preview gestures), drawer edge-swipe feel, and push.
