---
title: Troubleshooting knowledge base
purpose: Problem → Symptoms → Likely causes → Checks → Resolution → Escalation for the failures staff and engineers actually see, using only the tools and architecture that exist.
audience: Support, operations, engineering on call
scope: Web, mobile, admin, backend, providers
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Troubleshooting knowledge base

Search tip: every entry heading is the phrase a user or colleague would say. Money cases also live in `../admin/support-scenarios.md`; provider outages in `../incident-response/outages-service-email-push-third-party.md`.

## Sign-in and account

### Cannot sign in (any method)
- **Symptoms:** stuck on the sign-in screen; "something went wrong"; redirected back to sign-in.
- **Likely causes:** provider outage (Hubtel / Supabase Auth / Google); browser blocking cookies; suspended account (redirects to `/account-restricted`); wrong number format.
- **Checks:** Admin › Monitoring health (`auth`, `hubtel`, `resend`); Users › status; ask which method and what they see.
- **Resolution:** alternative method with the same email; allow cookies for abontenhub.com; restore if wrongly suspended.
- **Escalation:** engineering if `auth` is red.

### Phone OTP never arrives / "too many attempts"
- **Causes:** Hubtel delay/outage; number typed without country code; per-IP send cap (10/hour) or 60-second cooldown; 5 wrong entries cancel the code.
- **Checks:** health `hubtel`; `phone_otp_send_log` for the number (engineer); the message says which limit hit.
- **Resolution:** wait and resend; correct format; use email/Google.
- **Escalation:** Hubtel outage → incident.

### Email code never arrives
- **Causes:** Supabase Auth SMTP not configured with Resend (built-in sender is rate-capped); spam; typo; per-email/per-IP send cap.
- **Checks:** Supabase dashboard Auth logs; Resend dashboard; the address on the account.
- **Resolution:** resend after a minute; spam folder; fix SMTP config.
- **Escalation:** engineering.

### "Your account is restricted"
- **Cause:** `user_info.status_id` 2 or 3.
- **Checks/Resolution:** `../admin/users.md` (restore with `users.restore`); bans need the founder.

### Google sign-in returns to sign-in
- **Causes:** redirect URL not in Supabase Auth allow list (web callback `/auth/callback`; mobile `abonten://auth/callback`); browser blocked third-party cookies mid-flow.
- **Checks:** Supabase Auth URL configuration; try another browser.
- **Escalation:** engineering.

## Payments and tickets

### Payment failed at checkout
- **Causes:** card/wallet declined by Paystack; Paystack outage; checkout hold expired (30 min); ticket type sold out between selection and payment.
- **Checks:** Finance › Transactions (attempt `failed` with Paystack message); health `paystack`.
- **Resolution:** try another method within the hold; restart the checkout.

### Payment succeeded but ticket missing
- See `../finance/payments-and-ticketing-runbook.md` §6 and support scenario 1. Key states: attempt `fulfillment_failed`/`processing` → Retry; no transaction → webhook/verify replay.

### Ticket status looks wrong (used / expired / cancelled unexpectedly)
- **Causes:** organizer checked in (used); event ended (expired); organizer cancelled the event (cancelled by organizer); buyer cancelled.
- **Checks:** ticket row and event status in Finance › Transactions trace or Events detail.
- **Resolution:** organizer can undo a check-in from the list; other states are correct behaviour.

### Refund missing
- `../finance/refunds-and-cancellations.md` §D–E: `refund_pending` (Paystack pending), `refunded` (bank timing), failed (Retry refund).

### Promo code rejected
- **Causes:** code for another event; usage limit reached; invalid percentage; buyer rate-limited (20/min).
- **Checks:** organizer's Promo codes page; `promo_code_usage`.

## Discovery and content

### Event or place not appearing
- **Causes:** not `published`; `moderation_state` hidden/removed; outside the searched location or date; event already ended/archived. Search reads the listing directly, so there is no refresh delay.
- **Checks:** Events/Places detail in admin (status, moderation); ask which location the user explores.
- **Resolution:** publish; restore moderation if wrong.

### Search returns nothing relevant
- **Causes:** unified search is off for this person, so they get the old events-only search (Admin › Discovery › Status; `SEARCH_V2_KILL_SWITCH`); the words are not in the title, category, address or description; a typo too far from any title; rate limit after 60 searches a minute.
- **Checks:** Admin › Discovery "Searches with no results" for the query; in the SQL editor run `select title, score from search_events('the query')`.

### Recommendation notice not received
- **Causes:** programme off, shadow mode on, or the person outside the audience; no matching subscription; caps reached, paused, or already notified today; the listing was published before the engine's starting point; push skipped at send time (`opted_out`, `channel_off`).
- **Checks:** `recommendation` and `recommendation_digest_skip` rows for the user id; `notification_delivery` rows with `source = 'recommendations'`; Admin › Discovery panels.
- **Resolution:** usually none; the caps are doing their job. See [admin/discovery.md](../admin/discovery.md).

### Map not loading
- **Causes:** Google Maps key missing/restricted on the deployment (web) or in the EAS environment (mobile `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`); browser blocking Google scripts; no network.
- **Checks:** browser console for Google Maps errors; env var present; key referrer restrictions include the domain.
- **Escalation:** engineering.

### Image or video upload fails
- **Causes:** file too large (limits in `@abonten/core/uploadLimits`); Cloudinary outage; signature rate limit (per user per minute); wrong folder (field ops); slow network.
- **Checks:** health `cloudinary`; error groups for `cloudinary-signature`; file size.
- **Resolution:** smaller file; retry; wait a minute.

### Avatar or flyer not updating
- **Cause:** Cloudinary version/caching; the app shows the previous version until the new public id/version propagates.
- **Resolution:** reload; check `avatar_version` updated.

## Messaging, reviews, notifications

### Messages not delivered / not appearing
- **Causes:** participant blocked; conversation archived; moderation hid the message; realtime disconnected (mobile shows on next fetch).
- **Checks:** Blocked users; Content › conversations; Sentry for realtime errors.

### Cannot post a review
- **Causes (event):** not checked in; event not ended or cancelled; organizer; already reviewed; rate limit (`MAX_REVIEWS_PER_HOUR`).
- **Resolution:** explain the eligibility rules (`eventReviewEligibility.ts`).

### Push notifications not received / emails not received
- `../operations/notifications-and-email-operations.md` checks.

## Rewards and referrals

### Reward balance issue / referral not credited
- `../operations/rewards-operations.md`; remember production is in shadow mode — no public credit is expected today.

## Admin console

### Admin action failed ("Forbidden", "re-authenticate")
- **Causes:** missing permission (matrix); step-up older than 10 minutes; admin disabled; email not on `ADMIN_EMAIL_ALLOWLIST`.
- **Checks:** Admin Settings › roles; sign in again with step-up; env var on the admin deployment.
- **Resolution:** super_admin adjusts roles; re-authenticate.

### Health panel empty or `self` down
- **Causes:** `observability_config` row missing/wrong URL or secret; web deployment rejecting (`OBSERVABILITY_INGEST_SECRET` mismatch); cron job inactive.
- **Checks:** `cron.job` for `abonten-health-check`; `net._http_response` last rows; env var on Vercel.
- **Escalation:** engineering.

## Field programme

### "Field work" link missing / `/field` 404
- **Causes:** programme or worker UI switched off; `FIELD_OPS_KILL_SWITCH`; membership not active or phone not bound.
- **Checks:** Admin › Field Ops › Settings; team page for the membership.

### Onboarding submission refused
- **Causes:** owner not verified; campaign paused/not active; daily cap; photos not in the member's folder; missing GPS/evidence (offline); duplicate with the same phone (offer claim assistance).
- **Resolution:** the error names the failing gate; fix and resubmit.

### Sweep not approving commissions
- **Causes:** `commission_generation_enabled` off; holding period not over; release policy waiting (event start / claim decision); budget cap; flagged for admin.
- **Checks:** Admin › Field Ops › Overview counters; `fieldops_health()`; `fieldops_job_run`.

## App and web errors

### Mobile app crashes or shows an error screen
- **Checks:** Sentry `abonten-mobile` (release, screen breadcrumbs); Admin › Monitoring error groups (platform android); app version — an OTA update may not have been applied (restart the app twice).
- **Resolution:** update the app; `eas update` fix; escalate with the Sentry event id.

### Web error page (global error) or 500
- **Checks:** Sentry `abonten-web`; error groups; Vercel runtime logs for the deployment; recent deploy? roll back.
- **Escalation:** engineering; incident if widespread.

### Third-party outage
- `../incident-response/outages-service-email-push-third-party.md`.
