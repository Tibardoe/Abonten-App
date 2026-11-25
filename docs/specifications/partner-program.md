---
title: Specification — Abonten Partners (other platforms and sellers sell Abonten tickets)
purpose: Design a partner programme in which travel sites, hotel desks and concierges, tour operators, other apps, ticket agents and media sell Abonten organizers' tickets and earn a share, while organizers keep receiving their full ticket price on Abonten, and list every decision and legal question it needs before anything is built.
audience: Founder, legal counsel, engineering, operations, finance
scope: Who partners are and how they join, partner accounts and tiers, the four selling channels (partner links, an embeddable checkout, a Partner API, selling at a desk with allocations), partner money, organizer controls, abuse and trust, the data model and service sketch, the rollout, decisions PA1–PA22 and legal items Q1–Q8. Not the gate-partner connector (Abonten selling for other platforms' organizers), which is a separate piece of work.
status: Draft
version: 1.0
lastReviewed: 2026-11-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — Abonten Partners

**Design only. Not built, and not to be built** until the founder has recorded decisions PA1–PA22 in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md) and counsel has answered the legal items each phase needs (Q1–Q8 in [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md), section 10 below). Every recommendation in this document is a *recommendation, not approved policy*. Nothing here may be told to a partner as a promise: no launch date, payout date, review time or rate is stated anywhere a partner can read it until the matching decision is Decided.

## In one page

**What it is.** Other businesses sell tickets to events listed on Abonten and earn a share of each sale: travel sites, hotel desks and concierges, tour operators, other apps, ticket agents, bloggers and media. They are called **partners**. Organizers keep running everything on Abonten and keep receiving 100% of the ticket price they set, as today.

**Why.** The founder's direction of 25 November 2026: position Abonten the way Hapniin positions itself with its partner programme, so that "other people still work for us" while organizers keep everything on Abonten.

**How partners sell, in the order to build it:**

1. **Partner links** — a link to any Abonten page with the partner's code. A buyer who arrives through it and buys within the window (recommended 30 days) is the partner's sale.
2. **An embeddable checkout** — a small script on the partner's own website shows an event and its tickets; the buyer pays through Abonten (Abonten's Paystack account), so Abonten holds the money as it does today.
3. **A Partner API** — partners' own systems list events, create a checkout the buyer pays on Abonten, follow the order and are told (by webhook) when it is paid, refunded or cancelled.
4. **Selling at a desk** — a hotel desk or box office sells to walk-in customers: first by sending the buyer a link they pay on their own phone (no cash), later, after counsel, by selling a set number of tickets for **cash** and paying Abonten afterwards. The cash version is the riskiest part of the programme (section 3.4).

**Money.** A partner's share comes from two places: a **base share paid by Abonten out of its own service fee** (recommended: 1% of the ticket price, the same as Abonten's referral reward, capped at 35% of what Abonten keeps from the sale) and, if the organizer chooses, an **extra commission paid by the organizer** on that event (0–30%, charged exactly as the promoter commission is today). Shares are earned when the event settles (48 hours after it ends), paid in **cash** to the partner's payout account, and taken back if the sale is refunded or charged back. Cash waits for live identity checks, the business check and counsel, exactly as promoters' cash does (decisions X30, X31).

**What protects everyone.** Partners are approved by staff, run as team accounts with named members, sell only at Abonten's price, see only the facts of their own orders, cannot sell an event its organizer closed to them, and can be paused or cut off in one step. Every partner payment can be traced to the sale that earned it.

**What must happen first.** The founder's decisions PA1–PA22; counsel on agency and reselling (Q1), consumer protection (Q2), data sharing (Q3), tax on commissions (Q4), the money risk of cash desks (Q5), the partner agreement (Q6), paying partners in cash (Q7) and partner advertising (Q8); the Smile ID contract so identity checks are live (decision L1); real payments (the cutover in [../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)).

**Not this document.** The **gate-partner connector** — Abonten selling tickets for organizers whose gate runs on another platform, starting with Hapniin — is the reverse direction and is being built in a separate pull request (branch `feat/gate-partner-connector-2026-11-25`), with its own documentation. Individuals who share links for a commission stay **promoters** (Part 7 of [tickets-entry-and-teams.md](tickets-entry-and-teams.md)).

## 1. Where this comes from and what exists today

### 1.1 The founder's direction (25 November 2026)

Other platforms and sellers sell Abonten tickets and earn a share, so other people work for Abonten, while organizers keep everything on Abonten. Partners named: travel sites, hotel desks and concierges, tour operators, other apps, ticket agents, bloggers and media.

### 1.2 Hapniin's programme, as the founder described it

Hapniin is a Ghanaian ticketing platform that lets other platforms resell its organizers' tickets. The founder's summary of its partner programme: deep links with a 30-day cookie, an embeddable checkout widget, and a push API where the partner registers a sale it has already taken; keys issued per partner; a revenue share. Its public documentation is at [hapniin.com/partner-docs](https://hapniin.com/partner-docs) and its OpenAPI description at [dash.hapniin.com/partner-api-openapi.json](https://dash.hapniin.com/partner-api-openapi.json). This document states nothing else about Hapniin; where Abonten's design differs (for example, Abonten keeps every online payment on its own Paystack account), the difference is a choice for Abonten, not a claim about Hapniin.

### 1.3 What Abonten already has (verified against code and schema, 2026-11-25)

| Piece | Today | Where |
|---|---|---|
| Referral links | Signed-in sharers' links carry `?ref=CODE`. The website remembers the touch in the signed, httpOnly `abn_ref` cookie (kept 30 days, keyed by event slug, `u` for other pages, `i` for friend invites); the app keeps it in SecureStore; a signed-in visitor's latest touch is also stored server-side (`referral_attribution`). At checkout `stamp_checkout_referral` stamps one referrer on `ticket_checkout.referrer_user_id`, which can't change afterwards. A touch counts for `referral_attribution_window_days` (7 by default, a setting between 1 and 90). | `packages/services/src/rewards/referralCookie.ts`, `apps/web/src/proxy.ts`, `apps/mobile/app/+native-intent.ts`, `supabase/migrations/20260911015208_referral_capture.sql`, [../architecture/rewards-ledger.md](../architecture/rewards-ledger.md) |
| Abonten's referral reward | 1% of the ticket price, capped at 35% of Abonten's net revenue on the sale, paid as Abonten Credit after the event settles; risk-scored; runs in shadow mode until switched on | [../architecture/rewards-ledger.md](../architecture/rewards-ledger.md) (Event referrals) |
| Promoter commission | The organizer offers 1–30% on an event (`event_promoter_commission`), optionally to invited promoters only, each with their own rate (`event_promoter`, X33). The commission is charged to the organizer **at once** as a negative `organizer_ledger_entry` of type `promoter_commission` and given back as `promoter_commission_reversal` on refund, cancellation, rejection or chargeback. The promoter is paid in Abonten Credit today; cash is approved (X30) but waits for identity checks, live payments and counsel. A promoter commission stacks with the 1% referral reward (different payers). | [../architecture/rewards-ledger.md](../architecture/rewards-ledger.md) (Phase 8), `supabase/migrations/20261116230000_invited_promoters.sql`, PROJECT.md §27.9, §75.12 |
| A team's people never earn on its events | `_reward_organizer_linked` refuses the organizer and its active members (X36), except a member an Owner added as a promoter | [../architecture/team-accounts.md](../architecture/team-accounts.md) §4l |
| Team accounts | A team is its own `user_info` row (`account_kind = 'team'`) run by members with roles; one role matrix in `packages/core/src/teams/roles.ts` and `public.team_role_can()`; a payout account only an Owner manages, the first payout to a new account held 48 hours (X6); ID checks for Owners and Finance (X5); team terms (N4); everything service-role only. Ships off. | [../architecture/team-accounts.md](../architecture/team-accounts.md) |
| Identity checks | Government ID and live selfie through Smile ID; `requireVerifiedIdentity`; built, switched off, not yet connected to a live Smile ID account | [../architecture/identity-verification.md](../architecture/identity-verification.md) |
| Business check | `verification_case` for places and for organizer accounts, teams included; the Verified badge | [../architecture/trust-and-verification.md](../architecture/trust-and-verification.md) |
| Service fee and Abonten's revenue | The buyer pays the service fee (5%, `platform_fee_config`) on top; the organizer receives 100% of the ticket price, settled 48 hours after the event. `platform_fee_entry` records per payment `ticket_revenue`, `service_fee`, `processing_cost` (Paystack's charge) and `net_revenue` (fee minus processing cost) | PROJECT.md §22 |
| Payments | Every charge goes through the market's provider account (`resolveProviderAccount`); money-path tables are server-write-only; the server prices every order (`priceOrder`); a market that is not live takes no payments | [../architecture/global-platform.md](../architecture/global-platform.md) §3 |
| Buying | A buyer must be signed in, and paying needs an email ("Add your email to pay") | CLAUDE.md, [../architecture/reviews-and-account-setup.md](../architecture/reviews-and-account-setup.md) |
| Payouts | An organizer requests a payout; staff transfer by hand and record it; automated Paystack transfers exist behind each market's `payouts_enabled`, off (decision F2) | [../finance/settlement-ledger-and-payouts.md](../finance/settlement-ledger-and-payouts.md) |
| Framing | Every web response sends `X-Frame-Options: DENY`, and the per-request Content Security Policy forbids framing; nothing may frame the site today | `apps/web/next.config.ts`, `packages/core/src/security/contentSecurityPolicy.ts` |
| Rate limits | `checkRateLimit(key, limit, windowSeconds)` over `consume_rate_limit`; fails open on a database error by design | `packages/services/src/security/rateLimit.ts` |
| Held seats outside the basket | Pay small small holds seats as `ticket_checkout.status = 'on_plan'`, counted by the capacity rule and invisible to `pending` paths, and issues them through an internal provider (`abonten_plan`) | [../architecture/ticket-plans.md](../architecture/ticket-plans.md) |
| An outbox drained by a scheduled job | `notification_delivery` → `notification-delivery` pg_cron job → `POST /api/notifications/deliver` with a token from a configuration row | [../architecture/rewards-ledger.md](../architecture/rewards-ledger.md) (Push and email) |

What does **not** exist: partner accounts, partner codes, API keys for outside systems, any route an outside seller's system may call (the only outside callers today are providers: Paystack's and Smile ID's webhooks), any page that may be framed, webhooks to outside systems, cash sales, and any ledger of money owed to or by an outside seller.

### 1.4 Related work, not specified here

- **The gate-partner connector** (separate pull request, branch `feat/gate-partner-connector-2026-11-25`): Abonten sells tickets for organizers whose entry runs on another platform, starting with Hapniin. It is the mirror image of this programme. If the founder and Hapniin agree to sell each other's events both ways, Hapniin could also apply as an Abonten partner under this document; nothing here assumes that.
- **Promoters** (Part 7 of [tickets-entry-and-teams.md](tickets-entry-and-teams.md), X30–X37): individuals sharing links for an organizer-paid commission. They stay as they are; section 2.2 says how partners differ.
- **Tickets sold elsewhere** (Part 5, X18–X20): uploading another platform's codes for entry. Unchanged.

## 2. Who partners are and how they join

### 2.1 Kinds of partner

| Kind | Example | Channels it would use |
|---|---|---|
| Travel site or booking app | A site selling holidays to Ghana | Links, embedded checkout, API |
| Hotel desk or concierge | A hotel lobby desk, a guesthouse owner | Links, selling at a desk |
| Tour operator | A city tour company that adds a concert to an itinerary | Links, API, desk |
| Other app | A food-delivery or ride app with a "What's on" tab | API |
| Ticket agent or box office | A shop or kiosk that sells tickets for cash | Desk (with allocations) |
| Media and creators | A listings blog, a radio station, an influencer business | Links, embedded checkout |

### 2.2 Partner or promoter?

| | Promoter (exists, Part 7) | Partner (this document) |
|---|---|---|
| Who | Any person who shares an event | An approved business or organisation (registered media and creators trading as a business included) |
| Account | Their own account | A team account with a partner profile (2.3) |
| Earns on | Events whose organizer offers a promoter commission | Every event open to partners (Abonten's base share), plus the organizer's extra commission where offered |
| Paid by | The organizer | Abonten (base share) and the organizer (extra commission) |
| Paid in | Abonten Credit today; cash later (X30) | Cash, once the cash gate is passed (4.5) |
| Approval | None | Staff approve every partner |

An individual with a following who is not trading as a business stays a promoter (decision PA1).

### 2.3 The partner account

A partner is a **team account with a partner profile** (decision PA2). The team model already gives what a business partner needs: one public name, several people each signing in as themselves with a role, a record of who did what (`team_activity`), a payout account only an Owner manages with a 48-hour hold on a new one (X6), ID checks for Owners and Finance (X5), the business check and team terms (N4). A new `partner` row marks the team as a partner and holds what is particular to partners (code, tier, status, agreement, keys).

- An existing team may apply, for example a hotel whose place is already run as a team. It never earns a partner share on events it organizes or whose organizer it is linked to (the `_reward_organizer_linked` rule); it may earn on events held at its own place, because it is doing the selling.
- A person makes a new team for the partner when they apply, if they have none. Teams ship switched off (`team_program_setting`); the partner programme lets staff open a team for an approved partner whatever the teams audience is, so partners do not wait for teams to open to everyone.
- Every member is 18 or older (K7, already asked when making or joining a team).

### 2.4 Roles inside a partner

The existing roles, plus two new ones. The matrix must change in both places together (`packages/core/src/teams/roles.ts` and `public.team_role_can()`).

| Role | Can | ID check before cash |
|---|---|---|
| Owner | Everything: the agreement, members, the payout account, keys, desk limits | Yes |
| Finance | Earnings, statements, payouts, paying what a desk owes | Yes |
| Manager | Links, the events catalogue, orders (read) | No |
| **Integrations** (new) | API keys, allowed domains, webhooks, the sandbox, call logs | No |
| **Desk seller** (new) | Sell at a desk within the partner's limits; sees only their own desk sales | No (named, 18+; cash desks: decision PA16) |

New capabilities: `partner.links`, `partner.orders.view`, `partner.integrations`, `partner.desk.sell`; payouts reuse `payout.view`, `payout.request`, `payout.manage`.

### 2.5 Joining, step by step

1. A signed-in person opens **Sell Abonten tickets** (a public page explaining the programme, without rates or dates until decided) and applies: business name, kind (2.1), country, website or social pages, how they would sell (links, website, desk), expected volume, a contact.
2. The application is created with the team it belongs to and appears in **Admin › Partners › Applications**.
3. Staff review: the website or premises are real, the business check is started on the team's account (the same case teams use, [../architecture/trust-and-verification.md](../architecture/trust-and-verification.md)), a call if needed. Staff approve with a tier (2.6) or reject with a reason; a rejected applicant may apply again.
4. On approval the partner is **onboarding**: an Owner accepts the current partner agreement in the product (version, person, time and language recorded, as team terms are); Desk partners also sign a written agreement (decision PA21).
5. The partner becomes **active** for its tier's channels. Before the cash gate (4.5) its earnings are recorded in shadow: shown as "what you would have earned", owed to nobody.
6. Before its first cash payout: every Owner and Finance member has a live ID check, the business check is approved, a payout account in the partner's currency is set and past its 48-hour hold.

### 2.6 Tiers (decision PA3)

| Tier | For | Unlocks | Needs before approval |
|---|---|---|---|
| **Link partner** | Media, creators, small travel sites | Partner links and the link builder | Application reviewed; agreement accepted |
| **Connected partner** | Travel sites, apps, tour operators with a website | Links, embedded checkout, Partner API | The above, the business check approved, at least one verified domain |
| **Desk partner** | Hotel desks, concierges, box offices, ticket agents | Everything above, plus selling at a desk (3.4): first without cash, cash allocations only once allowed (PA15) | The above, ID checks of every Owner and Finance member, a signed written agreement |

The base share is the same in every tier at launch (PA5); organizers may set different rates per partner (section 5). Staff move a partner between tiers.

### 2.7 Partner statuses

`applied` → `approved` (onboarding) → `active` ⇄ `paused` (by staff, or automatically: a desk over its limit or late paying, a key leak) → `terminated`. `rejected` ends an application. Only one function moves a partner (`partner_transition()`, service role, audited, like `market_transition()` and `verification_transition()`). A paused partner's links stop crediting, its keys answer 403, its desks cannot sell, its earnings are frozen pending review; orders already paid complete normally for the buyer.

## 3. The selling channels, in build order

### 3.1 Partner links (first)

**Link shapes.** Any Abonten page with the partner's code added: `https://abontenhub.com/events/<code>?ptn=<partner code>`, a place, a city (`/explore/accra?ptn=…`), or the home page. The partner dashboard builds links and QR codes for any listing (reusing the share kit's images, [../architecture/share-kit.md](../architecture/share-kit.md)). Partner codes use the referral-code alphabet (no I, L, O, 0, 1) in their own namespace; staff may approve a readable one. Partner links never carry `?src=` (that tag is reserved for Abonten's own channels, `packages/core/src/social/linkSources.ts`), and pages keep their canonical address, so search engines see one page.

**What is remembered.**

- **Website**: `proxy.ts` keeps the latest partner touch in the existing signed `abn_ref` cookie under a new key (site-wide, not per event), with its time. One cookie, already declared in the Cookie Policy, gains a purpose (legal B4, Q3).
- **App**: `+native-intent.ts` keeps it in SecureStore; the "Get the app" link (`/go/app`) carries it through Google Play's install referrer, read once per install through `apps/mobile/src/lib/installReferrer.ts`.
- **Signed in**: the latest partner touch is also kept server-side (`partner_attribution`, like `referral_attribution`), so a link opened on a laptop counts for a purchase in the app.
- Each touch is logged in `partner_touch` (salted hashes of IP and browser, like `referral_touch`, 90 days) for the partner's click counts and for abuse checks.

**The window.** Recommended 30 days from the touch, for any event open to that partner (PA8); the referral and promoter window stays 7 days. The `abn_ref` cookie already lives 30 days.

**Which seller gets the sale (PA9).** One seller per order, decided once when the checkout opens and never changed:

1. A **code typed at checkout** wins (X34 already decided this for promoter codes; a partner's code may be typed the same way).
2. A **sale made on a partner's own surface** (its embedded checkout, an API checkout, a desk) belongs to that partner, whatever links the buyer opened before.
3. Otherwise the **most recent eligible link touch** wins, partner or promoter, each inside its own window. A touch is skipped, not fatal, when it is not eligible: the partner is not active, the organizer closed the event to partners or blocked this partner, the buyer is a member of the partner or the organizer, or the window has passed. The next most recent touch is then considered.

| Buyer opened… | Credited to | Abonten referral reward (1%) | Promoter commission | Partner share |
|---|---|---|---|---|
| Only a promoter's link | The promoter | Yes (as today) | Yes (as today) | — |
| Only a partner's link | The partner | No | No | Yes |
| A promoter's link, then a partner's | The partner (most recent) | No | No | Yes |
| A partner's link, then a promoter's | The promoter (most recent) | Yes | Yes | No |
| Anything, then bought in a partner's embed | The partner | No | No | Yes |
| A partner's link, then typed a promoter's code at checkout | The promoter | Yes | Yes | No |

A partner-credited order earns no Abonten referral reward (Abonten would pay twice for one sale) and no promoter commission (the organizer would pay twice). `ticket_checkout` carries either a referrer or a partner, never both (a database check).

**What the partner sees.** Clicks (from `partner_touch`), orders, amounts, earnings and refunds per event and per link. Nothing that identifies a buyer who came through a link (6.4).

### 3.2 Embedded checkout (second)

**On the partner's site.** One script and one tag:

```html
<script src="https://abontenhub.com/embed/v1.js" async></script>
<div data-abonten-event="<event code>" data-abonten-key="<publishable key>"></div>
```

The script draws an iframe served by Abonten (a new `/embed/v1/…` route) with the event's picture, date on the venue's clock, venue, ticket types with their notes, the price including the service fee, the refund policy line and a ticket picker. A list mode shows the events open to that partner (a city, a date range, one organizer). The iframe resizes itself and speaks only to its parent through `postMessage` with the origin checked.

**Allowed domains.** The publishable key works only on the partner's verified domains (`partner_domain`; verified by a DNS TXT record or a file at `/.well-known/` on the domain). The embed route answers with `Content-Security-Policy: frame-ancestors <that partner's domains>` and without `X-Frame-Options`; every other route keeps `DENY`. This is a change to `apps/web/next.config.ts` and to the policy builder in `packages/core/src/security/contentSecurityPolicy.ts`, scoped to the embed path and nothing else.

**Paying.** Pressing Continue opens Abonten's own checkout in a new tab or popup (first-party: the buyer signs in with a phone code, adds an email if missing, pays with mobile money or card through the market's Paystack account). A signed, short-lived token carries the partner and the chosen tickets; the checkout re-prices everything on the server. When payment completes, the tab tells the iframe (origin-checked) and the iframe shows "You're in — your tickets are in your Abonten account". Doing payment inside the iframe is not the first version: sign-in with Google is refused inside frames, browsers block third-party cookies in frames, and how Paystack's payment step behaves inside a third-party frame on every phone browser would need testing. A later version may move steps into the frame once tested.

**Money.** Always Abonten's provider account, so Abonten holds the money, the organizer is settled exactly as for any sale, and refunds go back through the same payment. The partner never touches the buyer's money.

**Branding.** The partner may set an accent colour and show "with <partner name>". The Abonten mark, "Sold by Abonten for <organizer>", the total price, the refund line and links to the Terms are always shown and cannot be hidden. No partner styles or scripts run inside the frame. The embed follows the buyer's language (`data-abonten-lang`, else the browser's).

### 3.3 Partner API (third)

**Keys.** Per partner and per environment:

| Key | Used | Kept |
|---|---|---|
| Publishable key (sandbox / live) | In the embed, in public pages | Stored as is; useless off the partner's verified domains |
| Secret key (sandbox / live) | Server to server, `Authorization: Bearer <secret key>` | Shown **once** when made, stored only as a keyed hash with its first characters for recognition; the prefix says sandbox or live |

An Owner or an Integrations member makes and revokes keys; two live secret keys may exist at once so a partner can rotate without downtime; revoking takes effect on the next call. Every call is logged (`partner_api_log`: key, route, status, time; 90 days). Staff can revoke every key of a partner in one step.

**Sandbox (PA18).** Sandbox keys work only on a sandbox host that runs against the Abonten Preview project with Paystack test keys; live keys work only on production. Neither works on the other: the code already refuses live payment keys on any deployment that is not production, and refuses the production database on any deployment that is not production.

**Endpoints (v1).** All under `/api/partners/v1/`, JSON, money as `{ "amount_minor": 10500, "currency": "GHS" }` (minor units, as `@abonten/core/money`), times as ISO 8601 with the event's `timezone` beside them.

| Method and path | What it does |
|---|---|
| `GET /events` | Events open to this partner: published, not hidden or removed, not postponed (`postponed_at`), in a live market, sale open, organizer has not closed it to partners or blocked this partner. Filters: country, city, dates, text (searched through the folded columns, never a raw title match), organizer. A run of shows appears once with its shows (the rule every Abonten list follows). Cursor pages. |
| `GET /events/{id}` | One event: dates, venue, pictures, ticket types (name, note, price, the service fee, sale window, availability as "available / few left / sold out", not exact stock), refund policy, the partner's own share on it, the event's link with the partner's code |
| `POST /checkout-sessions` | Create a checkout for a buyer: event, date or show, ticket types and quantities, optional buyer name / email / phone to pre-fill, the partner's own order reference, return and cancel addresses (on the partner's verified domains). The server prices it with the same rule as Abonten's checkout and holds the tickets for the normal checkout time. Answers the totals, the hold's end, and a **checkout link on Abonten** where the buyer signs in and pays. |
| `GET /checkout-sessions/{id}` | Its state: open, paid (with the order), expired, cancelled |
| `POST /checkout-sessions/{id}/cancel` | Release the held tickets |
| `GET /orders`, `GET /orders/{id}` | The partner's orders: event, tickets and their state (valid, used, cancelled), amounts paid, refunds, the partner's earning and its state |
| `GET /earnings` | Earnings and payouts per currency |

The buyer always pays on Abonten. The API cannot create an order that is paid elsewhere, except through a desk's cash allocation (3.4), which is a separate permission and a separate phase.

**Webhooks.** The partner registers one or more HTTPS addresses (public internet only: private, local and internal addresses are refused when saved and again when sending) and picks events:

| Event | When |
|---|---|
| `order.completed` | Payment confirmed and tickets issued |
| `order.refunded` | A refund was confirmed, for some or all tickets (amounts cumulative; tickets named) |
| `order.cancelled` | Every ticket of the order cancelled (by the buyer, the organizer or staff) |
| `checkout_session.expired` | The hold ended unpaid |
| `event.changed` | The event moved, was postponed, changed venue (the reschedule rules of [../architecture/event-reschedule.md](../architecture/event-reschedule.md)) |
| `event.cancelled` | The organizer cancelled the event |
| `earning.released` / `payout.sent` | The partner's money moved |

Each delivery is signed (`Abonten-Signature`: a timestamp and an HMAC-SHA256 of timestamp and body with the endpoint's secret), carries a unique event id for de-duplication, is delivered at least once and retried with growing gaps for about a day, then marked failed and shown in the dashboard with a "send again" button. An endpoint that keeps failing is switched off and the Integrations members and Owners are told. Deliveries are written to an outbox in the same database transaction as the change (`partner_webhook_delivery`, like `reward_outbox`) and sent by a scheduled job through a cron-only route, the pattern `notification_delivery` already uses; every outbound call has a deadline.

**Repeats are safe.** Every `POST` takes an `Idempotency-Key` header. The first answer is stored (`partner_idempotency`, per partner, 24 hours); the same key with the same request returns the same answer; the same key with a different request is refused (409).

**Limits.** Per key, with `429` and `Retry-After` when exceeded. Starting values to tune, *recommendation, not approved policy*: reading 120 calls a minute; creating checkouts 30 a minute; at most 50 open checkouts holding tickets per partner and 10 tickets per checkout (and the organizer's per-person limits once Part 6 builds them, X21–X22). The limiter for calls that hold tickets must fail **closed**: `checkRateLimit` fails open by design, which is right for a geocoding call and wrong for a call that can hold an event's stock.

**Versions.** The version is in the path (`/v1/`). Fields may be added within a version; anything that could break a partner's code goes into a new version, announced in the dashboard in advance, with the old one kept for a notice period set in the partner agreement (PA18). An OpenAPI description and developer pages are published with the programme, and a CI check keeps them in step with the routes.

**Errors.** A stable code and an English message for developers (`{"error": {"code": "event_not_open_to_partner", "message": "…"}}`). Anything shown to a buyer (the embed, Abonten's checkout pages) is in the buyer's language, as the rest of Abonten.

```mermaid
sequenceDiagram
  participant B as Buyer
  participant P as Partner's system
  participant A as Abonten Partner API
  participant C as Abonten checkout
  participant PS as Paystack (Abonten's account)
  P->>A: POST /checkout-sessions (Idempotency-Key)
  A->>A: Price on the server, hold the tickets, stamp the partner
  A-->>P: totals, hold end, checkout link
  P->>B: "Pay on Abonten" (link or redirect)
  B->>C: Sign in with a phone code, pay
  C->>PS: Charge (mobile money or card)
  PS-->>C: Confirmed (and webhook)
  C->>C: Issue tickets, record the organizer's earning and the partner's pending share
  A-->>P: webhook order.completed (signed)
  C-->>B: Back to the partner's return address; tickets in the buyer's account
```

### 3.4 Selling at a desk, and allocations (fourth)

A hotel desk, box office or tour guide sells to people standing in front of them. Two ways, in this order (PA15):

**(a) Desk sale without cash — first.** The Desk seller picks the event, tickets and quantity on a desk screen (website first, on a phone or tablet), types the buyer's phone number, and Abonten texts the buyer a buy link (the "send a buy link" idea already approved for promoters, X35, with the same limits: one per number per event, a daily cap per seller). The desk can also show a QR code the buyer scans. The buyer signs in on their own phone with a code and pays with their own mobile money or card. The tickets are in the buyer's account; the refund, if any, goes back to the buyer's payment; the desk never holds money; the order is the partner's sale. No new money risk.

**(b) Cash allocation — only after counsel (Q5) and decisions PA15–PA17.** For buyers who pay cash:

1. **Request.** The partner asks the organizer for N tickets of a type for an event. The organizer accepts (perhaps fewer), sets until when the desk may sell (for example until 24 hours before the start), and may end the allocation at any time.
2. **Hold.** The allocated tickets are held from the event's stock as `ticket_checkout` rows in a new status (`allocated`) that the capacity rule counts and every `pending` path ignores, the way Pay small small holds seats with `on_plan`. Unsold tickets return to sale automatically when the allocation ends.
3. **Sell.** The Desk seller sells from the allocation: buyer's phone number (and name if they give it), quantity, cash taken. The tickets are issued at once through an internal provider (`abonten_desk`, reference `ABNDS-<sale>`, like `abonten_plan`) at **Abonten's price** (ticket price plus service fee; no mark-up). They go to the buyer's account if the number has one; otherwise they are held for that number and claimed by signing in with it (as a ticket sent to a number is today), and the desk can print the ticket or text its link. The organizer's earning is recorded as for any sale.
4. **Owe.** Each cash sale adds what the desk owes Abonten: the full price the buyer paid, ticket price plus fee. The desk is paid its share later, like every partner (4.4), not by keeping it from the cash (PA16; netting is a question for counsel, Q5).
5. **Count and pay.** The desk sees today's sales and the cash it should hold. A **statement** is issued every few days and before each event, due within a set number of days; the partner's Finance member pays it by bank transfer or mobile money to Abonten's account (recorded by finance staff with the reference) or through a "Pay statement" checkout on Abonten. Each payment is recorded against the statement (`partner_remittance`).
6. **Limits** (PA16): a cap on what a desk may owe at any time (selling stops when unpaid sales reach it), a cap per sale, the allocation's own size, and a payment deadline. A statement not paid on time pauses the desk automatically, opens an incident (through `open_reconciliation_incident`) and tells the partner's Owners and Finance.
7. **If a desk never pays**, the buyers' tickets stay valid (the buyers did nothing wrong) and the organizer is paid as for any sale; Abonten carries the loss, recovers what it can from the partner's earnings and ends the partnership. The limits must therefore be set to what Abonten can afford to lose.

**The "register a sale you already took" API** (Hapniin's push model, as the founder described it) is the same thing done by a partner's server: `POST /api/partners/v1/allocations/{id}/sales` issues tickets from an allocation for money the partner took itself, and adds what it owes to its statement. It carries every risk of a cash desk and the same limits, and comes in the same phase.

> **Money and e-money risk.** In a cash allocation the partner collects buyers' money for Abonten and pays it over later. That makes Abonten a creditor of every desk, adds cash handling, late and missing payments, and the question whether collecting and holding money for others, or any deposit or prepaid float a desk might be asked to keep, is a payment service or electronic money under the Payment Systems and Services Act, 2019 (Act 987) — the reason a top-up balance was not built (legal M5). Selling tickets upfront to a desk to resell ("prepaid stock") would avoid the debt but makes the desk a reseller (legal N2) and is not recommended for the first version. **No cash allocation, deposit, float or netting is built until counsel has answered Q5.**

**Refunds of cash sales (PA17).** A buyer's own cancellation still goes through `buyerCancelGate` and the event's refund policy, like every buyer cancel path. While the desk's statement is open, the desk hands the cash back and its amount owed goes down. After the statement is paid, Abonten refunds the buyer to a mobile-money number by a manual transfer until automated transfers are switched on (F2). When an organizer cancels or moves an event, the same rules apply to cash buyers as to everyone (the reschedule refund window included).

## 4. Money

### 4.1 Who pays the partner (PA4)

| Part | Paid by | Rule (recommended) | Recorded |
|---|---|---|---|
| **Base share** | Abonten, out of its service fee | 1% of the ticket price (leaving out any part the buyer paid with Abonten Credit), capped at 35% of Abonten's net revenue on that sale (the fee less Paystack's charge); the same terms as Abonten's referral reward, paid in cash instead of credit (PA5) | The partner ledger only; never the organizer's ledger, never the credit ledger |
| **Extra commission** | The organizer, by choice, per event | 0–30% of the ticket price actually charged (after promo codes and group prices), per event, with per-partner rates possible (PA6) | Charged to the organizer at once as a new negative `organizer_ledger_entry` type `partner_commission`, given back as `partner_commission_reversal`: the existing `promoter_commission` pattern, and nothing else in the organizer's ledger. Mirrored by an earning in the partner ledger. |

Rules for both: computed on the tickets' price, never the service fee; Abonten Credit the buyer spent is not counted in the base share (it is already Abonten's cost, as in the rebate basis); nothing on free tickets, complimentary tickets or orders the partner's own people make; nothing in shadow mode is owed or charged.

### 4.2 A worked example

A GH₵100 ticket, bought through a partner's link. The buyer pays GH₵105 (GH₵5 service fee on top). Say Paystack's charge is GH₵2 (an illustration; the real figure is recorded for each payment in `platform_fee_entry.processing_cost`), so Abonten keeps GH₵3.

| | No extra commission | Organizer adds 5% for partners |
|---|---|---|
| Organizer receives | GH₵100 | GH₵95 (GH₵100 − GH₵5 commission) |
| Partner earns | GH₵1.00 (1%; the cap is 35% × GH₵3 = GH₵1.05) | GH₵6.00 (GH₵1.00 + GH₵5.00) |
| Abonten keeps | GH₵2.00 (GH₵3 − GH₵1) | GH₵2.00 |

The base share is small on purpose: it costs organizers nothing and keeps Abonten's own revenue positive on every partner sale. The organizer's commission is what makes a busy partner push one event over another, and the organizer decides it.

### 4.3 What the organizer sees

- On the event's **Partners** card: "Approved partners can sell this event at your price. You still receive 100% of your ticket price: Abonten pays partners from its service fee." With an extra commission: "You pay 5% of the ticket price on each sale a partner makes. It comes off that sale's earnings when it's made and comes back if the sale is refunded."
- In sales lists and the sale notice: "Sold through <partner name>" (and the desk's name for desk sales).
- In Finances, as promoter commissions show today: "Partner commission −GH₵5, pending" and its reversals.
- In Insights: sales by channel (Abonten, promoters, each partner).

### 4.4 When a share is earned

A share is **pending** from the moment the order is paid, and **released** when the event settles (48 hours after it ends, `_event_settles_at`), in proportion to the order's tickets still valid then, exactly as referral rewards are released. A refunded, cancelled or removed sale voids it; a disputed one is held. Released shares are added up on a **monthly statement** for the partner (after the month in which the events settled, like the monthly rebate run).

### 4.5 How partners are paid (PA13) — the cash gate

Partners are paid in **cash** to the team's payout account, in the currency they earned, when their Owner or Finance member asks for a payout above the minimum (decision F3), by the same manual transfer staff make for organizers today until automated transfers are switched on (F2). Abonten Credit is not offered to partners (they are businesses with no use for it).

No partner is paid any cash until all of these hold (the **cash gate**):

1. Identity checks are live (the Smile ID contract and environment variables, decision L1) and every Owner and Finance member of the partner has passed one (X5, X31).
2. The partner's business check is approved.
3. Real payments are live ([../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)).
4. Counsel has answered Q4 (tax on commissions) and Q7 (paying partners in cash), and Q6 (the agreement) is approved.
5. The payout account is past its 48-hour hold (X6).

Until then the programme runs in **shadow**: links, embeds and API orders work, every share is calculated and shown to the partner as "estimated, not yet payable", no organizer commission is charged, and nothing is owed. Partners are told this plainly before they start.

### 4.6 Refunds, cancellations and chargebacks

- Before release: the share is voided in proportion to the cancelled tickets; the organizer's commission is given back (`partner_commission_reversal`).
- After release but before payout: a reversal entry lowers the partner's balance.
- After payout: the balance goes negative and is recovered from the partner's next earnings (the rule decided for promoters, X37). A balance negative for more than 60 days pauses the partner and staff follow up (PA14).
- A chargeback is treated like a refund, whenever it arrives.
- Refunds always follow the payment (the existing rule): the buyer's money goes back through the payment that took it, never through the partner.

### 4.7 Currencies and markets (PA20)

Every share is in the currency of the event it was earned on; a partner's balances, statements and payouts are per currency and never added together; a payout goes to an account in the balance's currency (the rule `request_organizer_payout` already applies). In the first version a partner sells only events in its own market (Ghana today), and its payout rail is that market's. Amounts are integers in minor units in code and rounded with the currency in SQL (`money_round`, `minor_to_major`), never `/ 100`.

### 4.8 What goes in which ledger

| Ledger | Gets | Never gets |
|---|---|---|
| `organizer_ledger_entry` | The organizer's own earnings as today, plus `partner_commission` / `partner_commission_reversal` when the organizer funds an extra commission | The base share, anything a desk owes, any partner payout |
| New `partner_ledger_entry` (append-only, per currency) | Earnings (pending, released, voided, reversed), payouts and their reversals, staff adjustments; for desks, amounts owed, payments received and cash refunds | Organizer money; Abonten Credit |
| Credit ledger (`credit_*`) | Nothing from this programme | — |
| `platform_fee_entry` | Unchanged | Partner shares (Admin › Finance shows the base share as a cost line read from the partner ledger) |

## 5. Organizer controls

| Control | Default (recommended, PA7) | Who in a team may change it |
|---|---|---|
| Let approved partners sell this event online (links, embed, API) | **On** for published paid events: it costs the organizer nothing and the price is the same | Owner, Finance, Manager |
| Extra commission for partners on this event | 0% (off); 0–30% | Owner, Finance (it is the organizer's money, as for promoter commission) |
| A different rate, or no sales, for one partner | — | Owner, Finance |
| Cap the tickets one partner may sell on this event | None | Owner, Finance, Manager |
| Block a partner on all my events | — | Owner, Finance, Manager |
| Pause partner sales on this event | — | Owner, Finance, Manager |
| Accept, resize or end a desk allocation | Off; every allocation needs the organizer's yes | Owner, Finance |

Rules: closing an event or blocking a partner stops new partner sales at once and is never shown to buyers; orders already paid stand. The organizer can see which partners sold their events and how much, but not partners' other business. When the programme first opens, every organizer is told once that approved partners can now sell their events and how to switch it off. The defaults follow the pattern the founder approved for sending tickets (X1) and for promoters (X33): on, with the organizer able to switch it off. The alternative, opt-in per event, is safer for organizers' trust but leaves partners with little to sell at launch (PA7).

## 6. Abuse and trust

### 6.1 Fake partners and self-dealing

- Every partner is approved by staff; cash needs the business check and ID checks (4.5); earnings are released only after the event, so a fraud has to survive the event and the refund window first.
- A partner earns nothing on orders made by its own members, or paid with a card, mobile-money wallet, phone, email or device linked to them (the blocking checks of the referral risk score, applied to every partner member).
- Patterns that hold an earning for review (Admin › Partners › Earnings review): one partner making most of an event's sales, many orders from new accounts, a high refund rate, bursts of orders right after the partner's own visits. Weights follow `riskScore.ts`.
- A large first payout, or a payout after unusual activity, waits for staff review, as payouts with a high credit share do today.

### 6.2 Scalping and holding stock

- Partners sell **to** buyers; they never buy to resell. Prepaid stock is not offered (3.4).
- API checkouts hold tickets only for the normal checkout time; caps on open checkouts and tickets per checkout (3.3) stop a partner holding an event's stock; the limiter fails closed.
- The organizer's per-person limits, when Part 6 builds them (X21, X22), apply to partner orders like any other.
- Allocations are only what the organizer gave and return to sale when they end.

### 6.3 Price parity (PA10)

Partners sell at Abonten's price: the ticket price plus the service fee, shown as Abonten shows it. They may not add their own booking fee to an Abonten ticket, advertise a lower price, or sell above it at a desk. A partner-only discount exists only as a promo code the organizer creates for that partner. The agreement says so; a buyer can report a partner (a new subject kind in the existing `report` flow); staff can pause the partner.

### 6.4 What buyer data a partner sees (PA12)

| Channel | The partner sees | The partner never sees |
|---|---|---|
| Links | Counts: clicks, orders, amounts, refunds, per event and link | Who bought |
| Embedded checkout | Order facts for orders made in its embed (event, ticket types, quantities, amounts, status) and an order reference | The buyer's name, email, phone or account, unless a later decision adds a buyer's explicit choice to share them |
| API | Order facts, its own order reference, and the buyer details **it sent** when it created the checkout | Anything about the buyer it did not send; the buyer's Abonten account |
| Desk | What the Desk seller typed for its own sales | Other desks' sales (a Desk seller sees only their own) |
| Every channel | — | The event's attendee list, other partners' sales, the organizer's figures |

Abonten keeps the buyer's own account, tickets and contact details as for every purchase; the buyer is told at checkout which partner sold the ticket ("Bought through <partner name>").

### 6.5 Revoking keys, pausing and ending

- A partner's Owner or Integrations member revokes a key in the dashboard; it stops working on the next call.
- Staff can revoke every key, pause or terminate a partner (step-up, a reason, audited). A paused partner: links stop crediting, keys answer 403, the embed falls back to a plain "Get tickets on Abonten" link, desks cannot sell, earnings freeze. Termination also ends allocations (unsold tickets return) and leaves a final statement.
- A key seen in public (a code repository, a page source for a secret key) is revoked at once and the partner told.

### 6.6 Audit

Partner-side actions go to `team_activity` (the member who did it) and `partner_event` (append-only: status changes, agreement acceptances, keys made and revoked, domains, webhook changes, allocations, statements). Staff actions go to `admin_audit_log`. Every API call is in `partner_api_log` for 90 days.

### 6.7 Staff tools: Admin › Partners

| Screen | What staff do | Permission |
|---|---|---|
| Overview | Sales through partners per currency, base-share cost, organizer commissions, refunds, overdue desk statements, failing webhooks | `partners.view` |
| Applications | Review, approve with a tier, reject with a reason | `partners.review` |
| A partner | Profile, tier, status (pause, resume, terminate), members, agreement version, business and ID check state, keys (prefix, environment, last used, revoke), domains, webhooks and recent deliveries, orders, earnings, payouts, allocations and statements, risk flags, timeline, notes | `partners.view`; changes `partners.manage` with step-up |
| Earnings review | Release or void held earnings | `partners.finance` with step-up |
| Payouts and statements | Record a payout, record a desk's payment, adjust (with a second admin above a threshold, like credit adjustments) | `partners.finance` with step-up |
| Settings | Programme switches, audience, rates, window, limits, agreement version | `partners.configure` with step-up |

## 7. Technical sketch (for review, not approved)

### 7.1 New tables

All service-role only: RLS on, no client grants, written only through `partner_*` functions and `@abonten/services/partners`.

| Table | Holds |
|---|---|
| `partner_program_setting` | One row: enabled, audience (`staff` → `beta` → `all`), a switch per channel, shadow mode, base rate and net cap, attribution window, limits, agreement version |
| `partner` | One per partner team: account (the team's `user_info.id`), code, display name, kind, tier, status, home country, risk level, timestamps |
| `partner_event` | Append-only history of a partner |
| `partner_application` | Form answers, reviewer, decision, reason |
| `partner_agreement_acceptance` | Who accepted which version, when, in which language |
| `partner_key` | Environment, kind, prefix, keyed hash, created by, last used, revoked at and by |
| `partner_domain` | Origin, verification method and time |
| `partner_webhook_endpoint` / `partner_webhook_delivery` | Addresses, chosen events, a signing secret kept in Vault; the outbox with attempts and outcomes |
| `partner_idempotency`, `partner_api_log` | Stored answers (24 hours); call log (90 days) |
| `partner_touch`, `partner_attribution` | Link touches (salted hashes, 90 days); a signed-in visitor's latest touch |
| `event_partner_setting`, `event_partner_rule`, `organizer_partner_block` | Per event: open or closed, extra commission; per event and partner: allowed, rate, cap; per organizer: blocked partners |
| `partner_earning` | One per paid checkout credited to a partner: base and commission amounts, basis, status, idempotency key, shadow flag |
| `partner_ledger_entry` | Append-only money owed to and by the partner, per currency |
| `partner_payout` | Payouts to partners (separate from organizer `payout`, whose triggers and reviews are organizer-specific) |
| `partner_allocation`, `partner_desk_sale`, `partner_statement`, `partner_remittance` | Desk allocations, cash sales, statements and the payments against them (cash phase only) |

### 7.2 Changes to what exists

- `ticket_checkout`: `partner_id`, `partner_channel` (`link`, `embed`, `api`, `desk`), `partner_reference`; server-stamped, immutable once set; a check that `referrer_user_id` and `partner_id` are never both set; new status `allocated` (cash phase).
- `stamp_checkout_referral` and `stampCheckoutReferralCore` (or a sibling that decides first): one decision under one lock picks the seller by the rule in 3.1.
- `organizer_ledger_entry`: types `partner_commission` and `partner_commission_reversal`, and the organizer balance and payout functions taught them, as was done for the promoter types (`get_organizer_finance_overview`, `get_organizer_pending_earnings`, `request_organizer_payout`, `admin_create_payout`, `get_organizer_ledger_transactions`).
- `issue_tickets_for_checkout`: issues `allocated` rows only for the desk provider's own sale (cash phase), as it does `on_plan` rows only for `abonten_plan`.
- `report`: a `partner` subject kind.
- Team roles: the two new roles and four capabilities, in both places.
- Web: the embed route's own framing headers (only that path); `proxy.ts` remembers `?ptn=`.
- App: `+native-intent.ts` and the install-referrer reader remember `ptn`.

### 7.3 Services

Business logic lives in `@abonten/services/partners/*`, in the house shape `(supabase, context, input) => { status, message?, data? }`. API calls get a `PartnerContext` (partner, environment, key, scopes) resolved by `authenticatePartnerKey`, the way admin calls get an `AdminContext`; partner members on the website get the acting team through `resolveActingAccount`; organizer controls go through `resolveActingAccount` with the right capability.

| Module | Does |
|---|---|
| `programme` | Settings, audience, kill switch |
| `applications`, `accounts` | Apply, review, tiers, `partner_transition()` |
| `keys`, `domains` | Make, hash, check, revoke keys; verify domains |
| `attribution` | Touches, the seller decision at checkout |
| `catalog` | The events a partner may sell (read model obeying every listing rule in 7.5) |
| `checkoutSessions`, `orders` | API and embed checkouts through the existing checkout services; order status |
| `webhooks` | Outbox, signing, delivery, replay |
| `earnings` | Evaluate on a paid checkout, release at settlement, void, reverse (mostly `partner_*` SQL functions, like the reward engine) |
| `payouts`, `statements`, `desk` | Payouts; desk sales, allocations, statements, payments received |
| `organizerControls` | The event and organizer settings of section 5 |
| `admin/partners/*` | The console's cores (`AdminContext`, permission re-checked) |

### 7.4 Transports and screens

- **Partner API**: route handlers under `/api/partners/v1/` in the web app (not `/api/mobile`; the app never calls it).
- **Embed**: `/embed/v1.js` (a versioned, cached file) and the `/embed/v1/…` pages.
- **Partner dashboard**: website pages for partner members (Overview, Links, Events, Orders, Earnings and payouts, Statements, Integrations, Team, Agreement) through thin Server Actions; the desk screen on the website first; app screens later if desks ask.
- **Organizer controls**: the event's Promotion tab on the website (beside the promoter commission card) and the app's event insights, with matching `/api/mobile/organizer/events/{id}/partners` routes (the no-logic-fork rule, `npm run check:api-parity`).
- **Admin console**: Admin › Partners (6.7).
- **Public pages**: "Sell Abonten tickets" and the developer pages, plus help pages `partners/*` built with `listed: no` until the programme opens to everyone.

### 7.5 Rules every partner path must keep

- Sell nothing for an event that is postponed (`postponed_at`), cancelled, hidden or removed, not published, in a market that is not live, or outside its sale window (`event_session_sales_close_at`).
- Price every order on the server with `priceOrder`; never take a price, currency or fee from a partner.
- Write money-path tables only from the service with the service-role client.
- Show a run of shows once in every list; search through the folded columns.
- Every buyer cancel path goes through `buyerCancelGate`.
- Format money with `formatMoney`, dates with the event's zone, words in the reader's language; API codes are stable English.
- Pass `?? null`, never `undefined`, for optional RPC arguments.
- Pay small small, passes, open-amount tickets, complimentary tickets and free registrations are not sold through partners in the first version.

### 7.6 Notices

| To | When | How |
|---|---|---|
| Partner Owners | Application approved or rejected; agreement changed (accept again); partner paused or ended | In-app, push, email |
| Owners and Integrations | Key made or revoked; a key found in public; a webhook address switched off | In-app, email |
| Owners and Finance | Statement ready; payout sent or failed; desk statement due, late, desk paused | In-app, push, email |
| Owners and Managers | An organizer closed an event or set a new commission; an allocation requested back, accepted, ending | In-app, push |
| Organizers | Once when the programme opens; a partner's first sale on an event; sale notices say "through <partner>"; an allocation request | In-app, push (existing `ticket_sold` notice carries the partner) |
| Buyers | The ticket email and ticket screen say "Bought through <partner name>"; desk buyers get a text with their ticket link | Existing channels |
| Staff | New application; earnings held for review; desk statement late; abnormal activity | Admin queues, incidents |

Every notice is in the recipient's own language (`user_info.locale`); notices to a team are copied to members by role as today.

### 7.7 Analytics

- **Partner**: clicks, orders, conversion, sales and earnings per currency, refund rate, top events, API calls and errors, webhook success.
- **Organizer**: sales by channel per event, partner commission paid.
- **Abonten**: share of sales through partners, base-share cost against the extra revenue, how many partner buyers are new to Abonten (the real test of "other people working for us"), per-partner risk, all per currency.

### 7.8 Switches

`partner_program_setting` (off, audience `staff`, shadow on) plus a deploy-level `PARTNERS_KILL_SWITCH` on web and admin, the way every recent programme ships (X43). The kill switch stops new touches from counting, new checkouts, new keys and desk sales; paid orders, refunds and payouts of earnings already released keep working.

## 8. Phased rollout

Sizes are rough and for planning only, compared with work already built; none may be quoted to a partner.

| Phase | What | Needs from the founder | Needs from counsel and outside | Rough size |
|---|---|---|---|---|
| 0. Foundations | Partner accounts on teams, the two roles, applications and staff review, agreement acceptance, Admin › Partners basics, organizer controls (open/close, block), the partner ledger, switches | PA1, PA2, PA3, PA7, PA19, PA21, PA22 | A draft partner agreement for the pilot (Q6); the organizer-terms clause (Q1) | Medium: about team accounts' first two stages |
| 1. Partner links | `?ptn=`, the cookie key, app and install referrer, touches, the seller rule at checkout, earnings in shadow, partner dashboard, organizer channel figures | PA4, PA5, PA6, PA8, PA9, PA10, PA12, PA14 | B4 and Q3 (the cookie and touch log) | Medium: about event referrals and invited promoters together |
| 2. Embedded checkout | Script, iframe, domains, framing headers for one path, checkout in a new tab, branding | PA11 | Q2 (what must be shown on a partner's page) | Medium |
| 3. Partner API | Keys, sandbox host, catalogue, checkout sessions, orders, webhooks, idempotency, limits, OpenAPI and developer pages | PA18 | Q3 (a data-sharing agreement for API partners) | Large: about Pay small small (a new money path with its own jobs and API) |
| 4. Desk sales without cash | Desk screen, buy links by text, QR, desk figures | PA15 (first half) | — | Small to medium |
| Cash gate (before any partner is paid) | Partner payouts, statements, minimum, staff review | PA13 | L1 (Smile ID live), live payments, Q4, Q6, Q7 | Small to medium (reuses the payout pattern) |
| 5. Cash allocations and "register a sale you took" | Allocations, `allocated` holds, desk cash sales, statements, payments received, limits, automatic pause, cash refunds | PA15 (second half), PA16, PA17 | **Q5 Decided**; F2 helps cash refunds | Large, and the riskiest |

Recommended order of opening (PA19): Phase 0 and Phase 1 for staff; three to five pilot partners in Accra chosen by the founder (for example a hotel desk, a tour operator and a listings site) in shadow; then the cash gate; then each further phase for the pilot partners before anyone else. Each phase changes the database through a migration applied to Preview then Production, and gets its architecture doc, handbook, help pages and tests when built.

## 9. Founder decisions

The register's existing P1–P4 are the field programme's, so this programme's decisions are numbered **PA1–PA22**. Each recommendation is *a recommendation, not approved policy*.

| # | Decision | Recommended answer | Why |
|---|---|---|---|
| PA1 | Name, and who may be a partner | "Abonten Partners"; businesses and organisations, including registered media and creators trading as a business; individuals stay promoters | Keeps one programme for individuals (promoters) and one for businesses, with checks that fit each |
| PA2 | What a partner account is | A team account with a partner profile; an existing team may apply; no share on events it or its members organize; it may earn on events at its own place; staff can open a team for an approved partner whatever the teams audience | Reuses members, roles, activity, payout account, ID and business checks already built |
| PA3 | Tiers | Link, Connected, Desk, as in 2.6; staff set and change the tier | Each channel's risk gets its own checks |
| PA4 | Who pays partners | Both: Abonten's base share from its fee, plus an optional organizer commission per event | Organizers keep 100% unless they choose to pay more |
| PA5 | Abonten's base share | 1% of the ticket price (leaving out any part paid with Abonten Credit), capped at 35% of Abonten's net revenue on the sale; the same for every tier; reviewed after three months of live data | The terms already approved for referral rewards; never makes a partner sale a loss for Abonten |
| PA6 | The organizer's extra commission | 0–30% per event, off by default, per-partner rates allowed, charged like the promoter commission | Same bounds and mechanism organizers already know |
| PA7 | Are events open to partners by default? | Yes for online channels, at Abonten's cost; organizers can close any event or block any partner; extra commission and desk allocations are opt-in only | Partners need something to sell; same pattern as X1 and X33 |
| PA8 | How long a partner link counts | 30 days, site-wide (any event open to the partner), the most recent touch; promoter and referral links stay 7 days | Common in partner programmes, and what the founder noted Hapniin uses |
| PA9 | Who gets the sale | One seller per order: a typed code, then a sale on the partner's own surface, then the most recent eligible link; no Abonten referral reward or promoter commission on a partner's order | Abonten and organizers never pay twice for one sale |
| PA10 | Price parity | Abonten's price only; no partner fee on top; no lower advertised price; partner discounts only as organizer promo codes | Consumer trust and the face-value rule already chosen for resale (X26, X28) |
| PA11 | Do partner buyers need an Abonten account? | Yes: they sign in on Abonten's checkout with a phone code; desk cash buyers get tickets held for their number; no guest checkout in the first version | Tickets, refunds and entry all rest on the buyer's account today |
| PA12 | What data partners see | Order facts only; buyer details only those the partner itself supplied; nothing about link buyers beyond counts; never attendee lists | Least data; avoids making partners controllers of Abonten buyers' data (Q3) |
| PA13 | How and when partners are paid | Cash, from a balance released when each event settles, a monthly statement, payout on request above the minimum (F3), manual until F2; no credit; shadow until the cash gate (4.5) | Same timing as organizers and rebates; no money before identity, live payments and counsel |
| PA14 | Taking money back | Void or reverse before payout; after payout recover from the next earnings (X37); pause a partner negative for over 60 days | The rule already chosen for promoters |
| PA15 | Desk selling: which model, in which order | First, desk sales the buyer pays on their own phone (no cash); cash allocations only after Q5, for Desk partners; no prepaid stock | The no-cash version carries no new money risk |
| PA16 | Cash desk limits, and who bears an unpaid desk | Abonten bears it (organizers are always paid, buyers keep their tickets); limits: what a desk may owe starts small (for example GH₵2,000), statements due within 3 days and before the event, selling stops at the limit or when late; Desk sellers handling cash named and ID-checked | Limits set to what Abonten can afford to lose |
| PA17 | Refunds of cash sales | The desk refunds cash while its statement is open; after that Abonten refunds to the buyer's mobile money (manual until F2); the event's refund policy and `buyerCancelGate` apply as for everyone | A cash buyer gets the same rights as any buyer |
| PA18 | API sandbox and versions | A sandbox on the Preview project with test payments; versions in the path; breaking changes only in a new version with a notice period written into the agreement | Partners can build safely; no timing promised now |
| PA19 | Rollout | Ships off (staff, shadow, kill switch); three to five pilot partners in Accra chosen by the founder; links first | The pattern of every recent programme (X43) |
| PA20 | Markets and currencies | A partner sells events in its own market only in the first version; balances and payouts per currency | Payout rails and tax are per market |
| PA21 | How partners accept the agreement | An Owner accepts each version in the product (recorded as team terms are); Desk partners also sign a written agreement | Cash desks carry more obligations |
| PA22 | Do partners pay anything to join or use the API? | No | The programme exists to bring sellers in |

## 10. Questions for counsel

Added to [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) as section Q. Related existing items: B4 (cookies), E1 (payment licensing), E3 (tax), E7 (inducements), M5 (stored value), N2 (reselling), N3 (promoters), N5 (ID checks).

| # | Question |
|---|---|
| Q1 | **Agency and reselling.** Abonten sells tickets for organizers. May it appoint partners to sell them too, and as what (sub-agents, introducers)? Who is the seller to the buyer on a partner's page, in an embed, through the API and at a desk? Do the organizer terms need a clause allowing it, and is it enough for events to be open to partners by default (PA7)? Is a partner "reselling" in the sense of N2? |
| Q2 | **Consumer protection on partner sales.** What a buyer must be shown on a partner's page, in the embed, in the API's checkout and at a desk (who sells, the total with the service fee, the refund policy (E10), the Terms); whether the price-parity and no-partner-fee rules are enforceable; receipts for cash sales (C2); cash refunds. |
| Q3 | **Data sharing with partners.** Under the Data Protection Act, 2012 (Act 843): is a partner a controller or a processor of the buyer details it sends through the API, and of the order facts Abonten returns; the agreement needed; partners outside Ghana (B2); the partner touch log and the new key in the `abn_ref` cookie (B4); whether the buyer must be told a partner referred them. |
| Q4 | **Tax on commissions.** Must Abonten withhold tax on shares paid to partners (businesses and individuals), issue statements or invoices, and collect a TIN; VAT on partner commissions and on Abonten's fee when part of it is paid to partners (extends E3). |
| Q5 | **Money held and e-money risk of desks.** Desks collecting cash for Abonten and paying it over later; limits; any deposit, float or prepaid stock; setting a desk's earnings against what it owes. Is any of it a payment service, agency or electronic money under the Payment Systems and Services Act, 2019 (Act 987), for Abonten or for the desk (with E1 and M5)? What happens to unpaid cash if a desk fails? |
| Q6 | **The partner agreement.** Terms: an independent business with no authority beyond selling at the listed price; price parity; use of organizers' and Abonten's names and images; data protection; fraud, audit and suspension; clawback and set-off; liability; ending. Is an Owner's click binding on a business (Act 772, as N4), and when is a written signature needed? |
| Q7 | **Paying partners in cash.** E1 extended to commissions paid to partners; the identity and business checks required before paying (extends N5 and K5); paying individuals trading alone. |
| Q8 | **Partner advertising.** Disclosure when media or creators earn a commission on what they recommend; inducement rules (E7); partners' messages to their own customers being their responsibility. |

## 11. Approval required before implementation

- The founder's decisions **PA1–PA22**, recorded in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md) before the phase that needs them (section 8) starts.
- Counsel's answers to the legal items each phase needs ([../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md) section Q): **Q1 and a pilot draft of Q6** before Phase 0 opens to any partner; **Q3 and B4** before Phase 1 counts touches outside staff; **Q2** before the embed or the API is used by a partner; **Q4, Q6 and Q7** before any partner is paid (the cash gate); **Q5 Decided** before any cash allocation, deposit or netting is built.
- The cash gate of section 4.5 passed before the first partner payout: identity checks live (decision L1), real payments live, the partner's checks approved.
- Not before any of the above: telling a partner a rate, a launch date, a payout date or a review time.
