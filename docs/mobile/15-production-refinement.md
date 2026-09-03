# Mobile production-quality refinement pass

Branding + splash, payment verification, notifications, place media, dashboards,
filter/slider, multi-date polish, sharing/deep-links, ticket screen. 15 work
packages, one branch each, `--no-ff` merged to `main`.

Per-WP verification: `tsc --noEmit` (mobile) + `biome check` on touched files +
`expo export --platform android`; web-touching WPs also `next build` and the
`check:api-parity` guard; the notification migration also `list_migrations` +
`get_advisors` after the MCP apply.

## WP-1 — Branded app icon + splash  (`feat/mobile-brand-launch`)

`apps/mobile/scripts/gen-brand-assets.mjs` composites the launch art from the
approved web sources: the landing background (`landingpageBackgroound.jpg`, the
`bg-landing` token) + the white "A" mark (same three fills as `AbontenLogo`) + a
dark scrim matching the landing page's `bg-black/30` hero overlay.

- `assets/icon.png` 1024² — bg + scrim + centred mark (iOS/Android legacy).
- `assets/adaptive-icon.png` — white mark on transparent, well inside the mask;
  `android.adaptiveIcon.backgroundColor` `#4FD9C4` → `#121410`.
- `assets/splash-icon.png` 1242×2688 — portrait bg + scrim + mark; splash config
  now `resizeMode: "cover"` on `#121410` (both light + dark — deliberate).
- `app/_layout.tsx`: `SplashScreen.preventAutoHideAsync()` + `setOptions` fade;
  hidden once fonts + session resolve, with a 4s safety timer; the bare `<View>`
  fallbacks replaced by `<BrandedSplash>` (same asset + spinner).

Android 12+ only shows a centred icon on `#121410` (OS limitation) — the full
cover image is iOS + Android < 12. **Not verified**: native icon/splash render.

## WP-2 — Duplicate header  (`feat/mobile-header-dedupe`)

`organizer/_layout.tsx` renders one shared `<AppHeader>` for every organizer
screen; `events/[eventId]/reviews.tsx` was *also* rendering its own. Removed it,
registered the route in `_layout.tsx` with `title: "Reviews"`, and cleaned the
redundant in-body `screenTitle` text on `places/[placeId]/{reviews,photos,index}`.

## WP-3 — Drawer logo parity + auth centering  (`feat/mobile-logo-auth-layout`)

`AppDrawer` header `<AbontenLogo size={24}>` in an `h-12` bar → `size={38}` in an
`h-[54px]` bar, matching the Home `AppHeader` "branded" variant. `sign-in.tsx` +
`verify.tsx` restructured to one `flexGrow:1, justifyContent:"center"` ScrollView
holding a single column (logo → heading → Google → divider → phone/OTP → terms);
the back/close button is absolutely positioned so it can't push the block.

## WP-4 — Dedicated payment-verification screen  (`feat/mobile-payment-verification`)

Payment status used to render inline on the checkout / promote screens with a
duplicated `Phase` machine + poll loop.

- New `usePaymentVerification` hook — the single verify/retry/OTP state machine
  (`verifying · otp · succeeded · pending · fulfillmentFailed · failed`), capped
  4s polling of `api.payments.verify`, "Check again" via `api.payments.retry`
  (re-runs finalize, **never re-charges**), broad query invalidation on success.
- New route `app/(app)/payment/[attemptId].tsx` — slide-up, swipe-back disabled;
  per-kind success CTAs; a real "pending" state that never says "failed".
- `PaymentSection` + `PromotionPaymentSection` reduced to method-picker + Pay
  (which create the attempt — idempotent server-side — then push the screen).
- Backend unchanged: `finalizePaystackPayment` + Paystack `verifyTransaction`
  stay the source of truth. Wallet card-add (GHS-1 auth, auto-refunded) keeps
  its contained in-sheet status — it isn't a purchase.

**Not verified**: the interactive Paystack matrix (popup / saved-card direct /
MoMo OTP / abandoned / pending).

## WP-5 — Buy Tickets + promo UX  (`feat/mobile-buy-ticket-promo`)

- New `POST /api/mobile/checkout/promo-preview` → `getPromoCodeCore` (the same
  read-only check the web `CheckoutPromoCodeBox` uses); `api.checkout.promoPreview`
  + `PromoPreviewResult`. The code is only *claimed* later, by `validate()`.
- Buy Tickets screen: clear hierarchy; promo is a collapsed "Have a promo code?"
  → expand → Apply → a chip (code + "N% off") with Remove + a live discount
  preview via `allocatePromoEligibility` + `computeLineAmount`, incl. the
  "applies to X of Y tickets" note. Order summary with est. fee + est. total,
  captioned that checkout confirms the authoritative figure.

## WP-6 — Place gallery / edit photos / set-cover  (`feat/mobile-place-photos`)

Root cause of "owner-uploaded place photos don't show": the mobile create wizard
is cover-only and Edit Place had **no** photo section (`usePlaceEdit` dropped
`photos`).

- Shared `<PlacePhotoManager>` (add multi-pick → Cloudinary → record, reorder
  ◀▶, remove, "Set as cover") in both the standalone gallery screen and a new
  Photos section of Edit Place.
- New `setPlaceCoverFromPhotoCore` + `POST …/photos/:photoId/set-cover` +
  `setPlaceCoverFromPhoto` web action + `api.organizer.setPlaceCover`; web
  `ManagePlacePhotosSection` gains a "Set as cover" control.
- New `<PhotoGallery>` (thumbnail strip → full-screen paged viewer) replaces the
  plain grid on place detail.
- **Deferred**: an optional photos step in the place *create* wizard.

## WP-7 — Notification metadata + producers  (`feat/notifications-backend`)

Migration `20260905090000_add_notification_metadata` (repo file + MCP apply,
verified): `notification` gains `data jsonb`, `image_public_id`, `image_version`.
No RLS change. `createNotificationCore` / types / `sendPushToUser` carry them.
New producers: `ticket_confirmed`, `event_featured`, `place_featured`,
`review_reply` (see PROJECT.md §19).

## WP-8 — Notifications redesign  (`feat/notifications-ui`)

- `notificationTarget()` resolves a route from `data` first, `link` second;
  fixes the broken `/places/:slug` case; unroutable rows just mark read.
- `<NotificationItem>`: leading thumbnail (flyer/cover, kind-icon + broken-image
  fallback), unread tint + dot + bodyStrong.
- `notifications.tsx` → `SectionList` grouped Today / Yesterday / Earlier.
- Push-tap handler routes through the same `notificationTarget`.
- Web `NotificationBell` gains the matching thumbnail.

**Not verified**: push delivery + tap routing (needs a device build).

## WP-9 — "Set Reminder" in card menu  (`feat/mobile-card-reminder`)

Extracted the lead-time picker into `<ReminderOptionsSheet>` shared by
`<EventReminderButton>` and the EventCard "…" menu (each screen keeps one
`useEventReminder`). Specific-date events (`starts_at` null) now fall back to the
next upcoming `event_occurrence` so the reminder control shows.

## WP-10 — Price slider gesture fix + filter polish  (`feat/mobile-filter-slider`)

`PriceRangeField` rewritten on `react-native-gesture-handler` Pan (one per thumb)
with `.activeOffsetX([-8,8])` + `.failOffsetY([-14,14])` — a vertical/diagonal
drag *fails* the thumb pan so the parent `Sheet` scrolls, instead of the old
`PanResponder` claiming every touch-move. Value math unchanged. `FilterSheet`:
Apply shows the active-filter count, Clear all disables when empty.

**Not verified**: the diagonal-drag behaviour on device. The `Sheet` ScrollView
was left as RN (swapping it to GH's is the reserve fix).

## WP-11 — Organizer dashboard  (`feat/mobile-organizer-dashboard`)

No business-logic change — the mobile dashboard already had every web widget.
`organizer/index.tsx` KPI wall → 3 generous headline cards + one looser "This
period" card. New `<SalesTimelineChart>` — a compact `react-native-svg` vertical
bar chart (tap a bar for its figure) replacing the proportional-bar list.

## WP-12 — Finances + Withdraw  (`feat/mobile-finances-withdraw`)

No financial-calculation change. Withdraw: hierarchy, "Max" button, explicit
"You'll receive" + "No withdrawal fee" (`request_organizer_payout` takes no fee
and enforces no minimum — audited), inline validation, a Review → Confirm step,
a `submittedRef` guard on top of `isPending`, in-screen success state. Finances:
entry-type filter chips, green/red amounts, bigger amount text.

## WP-13 — Multi-date UX polish  (`feat/mobile-multidate-polish`)

The data model / API / wizards already support Single / Range / Multiple. Create
wizard specific-dates now rejects duplicates + past dates (`getBufferedNow`, the
same 5h rule the server enforces) + end-before-start, keeps the list
chronological, shows a count header. Remove keys off the occurrence id.

## WP-14 — OG images + Universal/App Links  (`feat/sharing-deeplinks`)

- Web `events/[eventCode]` gains `generateMetadata` with `openGraph` + `twitter`
  cards pointing at the Cloudinary flyer at 1200×630; `places/[slug]` extended
  the same way with the cover.
- `public/.well-known/apple-app-site-association` (+ `next.config` header forcing
  `application/json`) and `assetlinks.json` for `/events/*` + `/places/*`.
  **Placeholders**: the Apple Team ID (`TEAMID`) and the EAS Android upload-key
  SHA-256 must be filled in before verification passes.
- `app.json`: `ios.associatedDomains` + `android.intentFilters` (autoVerify).
- `app/+native-intent.ts`: resolves an incoming https event-code / place-slug to
  the id the native route expects (anon RLS-safe read), falling back to the tabs.
- `share.ts`: `shareEventWithImage` / `sharePlaceWithImage` / `shareLinkWithImage`
  download the flyer/cover to cache and attach it to the OS share sheet, falling
  back to text+link. Wired into `EventCardMenu` + `DetailHeaderActions`.

**Not verified**: app-link interception, AASA/assetlinks hosting, the real
fingerprints.

## WP-15 — Ticket screen + docs  (`feat/mobile-ticket-screen`)

`ticket/[id].tsx` (§38–39): flyer hero first (event title + date + venue +
status badge over it), then the ticket-details card (type, seat, reference,
checked-in), then the QR card ("Show this at entry", still 220px), then actions.
The QR scanner path is untouched.

---

## Web ↔ mobile parity — residual gaps

| Area | Status |
|---|---|
| Place photos (view / gallery viewer / edit / set-cover) | ✅ mobile now at parity; **place *create* wizard** photo step deferred |
| Event multi-date (create / edit / display / reminders) | ✅ at parity (was already implemented; this pass polished validation) |
| Review replies (event + place, owner/organizer) | ✅ at parity (round-2); this pass added the reviewer notification |
| Payment verification | ✅ mobile now has a dedicated screen web-style |
| Promo code | ✅ preview endpoint + live discount like web |
| Notifications (thumbnails, grouping, deep-link, new producers) | ✅ at parity; web `NotificationBell` also got thumbnails |
| Sharing (OG image, deep-link) | ✅ OG metadata + share-sheet image both platforms; App-Link **native config** needs the real fingerprints |
| Organizer dashboard / finances / withdraw | ✅ widgets already at parity; this pass = hierarchy + a real chart + withdraw safety |
| Ticket screen | ✅ flyer-first like the web `TicketModal` |
| Web-server-only bits (e.g. `user_image_history` insert, ISR revalidation) | unchanged — not mobile-relevant |

## Not device-verified (call out on any device pass)

Native icon/splash · all Paystack money-path interactions · push delivery + tap
routing · App-Link interception + `assetlinks`/AASA fingerprints · a real payout
· `react-native-svg` chart + `react-native-maps` on device · the filter
diagonal-drag test.
