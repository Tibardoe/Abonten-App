---
title: Specification — cookie and identifier consent
purpose: Record exactly which cookies and device identifiers exist, what a consent mechanism would have to control, and how it could be built — without deciding whether one is required.
audience: Legal counsel, founder, engineering
scope: apps/web cookies and browser storage; apps/mobile secure-store identifiers; the public Cookie Policy
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — cookie and identifier consent

## 1. The requirement (as a question, not a conclusion)

Ghana's Data Protection Act, 2012 (Act 843) governs the processing of personal data. Whether the identifiers below require prior consent, a notice, or nothing beyond the Cookie Policy is **legal item B4**. This document does not answer that question. It exists so that, once answered, the engineering work is already scoped.

## 2. Exact inventory today

Source of truth: [../privacy/cookies-and-storage-inventory.md](../privacy/cookies-and-storage-inventory.md); public statement: `apps/web/src/content/legal/cookie-policy.md`.

### Web cookies set by Abonten

| Cookie | Set where | Lifetime | Category (proposed) | Personal data? | Would a consent gate apply? |
|---|---|---|---|---|---|
| `sb-<ref>-auth-token` (+ chunks) | Supabase auth library on sign-in | session / refresh | Strictly necessary | Session token | No — required to stay signed in |
| `country` | `apps/web/src/proxy.ts` on every request without it | session | Strictly necessary | Country code only | No — needed for phone-number defaults and currency display |
| `NEXT_LOCALE` | `apps/web/src/proxy.ts` first visit; Settings › Language | 1 year | Preference | Language choice | Typically no (user-requested preference) — **counsel to confirm** |
| `abn_ref` | `apps/web/src/proxy.ts` when a `?ref=` or `/invite/CODE` link is opened; sign-in invite capture | 30 days | Attribution | Signed referral code, not the user's identity | **Open — B4** |
| `abn_inv` | Same trigger | 30 days | Attribution (UI flag) | None ("1") | Same as `abn_ref` |
| `abn_did` | `apps/web/src/proxy.ts` on first visit | 1 year | Abuse detection | Random browser id, linked to accounts that use the same browser | **Open — B4** |

### Admin-console cookies

Supabase session and `admin_stepup_at` (signed step-up token, 10 minutes). Staff-only; strictly necessary; out of scope for a public banner.

### Browser storage (not cookies)

`theme`, recent searches, inbox preferences, the field-ops wizard draft, and a referral-touch dedupe flag. None is sent to the server as an identifier. A consent regime for cookies does not usually extend to purely local preferences, but counsel should confirm for the field-ops wizard draft, which holds a business owner's phone number until submission.

### Mobile app identifiers (no cookies)

| Key | Purpose | Sent to server |
|---|---|---|
| `abonten.installId` | Random install id — native twin of `abn_did`; rewards abuse detection | Yes, as a request header |
| `abonten.pendingInvite`, `abonten.referralTouches` | Invite code / referral touches until sign-in or checkout | Yes, at bind or checkout |
| Expo push token | Push notifications | Yes, on registration |
| Others (location choice, searches, reminders, inbox prefs) | Local preferences | No |

Android's install-referrer read (invite attribution) happens once and is recorded locally.

### Third parties

Google Maps JavaScript on map pages, Paystack inline JavaScript on the add-card screen and the payment pop-up, Cloudinary media delivery, Sentry error reporting (prod only, `sendDefaultPii: false`, no session replay). **No analytics or advertising product is installed** — verified against every `package.json`.

## 3. What is missing today

- No consent banner or preference centre on the web.
- No mechanism to withhold the attribution and abuse-detection cookies before they are set; the proxy sets them on the first matching request.
- No consent record (nothing stores that a visitor accepted or declined anything).
- The mobile app has no equivalent prompt for its install id.

## 4. Design options (for counsel to choose between, then engineering to build)

**Option A — Notice only.** Keep the current behaviour; the Cookie Policy discloses everything. Requires counsel to confirm that the attribution and abuse-detection identifiers need no prior consent under Act 843. No code change.

**Option B — Consent gate for non-essential cookies (web).**
1. Add a first-party consent cookie (proposed name `abn_consent`, value a small signed JSON: version, timestamp, `attribution: true|false`), strictly necessary, 12-month lifetime.
2. In `apps/web/src/proxy.ts`, set `abn_ref`, `abn_inv` and `abn_did` **only when** `abn_consent.attribution` is true. Without consent, referral links still work for the current page load (the code can be carried in the URL to checkout) but are not remembered across visits, and the rewards fraud signal is absent for that browser — Rewards operations must accept weaker fraud detection for those users.
3. A small banner component in the `(pages)` layout with Accept / Decline / Preferences; writing the cookie through a Server Action; re-openable from the footer ("Cookie settings").
4. Record nothing server-side unless counsel requires proof of consent; if required, add a `consent_event` table (anonymous id, choices, version, timestamp) written by the same action.
5. Publish the banner text in the six locales via `packages/i18n`.

**Option C — Option B plus the mobile install id.** Show an in-app notice before generating `abonten.installId`; if declined, the app sends no install header and Rewards treats the device as unknown.

Options B and C change the fraud-detection assumptions of the Rewards programme (still in shadow mode); the Rewards rules would need re-tuning before launch (decision W2).

## 5. Public/internal consistency

Whatever is chosen, the Cookie Policy's table and [../privacy/cookies-and-storage-inventory.md](../privacy/cookies-and-storage-inventory.md) must be updated together, and `npm run check:docs` re-run. The inventory is maintained by hand; there is no automated cookie scan.

## 6. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| Whether prior consent is required for `abn_ref`, `abn_inv`, `abn_did` and the mobile install id | Choose Option A, B or C | Legal B4 |
| Whether `NEXT_LOCALE` counts as a user-requested preference | Confirm | Legal B4 |
| Whether a server-side consent record is required | Confirm | Legal B4 |
| Build the banner (if B or C) | Approve engineering work | Decision S5 |

**Status: not approved. No consent system is to be built until B4 is Decided.**
