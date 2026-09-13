---
title: Admin — Discovery
purpose: How to read the Discovery overview, change the programme settings safely, roll search and recommendation notices out in stages, and stop them in an emergency.
audience: Operations, analysts
scope: Admin › Discovery (Overview and Programme settings), the discovery.view and discovery.configure permissions, the SEARCH_V2_KILL_SWITCH and RECOMMENDATIONS_KILL_SWITCH deploy flags
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Discovery

Discovery is the unified search (events, places and organizers, with `@handle`) and the opt-in alerts and recommendation notices. Design: [architecture/discovery-search-and-recommendations.md](../architecture/discovery-search-and-recommendations.md).

**Current state: everything is switched off in production.** Search and recommendations are on for nobody, shadow mode is on, prompts are off.

## Prerequisites

- `discovery.view` opens the module. Seeded for operations and analyst.
- `discovery.configure` changes settings. Seeded for operations. Saving also needs a recent identity confirmation (step-up); the page shows a "Confirm identity" button when it has expired.

## Overview

Pick 7, 14, 30 or 90 days at the top.

**Status** repeats the switches in one line, including whether either deploy-level kill switch is set.

**Search**

| Panel | Read it as |
|---|---|
| Searches | First pages of searches in the range. Scrolling further is not counted. |
| Zero results | Share of searches that found nothing. The table below lists the queries: missing listings, spellings, or wording organizers should use. |
| Click-through | Share of searches where someone opened a result. |
| Latency p50 / p95 | Server-measured time for the search, in milliseconds. Type-ahead suggestions are not logged on either platform. |
| Top searches | Most common normalised queries, with their click-through and no-result counts. |
| Searches by kind and platform | Text, `@` organizer and browse searches; web, iOS, Android. |

The log holds no user, device or IP identifiers and is deleted after the retention setting (90 days).

**Recommendations**

| Panel | Read it as |
|---|---|
| Active subscriptions | People's opt-ins, by kind. |
| New, by where they came from | Profile bell, search result bell, purchase, RSVP or place prompt, settings. |
| Prompts | Times shown, accepted, dismissed ("Not now"). |
| Live / Shadow digests | Digests created. Shadow ones were counted but not sent. |
| Open rate | Delivered digests someone opened. "—" until a push has actually been delivered. |
| Not interested | Picks dismissed out of all picks people could see. Above 25% it turns amber: the matching is too broad. |
| Per-person digests | p50, p95 and maximum digests per person in the range. |
| Why candidates were held back | Already attending, saved, reminded, visited, own listing, listing no longer visible, event ended, account inactive, turned off. |
| Digests skipped | Daily cap, weekly cap, paused, ignored (auto-paused after unopened digests), cooldown, opted out. |
| Push delivery | Recommendation pushes queued, sent, skipped, failed. |

## Changing settings

Admin › Discovery › Programme settings.

1. Change the switches or limits.
2. Write a reason. It is required and goes into the audit log (`discovery.settings.update`).
3. Press **Save settings**. If someone else saved in the meantime, the save is refused; reload and re-apply.

Turning shadow mode off asks for confirmation. **Start from now** moves the starting point so only listings published after the save are recommended; it is set automatically when the engine is switched on.

Limits and what they do:

| Setting | Default | Effect |
|---|---|---|
| Pushes per day | 1 | Digests per person per day. 0 stops them. |
| Pushes per week | 3 | Across a rolling seven days. |
| Digest hour | 18 | Accra time, 8 to 20. |
| Organizer cooldown | 72 hours | A second event from the same organizer waits unless it starts within 48 hours. |
| Similar events radius | 25 km | Default distance for "events like this". |
| Pick freshness | 7 days | A pick not sent within this is dropped. |
| Pause after unopened digests / pause length | 3 / 14 days | Stop nagging people who ignore the notices. |
| Prompt cooldown | 7 days | At most one opt-in prompt per person in this time. |
| After "Not now" | 30 days | Don't ask about the same thing again for this long. |
| Prompt shows, ever | 3 | Per topic, organizer or place. |
| Search log retention / recommendation retention | 90 / 90 days | Deletion jobs run nightly. |

A settings change reaches every web server within about 15 seconds.

## Rolling out

Follow the stages in order and look at the Overview for at least a week at each.

1. **Staff.** Search on, audience `staff`. Recommendation engine on, shadow on, audience `staff`. Prompts off. Staff search the real catalogue and follow a few organizers.
2. **Pilot.** Search audience `beta` (add the pilot user ids), then `all`. Prompts on, recommendations audience `beta`, shadow still on.
3. **Sending.** Before turning shadow off, check: per-person digests p95 at or below the weekly cap; the same event rarely offered twice; "listing no longer visible" under 5% of held-back candidates. Then shadow off for `beta`, and later `all`.

Which dates and which audiences are the founder's decision (N1 in [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)).

## Exceptions

- **Too many notices, or the wrong ones.** Untick "Recommendation engine switched on". Queued pushes are skipped at send time and the jobs stop at their next run. Shadow mode on stops sending but keeps counting.
- **Search is broken or slow.** Untick "New search switched on" — everyone goes back to the old events-only search. If the admin console is unavailable, set `SEARCH_V2_KILL_SWITCH=true` on the web deployment and redeploy.
- **Prompts or alerts must disappear at once.** Set `RECOMMENDATIONS_KILL_SWITCH=true` on the web deployment and redeploy, then also untick the engine switch here to stop the database jobs.
- **Someone reports a notice they never asked for.** Look up their subscriptions (Supabase `notification_subscription` by user id) and their prompt history (`notification_prompt_state`): every subscription records where it came from and when. Escalate to engineering if a subscription exists with no matching accepted prompt or profile action.

## Escalation

Engineering for failed jobs, empty panels or search errors; the founder for rollout decisions.

## Security and privacy notes

- The search log is anonymous; do not export it together with anything that identifies people.
- Subscriptions and prompt history are personal data. Look at them only to answer the person or investigate a complaint.
- Never switch shadow off without checking the exit criteria; a push cannot be taken back.
