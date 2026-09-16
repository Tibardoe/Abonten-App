---
title: Abonten Weekly — editorial weekly discovery editions
purpose: How Abonten Weekly editions are modelled, curated, validated, published, cached and shown on web and mobile, and how the programme is switched on in stages.
audience: Engineering, operations, security reviewers
scope: The weekly_* tables and functions, @abonten/services weekly and admin/weekly modules, the /weekly web routes, /api/mobile/weekly, the mobile Weekly screen, Admin › Abonten Weekly, the weekly-publish-due and weekly-housekeeping jobs. Not covered - automated candidates, personalisation and a weekly notice, which are designed for later phases and not built.
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Abonten Weekly

**State (2026-09-13, evening): switched on for staff only.** `weekly_program_setting.enabled = true`, audience `staff` (the founder is the only active admin), `WEEKLY_KILL_SWITCH` not set. Two staff test editions exist for Ghana, built from the founder's own test places: "Staff preview: this week" (week of 2026-09-07, published) and "Staff preview: next week" (week of 2026-09-14, scheduled for 06:00 on Monday 14 September, which also exercises `weekly-publish-due`). Everyone else still sees nothing. To go back to fully off, untick "Abonten Weekly switched on" in Settings. With the programme off, the `/weekly` pages show an "on its way" state with upcoming events, the Explore teaser and menu links are hidden on web and mobile, and the admin module works normally. Rollout: §10 and [admin/weekly.md](../admin/weekly.md).

## 1. What it is

A weekly edition of events and places worth discovering, per area: "Abonten Weekly — Ghana", later "Abonten Weekly — Accra". Search answers "what am I looking for"; Abonten Weekly answers "what should I discover this week". Staff curate each edition in the admin console. Automated suggestions, per-person picks and a weekly notice are later phases (§11); the model already has room for them.

## 2. Data model

Migration `supabase/migrations/20260913120000_weekly_core.sql`. Every table has RLS on and **no** anon or authenticated privileges; every function is `service_role` only.

| Table | Holds | Notes |
|---|---|---|
| `weekly_program_setting` | One row: `enabled`, `audience` (`staff`/`beta`/`all`), `beta_user_ids`, `teaser_enabled`, editor limits and warnings, `edition_retention_weeks` | Ships off, audience `staff` |
| `weekly_scope` | Where an edition applies: the whole country (`centre` null) or a centre point and `radius_km` | Ghana seeded; regional areas added from the console. One national scope per country; it cannot be retired. Slugs `preview`, `archive`, `new` reserved |
| `weekly_edition` | One per scope per ISO week (`week_start` is a Monday). `status` draft → scheduled → published → archived. `version` for optimistic concurrency | `unique (scope_id, week_start)` |
| `weekly_section` | Ordered sections: `kind` (template), `layout` (`hero`/`carousel`/`grid`/`list`/`editorial`), `subject_scope` (events / places / mixed), title, subtitle, `icon_key`, plain-text `body`, `is_visible` | Deferred unique `(edition_id, position)` |
| `weekly_item` | Ordered references to live `event` or `place` rows, with `headline`, `blurb`, `pinned`, `source` (`manual`/`suggested`/`auto`) and `score` / `score_breakdown` for later phases | No FK to the listing (polymorphic); `weekly_housekeeping()` removes orphans |

**Nothing about an event or place is copied.** The edition stores ids; titles, dates, prices, images and status come from the live row every time the edition is read.

Section kinds, layouts and icon keys are defined once in `packages/core/src/weekly/sectionKinds.ts` and `sectionIcons.ts` (a unit test checks them against the SQL CHECK lists). Emoji live only in `sectionIcons.ts`.

## 3. Validity: what may appear

`weekly_subject_validity(type, id, as_of, allow_ended)` returns null when a listing may be shown, otherwise the reason:

| Listing | Refused when |
|---|---|
| Event | missing · `canceled` · moderation `removed` / `hidden` / `restricted` · `archived_at` set · not `published` · every session has ended (unless `allow_ended`) |
| Place | missing · moderation `removed` / `hidden` / `restricted` · `archived` · not `published` · `temporary_status = permanently_closed` (temporarily closed places stay, and show their badge) |

`restricted` follows the moderation contract that restricted content is not eligible for featuring. **Verified status never changes eligibility or order**; the cards show the badge as they do everywhere.

The rule runs in three places: when an editor adds a listing (refused with the reason), in the editor's checks panel (a badge on each listing that will not show), and on **every read of a published edition**. A listing that is cancelled, hidden or closed after publication disappears from the public edition on the next read, with no sync job. For an edition whose week is over, ended events are kept so a shared link still reads as a record of that week.

## 4. Reading an edition

`weekly_edition_document(edition_id, admin, as_of)` builds the whole edition in one call: two set-based reads (events with tickets, attendance and occurrences; places with category, rating and open-now), however many items there are. The public form drops hidden and `for_you` sections, invalid items, and sections with nothing left, and returns no internal field (source, pinned, validity, score, actor ids, version, status). Event and place objects use the discovery RPC column names so `EventCard` and `PlaceCard` render them unchanged.

`weekly_edition_view(scope_slug, week_start, as_of)`:

- **Exact week given**: that published edition of that scope, or null.
- **Current** (no week): the first of these that has something to show — the scope this week, Ghana this week, the scope last week, Ghana last week. The result carries `isFallbackScope` and `isPreviousWeek`, and the pages say so ("these are Ghana-wide picks", "here is last week's"). A regional page never labels national picks as local.
- An unknown or retired scope slug returns null (the page 404s) rather than silently showing national picks.

`weekly_resolve_scope(lat, lng)` picks the smallest active regional scope containing the point, otherwise Ghana.

Accra time: Ghana is UTC+0 with no daylight saving, so an Accra calendar day is a UTC calendar day. SQL uses `at time zone 'Africa/Accra'`; `packages/core/src/weekly/week.ts` holds the TypeScript twin (week start, week range, schedule inputs), unit tested across month and year boundaries.

## 5. Programme access and caching

`packages/services/src/weekly/weeklyProgram.ts` resolves access exactly like Discovery and Rewards: the kill switch wins, a missing or unreadable settings row means off (fails closed), the row is cached for 15 seconds per instance, `staff` means an active `admin_user`, `beta` adds `beta_user_ids`.

Signed-out visitors see Abonten Weekly **only when the audience is `all`**. That is what makes the pages cacheable:

| Surface | Rendering | Cache |
|---|---|---|
| `/weekly`, `/weekly/[scope]`, `/weekly/[scope]/[week]` | Server-rendered from an anonymous read (`apps/web/src/utils/weeklyPublic.ts`), never reading cookies | `revalidate = 60`; the two dynamic routes return an empty `generateStaticParams` so each address is cached on first request |
| Same pages while the audience is `staff` or `beta` | The cached HTML carries no edition; `WeeklyPersonalEdition` loads it client-side with the visitor's session through the `getWeeklyEdition` Server Action | Per person (React Query key includes the user id); pages are `noindex` |
| `/weekly/preview/[token]` | Dynamic; renders a draft from a signed link | Never cached; `noindex` |
| `GET /api/mobile/weekly` | Same service call with optional Bearer | `public, s-maxage=60` only when the answer is the same for everyone; otherwise `private, no-store` |
| `/api/mobile/weekly/teaser`, `/program` | Per caller | `private, no-store` |

No personal data is ever in a cached response: nothing in an edition depends on the viewer.

Metadata: the public pages set the title, description, canonical URL (the dated edition address) and an Open Graph image from the first listing's Cloudinary image. Pages with nothing public to show are `noindex`.

## 6. Editing and publishing

Services: `packages/services/src/admin/weekly/weeklyAdminCore.ts` (editions, sections, items, lifecycle, listing picker, preview link) and `weeklySettingsAdminCore.ts` (settings and areas). Admin transport: Server Actions in `apps/admin/src/server/actions.ts`; UI in `apps/admin/src/app/(console)/weekly/`.

| Permission | Allows | Step-up | Seeded to |
|---|---|---|---|
| `weekly.view` | The module, editions, areas, settings, preview links | no | operations, moderator, support_admin, analyst, field_ops_manager |
| `weekly.edit` | Create, duplicate, edit copy, sections and listings; archive and restore | no | operations, moderator |
| `weekly.publish` | Schedule, cancel a schedule, publish, unpublish | **yes** | operations |
| `weekly.configure` | Areas and programme settings | **yes** | operations |

**Concurrency.** Every change to an edition first calls `weekly_claim_edit(edition_id, expected_version)`, which locks the edition, compares the version and bumps it. If another admin saved in between, the change is refused with 409 and the editor reloads so nobody saves over changes they have not seen. Checks that can refuse a request (section type, validity, section limit, a reorder list that no longer matches) run before the claim, so a refused request never uses up a version.

**Lifecycle.** `weekly_edition_transition()` is the only state machine: schedule (validation must pass, time in the future), unschedule, publish (validation must pass), unpublish, archive, restore. It writes one `admin_audit_log` row per transition. Validation (`weekly_edition_validation`) blocks publishing when the area is retired, the week is over, or no listing can be shown; it warns (never blocks) about listings that will not show, the same listing in several sections, one organizer with more events in a section than the setting allows, listings featured in this area's recent editions, and empty sections.

**Audit.** Every admin change is recorded: `weekly.edition.create` / `duplicate` / `update` / `schedule` / `unschedule` / `publish` / `unpublish` / `archive` / `restore`, `weekly.section.create` / `update` / `delete` / `reorder`, `weekly.item.add` / `update` / `move` / `remove` / `reorder`, `weekly.settings.update`, `weekly.scope.create` / `update` / `retire`. The scheduler's publish is recorded with no actor and role `system`.

**Preview.** `weeklyPreview.ts` signs `<editionId>.<expiresAtMs>` with a key derived from the service-role key (purpose `weekly-preview:v1`), valid 30 minutes, for that one edition. The admin console builds the link from `WEB_BASE_URL` (default `https://abontenhub.com`).

**Editorial text** is plain text: sanitised in `packages/core/src/weekly/editorialText.ts` (control, zero-width and bidirectional override characters removed; whitespace normalised), length-checked by zod (`packages/validation/src/weeklySchemas.ts`) and CHECK constraints, and always rendered as text, never as HTML. There are no editor-entered links; every link comes from the listing.

## 7. Jobs and monitoring

| Job | Schedule | Function | Behaviour |
|---|---|---|---|
| `weekly-publish-due` | */5 | `weekly_publish_due()` | Publishes scheduled editions whose time has come. One that fails its checks stays scheduled and opens an `incident` (component `weekly`, one per edition until resolved) |
| `weekly-housekeeping` | 02:45 | `weekly_housekeeping()` | Deletes items whose listing no longer exists; archives editions older than `edition_retention_weeks` (104) |

Health: `weekly_health()` feeds the `weekly` check in the observability health run (Admin › Monitoring, "Abonten Weekly schedule"). Healthy while the programme is off; when on, down if a scheduled edition is more than 15 minutes late or no Ghana-wide edition is published for the week by 09:00 Accra on Monday. Page errors report through the existing web error pipeline (`apps/web/src/app/(pages)/weekly/error.tsx`).

## 8. Web and mobile

**Banners.** The Explore teaser and the edition masthead are one banner component on each platform (`apps/web/src/weekly/organisms/WeeklyBanner.tsx`, `apps/mobile/src/components/weekly/WeeklyBanner.tsx`). Up to six of the edition's listings with images (`weeklyBannerSlides` in `packages/core/src/weekly/bannerSlides.ts`: hero sections first, each listing once) fill the banner and take turns behind the text every 6.5 seconds, with a cross-fade and a slow zoom. A caption opens the listing on show; progress segments, arrows (web, tablet and up), swipe and a pause button move between them. Rotation stops while the pointer or keyboard focus is inside (web), while a finger is on it (app), while it is off screen, the tab or app is in the background or the screen is not in front, and never starts with the reduced-motion setting on. Only the slide on show and the next one load their images. The teaser API returns these as `slides`; the older `images` field stays for app builds already installed. Hero sections use the same full-bleed treatment for each listing.

**Web** (`apps/web/src/weekly/`): `WeeklyEditionView` (masthead, notices, share), `WeeklySection` (hero, carousel, grid, list, editorial), `WeeklyItemFrame` (headline and note around the existing cards), `WeeklyCarousel` (keyboard-scrollable, reduced motion respected), `WeeklyFallback` (never a dead end: this week's upcoming events and a way to Explore), `WeeklyTeaser` on `/explore/[location]` (streamed, hidden unless this week's edition is out), `WeeklyNavLink` in the sidebar. `/weekly` is on the public route allowlist in `apps/web/src/config/supabase/middleware.ts`.

**Mobile** (`apps/mobile`): `app/(app)/weekly/index.tsx` and `app/(app)/weekly/[scope]/[week].tsx` over `src/components/weekly/WeeklyScreen.tsx`; `WeeklyTeaserCard` at the top of Explore (its `WeeklyBanner` is also reused by the Featured banner below it, since 2026-09-16); a drawer row. Deep links `abontenhub.com/weekly`, `/weekly/<area>`, `/weekly/<area>/<monday>` (and `abonten://weekly/...`) are mapped in `app/+native-intent.ts`; `/weekly` is in the Android App Links intent filter, which takes effect with the next native build.

**Sharing** uses the dated edition URL. On web the existing share hook adds the signed-in sharer's referral code only while Abonten Rewards referral capture is on; no new referral mechanism exists for editions.

## 9. Security summary

- Tables and functions unreachable with the anon or authenticated key (integration test `weekly-public`).
- Staff-only and beta editions never enter a cached response; the anonymous read returns `available: false`.
- Admin writes re-check permissions in the service, require step-up for publish and configure in the transport, validate input with zod, and are audited.
- Preview links are HMAC-signed, expire in 30 minutes, and grant one edition only.
- Listing validity is enforced at read time, so a moderation action takes effect in Abonten Weekly without anyone touching the edition.

## 10. Rollout

1. **Internal.** Settings: switched on, audience `staff`. Staff build and publish the first Ghana edition, check the web pages, the Explore teaser and the app screen.
2. **Beta.** Audience `beta` with beta user ids. Add a first regional area only when it has enough to feature.
3. **Everyone.** Audience `all`. Public pages become server-rendered, cached and indexable; the teaser appears for everyone. Update the public help page at this point, not before.

Stop: untick "Abonten Weekly switched on" (reaches every instance within 15 seconds) or set `WEEKLY_KILL_SWITCH=true` on the web deployment (set it on the admin deployment too so Admin › Abonten Weekly shows it). Editions are kept. Dates and audiences are decision **K1** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md).

## 11. Designed for later, not built

| Later phase | Where it plugs in |
|---|---|
| Engagement analytics (views, impressions, clicks, attributed purchases) | A `weekly_engagement` table with no user identifiers, modelled on `search_query_log` |
| Automated suggestions | A SQL candidate generator writing scored `weekly_candidate` rows shown to editors as "Suggested" (`weekly_item.source = 'suggested'`, `score`, `score_breakdown`); never public until an editor adds them |
| Per-person picks | The `for_you` section kind (already in the schema and hidden publicly), filled per person from the existing recommendation engine |
| A weekly notice | A `weekly` source on the existing `notification_delivery` queue, opt-in only, push and in-app only |
| Organizer items | `weekly_item.subject_type = 'organizer'` is accepted by the schema and ignored by clients |

## 12. Known limitations

- Editions are fully manual today; there are no suggestions.
- Admin console reordering uses up and down buttons (no drag and drop).
- iOS has not been tested; Android was tested on the emulator against a local stack. Mobile changes reach devices only with a new EAS build or update, and the `/weekly` App Link needs a native build.
- The web text is English only, like the rest of Discovery.
