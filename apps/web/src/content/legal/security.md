---
title: Security at Abonten
summary: How Abonten Hub protects accounts, payments and data, and how to report a security problem.
version: 1.3-draft
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

## Responsible disclosure

If you find a security weakness in Abonten, please tell us before making it public. This section explains how to report it, what to include, and what to expect. A machine-readable version of our contact details is published at `/.well-known/security.txt`.

### How to report

Email **security@abontenhub.com**. If you cannot use email, the in-app support conversation (Messages › "Contact Abonten Support" on the web, or Account › Help & support in the app) also reaches us, but email is preferred for security matters.

### What to include

- Where the problem is (the page, screen, API endpoint or feature).
- What kind of problem you believe it is and what an attacker could do with it.
- Step-by-step instructions to reproduce it, with any request or response details, screenshots or a short video.
- The date and time you tested, and the account (if any) you used.
- How you would like to be credited, if at all, and how we can reach you.

### What happens next

We aim to acknowledge receipt by email within two working days (Monday to Friday, 09:00–17:00 Ghana time, excluding Ghanaian public holidays). That is a goal, not a guarantee. We will then investigate and keep you informed of our progress and of when a fix is in place; we do not publish a target time for resolving reports, because it depends on what is found.

### Testing we ask you to keep to

- Test only against accounts and data you own or have permission to use. Create your own test accounts rather than using someone else's.
- Stop and report as soon as you can show the problem exists; do not go further to demonstrate impact.
- Do not change or delete data that is not yours, and do not use a weakness to move money, issue tickets or refunds, or alter anyone's balance.

### Testing we do not permit

- Accessing, downloading or retaining other people's personal data, messages, tickets or payment details.
- Denial-of-service, load or volume testing, or anything that degrades the service for others.
- Social engineering, phishing or physical attacks on Abonten staff, organizers, place owners, field team members or users.
- Automated scanning that generates significant traffic or sign-in-code requests.
- Testing our third-party providers (for example Paystack, Supabase, Cloudinary, Hubtel or Resend) directly; report anything you notice about them to us, and we will pass it on.
- Demanding payment, or threatening publication, in exchange for a report.

### Personal data you encounter

If you come across personal data while testing, do not read, copy or keep more of it than is needed to describe the problem; delete anything you did retain once we confirm we have understood the report; and never share it with anyone else.

### How we handle your report

Reports are read only by the people who need to fix the problem. We may share details with a provider whose system is involved so that they can fix their part. We will not share your identity without your permission, and we will not pursue anyone who reports in good faith and keeps to this section — see the note on legal status below.

### Coordinated disclosure

Please give us the chance to fix the problem before you publish anything about it. We will agree a publication date with you once a fix is available; if we need more time we will explain why. Abonten does not run a paid bounty programme.

### Legal status of this section

This section describes how Abonten intends to work with security researchers. **It is not yet a legal safe harbour.** The wording on researcher authorisation, permitted testing boundaries, liability and disclosure timing is under review by legal counsel and will be updated when that review is complete. Until then, please treat it as our published expectations rather than a legal undertaking.
