---
title: Support scenarios
purpose: The common support situations, each as Situation → Diagnosis → Steps → Expected result → Escalation, using only tools that exist.
audience: support_admin, operations, finance_admin
scope: Customer, organizer and place-owner requests arriving in the support queue
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Support scenarios

Keyword index: *paid no ticket · double charge · refund missing · cancel ticket · organizer cancelled · payout · claim · wrong owner · booking · review removal · fake event · harassment · can't sign in · OTP · email code · push · account restricted · delete account · data request · rewards credit · referral · duplicate place · wrong hours · promo code · promotion not showing · field agent error*

---

### 1. "I paid but I have no ticket"
- **Situation:** buyer charged, no ticket in My Tickets / Tickets tab.
- **Diagnosis:** Finance › Transactions, search by email (PII) or Paystack reference. Look at `payment_attempt` status and the checkout.
- **Steps:** `succeeded` + checkout `paid` → tickets exist: tell them where to find them; Notifications › Resend the confirmation. `fulfillment_failed` / `processing` → ask them to press **Retry** on the checkout; if that fails, escalate to engineering (`retryPaymentFulfillmentCore`). No transaction at all but Paystack shows success → engineering replays the webhook.
- **Expected result:** tickets visible; transaction `successful`.
- **Escalation:** engineering within the hour; open an incident if more than one buyer is affected (`../incident-response/webhook-and-mass-payment-failure.md`).

### 2. "I was charged twice"
- **Diagnosis:** two `successful` transactions with different references for the same buyer/event? Or one charge plus a pending bank authorization?
- **Steps:** genuine duplicate → Finance › Transactions › [second] › **Refund** (finance_admin, step-up, reason "duplicate charge"). Authorization only → explain it drops off.
- **Expected result:** second transaction `refund_pending` → `refunded`.
- **Escalation:** finance_admin for the refund.

### 3. "My refund hasn't arrived"
- **Diagnosis:** Finance › Refunds: `refund_pending` (Paystack not yet confirmed) or `refunded` (bank timing) or `successful` with `refund_requested_at` (failed).
- **Steps:** pending < 3 working days → explain timing. Pending longer → finance checks Paystack dashboard. Failed → **Refund** again from the transaction (retry). Refunded → give the Paystack confirmation date; the bank/MoMo provider controls the rest.
- **Escalation:** finance_admin; engineering if the webhook is failing.

### 4. "How do I cancel my ticket?" / "Cancel it for me"
- **Steps:** point to the help article (self-service, fee retained). Support cannot cancel a ticket on the user's behalf; if they cannot access their account, solve sign-in first (scenario 10).

### 5. "The organizer cancelled — where is my money?"
- **Diagnosis:** the event `canceled`; their transaction should be `refund_pending`/`refunded`.
- **Steps:** if still `successful`, finance runs **Refund** on it (the automatic request failed). Explain fee retention and timing.
- **Escalation:** finance_admin.

### 6. Organizer: "My payout hasn't been paid" / "Balance is wrong"
- **Diagnosis:** Finance › Organizers › [id]: outstanding, pending (unsettled events — 48 h after the event), held (refunds), payouts and their status/review.
- **Steps:** `processing` → finance processes per the payout procedure; `required` review → finance clears or explains; balance dispute → walk through the ledger entries with them (earnings 100% of price, refund holds, promoter commissions).
- **Escalation:** finance_admin.

### 7. Organizer cannot request a payout
- **Diagnosis:** no available balance (events not settled), no payout account, or "balance stale".
- **Steps:** explain settlement; have them add a payout account; if they truly cannot use the app, finance can **Create payout** on their behalf (recorded request in the thread).

### 8. Place owner: "Someone else controls my listing"
- **Steps:** point to *Claim this place*; when the claim arrives, Claims › review with evidence. If two parties claim, request documents from both through Support and record notes.
- **Escalation:** founder for contested claims.

### 9. Place owner: "Wrong hours / photos / closed"
- **Steps:** they edit under Manage › Places (help article). Only the owner can edit; admins cannot. If they are not the owner → scenario 8.

### 10. "I can't sign in" / "No code arrives"
- **Diagnosis:** which method? Phone: Hubtel health, number format (+233), rate limits (per IP/hour, 60 s cooldown, 5 attempts). Email: Supabase Auth SMTP (Resend) health, spam folder. Google: try another method with the same email.
- **Steps:** check Monitoring health for `hubtel` / `resend`; advise waiting out the cooldown; suggest an alternative method. Never read codes to a user (staff cannot see them anyway).
- **Escalation:** engineering if the provider is down (incident).

### 11. "Your account is restricted"
- **Diagnosis:** Users › [id] status Suspended/Banned; read the audit reason and notes.
- **Steps:** explain the reason at the level appropriate; if they contest, gather their side in the thread and escalate. Restoring needs `users.restore` and, for bans, the founder's decision.
- **Escalation:** founder.

### 12. "Delete my account / send me my data"
- **Steps:** deletion → help article (self-service). Data request → `../privacy/privacy-rights-operations.md` §1; record an admin note.
- **Escalation:** engineering for the export; founder/counsel for anything unusual.

### 13. Push notifications not arriving (app)
- **Diagnosis:** notifications exist in the app list? device registered (they signed in on this phone)? Expo health green?
- **Steps:** phone settings permission; sign out and in to re-register the device; Notifications › Resend as a test.
- **Escalation:** engineering if Expo is failing broadly.

### 14. Emails not arriving
- **Diagnosis:** address on Settings › Security correct? Resend health? Resend dashboard shows bounce/spam?
- **Steps:** correct the address; Resend the notification; check suppression in Resend.
- **Escalation:** engineering.

### 15. "This event is fake" / "I was scammed"
- **Steps:** create a report on their behalf? — no: ask them to report from the event (keeps the trail), or a moderator acts directly in Content. Moderator hides the event; finance holds the organizer's payouts and checks disputes; if confirmed, cancel the event (refunds) and ban the organizer.
- **Escalation:** `../incident-response/payment-fraud-and-duplicates.md`.

### 16. Harassment in messages
- **Steps:** advise **Block** and **Report** in the conversation; moderator reviews the reported thread (only then readable), hides messages, suspends the sender if warranted.
- **Escalation:** safety concerns → founder; threats of violence → advise contacting the police.

### 17. "Remove this review"
- **Steps:** owners/organizers cannot remove reviews; they may reply once and report. Moderators remove only for policy breaches (fake, abusive, personal data). A merely negative review stays.

### 18. Rewards: "My credit / referral is missing"
- **Steps:** explain the programme's availability status first. Rewards › Accounts › [user] shows decisions and reasons (not to be quoted verbatim if they contain risk flags — say "did not qualify" and the qualifying conditions). See `../architecture/rewards-ledger.md` runbook for the SQL.
- **Escalation:** finance_admin for adjustments.

### 19. Promo code not working
- **Diagnosis:** code belongs to that event? usage limit reached? percentage valid? Buyer rate-limited (20 lookups/min)?
- **Steps:** organizer checks Promo codes on the event; buyer retries after a minute.

### 20. "My promotion isn't showing"
- **Diagnosis:** promotion `starts_at`/`ends_at` in Finance › Transactions trace; listing `restricted`/`hidden`? location of the viewer?
- **Steps:** explain featured placement is per location and excludes restricted listings.
- **Escalation:** finance for a refund only if Abonten failed to deliver.

### 21. A field team member published wrong information
- **Steps:** the listing belongs to the **owner**, who can edit it; the lead can send the onboarding back (`needs_changes`) before verification; after verification an admin decides the flag / reverses the commission if it was fraudulent. See `../field-operations/duplicates-and-corrections.md`.
- **Escalation:** field_ops_manager.
