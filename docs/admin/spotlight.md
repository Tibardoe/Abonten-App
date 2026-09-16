---
title: Admin — Spotlight & Stories
purpose: How to read the Spotlight and Stories overview, moderate posts and comments, review and refund paid promotions, and switch the programme on or off safely.
audience: Operations, moderators, finance
scope: Admin › Spotlight & Stories (Overview, Posts, Comments, Promotions, Programme settings), the spotlight.view / spotlight.campaigns.review / spotlight.configure permissions, and the SPOTLIGHT_KILL_SWITCH and STORIES_KILL_SWITCH deploy flags
status: Approved
version: 1.0
lastReviewed: 2026-09-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Spotlight & Stories

Short videos (Spotlight), 24-hour Stories, follows and paid Spotlight promotions. Design: [architecture/spotlight-and-stories.md](../architecture/spotlight-and-stories.md).

**Current state: everything is switched off in production.** Spotlight, Stories and promotions are on for nobody. The module still works, so staff can review the settings before anything is opened.

## Tabs

| Tab | What it shows | Permission |
|---|---|---|
| Overview | Posts, creators, impressions, views (two seconds or more), completions, likes, comments, shares, saves, taps, attributed purchases; Stories opened and finished; follows, open reports, moderated items; promotions waiting for review, running, paid, delivered, refunded. Pick a period at the top. View figures update hourly. | `spotlight.view` |
| Posts | Spotlights or Stories by state: live, reported, hidden, removed, restricted, ended Stories, everything. Search captions. **Act** hides, restricts, removes or restores; every action needs a reason and is audited. Open a post to see every media item, links, counts and reports. | `spotlight.view` to read, `moderation.*` to act |
| Comments | Reported, hidden, removed or all comments with the post they belong to. | `spotlight.view`, `moderation.*` to act |
| Promotions | Promotions by status, newest first; the default filter is **In review**. Open one for money, delivery, ledger, payment and history, and to act. | `spotlight.view` to read, `spotlight.campaigns.review` to act |
| Programme settings | Every switch, audience, limit, ranking weight, sponsored cap and retention period. | `spotlight.view` to read, `spotlight.configure` to change |

## Moderating

- Reports about Spotlights, Stories and comments arrive in **Reports & Moderation** like any other report. The same actions are available there and here.
- **Hide** removes the post from every feed and link at once; **Remove** does the same and records it as a policy removal; **Restrict** keeps it visible to people who open it directly but out of ranking; **Restore** undoes. The author gets an in-app notice with no reason text.
- A promotion on a hidden or removed post pauses within ten minutes. It does not resume by itself when the post is restored: resume it from the promotion page.

## Reviewing promotions

Every paid promotion waits in **In review** until someone acts. Reviewing needs a fresh identity check (the page shows a button when it is needed).

1. Open the Spotlight from the promotion page and check it against the content policy ([operations/content-moderation-policy.md](../operations/content-moderation-policy.md)). Promoted posts must be the publisher's own content and must not mislead about an event or place.
2. **Approve** — it runs from its start time for the plan's length.
3. **Reject and refund** — needs a reason, which the advertiser sees. The whole payment is returned through Paystack straight away. If the message says the refund needs attention, open Finance › Refunds and retry there.
4. **Pause / Resume / Cancel** a running promotion — pause and cancel need a reason. An advertiser can only resume a pause they made themselves.

Delivery is billed by time run, not by views. We never promise a number of views.

### Refunds

- **Rejected**: refunded automatically in full.
- **Cancelled** (by the advertiser, by staff, or because the post was deleted): the unused part shows as **Refundable now** on the promotion page. Refunding it needs `finance.refund` as well as `spotlight.campaigns.review`. Whether every cancellation is refunded is decision **S3** in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md); until it is decided, handle each one case by case and note the reason.
- A promotion can only be refunded once; the button disappears afterwards.

### Money incidents

`content-campaign-reconcile` opens a critical incident in Monitoring when the ledger and a promotion's paid, delivered or refunded amounts disagree, when a promotion is live without a payment, or when it points at a missing or failed transaction. Do not edit amounts by hand; hand the incident to engineering.

## Switching it on

Order (decision **S1**): staff only for Spotlight and Stories with promotions off → beta users → everyone; promotions last, only when someone is watching the review queue. Before **Everyone**, legal items F5 and G4 must be decided.

1. Programme settings → tick **Spotlight switched on** (and/or **Stories switched on**), choose the audience, give a reason, **Save settings**. Changes reach every instance within 15 seconds.
2. Beta users are user ids, one per line, used when the audience is "Staff + beta users".
3. Opening to **Everyone** also makes shared links work for signed-out visitors; the page asks you to confirm.
4. Turning **Paid promotions** on asks you to confirm that the review queue is staffed.

## Stopping it

- Untick **Spotlight switched on** or **Stories switched on**. Every entry point disappears on web and mobile; posts, follows and promotions are kept. Running promotions keep accruing time, so pause them too if the stop will last.
- If the console is unavailable, engineering sets `SPOTLIGHT_KILL_SWITCH=true` and/or `STORIES_KILL_SWITCH=true` on the web deployment (and the admin deployment, so this page shows a red warning).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Settings changes do not show | A kill switch is set on the web deployment | Engineering removes the flag |
| A creator says they cannot post | Posting switch off, not in the audience, no live event or published place, daily cap reached, or a restricted account | Check the settings and the creator in Users |
| Views look low | Rollups run hourly; views under two seconds, repeats within an hour and the author's own views do not count | Wait for the next rollup |
| A paid promotion is not in review | Payment still confirming, or fulfilment failed | Finance › Transactions for the reference; the advertiser can retry from the payment screen without paying again |
