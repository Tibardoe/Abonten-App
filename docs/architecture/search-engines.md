---
title: Search engines - what the website offers them and how
purpose: Describe what the public website tells search engines (titles, descriptions, canonical addresses, languages, structured data, the sitemap, robots.txt, the manifest, IndexNow), which pages are offered and which are kept out, so that new public pages follow the same rules.
audience: Engineering, anyone adding or changing a public web page, the founder (owner steps)
scope: apps/web public pages (homepage, Explore city pages, event, place, profile, help, legal, Weekly), app/sitemap.ts, app/robots.ts, app/manifest.ts, @abonten/core/seo, utils/searchIndexing.ts, the IndexNow script. Not covered - search inside Abonten (discovery-search-and-recommendations.md, search-languages.md), the app stores' listings (../deployment/store-listings.md), web analytics.
status: Approved
version: 1.0
lastReviewed: 2026-10-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Search engines - what the website offers them and how

On 2026-10-25 a search for "abontenhub" found nothing of Abonten. The homepage offered a search engine three links (all to sign-in), canonical addresses named upper-case event codes that no link used, the sitemap held four sample events and no city, and nothing told a search engine the site's name or logo. This document describes what was put in place, and the rules for new pages.

## 1. The pages offered, and the pages kept out

| Page | Offered | Canonical address |
| --- | --- | --- |
| Homepage | yes | `/` |
| A launched city's Explore page (`market_region`, live market, `launch_status = launched`) with something listed | yes | `/explore/<city>` |
| A launched city with no upcoming event and no place yet | no (`noindex, follow`) until it has one | `/explore/<city>` |
| Any other `/explore/<text>` (a street, "current location") | no (`noindex, follow`) | itself |
| `/events/location/<city>` (older events-only page) | through its city | `/explore/<city>` |
| Event | yes, unless the organizer's account is left out (below) | `/events/<code in lower case>` |
| Place | yes, unless the owner's account is left out | `/places/<slug>` |
| A host's profile (a published event, or a place they claimed; account active) | yes | `/user/<username>/<tab>`, one per public tab |
| Anyone else's profile | no (`noindex, follow`) | — |
| Profile bookings and favourites | no | — |
| Help pages (listed), legal pages, Abonten Weekly | yes | their own |
| Spotlight posts, Stories, invites | no: shared as links, rendered for the viewer | — |
| Everything signed-in, transactional or holding a private token | no (robots.txt and `noindex`) | — |

**Addresses.** Every link the apps build uses the lower-case event code, and so do the canonical URL, the sitemap and the structured data (`@abonten/core/seo/paths`: `eventPath`, `placePath`, `profilePath`, `cityPath`; `reviewsPath` writes the event code in lower case too). An upper-case code still opens the page; its canonical names the lower-case one.

**Languages.** A translated page's canonical is its address in the language it was rendered in (`?hl=<locale>` for fr, es, de, pt) and it lists the others as alternates (`i18n/alternates.ts`, [internationalisation.md](internationalisation.md)). Twi is partial and not offered. The legal pages are English only.

**Accounts left out.** `utils/searchIndexing.ts` holds the accounts whose listings and profile are kept out: today only the App Review demo account ("Abonten Events"), whose eight sample events are not real. Their pages say `noindex`, carry no structured data and are left out of the sitemap. **Remove the id when the samples are deleted** (step 1.3 of [../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)).

**Cities.** Only a launched city of a live market is a page to show (`indexedCities()`, `indexedCityForSlug()`): its title, heading and introduction name the city (`explore.eventsAndPlacesIn`, `explore.cityIntro`). A city with nothing listed (`market_region_activity`, through `getRegionActivity`) says `noindex` and is left out of the sitemap: on 2026-10-25 Google refused `/explore/takoradi` as a "soft 404" because the page only said there were no events. When the count cannot be read the city is treated as listed. A city slug resolves to coordinates from the market's own regions, never a billed Google lookup, so a crawler reading every city page costs nothing.

## 2. Titles and descriptions

| Page | Title (the root template adds " \| Abonten Hub") | Description |
| --- | --- | --- |
| Homepage | `metadata.homeTitleIn` with the country when exactly one market is live ("Abonten Hub: events, tickets and places to go in Ghana"), else `metadata.homeTitle`; written whole (`title.absolute`) | `metadata.homeDescriptionIn` / `homeDescription` |
| Event | `events.metaTitleTickets` when a tier has a price ("… tickets · Fri, 6th Nov 2026"), else `events.metaTitle` | `events.metaDescription`: date · venue, then the description, cut at a word (`@abonten/core/seo/snippet`, 160 characters) |
| Place | `places.metaTitleInCity` ("Republic Bar · Pub in Accra") or `places.metaTitle` | the description, cut at a word, else category · address |
| City | `explore.eventsAndPlacesIn` | `explore.discoverUpcomingEventsRestaurantsNightlifeAnd` |
| Profile | the person's name or @handle | the bio, cut at a word, else `account.onAbontenHubEventsPlacesAnd` |

A page that sets its own `openGraph` replaces the root layout's whole (Next.js merges metadata one level deep), so a page without a picture of its own names `DEFAULT_SHARE_IMAGE` (`utils/defaultShareImage.ts`) again. Listing pages set `openGraph.url` to the canonical address.

## 3. Structured data (JSON-LD)

One `<script type="application/ld+json">` per page, a single `@graph` (`jsonLdGraph` in `@abonten/core/seo/jsonLd`), written by `components/atoms/JsonLd.tsx` (which escapes `<`). Only facts a signed-out visitor can see on the page go in.

| Page | Nodes |
| --- | --- |
| Homepage | `Organization` (name, legal name, logo `abonten-app-icon-512.png`, the official profiles from `@abonten/core/brand/socialLinks` without their share-sheet query, support email) and `WebSite` (the site name search engines show beside the address) |
| Event | one `Event` per date still to come (at most 10; once all are over, the last), with the venue (`Place`, its page when the event is at a listed place, `PostalAddress` with the market city and country, coordinates), the organizer, one `Offer` per tier (price in the currency's own precision, sold out, sale window) and `isAccessibleForFree`; then `BreadcrumbList` Home › city › event |
| Place | the closest schema.org kind for the category (`placeSchemaType`: Restaurant, BarOrPub, NightClub, MovieTheater, Hotel, ExerciseGym, …, else LocalBusiness), address, coordinates, phone, website and social profiles (`sameAs`), opening hours, rating; then `BreadcrumbList` |
| City | `BreadcrumbList` Home › city |
| Host profile | `ProfilePage` with the host as `Organization` |
| Help page | `BreadcrumbList` Help centre › page |

The builders are framework-free and tested: `packages/core/src/seo/{jsonLd,listingJsonLd,snippet,paths}.ts` with their `.test.ts`. The market city of a listing comes from its pin (`cityAt` in `utils/searchIndexing.ts`, `containingRegion` from `@abonten/core/market/coverage`).

## 4. The sitemap, robots.txt and the manifest

- **`/sitemap.xml`** (`app/sitemap.ts`, rebuilt at most hourly): the static pages, the help pages, the launched cities with something listed, events still running or ended within 30 days, published places, and the profiles of the hosts behind them; each with its language versions and, for listings, the flyer or cover (image sitemap). A read that fails keeps the last good sitemap ([web-resilience.md](web-resilience.md)). One file holds up to 50,000 addresses; split it with `generateSitemaps` before events and places together approach that.
- **`/robots.txt`** (`app/robots.ts`): everything personal, signed-in or transactional, and the links that carry a private token (`/sos/`, `/trusted/`, `/weekly/preview/`). Pages shared as links but not search results (invites, Stories) are not listed there, because link-preview robots read robots.txt too; they say `noindex` instead.
- **`/manifest.webmanifest`** (`app/manifest.ts`): name, icons (`abonten-app-icon-192/512.png`, drawn by `apps/web/scripts/gen-brand-assets.mjs`) and colours, with `display: "browser"` so Chrome does not offer to install the website beside the Abonten app.
- All three are excluded from the session proxy (`proxy.ts` matcher): outside `app/[locale]`, a language rewrite would make them a 404.

## 5. Telling search engines

- **Google**: the Search Console **domain property** `abontenhub.com` (verified by the `google-site-verification` TXT record in Vercel DNS, owned by the founder's Workspace account) has `https://abontenhub.com/sitemap.xml` submitted since 2026-10-25 (read the same day: Success, 42 pages). Search Console › URL inspection › Request indexing pushes a single changed page (about ten a day).
- **Bing Webmaster Tools**: the same account signs in with Google; the site was imported from Search Console and the sitemap submitted there too (2026-10-25).
- **IndexNow** (Bing, and through it DuckDuckGo, Yahoo, Ecosia and ChatGPT search; Yandex, Seznam, Naver): `node apps/web/scripts/indexnow-submit.mjs` submits every page in the live sitemap. The key is the file `apps/web/public/<32 hex>.txt` and is not a secret (the engines fetch it to check the submission). Run it after a deploy that adds or changes public pages; `--dry-run` lists what would go.

**Done on 2026-10-25** (open item SEO1): sitemap in Search Console and Bing, indexing requested for `/`, `/help` and the three cities with listings. Search Console refused `/explore/takoradi` as a soft 404 (nothing listed), which is why empty city pages say noindex (§1).

**Still open (optional, founder):** a Google Business Profile for Abonten Hub Ltd (company name, website, logo) for the panel shown beside brand searches.

## 6. Rules for a new public page

1. Give it a title in the messages (never a sentence built in code), a description, and `alternates: languageAlternates(path, locale)`.
2. If it is not a search result, say `robots: { index: false, follow: true }`; if it holds a private token, also add it to robots.txt.
3. If it is a listing, build its address with `@abonten/core/seo/paths`, check `isIndexedAccount` for its owner, and add it to the sitemap.
4. Add structured data only for facts on the page, through the `@abonten/core/seo` builders, in one graph.
5. Extend `apps/web/e2e/seo.spec.ts`.

## Related

[internationalisation.md](internationalisation.md) (languages and `?hl=`), [web-resilience.md](web-resilience.md) (timed rebuilds, 404 against 500), [global-platform.md](global-platform.md) (markets and cities), [../web/README.md](../web/README.md), PROJECT.md §33.5 and §68.
