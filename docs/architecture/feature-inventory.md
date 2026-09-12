---
title: Feature inventory
purpose: One row per feature — application, role, entry point, preconditions, workflow, tables, services/actions/API, permissions, notifications, emails, payments, integrations, failure states, admin controls, audit, docs.
audience: Engineering, product, QA, documentation maintainers
scope: All shipped functionality as of 2026-09-12 (web, mobile, admin, backend)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Feature inventory

Legend — App: W web, A Android app, C admin console, B backend-only. Role: Cu customer, Or organizer, Ow place owner, F field team, Ad admin. "Service" = `packages/services/src/…`; "Action" = `apps/web/src/actions/…`; "API" = `/api/mobile/…`.

## Identity and account

| Feature | App | Role | Entry point | Workflow / preconditions | Tables | Service / action / API | Notifications / email | Failure states | Admin / audit | Docs |
|---|---|---|---|---|---|---|---|---|---|---|
| Google sign-in | W A | all | AuthModal / sign-in screen | Supabase OAuth; callback exchanges code | `auth.users`, `user_info` (trigger) | `auth/callback/route.ts`; mobile native | — | redirect not allow-listed | — | help getting-started |
| Phone OTP sign-in | W A | all | same | request → Hubtel SMS → verify → find-or-create → one-time password → session | `phone_otp_state`, `phone_otp_send_log` | `profile/phoneAuthCore`, `hubtelOtpClient`, `phoneOtpStore`; actions `requestPhoneVerification`, `verifyPhoneSignIn`; API `auth/phone/{request,verify}` | SMS | rate limits (10/h IP, 60 s, 5 attempts), Hubtel down | health `hubtel` | security/application-security |
| Email OTP sign-in | W A | all | same | Supabase `signInWithOtp` + app caps → verify | — (Supabase) | `profile/emailAuthCore`; actions `requestEmailOtp`, `verifyEmailSignIn`; API `auth/email/request` | email (Supabase SMTP via Resend) | caps, SMTP misconfig | — | architecture/email-auth |
| Profile edit / avatar | W A | all | Settings › Edit profile | crop → signed Cloudinary upload → save | `user_info`, `user_image_history` | actions `updateUserDetails`, `getAvatarUploadSignature`, `saveAvatarToSupabase`; API `profile`, `uploads/signature` | — | upload limits | — | help account/profile |
| Change phone / email | W A | all | Settings › Security | OTP to new contact | `phone_otp_state`; Supabase `email_change` | `profile/updateVerifiedPhoneCore`; API `account/phone/*` | SMS / email | limits | — | help account/profile |
| Delete account | W A | all | Settings › Security | `credit_close_account` → `auth.admin.deleteUser`; cascades | many (see privacy) | `profile/deleteAccountCore`; action `deleteUser`; API `account/delete` | — | credit close non-fatal | none (user-only) | privacy/data-retention |
| Suspension / ban | C | Ad | Users | `setUserStatusCore`; global sign-out; enforced in proxy + `getMobileAuth` | `user_info.status_id` | `admin/users/usersAdminCore` | — | admin cannot be suspended | `users.suspend/ban/restore`; audit `user.status.*` | admin/users |
| Language / appearance | W A | all | Settings | cookie `NEXT_LOCALE` / SecureStore; next-themes | — | action `setUserLocale` | — | — | — | web/README |

## Discovery

| Feature | App | Role | Entry | Workflow | Tables / RPCs | Service / action / API | Failure | Docs |
|---|---|---|---|---|---|---|---|---|
| Explore by location, featured, nearby | W A | all | Home/Explore | location → RPCs with moderation filter | `event`, `place`, `event_promotion`, `place_promotion`; `get_filtered_events`, `get_nearby_events`, `get_filtered_places`, `get_nearby_places`, `get_active_place_promotions`, `get_events_in_window` | actions `getFilteredEvents`, `getNearByEvents`, `getQueriedPlaces`, `getActivePlacePromotions`…; API `events`, `places` | stale matview, hidden content | help finding-events |
| Search + suggestions | W A | all | Search | `event_search` matview (15 min) | `event_search` | action `getSearchSuggestions`, `getQueriedEvents` | stale | troubleshooting |
| Map views | W A | all | list toggle | Google Maps JS (web) / react-native-maps | — | `EventsMapView`, `PlacesMapView`, `SocialMap` | key restrictions | troubleshooting |
| Event / place detail | W A | all | card tap | RLS public branch | `event`, `event_occurrence`, `ticket_type`, `place*` | `getPlaceBySlug`, event page | — | help |
| Favourites | W A | Cu | heart | owner CRUD | `favorite`, `favorite_place` | actions `add/remove*Favorite`, `getUserFavorite*` (class A on mobile) | — | help |
| Share (+ referral) | W A | all | share | link + `recordEventShare` + `abn_ref` | `event_share`, `referral_touch` | `rewards/referralCore` | rate limit 60/h | rewards |
| Event reminders | A | Cu | event page | local notification | device | `features/reminders` | — | mobile guide |

## Buying

| Feature | App | Role | Entry | Workflow | Tables / RPCs | Service / action / API | Payments / notifications | Failure | Admin | Docs |
|---|---|---|---|---|---|---|---|---|---|---|
| Free RSVP | W A | Cu | Register | one per event; window checks | `ticket`, `attendance`; `issue_free_ticket` | `checkout/registerForFreeEventCore`; action `registerForFreeEvent`; API `checkout/free-rsvp` | notification + email | 300 already; 409 window | — | help tickets |
| Paid checkout | W A | Cu | Buy tickets | validate → `create_ticket_checkout` (30-min hold, limits 50/100, promo) | `ticket_checkout`, `ticket_type`, `promo_code_usage` | `checkout/validateCheckoutCore`, `promoUsage`, `ticketInventory`; action `validateCheckout`; API `checkout/validate` | — | sold out, existing checkout, rate limit 30/min | Finance › Transactions | finance runbook |
| Payment (card/MoMo/saved) | W A | Cu | Pay | attempt → Paystack → finalize (client + webhook) → `issue_tickets_for_checkout` → fee | `payment_attempt`, `transaction`, `ticket`, `organizer_ledger_entry`, `platform_fee_entry` | `payments/*`, `apps/web/src/utils/generateTicket.ts`; actions `createMultiCheckoutPaymentAttempt`, `verifyPaystackPayment`, `submitPaystackChargeOtp`, `retryPaymentFulfillment`; API `checkout/attempt`, `payments/*` | Paystack; email w/ PDF; notification + push | declined; stuck → reaper/retry | refund (step-up) | finance runbook |
| Credit tender | W A | Cu | checkout (when live) | reserve → capture / release | `credit_reservation` | `rewards/ticketCreditCore`, `promotionCreditCore`; API `checkout/promotion-credit-quote` | — | stale reservations | Rewards module | finance credit-tender |
| Wallet (saved methods) | W A | Cu | Wallet | card: GHS 1 verification → authorization code; MoMo display | `payment_method` | `payments/paymentMethodCore`, `cardVerificationCore`; API `payment-methods/*` | Paystack | — | — | help payments |
| Tickets, QR, PDF | W A | Cu | My Tickets | — | `ticket` | actions `getTickets`, `getTicketsByIds`; `TicketModal`, `ticketReceiptHtml` | email | — | tickets.view | help your-tickets |
| Cancel ticket / refund | W A | Cu | ticket | `cancelUserTicketCore` → `issueRefundCore` (fee retained) | `ticket`, `transaction`, `organizer_ledger_entry`, `platform_fee_entry` | actions `cancelUserTicket`, `issueRefund`, `getUserTicketRefunds`; API `tickets/cancel` | Paystack refund; webhook | refund failed → retry | Finance › Refunds | finance refunds |
| Transactions history | W A | Cu | Transactions | RPCs `get_user_transaction_summary/history` | `ticket_checkout`, `subscription_checkout` | actions `getUserTransaction*` | — | — | — | help payments |

## Organizer

| Feature | App | Entry | Workflow | Tables / RPCs | Service / action / API | Notifications | Admin | Docs |
|---|---|---|---|---|---|---|---|---|
| Create / edit / draft event | W A | Create; Organizer | drafts autosave; `create_event`; flyer signed upload | `event*`, `ticket_type`, `event_drafts`, `drafts` | `events/postEventCore`, `updateEventCore`, `eventDraftCore`, `updateEventTicketTypesCore`; actions `postEvent`, `updateEvent`, `saveEventDraft`…; API `organizer/events*`, `event-drafts*` | — | Events (read), Content | help organizers |
| Cancel event | W A | event menu | `cancel_event_and_release_tickets` → refunds → emails | `event`, `ticket`, `attendance`, `ticket_checkout`, `transaction`, ledger | `events/cancelEventCore`; action `cancelEvent`; API `organizer/events/cancel` | per attendee + email | — | finance refunds |
| Promo codes | W A | event › Promo codes | CRUD; buyers validate at checkout | `promo_code`, `promo_code_usage` | `promo-codes/*`; API `organizer/promo-codes/*` | — | — | help selling |
| Promoter commission | W A | event › Promoter commission | 1–30 % per event | `event_promoter_commission` | `rewards/promoterCommissionCore`; action `setEventPromoterCommission` | — | Rewards › Promoters | finance credit-tender |
| Promotion (featuring) | W A | Promote | tier → checkout → Paystack → activate | `event_promotion_tier/checkout`, `event_promotion` | `promotions/*`, `utils/activateEventPromotion.ts`; API `checkout/promotion-attempt` | — | Finance | help promoting |
| Attendees + check-in | W A | Insights / Attendees | list; QR scan (A) | `ticket`, `attendance`; `get_event_attendee_contacts` | `tickets/checkInTicketCore`; action `checkInTicket`; API `organizer/tickets/[id]/check-in` | — | — | help event-day |
| Insights / dashboard | W A | Dashboard | RPCs `get_organizer_*`, event analytics | many | actions `getOrganizer*`, `getEvent*Analytics`; API `organizer/dashboard`, `events/[id]/analytics` | — | Analytics | help selling |
| Finance, payout accounts, payouts | W A | Finances | ledger RPCs; `request_organizer_payout` | `organizer_ledger_entry`, `payout`, `payout_account` | `organizer/*`; actions `requestOrganizerPayout`, `addPayoutAccount`…; API `organizer/payout*` | payout completed notice | Finance › Payouts (step-up) | finance settlement |
| Review replies | W A | event › Reviews | one response | `event_review.organizer_response` | `reviews/reviewResponseCore` | — | Content › clear response | help |

## Places

| Feature | App | Role | Workflow | Tables / RPCs | Service / action / API | Admin | Docs |
|---|---|---|---|---|---|---|---|
| Create / edit place, photos, hours, services, status | W A | Ow | drafts; `create_place`; signed uploads; `guard_staff_managed_columns` | `place*`, `place_drafts` | `places/*`; actions `postPlace`, `updatePlace`, `addPlacePhoto`…; API `organizer/places/**` | Places (read), Content | help managing-your-place |
| Claim place | W A | Cu→Ow | request + documents → staff review → `approve_place_claim` | `place_claim_request`, `place_claim_document` | action `submitPlaceClaimRequest`; `admin/claims/claimsAdminCore` | Claims (`claims.review`, audit `claim.*`) | help claiming; admin/claims |
| Booking requests | W A | Cu / Ow | request → accept/decline/cancel | `place_booking` | `places/requestPlaceBookingCore`, `placeBookingsReviewsCore`; API `places/[id]/bookings*`, `organizer/places/[id]/bookings*` | — | help bookings |
| Place reviews + replies | W A | Cu / Ow | one per person; owner response | `place_review`, `place_review_photo` | actions `postPlaceReview`…, `respondToPlaceReview` | Content | help |
| Place insights | W A | Ow | views/clicks | `place_analytics_event` | action `getPlaceInsights`, `logPlaceEngagement` | — | help |
| Place promotion | W A | Ow | tier → checkout → activate | `place_promotion*` | `places/placePromotionCore`, `utils/activatePlacePromotion.ts` | Finance | help promoting |
| Visit QR (rewards) | W A | Ow / Cu | rotating code; ~150 m; daily | `place_visit_key`, `place_visit`, `place_visit_record` | `places/placeVisitCore`; API `places/visits`, `organizer/places/[id]/visit-code` | Rewards | rewards ops |

## Social and safety

| Feature | App | Workflow | Tables / RPCs | Service / action / API | Admin | Docs |
|---|---|---|---|---|---|---|
| Messaging | W A | 13 RPCs; attachments; voice (A); reactions; block; archive; moderation state | `conversation*`, `message*` | `messaging/*`; actions `openConversation`, `sendMessage`…; API `messages/**` | Support queue; Blocked users; reported threads | help messaging |
| Support conversation | W A C | `type: support` | same | same; `admin/support/supportAdminCore` | `support.view/respond`, audit `support.*` | admin/support |
| Highlights | W A | slides; delete; report | `highlight` | `profile/highlightDeleteCore`, `uploads/*`; API `highlights/**` | Content | help reviews-and-highlights |
| Event reviews | W A | eligibility (checked-in, ended) | `event_review*`, `review_drafts` | actions `postEventReview`…; `reviews/*` | Content | help |
| Reports | W A | 10 reasons × 10 targets; attachments; dedupe; 10/h | `report*` | `reports/submitReportCore`; action `submitReport`; API `reports` | Reports & Moderation (`reports.*`, `moderation.*`) | admin/reports; moderation policy |
| Moderation | C | `apply_moderation_action` (idempotent) | `moderation_action`, `moderation_state` columns | `admin/moderation/*` | audit `moderation.*` | same |
| Notifications | W A C | in-app; push (A); reward/app pushes via queue | `notification`, `device_token`, `notification_delivery*`, `notification_preference` | `notifications/*`; API `notifications/**`, `devices/*`; `/api/notifications/{deliver,unsubscribe}` | Notifications (resend/broadcast) | operations/notifications |

## Rewards (shadow) and field programme (off)

| Feature | App | Workflow | Tables | Service / action / API | Admin | Docs |
|---|---|---|---|---|---|---|
| Credit account, activity, spend | W A | ledger RPCs | `credit_*` | `rewards/creditsQuery`, `creditRedemptionCore`; API `rewards/*` | Rewards › Accounts | rewards-ledger |
| Event referrals, friend invites, loyalty, promoter, rebates, visits | W A B | outbox → engine → settle | `referral_*`, `user_referral`, `reward_*`, `risk_signal` | `rewards/*`; actions `getReferralLink`, `bindReferralCode`, `rememberInviteCode`…; API `rewards/**` | Rewards module | rewards ops |
| Field programme | W C | see field-ops | `fieldops_*` | `fieldOps/**`, `admin/fieldOps/**`; 47 actions; 34 API routes | Field Ops module | field-operations/ |

## Platform / admin-only

| Feature | App | Notes | Docs |
|---|---|---|---|
| Admin RBAC, step-up, audit | C | `admin_*`, `admin_audit_log` | admin/settings-and-rbac |
| Finance ops centre | C | read + refund / settle / create / send payout | admin/finance |
| Monitoring, incidents, analytics, global search | C | `health_check_result`, `app_error_*`, `incident`, `app_request_metric` | admin/monitoring… |
| Reconciliation, reapers, expiry sweeps, health probes | B | pg_cron | operations/scheduled-jobs |
| Legal pages, help centre | W (A links) | `/legal/*`, `/help/*`; Markdown in `apps/web/src/content` | legal/README |

## Discrepancies and gaps (recorded)

See `../documentation-audit-matrix.md` for the Web/Mobile/Admin/Backend × Documented/Accurate/Gap matrix.
