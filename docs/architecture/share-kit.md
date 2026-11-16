---
title: Share kit
purpose: Describe the share kit — the ready-made images organizers and place owners post to their own socials — how the images are drawn, where they appear and what limits them.
audience: Engineers, founder, support
scope: GET /api/share/..., packages/core/src/shareKit, apps/web/src/shareKit, apps/mobile/src/features/shareKit
status: Approved
version: 1.0
lastReviewed: 2026-11-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Share kit

Every public event and place has ready-made images its owner can post to their own Instagram, TikTok or WhatsApp Status. Each image carries the listing's picture, name, date or category, place, price, a button-style call to action, the listing's abontenhub.com address and a QR code for it, with the Abonten mark. Organizers and venues have the audiences; every image they post shows Abonten to their followers.

## The images

| Listing | Images | Size |
|---|---|---|
| Event | `story` (Instagram/TikTok story, WhatsApp Status), `post` (feed, 4:5) | 1080×1920, 1080×1350 |
| Place | `story`, `post`, `welcome` ("Now on Abonten") | 1080×1920, 1080×1350, 1080×1350 |
| Organizer profile | `welcome` | 1080×1350 |

- **Event price line** (`eventShareOffer`): "Tickets from {lowest price}" (or "Tickets {price}" when there is one paid tier), "Free entry" for the FREE tier, nothing otherwise; the button says "Get your tickets", "Reserve your spot" or "See it on Abonten" to match. Prices are formatted in the image's language and the event's currency.
- **Pictures**: event flyers are shown whole (their words matter); place covers fill the frame. A missing or unreachable picture draws the title in its place, never a failed image.
- **Words** come from `server.json` › `shareKit` in the image's language (`?hl=`, default English), dates from `getFormattedEventDate` in the event's time zone, place categories from `placeCategoryLabel`.
- **Font**: the receipt's Noto Sans subset (`public/fonts/receipt`), which has the letters of Ghanaian languages and the cedi sign; the brand's own font files are WOFF2, which the renderer cannot read.
- **Stories** keep their words between y≈190 and y≈1720, clear of Instagram's and WhatsApp's own header and reply bar; long titles get a smaller size so they never run into the button.

## How they are served

`GET /api/share/<events|places|profiles>/<code|slug|username>/<story|post|welcome>?hl=<locale>` (`apps/web/src/app/api/share/[kind]/[key]/[format]/route.tsx`), drawn with `next/og` (`ImageResponse`).

- **Public facts only.** The listing is read with the anonymous client, exactly as the public pages read it, so anything not public (a draft, a hidden or removed listing) answers 404; so does a cancelled event, and a profile whose account is not active (`get_public_profile`, status 1).
- **Cached by the CDN**: `public, max-age=600, s-maxage=3600, stale-while-revalidate=86400`. An edit shows in the image within the hour. 404s are cached for five minutes.
- **Limited**: 40 images per visitor per minute after the cache (`checkRateLimit`, key `share-image:<ip>`), because drawing an image costs server time (the November 2026 Vercel block was about server time).
- **Outside the proxy** (`apps/web/src/proxy.ts` matcher): no cookie is needed or read.
- Kinds, formats, paths and file names live in `@abonten/core/shareKit/shareKit` so the website and the app build the same addresses.

## Where owners find it

- **Website**: a "Share kit" card at the top of the Promotion tab of an event's and a place's manage page (`ShareKitCard`): previews, Download (same-origin download, file name `abonten-<key>-<format>.png`) and Copy link. Before the listing is public the card says the images come once it is published (`hasShareImages`).
- **App**: a "Share kit" section on the organizer's event screen and the place screen, for the owner and for team members who manage the listing or buy promotions (`ShareKitSection`): previews, one button per image that downloads it to the cache and opens the phone's share sheet, and Share for the link.
- The organizer **welcome** image has no button yet; its address is `/api/share/profiles/<username>/welcome`.

## Not done (yet)

- No automatic posting: images are posted by their owners, by hand.
- The app section reaches phones with the next app update.
