# Mobile — highlights editor + viewer + auth polish

Follows `docs/mobile/10-phase-2-refinement.md`. Three branch-per-chunk PRs,
each `--no-ff` merged into `main`. Verification per chunk: `turbo typecheck`
(mobile + ui-native) + `expo export --platform android` + `biome check` on
touched files. No web files changed, so `next build` was not run.

**Not device-verified** (needs a dev-client rebuild — two native modules
added): SMS autofill into the OTP cells, all haptics, the gesture-handler
story player timing, `expo-image-manipulator` crop output, the
`generateThumbnailsAsync` trim strip, and the Cloudinary-trimmed video
playback.

## New dependencies

| Package | Version | Why |
|---|---|---|
| `expo-haptics` | `~57.0.2` | Tactile feedback (OTP submit/error, story pause/group-change). Wrapped in `apps/mobile/src/lib/haptics.ts` (every call fire-and-forget, errors swallowed — no taptic engine on many devices / the simulator). |
| `expo-image-manipulator` | `~57.0.15` | Photo cropping — `ImageManipulator.manipulate(uri).crop(rect).rotate(90).renderAsync().saveAsync(...)`. |

Both are SDK-57 bundled and autolink; the dev client / EAS build must be
rebuilt before they run on device.

## WP-1 — Auth redesign (`feat/mobile-auth-redesign`)

- **New primitive** `packages/ui-native/src/primitives/OtpInput.tsx`: 6
  segmented cells rendered from one controlled string, driven by a single
  visually-hidden `<TextInput>` that carries the OS autofill hints
  (`textContentType="oneTimeCode"` / `autoComplete="sms-otp"`), blinking
  caret in the active cell, `onComplete` fires on the last digit.
- `app/(auth)/verify.tsx`: uses `OtpInput`; a 30 s resend countdown that
  re-calls `api.auth.requestPhoneOtp` (the `dialCode` / `rawPhone` are now
  carried forward from sign-in as route params); destination number masked;
  inline error / notice rows with an icon; success / error haptics.
- `app/(auth)/sign-in.tsx`: 56 px controls, phone field grouped on a `bg-card`
  block with focus / error border states, tappable Terms / Privacy links,
  error haptic on a blocked submit. Both `api.auth.*` calls unchanged.
- `app/(auth)/_layout.tsx`: `animation: "slide_from_right"`.
- `CountryCodeField`: chip height / radius aligned to the new field.

## WP-2 — Highlight viewer (`feat/mobile-highlight-viewer`)

`src/components/profile/HighlightViewer.tsx` rebuilt on
`react-native-gesture-handler` + `react-native-reanimated`, behaviour
matching the web `useHighlightViewer`:

- Progress bar + drag-to-dismiss run on the UI thread (shared values).
  Horizontal fling moves between **groups**; previous at slide 0 lands on
  the previous group's **last** slide (like web).
- Press-and-hold pauses **and** fades all chrome; release resumes. Image
  dwell freezes on hold and resumes from where it stopped (was restarting).
- Loading no longer eats view time: an `ActivityIndicator` shows until the
  image `onLoadEnd` / video `readyToPlay`, and only then does the timer run.
- Header carries the profile `Avatar` (threaded `ProfileHeader` →
  `HighlightsRow` → viewer) + a play/pause glyph; the `⋯` menu is an
  in-`Modal` popover (no nested Modal) → confirm `Alert` →
  `useDeleteHighlightSlide`.
- Blurred cover backdrop behind the letterboxed media. Light haptic on a
  group change.

## WP-3 — Composer + editor + trimmed upload (`feat/mobile-highlight-editor`)

Retires `PostHighlightSheet.tsx`.

- **New screen** `app/(app)/highlight/new.tsx` (stack screen,
  `slide_from_bottom`, registered in `(app)/_layout.tsx`): pick → preview →
  crop / trim → post. Native echo of the web `HighlightModal`. Step 1 =
  empty picker; step 2 = preview stage (image `contentFit="contain"`; video
  `VideoView` + play/pause + mute) with a filmstrip (tap = select, `×` =
  delete, `◀ ▶` on the selected tile = reorder, `+` = add more) and, for a
  video, the trim bar. **Post** is disabled until the active preview has
  painted a frame.
- **New hook** `src/features/profile/useHighlightComposer.ts`: mobile echo
  of the web `useMediaSelection` — `items: EditableMedia[]` + `activeId`,
  all CRUD id-based (`pickFromLibrary` / `select` / `remove` / `reorder` /
  `replaceCropped` / `updateTrim`). Reuses the `MAX_HIGHLIGHT_*` caps;
  oversize items are skipped with one summary `Alert` rather than aborting
  the whole pick.
- **New component** `src/components/profile/ImageCropModal.tsx`: full-screen
  pan + pinch of the image under a fixed crop frame (reanimated), aspect
  chips (Free / 1:1 / 4:5 / 9:16 / 16:9), a 90° rotate that bakes
  immediately so the crop maths always sees an upright source. On Done the
  on-screen frame is converted to a source-pixel rect and baked with
  `ImageManipulator` (JPEG, `compress: 0.9`) → `replaceCropped`.
- **New component** `src/components/profile/VideoTrimBar.tsx`: mobile echo
  of the web `VideoTrimEditor` — a `player.generateThumbnailsAsync` strip
  (falls back to placeholder cells if generation fails), two reanimated drag
  handles + a draggable window + a playhead synced to `timeUpdate`, playback
  looping within the selected range, `MIN_TRIM_SEGMENT_SECONDS` (1) /
  `MAX_TRIM_SEGMENT_SECONDS` (60) enforced.
- **Upload** `src/features/profile/useHighlights.ts`:
  - `HighlightMediaPick` gains `startSeconds` / `endSeconds` (video only).
  - `resolveTrimmedDelivery` — a port of `resolveVideoDelivery` from the web
    `uploadHighlight.ts` action. When the editor set a valid strict
    sub-range, `media_url` becomes a Cloudinary `so_<start>,eo_<end>`
    delivery URL and `media_duration` the trimmed length; otherwise the
    untrimmed clip. **No re-encode, no schema change** — exactly the web
    approach.
  - `cloudinaryUpload.ts`: the multipart file part now takes its name / MIME
    from the local file's extension (a cropped JPEG, a `.mov`) instead of
    always `upload.mp4` / `upload.jpg`.
- **New** `src/features/profile/HighlightUploadProvider.tsx` (mounted in
  `(app)/_layout.tsx`) + `src/components/profile/HighlightUploadStatus.tsx`:
  the editor hands the batch to the provider and closes immediately; a
  compact progress banner with **Retry** then runs on the highlights row.
  `HighlightsRow`'s `+` circle now just pushes `/highlight/new` and is
  disabled while an upload is in flight.

## Known limitations / follow-ups

- Everything in the "not device-verified" note above.
- The trim strip generation waits a fixed 250 ms after `replaceAsync`; on a
  slow device the first `generateThumbnailsAsync` call may still be early
  and fall back to placeholder cells.
- Filmstrip reorder is `◀ ▶` nudge buttons on the selected tile, not a
  drag-and-drop list (kept simple / low-risk).
