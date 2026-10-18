---
title: Legal document versioning and effective dates
purpose: Define how legal documents are versioned, how an effective date is set, how users are notified, and how history is kept.
audience: Founder, legal counsel, engineering
scope: The four public legal documents
status: Approved
version: 1.1
lastReviewed: 2026-10-18
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Legal document versioning and effective dates

## Version numbers

`version` in each document's front matter follows **major.minor**:

- **major** — a change in substance: new obligations, new fees or refund terms, new data categories or purposes, new sharing, a new law relied on. Requires legal review and user notice.
- **minor** — clarification, typo, reordering, or a factual update that does not change rights or obligations (for example a provider rename). No user notice required; still recorded.
- The suffix `-draft` marks text not yet reviewed by counsel. It is removed when the document is approved.

## Effective date

- A document has **no** effective date until counsel has reviewed it and the founder approves it. Until then `effectiveDate` reads "Not yet in force — set when approved" and `status` is **Review required**; the page banner shows this.
- On approval, set `effectiveDate` to the go-live date, `status: Published`, remove `-draft`, and record the change in the log below and in `../changelog/README.md`.
- For a **major** change to a published document, the effective date must be at least the notice period decided under legal item C3 after users are notified.

## Notifying users

For a major change: an in-app notification to every active account (Admin › Notifications › Broadcast, `notifications.broadcast`, step-up required) and, for changes to payment or refund terms, an email to organizers. The notification links to the document. Minor changes need no notice.

## Keeping history

Every change to a file in `apps/web/src/content/legal/` is versioned by git. In addition, when a document moves to a new major version, copy the previous text to `docs/legal/history/<slug>-v<version>.md` so a reader can find what applied on a given date without using git. (No history files exist yet; the first will be created at the first major bump after publication.)

## Consistency checks before any bump

1. Re-read `../privacy/data-inventory.md`, `../privacy/cookies-and-storage-inventory.md` and `../privacy/data-retention-and-deletion.md` against the schema and code; fix them first.
2. Confirm each blocking item in `README.md` is Decided.
3. Run `npm run check:docs` (metadata, links, placeholders, secrets).
4. Update `lastUpdated` in the document's front matter.

## Effective-date log

| Document | Version | Effective | Change | Notice given |
|---|---|---|---|---|
| Terms and Conditions | 1.0-draft | — | Initial draft prepared from the codebase (2026-09-12) | — |
| Terms and Conditions | 1.1-draft | — | Minor: operating entity, registration number and addresses inserted from the Registrar-General's certified Form 3 (2026-09-12) | — (draft) |
| Privacy Policy | 1.1-draft | — | Minor: data controller identity and postal address inserted; DPC status still a placeholder (2026-09-12) | — (draft) |
| Terms and Conditions | 1.2-draft | — | Minor: official support, privacy and security email addresses inserted in §19 (2026-09-12) | — (draft) |
| Privacy Policy | 1.2-draft | — | Minor: privacy and support addresses in §11 and §15; Google Workspace mailboxes added to the processor table in §4 (2026-09-12) | — (draft) |
| Security overview | 1.1-draft | — | Minor: security@abontenhub.com published in "Reporting a vulnerability"; disclosure policy still pending (2026-09-12) | — (draft) |
| Security overview | 1.2-draft | — | Minor: "Reporting a vulnerability" replaced by a full "Responsible disclosure" section (no time targets; explicit statement that no legal safe harbour is offered yet — legal D3); `/.well-known/security.txt` published (2026-09-12) | — (draft) |
| Terms and Conditions | 1.3-draft | — | Minor: §19 support hours (Mon–Fri 09:00–17:00 Ghana time, public holidays excluded) and two-working-day reply goal, stated as a goal not a commitment (decision O1, 2026-09-12) | — (draft) |
| Privacy Policy | 1.3-draft | — | Minor: §15 two-working-day acknowledgement goal for privacy requests; statutory limits unaffected (O1, 2026-09-12) | — (draft) |
| Privacy Policy | 1.4-draft | — | Minor: §1 Data Protection Commission registration inserted (certificate PROV2609522, registered 16 Sep 2026, valid to 15 Sep 2028) and the "status to be confirmed" wording removed from the draft banner (legal A2, 2026-09-17) | — (draft) |
| Privacy Policy | 1.5-draft | — | Minor: §1 Location row adds the city or ~1 km area a person asks to be told about when Abonten launches there, kept until the notice is sent or they cancel, and "launch notices you asked for" as a purpose (2026-09-30) | — (draft) |
| Privacy Policy | 1.6-draft | — | Minor: §2 adds a "Website visits" row (Vercel Web Analytics: pages opened, the site or tagged link that led there, country, device, browser; no cookies; private addresses cut before sending) and says the app does not use it; §3 purpose 6, §4 processor row, §7 and §9 retention row follow (2026-10-18) | — (draft) |
| Privacy Policy | 1.7-draft | — | Minor: §2 adds "Page views of listings" (that an event or place page was opened, when, on which platform; no account, device or address kept; the owner's own views not recorded); §3 purpose 6 names event-page views for organizers; §9 retention row (2026-10-18) | — (draft) |
| Cookie Policy | 1.1-draft | — | Minor: §1 and §4 name Vercel Web Analytics, which sets no cookies and stores nothing in the browser (2026-10-18) | — (draft) |
| Security overview | 1.3-draft | — | Minor: "What happens next" states the two-working-day acknowledgement goal for security reports (O1, 2026-09-12) | — (draft) |
| Privacy Policy | 1.0-draft | — | Initial draft (2026-09-12) | — |
| Cookie Policy | 1.0-draft | — | Initial draft (2026-09-12) | — |
| Security overview | 1.0-draft | — | Initial draft (2026-09-12) | — |
