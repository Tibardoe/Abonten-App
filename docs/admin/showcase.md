---
title: Admin — Showcase
purpose: How to run the "On Abonten" wall — who to put on it, what each entry's status means, ordering and city entries, the settings that switch it on, and the tap and follow counts.
audience: Founder, operations, moderators
scope: Admin › Showcase, the showcase.view / showcase.edit permissions, showcase_program_setting, the entries of each market, the counts
status: Review required
version: 1.0
lastReviewed: 2026-11-26
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Admin — Showcase

The **On Abonten** wall shows the hosts (organizers, people or teams) and places that are on Abonten, in two slowly moving rows on the website's landing page, on Explore (website and app) and on a "See all" page. Each tile opens their page and has a Follow button. Admin › Showcase is where you choose who is on it, per market. How it works underneath: [architecture/showcase.md](../architecture/showcase.md).

**It ships switched off.** Build the list first, switch it on for staff to check it, and open it to everyone only with the founder's yes (decision SC2: about ten well-known names first; legal items P1 and P2).

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `showcase.view` | See every market's entries, whether each shows now and why not, the tap and follow counts, and the settings | operations, moderator, support_admin, analyst, field_ops_manager (super_admin always) |
| `showcase.edit` | Add, move, edit (city, note) and remove entries; change the settings (saving the settings also needs a fresh sign-in) | operations, moderator (super_admin always) |

Every change is in the audit log: `showcase.entry.add`, `showcase.entry.update`, `showcase.entry.move`, `showcase.entry.remove`, `showcase.settings.update` (with the reason).

## Choosing who is on it

1. Pick the market at the top (Ghana first; a market that is not live shows its status, and nothing of it is shown to anyone).
2. **Add to this market's wall**: type a name, an @handle, paste their page's link (`abontenhub.com/user/…`, `abontenhub.com/places/…`) or an id, and **Search**. Each result says **Would show** or **Would not show** with the reason, and **On the wall** if it is already there. You can add someone who would not show yet: they appear once they qualify (for example when their next event is published).
3. **City (optional)**: limit the entry to people browsing one launched city. Empty means the whole market.
4. **Staff note (optional)**: only staff see it (why they are on, who asked, until when).

Put on the wall only hosts and places Abonten is happy to point people to. The wall is a list of who is on Abonten, not an endorsement: never describe it to anyone as "our partners" or "trusted by", and never promise a business a place on it as part of a deal (paid placement is not offered, decision SC1).

## What the status means

An entry shows only while it qualifies, checked every time the wall is read; nothing needs refreshing.

| Status | Meaning | What to do |
|---|---|---|
| Showing | On the wall | — |
| No upcoming event in this market | A host with no published, upcoming event here (postponed, hidden, removed, restricted and ended events don't count) | Nothing; they come back with their next event |
| Account deleted / suspended or banned | The host's account is gone or restricted | Remove the entry if it will not come back |
| Team frozen or closed | A team account (or a place's owning team) is paused | Wait for the team to be resumed (Admin › Teams) |
| Nobody runs it (owner account deleted) | The place's owner deleted their account; the place waits to be claimed | Remove, or wait for a claim |
| Owner suspended or banned | | Remove if it will not change |
| Listed by Abonten staff, not claimed yet | A place a staff account put up that no business has claimed | Help the business claim it (Admin › Claims) |
| Not published / Hidden, removed or restricted by moderation / Permanently closed | | Remove if it will not change |
| Place is in another market | The place's country changed | Remove it here, add it in its own market |
| Market not open (not live) | | Nothing shows until the market is live |

The card at the top says how many hosts and places show now, and whether each row reaches the minimum (a row shows only with at least the **Fewest per row** setting, 4 to start; with fewer, that row is hidden, and with neither row the whole section is hidden).

## Order, edit, remove

- **Up / Down** move an entry one place in the market's order. The wall shows entries in this order (city entries are mixed in where they stand, for people browsing that city).
- **Edit** changes the city or the note.
- **Remove** takes it off the wall at once. Its tap and follow counts go with it.

## Counts

Each entry shows **taps** (people who opened their page from the wall: counted once an hour per person, only while the wall is on for them) and **follows** (new follows made with the wall's Follow button: once a day per person, never for a follow that already existed), for the last 7 and 30 days. Hosts are not told these numbers yet.

## Settings

At the bottom of the page (`showcase.edit`, a fresh sign-in, and a reason):

- **The wall is switched on**: off hides it everywhere; the list is kept.
- **Who sees it**: Staff only (active admins), Staff + beta users (one user id per line), or Everyone. Signed-out visitors and search engines see it only with Everyone; the console asks before it opens to everyone.
- **Fewest per row** (1–20, default 4) and **Most per row** (4–60, default 24; the moving rows carry at most this many, "See all" lists everyone).

`SHOWCASE_KILL_SWITCH=true` on the website deployment hides the wall everywhere whatever the settings say; set on the console's deployment too, the page says it is set.

## Checking it on Preview or before release

1. Add at least four hosts that have upcoming events and four places, all showing.
2. Settings: switched on, Staff only, reason "Checking the wall", Save.
3. Signed in with a staff account: the website's landing page (below "Explore a city"), Explore (after "Around you", both tabs), `/on-abonten`, and the app's Explore tab. Signed out or as a normal account, nothing shows and `/on-abonten` is a 404.
