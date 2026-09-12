---
title: Runbook — leaked API key or secret
purpose: Rotate a leaked credential and assess what it could have been used for.
audience: Engineering, founder
scope: Every secret in security/secrets-and-environment.md
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — leaked API key or secret

Severity: S1 for `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, provider account passwords; S2 for Cloudinary/Resend/Hubtel/Sentry tokens; S3 for public keys (anon key, DSNs, Maps key — these are public by design but should be restricted).

1. **Detect:** committed to git (secret scanner, `npm run check:docs` secret patterns, GitHub alert), pasted in chat, in a log, in Sentry, reported by a provider.
2. **Confirm:** which secret, where, since when; `git log -S` for commits; provider dashboards for unusual usage.
3. **Contain — rotate first, investigate second:**
   | Secret | Rotate at | Then update |
   |---|---|---|
   | Supabase service-role / anon key | Supabase dashboard → API keys | Vercel web + admin, EAS (anon), CI secrets, cron command (SEC-004), `.env.test.local` |
   | Paystack secret / webhook secret | Paystack dashboard | Vercel web (+ admin for secret), webhook URL settings |
   | Cloudinary API secret | Cloudinary console | Vercel web + admin |
   | Resend key | Resend dashboard | Vercel web; Supabase Auth SMTP password |
   | Hubtel client secret | Hubtel portal | Vercel web |
   | Sentry auth token | Sentry settings | Vercel, CI, EAS secret |
   | `OBSERVABILITY_INGEST_SECRET` | generate | Vercel web + admin, `observability_config` row |
   | Notification delivery token | generate | `notification_delivery_config` row only |
   | Google Maps key | Google Cloud console (or restrict) | Vercel, EAS |
   Redeploy web and admin; `eas update` if an `EXPO_PUBLIC_*` value changed.
4. **Preserve:** the leaking artifact (do not force-push history away until evidence is saved), provider usage logs.
5. **Assess:** what the key allowed: service-role → full data read/write (treat as potential data breach → `pii-exposure-and-data-breach.md`); Paystack secret → refunds/transfers (check Paystack transactions and transfers); Cloudinary → media deletion/upload; Resend → email sending as Abonten (phishing risk).
6. **Escalate:** commander; counsel if data could have been read; Paystack support for suspicious money movement.
7. **Remediate:** purge the secret from git history if committed (rewrite + force-push after coordination) — rotation already made it useless; add a scanner rule if a new pattern.
8. **Communicate:** users only if data or money was affected.
9. **Verify:** health probes green with new keys; a test payment; a test SMS/email; Sentry receiving.
10. **Document:** incident row; rotation date in `../security/secrets-and-environment.md`.
11. **Review:** why it leaked; add pre-commit secret scanning if missing.
