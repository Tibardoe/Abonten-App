---
title: Cookie Policy
summary: Every cookie the Abonten website sets, what the mobile app stores on your device, which third parties load on our pages, and how to control them.
version: 1.0-draft
effectiveDate: Not yet in force — set when approved
lastUpdated: 2026-09-12
status: Review required
owner: Abonten Hub
audience: Public
legalReviewRequired: yes
---

# Cookie Policy

> **Draft for review.** This policy is an exact inventory of what the website and app store today. Whether a consent banner is required for the attribution and abuse-detection cookies listed below is a question for legal review; none is shown at present.

## 1. What cookies are

Cookies are small text files a website stores in your browser. Abonten uses a small number of **first-party** cookies (set by abontenhub.com itself). We do not use analytics cookies, advertising cookies, or tracking pixels, and no third party sets cookies through our pages except where noted in section 4.

## 2. Cookies set by the Abonten website

| Cookie | Purpose | Category | Lasts | Readable by page scripts? |
|---|---|---|---|---|
| Sign-in session (name begins with `sb-`) | Keeps you signed in and refreshes your session. Set by our authentication provider (Supabase). | Strictly necessary | For the session; refreshed while you use the site | No |
| `country` | Remembers the country detected from your network address (defaults to Ghana) so prices and phone-number formats are right | Strictly necessary | Until you close the browser | Yes |
| `NEXT_LOCALE` | Remembers the language you chose (English, French, Spanish, German, Portuguese or Akan) | Preference | 1 year | Yes |
| `abn_ref` | Records which event, place or invite link brought you here, so a referral or invite can be credited when you buy or sign up. Signed so it cannot be altered. | Attribution (rewards) | 30 days | No |
| `abn_inv` | A simple "an invite code is waiting" flag so the sign-in screen can show it | Attribution (rewards) | 30 days | Yes |
| `abn_did` | A random identifier for this browser, used **only** to detect rewards abuse (for example the same browser being used by the person who shared a link and the person who bought from it). It is not used for advertising or analytics and is not linked to your browsing outside Abonten. | Security / abuse prevention | 1 year | No |

The admin console used by Abonten staff sets one additional cookie (`admin_stepup_at`, 10 minutes) to require staff to re-authenticate before sensitive actions. It is never set for ordinary users.

## 3. Browser storage (not cookies)

The website also uses your browser's local storage for conveniences that never leave your device:

| Key | Purpose |
|---|---|
| `theme` | Light, dark or system appearance |
| `abonten:recent-searches` | Your last eight search terms |
| Inbox preferences (per account) | Which filter and view you last used in Messages |
| Field-programme form draft (session only) | Keeps a half-completed onboarding form if the page reloads |
| Referral logging flag (session only) | Prevents the same referral link being recorded twice in one visit |

## 4. Third parties that load on our pages

| Service | Where it loads | What it may set |
|---|---|---|
| Google Maps | Pages with a map (explore, event and place pages, location pickers) | Google may set its own cookies when its map script loads; see Google's privacy policy |
| Paystack | Only on the "add a bank card" screen in your wallet, and in the payment pop-up when you pay | Paystack's own cookies within its payment window |
| Cloudinary | Images and videos across the site | Serves media; no tracking cookies |

We do not load Google Analytics, Facebook Pixel, or any advertising network.

## 5. The mobile app

The Abonten app does not use cookies. It stores the following securely on your device, in your phone's protected storage:

- your sign-in session;
- a random install identifier used only for rewards-abuse detection (the app equivalent of `abn_did`);
- a pending invite code and referral links you opened, until they are applied;
- the explore location you last chose and your recent searches;
- reminders you set for events, inbox preferences and recently used emoji reactions;
- the push-notification token for this device, which is also registered with Abonten so we can notify you.

All of this is removed when you uninstall the app; the sign-in session and push token are removed when you sign out.

## 6. How to control cookies

- **Sign-in and country cookies** are required; blocking them will sign you out or break checkout.
- **Language** can be changed in Settings › Language; deleting the cookie resets you to English.
- **Attribution cookies** (`abn_ref`, `abn_inv`) can be deleted in your browser at any time; the only effect is that a referral or invite may not be credited.
- **`abn_did`** can be deleted in your browser; a new identifier is issued on your next visit. Deleting it does not affect your account.
- Your browser lets you view, block and delete cookies for any site; see its help pages. Blocking all cookies for abontenhub.com will prevent signing in.

## 7. Changes

We will update this inventory whenever a cookie or storage key is added, changed or removed. The version and last-updated date appear at the top of this page.
