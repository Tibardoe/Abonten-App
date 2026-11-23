---
title: Architecture documentation
purpose: Index of the technical architecture documents for developers and technical administrators.
audience: Engineering
scope: Monorepo, database, APIs, jobs, integrations
status: Approved
version: 1.7
lastReviewed: 2026-11-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Architecture documentation

| Document | Covers |
|---|---|
| [system-overview.md](system-overview.md) | Runtime topology, repository structure, the "one rule", request paths, deployments |
| [feature-inventory.md](feature-inventory.md) | Every feature with app, role, entry point, tables, services/actions/API, permissions, notifications, payments, failure states |
| [roles-and-permissions.md](roles-and-permissions.md) | End-user roles (derived), admin RBAC, field roles, suspension, RLS map |
| [trust-and-verification.md](trust-and-verification.md) | Place and organizer verification: model, state machine, evidence storage, permissions |
| [discovery-search-and-recommendations.md](discovery-search-and-recommendations.md) | Unified search and ranking, `@handle`, opt-in alerts, recommendation digests, preference centre, switches |
| [weekly-highlights.md](weekly-highlights.md) | Abonten Weekly: editions, sections and items, read-time validity, caching, editorial workflow, jobs, switches, rollout |
| [identity-verification.md](identity-verification.md) | Identity verification: government ID and live selfie through Smile ID, what is kept, duplicates across accounts, requirements, the Safety link, staff access, retention, rollout |
| [event-reschedule.md](event-reschedule.md) | Moving an event that has tickets to a new date or venue, one date of several, or postponing it: every holder told, keep the ticket or a full refund with the fee |
| [show-passes.md](show-passes.md) | Passes for several shows of a run: sold on every show, the holder chooses the other shows from the ticket, cancelled together |
| [complimentary-tickets.md](complimentary-tickets.md) | Complimentary tickets: an organizer gives real tickets of a type to a named person, from the stock and seats, with no money moved |
| [assigned-seats.md](assigned-seats.md) | Assigned seats: seating plans, ticket types selling sections, the database seating every issued ticket (an order side by side), freeing and guards |
| [ticket-sales-window.md](ticket-sales-window.md) | When a session of an event can be sold: the one rule (TypeScript and SQL), the organizer's choice to keep selling while it's on (same-day sales), every place that enforces it, what does not change |
| [show-runs.md](show-runs.md) | Runs of shows, tours and copying a listing: each show a whole event in a run, shows at other venues, what is copied, lists and search showing a run once (nearest venue first), the show picker |
| [social-distribution.md](social-distribution.md) | Abonten posting every new event and place on its own channels: the Admin › Social queue, `?src=` tagged links recorded with listing views, the Monday "your listings had N views" note, and install-then-open links to the app |
| [ticket-notes-and-special-hours.md](ticket-notes-and-special-hours.md) | What a ticket type includes (a one-line note, editable after the first sale) and special dates in a place's opening hours (holidays): storage, who writes, how "open now" reads them |
| [group-tickets-and-prices.md](group-tickets-and-prices.md) | Group tickets (a type admitting several people, one ticket each) and automatic group prices: counting in people, the one pricing rule, never stacked with a promo code, database guarantees, the feature flag |
| [ticket-plans.md](ticket-plans.md) | Pay small small: paying for tickets in parts before the event, held seats (`on_plan`), parts on the payment path, the settlement purchase, ending and refunding plans per part, the Balance page, why there is no top-up balance, rollout |
| [safety.md](safety.md) | Abonten Safety: trusted contacts, SOS, check-ins, live location, the contact's page, the outbox and dispatcher, offline behaviour, privacy, rollout |
| [mobile-offline-media-and-sync.md](mobile-offline-media-and-sync.md) | Mobile offline query cache, Spotlight player lifecycle, live comments and likes, search vocabulary and date parsing, search filters, follower counts |
| [internationalisation.md](internationalisation.md) | The six languages: shared catalogs, how each surface picks a language, server and database text, number and date formatting, per-page messages on the website, the native app's Intl polyfills, the checks |
| [search-languages.md](search-languages.md) | Search in the reader's language: one folding rule for letters (accents, Twi and Ewe letters), date words in five languages as data, everyday words of four more languages in the vocabulary and their direction, the typo fallback of a dated search, and every other place typed text is compared |
| [explore-lists.md](explore-lists.md) | The lists of events and places on Explore: the one rule for which events are on and what each filter means, how a page and the Explore rows are chosen, the card every list returns, cursors, and what the apps send |
| [search-engines.md](search-engines.md) | What the public website offers search engines: which pages are offered and which kept out, titles and descriptions, canonical addresses (lower-case event codes), structured data, the sitemap, robots.txt, the manifest, IndexNow and the owner's Search Console steps |
| [web-resilience.md](web-resilience.md) | What people see when a request fails or the database is unreachable (website, admin console, app start-up), 404 against 500, timed rebuilds, confirmations, and how few requests a page opens with |
| [perf/discovery-2026-09.md](perf/discovery-2026-09.md) | Measured search, Explore list and recommendation cost on a 100,000-event synthetic catalogue |
| [data-model-overview.md](data-model-overview.md) | Table groups, key relationships, status columns, partitions, unused tables |
| [integrations.md](integrations.md) | Each external service: what, where in code, config, failure behaviour |
| [observability.md](observability.md) | Self-hosted error/health/metric pipeline, Sentry projects, where to look, gaps |
| [shared-backend.md](shared-backend.md) | The service package and the A/B/C operation classification (existing) |
| [rewards-ledger.md](rewards-ledger.md) | Abonten Credit ledger and rewards engine (existing, with runbook) |
| [field-ops.md](field-ops.md) | The field programme (existing, with runbook) |
| [email-auth.md](email-auth.md) | Email OTP sign-in (existing) |
| Background jobs | `../operations/scheduled-jobs.md` |
| Environment variables | `../security/secrets-and-environment.md` |
| Deployment, CI, testing | `../deployment/`, `../development/` |

The engineering changelog and deep history remain in the repository-root `PROJECT.md` (§1–§29). The 2026-09-04 limitation audit (system map, register, roadmap) is in `../audit/`.
