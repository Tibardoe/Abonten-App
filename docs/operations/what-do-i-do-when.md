---
title: What do I do when…
purpose: Quick-reference answers for the situations staff meet most often, each pointing at the exact procedure.
audience: Operations, support, finance, moderators, engineering on call
scope: Operational scenarios across payments, accounts, content, providers and programmes
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# What do I do when…

Each entry: **first check → do → then**. Keywords in bold help search.

**…a customer says they paid but received no ticket** (*paid no ticket, ticket missing*) → Finance › Transactions by email/reference → status of the payment attempt → Retry / replay webhook → `../admin/support-scenarios.md` §1, `../finance/payments-and-ticketing-runbook.md` §6.

**…an organizer cancels an event** (*event cancelled, refunds*) → nothing to do if all transactions read `refund_pending`; Finance › Refunds for stragglers → run Refund on any still `successful` → `../finance/refunds-and-cancellations.md` §B.

**…an organizer asks for a refund for a buyer** → the buyer cancels their own ticket (fee retained) or, with the buyer's request in the thread, finance runs Refund → `../finance/refunds-and-cancellations.md` §C.

**…a place owner disputes ownership** (*claim, wrong owner*) → Claims › the request; ask both parties for documents via Support; approve on evidence → `../admin/claims.md`.

**…a field team member publishes incorrect information** (*agent error*) → the owner edits their listing; the lead returns the onboarding (needs changes) before verification; after verification admin flags/reverses → `../field-operations/duplicates-and-corrections.md`.

**…an admin account may be compromised** (*admin takeover*) → Admin Settings › disable the admin **now**; rotate step-up by having them sign out; read their audit rows since the suspected time; reverse damage via the normal tools → `../incident-response/admin-compromise.md`.

**…Paystack is failing** (*payments down*) → Monitoring health `paystack`; Paystack status page; open an incident; tell support to hold "no ticket" tickets until recovery; pending checkouts keep seats while attempts are live → `../incident-response/outages-service-email-push-third-party.md`.

**…email delivery fails** (*Resend, emails not arriving*) → health `resend`; Resend dashboard (bounces, domain status); Supabase Auth SMTP for sign-in codes; open an incident; ticket emails can be re-sent via Notifications › Resend after recovery → `notifications-and-email-operations.md`.

**…push notifications fail** (*Expo, push*) → health `expo`; device registered? `notification_delivery` failed rows (rewards); in-app copies are intact → `notifications-and-email-operations.md`.

**…Supabase is unavailable** (*database down, site down*) → Supabase status; Vercel logs; nothing to fix in-app — open an incident, post a status message when the console works again (Broadcast), verify cron jobs resumed → `../incident-response/outages-service-email-push-third-party.md`.

**…a user reports harassment** → advise Block + Report; moderator reviews the reported thread; hide messages; suspend if warranted → `../admin/reports-and-moderation.md`, `content-moderation-policy.md`.

**…a review is fraudulent** (*fake review*) → Reports/Content › Remove with reason; check the reviewer's other reviews; suspend for coordinated fakes → `content-moderation-policy.md`.

**…an event is fraudulent** (*scam event*) → Hide the event; hold the organizer's payouts; check disputes; cancel the event (refunds) and ban → `../incident-response/payment-fraud-and-duplicates.md`.

**…reward credits appear incorrect** → Rewards › Accounts › user: decisions and reasons; compare ledger vs cached balance; Adjust credit (audited) → `../architecture/rewards-ledger.md` runbook, `rewards-operations.md`.

**…an image violates policy** → Content › Hide/Remove the item (highlight, photo's listing, review with photo); Cloudinary media stays until cleanup — engineering can destroy the asset if it is illegal → `content-moderation-policy.md`, `../incident-response/malicious-content-and-uploads.md`.

**…an event is missing from search** (*not appearing*) → is it `published`? `moderation_state` visible? within the searched location/date? search reads the listing directly, with no refresh delay; if unified search is off for them they get the older events-only search → `../troubleshooting/README.md`.

**…someone gets too many (or unwanted) recommendation notices** → check their subscriptions and prompt history; they can stop each alert in Settings › Notifications; if volume is wrong for everyone, untick the engine in Admin › Discovery → `../admin/discovery.md`.

**…a user requests account deletion** → self-service in Settings › Security; if they cannot sign in, follow the privacy procedure → `../privacy/privacy-rights-operations.md` §3.

**…personal data may have leaked** → stop, preserve evidence, escalate to the founder immediately, follow the breach runbook; no external communication until approved → `../incident-response/pii-exposure-and-data-breach.md`.

**…a secret may have been exposed** (*API key leaked*) → rotate at the provider first, then update Vercel/EAS env, redeploy, check audit logs and Sentry → `../incident-response/leaked-secret.md`.

**…Sentry alerts on an error spike** → Monitoring › error groups; Sentry issue; open an incident if user-facing; roll back the deployment if it started with one → `../incident-response/sentry-and-error-rate.md`.

**…a field agent's account may be compromised** → lead suspends the membership; admin checks their submissions since; hold their commissions → `../incident-response/field-agent-compromise.md`.

**…I need to switch a programme off in an emergency** → Rewards: Admin › Rewards › Settings "Program switched on" or `REWARDS_KILL_SWITCH=true`; Field Ops: Admin › Field Ops › Settings or `FIELD_OPS_KILL_SWITCH=true`; Paystack Transfers: `PAYSTACK_TRANSFERS_ENABLED` unset → `../deployment/rollback-and-recovery.md`.
