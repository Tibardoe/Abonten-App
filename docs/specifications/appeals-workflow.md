---
title: Specification — appeals workflow
purpose: Document the requirement for a formal appeal path against moderation and account actions, what exists today, and a proposed workflow — without declaring any appeal policy approved.
audience: Founder, operations lead, moderators, engineering, legal counsel
scope: Moderation actions (hide, remove, restrict), account actions (suspend, ban), report outcomes; admin console; web and mobile
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Specification — appeals workflow

## 1. Requirement

Users whose content is hidden or removed, or whose account is suspended or banned, need a way to contest the action that is recorded, reviewed by someone other than the original actor, and answered. The Terms (§14) and the help page `account/restricted-accounts` currently say, truthfully, that no formal appeal process exists.

## 2. Current implementation (verified)

| Element | Today |
|---|---|
| Actions that can be contested | Content: `moderation_state` set to `hidden`, `removed` or `restricted` via `apply_moderation_action`; accounts: status Suspended or Banned via `setUserStatusCore` (global sign-out) |
| How a user contests | Emails support@abontenhub.com (linked from the restricted-account page and the help centre since 2026-09-12) or, if still reachable, uses the in-app support conversation. Banned or suspended users are redirected to the restricted-account page on the web and receive a 403 in the app; the support conversation is **not** reachable from a suspended session, so email is the practical route |
| Who reverses | An admin holding `moderation.restore` (content) or `users.restore` (accounts); bans are restored by the founder in practice (`operations/content-moderation-policy.md` §7) |
| Record | The reversal is in `admin_audit_log` and, for content, `moderation_action`; the reason for reversal is whatever the admin typed. There is no record that an appeal was made, by whom, or its outcome |
| Reporter feedback | None (decision M3) |
| Time limits | None |

## 3. Proposed workflow (recommendation — not approved policy)

1. **Submit.** A restricted user can submit one appeal per action from the restricted-account page (web) and the equivalent mobile screen, without a full session: the page accepts a short statement and is authenticated by a signed link sent to the account's phone or email (reusing the one-time-code infrastructure). Content appeals are submitted from the hidden item's owner view.
2. **Record.** `appeal` table: `id`, `user_id`, `target_type` (`account | event | place | highlight | review | message`), `target_id`, `action_ref` (the `moderation_action` id or the audit entry), `statement`, `status` (`open | under_review | upheld | reversed | withdrawn`), `submitted_at`, `decided_at`, `decided_by`, `decision_note`. RLS: owner may read their own; writes through service functions only.
3. **Assign.** Appears in Admin › Reports & Moderation under a new "Appeals" tab; **the original actor cannot decide it** (enforced in the service function by comparing `decided_by` with the action's actor). Requires a new permission key `moderation.appeals` in the role matrix; reversing still requires `moderation.restore` or `users.restore` (bans: step-up).
4. **Decide.** Reviewer reads the report(s), the action reason, the statement; decides `upheld` or `reversed`; writes a note. Reversal calls the existing restore paths so the audit log and moderation records stay consistent.
5. **Notify.** The user receives an in-app notification and, where available, an email with the outcome and, for `upheld`, a plain statement that the decision is final for that action. Reporter outcome notices are the separate decision M3.
6. **Limits.** One appeal per action; a response target set with O1; repeated abusive appeals can be closed as `withdrawn` by an admin with a note.
7. **Documentation.** Update Terms §14, `operations/content-moderation-policy.md` §6, `admin/reports-and-moderation.md`, `admin/users.md`, the help pages `account/restricted-accounts` and `customers/reporting-a-problem`, and the changelog.

## 4. Minimal interim improvement (needs no policy decision)

Until O4 is decided, staff can record appeals as **admin notes** on the user (`admin_note` is immutable) with a fixed prefix "APPEAL:", so the count and outcomes are countable later. This is a procedural change to `operations/account-and-support-procedures.md`, not a product change, and it is **not** enabled by this document — the operations lead may adopt it.

## 5. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| Whether to offer a formal appeal path, who decides appeals, response target | Founder | Decision O4 (with O1) |
| Whether reporters are told outcomes | Founder | Decision M3 |
| Terms §14 wording on appeals and finality | Counsel | Legal E4 |
| Build the appeal table, admin tab, permission key and notifications | Founder approves engineering work | Decision O4 |

**Status: not approved. The current "contact support" path stands until O4 is Decided.**
