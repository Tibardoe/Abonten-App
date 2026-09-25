---
title: Global platform — markets, money, payments, time and locale
purpose: How Abonten runs in more than one country — the market model and its activation checks, money as integer minor units, providers per market, time zones, phones, addresses, locale, reporting per currency, and the feature flags that roll it out.
audience: Engineers, operations, finance
scope: supabase/migrations/20260924100000..20260925100500, @abonten/core/{money,market,phone,geo,time,units,flags}, @abonten/services/{markets,payments/providers,fx,flags,geo,profile/otpProviders}, Admin › Markets, the markets API, both apps' market context
status: Approved
version: 1.4
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Global platform

Abonten launched in Ghana with Ghana written into the code: cedis in
functions and screens, `+233` in validators, `Africa/Accra` in reminders,
one Paystack account. Since 2026-09-24 a country is **configuration**: a
`market` row with its currency, zone, providers, payment methods, payout
rails, cities, tax and legal state, moved through a state machine that
refuses to go live until its readiness checks pass. Ghana is the first,
default and only live market; every other seeded country is a draft.

Nothing about Ghana changed for people using it: same prices, same
Paystack account and keys, same mobile money, same 4-digit Hubtel codes,
same times. What changed is that none of it is assumed any more.

## 1. The market

| Table | Holds |
|---|---|
| `market` | one row per country: `status` (draft · preparing · ready · live · paused · maintenance), `is_default` (exactly one — Ghana), default and supported currencies, default zone and locales, dial code, distance unit, `otp_provider` (hubtel / twilio / none), `tax_config`, `fee_config` (optional service-fee override), `legal_config` (terms version, support email, legal acknowledgement), fallback centre, `display_config` (`priceScale` — sizes the price filters for the currency), `version` (bumped by every configuration change) |
| `market_payment_provider` | one row per provider **account** for the market: provider, enabled, the **names** of the env variables holding its secret key / webhook secret / public key, settlement currency, accepted currencies, priority, `payouts_enabled`, `options` (provider facts that differ by country — Paystack `channels`, `cardVerificationMinor`, `bankCountry`, `bankRecipientType`; empty = the adapter's documented defaults) |
| `market_payment_method` | what people there pay with (card, mobile_money, bank_transfer, ussd, qr, eft, apple_pay…), on which provider, currencies, platforms, recommended |
| `market_payout_method` | the rails organizers are paid on and the account fields each needs (JSON rules: key, label, required, pattern) |
| `market_region` | cities/regions: discovery fallback centres and, in multi-zone countries, their own zone |
| `market_event` | append-only audit of every transition (from, to, actor, reason) |
| `market_readiness_run` | every readiness report that was run |
| `currency` | ISO 4217 codes the database accepts (FK target of every currency column) |

All of them are service-role only (RLS on, client grants revoked). Clients
read the **public** subset through the markets API (`toPublicMarket`: no
credential names, no legal notes). `@abonten/services/markets/marketConfig`
loads the whole configuration once per process for 60 s.

**State machine** — `market_transition(country, transition, actor, reason,
readiness_ok)` is the only way `status` changes (`@abonten/core/market/transitions`
mirrors it). `prepare` draft→preparing, `mark_ready` preparing→ready,
`activate` ready/paused→live, `pause`, `resume`, `enter_maintenance`,
`exit_maintenance`, `back_to_draft`. `mark_ready`, `activate` and `resume`
refuse unless the caller passes a fresh passing readiness report; the
default market can never be paused or returned to draft. Activation,
pause and resume need `markets.activate` **and** step-up in the console.
Every configuration change (the market row, its providers, methods,
payout rails, cities) bumps `market.version`; the console passes the
version its readiness report ran on (`p_expected_version`), so an edit
made between the check and the click is refused rather than activated
unchecked. Editing a market that is live or in maintenance re-runs
readiness and warns in the save message when a critical item now fails.

**Open vs transacting** — `live` and `maintenance` markets are *open*
(browsable); only `live` transacts: every checkout (tickets, promotions,
Spotlight, credit-only orders), card saving and new listings refuse a
market that is not live (`paymentChoice.ts`, `marketClosedForSales`,
`resolveListingLocation`). Draft, preparing, ready and paused markets'
listings are also hidden from discovery — every discovery function carries
a market-visibility filter next to its moderation filter (migration
`…100300`), since `…111100` written as `x.country_code <> all ((select
public.hidden_listing_countries())::text[])` so the hidden countries are
read once per query — `listing_market_visible()` is a SECURITY DEFINER
call Postgres cannot inline and cost ~5.6 µs a row. Use the array form in
new discovery SQL.

**Day boundaries** (2026-09-25): the organizer dashboard and transaction periods, promo-code expiry and the monthly rebate run count days in UTC — exact for Ghana (UTC+0 all year). Weekly and the recommendation digest already use each market's calendar. Until the four follow the market's zone, readiness has a critical `utc_calendar` check that refuses activation for any zone that is not UTC+0 all year.

**Client-callable helpers** (2026-09-25, `20260925111500`): `default_market_country/currency/timezone()` run as their owner — they are called inside functions organizers run with their own session (the dashboard's sales timeline), and as SECURITY INVOKER they failed on the service-only `market` table. Rule: a function a client can execute must not read a service-only table with the caller's rights (checked by `session-rpc-reachability.integration.test.ts`). Payments already in flight still complete and
refunds still run in any status.

**Readiness** (`@abonten/core/market/readiness`, probes gathered by
`runReadinessAdminCore`) — critical: country + currency + zone valid,
every enabled provider's variables present **and** a live call with them
succeeds, the provider accepts the market currency, at least one payment
method, a payout rail, refunds supported, phone rules, tax acknowledged,
fee rate resolves, an admin can manage it, legal acknowledged.
Advisory: address schema, OTP provider, email, notifications, exchange
rates, monitoring, support contact.

## 2. Money

- **In TypeScript** money is `{ amountMinor: integer, currency }`
  (`@abonten/core/money`). `fromMajor` parses decimal strings exactly; no
  float arithmetic touches an amount; `allocate` splits by largest
  remainder; `percentageBps` rounds half away from zero. Each currency's
  exponent comes from the table (`XOF`/`JPY` 0, `GHS`/`NGN` 2, `KWD` 3).
- **In the database** amounts stay `numeric` major units next to an
  explicit `currency` — nothing defaults to GHS any more (every
  `DEFAULT 'GHS'` and `'GHS'` literal in functions was removed; a sanity
  block in the migration fails the deploy if one comes back). Money
  columns hold **three** decimals (migration `…100000` of 2026-09-25) and
  every ledger, refund, credit and reporting function rounds with the
  row's currency — `currency_minor_units`, `money_round`,
  `minor_to_major`, `major_to_minor`; an unknown code is an error, never
  a silent 2. (Before, a fixed `/ 100` booked a 500-franc XOF commission as
  5.00.) A market may only use a currency the `currency` table holds
  (exponent 0, 2 or 3).
- **Formatting** — `formatMoney(money)` uses Abonten's own sign table
  ("GH₵50.00", "₦25,000.00", "KSh 1,500.00"; "US$25" when a viewer's own
  currency also uses `$`), because Hermes on Android lacks `narrowSymbol`.
  The major-unit helper `formatMoney(currency, amount)` in
  `@abonten/core/formatMoney` wraps it and never throws on a missing code.
- **Listings carry their currency** — `event.currency`, `country_code`,
  `timezone` are NOT NULL, set from the venue's market at creation and
  immutable after it (enforced for direct client writes by
  `guard_listing_market_columns` since 2026-09-25; the service sets zone and
  country with the service role; `create_event` / `create_place` are
  service-only); every `ticket_type.currency` equals its event's
  (trigger). Ghana's rows were backfilled from the default market.
- **Canonical vs display** — prices are shown and charged in the listing's
  own currency. A visitor from elsewhere may additionally see "≈ £12"
  (`convertForDisplay`, flag `currency.display_conversion`, hidden when the
  rate is over 24 h old, refused over 7 days). Rates come hourly from Open
  Exchange Rates (`exchange_rate`, `exchange-rates-refresh` pg_cron →
  `/api/jobs/exchange-rates`) or by hand. **No amount is ever charged,
  settled or reported at an estimated rate.**
- **Orders never mix markets** — a basket spanning two currencies or
  countries is refused (`MixedMarketCheckoutError`); the order's fee and
  tax come from its market (`computeOrderTotals`: discount → fee → tax,
  inclusive or exclusive). Line discounts are worked in minor units
  (`computeLineAmount(…, currency)`); previews and the charge use the same
  fee precedence (`serviceFeeRateFor`: the market's own fee, else the
  platform rate for the currency and country).
- **Reports never add currencies** — `admin_dashboard_kpis`,
  `admin_finance_overview`, `admin_platform_analytics`,
  `admin_rewards_overview`, `content_admin_overview` take `p_currency` and
  return the currencies with activity (the console shows a switcher);
  `get_organizer_sales_timeline` charts one currency (the busiest).

## 3. Payments

`PaymentProvider` (`packages/services/src/payments/providers/types.ts`) is
everything the checkout, finalizer, refunds, payouts and webhook handler
need, in Abonten's terms: capabilities, `supportsMethod`, initialise a
hosted/popup checkout, charge a saved card or mobile money, submit OTP,
verify, refund (full/partial), parse and verify webhooks into normalised
events, list networks/banks, transfer recipient + transfer, probe.

| Adapter | Markets | What it cannot do (reported, never offered) |
|---|---|---|
| Paystack (`paystackProvider.ts` over `paystackApi.ts`) | GH (live), NG, KE, ZA, CI (draft) | — (transfers off per market) |
| Stripe (`stripeProvider.ts`, Checkout Sessions) | GB, US, FR, DE (draft) | saved cards, mobile money, payouts |

- **Variable names are an allowlist** (2026-09-25) — a provider row may
  only name its own provider's variables for that field, suffixed for its
  market (`PAYSTACK_NG_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_EU`
  for a euro market; no suffix only for the default market's account).
  `providerEnvNameProblem` checks it on save and again whenever an account
  is built: the public key's value is sent to buyers, so a free-form name
  could have shipped any server secret to every checkout. The exchange-rate
  app id must be `OPEN_EXCHANGE_RATES_APP_ID[_X]` and its scheduler URL
  this app's own `/api/jobs/exchange-rates`.
- **Routing** — `resolveProviderAccount({countryCode, currency, method})`
  picks the market's enabled account that accepts the currency and runs
  the method, reading credentials from the env variable *names* on its
  row. A missing variable is a configuration error surfaced by readiness,
  never a fallback to another market's keys. Accounts can charge without a
  webhook secret (the admin deployment), but then every webhook for them
  is refused.
- **One attempt, one charge** (2026-09-25) — an attempt records the charge
  it was started for (`metadata.charge_minor`, `charge_currency`) and is
  claimed (our reference written) before the provider is called; asked to
  charge another amount it is retired — cancelled with its reference kept,
  so a late payment on it is refunded — and a fresh attempt starts. A
  reference is never overwritten, only a group's primary carries one, and
  the database allows one open attempt per checkout.
- **Charging** — `initiateChargeForAttempt` (hosted page, popup or direct
  charge; direct references are reused, never re-initiated);
  `finalizePayment` verifies with the same provider/market/currency that
  started it, checks the amount **and currency** to the minor unit, and
  records `provider`, `provider_reference` (renamed from
  `paystack_reference`), `provider_transaction_id`, settlement amount,
  provider fee, tax and `country_code` on the transaction.
- **Webhooks** — `POST /api/payments/webhook/{provider}/{country}` (and the
  legacy `/api/paystack/webhook` for Ghana) verify the signature with that
  market's secret, dedupe on `payment_webhook_event`, and ack only settled
  outcomes (503 lets the provider retry, as before).
- **Payouts in the balance's currency** — `request_organizer_payout` and
  `admin_create_payout` refuse an account in another currency, an amount
  finer than the currency, and (organizer side) a restricted account.
- **Refunds and payouts** — refunds go back through the provider that took
  the money; automated payouts run only when the market provider's
  `payouts_enabled` is on (off everywhere; it replaced
  `PAYSTACK_TRANSFERS_ENABLED`).
- **How a buyer chooses** — with a **saved instrument** (a card token, a
  mobile-money wallet) or with a **method** paid on the provider's own
  page (card, bank transfer, USSD, Apple Pay…). `GET
  /api/mobile/payments/options` / `getCheckoutPaymentOptions` answer for
  one order: the order's market decides the methods
  (`listAvailablePaymentMethods`: enabled on an enabled, configured
  provider, for the currency and platform, that the adapter supports, and
  allowed by any `checkout.<provider>` rollout flag) and each saved entry
  says whether it can pay there. `paymentChoice.ts` checks the same again
  on every attempt; the client's list is never trusted. A saved card is
  charged directly only by the provider **account** that tokenised it
  (cards record `provider` + `countryCode`; older cards are the default
  market's) — elsewhere it goes through the hosted page. A wallet must be a
  number in the order's country. Before 2026-09-25 checkout required a
  saved card or wallet, so a Stripe market (no saved cards) could not take
  payment at all.
- **Money captured after its attempt closed** — a late mobile-money
  approval, a stale payment tab, or a charge for the wrong amount has no
  order to fulfil. `finalizePayment` asks the provider what happened to a
  failed/cancelled attempt; a real capture is recorded once in
  `payment_orphan_capture` (provider + reference) and refunded in full
  through the same account, the buyer is told, and the provider's refund
  confirmation marks it refunded. A failed refund request answers 503 so
  the provider redelivers. Finance › Refunds lists them.
- **Refund confirmations that arrive early** — a provider can confirm a
  refund before `issueRefundCore` has recorded its hold; while the refund
  claim is held the webhook answers 503 so the confirmation is redelivered
  instead of lost.
- **Payouts reversed after completing** — `transfer.reversed` for a
  completed payout calls `record_payout_reversal`: status `reversed`, the
  amount back in the organizer's available balance, once. Switching a
  provider to automated payouts needs `markets.activate`, step-up and an
  adapter that can execute transfers (Stripe cannot).
- **Stripe** — asynchronous methods: a completed session that is not yet
  paid is *pending*, not failed; `checkout.session.completed` with
  `payment_status ≠ paid` is ignored until `async_payment_*` arrives.
  Bancontact is EUR-only; bank transfer (`customer_balance`) is not offered.

## 4. Time

- Every event and place has an IANA `timezone`, looked up from its
  coordinates on the server (`@photostructure/tz-lookup`), and a
  `country_code` from reverse geocoding (Google, cached per ~1 km; zone,
  hint and nearest-region fallbacks).
- Create and edit forms send **wall-clock** times ("2026-10-03T19:30"); the
  service reads them in the venue's zone (`parseEventTimestamp`). An
  explicit instant is still accepted.
- Every screen shows event times on the **venue's clock**
  (`getFormattedEventDate(…, event.timezone)`), with the zone abbreviation
  added only when the viewer's clock differs ("7:30 PM WAT"). Discovery
  RPCs return `timezone`/`country_code` (migration `…100400`).
- Reminders, weekly editions and place visit days compute in the
  subject's zone (`event_reminders_enqueue`, `_search_temporal`, …); emails
  state times in the event's zone. Since 2026-09-25 (migration `…100400`):
  a Weekly edition's week is its area's market week (`weekly_edition_view`,
  and `@abonten/core/weekly/week` takes a zone); the recommendation digest
  goes out at the configured hour of **each person's** clock and counts
  their local day; `place_is_open_now` / `computePlaceOpenStatus` read
  opening hours on the place's zone; the app's "today / this weekend"
  search windows use the browsed area's zone (`searchWhenWindow`).
- The admin console shows every timestamp on one labelled operations
  clock, **UTC** (the clock its date ranges are cut on); a Weekly
  edition's schedule is entered and shown on its area's zone.

## 5. People, phones, addresses, locale

- **Phones** — E.164 everywhere via `libphonenumber-js` (max metadata),
  validated for the country's rules; pickers list every country with the
  open markets first and the visitor's own country pre-selected.
- **OTP** — routed by the number's market (`marketForPhone`: a number in a
  shared calling code whose own territory has no market — +44 7911 … is
  Guernsey, +1 876 … Jamaica — belongs to the code's main country's market);
  no codes for draft or preparing markets; an hourly send ceiling per
  country (5,000 default market, 300 elsewhere) stops SMS pumping.
  Providers: Hubtel (Ghana, 4 digits) or
  Twilio Verify (6 digits); the pending code remembers its provider; the
  code length travels to the client.
- **Home market** — `user_info.country_code`, set from a new phone
  account's number when that market is open, changeable only through the
  service (trigger-guarded since `…100500`), and decides the currency a
  person's credit opens in and which wallet rails apply.
- **Preferences** — display currency for estimates, distance unit, locale:
  Settings › Region & currency on web and app (`/api/mobile/account/locale`).
- **Addresses** — structured `address.details` + `country_code` next to the
  legacy `full_address`; per-country address rules in
  `@abonten/core/geo/addressSchema`.
- **Market context** — `getMarketContextCore` resolves browsing area >
  saved preference > request country > default market, and returns open
  markets, the resolved context, the rate table and the evaluated flags
  (`/api/mobile/markets/context?lat&lng`, web `getMarketContext`). The app
  persists it so an offline cold start still knows the market.

## 6. Credit and reporting

- Each person's Abonten Credit is in **one** currency (their home market's
  at account opening; `credit_account` unique per user). Redemption only
  applies to orders in that currency; system ledger accounts exist per
  currency. Every credit figure on every screen is formatted in the
  account's currency, never assumed.
- Admin money reports are **per currency** — the credit overview and the
  Spotlight campaign overview take `p_currency` and list the currencies
  with activity (a switcher appears when there is more than one); organizer
  sales and finance tiles show other currencies beside, never summed in.

## 7. Feature flags

`feature_flag` rows (Admin › Markets › Feature flags) with rules
`{countries, platforms, cohorts, percent, minAppVersion, allowSubjects}`;
`evaluateFlag` is deterministic (FNV-1a bucket of flag + subject) and fails
closed. `currency.display_conversion` gates the "≈" estimates (nothing
shows until exchange rates are configured). A flag named
`checkout.<provider>` (seeded: `checkout.stripe`) gates that provider's
methods at checkout by country, platform or percentage — present and off
means nobody is offered them; absent means no gate. The seeded
`markets.browse_abroad` was removed on 2026-09-25: nothing read it.

## 7a. Presentation per market

`market.display_config.priceScale` sizes the price filters (display only):
1 is cedi-sized (slider to 999, chips "under 50 / under 200"), 100 suits
naira, 0.1 pounds. The /search URL writes an open upper bound as `any`
(`20-any`) and reads the old cedi slider top `999` as "Any"; a real cap
above it (`0-5000`) is kept. Readiness warns when a market in another
currency still uses scale 1.

## 8. Security rules that carry the model

- Clients never send a currency, price, country or zone that the server
  trusts: the listing's market decides currency and zone; the server
  prices every order; a sent currency is only compared.
- Market and provider tables, rates, flags and `market_transition` are
  service-role only; activation needs `markets.activate` + step-up.
- Provider secrets are never stored — only the names of the variables.
- Webhooks are verified with the receiving market's own secret.

## 9. Opening a country (summary)

The step-by-step runbook is [../admin/markets.md](../admin/markets.md). In
short: counsel and tax sign-off → provider account and variables → payment
methods, payout rails, cities → readiness passes → `mark_ready` →
`activate`. Nothing about an existing market changes when another opens.

## 10. Rolling this out on a live database

Parts 1–6 change the money path under code that is already running, so
`20260924100600` is a **deploy bridge**: it mirrors
`transaction.paystack_reference` ↔ `provider_reference`, fills the new
required columns for rows written the old way (provider, country,
settlement currency; a payment attempt's provider and market; a payout
account's market), and returns `paystack_reference` from the cancellation
function. Order: apply `…100000`–`…100600` → deploy web and admin → check
a Ghana purchase, refund and cancellation → apply `…100700`, which removes
the bridge. For app builds already on phones the mobile API keeps the old
`paystack` field on payment-attempt responses and the old
`/api/mobile/paystack/momo-networks` path. In production the bridge was
removed on 2026-09-25, once both new deployments were serving traffic and
the full integration suite had passed against the post-removal schema; a
live Ghana purchase and refund on the new build is still owed.

## 11. Known limits

- Stripe has no saved cards, mobile money or automated payouts here.
- Paystack transfers remain unverified against live Paystack (decision F2).
- Credit is single-currency per person; a person who moves keeps credit in
  the currency it started in.
- Tax is a configured rate (inclusive or exclusive), not a tax engine.
- Admin day boundaries and console timestamps are UTC for every market
  (labelled).
- Organizer dashboard "today" and day buckets are UTC days: right for UTC+0
  markets, up to a few hours off elsewhere (the numbers are totals, not
  money movements).
- A ticket-level cancellation refunds once every ticket on the order is
  cancelled (existing product rule); there is no partially-refunded
  transaction state.
- Mobile money for field-ops payouts is paid by hand from the CSV; numbers
  are E.164 since 2026-09-25 and exported in the national form.
