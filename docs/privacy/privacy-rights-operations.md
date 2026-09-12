---
title: Privacy rights operations
purpose: Step-by-step internal procedures for handling access, correction, deletion, objection, consent-withdrawal and complaint requests, and suspected privacy breaches.
audience: Support staff, operations lead, engineering
scope: Requests from Abonten users and from people whose data Abonten holds without an account (e.g. business owners who gave field consent)
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Privacy rights operations

Pattern for every request: **Received → Verify identity → Locate data → Assess → Execute → Record → Respond → Escalate if needed.**

Statutory response times under the Data Protection Act, 2012 are **legal item B5**; until confirmed, treat every request as due within **30 days** and acknowledge within 3 working days.

## Where requests arrive

- The in-app **support conversation** (Admin › Support queue; permission `support.view` / `support.respond`).
- Any other channel published later (legal item A3).

Do **not** ask for more identifying information than needed. The signed-in support conversation already proves control of the account; never ask for a national ID or card details.

## Recording

Record every request as an **admin note** on the user (Admin › Users › user › notes; `admin_note` is immutable) with: date received, type, what was done, date responded. This is the register until a dedicated one is decided.

## 1. Access request ("what do you hold about me?")

1. **Verify:** the request came from the user's own support conversation. If it came from elsewhere, ask them to send it from the app while signed in.
2. **Locate:** Admin › Users › user shows profile, status, counts (events, places, tickets, reports). Finance › Organizers shows ledger and payouts. Rewards › Accounts shows credit. Messages are **not** browsable by staff except support conversations and reported threads — do not open them.
3. **Assess:** everything in `data-inventory.md` §1–§9 that belongs to the user is in scope; exclude other people's personal data (e.g. the other side of a conversation) and staff-only material (risk flags, admin notes).
4. **Execute:** there is **no self-service export** (decision O3). An engineer with service-role access runs read-only queries against the tables in the inventory for that `user_id`, exports to a file, and reviews it for third-party data before release.
5. **Respond** through the support conversation with the file or a secure link; note what was excluded and why.
6. **Record** as above.

## 2. Correction request

1. Most fields are self-service: Settings › Edit profile (name, username, bio, website, avatar), Settings › Security (phone, email). Point the user there first.
2. Fields the user cannot edit (e.g. a ticket holder name on an organizer's list, a review shown against the wrong place) — an engineer corrects the row; record before/after in an admin note.
3. Respond and record.

## 3. Deletion request

1. **Self-service first:** Settings › Security › Delete account. Explain what is deleted, kept and forfeited (`data-retention-and-deletion.md` §2; public text in `/help/account/deleting-your-account`).
2. If the user **cannot sign in** (lost phone/email): verify identity by another means agreed with the founder (legal B5), then an engineer runs `deleteAccountCore(userId)` from a service-role context (or `auth.admin.deleteUser` after `credit_close_account`), and records it.
3. **Partial deletion** (e.g. "remove my review", "remove this photo") — the user can do it themselves; if not, staff use moderation `remove` for content or an engineer deletes the row.
4. **Organizer with upcoming events:** tell them to cancel the events first (refunds to attendees) or the events vanish with the account and attendees lose their tickets without refunds being triggered — **engineering gap: deletion does not cancel events**. Escalate to the founder if they insist.
5. Respond and record.

## 4. Objection and consent withdrawal

| They object to | What to do |
|---|---|
| Push notifications | Device settings; or sign out on that device (removes the token) |
| Rewards emails | Rewards page toggle or unsubscribe link (`/unsubscribe/rewards`) |
| Location | Device permission; explore by typed location |
| Rewards fraud identifier (`abn_did` / install id) | Explain purpose; they can clear cookies / reinstall; the identifier is not linked to advertising |
| Appearing in referral attribution | Clear `abn_ref`; no server action needed |
| Being messaged | Block the participant in the conversation |
| Processing generally | Account deletion is the only full opt-out; explain |

Record the objection and what was done.

## 5. Marketing opt-out

Abonten sends no marketing. If asked, confirm this in writing and point to the reward-email toggle. If marketing is ever introduced, legal G1 applies first.

## 6. Privacy complaint

1. Acknowledge within 3 working days.
2. Escalate to the founder the same day; involve counsel if the complaint alleges unlawful processing or a breach.
3. Investigate using the inventory and audit log (`admin_audit_log`, `moderation_action`, `report_event`).
4. Respond with findings and remedy. Inform the person of their right to complain to the Data Protection Commission.
5. Record.

## 7. Suspected privacy breach

Follow `../incident-response/pii-exposure-and-data-breach.md` immediately. Do not communicate externally before the incident commander approves the wording.

## 8. Requests about someone else

- A parent about a child's account: see legal B7 (no age gate today); escalate to the founder.
- A business owner whose phone number was used for field-programme consent: they are identified by that phone (an account exists with it); handle as the account holder.
- Law-enforcement or court requests: escalate to the founder and counsel before disclosing anything; record the request.

## Security and privacy notes for staff

- Never paste personal data into chat tools, tickets outside the admin console, or AI assistants.
- Use `users.view_pii` only when the request requires the email/phone; access is audited.
- Exports live only as long as needed to deliver them; delete local copies afterwards.
