---
title: Store listings and review submissions
purpose: What Abonten's App Store and Google Play listings say, where each word, picture and declaration is kept, how the first submission was made, and what still has to happen before the app is public.
audience: Engineers, founder, compliance
scope: App Store Connect app 6812440895 (com.abonten.app); Google Play app com.abonten.app (developer account "Abonten Hub"); apps/mobile/store; the store images outside the repository
status: Approved
version: 1.1
lastReviewed: 2026-10-09
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Store listings and review submissions

## State on 2026-10-09

| Store | Version | State | When it goes public |
|---|---|---|---|
| App Store (iPhone) | 1.0.0 (build 20), main `0bc2b149` | Submitted to App Review on 2026-10-04 at 19:06 UTC. Still "Waiting for Review" five days later: no reviewer has picked it up, and it has not been rejected. A status question was sent to Apple on 2026-10-09 (see "If a store says no") | **Manual release**: after approval it waits in "Pending Developer Release" until someone presses Release |
| Google Play (Android) | 1.0.0 (version code 6), same commit | Sent for review on 2026-10-04. **Approved**: on 2026-10-09 the submission shows "Ready to publish" and Publishing overview holds 11 changes behind the Publish button. The public Play page does not exist yet | **Managed publishing is on**: the app stays unpublished until someone presses Publish |

Neither store publishes the app by itself. That is deliberate: see "Before the app is public" below.

The test builds are a separate matter (`../operations/pilot-testing.md`): Apple approved build 20 for outside TestFlight testers, and the same Android bundle is on Google Play's internal testing track since 2026-10-09.

## Where everything is kept

| What | Where | How it reaches the store |
|---|---|---|
| Name, subtitle, description, keywords, links (Apple) | `apps/mobile/store/apple/listing.en-GB.json` | `asc localizations update`, `asc versions update` |
| Privacy answers (Apple "App Privacy") | `apps/mobile/store/apple/privacy.json` | `asc web privacy plan` / `apply` / `publish` (needs `asc web auth login`) |
| Title, short and full description (Google) | `apps/mobile/store/google-play/listing.en-GB.json` | Play Console › Grow users › Store listings |
| Data safety answers (Google) | `apps/mobile/store/google-play/data-safety.csv` | Play Console › App content › Data safety › Import from CSV |
| Screenshots, Play banner and icon | `Desktop\Abonten-Brand\08-store-listing\` (not in the repository, like the print collateral) | `asc screenshots upload`; Play Console asset library |
| The generator for those images | `Desktop\Abonten-Brand\src\store\` (`panels.cjs`, `render.cjs`, `demo-flyer.cjs`, `video.cjs`) | `node render.cjs`; `node video.cjs` for the video (needs ffmpeg) |
| App Review contact, demo account, notes | App Store Connect (version › App Review Information) and Play Console (App content › Sign in details) | Never in the repository: they contain the review sign-in code |

`asc` is the App Store Connect command-line tool (see `mobile-eas.md`). The Play Console has no equivalent that this project may use: the only service account has read-only access, so Google Play is filled in through the website.

## What the listings say

Both stores carry the same name and description.

- **Name:** Abonten: Events & Tickets. **Apple subtitle:** Nightlife, food & things to do. **Google short description:** Find events and places in Ghana, get tickets, and host your own events.
- **Category:** Apple Entertainment (secondary Lifestyle); Google Events.
- **Price:** free. **Support:** `https://abontenhub.com/help` and support@abontenhub.com. **Privacy policy:** `https://abontenhub.com/legal/privacy`. **Account deletion (Google):** `https://abontenhub.com/help/account/deleting-your-account`.
- **Languages:** English only. The app itself has five languages; store text in the other four should be added when a market that speaks one opens, after a native speaker has read it (decision D3).

Every claim in the description is a thing the app does today. Change the description when a claim stops being true (for example the "Keep 100% of the ticket price" line follows the fee model in PROJECT.md §22).

## The pictures

Six panels for the App Store (1320 × 2868, the 6.9-inch size, which Apple scales down for every smaller iPhone) and eight for Google Play (1440 × 2560), plus Google's 1024 × 500 banner and 512 × 512 icon. Each panel is a headline from the brand's own lines ("What's the move?", "Find it.", "Get in.", "Go.", "This weekend is handled.", "Fill the room.", "Go outside.") over a **real capture of the app**.

How the captures are made:

1. The app runs on the Android emulator, signed in as the review demo account, in Accra.
2. The status bar is put in demo mode (`adb shell am broadcast -a com.android.systemui.demo …`: 9:41, full signal, no notification icons).
3. Each screen is opened by deep link and saved with `adb exec-out screencap -p`, once in the light theme and once in the dark theme, into `08-store-listing/captures/<light|dark>/`.
4. `render.cjs` wipes the status-bar strip, redraws it in each store's style, puts the capture in a plain phone outline and sets the headline in the brand type.

Rules that must hold when the pictures are redone:

- **Only Abonten's own artwork.** The flyers in `apps/web/public/assets/eventFlyers` are other people's real posters, with real faces, club names and phone numbers, and one is not suitable for all ages. They must never appear in a store listing: both stores remove listings that use artwork or likenesses without permission, and Apple requires every screenshot to suit all ages. The panels use the sample events' own flyers and one made-up flyer (`demo-flyer.cjs`).
- **No working ticket code.** The "Go." panel shows a ticket; `render.cjs` replaces the QR code with a made-up one.
- **No map in the App Store set.** The iPhone app draws maps with Apple Maps and the Android app with Google Maps. The captures come from Android, so the two panels that show a map are in the Google Play set only.
- The iPhone pictures are built from Android captures of the same screens, because no iPhone can be run from the development PC. If real iPhone screenshots are wanted, put them in `captures/` with the same file names and render again.
- Google asks whether listing pictures were "created or edited using AI". The answer given is **no label**: Google's test is a new realistic picture made from a prompt, or a real one meaningfully changed. These are real screens laid out by a script with words and flat shapes around them.

**Video.** `08-store-listing/google-play/promo-video-1920x1080.mp4` (40 seconds, built by `video.cjs` from `captures/app-walk.mp4`, a screen recording of the app in use made with `adb shell screenrecord`) shows the app moving through Explore, an event, checkout, tickets and search, with the same headlines and the sonic logo at the end. Google Play takes a video only as a YouTube link (public or unlisted, advertising off, not age-restricted): upload the file to Abonten's YouTube channel and paste the link into Store listings › Video. It is not on the listing yet. The App Store takes only footage recorded on an iPhone, so there is no App Store video.

## Declarations

Answers given to each store, so the next person can see what was said and keep it true.

| Question | Apple | Google |
|---|---|---|
| Age rating | Messaging and chat, user-generated content, social media features and advertising: yes. Alcohol references, mild profanity, mature or suggestive themes: infrequent or mild. Everything else none. Result: 12+ (13+ in Apple's new scale) | "All other app types". Users share content, it is the main content, it can be blocked and reported, chat is moderated. No nudity, violence, drugs. Mild language. Digital goods can be bought. Result: Teen (ESRB), 12+ (IARC), Parental guidance (PEGI) |
| Advertising | Contains advertising (promoted Spotlights) | "Contains ads": yes, for the same reason. Advertising ID: not used (the build has no `AD_ID` permission) |
| Audience | Not made for children | Target age 18 and over |
| Sign-in for reviewers | Demo phone number and fixed code, with notes (`mobile-eas.md` "App Review sign-in") | The same account under "Sign in details" |
| Content rights | Uses third-party content with the rights to it (organizers upload their own flyers under the Terms) | — |
| Export compliance | `ITSAppUsesNonExemptEncryption` false in the build | — |
| Medical device | No | Health features: none |
| Financial features | — | "Rewards, points and other incentives" (Abonten Credit). Not a wallet, lender or bank |
| Government app | — | No |

Minimum age is still an open legal question (B7, `specifications/age-gate.md`). The store answers do not settle it: they say only that the app is not aimed at children.

## Privacy answers

Both stores publish a summary of what the app collects. The two files in `apps/mobile/store` are that summary, taken from the Privacy Policy §2 and §3 and `privacy/data-inventory.md`. **When the Privacy Policy's table of collected data changes, change both files and send them to the stores in the same piece of work** (legal F2).

| Data | Apple category | Google type | Why | Linked to the person | A choice? |
|---|---|---|---|---|---|
| Name | Name | Name | App functionality, account | Yes | Yes |
| Email | Email address | Email address | Sign-in, tickets, messages from Abonten, security | Yes | Yes |
| Phone | Phone number | Phone number | Sign-in, security | Yes | Yes |
| Account id | User ID | User IDs | App functionality, security | Yes | No |
| Bio, username, website | — | Other info | Profile | Yes | Yes |
| Saved payment methods, payout accounts | Payment info | User payment info | Paying and being paid | Yes | Yes |
| Tickets and transactions | Purchase history | Purchase history | App functionality, suggestions, abuse checks | Yes | No |
| Area chosen, country from the network address | Coarse location | Approximate location | Showing what is near, suggestions | Yes | No |
| Device location while the app is open | Precise location | Precise location | Nearby events, place check-in | Yes | Yes |
| Messages | Other user content, Customer support | Other in-app messages | Delivering them | Yes | Yes |
| Photos, videos, voice notes | Photos or videos, Audio | Photos, Videos, Voice or sound recordings | Publishing and sending them | Yes | Yes |
| Verification and claim documents, attachments | — | Files and docs | Verification, messages | Yes | Yes |
| Events, places, reviews, comments, reports | Other user content | Other user-generated content | Publishing them | Yes | Yes |
| Likes, follows, views, sponsored posts seen | Product interaction, Advertising data | App interactions | App functionality, statistics, suggestions, counting promoted posts | Yes | No |
| Searches | Search history | In-app search history | Results; statistics with no person attached | **No** (Apple) | No |
| Crash and error reports, request timings | Crash data, Performance data | Crash logs, Diagnostics | Finding and fixing faults | Yes | No |
| Install id, push token | Device ID | Device or other IDs | Push notices, rewards abuse checks | Yes | No |

Nothing is used to track people across other companies' apps and nothing is sold. Google's form also says: data is encrypted in transit; nothing is "shared" (every outside company is a processor working for Abonten, and an organizer receiving a ticket holder's details follows from the person's own purchase); accounts are made with a phone number or email and a one-time code, or with Google or Apple; an account can be deleted (the link above); there is no separate way to ask for part of the data to be deleted.

## Countries

| Store | Available in | Not available in |
|---|---|---|
| App Store | 147 countries and regions | The 27 EU countries and mainland China |
| Google Play | 151 countries and regions (including "rest of world") | The 27 EU countries |

The app only has listings in Ghana, but people visiting Ghana carry phones registered elsewhere, so it is offered widely. The EU is left out for two reasons: Apple will not distribute there until the account's "trader status" (a public business address, phone and email under the EU Digital Services Act) is declared, and selling to people in the EU brings the EU's own privacy and consumer rules, which the draft legal pages have not been checked against. China needs a local licence number. Add countries in App Store Connect › Pricing and Availability and Play Console › Production › Countries / regions once those are dealt with.

## Before the app is public

Approval does not publish the app. Do these, in order, then release:

1. **Switch Paystack to live keys** (`../finance/paystack-live-cutover.md`). Until then real cards and mobile money are refused and only Paystack's test card "pays".
2. **Remove the sample content.** The eight sample events by "Abonten Events" and the review demo account's ticket; decide what to do with the seven test items hidden on 2026-10-04 (four test places and three test Spotlights, Admin › Moderation, reason "Test content hidden before the App Store and Google Play reviews").
3. **Release.** App Store Connect › the version › Release This Version. Play Console › Publishing overview › Publish changes.
4. **Tell the website the apps exist:** set `ANDROID_APP_LISTED` to true (`packages/core/src/rewards/invite.ts`) and `APP_STORE_LISTINGS.ios` to the App Store link (`packages/core/src/brand/qrLinks.ts`). `/go/app` and the invite page then send phones to the stores (`../operations/marketing-collateral-and-qr-links.md`).
5. Update the reviewer notes in both stores: remove the "test mode" and "sample listings" lines, and rotate the review code (`mobile-eas.md`).

## If a store says no

- **Apple:** the reason arrives in App Store Connect › App Review and by email. `asc status --app 6812440895` shows the state; `asc web review threads --app 6812440895` lists the messages (needs `asc web auth login`). Fix, then `asc review submit --app 6812440895 --version-id <id> --build-id <id> --confirm`. A change to the notes or the listing needs no new build.
- **Google:** the reason arrives by email and in Play Console › Policy status. Fix, then Publishing overview › Send for review.
- **Apple has not started after several days:** ask about the status at `developer.apple.com/contact` › App Review › App Review Status (an email form: app name, the app's Apple ID 6812440895, platform, message). It needs the founder signed in to Apple in the browser; `asc` has no command for it. Apple replies by email to the address of the Apple account and gives a case number. The other page, "Contact the App Review Team", only offers an appeal or a request for a faster review, and Apple expects a reason for the second (an urgent fix or a dated event).

Likely questions and where the answer is:

| Question | Answer |
|---|---|
| "The events say they are samples" | The app has not opened to the public; the notes say so. If Apple insists on real content, release must wait for real organizers. |
| "Promotions are bought outside in-app purchase" (Apple) | The iPhone app does not sell them (`apps/mobile/src/lib/storePolicy.ts`, decision D6). |
| "Promotions must use Google Play billing" (Google) | Not raised so far. Tickets are exempt (real-world events). If Google objects to promotions, switch their sale off in the Android app the way it is on iPhone. |
| "Sign in with Apple did not work" | Supabase › Authentication › Providers › Apple must list `com.abonten.app` as a client ID. |
| "The privacy policy says draft" | True until counsel approves it (`../LEGAL_REVIEW_REQUIRED.md`). The page is public and complete; only its status line says draft. |

## Changing a listing later

```bash
# Apple: text
asc localizations update --version <version-id> --locale en-GB --description @file:description.txt
# Apple: screenshots (replace the whole set)
asc screenshots upload --app 6812440895 --version-id <version-id> --locale en-GB \
  --path "<Abonten-Brand>/08-store-listing/apple/iphone-6.9" --device-type IPHONE_67 --replace --confirm
# Apple: privacy answers
asc web privacy plan --app 6812440895 --file apps/mobile/store/apple/privacy.json
asc web privacy apply --app 6812440895 --file apps/mobile/store/apple/privacy.json --allow-deletes --confirm
asc web privacy publish --app 6812440895 --confirm
# Apple: what is still missing before a submission
asc validate --app 6812440895 --version <version>
```

Google Play is changed in the Play Console. Every change there waits in Publishing overview until it is sent for review.

The internal testing track is the exception. A release there is published at once ("Changes made will be published to Google Play immediately"), is not reviewed, and does not touch the changes waiting in Publishing overview: on 2026-10-09 an internal testing release went live while the 11 approved production changes stayed unpublished. Choosing the track's tester list took effect at once too.

## Android signing

Google re-signs the app with its own key (Play App Signing), so a copy installed from Google Play carries a different signature from one built by EAS. `apps/web/public/.well-known/assetlinks.json` lists both fingerprints (the EAS upload key and Google's signing key) so that `https://abontenhub.com/events/…` links open the app either way. The Android map key is limited by service, not by signature, so maps draw under both.

Related: `mobile-eas.md` (builds, review sign-in), `release-checklist.md`, `../LEGAL_REVIEW_REQUIRED.md` (F2), `../specifications/age-gate.md`.
