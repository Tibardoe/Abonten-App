---
title: Abonten Hub documentation hub
purpose: The single entry point to every document — by audience, by topic, and by the symptom or question you have.
audience: Everyone
scope: docs/** and the public content in apps/web/src/content
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Abonten Hub documentation hub

How the system works: [README.md](README.md) · Writing rules: [DOCUMENTATION_STANDARD.md](DOCUMENTATION_STANDARD.md) · Registers: [LEGAL_REVIEW_REQUIRED.md](LEGAL_REVIEW_REQUIRED.md), [OPERATIONAL_DECISIONS_REQUIRED.md](OPERATIONAL_DECISIONS_REQUIRED.md) · Coverage: [documentation-audit-matrix.md](documentation-audit-matrix.md) · [changelog/README.md](changelog/README.md)

## I have a problem — where do I look?

| You are seeing / being asked… | Go to |
|---|---|
| "I paid but got no ticket" / ticket missing / paid no ticket | [admin/support-scenarios.md](admin/support-scenarios.md) §1 · [finance/payments-and-ticketing-runbook.md](finance/payments-and-ticketing-runbook.md) §6 |
| Charged twice / duplicate payment | [admin/support-scenarios.md](admin/support-scenarios.md) §2 · [incident-response/payment-fraud-and-duplicates.md](incident-response/payment-fraud-and-duplicates.md) §D |
| Refund missing / refund failed / refund pending | [finance/refunds-and-cancellations.md](finance/refunds-and-cancellations.md) |
| Organizer cancelled an event | [finance/refunds-and-cancellations.md](finance/refunds-and-cancellations.md) §B |
| Payout not paid / balance wrong / held for review | [finance/settlement-ledger-and-payouts.md](finance/settlement-ledger-and-payouts.md) |
| Chargeback / dispute | [finance/disputes-and-chargebacks.md](finance/disputes-and-chargebacks.md) |
| Cannot sign in / OTP / email code | [troubleshooting/README.md](troubleshooting/README.md) · scenario 10 |
| Account restricted / appeal | [admin/users.md](admin/users.md) · help `account/restricted-accounts` |
| Delete my account / data request / privacy complaint | [privacy/privacy-rights-operations.md](privacy/privacy-rights-operations.md) |
| Personal data may have leaked | [incident-response/pii-exposure-and-data-breach.md](incident-response/pii-exposure-and-data-breach.md) |
| A secret / API key leaked | [incident-response/leaked-secret.md](incident-response/leaked-secret.md) |
| Admin account compromised | [incident-response/admin-compromise.md](incident-response/admin-compromise.md) |
| Paystack / Hubtel / Resend / Supabase down | [incident-response/outages-service-email-push-third-party.md](incident-response/outages-service-email-push-third-party.md) |
| Emails or pushes not arriving | [operations/notifications-and-email-operations.md](operations/notifications-and-email-operations.md) |
| Event / place missing from search | [troubleshooting/README.md](troubleshooting/README.md) |
| Fake event / scam / harassment / fake review / bad image | [operations/content-moderation-policy.md](operations/content-moderation-policy.md) · [incident-response/abuse-spam-impersonation.md](incident-response/abuse-spam-impersonation.md) |
| Place ownership dispute / claim | [admin/claims.md](admin/claims.md) |
| Reward credit wrong / referral not credited | [operations/rewards-operations.md](operations/rewards-operations.md) · [architecture/rewards-ledger.md](architecture/rewards-ledger.md) |
| Field agent published wrong info / commission dispute | [field-operations/duplicates-and-corrections.md](field-operations/duplicates-and-corrections.md) · [incident-response/field-agent-compromise.md](incident-response/field-agent-compromise.md) |
| Error spike / Sentry alert | [incident-response/sentry-and-error-rate.md](incident-response/sentry-and-error-rate.md) |
| Need to switch a programme off | [deployment/rollback-and-recovery.md](deployment/rollback-and-recovery.md) |
| Everything else | [operations/what-do-i-do-when.md](operations/what-do-i-do-when.md) |

## Public documents (served by the website)

| Document | Route | Source |
|---|---|---|
| Terms and Conditions | `/legal/terms` | `apps/web/src/content/legal/terms.md` |
| Privacy Policy | `/legal/privacy` | `apps/web/src/content/legal/privacy-policy.md` |
| Cookie Policy | `/legal/cookies` | `apps/web/src/content/legal/cookie-policy.md` |
| Security at Abonten | `/legal/security` | `apps/web/src/content/legal/security.md` |
| Help centre (26 pages: customers, organizers, place owners, account) | `/help` | `apps/web/src/content/help/` — index in [user-guide/README.md](user-guide/README.md) |

Register, versioning and effective dates: [legal/README.md](legal/README.md), [legal/versioning-and-effective-dates.md](legal/versioning-and-effective-dates.md).

## By audience

**Support and operations** — [admin/README.md](admin/README.md) (handbook), [admin/support-scenarios.md](admin/support-scenarios.md), [operations/what-do-i-do-when.md](operations/what-do-i-do-when.md), [operations/account-and-support-procedures.md](operations/account-and-support-procedures.md), [troubleshooting/README.md](troubleshooting/README.md), [user-guide/README.md](user-guide/README.md)

**Moderators** — [operations/content-moderation-policy.md](operations/content-moderation-policy.md), [admin/reports-and-moderation.md](admin/reports-and-moderation.md), [admin/content.md](admin/content.md), [admin/users.md](admin/users.md)

**Finance** — [finance/README.md](finance/README.md) and its six runbooks, [admin/finance.md](admin/finance.md), [admin/rewards.md](admin/rewards.md), [field-operations/earnings-and-payouts.md](field-operations/earnings-and-payouts.md)

**Field teams** — [field-operations/README.md](field-operations/README.md) and its eleven pages; admins: [admin/field-ops.md](admin/field-ops.md)

**Engineering** — [architecture/README.md](architecture/README.md), [development/README.md](development/README.md), [deployment/README.md](deployment/README.md), [security/README.md](security/README.md), [operations/scheduled-jobs.md](operations/scheduled-jobs.md), root `PROJECT.md`, `CLAUDE.md`

**Founder / legal / compliance** — [LEGAL_REVIEW_REQUIRED.md](LEGAL_REVIEW_REQUIRED.md), [OPERATIONAL_DECISIONS_REQUIRED.md](OPERATIONAL_DECISIONS_REQUIRED.md), [privacy/](privacy/data-inventory.md), [legal/](legal/README.md), [security/README.md](security/README.md), [incident-response/README.md](incident-response/README.md)

## By folder (every document)

- **legal/** — [README](legal/README.md) · [versioning-and-effective-dates](legal/versioning-and-effective-dates.md)
- **privacy/** — [data-inventory](privacy/data-inventory.md) · [data-retention-and-deletion](privacy/data-retention-and-deletion.md) · [privacy-rights-operations](privacy/privacy-rights-operations.md) · [cookies-and-storage-inventory](privacy/cookies-and-storage-inventory.md) · [third-party-processors](privacy/third-party-processors.md)
- **security/** — [README](security/README.md) · [application-security](security/application-security.md) · [database-security](security/database-security.md) · [payment-security](security/payment-security.md) · [infrastructure-and-provider-responsibilities](security/infrastructure-and-provider-responsibilities.md) · [secrets-and-environment](security/secrets-and-environment.md) · [access-control-model](security/access-control-model.md)
- **incident-response/** — [README](incident-response/README.md) · [account-takeover](incident-response/account-takeover.md) · [admin-compromise](incident-response/admin-compromise.md) · [field-agent-compromise](incident-response/field-agent-compromise.md) · [leaked-secret](incident-response/leaked-secret.md) · [database-exposure](incident-response/database-exposure.md) · [payment-fraud-and-duplicates](incident-response/payment-fraud-and-duplicates.md) · [webhook-and-mass-payment-failure](incident-response/webhook-and-mass-payment-failure.md) · [unauthorized-refunds](incident-response/unauthorized-refunds.md) · [abuse-spam-impersonation](incident-response/abuse-spam-impersonation.md) · [malicious-content-and-uploads](incident-response/malicious-content-and-uploads.md) · [pii-exposure-and-data-breach](incident-response/pii-exposure-and-data-breach.md) · [vulnerability-report](incident-response/vulnerability-report.md) · [outages-service-email-push-third-party](incident-response/outages-service-email-push-third-party.md) · [sentry-and-error-rate](incident-response/sentry-and-error-rate.md)
- **admin/** — [README](admin/README.md) · [dashboard](admin/dashboard.md) · [users](admin/users.md) · [reports-and-moderation](admin/reports-and-moderation.md) · [content](admin/content.md) · [claims](admin/claims.md) · [catalog](admin/catalog.md) · [finance](admin/finance.md) · [rewards](admin/rewards.md) · [field-ops](admin/field-ops.md) · [notifications](admin/notifications.md) · [monitoring-and-incidents](admin/monitoring-and-incidents.md) · [analytics](admin/analytics.md) · [audit-logs](admin/audit-logs.md) · [settings-and-rbac](admin/settings-and-rbac.md) · [support](admin/support.md) · [support-scenarios](admin/support-scenarios.md)
- **field-operations/** — [README](field-operations/README.md) · [roles-and-permissions](field-operations/roles-and-permissions.md) · [working-a-day](field-operations/working-a-day.md) · [onboarding-places](field-operations/onboarding-places.md) · [onboarding-organizers-and-events](field-operations/onboarding-organizers-and-events.md) · [claim-assistance](field-operations/claim-assistance.md) · [content-creator](field-operations/content-creator.md) · [evidence-photo-and-content-standards](field-operations/evidence-photo-and-content-standards.md) · [duplicates-and-corrections](field-operations/duplicates-and-corrections.md) · [earnings-and-payouts](field-operations/earnings-and-payouts.md) · [team-lead-guide](field-operations/team-lead-guide.md) · [conduct-privacy-security](field-operations/conduct-privacy-security.md)
- **finance/** — [README](finance/README.md) · [payments-and-ticketing-runbook](finance/payments-and-ticketing-runbook.md) · [state-machines](finance/state-machines.md) · [refunds-and-cancellations](finance/refunds-and-cancellations.md) · [settlement-ledger-and-payouts](finance/settlement-ledger-and-payouts.md) · [reconciliation](finance/reconciliation.md) · [disputes-and-chargebacks](finance/disputes-and-chargebacks.md) · [credit-tender-and-rewards-finance](finance/credit-tender-and-rewards-finance.md)
- **operations/** — [what-do-i-do-when](operations/what-do-i-do-when.md) · [content-moderation-policy](operations/content-moderation-policy.md) · [notifications-and-email-operations](operations/notifications-and-email-operations.md) · [rewards-operations](operations/rewards-operations.md) · [account-and-support-procedures](operations/account-and-support-procedures.md) · [scheduled-jobs](operations/scheduled-jobs.md) · [deployment-and-release](operations/deployment-and-release.md)
- **troubleshooting/** — [README](troubleshooting/README.md)
- **journeys/** — [README](journeys/README.md) · [customer](journeys/customer.md) · [organizer](journeys/organizer.md) · [place-owner](journeys/place-owner.md) · [field-agent](journeys/field-agent.md) · [admin](journeys/admin.md)
- **web/** — [README](web/README.md)
- **mobile/** — [README](mobile/README.md) · [guide/navigation-and-screens](mobile/guide/navigation-and-screens.md) · [guide/permissions-notifications-and-device](mobile/guide/permissions-notifications-and-device.md) · [guide/ios-vs-android](mobile/guide/ios-vs-android.md) · history: `00-phase-0-findings` … `16-refinement-followups` (build logs, not current product docs)
- **user-guide/** — [README](user-guide/README.md)
- **architecture/** — [README](architecture/README.md) · [system-overview](architecture/system-overview.md) · [feature-inventory](architecture/feature-inventory.md) · [roles-and-permissions](architecture/roles-and-permissions.md) · [data-model-overview](architecture/data-model-overview.md) · [integrations](architecture/integrations.md) · [shared-backend](architecture/shared-backend.md) · [rewards-ledger](architecture/rewards-ledger.md) · [field-ops](architecture/field-ops.md) · [email-auth](architecture/email-auth.md)
- **development/** — [README](development/README.md) · [setup](development/setup.md) · [testing](development/testing.md) · [ci](development/ci.md) · [conventions](development/conventions.md) · [documentation-validation](development/documentation-validation.md)
- **deployment/** — [README](deployment/README.md) · [web-and-admin-vercel](deployment/web-and-admin-vercel.md) · [mobile-eas](deployment/mobile-eas.md) · [supabase-migrations](deployment/supabase-migrations.md) · [release-checklist](deployment/release-checklist.md) · [rollback-and-recovery](deployment/rollback-and-recovery.md)
- **audit/** — [00-system-map](audit/00-system-map.md) · [01-limitations-register](audit/01-limitations-register.md) · [02-remediation-roadmap](audit/02-remediation-roadmap.md) (2026-09-04 snapshot)
- **changelog/** — [README](changelog/README.md)

## Keywords

payments · Paystack · webhook · refund · service fee · settlement · payout · ledger · reconciliation · dispute · chargeback · ticket · QR · check-in · checkout hold · promo code · promotion · featuring · promoter commission · organizer · place owner · claim · verified · booking · review · highlight · messaging · support conversation · report · moderation · hidden · removed · restricted · suspend · ban · restore · RBAC · step-up · audit log · Abonten Credit · rewards · referral · invite · loyalty · rebate · shadow mode · field team · onboarding · owner OTP · consent link · commission · sweep · payout batch · notifications · push · Expo · Resend · Hubtel · OTP · Google sign-in · RLS · service role · SECURITY DEFINER · migrations · MCP · Vercel · EAS · Sentry · health check · incident · kill switch · cookies · `abn_ref` · `abn_did` · data inventory · retention · deletion · DSAR · Act 843 · Act 772 · Act 1038
