---
title: Runbook — outages (platform, database, email, push, SMS, payments, media, maps)
purpose: What to do when Abonten or one of its providers is down or degraded, by dependency.
audience: Engineering, operations, support
scope: Vercel, Supabase, Paystack, Hubtel, Resend, Expo/FCM, Cloudinary, Google, Sentry
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — outages

Detect via Admin › Monitoring health (probe every 2 min; `self` shows the pipeline itself), Sentry, provider status pages, support volume. Always: open an incident row (once the console is reachable), Broadcast when user-facing and lasting more than ~30 minutes, resolve with a summary.

| Dependency | Symptoms | Immediate checks | While down | After recovery |
|---|---|---|---|---|
| **Vercel / web** | site 5xx or unreachable; admin fine or also down | Vercel status; latest deployment logs; roll back if it started with a deploy | Mobile app still works for class-A reads via Supabase but `/api/mobile/**` fails (payments, messaging sends, organizer ops) | Verify health, a purchase, cron `self` green |
| **Supabase (DB/Auth)** | everything fails; health `db`/`auth` red (if the probe can even run) | Supabase status page and dashboard; `query_logs` | Nothing to do in-app; do not run migrations; prepare Broadcast text | Confirm cron jobs resumed (`cron.job_run_details`), reconciliation clean, realtime reconnects |
| **Paystack** | payments fail at init/verify; health `paystack` red | Paystack status; dashboard | New purchases fail; live attempts keep seats; refunds queue; webhook retries later | Reaper + retries finalize stuck attempts; replay webhooks if needed (`webhook-and-mass-payment-failure.md`) |
| **Hubtel (SMS)** | phone OTPs not delivered; health `hubtel` red | Hubtel portal | Advise email/Google sign-in; field owner OTP unavailable (pause field submissions) | Nothing queued — users retry |
| **Resend (email)** | ticket/cancellation/reward emails fail; sign-in email codes fail (Auth SMTP) | Resend status/dashboard; domain status | In-app notices still work; support explains tickets are in the app; reward emails retry via queue (5 tries) | Notifications › Resend for important ticket emails; retry failed queue rows |
| **Expo / FCM (push)** | pushes not arriving; health `expo` red | Expo status | In-app notifications unaffected | Queue retries automatically |
| **Cloudinary** | images missing, uploads fail; health `cloudinary` red | Cloudinary status | Listings render without images; creation flows blocked at upload | Retry uploads; check `draft_asset_cleanup_queue` |
| **Google (Maps/OAuth)** | maps blank; Google sign-in fails | Google status; key quotas/restrictions | Explore by typed location; other sign-in methods | — |
| **Sentry** | no events (not user-facing) | Sentry status | Self-hosted error groups still record | — |
| **pg_cron stopped** | health panel stale (`self` old), checkouts not expiring, reconciliation silent | `select * from cron.job` active flags; `cron.job_run_details` errors; Supabase notices | Manual `select expire_stale_ticket_checkouts();` etc. via MCP if urgent | Verify all jobs in `../operations/scheduled-jobs.md` ran |

## Communication templates

- **Before/while:** "Some parts of Abonten are unavailable while our provider resolves an issue. Tickets you already hold are unaffected. We'll update here." (Broadcast, in-app.)
- **After:** "Service is restored. If a payment did not produce a ticket, open the checkout and press Retry, or contact support."

## Verification after any outage

Health all green (including `self`), reconciliation clean, a test sign-in by each method, a test payment (small, refunded), one push and one email delivered.
