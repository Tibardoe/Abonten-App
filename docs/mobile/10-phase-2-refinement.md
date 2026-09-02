# Phase 2 — mobile UX/product refinement (second batch)

Follow-up to `09-phase-1-web-parity.md` and the Phase-2 redesign. A 23-point
brief taken as 12 branch-per-chunk work packages (`feat/mobile-p2-*`), each
verified with `turbo run typecheck` + `expo export --platform android` +
`biome check` on touched files (+ `next build` when web/shared-web code was
touched). Money-path, media-upload and notification-scheduling behaviour is
type/bundle-verified only — it still needs a device pass.

| WP | Brief § | What changed |
|----|---------|--------------|
| **A** | 1, 2, 16 | Unified **+ Add Wallet** / **+ Add Payout Account**: one primary action → stepped bottom sheet (choose type → form → inline validation/errors → success), echoing the web `AddPaymentMethodPopup`. New `SheetOption` primitive; `Sheet` gains an `onBack` chevron. Payment/tokenisation logic untouched. |
| **B** | 3 | Full-screen side menu header: Abonten mark centred, close (X) pinned right (`insets.right`). Open direction / coverage / swipe-to-dismiss unchanged. |
| **C** | 6, 7 | Auth screens rebuilt: centred brand + wordmark, clear heading/subtext, KeyboardAvoidingView, history-aware back, inline states. Official multi-colour Google glyph (`GoogleIcon`, react-native-svg). New searchable `CountryCodeField` feeding `dialCode`. Country list moved to `@abonten/core/countries` (web `countryDetails.ts` re-exports). |
| **D** | 4 | Create Event wizard reordered — **flyer first**, then Basic info → Date & time → Location → Tickets & pricing → Promo codes → Review. Per-step "Step N of 7" + title + subtitle header. No fields removed. |
| **E** | 5 | Create Place wizard reordered — **cover photo first**, then Basic info → Opening hours → Review. Same per-step header. |
| **F** | 8, 9 | Rating stars → brand accent (`Stars` filled colour `warning`→`primary`); 2 local re-implementations replaced by the primitive. Featured events get the web `Banner` hero treatment (`FeaturedEventBanner` + `FeaturedEventsCarousel`, SVG gradient scrim — no new dep); `PlaceCard` gains a neutral `sponsored` pill. Eligibility/data logic untouched. |
| **G** | 10 | `src/components/skeletons.tsx` — content-shaped loading states built on the `Skeleton` primitive. Wired into event/place detail, Tickets, Notifications, Places, Wallet, organizer dashboard (headers stay mounted → no flash-then-jump). |
| **H** | 11, 12 | `Sheet` wrapped in KeyboardAvoidingView + bottom safe-area padding (fixes the low Home location sheet, uniform for every sheet). New `ImageViewer` (full-screen, drag-to-dismiss, safe-area) on the ProfileHeader + Edit Profile avatars. `react-native-safe-area-context` added to `@abonten/ui-native` peerDeps. |
| **I** | 13, 14 | HighlightViewer: swipe-down-to-dismiss (PanResponder, claims only on a clear downward drag), failed image slide advances. Posting: pick → `PostHighlightSheet` preview → Post with a **real** progress bar (`uploadToCloudinary` now XHR with `upload.onprogress`; `useUploadHighlights({ onProgress })`). Can't dismiss mid-upload; Post inert while running. |
| **J** | 15, 17, 18 | **Fix:** `useToggleFavorite` read the (already-flipped) query cache inside `mutationFn`, so every toggle ran the opposite DB write — favourites never persisted. Now takes the target state explicitly. `EventCardMenu` "…" sheet = web `EventCardMenuModal` parity (Favourite/Share for all; Edit/Promo codes/Cancel for the organiser). Tab navigator `animation: "shift"`. |
| **K** | 19 | Event reminders = OS-scheduled local notifications (`expo-notifications` DATE trigger, HIGH-importance `event-reminders` Android channel). "Remind me" sheet on the event detail (10 min / 30 min / 1 h / 1 day before). Deep-links via the existing `usePushRegistration` response listener. Per-event choice persisted in `expo-secure-store`; `reconcileEventReminder` re-arms on a start-time change and cancels on `status = "canceled"`. |
| **M** | 19 (follow-up) | Reminders made **cross-device** — new RLS-scoped `event_reminder` table (`(user_id, event_id)` PK, `offsets int[]`, `event(id)` FK `ON DELETE CASCADE`, owner-only `FOR ALL` policy; migration `20260904090000`, applied live via MCP). `useEventReminder` mirrors the choice to the row and, on reconcile, re-arms the local schedule to match the server (covers a reminder set on another device). New `useRemindersSync` (mounted in `(app)/_layout`, runs on sign-in + every foreground) clears any local reminder whose server row is gone — so a **hard-deleted** event's reminder is now proactively cancelled via the FK cascade, and a reminder turned off elsewhere disappears here. An offline push is retried on the next sync (`serverSynced` flag) rather than mistaken for a removal. |
| **L** | 20, 21, 23 | Coherence pass on touched screens + this doc. |

## Known limitations / follow-ups

- Money paths (Paystack card verification, checkout), highlight uploads, and
  notification scheduling/delivery/boot-persistence are **not device-verified**.
- Reminder cross-device sync is RLS direct-CRUD (class-A), verified by
  typecheck/export only — the round trip (`event_reminder` upsert/pull, the
  cascade on delete, `useRemindersSync` on foreground) needs a device pass.
- `docs/mobile/09` non-parity items (web-server-only bits, e.g. the
  `user_image_history` insert) are unaffected and still open.
