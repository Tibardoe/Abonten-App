---
title: Web application documentation
purpose: Product-level documentation of the abontenhub.com web app — navigation, route map, responsive behaviour, authentication, each feature area, accessibility posture and known gaps.
audience: Product, support, QA, engineering
scope: apps/web (end-user site; the API it hosts is covered in architecture/)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Web application documentation

Public help for end users lives at `/help` (source `apps/web/src/content/help/`). This page is the internal product reference.

## Navigation

- **Header** (`Header.tsx`): logo, location chip (`/explore/<location>`), search, profile menu, hamburger → **SideBar** (Create, Messages, Rewards, Finances, Field work when applicable, Settings, sign in/out, legal + help links via `MobileFooter`).
- **Desktop footer** (`DesktopFooter.tsx`): official social links (X, Instagram, TikTok) and Terms / Privacy / Cookies / Security / Help.
- **Mobile nav bar** (`MobileNavBar.tsx`) on small screens; footer moves into the side menu.
- Layout: `(pages)/layout.tsx` wraps every page except the landing group, `/account-restricted`, and `/api/*`.

## Route map (public vs signed-in)

Public (allow-listed in `config/supabase/middleware.ts`): `/`, `/events/**`, `/places/**`, `/explore/**`, `/user/<username>/**`, `/reviews`, `/search/**`, `/auth/**`, `/invite/<code>`, `/unsubscribe/**`, `/legal/**`, `/help/**`, `/account-restricted`, `/.well-known/**`. Everything else redirects to `/auth/signin?next=…`; suspended/banned accounts go to `/account-restricted`.

| Area | Routes |
|---|---|
| Discovery | `/`, `/events`, `/events/[eventCode]`, `/events/location/[location]/…`, `/places/[slug]`, `/explore`, `/explore/[location]`, `/search`, `/search/[title]`, `/around-you` |
| Account | `/auth/signin`, `/settings/{overview,edit-profile,security,language,switch-appearance}`, `/user-account/**` (own), `/user/[username]/{posts,places,reviews,favorites,bookings}` |
| Buying | `/checkout`, `/checkout/[checkoutId]`, `/wallet`, `/transactions`, `/transactions/[kind]/[id]`, `/manage/my-events` (My Tickets) |
| Organizer | `/manage/dashboard`, `/manage/events`, `/manage/events/[eventId]` (`?tab=insights`), `/manage/drafts`, `/finances`, `/finances/{transactions,payouts,payouts/[id],payout-accounts}` |
| Place owner | `/manage/places`, `/manage/places/[placeId]` |
| Messaging | `/messages`, `/messages/[conversationId]` |
| Rewards | `/rewards` (visible when enabled for the user) |
| Field team | `/field/**`, `/consent/field/[token]` (public owner consent) |
| Legal / help | `/legal`, `/legal/{terms,privacy,cookies,security}`, `/help`, `/help/[section]/[slug]`; redirects `/terms`, `/privacy`, `/cookies` |
| Legacy | `/plans`, `/settings/membership` → redirect to settings; `/admin/place-claims` (superseded by the console) |

## Responsive behaviour

Tailwind breakpoints; `md:` switches header/footer vs mobile nav; checkout modal and event upload modal are full-screen on small screens; tables scroll horizontally inside their container (legal/help documents included).

## Authentication and consent

`AuthModal.tsx` (choose → email entry → OTP; phone form; Google). Consent line under the options (`auth.consentNotice`) linking `/legal/terms` and `/legal/privacy`. Profile-completion nudge after first sign-in.

## Feature areas (where the code is)

| Feature | Components / actions |
|---|---|
| Events discovery and detail | `src/events/**`, actions `getFilteredEvents`, `getQueriedEvents`, `getSimilarEvents`, `getNearByEvents` |
| Places | `src/places/**`, actions `getQueriedPlaces`, `getPlaceBySlug`, claims, bookings, reviews |
| Checkout and payments | `CheckoutModal`, `PendingCheckoutsBasket`, `PaymentMethodSelector`, `usePaystackPopup`, actions `validateCheckout`, `createMultiCheckoutPaymentAttempt`, `verifyPaystackPayment`, `retryPaymentFulfillment` |
| Tickets | `manage/my-events/TicketsList.tsx`, `TicketModal.tsx` (PDF), `RetryRefundBtn` |
| Wallet | `src/wallet/**` (`WalletManager`, `AddBankCard`, `AddMomoWallet`) |
| Organizer tools | `EventUploadModal`, `useEventUploadForm`, dashboards under `manage/**`, finance under `(finances)` |
| Messaging | `src/messaging/**` (`ConversationList`, `ChatThread`, `Composer`) |
| Reviews / highlights | `postEventReview`, `postPlaceReview`, `HighlightModal`, `useHighlightUpload` |
| Notifications | `NotificationBell.tsx` |
| Rewards | `src/rewards/**` (`InvitePanel`, `RewardEmailToggle`, `InviteBinder`, `ReferralTouchLogger`) |
| Field team | `src/fieldOps/**`, `(pages)/field/**` |
| Legal / help | `utils/publicContent.ts`, `MarkdownDocument.tsx`, `ContactSupportCard.tsx` |

## Internationalisation

`next-intl`; locales en/fr/es/de/pt/ak from `packages/i18n/messages`; `NEXT_LOCALE` cookie; server renders `en` first and `LocaleProvider` corrects after hydration (accepted flash). Legal and help content is **English only**.

## Accessibility (implemented vs gaps)

Implemented: semantic headings via `typography.tsx`; `aria-label`s on social and legal navs; `role="alert"` on auth errors; keyboard-operable shadcn primitives (Radix); focus-visible styles from the shadcn theme; `aria-current` on the help sidebar.
**Gaps (not solved):** no formal WCAG audit; map views are not keyboard-navigable; some icon-only buttons lack labels; colour-contrast in dark mode not audited; no skip-to-content link; the checkout countdown is not announced to screen readers; the English-first flash for non-English locales. Recorded in `../documentation-audit-matrix.md`.

## Web-only and missing-on-web

Field team tools are web-only. Web has **no** QR scanner (manual list check-in only), no push notifications, no voice notes, no event reminders.
