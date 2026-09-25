---
title: Global platform — markets, money, payments, time and locale
purpose: How Abonten runs in more than one country — the market model and its activation checks, money as integer minor units, providers per market, time zones, phones, addresses, locale, reporting per currency, and the feature flags that roll it out.
audience: Engineers, operations, finance
scope: supabase/migrations/20260924100000..20260924100500, @abonten/core/{money,market,phone,geo,time,units,flags}, @abonten/services/{markets,payments/providers,fx,flags,geo,profile/otpProviders}, Admin › Markets, the markets API, both apps' market context
status: Approved
version: 1.0
lastReviewed: 2026-09-24
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
| `market` | one row per country: `status` (draft · preparing · ready · live · paused · maintenance), `is_default` (exactly one — Ghana), default and supported currencies, default zone and locales, dial code, distance unit, `otp_provider` (hubtel / twilio / none), `tax_config`, `fee_config` (optional service-fee override), `legal_config` (terms version, support email, legal acknowledgement), fallback centre |
| `market_payment_provider` | one row per provider **account** for the market: provider, enabled, the **names** of the env variables holding its secret key / webhook secret / public key, settlement currency, accepted currencies, priority, `payouts_enabled` |
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

**Open vs transacting** — `live` and `maintenance` markets are *open*
(browsable); only `live` transacts. Paused and draft markets are invisible
to clients and every server path refuses to charge in them.

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
  block in the migration fails the deploy if one comes back).
- **Formatting** — `formatMoney(money)` uses Abonten's own sign table
  ("GH₵50.00", "₦25,000.00", "KSh 1,500.00"; "US$25" when a viewer's own
  currency also uses `$`), because Hermes on Android lacks `narrowSymbol`.
  The major-unit helper `formatMoney(currency, amount)` in
  `@abonten/core/formatMoney` wraps it and never throws on a missing code.
- **Listings carry their currency** — `event.currency`, `country_code`,
  `timezone` are NOT NULL, set from the venue's market at creation and
  immutable after it; every `ticket_type.currency` equals its event's
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
  inclusive or exclusive).

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

- **Routing** — `resolveProviderAccount({countryCode, currency, method})`
  picks the market's enabled account that accepts the currency and runs
  the method, reading credentials from the env variable *names* on its
  row. A missing variable is a configuration error surfaced by readiness,
  never a fallback to another market's keys. Accounts can charge without a
  webhook secret (the admin deployment), but then every webhook for them
  is refused.
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
- **Refunds and payouts** — refunds go back through the provider that took
  the money; automated payouts run only when the market provider's
  `payouts_enabled` is on (off everywhere; it replaced
  `PAYSTACK_TRANSFERS_ENABLED`).
- **Methods offered** — `listAvailablePaymentMethods` = enabled methods on
  an enabled, configured provider, for this currency and platform, that the
  adapter supports. The server refuses anything else.

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
- Reminders, digests, weekly editions and place visit days compute in the
  subject's zone (`event_reminders_enqueue`, `_search_temporal`, …); emails
  state times in the event's zone. Admin reports use UTC days for every
  market.

## 5. People, phones, addresses, locale

- **Phones** — E.164 everywhere via `libphonenumber-js` (max metadata),
  validated for the country's rules; pickers list every country with the
  open markets first and the visitor's own country pre-selected.
- **OTP** — routed by the number's market: Hubtel (Ghana, 4 digits) or
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
closed. Seeded switched on but inert until their prerequisite exists:
`currency.display_conversion` (shows nothing until exchange rates are
configured), `checkout.stripe` (no Stripe market is live) and
`markets.browse_abroad` (only Ghana is open). Switch one off here to keep
it off after its prerequisite arrives.

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
`/api/mobile/paystack/momo-networks` path.

## 11. Known limits

- Stripe has no saved cards, mobile money or automated payouts here.
- Paystack transfers remain unverified against live Paystack (decision F2).
- Credit is single-currency per person; a person who moves keeps credit in
  the currency it started in.
- Tax is a configured rate (inclusive or exclusive), not a tax engine.
- Admin day boundaries are UTC for every market.
