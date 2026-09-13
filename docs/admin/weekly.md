---
title: Admin — Abonten Weekly
purpose: How to create, curate, preview, schedule, publish and retire Abonten Weekly editions, manage areas and settings, and switch the programme on or off safely.
audience: Operations, moderators, editors
scope: Admin › Abonten Weekly (Editions, edition editor, Areas, Settings), the weekly.view / weekly.edit / weekly.publish / weekly.configure permissions and the WEEKLY_KILL_SWITCH deploy flag
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Abonten Weekly

Abonten Weekly is a weekly edition of events and places worth discovering, for Ghana or for one area such as Accra. Design: [architecture/weekly-highlights.md](../architecture/weekly-highlights.md).

**Current state: switched on for staff only in production (2026-09-13).** Only active admins see editions. Two staff test editions exist ("Staff preview: this week" published, "Staff preview: next week" scheduled for Monday 14 September, 06:00). Archive them once real editions exist.

## Prerequisites

| Permission | Lets you | Seeded to |
|---|---|---|
| `weekly.view` | Open the module, editions, areas, settings, preview links | operations, moderator, support_admin, analyst, field_ops_manager |
| `weekly.edit` | Create and copy editions; edit copy, sections and listings; archive and restore | operations, moderator |
| `weekly.publish` | Schedule, cancel a schedule, publish, unpublish | operations |
| `weekly.configure` | Areas and programme settings | operations |

Publishing, scheduling, unpublishing, areas and settings also need a recent identity check (step-up). The page shows a **Confirm identity** button when yours has expired.

## Procedure

### Create an edition

1. Admin › Abonten Weekly › **New edition**.
2. Pick the **Area** and any day of the **Week**; the edition always covers Monday to Sunday.
3. Write a title, and optionally a subtitle and introduction (plain text; a blank line starts a new paragraph).
4. Either keep **Add the default sections** (note, weekend, new, free, places) or choose an earlier edition under **Start from** to copy its sections and listings. Pins are not copied.
5. **Create edition.** You land in the editor. There is one edition per area per week.

A faster way for the next week: open this week's edition and press **Copy to next week**.

### Curate

- **Edition copy**: title, subtitle and introduction, then **Save copy**.
- **Sections**: open **Edit section settings** to change the title, subtitle, icon, layout (hero, carousel, grid, list) and what the section takes (events, places or both). Editorial notes hold text only. **Hide** keeps a section without showing it; **Delete** removes it and its listings. Use the arrows to reorder.
- **Listings**: in a section, search by name, paste an event code, or paste an `abontenhub.com/events/…` or `/places/…` link, then **Add**. A listing that cannot be featured (cancelled, ended, hidden, restricted, archived, permanently closed) shows why and cannot be added. Each listing can have a short **headline** and **note**, can be **pinned** (a marker for editors that later automated suggestions will respect; pins are not copied), moved to another section, reordered or removed.
- **Add a section** at the bottom.

### Check

The **Checks** panel is always up to date:

| Message | What to do |
|---|---|
| Add at least one listing that can be shown | Publishing is blocked until one listing can be shown |
| This week has already ended / this area has been retired | Publishing is blocked |
| Some listings will not be shown | They are dropped automatically; remove them or leave them |
| Some listings appear in more than one section | Usually worth fixing |
| One organizer has several events in the same section | Consider giving smaller organizers room |
| Some listings were in recent editions for this area | Consider rotating |
| Some sections have no listings and will be hidden | Add listings or delete the section |

Warnings never block publishing.

### Preview

**Preview** opens the edition on the website exactly as the public would see it, with a banner. The link works for 30 minutes for that edition only. Listings that cannot be shown are already left out.

### Publish or schedule

1. Confirm identity if asked.
2. Write a **reason** (it goes into the audit log).
3. **Publish now**, or set **Publish at** (Accra time) and **Schedule**.

A scheduled edition is published by the `weekly-publish-due` job within 5 minutes of its time. If it fails its checks at that moment it stays scheduled and an incident opens in Admin › Monitoring (see Exceptions).

### After publishing

- Fixing a typo or removing a listing works on a published edition; the change shows on the website within about a minute.
- **Unpublish** (reason required) takes the edition down and makes it a draft again.
- **Archive** retires an edition; **Restore as draft** brings it back. Editions older than two years are archived automatically.

### Areas

Admin › Abonten Weekly › **Areas**. Ghana (the whole country) always exists and cannot be retired. To add an area:

1. Name it (for example Accra) and check the address (`/weekly/accra`).
2. **Look up centre**, or type latitude and longitude.
3. Set the radius in kilometres (Accra: about 35).
4. Write a reason and **Add area**.

Visitors are matched to the smallest active area containing their location. When their area has no edition this week they see the Ghana edition, labelled as Ghana-wide picks. Retiring an area stops its editions being shown.

### Settings

Admin › Abonten Weekly › **Settings**:

| Setting | Default | Effect |
|---|---|---|
| Abonten Weekly switched on | off | Off hides pages, teaser and app screen for everyone |
| Who can see published editions | Staff only | Staff only → Staff + beta users → Everyone. Signed-out visitors, search engines and link previews only see editions with Everyone |
| Teaser on Explore | on | The small card at the top of Explore on web and in the app, only while this week's edition is out |
| Suggested publishing hour | 6 | Accra time on Monday, offered when scheduling |
| Listings per section, at most | 12 | Hard limit when adding |
| Events per organizer per section | 1 | Warning threshold |
| Recently featured check | 2 editions | Warning; 0 turns it off |
| Archive editions after | 104 weeks | Housekeeping |

A reason is required. If someone else saved in the meantime, the save is refused; reload and re-apply.

## Expected outcome

- The published edition appears at `/weekly` (Ghana) or `/weekly/<area>` and at its dated address `/weekly/<area>/<Monday>`, in the Explore teaser and in the app, for the chosen audience.
- Every action appears in Admin › Audit Logs under `weekly.*`.

## Exceptions

| Situation | Cause | Resolution |
|---|---|---|
| "Someone else changed this edition" | Another admin saved first | The page reloads with their changes; redo yours |
| Incident "Abonten Weekly did not publish: …" | A scheduled edition failed its checks at publish time (for example every listing was cancelled) | Open the edition, fix the checks, publish now; resolve the incident |
| Monitoring shows "Abonten Weekly schedule" down | A scheduled edition is late, or no Ghana edition is published by 09:00 Monday while the programme is on | Publish this week's Ghana edition, or fix the late one |
| A listing disappeared from a published edition | It was cancelled, hidden, restricted, archived, ended or permanently closed | Nothing to do; it drops out on its own. Replace it if the section looks thin |
| Settings changes do not show | The web deployment's `WEEKLY_KILL_SWITCH` is set. Settings shows a red card only when the same flag is also set on the admin deployment | Engineering removes the flag |
| A dated edition address shows "Page not found" (or, for staff while the audience is not Everyone, "This edition isn't available") | Wrong area address or week, or the edition is not published | Check the address; use the dated link from the editions list |

## Escalation

Stop immediately: untick **Abonten Weekly switched on** (takes effect within 15 seconds). If the console itself is unavailable, engineering sets `WEEKLY_KILL_SWITCH=true` on the web deployment. Anything else: engineering via the usual incident process ([monitoring-and-incidents.md](monitoring-and-incidents.md)).

## Security and privacy notes

- Editions contain only public listing information and staff-written text. No personal data is stored or shown.
- Preview links grant read access to one edition for 30 minutes; do not post them publicly.
- Editorial text is shown as plain text; formatting and links are not supported.
- Do not describe an edition as sponsored or paid. Paid featuring is a separate product ([finance.md](finance.md)); Abonten Weekly picks are editorial.
