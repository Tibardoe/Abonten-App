---
title: Documentation coverage matrix
purpose: Show, for every major Abonten feature, exactly which public, internal and technical documents cover it — so a reader can find the right page and a maintainer can see what has no home.
audience: Documentation maintainers, support, product, engineering
scope: Every feature in the audit matrix, mapped to files; public pages are linked to their Markdown source in apps/web/src/content
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Documentation coverage matrix

Companion to [documentation-audit-matrix.md](documentation-audit-matrix.md) (which records *whether* a feature is documented and accurate); this page records *where*. `scripts/check-docs.mjs` fails if any public page or internal document is not reachable from here or from `INDEX.md`.

Public pages are served at `/legal/<slug>` and `/help/<section>/<slug>`; the links below open the Markdown source. "—" means no document of that type is needed for the feature; **gap** means one is missing and is tracked.

## Identity and account

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Sign in — Google, phone code, email code | [Getting started](../apps/web/src/content/help/customers/getting-started.md) | [Support scenarios](admin/support-scenarios.md) · [Troubleshooting](troubleshooting/README.md) | [Application security §Authentication](security/application-security.md) · [Email auth](architecture/email-auth.md) |
| Consent to Terms at sign-in | [Terms](../apps/web/src/content/legal/terms.md) | [Legal register](legal/README.md) | [Web README §Authentication and consent](web/README.md) |
| Profile, avatar, username, language, appearance | [Profile and settings](../apps/web/src/content/help/account/profile-and-settings.md) | [Account and support procedures](operations/account-and-support-procedures.md) | [Feature inventory](architecture/feature-inventory.md) |
| Change phone or email | [Profile and settings](../apps/web/src/content/help/account/profile-and-settings.md) | [Account and support procedures](operations/account-and-support-procedures.md) | [Application security](security/application-security.md) |
| Privacy rights (access, correction, objection) | [Privacy and your data](../apps/web/src/content/help/account/privacy-and-your-data.md) · [Privacy Policy](../apps/web/src/content/legal/privacy-policy.md) | [Privacy rights operations](privacy/privacy-rights-operations.md) | [Data inventory](privacy/data-inventory.md) · [Data export spec (gated)](specifications/data-export.md) |
| Delete account | [Deleting your account](../apps/web/src/content/help/account/deleting-your-account.md) | [Privacy rights operations §3](privacy/privacy-rights-operations.md) | [Data retention and deletion §2](privacy/data-retention-and-deletion.md) |
| Suspended or banned accounts | [Restricted accounts](../apps/web/src/content/help/account/restricted-accounts.md) | [Admin › Users](admin/users.md) · [Moderation policy](operations/content-moderation-policy.md) · [Appeals spec (gated)](specifications/appeals-workflow.md) | [Roles and permissions](architecture/roles-and-permissions.md) |
| Cookies and device identifiers | [Cookie Policy](../apps/web/src/content/legal/cookie-policy.md) | [Cookies and storage inventory](privacy/cookies-and-storage-inventory.md) | [Cookie consent spec (gated)](specifications/cookie-consent.md) |
| Minimum age | [Terms §2](../apps/web/src/content/legal/terms.md) | [Decisions O6](OPERATIONAL_DECISIONS_REQUIRED.md) | [Age gate spec (gated)](specifications/age-gate.md) |

## Discovery

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Explore, filters, nearby, map, search | [Finding events and places](../apps/web/src/content/help/customers/finding-events-and-places.md) | [Troubleshooting](troubleshooting/README.md) (missing from search) | [Feature inventory §Discovery](architecture/feature-inventory.md) · [Data model](architecture/data-model-overview.md) |
| Event and place detail, favourites, sharing | [Finding events and places](../apps/web/src/content/help/customers/finding-events-and-places.md) | — | [Feature inventory](architecture/feature-inventory.md) |
| Event reminders (app only) | [Website vs the app](../apps/web/src/content/help/customers/web-vs-app.md) | — | [Mobile guide — permissions, notifications and device](mobile/guide/permissions-notifications-and-device.md) |
| Website vs app differences | [Website vs the app](../apps/web/src/content/help/customers/web-vs-app.md) | [User guide index](user-guide/README.md) | [Mobile — iOS vs Android](mobile/guide/ios-vs-android.md) |

## Buying and attending

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Free registration and paid checkout (hold, limits, promo codes) | [Buying tickets](../apps/web/src/content/help/customers/tickets-and-checkout.md) | [Payments and ticketing runbook](finance/payments-and-ticketing-runbook.md) | [State machines](finance/state-machines.md) · [Payment security](security/payment-security.md) |
| Payment methods (card, mobile money, saved) | [Payments and payment methods](../apps/web/src/content/help/customers/payments-and-payment-methods.md) | [Support scenarios](admin/support-scenarios.md) | [Payment security](security/payment-security.md) · [Integrations — Paystack](architecture/integrations.md) |
| Payment failures and fulfilment retry | [Buying tickets](../apps/web/src/content/help/customers/tickets-and-checkout.md) | [Payments runbook §6](finance/payments-and-ticketing-runbook.md) · [Webhook and mass payment failure](incident-response/webhook-and-mass-payment-failure.md) | [State machines](finance/state-machines.md) |
| Tickets, QR, check-in, receipts | [Your tickets](../apps/web/src/content/help/customers/your-tickets.md) | [Admin › Finance](admin/finance.md) | [Feature inventory](architecture/feature-inventory.md) |
| Cancellation and refunds (fee retained) | [Refunds and cancellations](../apps/web/src/content/help/customers/refunds-and-cancellations.md) · [Terms §7](../apps/web/src/content/legal/terms.md) | [Refunds and cancellations](finance/refunds-and-cancellations.md) · [Unauthorized refunds](incident-response/unauthorized-refunds.md) | [Payment security](security/payment-security.md) |
| Duplicate charges and fraud | [Refunds and cancellations](../apps/web/src/content/help/customers/refunds-and-cancellations.md) | [Payment fraud and duplicates](incident-response/payment-fraud-and-duplicates.md) | [Reconciliation](finance/reconciliation.md) |
| Chargebacks and disputes | [Terms §7](../apps/web/src/content/legal/terms.md) | [Disputes and chargebacks](finance/disputes-and-chargebacks.md) | [State machines](finance/state-machines.md) |
| Bookings at places | [Booking a table or service](../apps/web/src/content/help/customers/bookings.md) | [Support scenarios](admin/support-scenarios.md) | [Feature inventory §Places](architecture/feature-inventory.md) |

## Organizer

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Create, draft, edit, publish events | [Creating and publishing an event](../apps/web/src/content/help/organizers/creating-and-publishing-events.md) | [Admin › Catalog](admin/catalog.md) | [Feature inventory §Organizer](architecture/feature-inventory.md) |
| Ticket types, promo codes, promoter commission | [Selling tickets and promo codes](../apps/web/src/content/help/organizers/selling-tickets-and-promo-codes.md) | [Credit tender and rewards finance](finance/credit-tender-and-rewards-finance.md) | [Rewards ledger](architecture/rewards-ledger.md) |
| Promotions (featuring) | [Promoting your event](../apps/web/src/content/help/organizers/promoting-your-event.md) | [Admin › Finance](admin/finance.md) | [Payments runbook](finance/payments-and-ticketing-runbook.md) |
| Event day — attendees and QR scanner (app) | [Event day — attendees and check-in](../apps/web/src/content/help/organizers/event-day-check-in.md) | [Support scenarios](admin/support-scenarios.md) | [Mobile guide — navigation and screens](mobile/guide/navigation-and-screens.md) |
| Cancelling an event and refunding attendees | [Cancelling an event](../apps/web/src/content/help/organizers/cancelling-an-event.md) | [Refunds and cancellations §B](finance/refunds-and-cancellations.md) | [State machines](finance/state-machines.md) |
| Earnings, settlement, payouts, payout accounts | [Finance, payouts and settlement](../apps/web/src/content/help/organizers/finance-payouts-and-settlement.md) · [Terms §8](../apps/web/src/content/legal/terms.md) | [Settlement, ledger and payouts](finance/settlement-ledger-and-payouts.md) · [Admin › Finance](admin/finance.md) | [Payment security](security/payment-security.md) |
| Attendee data responsibilities | [Terms §8](../apps/web/src/content/legal/terms.md) · [Privacy Policy §6](../apps/web/src/content/legal/privacy-policy.md) | [Decisions M4](OPERATIONAL_DECISIONS_REQUIRED.md) | [Application security](security/application-security.md) |

## Places

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Add and manage a place (photos, hours, services, temporary status) | [Adding and managing your place](../apps/web/src/content/help/place-owners/managing-your-place.md) | [Admin › Catalog](admin/catalog.md) | [Feature inventory §Places](architecture/feature-inventory.md) |
| Claims and place verification (evidence purged on a retention schedule) | [Claiming and verifying a place](../apps/web/src/content/help/place-owners/claiming-and-verifying-a-place.md) | [Admin › Claims](admin/claims.md) · [Admin › Verification](admin/verification.md) · [Trust & Verification architecture](architecture/trust-and-verification.md) · [Field ops — claim assistance](field-operations/claim-assistance.md) | [Data retention §1](privacy/data-retention-and-deletion.md) |
| Organizer verification (optional; never required to publish an event) | [Getting verified as an organizer](../apps/web/src/content/help/organizers/getting-verified.md) | [Admin › Verification](admin/verification.md) · [Trust & Verification architecture](architecture/trust-and-verification.md) | [Data retention §1](privacy/data-retention-and-deletion.md) |
| Search, alerts and recommendation notices (ships switched off) | — (no public help page until the programme is on for customers) | [Admin › Discovery](admin/discovery.md) | [Discovery architecture](architecture/discovery-search-and-recommendations.md) · [Performance](architecture/perf/discovery-2026-09.md) |
| Bookings, reviews, replies, messaging | [Bookings, reviews and messaging](../apps/web/src/content/help/place-owners/bookings-reviews-and-messaging.md) | [Admin › Content](admin/content.md) | [Feature inventory](architecture/feature-inventory.md) |
| Promoting a place; visit QR | [Promoting your place](../apps/web/src/content/help/place-owners/promoting-your-place.md) | [Rewards operations](operations/rewards-operations.md) | [Rewards ledger](architecture/rewards-ledger.md) |

## Social and safety

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Reviews and highlights | [Reviews and highlights](../apps/web/src/content/help/customers/reviews-and-highlights.md) | [Admin › Content](admin/content.md) · [Moderation policy](operations/content-moderation-policy.md) | [Feature inventory §Social](architecture/feature-inventory.md) |
| Messaging (text, media, voice notes, blocking) and support conversation | [Messaging](../apps/web/src/content/help/customers/messaging.md) | [Admin › Support](admin/support.md) · [Account and support procedures](operations/account-and-support-procedures.md) | [Feature inventory](architecture/feature-inventory.md) · [Data retention R3](privacy/data-retention-and-deletion.md) |
| Reporting and moderation | [Reporting a problem](../apps/web/src/content/help/customers/reporting-a-problem.md) · [Terms §14](../apps/web/src/content/legal/terms.md) | [Admin › Reports and moderation](admin/reports-and-moderation.md) · [Moderation policy](operations/content-moderation-policy.md) · [Abuse, spam, impersonation](incident-response/abuse-spam-impersonation.md) · [Malicious content and uploads](incident-response/malicious-content-and-uploads.md) | [Roles and permissions](architecture/roles-and-permissions.md) |
| Notifications (in-app, push, email) | [Notifications](../apps/web/src/content/help/customers/notifications.md) | [Notifications and email operations](operations/notifications-and-email-operations.md) · [Admin › Notifications](admin/notifications.md) | [Scheduled jobs](operations/scheduled-jobs.md) · [Integrations — Expo, Resend](architecture/integrations.md) |

## Rewards and referrals (shadow mode — not generally available)

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Abonten Credit, invites, referrals, loyalty, rebates | [Rewards and Abonten Credit](../apps/web/src/content/help/customers/rewards-and-credit.md) · [Terms §12](../apps/web/src/content/legal/terms.md) | [Rewards operations](operations/rewards-operations.md) · [Admin › Rewards](admin/rewards.md) | [Rewards ledger](architecture/rewards-ledger.md) · [Credit tender and rewards finance](finance/credit-tender-and-rewards-finance.md) |

## Field programme (switched off)

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Field team roles, assignments, onboarding, evidence, payouts | [Terms §11 (field onboarding consent)](../apps/web/src/content/legal/terms.md) | [Field operations handbook](field-operations/README.md) · [Admin › Field Ops](admin/field-ops.md) · [Field agent compromise](incident-response/field-agent-compromise.md) | [Field ops architecture](architecture/field-ops.md) · [Journey — field agent](journeys/field-agent.md) |

## Platform and administration

| Feature | Public | Internal (operations) | Technical |
|---|---|---|---|
| Admin console — RBAC, step-up, audit | — | [Admin handbook](admin/README.md) · [Admin › Settings and RBAC](admin/settings-and-rbac.md) · [Admin › Audit logs](admin/audit-logs.md) | [Access control model](security/access-control-model.md) · [Roles and permissions](architecture/roles-and-permissions.md) |
| Dashboard and analytics | — | [Admin › Dashboard](admin/dashboard.md) · [Admin › Analytics](admin/analytics.md) | [Observability](architecture/observability.md) |
| Monitoring, errors, incidents | — | [Admin › Monitoring and incidents](admin/monitoring-and-incidents.md) · [Incident response](incident-response/README.md) · [Sentry and error rate](incident-response/sentry-and-error-rate.md) · [Outages](incident-response/outages-service-email-push-third-party.md) | [Observability](architecture/observability.md) |
| Finance operations centre | — | [Finance runbooks](finance/README.md) · [Admin › Finance](admin/finance.md) | [Payment security](security/payment-security.md) |
| Security (public statement and internal model) | [Security at Abonten](../apps/web/src/content/legal/security.md) | [Security documentation](security/README.md) · [Vulnerability report](incident-response/vulnerability-report.md) | [Application](security/application-security.md) · [Database](security/database-security.md) · [Infrastructure](security/infrastructure-and-provider-responsibilities.md) · [Secrets](security/secrets-and-environment.md) |
| Responsible disclosure and `security.txt` | [Security at Abonten §Responsible disclosure](../apps/web/src/content/legal/security.md) · `/.well-known/security.txt` | [Responsible disclosure framework](security/responsible-disclosure.md) · [Vulnerability report](incident-response/vulnerability-report.md) | [Documentation validation (`security-txt` rule)](development/documentation-validation.md) |
| Support channels and operating policy | [Terms §19](../apps/web/src/content/legal/terms.md) · [Restricted accounts](../apps/web/src/content/help/account/restricted-accounts.md) | [Account and support procedures](operations/account-and-support-procedures.md) · [Support operating policy (O1)](operations/support-operating-policy.md) · [Admin › Support](admin/support.md) | — |
| Corporate and compliance records | [Terms §1](../apps/web/src/content/legal/terms.md) · [Privacy §1](../apps/web/src/content/legal/privacy-policy.md) | [Company registration](legal/company-registration.md) · [DPC registration (A2)](legal/dpc-registration.md) · [Business Operating Permit (A4)](legal/business-operating-permit.md) | — |
| Mobile release verification | — | [Open-item register](operations/open-items.md) | [Release verification (M1)](mobile/release-verification.md) · [EAS](deployment/mobile-eas.md) |
| Account takeover, admin compromise, leaked secrets, database exposure, data breach | — | [Account takeover](incident-response/account-takeover.md) · [Admin compromise](incident-response/admin-compromise.md) · [Leaked secret](incident-response/leaked-secret.md) · [Database exposure](incident-response/database-exposure.md) · [PII exposure and data breach](incident-response/pii-exposure-and-data-breach.md) | [Secrets and environment §Leak response](security/secrets-and-environment.md) |
| Scheduled jobs | — | [Scheduled jobs](operations/scheduled-jobs.md) | [Rewards ledger](architecture/rewards-ledger.md) · [Field ops](architecture/field-ops.md) |
| Deployment, release, rollback, disaster recovery | — | [Deployment and release (operations)](operations/deployment-and-release.md) · [Release checklist](deployment/release-checklist.md) | [Vercel](deployment/web-and-admin-vercel.md) · [EAS](deployment/mobile-eas.md) · [Supabase migrations](deployment/supabase-migrations.md) · [Rollback and recovery](deployment/rollback-and-recovery.md) · [Disaster recovery](deployment/disaster-recovery.md) |
| Development, testing, CI, conventions | — | — | [Setup](development/setup.md) · [Testing](development/testing.md) · [CI](development/ci.md) · [Conventions](development/conventions.md) · [Documentation validation](development/documentation-validation.md) |
| System architecture and shared backend | — | — | [System overview](architecture/system-overview.md) · [Shared backend](architecture/shared-backend.md) · [Integrations](architecture/integrations.md) · [Data model](architecture/data-model-overview.md) |
| Third-party processors | [Privacy Policy §4](../apps/web/src/content/legal/privacy-policy.md) | [Third-party processors](privacy/third-party-processors.md) | [Integrations](architecture/integrations.md) |

## Journeys and product documentation

| Audience | Journey map | Product documentation |
|---|---|---|
| Customer | [journeys/customer.md](journeys/customer.md) | [Web](web/README.md) · [Mobile](mobile/README.md) |
| Organizer | [journeys/organizer.md](journeys/organizer.md) | same |
| Place owner | [journeys/place-owner.md](journeys/place-owner.md) | same |
| Field agent | [journeys/field-agent.md](journeys/field-agent.md) | [Field operations](field-operations/README.md) |
| Admin | [journeys/admin.md](journeys/admin.md) | [Admin handbook](admin/README.md) |

Journey index: [journeys/README.md](journeys/README.md). Legal versioning: [legal/versioning-and-effective-dates.md](legal/versioning-and-effective-dates.md).

## Gaps (no document yet — tracked, not invented)

| Gap | Tracked in |
|---|---|
| ~~Support hours and response target~~ | Closed 2026-09-12 (decision O1) · [Support operating policy](operations/support-operating-policy.md); escalation procedure remains open (O7) |
| ~~Official support, privacy and security contacts~~ | Closed 2026-09-12 (legal A3) · [Contacts spec](specifications/support-and-security-contacts.md) |
| DPC registration status; Business Operating Permit | Legal A2, A4 · [DPC record](legal/dpc-registration.md) · [BOP record](legal/business-operating-permit.md) |
| Responsible-disclosure safe harbour | Legal D3 · [Responsible disclosure framework](security/responsible-disclosure.md) |
| Mobile build / device / production verification | [Release verification](mobile/release-verification.md) · [Open items](operations/open-items.md) M1 |
| Retention periods for nine data sets | Decisions R1–R9 · [Retention spec](specifications/retention-jobs.md) |
| Formal appeals | Decision O4 · [Appeals spec](specifications/appeals-workflow.md) |
| Self-service data export | Decision O3 · [Data export spec](specifications/data-export.md) |
| Cookie consent banner | Legal B4 · [Cookie consent spec](specifications/cookie-consent.md) |
| Minimum age | Legal B7 · [Age gate spec](specifications/age-gate.md) |
| Legal and help content in languages other than English | Decision D5 · [Future improvements](specifications/future-improvements.md) |
| iOS app | Decision D2 · [Future improvements](specifications/future-improvements.md) |
| `PRD.md` at the repository root | Placeholder file, left untouched by request |
