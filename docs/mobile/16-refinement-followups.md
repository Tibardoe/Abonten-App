# Mobile refinement — follow-up round

Follow-ups after `docs/mobile/15-production-refinement.md`, from a second
review pass. One branch per chunk, `--no-ff` merged to `main`.

Verification per chunk: `turbo run typecheck` (10/10) + `biome check` on
touched files; web-touching chunks also `next build` + `check:api-parity`;
DB changes applied via Supabase MCP (project `sderrexhawjbmsugndcq`) and
verified with `get_advisors` + an end-to-end trigger test.

---

## 1 — Finances screen threw "two children with the same key"
`feat/mobile-finances-keyfix`

`get_organizer_ledger_transactions` returns **one row per ledger line**, so
a single `entry_id` shows up as both a `ticket_sale` and a `platform_fee`
row. `finance.tsx` keyed the `FlatList` on `entry_id` alone → React's
duplicate-key console error and a risk of dropped/duplicated rows. Now
de-duplicates on `(entry_id, line)` and keys on the same pair.

Flagged, not changed: the RPC uses the non-unique `entry_id` as its keyset
cursor id, so a page boundary that falls between an entry's two lines can
skip them — a pre-existing server-side fragility.

## 2 — Notifications now cover every operation
`feat/mobile-notif-coverage`, `feat/mobile-notif-review-rls-fix`,
`feat/notif-service-role-insert`

Two real bugs were behind "I bought a ticket and saw no notification":

1. **`notification` has RLS on with no INSERT policy.** Only the
   service-role client can insert a row — a session client can't, not even
   for itself. So every producer that ran on a cookie/Bearer client was
   silently failing: `ticket_confirmed` on the client-verify checkout path,
   `event_featured` / `place_featured`, `review_reply`, and the
   pre-existing `place_booking_*` / `place_claim_*` producers.
   **Fix:** `createNotificationCore` now always inserts through
   `getSupabaseServiceClient()` (the client `sendPushToUser` already uses),
   falling back to the passed session client only if the service-role env
   vars are missing. One choke point → every producer works now.
2. **`ticket_confirmed` was deferred with `after()`.** Most confirmations
   settle on the Paystack webhook, where the function can suspend the
   moment it responds and drop `after()` callbacks. Now awaited inline
   (one cheap insert, still best-effort).

New producer — **`review_received`**: "someone reviewed your event / your
place", to the organizer / owner. A review row can be written from the web
action *or* a direct RLS-scoped mobile client insert, so the only place
that sees every one is the DB — hence AFTER INSERT triggers
(`20260906090000_notify_on_review_posted`), `SECURITY DEFINER` (they insert
for a different user than the one who fired them, and `notification` INSERT
is RLS-locked), `search_path = ''`, `EXECUTE` revoked from
`anon`/`authenticated`. Carries `data.kind = "review_received"` + entity
ids + flyer/cover so the mobile list shows a thumbnail and deep-links to
the owner's review-management screen. New `NotificationEntityKind` member,
routed in `notificationLink.ts`, star icon in `NotificationItem`.

Coverage now: ticket purchase (`ticket_confirmed`), event/place promotion
(`promotion_started` + `event_featured`/`place_featured`), reviews
(`review_received`), review replies (`review_reply`), bookings
(`place_booking_*`), claims (`place_claim_*`), profile completion.

> **These fixes only take effect once the web app (Vercel) is redeployed
> from `main`** — the mobile app calls the deployed `/api/mobile`, so the
> producers have to be live there.

## 3 — Richer organizer sales chart + KPI deltas
`feat/mobile-dashboard-chart`

`SalesTimelineChart`: y-axis min/max markers, dashed 25/50/75 % gridlines,
rounded bar caps, a period total (or the pinned bar's figure) in the
header, first/middle/last x labels, a proper empty state.

Dashboard headline cards (Gross sales / Tickets sold / Active events): a
leading icon and a **"+N % vs last period"** delta (green up / red down,
"—" when there's nothing to compare), currency-matched to the overview's
`previous` bucket, hidden on the All-time period. No calculation change.

## 4 — Clearer filter sheet
`feat/mobile-filter-polish`

Each section shows a brand dot when it has a selection and an inline
**Clear** that resets just that section (via the existing
`clearEventFilterKey` / `clearPlaceFilterKey`), light dividers between
sections, and a "N filters applied" summary under the title.

## 5 — Place-create gallery step + photo-viewer close button
`feat/mobile-place-wizard-photos`

- New optional **Gallery photos** step in the place-create wizard (between
  Cover and Basic info). Photos stage as local URIs and upload only after
  the place is published (`usePlaceWizard.uploadStagedPhotos`) — a failed
  upload can never block creation. Cap 8; the rest are added from Edit
  Place. This closes "mobile-created places have empty galleries".
- `PhotoGallery` full-screen viewer: the close button was pinned at
  `top: 28`, clipping under the notch. Now at safe-area top + 12 with a
  tappable circular background.

## 6 — Sharing sends a rich link preview
`feat/mobile-share-linkpreview`

Sharing an event/place now sends the `https` URL as text, so WhatsApp /
iMessage / X / etc. unfurl it into a preview card from the Open Graph tags
already on the web pages (flyer/cover + title + description). The previous
build downloaded the image and shared it as a bare JPEG with no link.
`share.ts` drops the `*WithImage` helpers (and the `expo-file-system` /
`expo-sharing` imports) for `shareLink` / `shareEvent` / `sharePlace`.

---

## App Links — the two placeholders

Shared `abontenhub.com` links open the app instead of the browser only
once these are real. Nothing else depends on them.

### Android — you can do this now (you have EAS)

1. `cd apps/mobile && npx eas credentials` → **Android** → your profile
   (production / preview) → **Keystore** → copy the **SHA-256 Fingerprint**.
   (Or run one `npx eas build -p android` first; the fingerprint is then in
   the build page and in `eas credentials`.)
2. Paste it into
   [`apps/web/public/.well-known/assetlinks.json`](../../apps/web/public/.well-known/assetlinks.json),
   replacing `REPLACE_WITH_EAS_ANDROID_UPLOAD_KEY_SHA256`.
3. After the app is on the Play Store, also add the **Play App Signing**
   SHA-256 (Play Console → *Test and release → App integrity*) as a second
   entry in the same `sha256_cert_fingerprints` array — Google re-signs
   uploads, so the store build's cert differs from your upload key.
4. Redeploy the web app and check
   `https://abontenhub.com/.well-known/assetlinks.json` serves it.

### iOS — blocked until you have an Apple Developer account

The Apple Team ID only exists once you enrol
(<https://developer.apple.com>, ~$99/yr). It's then on the **Membership**
page of the developer portal (a 10-char string like `A1B2C3D4E5`). Put it
in
[`apps/web/public/.well-known/apple-app-site-association`](../../apps/web/public/.well-known/apple-app-site-association)
in place of `TEAMID` (so `TEAMID.com.abonten.app` → `A1B2C3D4E5.com.abonten.app`),
redeploy, and confirm the file serves with `Content-Type: application/json`
(the `next.config.ts` header already forces this).

---

## Not device-verified

The Paystack money path (so `ticket_confirmed` on a real client-verify
checkout), push delivery, the native share-sheet unfurl, the organizer SVG
chart on device, and App-Link interception all still need a device pass.
The `review_received` trigger *was* verified end-to-end against the live DB
(insert `event_review` → `notification` row created, rolled back).
