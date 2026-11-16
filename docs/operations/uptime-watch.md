---
title: Uptime watch (outside alarm)
purpose: Describe the outside uptime alarm — what it checks, where it runs, who it emails, and how to change or test it.
audience: Founder, engineering, on-call responder
scope: The "Abonten uptime watch" Google Apps Script project and its source in scripts/ops/uptime-watch.gs
status: Approved
version: 1.0
lastReviewed: 2026-11-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Uptime watch (outside alarm)

## Why it exists

From 13 to 15 November 2026 the website, the admin console and the app's API were down for two days (Vercel blocked the Hobby account) and nobody was told. The database's own health check saw it — the `self` check failed 1,475 times — but the incident emails are sent by the website, so the alarm was down with the site. The uptime watch shares nothing with the services it watches: it runs on Google, outside Vercel, Supabase and GitHub.

## What it is

A Google Apps Script project, **Abonten uptime watch**, owned by the founder's Workspace account. Its code is `scripts/ops/uptime-watch.gs` in this repository, which is the source of truth.

| Trigger | Runs | Does |
|---|---|---|
| `runChecks` | every 5 minutes | the four checks below |
| `weeklyHeartbeat` | Mondays, 07:00–08:00 (the project's time zone) | emails "still watching" with the outages of the last 7 days |

## What it checks

| Check | Address | Counts as up |
|---|---|---|
| Website | `https://abontenhub.com/` | HTTP 200 |
| App API and database | `https://abontenhub.com/api/mobile/markets/context` | HTTP 200 **and** the Ghana market in the answer (proves the database answered) |
| Admin console | `https://admin.abontenhub.com/` | HTTP 200, 302, 307 or 308 (signed-out visitors are sent to sign in) |
| Supabase | `https://sderrexhawjbmsugndcq.supabase.co/auth/v1/health` | HTTP 200 or 401 (without a key the gateway answers 401: it is up) |

A check that fails **two runs in a row** (about 10 minutes) sends one email: "🔴 Abonten: … is down", with the answer it got and what to look at. A 402 is named as Vercel blocking the account. When the check passes again, one email: "✅ Abonten: … is back", with how long it was down. Nothing more is sent in between.

## Who is told

The founder's work inbox, set in the project's **script property** `ALERT_TO` (Project Settings › Script Properties), not in the code: this repository is public. To add someone, make it a comma-separated list of addresses. Without it, every email attempt fails and Google's failure summary says so.

## Changing it

1. Edit `scripts/ops/uptime-watch.gs` and merge the change.
2. Open the project at script.google.com (signed in as the founder's work account), paste the file over `Code.gs` and save.
3. Run `checkNow` to see each check's answer in the execution log.
4. Run `setup` only if the triggers need recreating (it deletes and recreates both, then runs the checks once).

`sendTestAlert` sends a sample alert. A new address or permission makes Google ask for consent again the next time a function is run by hand.

## Limits

- Google's own limits apply (Workspace: 100,000 fetches and 1,500 emails a day); the watcher uses about 1,150 fetches a day.
- If the script itself fails, Google emails the owner a daily failure summary.
- It watches whether the services answer, not whether every feature works: payments, sign-in codes and jobs are covered by Admin › Monitoring (`../architecture/observability.md`).
