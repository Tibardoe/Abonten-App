---
title: Documentation ↔ code audit matrix
purpose: Record, per feature, where it exists (web, mobile, admin, backend), whether it is documented and accurately, and the gap — so nobody has to guess whether the docs match the product.
audience: Documentation maintainers, product, QA
scope: Every significant feature as of 2026-09-12
status: Approved
version: 1.1
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Documentation ↔ code audit matrix

Legend: ✅ exists · 🟡 partial · ❌ absent · — not applicable. "Documented" = a current document covers it; "Accurate" = checked against code in this programme. For *which* documents cover each feature, see [documentation-coverage-matrix.md](documentation-coverage-matrix.md); for the gaps that need a decision before anything is built, see [specifications/README.md](specifications/README.md).

| Feature | Web | Mobile | Admin | Backend | Documented | Accurate | Gap / note |
|---|---|---|---|---|---|---|---|
| Google sign-in | ✅ | ✅ | ✅ (staff) | Supabase Auth | ✅ help, security | ✅ | — |
| Phone OTP sign-in | ✅ | ✅ | ❌ | `phoneAuthCore` | ✅ | ✅ | — |
| Email OTP sign-in | ✅ | ✅ | ❌ | `emailAuthCore` | ✅ | ✅ | Supabase SMTP must be Resend in prod (owner task) |
| Consent to Terms at sign-in | ✅ (new) | ✅ (fixed URL) | — | — | ✅ legal register | ✅ | Legal C1: is "continuing" sufficient? |
| Profile, avatar, username | ✅ | ✅ | read | ✅ | ✅ | ✅ | — |
| Change phone / email | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
| Delete account | ✅ | ✅ | ❌ (no admin tool) | `deleteAccountCore` | ✅ | ✅ | Events not cancelled on deletion; Cloudinary media not purged; no grace period (O5) |
| Suspend / ban / restore | — | — | ✅ | `setUserStatusCore` | ✅ | ✅ | No RLS keyed on status (session revocation load-bearing) |
| Discovery (explore, filters, nearby) | ✅ | ✅ | read | 7 RPCs | ✅ | ✅ | — |
| Search | ✅ | ✅ | ✅ global search | matview | ✅ | ✅ | Results list is events-only (places in suggestions) |
| Maps | ✅ Google JS | ✅ RN maps | ✅ territories | geocode proxy | ✅ | ✅ | Not keyboard-navigable (a11y gap) |
| Event detail, favourite, share | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
| Event reminders | ❌ | ✅ local | — | — | ✅ | ✅ | Mobile-only, device-local |
| Free RSVP | ✅ | ✅ | — | `issue_free_ticket` | ✅ | ✅ | — |
| Paid checkout, hold, limits, promo | ✅ | ✅ | trace | `create_ticket_checkout` | ✅ | ✅ | — |
| Payment (card / MoMo / saved) | ✅ | ✅ | trace | `finalizePaystackPayment` | ✅ | ✅ | Paystack test vs live key visibility (residual risk) |
| Fulfilment retry | ✅ | ✅ | — | `retryPaymentFulfillmentCore` | ✅ | ✅ | — |
| Tickets, QR, PDF, email | ✅ | ✅ | tickets.view | ✅ | ✅ | ✅ | QR encodes `/verify/<code>` which has no web route (known) |
| QR scanner check-in | ❌ list only | ✅ camera | — | `checkInTicketCore` | ✅ | ✅ | Web has no scanner (D4) |
| Cancel ticket / refund | ✅ | ✅ | ✅ admin refund | `issueRefundCore` | ✅ | ✅ | Fee retained (legal E2) |
| Wallet (saved methods) | ✅ | ✅ | — | `paymentMethodCore` | ✅ | ✅ | — |
| Transactions history | ✅ | ✅ | ✅ | RPCs | ✅ | ✅ | — |
| Event create / edit / draft | ✅ | ✅ | read | `postEventCore` | ✅ | ✅ | — |
| Event cancellation + refunds | ✅ | ✅ | ❌ (engineer via service role) | RPC + core | ✅ | ✅ | No admin cancel button (recorded) |
| Promo codes | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
| Promoter commission | ✅ | ✅ | ✅ view | rewards engine | ✅ | ✅ | Pays only when rewards live |
| Promotions (featuring) | ✅ | ✅ | finance | activation modules | ✅ | ✅ | Tier prices are DB-seeded; docs avoid hard-coding |
| Attendees, insights, dashboard | ✅ | ✅ | analytics | RPCs | ✅ | ✅ | Attendee contacts exposure (M4) |
| Organizer finance, payouts | ✅ | ✅ | ✅ settle/create | ledger RPCs | ✅ | ✅ | Transfers flag off; no payout SLA (F1) |
| Place create / manage | ✅ | ✅ | read | `postPlaceCore`… | ✅ | ✅ | — |
| Place claims | ✅ | ✅ | ✅ | `approve_place_claim` | ✅ | ✅ | Legacy `/admin/place-claims` web page superseded |
| Bookings | ✅ | ✅ | — | ✅ | ✅ | ✅ | Unpaid requests only |
| Place / event reviews + replies | ✅ | ✅ | ✅ content | ✅ | ✅ | ✅ | `review` table is person-to-person (naming) |
| Highlights | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | No comments/reactions (by design) |
| Messaging (text, media, voice, reactions) | ✅ (no voice) | ✅ | support + reported | 13 RPCs | ✅ | ✅ | No retention / conversation deletion (R3) |
| Support conversation | ✅ | ✅ | ✅ queue | ✅ | ✅ | ✅ | support@abontenhub.com added 2026-09-12 (Workspace alias, not routed into the admin queue); hours/SLA O1 |
| Reports | ✅ | ✅ | ✅ | `submitReportCore` | ✅ | ✅ | No appeals (O4); no auto-hide (M1) |
| Moderation | — | — | ✅ | `apply_moderation_action` | ✅ | ✅ | Media not purged on remove |
| Notifications in-app | ✅ | ✅ | ✅ ops | ✅ | ✅ | ✅ | No per-type preferences |
| Push | ❌ | ✅ | resend | Expo | ✅ | ✅ | iOS push credentials unchecked |
| Emails (ticket, cancel, rewards, OTP) | ✅ | ✅ | resend | Resend | ✅ | ✅ | Only reward emails have opt-out |
| Rewards / credit | ✅ (gated) | ✅ (gated) | ✅ module | ledger + engine | ✅ | ✅ | **Shadow mode; not public** — docs say so |
| Referrals / invites | ✅ | ✅ (+ install referrer) | ✅ | ✅ | ✅ | ✅ | Same |
| Field programme | ✅ `/field` | ❌ screens (API only) | ✅ module | ✅ | ✅ | ✅ | **Switched off**; mobile has API twins but no UI |
| Admin RBAC, step-up, audit | — | — | ✅ | ✅ | ✅ | ✅ | PII views not logged |
| Finance ops centre | — | — | ✅ | ✅ | ✅ | ✅ | Send-via-Paystack button not built (flag off) |
| Monitoring, incidents, analytics | — | — | ✅ | probes, tables | ✅ | ✅ | Observability tables have no retention (R6) |
| Legal pages | ✅ (new) | opens web | — | static | ✅ | ✅ | Drafts; Review required; no effective date |
| Help centre | ✅ (new) | opens web | — | static | ✅ | ✅ | English only |
| Cookie consent banner | ❌ | — | — | — | ✅ (recorded absent) | ✅ | Legal B4 / decision S5 |
| Age gate | ❌ | ❌ | — | — | ✅ (recorded absent) | ✅ | Legal B7 / decision O6 |
| Data export (DSAR) | ❌ | ❌ | ❌ | — | ✅ (manual procedure) | ✅ | Decision O3 |
| iOS app | — | ❌ never built | — | — | ✅ | ✅ | D-U-N-S blocker (D2) |
| Subscriptions / plans | redirect only | ❌ | — | legacy tables | ✅ | ✅ | Removed 2026-08-26; tables kept for history |
| `wallet`, `story`, `event_media`, `media_audit` tables | — | — | — | unused | ✅ | ✅ | Do not build on without decision |

## Obsolete or contradictory documentation found and how it was handled

| Item | Handling |
|---|---|
| `README.md` = create-next-app boilerplate | Rewritten |
| `PRD.md` = "Coming Soon..." | Left as is (out of scope); noted |
| `PROJECT.md §8` says phone OTP incomplete / `authContext.tsx` exists | Section already carries a correction note; the current auth model is documented in `security/application-security.md`; §29 pointer added |
| `PROJECT.md §9/§10` "no payment gateway" | Later sections correct it; architecture docs describe the current state |
| `docs/mobile/13-web-mobile-parity-audit.md` parity gaps (claims, place reviews, bookings on mobile) | Closed by `docs/mobile/14-web-parity-round2.md`; matrix reflects current state |
| `docs/audit/01-limitations-register.md` LOW-001/LOW-002 | Marked not reproducible in the register itself |
| Mobile sign-in linked `abonten.com/terms` | Fixed in code |
| Footer legal/social links `#` | Fixed in code |

## Backend capabilities not exposed in UI

Paystack Transfers send (`sendPayoutAdminCore`) — no button; `admin_create_payout` exposed; field-ops mobile API routes — no mobile screens; `credit_grant_goodwill` — exposed in Rewards module; `get_event_attendee_contacts` — exposed to organizers.

## UI features with incomplete backend support

None found that ship a broken path; the QR's `/verify/<code>` URL has no web route (scanner uses the in-app parser).
