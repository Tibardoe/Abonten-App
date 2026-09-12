---
title: Specification — minimum age and age gate
purpose: Record the current state (no age check anywhere), the decision required, and the implementation options so the work can start the day a minimum age is set.
audience: Legal counsel, founder, engineering
scope: Sign-in flows (web and mobile), user profile schema, event listings, Terms §2 and Privacy §13
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — minimum age and age gate

## 1. Current state (verified against code and schema)

- **No date-of-birth or age column** exists on `user_info` or any other table in the schema.
- **No age check** exists in any sign-in path: Google, phone one-time code, email one-time code (web `AuthModal.tsx`, mobile sign-in and verify screens).
- **No age-restriction field** exists on `event` or `place`; organizers can only mention age limits in free text.
- The Terms (§2) say a user must be able to enter a binding agreement and that a minimum age has not been set; the Privacy Policy (§13) says Abonten is not directed at children and does not verify age.
- Google Play's listing declares an age rating chosen at submission time; the repository holds no record of it (legal F2 covers keeping the store listing consistent).

## 2. The decision required

| Question | Register |
|---|---|
| Minimum age for an account, and any parental-consent requirement under Act 843 | Legal B7 |
| Whether age-restricted events impose a duty on Abonten (for example, alcohol-related events) | Legal B7 |
| Whether to add an age gate, and which option below | Decision O6 |

No age is assumed anywhere in this document.

## 3. Implementation options

**Option 1 — Attestation (smallest change).** A required statement at sign-in: "I confirm I am at least [N] years old" (checkbox on web `AuthModal.tsx` and the mobile sign-in screen; recorded as `age_attested_at timestamptz` on `user_info` by a service function called after first sign-in). Existing users see the prompt once. Nothing is verified; this is a declaration.

**Option 2 — Date of birth.** Add `date_of_birth date` to `user_info` (nullable for existing users, required on first sign-in after release), collected in the onboarding step, validated in `@abonten/validation`, never shown publicly, excluded from organizer-visible attendee data, included in the data inventory and the Privacy Policy's data table. Enables per-event age enforcement (Option 3) and a children-detection rule.

**Option 3 — Per-event age restriction.** Add `minimum_age smallint` to `event` (organizer sets it in the event form), display it on the event page, and refuse checkout when the buyer's date of birth (Option 2) does not meet it. Without Option 2 this can only be a displayed warning.

**Option 4 — Under-age account handling.** A support procedure and an admin action to close accounts reported as belonging to children, with the reason recorded in the audit log. Can be documented now in `operations/account-and-support-procedures.md` once B7 is decided, using the existing suspend/ban tooling.

All options require a Terms §2 and Privacy §13 update, a changelog line and, for Options 2 and 3, a migration applied through the project's normal migration process (never `supabase db push`).

## 4. Data-protection notes

A date of birth is personal data of a higher sensitivity than the current profile fields; if collected it must appear in [../privacy/data-inventory.md](../privacy/data-inventory.md), have a stated purpose (age verification only), and be excluded from every export to organizers.

## 5. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| The minimum age and any parental-consent rule | Set by counsel | Legal B7 |
| Which option (1–4) to build | Founder's decision | Decision O6 |
| Wording of Terms §2 and Privacy §13 | Counsel | Legal B7 |

**Status: not approved. No age check is to be added until B7 and O6 are Decided.**
