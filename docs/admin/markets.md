---
title: Admin — Markets, feature flags and exchange rates
purpose: How to prepare, check, open, pause and maintain a country (market), target a feature flag, and keep display exchange rates fresh.
audience: Operations, finance, engineering
scope: Admin › Markets (Countries, market editor, Feature flags, Exchange rates), the markets.view / markets.manage / markets.activate permissions
status: Approved
version: 1.0
lastReviewed: 2026-09-24
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Admin — Markets

Architecture and rules: [../architecture/global-platform.md](../architecture/global-platform.md).

## Permissions

| Permission | Who has it by default | Allows |
|---|---|---|
| `markets.view` | operations, finance admin, analyst, support admin | reading every market, flag and rate |
| `markets.manage` | operations | editing a market's configuration, providers, methods, payout rails, cities; running readiness; flags; rates |
| `markets.activate` | super admin only | mark ready, activate, pause, resume, maintenance, back to draft — each also needs a fresh identity confirmation (step-up) |

## Statuses

| Status | Visible to people | Takes payments |
|---|---|---|
| draft / preparing / ready | no | no |
| live | yes | yes |
| maintenance | yes (browse) | no |
| paused | no | no |

Ghana is the default market: it can never be paused or returned to draft.

## Open a country — worked example: Nigeria

1. **Decisions first.** Counsel confirms terms, privacy and consumer law
   for Nigeria; an accountant confirms whether VAT (7.5 %) applies to the
   service fee and whether prices are shown inclusive or exclusive. Record
   both in the register. Nothing below replaces that advice.
2. **Provider account.** Open Abonten's Paystack Nigeria business and get
   its live keys. In the web deployment (Vercel project `abonten`) set
   `PAYSTACK_NG_SECRET_KEY`, `PAYSTACK_NG_WEBHOOK_SECRET` and
   `NEXT_PUBLIC_PAYSTACK_NG_PUBLIC_KEY`; in the admin deployment set
   `PAYSTACK_NG_SECRET_KEY` (for refunds). Values never go into the
   console — only the names, which are already on Nigeria's provider row.
3. **Webhook.** In the Paystack NG dashboard set the webhook URL to
   `https://abontenhub.com/api/payments/webhook/paystack/NG`.
4. **Phone codes.** Nigeria uses Twilio Verify: set `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` in the web deployment
   (once, shared by every Twilio market).
5. **Admin › Markets › Nigeria.**
   - Country: check currency NGN, zone Africa/Lagos, locale en-NG, dial
     code +234, text-message codes Twilio Verify.
   - Tax, fees and legal: enter what step 1 decided, tick both
     acknowledgements, set the support email.
   - Payment providers: select paystack, tick Enabled, save.
   - Customer payment methods: enable card (and bank transfer / USSD if
     wanted); mark the recommended one.
   - Organizer payouts: enable bank with its account fields; leave
     Automated off until transfers are tested.
   - Cities: check Lagos and Abuja, add others.
6. **Run readiness checks.** Every critical row must pass — a failing row
   says what is missing. Fix and run again.
7. **Prepare → Mark ready → Activate** with a reason; each is audited. The
   last needs step-up.
8. **Watch.** Admin › Monitoring shows the Paystack probe per market; a
   test purchase in NGN, a refund, and a phone sign-in with a +234 number
   close the launch.

To take it back down: **Pause** (invisible, no payments) or **Enter
maintenance** (browsable, no payments). Existing tickets stay valid.

## Feature flags

Admin › Markets › Feature flags. A flag is off unless enabled; rules narrow
who sees it (countries, platforms, cohorts, a stable percentage, minimum
app version). Raise a percentage in steps (10 → 25 → 100); the same person
stays in or out as it grows.

## Exchange rates

Admin › Markets › Exchange rates. Rates are **display estimates only**.
Provider "Open Exchange Rates" refreshes hourly through the
`exchange-rates-refresh` job once its app id variable is set and the
refresh URL points at `https://abontenhub.com/api/jobs/exchange-rates`;
"Manual" uses the rates entered here. A rate older than a day is not shown;
older than a week is never used.

## Reports in more than one currency

The Rewards and Spotlight overviews show one currency at a time; a
currency switcher appears once a second currency has activity. Money in
different currencies is never added together.
