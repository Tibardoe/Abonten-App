---
title: Marketing collateral and QR short links
purpose: How printed and digital marketing pieces link into the product, how to re-point a printed QR code, and how to produce the per-place and per-event pieces.
audience: Founder, marketing, field team leads, engineering
scope: The /go/<code> short links (apps/web), the collateral set kept in the brand workspace (Desktop\Abonten-Brand\07-collateral), and the rules for printing it. Not the brand identity itself (PROJECT.md §48).
status: Approved
version: 1.0
lastReviewed: 2026-09-28
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Marketing collateral and QR short links

## Purpose

Printed pieces (flyers, rack cards, stickers, posters, signs) cannot be changed after printing, so their QR codes never point straight at a page. They point at `https://abontenhub.com/go/<code>`, which redirects to today's best page. When a better page exists, or the app reaches the stores, the code is re-pointed in one place and every piece already in the street follows.

## How the short links work

- The table is `QR_LINKS` in `packages/core/src/brand/qrLinks.ts`; the route is `apps/web/src/app/go/[code]/route.ts`.
- Every redirect is temporary (307) with `Cache-Control: no-store`, so no browser, scanner or CDN keeps an old destination.
- An unknown code goes to the homepage, never a 404.
- `/go/*` is public: it is not in the protected-route list (`apps/web/src/config/supabase/middleware.ts`).
- Each code appears on its own in the Vercel request logs, which is how scans of one piece are counted (there is no analytics package in the web app).

| Code | Printed on | Destination today |
|---|---|---|
| `discover` | everyday flyer, posters, pocket card | `/` |
| `akwaaba` | arrivals rack card | `/` |
| `organizers` | organizer flyer | `/help/organizers/creating-and-publishing-events` |
| `places` | place-owner flyer | `/help/place-owners/managing-your-place` |
| `owner` | welcome card left with a new place owner | `/manage/places` (sign-in first when signed out) |
| `tickets` | ticket-check sign at event entrances | `/help/customers/your-tickets` |
| `app` | "Get the app" pieces (apps edition, held) | iPhone → App Store, Android → Google Play once `APP_STORE_LISTINGS` has that listing (Android follows `ANDROID_APP_LISTED` in `packages/core/src/rewards/invite.ts`); otherwise `/` |

Per-place stickers and counter cards use the place's own page, `/places/<slug>`; the slug is fixed when the place is created (`postPlaceCore.ts`) and is not changed by edits. Per-event pieces use `/events/<code>`.

## Procedure — re-point a printed code

1. Change the `destination` of the code in `QR_LINKS` (a site path starting with `/`).
2. Run `npx vitest run src/brand` in `packages/core`.
3. Merge; the web deploy carries it. Check with `curl -sI https://abontenhub.com/go/<code>`: `307` and the new `location`.

Never delete or rename a code that has been printed. The unit test lists the printed codes and fails if one disappears.

## Procedure — the apps go live

1. When the Android app is public on Google Play, set `ANDROID_APP_LISTED = true` (this also turns on the store link on the invite page).
2. When the iPhone app is public on the App Store, set `APP_STORE_LISTINGS.ios` to its App Store URL.
3. Deploy, then scan a `/go/app` code with each phone type.
4. Only then release the "apps edition" pieces (`07-collateral/apps-edition-HOLD/`). Apple and Google do not allow their badges before the app is available in their store.

## Procedure — a kit for one place or event

In the brand workspace, `src/collateral/`:

```
node kit.cjs place <slug> "<Place name>"    # door strip, counter card, "We're on Abonten" posts
node kit.cjs event <code> "<Event name>"    # ticket-check sign, Tickets on Abonten badge with the event's QR
```

The kit refuses to render unless the page answers 200 on abontenhub.com, and decodes each rendered QR to check it opens that page.

## Expected outcome

- `curl -sI https://abontenhub.com/go/discover` answers `307` with `location: https://abontenhub.com/`.
- `07-collateral/QA-REPORT.md` shows every piece passing (QR decoded by two decoders, press PDFs with trim and bleed boxes and no RGB colour left).

## Exceptions

- A code redirects to a page that later requires sign-in or is removed: re-point it; people scanning a printed code must never land on an error.
- The collateral workspace is not in this repository. If it is lost, the pieces can be rebuilt from `src/collateral/` in the brand workspace, which is the only source.

## Escalation

Destination or copy questions go to the founder. Anything about the route, the redirect or the listings table goes to engineering.

## Security and privacy notes

- The route reads only the path and the `User-Agent` header; it stores nothing and sets no cookie of its own. The site-wide proxy still runs (locale and device cookies as on any page).
- Destinations are site paths or the two app-store listings; the table cannot be used to redirect to an arbitrary site.
