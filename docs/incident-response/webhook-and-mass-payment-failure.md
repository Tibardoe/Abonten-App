---
title: Runbook — webhook failure and mass payment failures
purpose: Restore payment finalisation when Paystack webhooks stop arriving or many payments fail or hang.
audience: Engineering, finance
scope: /api/paystack/webhook, finalizePaystackPayment, payment_attempt states
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — webhook failure and mass payment failures

Severity S1 while ongoing (buyers charged without tickets).

1. **Detect:** reconciliation incident "succeeded payment with no ticket" or "attempt stuck processing"; error groups / Sentry on the webhook route (signature failures, 5xx); Paystack dashboard shows webhook retries failing; support tickets "paid, no ticket".
2. **Confirm:** Finance › Transactions filter recent attempts: many `pending`/`processing`/`fulfillment_failed`? Health `paystack`? Vercel logs for `/api/paystack/webhook` (status codes). Was there a deploy or an env change (`PAYSTACK_WEBHOOK_SECRET`)?
3. **Contain:** the client-verify path independently finalizes payments, so most buyers self-heal by staying on the page or pressing Retry. If a deploy broke finalize: **roll back** on Vercel. If the webhook secret changed: fix the env and redeploy. If Paystack itself is down: nothing to fix in-app; pending checkouts keep their seats while attempts are live.
4. **Preserve:** note the window; export affected `payment_attempt` rows.
5. **Assess:** count of attempts in non-terminal states in the window; buyers affected.
6. **Escalate:** commander; Paystack support if their side.
7. **Remediate:** after the cause is fixed — the reaper (`recover_stale_payment_attempts`, every 5 min) moves stuck `processing` rows to `fulfillment_failed`/`pending`; for each affected attempt run `retryPaymentFulfillmentCore` (an engineer can script it) or ask buyers to press Retry; replay missed webhooks from the Paystack dashboard (idempotent). Check `record_platform_fee` rows exist (non-fatal path).
8. **Communicate:** Broadcast to affected buyers if many ("your tickets are being issued; no action needed"); support macro.
9. **Verify:** reconciliation clean; a fresh test payment finalizes via both paths; webhook 200s in Vercel logs.
10. **Document / 11. Review:** add alerting on webhook non-2xx rate (improvement).
