---
title: Google Maps keys and Map ID
purpose: Which Google key each part of Abonten uses, what each key is allowed to do, the Map ID behind the website's pins, and how to change or rotate any of them.
audience: Engineers, founder
scope: Google Cloud project abonten-452216 (Abonten); apps/web, apps/admin, apps/mobile, packages/services/src/geo
status: Approved
version: 1.0
lastReviewed: 2026-10-04
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Google Maps keys and Map ID

Google bills Abonten for every address lookup, suggestion and place detail, so each key may do only its own job. Until 2026-10-04 one key, "Maps Platform API Key" (now **Abonten Android (Maps SDK only)**), did everything: it was sent to every website visitor, built into the app, and allowed 27 Google services, with no restriction on who could use it. Anyone who copied it from the website could have run up the bill on any of those services.

## The keys

Project `abonten-452216` (Google Cloud, signed in as the founder's abontenhub account). Values live only in Vercel, EAS and the local `.env` files, never in a document.

| Key (Google Cloud name) | Variable | Who may use it | Services | Why |
|---|---|---|---|---|
| **Abonten Web (browser)** | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (web, every environment; GitHub Actions secret of the same name) | Websites only: `abontenhub.com`, `*.abontenhub.com`, `abonten.vercel.app`, the project's preview addresses (`*-benjamin-tibardoes-projects.vercel.app`), `localhost` / `127.0.0.1` on ports 3000 and 3010 | Maps JavaScript API, Places API (New), Geocoding API | It is in every visitor's browser, so Google must refuse it anywhere else |
| **Abonten Server (geocoding + places)** | `GOOGLE_MAPS_API_KEY` (web and admin, Production and Preview; secret) | Any caller holding it; it never leaves the server | Geocoding API, Places API (New) | Server calls carry no website address, so a browser key cannot be used; the key is kept secret instead |
| **Abonten Android (Maps SDK only)** (the original key, "Maps Platform API Key" until 2026-10-04) | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (EAS environments, `apps/mobile/.env`) | Any caller | Maps SDK for Android only | It is built into every Android app and cannot be hidden. Google charges nothing for Maps SDK map loads, so a copy of it costs nothing. It is not limited to the app's signing certificate on purpose: Play App Signing re-signs the app with Google's own certificate, and a forgotten fingerprint would blank every map on the day the app reaches Play |

`googleMapsServerKey()` (`@abonten/services/geo/googleMapsKey`) is the only way server code reads a key: `GOOGLE_MAPS_API_KEY`, falling back to the browser key with a logged warning on a deployment that has no server key yet. Server callers: `/api/geocode`, the public location pages (`geocodeServerSide.ts` through `placeNameGeocode`), the country lookup in `locationResolution.ts`, Admin › Field Ops / Abonten Weekly "Find on the map" (`regionsAdminCore.ts`), and the app's address search (`placeSuggestions.ts`).

The Firebase keys in the project ("Android key" and "Browser key", auto-created by Firebase) are Firebase's own client keys, limited to Firebase services, and are not used for maps.

## What each part calls

- **Website.** Maps JavaScript API loaded once per page (`useGoogleMaps`), in the reader's language. Address fields (`AutoComplete`, `PostAutoComplete` on `usePlacesAutocomplete`) use Places API (New): `AutocompleteSuggestion` with one session token for the typing and the pick, a fresh token after each pick, and the picked place asked for its `location` only. Before 2026-10-04 the token was never renewed and the pick asked for every field, so each keystroke was billed on its own and each pick at the highest Place Details rate. Pins are advanced markers (`MapMarker`). The browser reaches `maps.googleapis.com` and `places.googleapis.com` (content security policy, `@abonten/core/security/contentSecurityPolicy`).
- **App.** Address suggestions go through Abonten's server: `GET /api/mobile/addresses/suggest` and `/api/mobile/addresses/resolve` (`@abonten/services/geo/placeSuggestions`, Places API (New), limited to the open markets and biased 50 km around the area being browsed; 120 suggestions and 30 picks a minute per person or address, 3,000 and 1,000 a minute in all). Until 2026-10-04 the phone called Google's legacy Places web service itself with the key in the app. Maps on Android use Maps SDK for Android with the key in the app's manifest (`app.config.js`); iOS uses Apple Maps and no Google key.

## Map ID

Advanced markers need a Map ID: the map's settings kept in Google Cloud (Google Maps Platform › Map management). The website's is **Abonten web**, `7ca0d719568c4064a177c611` (JavaScript, raster: the same tiles as before and no WebGL needed on low-end phones), created on 2026-10-04. A Map ID is not a secret — Google expects it in page code — so it is the default in `useGoogleMaps.ts`; `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` overrides it (a test map). Every map also gets the site's colour scheme (`colorScheme`, light or dark, chosen when the map is created), which only a map with a Map ID accepts.

A Map ID on the website does not change what Google bills: web map loads are Dynamic Maps either way. (On Maps SDK for Android or iOS a Map ID would make free map loads billable, which is one more reason the app uses none.)

## Cut-over of 2026-10-04 (done)

All on 2026-10-04, in this order:

1. The code: `googleMapsServerKey()`, the app's address search through the server, Places API (New) and advanced markers on the website (PR #24, main `abf5cda8`); app update `d390cd88` (production).
2. Map ID "Abonten web" created and made the website's default.
3. **Abonten Web (browser)** created. The browser key was checked the same day by drawing a map with it on each address: `abontenhub.com`, `abonten.vercel.app`, a preview deployment (so Google accepts the `*-benjamin-tibardoes-projects.vercel.app` pattern) and a local build on `127.0.0.1:3010` drew their maps; `example.com` was refused with `RefererNotAllowedMapError`. The local build also ran the address fields and the pins on it.
4. **Abonten Server (geocoding + places)** created (`52297ca2…`) and checked: Geocoding and Places (New) answer, Static Maps is refused. `GOOGLE_MAPS_API_KEY` set on `abonten` (Production, Preview; Sensitive — Vercel does not offer a sensitive variable to Development, and local development reads `apps/web/.env.local`) and replaced on `abonten-app-admin` (Production, and added for Preview). `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` removed from `abonten-app-admin`.
5. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` on `abonten` (Production, Preview, Development) and the GitHub Actions secret switched to the browser key; web and admin redeployed. The live site's scripts carry the browser key only (checked by fingerprint). Checked live: pins on the Explore map and an event page, address suggestions and a pick on the home page, the app's address search, a location page that needs a fresh geocode.
6. The original key renamed **Abonten Android (Maps SDK only)** and limited to Maps SDK for Android. Google refuses to remove a service a key used in the last 7 days unless the check is skipped (`gcloud services api-keys update … --no-check-existing-usage`); it was skipped after Cloud Monitoring's request counts (`serviceruntime.googleapis.com/api/request_count` by `credential_id`) showed no traffic on the key since the switch. Afterwards Google answered `REQUEST_DENIED` / `PERMISSION_DENIED` to it for Geocoding and Places, and the Android app still drew its maps with it.

Installed app builds that have not fetched update `d390cd88` still call Google's Places web service with the original key; their address field now gets no suggestions and falls back to typed text until they update.

Every step can be undone on its own: a key's restrictions can be widened again (Credentials › the key, or `gcloud services api-keys update … --api-target=…`), and a Vercel variable can be pointed back at another key.

## Rotating a key

Create the new key with the same restrictions, put it where the table says, redeploy (web/admin) or rebuild (Android: the manifest key changes only with a native build), check, then delete the old key. A leaked key: `../incident-response/leaked-secret.md`.

## Troubleshooting

- Map grey with "This page can't load Google Maps correctly", or `RefererNotAllowedMapError` in the console: the browser key does not list the address the page was opened on.
- "Location lookup unavailable" from the server, or `REQUEST_DENIED` in the logs: the server is using the browser key (no `GOOGLE_MAPS_API_KEY`), or the server key lacks the service.
- App address field shows no suggestions: `/api/mobile/addresses/suggest` answers 503 (server key) or 429 (rate limit).
