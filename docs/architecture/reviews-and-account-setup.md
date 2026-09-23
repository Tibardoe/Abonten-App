---
title: Reviews experience, account-wide blocking and account setup
purpose: How event and place reviews are listed, summarised, filtered, voted on, shared, reported and blocked at any scale, and how people are helped to finish setting up their account without being nagged.
audience: Engineering, operations, security reviewers
scope: event_review / place_review read path (review_list, review_summary), helpful votes, the edited stamp, account-wide blocks (user_block_set), account setup completion (@abonten/core/profileCompletion) and its reminder (account_setup_prompt_state), the web /events/<code>/reviews and /places/<slug>/reviews pages, the mobile Reviews, Account setup and Blocked accounts screens, and the contextual email prompt at checkout. Not covered - review creation eligibility (unchanged, see PROJECT.md §27.7 / enforce_event_review_eligibility) and organizer replies (reviewResponseCore).
status: Approved
version: 1.0
lastReviewed: 2026-09-23
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Reviews experience, account-wide blocking and account setup

Migrations `20260923090000_reviews_helpful_summary_and_list`, `20260923090100_account_setup_prompt_state` and `20260923090200_username_chosen_flag` (all applied to production 2026-09-23).

## 1. Reviews

### 1.1 Shape

Event reviews (`event_review`) and place reviews (`place_review`) stay in their own tables with their own photo tables (the reasoning is in `20260823005033`). Everything built on top of them takes a subject kind (`'event' | 'place'`) so web and mobile share one read path and one set of screens.

| Piece | What it is |
| --- | --- |
| `review_summary(kind, id)` | SECURITY INVOKER. Average, total and the 1–5 star counts, public rows only. One index-only pass over `idx_*_visible_rating`. |
| `review_list(kind, id, rating, sort, after_*, limit, review_id, exclude_viewer)` | SECURITY INVOKER, keyset-paged. Star filter, `helpful` (helpful_count, created_at, id) or `recent` (created_at, id) order, the viewer's own vote, reviews by people the viewer blocked left out, deleted reviewers anonymised. `review_id` returns one review (a shared link). Limit capped at 50. |
| `helpful_count`, `edited_at` columns | Trigger-maintained. A client can't write either (see §1.3). |
| `event_review_helpful` / `place_review_helpful` | One row per (review, person); the primary key is the one-vote rule. Clients read only their own rows and cannot write. |
| `review_set_helpful(kind, review_id, helpful)` | SECURITY DEFINER, `authenticated` only, auth.uid()-scoped. The only way to vote. |

Shared TypeScript lives in `@abonten/core/reviews/reviewList` (row parsing, cursor, args, summary shares, empty-state copy, share links) and `@abonten/core/reviews/reviewCache` (optimistic patches over any cached shape). Web reaches the functions through `@abonten/services/reviews/reviewListQuery` and `reviewHelpfulCore` (Server Actions `getReviewPage`, `getReviewSummary`, `getSharedReview`, `setReviewHelpful`); mobile calls them directly (class A in [shared-backend](shared-backend.md): invoker reads and an auth.uid()-scoped definer write).

### 1.2 Scale

Details screens never load the whole history: `review_summary` plus a three-review `review_list` page. The Reviews screen pages ten at a time. Measured on a local stack with 10,000 reviews on one place (2026-09-23): summary 2–8 ms; first page, deep page, star filter and both sorts 1.6–7 ms. Plans use `idx_*_visible_recent`, `idx_*_visible_helpful` and `idx_*_visible_by_rating` (partial, public rows only); without the rating index a rare star filter fell back to a sequential scan of the whole table (1.2 ms at 10k rows, growing with every review on the platform) versus 0.5 ms with it.

### 1.3 Integrity rules (enforced by the database)

- One helpful vote per person per review (primary key); repeated or racing calls change nothing (`on conflict do nothing` / delete).
- No voting on your own review, or on reviews of an event you organize / a place you own.
- No voting between people where either blocked the other (`content_users_blocked`).
- No voting on hidden, removed or unapproved reviews; restricted accounts can't vote.
- `helpful_count` changes only one trigger level deep (the vote-table trigger). A signed-in client UPDATE that touches it is refused by the review column guards; an INSERT is forced to 0 by `review_stamp_edit`.
- `edited_at` is set by `review_stamp_edit` when rating, title or comment change and cannot be set by a client (insert forces null; update keeps the old value unless content changed). Organizer/owner replies don't mark a review edited.
- Review photos are readable only when their review is (reviewer, subject owner, or public and not hidden/removed) — the photo policies previously ignored moderation.

Integration tests: `packages/services/src/__integration__/reviews-experience.integration.test.ts`.

### 1.4 Surfaces

| | Web | Mobile |
| --- | --- | --- |
| Details preview | `ReviewsPreview` on `/events/<code>` and `/places/<slug>`: average, count, top three most helpful, "See all N reviews" | `ReviewsPreviewSection` on the event and place screens: same, plus your own review card with its menu |
| Full list | `/events/<code>/reviews`, `/places/<slug>/reviews` (`ReviewsBrowser`) | `app/(app)/reviews/[kind]/[id]` |
| Breakdown | `ReviewSummaryBars` (rows filter) | `ReviewSummaryCard` (rows filter) |
| Filters / sort | All, 5★…1★ with counts; Most helpful (default) / Most recent | same |
| Per review | Helpful, ⋯ Share / Report / Block | Helpful, ⋯ Share / Report / Block; own review ⋯ Edit / Share / Delete |
| Organizer reply | inline on both pages for the event organizer (`OrganizerReplyControls`); place owners reply from Manage | Organizer screens (unchanged) |

"Most helpful" ties fall back to newest first, so with no votes it reads as "most recent". Signed-out visitors who tap Helpful are sent to sign in and brought back.

### 1.5 Sharing a review

A review is shared as `https://abontenhub.com/events/<code>/reviews?review=<id>` (or `/places/<slug>/reviews?review=<id>`). The web page pins that review first and its link preview quotes it (`reviewsPageDescription`). With the app installed, the existing `/events/*` and `/places/*` App Link / Universal Link patterns already cover the path; `+native-intent.ts` routes it to the Reviews screen with the review pinned. A deleted, hidden or blocked review shows "no longer available" rather than an error.

### 1.6 Caching

Web keys: `["reviews", kind, id, …]`. The pages are statically rendered, so the first render is always the public view (server and client agree — no hydration mismatch); once the session is known the visitor's own view replaces it under a viewer-keyed query with `keepPreviousData`. Mobile keys: `["mobile","reviews", kind, id, …]`, persisted for offline (rule `reviews`, first page only; `QUERY_CACHE_VERSION` 2). `invalidateReviewSubject` refreshes previews, breakdowns, lists, the place detail's average, owner inboxes and Explore cards after a post, edit, delete, reply or block.

## 2. Account-wide blocking

`conversation_block` rows with no conversation already meant "everywhere": `send_message` refuses them in both directions and `content_users_blocked()` hides Spotlights, Stories and comments and refuses follows and engagement. Until now nothing let a person create one. `user_block_set(blocked_id, block)` (auth.uid()-scoped definer) does, and also ends any organizer follow between the two people. Reviews by people you blocked leave `review_list` for you; the public rating is unchanged.

Entry points: a review's ⋯ menu (web + app). Management: Settings › Blocked accounts (`/settings/blocked`, app `settings/blocked`), which reads the caller's own rows (`conversation_block_own_select`). Messaging's per-conversation block is unchanged.

## 3. Account setup

### 3.1 What "complete" means

`@abonten/core/profileCompletion` — computed from live fields on every read, never stored:

| Step | Done when | Why it's offered (only what the product does) |
| --- | --- | --- |
| Name | `full_name` set | shown on your profile |
| Username | `username_is_generated = false` | shown on reviews and in your profile link |
| Photo | `avatar_public_id` set | shown on your profile, reviews and messages |
| Email | auth email present and confirmed | **paying requires it** (the payment-attempt cores refuse without one); tickets and receipts are emailed; email-code sign-in |
| Phone | auth phone present and confirmed | text-code sign-in — a way back in if email/Google access is lost |

Bio and website are optional and not listed. Nothing here is required to use Abonten; the copy says so. `username_is_generated` is now owned by the database (`user_info_username_chosen` trigger): changing your username marks it chosen on every platform (the app never cleared it before — four production accounts were repaired by the migration's rule-based backfill), and the flag can't be flipped on its own.

### 3.2 Prompting rules

- **Reminder card** (app Home, web Explore): a card, never a pop-up. "Not now" puts it away for 7, then 30, then 90 days (`@abonten/core/accountSetupPrompt`), recorded per account in `account_setup_prompt_state` via `account_setup_prompt_dismiss()` so it holds on every device. Gone for good once complete. Its line leads with the step that matters most for that account (email → phone → profile).
- **Always-there link**: Account tab row (app) and the Edit Profile badge/checklist (web + app) while anything is left — not dismissible, not a reminder.
- **Contextual, never silenced**: checkout and promotion payment (web `PaymentMethodSelector`, app `PaymentSection` / `PromotionPaymentSection`) show "Add your email to pay" with an inline code flow when the account has no email, instead of failing on Pay. Notification and reward email settings link to adding an email.
- **One-time notification** on sign-in (`ensureProfileCompletionNotification`) uses the same message and links to Account setup.

### 3.3 Screens

App: `settings/account-setup` (checklist; email and phone finished in a sheet via `EmailVerificationForm` / `PhoneVerificationForm`, shared with Security and checkout). The email form also handles a change waiting for its code (`user.new_email`) and an unconfirmed address. Web: `/settings/account-setup` (links to Edit Profile / Security).

Phone codes are sent by SMS through Hubtel; if SMS delivery is unavailable the phone step can't be completed and the form shows the error the phone service returns.
