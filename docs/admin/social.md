---
title: Admin — Social
purpose: How to work the posting queue for Abonten's own Instagram, X and WhatsApp Channel — what gets queued, how to post each item by hand, and the settings.
audience: Founder, operations, the operator who posts to X and the WhatsApp Channel
scope: Admin › Social, the social.view / social.manage permissions, the social-queue-listings and social-queue-roundups jobs, the roundup cover image
status: Approved
version: 1.0
lastReviewed: 2026-11-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Social

Abonten posts every new event and place on its own channels, so listers have a reason to list. Admin › Social is the daily posting queue: for each new listing and each weekly roundup it has the pictures, the caption and the link, ready to copy. **Nothing here posts anything.** Instagram is posted by hand by the founder (automated use locked the account on 2026-11-18: never drive Instagram from a script or a browser robot); X and the WhatsApp Channel are posted by an operator reading the same queue. How the whole social distribution work fits together (link sources, listing-view sources and this queue) is in the architecture document docs/architecture/social-distribution.md.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `social.view` | See the queue (pictures, captions, links) and the settings | operations, moderator (super_admin always) |
| `social.manage` | Mark a post posted or skipped (with a note), put it back, and change the settings; audited as `social.post.posted` / `social.post.skipped` / `social.post.reopened` / `social.settings.update` | operations, moderator (super_admin always) |

Neither needs a fresh step-up: nothing here moves money or opens anything to the public.

## What gets queued

- **New events and places**, every 15 minutes (job `social-queue-listings`): a listing published at least five minutes ago (so a typo fixed straight after publishing is not posted) that is public — published, visible (not hidden, removed or restricted), in a market that is open, its owner's account active — and, for an event, on Explore with its next date not started yet. A run of shows is queued once (its earliest show). Each gets three posts: **Instagram story**, **X**, **WhatsApp Channel**.
- **Roundups**, Mondays and Fridays at 07:00 Accra time (job `social-queue-roundups`): "What's on in Accra this week" (Monday to Sunday) and "This weekend in Accra" (Friday to Sunday), up to 10 events on in those days in Ghana, featured or promoted first, then by date. Each gets three posts: **Instagram feed** (a carousel), **X**, **WhatsApp Channel**. A week with no events gets no roundup.
- **Never queued**: the accounts in **Accounts never posted** (the App Review sample organizer `22d25b53-…` is there from the start), cancelled, postponed, hidden or closed listings, and an event that has already started.
- **Daily cap**: at most **New listings per day** (12 to start) new listings a day, on Accra's calendar. The rest wait for the next day, oldest first; an event that has started by then is passed over. Roundups don't count.

Nothing is queued twice. The caption, link and pictures are worked out each time the page opens, so an edit to the listing shows at once; a card whose listing has since ended, been cancelled or hidden shows a warning ("Check before posting").

## Working the queue

The page opens on **To post**, today's first, then earlier days still waiting. Each card is one listing (or roundup) with one block per channel:

- **Pictures** — the share kit's images ([architecture/share-kit.md](../architecture/share-kit.md)): the 9:16 story for an Instagram story, the 4:5 post otherwise; a roundup has its cover (words only) then each event's post. **Download** saves the file; on a phone, long-press the picture to save it to Photos. X takes the cover and the first three events (four pictures at most).
- **Caption** — in English, with the date and time in the event's own zone, the venue, the price line ("Tickets from GH₵50", "Free entry") and one or two hashtags (#AccraEvents, #ThingsToDoInAccra). X captions stay under 280 as X counts them (a link counts 23); the counter shows it. For an Instagram story the box holds the **link sticker's words** instead ("Get tickets").
- **Link** — the listing's page (a roundup's is abontenhub.com/explore/accra) tagged with where it was posted: `?src=ig`, `?src=x` or `?src=wa`. Always use the queue's link, never a plain one: the tag is how organizers are told which channel brought their views.

Per channel:

1. **Instagram story** (founder, phone): download the story picture, post it, add a link sticker with the link, set the sticker's words, then **Mark posted**.
2. **Instagram feed** (founder, phone, roundups): download the pictures, post them as one carousel with the cover first and the caption. Instagram captions don't link: put the link in the bio while the post is new.
3. **X** (operator): attach the pictures and paste the caption (the link is in it).
4. **WhatsApp Channel** (operator): send the picture with the caption; the links open on tap.

**Skip** a post that should not go out (a duplicate, a listing that looks wrong, an event that started); add a note saying why. **Put back in the queue** undoes either. If someone else marked it first, the page says so: reload.

## Settings

At the bottom of the page (`social.manage`): **Queue new listings and roundups** (off stops both jobs adding anything; what is queued stays), **New listings per day** (0 to 200), **Accounts never posted** (user ids). The line under them says how far the job has looked ("Listings published up to …"). Every change is audited with what changed.

## When something looks wrong

- **A new listing hasn't appeared after 20 minutes.** Check it is public (published, not hidden, not closed) and upcoming, that its owner is not in Accounts never posted, and whether today's cap is reached (it then comes tomorrow). The job's runs are in Admin › Monitoring (cron) and `cron.job_run_details`.
- **No roundup on a Monday or Friday.** No events were on in those days in Ghana, or the queue is switched off. One can be queued by hand in the SQL editor (production through the operator only): `select public.social_queue_roundup('week');` or `('weekend')`; it queues each week or weekend once.
- **A picture does not load.** The listing may no longer be public (its share image answers "not found"), or the website was slow to draw it: try again. Pictures come from the website through the console (`/social/image`).
- **The caption has the wrong date or price.** It is the listing's own data: fix the listing (or ask the organizer to), then reload.
