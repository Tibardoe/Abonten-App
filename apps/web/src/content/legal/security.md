---
title: Security at Abonten
summary: How Abonten Hub protects accounts, payments and data, and how to report a security problem.
version: 1.0-draft
effectiveDate: Not yet in force — set when approved
lastUpdated: 2026-09-12
status: Review required
owner: Abonten Hub
audience: Public
legalReviewRequired: no
---

# Security at Abonten

> **Draft for review.** This page describes the controls that exist today. Abonten does not hold any security certification (for example PCI DSS or ISO 27001) and does not claim one; card data is handled entirely by our payment provider. Effective date: [EFFECTIVE DATE — TO BE CONFIRMED].

## Accounts and sign-in

- Abonten has **no passwords**. You sign in with Google, or with a one-time code sent to your phone or email. Codes expire after a few minutes, can be used once, and the number of attempts and re-sends is limited.
- Sessions are issued by our authentication provider (Supabase Auth) and refreshed securely. Signing out of a device ends that device's session; when an account is suspended, every session is revoked.
- Staff who use Abonten's admin console sign in with Google, must be on an approved list, hold an explicit role with specific permissions, and must re-authenticate before sensitive actions such as refunds, payouts or bans. Every administrative action is written to a permanent, tamper-evident audit log.

## Your data

- All traffic between your browser or app and Abonten is encrypted (HTTPS).
- The database enforces **row-level access rules**: each account can read and change only its own records, organizers only their own events, owners only their own places. Every server action re-checks who is asking before doing anything.
- Prices, fees and ticket availability are calculated on our servers, never trusted from the app or browser.
- Money-related records (payments, tickets, organizer earnings, rewards ledgers) can only be written by server processes, and the ledgers are append-only: history can be added to but not rewritten.
- Media (photos, videos) is stored with Cloudinary; uploads are signed per user so one account cannot write into another's folder. Sensitive documents (place-claim evidence, field-programme evidence) are stored in private buckets and served only through short-lived signed links.
- Rate limits protect sign-in codes, promo-code lookups, checkout, uploads, reports and referral actions against abuse.

## Payments

- Payments are processed by **Paystack**. Your card number and PIN are entered into Paystack's payment window, never into Abonten; Abonten stores only a Paystack reference and the last four digits, brand and expiry for display.
- Every payment is verified with Paystack on our servers before a ticket is issued, and Paystack's webhook notifications are checked for a valid signature.
- Refunds are requested from Paystack and confirmed by Paystack before your ticket shows "refunded".
- Payouts to organizers are approved and executed by Abonten's finance staff with a second approval for large or unusual cases.

## Monitoring and response

- Errors and outages are monitored continuously through Sentry and our own health checks (for example whether Paystack, our SMS and email providers are reachable). Incidents are tracked in our admin console.
- Financial reconciliation checks run against the ledgers to detect inconsistencies.
- We keep incident-response procedures for account takeover, payment problems, data exposure and provider outages.

## Your part

- Protect the phone and email inbox that receive your sign-in codes.
- Never share your ticket QR code publicly.
- Sign out of shared devices.
- Contact support at once if you see activity you don't recognise.

## Reporting a vulnerability

If you find a security weakness in Abonten, please tell us before making it public. Report it through the in-app support conversation (Messages › "Contact Abonten Support" on the web, or Account › Help & support in the app) and describe what you found and how to reproduce it. Security contact: [SECURITY CONTACT — TO BE CONFIRMED]. A responsible-disclosure policy is being prepared and will be published here.
