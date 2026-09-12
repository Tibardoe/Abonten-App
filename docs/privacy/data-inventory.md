---
title: Personal data inventory
purpose: Record every category of personal data Abonten processes, where it is stored, who can access it, why it exists and what happens to it — the factual basis for the Privacy Policy.
audience: Privacy reviewer, engineering, support leads
scope: All production data stores (Supabase Postgres, Supabase Storage, Cloudinary, device storage, provider systems)
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Personal data inventory

Format: **Data → Owner (controller) → Purpose → Storage → Access → Retention → Deletion**. Retention and deletion detail is in `data-retention-and-deletion.md`; this page maps the data itself. Table and column names are from `supabase/migrations/`.

## 1. Identity and account

| Data | Tables / stores | Purpose | Who can read it | Notes |
|---|---|---|---|---|
| Auth identity: email, phone (E.164), Google identity, sign-in timestamps, one-time-password hash for phone sign-in | `auth.users` (Supabase Auth) | Sign-in, account recovery | The user (via session); admin console with `users.view_pii`; service role | Phone sign-in mints a one-time password server-side and rotates it (`phoneAuthCore.ts`) |
| Profile: username (citext), full name, bio, website, avatar (Cloudinary public id + version), status (Active/Suspended/Banned), `is_admin`, profile-completion flag | `user_info`, `user_status`, `user_image_history`, view `user_profile_details` | Public profile, moderation | **Public SELECT** on `user_info` (`user_info_public_select`); status and `is_admin` changes only by staff (trigger-guarded) | Username and avatar are public by design |
| Phone-verification state: purpose, phone, Hubtel request id, attempts | `phone_otp_state`, `phone_otp_send_log` (IP, timestamps) | Verify phone ownership, rate limit sends | Service role only | Hubtel holds the code; Abonten never sees it |
| Device push tokens (Expo), platform | `device_token` | Push notifications | Owner; service role | Pruned when Expo reports the device unregistered |
| Install / browser identifiers: `abn_did` cookie (web), `abonten.installId` (app) → `device_install` | `device_install` | Rewards fraud signal (shared device between referrer and buyer) | Rewards engine (service role); admin `rewards.review` sees flags, not ids | Never used for advertising |
| Locale / country preference | `NEXT_LOCALE`, `country` cookies (web); SecureStore (app) | Language, default country | Device only | Not stored server-side |

## 2. Location

| Data | Tables / stores | Purpose | Access | Notes |
|---|---|---|---|---|
| Explore location (town chosen) | App SecureStore `abonten.explore-location`; URL/state on web | Discovery | Device only | |
| Device coordinates for "near you" | Passed to discovery RPCs (`get_nearby_events`, `get_nearby_places`) at query time | Distance sorting | Not stored | Only the query uses them |
| Place-visit check-in position | `place_visit_record` (rewards, ~150 m rule) | Verify a visit | Owner sees own visits; place owner sees counts | Shadow mode today |
| Field team GPS: assignment start position, submission position, distance to pin | `fieldops_assignment.start_location`, `fieldops_onboarding.submission_location` | Verify field work | Member (own), team lead, admin `fieldops.view` | Informational for leads; never refused on |
| Approximate country from network | `x-vercel-ip-country` → `country` cookie | Defaults | Device | |

## 3. Content the user creates

| Data | Tables / stores | Access |
|---|---|---|
| Events (title, description, dates, venue, flyer, ticket types, tags), drafts | `event`, `event_occurrence`, `ticket_type`, `event_drafts`, `drafts`; flyer on Cloudinary | Public when published (and not hidden/removed); organizer always |
| Places (details, pin, contact phone/WhatsApp/website, hours, services, photos), drafts | `place`, `place_opening_hours`, `place_service`, `place_photo`, `place_drafts`; photos on Cloudinary | Public when published; owner always |
| Reviews (rating, title, comment, photos) and owner/organizer responses | `event_review`, `event_review_photo`, `place_review`, `place_review_photo`, `review` (person-to-person, partitioned), `review_drafts` | Public when approved and not hidden; reviewer; organizer/owner |
| Highlights (photo/video slides) | `highlight`; media on Cloudinary | Public unless hidden/removed; owner |
| Favourites | `favorite`, `favorite_place` | **Owner only** |
| Event shares | `event_share` | Service role; owner |

## 4. Transactions and money

| Data | Tables / stores | Purpose | Access |
|---|---|---|---|
| Checkouts (pending → paid/expired/cancelled), quantities, promo code used | `ticket_checkout`, `promo_code_usage` | Purchase | Buyer (SELECT); organizer sees sales aggregates; server writes only |
| Payment attempts, transactions: amount, currency, status, Paystack reference, channel, gateway response (JSON) | `payment_attempt`, `transaction`, `transaction_status` | Payment, refund, reconciliation | Buyer (own); admin `finance.view`/`transactions.view`; server writes only |
| Saved payment methods: type, provider/brand, last four, expiry, label, Paystack authorization code | `payment_method` (partitioned) | One-tap payment | Owner only; authorization code used server-side |
| Tickets: code, QR (Cloudinary), status, check-in | `ticket`, `attendance` | Entry | Buyer; event organizer (attendee list, check-in) |
| Refunds: `refund_requested_at`, status, refundable amount | `transaction`, `organizer_ledger_entry` (`refund_hold`/`refund_release`) | Refunds | Buyer; organizer (ledger); finance admins |
| Organizer earnings, payout holds, payouts, payout accounts (holder name, provider, account number) | `organizer_ledger_entry`, `payout`, `payout_account`, `receiving_account` | Settlement and payouts | Organizer (own); admin `finance.view`/`finance.payout`; account numbers visible to finance admins |
| Platform fee entries | `platform_fee_entry` | Abonten revenue accounting | Service role / finance admins only (no client policy) |
| Payment disputes (chargebacks) | `payment_dispute`, `incident` | Dispute handling | Finance admins |
| Promotions and their checkouts | `event_promotion*`, `place_promotion*` | Paid featuring | Owner/organizer; public sees "promoted" |

## 5. Messaging

| Data | Tables / stores | Access |
|---|---|---|
| Conversations, participants, read state, archive/mute state, blocks | `conversation`, `conversation_participant`, `conversation_block` | Participants; `is_staff()` for support and reported conversations |
| Messages (text, type), attachments (Cloudinary / Supabase Storage `message-attachments`), reactions, edit/delete state, moderation state | `message`, `message_attachment`, `message_reaction` | Participants (visible messages) or sender; staff |

## 6. Reports and moderation

| Data | Tables | Access |
|---|---|---|
| Reports: reporter, target, category, details (≤2,000 chars), attachments (private bucket `report-attachments`), status, priority, assignee, resolution | `report`, `report_attachment`, `report_event` | Reporter (own); admins with `reports.*`; timeline and notes staff-only |
| Moderation actions and reasons; `moderation_state`/`moderated_by`/`moderation_reason` on content | `moderation_action`, columns on content tables | Staff; content owner sees their own hidden item |
| Admin notes on users/reports (immutable) | `admin_note` | Staff |
| Account status changes with reason | `admin_audit_log` (`user.status.*`) | Staff with `audit.view` |

## 7. Notifications

| Data | Tables | Access |
|---|---|---|
| In-app notifications (type, title, body, link data, read state) | `notification` | Owner; admin `notifications.view` (body/title; recipient email gated by `users.view_pii`) |
| Delivery queue rows (channel, status, attempts) | `notification_delivery`, `notification_delivery_config` | Service role; admin rewards delivery view |
| Preferences (`reward_emails`) | `notification_preference` | Service role only (no client grants); exposed via actions |

## 8. Rewards and referrals (shadow mode in production)

| Data | Tables | Access |
|---|---|---|
| Credit account, lots (amount, scope, expiry), journal/entries, reservations | `credit_account`, `credit_lot`, `credit_ledger_account`, `credit_journal`, `credit_entry`, `credit_reservation` | Owner (account, lots, reservations; activity via RPC); staff `rewards.view`; ledger SELECT-only even for service role |
| Referral codes, touches (which link, IP/install/user key), attributions, user referrals (inviter ↔ friend) | `referral_code`, `referral_touch`, `referral_attribution`, `user_referral` | Owner (code, own referral); engine; staff |
| Reward events (decision, status, risk flags/score), outbox, risk signals, campaigns, budgets, rebate runs | `reward_event`, `reward_outbox`, `risk_signal`, `reward_campaign`, `reward_budget_period`, `reward_rebate_run` | Engine and staff only — **risk flags are never shown to users** |
| Goodwill/adjustment requests | `credit_adjustment_request` | Staff |

## 9. Field programme (switched off in production)

| Data | Tables / stores | Access |
|---|---|---|
| Team memberships: role, status, invited phone, payout MoMo number | `fieldops_team_member` (payout columns column-level revoked from clients) | Member (own, masked payout), lead (team, no payout), admin `fieldops.*`; full payout number only with `fieldops.commissions.pay` + `users.view_pii` (CSV export, audited) |
| Assignments and GPS check-ins, prospects (business name, contact attempts, phone) | `fieldops_assignment`, `fieldops_prospect` | Member; lead; admin |
| Onboardings: business, owner phone / owner user id (column-level hidden from members), positions, duplicate-search snapshot, timeline | `fieldops_onboarding`, `fieldops_onboarding_event` | Member (own, owner phone masked); lead; admin with `users.view_pii` sees phone |
| Evidence photos with GPS (private bucket `fieldops-evidence`) | `fieldops_onboarding_evidence` | Member (own), lead, admin via signed URLs |
| Commissions, payout batches/items (destination snapshot masked) | `fieldops_commission*`, `fieldops_payout_*` | Member (own), admin |
| Content submissions (platform, URL, self-reported figures) | `fieldops_content_brief`, `fieldops_content_submission` | Campaign members; admin |
| Business-owner consent: OTP to owner's phone; owner account created with confirmed phone and no session | `phone_otp_state` (purpose `fieldops-owner`), `auth.users` | Service role |

## 10. Staff data

| Data | Tables | Access |
|---|---|---|
| Admin users, roles, permission matrix, step-up cookie | `admin_user`, `admin_user_role`, `admin_role_permission`, `admin_stepup_at` cookie | Service role; admins with `settings.view`/`admins.manage` |
| Audit log: actor, action, target, metadata, time (append-only, no UPDATE/DELETE grant even for service role) | `admin_audit_log` | `audit.view` |
| Sentry: admin id and role keys on error events (no email) | Sentry `abonten-admin` | Engineers with Sentry access |

## 11. Technical and telemetry

| Data | Stores | Notes |
|---|---|---|
| Error events (message, stack, page/screen, app version, user id when signed in), error groups, incidents | `app_error_event`, `app_error_group`, `incident` (self-hosted); Sentry projects `abonten-web/admin/mobile` (`sendDefaultPii: false`, no replay) | No retention job (decision R6) |
| Request-timing metrics (mobile) | `app_request_metric` | No retention job |
| Health-check results | `health_check_result` | No retention job |
| Rate-limit buckets (keyed by user id or IP) | `rate_limit_bucket` | Purged daily (1-day window) |
| Server logs (Vercel) | Vercel | Vercel's retention |

## Providers (processors)

See `third-party-processors.md` for what each provider receives.

## Known gaps (recorded, not hidden)

- No data-export capability; access requests are manual (`privacy-rights-operations.md`).
- `get_event_attendee_contacts` gives organizers attendee emails and phones (decision M4).
- Message content has no retention or user-initiated conversation deletion (decision R3).
- Field evidence purge is counted, not executed (decision R7).
- The credit ledger and financial history deliberately outlive account deletion (legal B9).
