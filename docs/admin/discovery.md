---
title: Admin — Discovery
purpose: How to read the Discovery overview, tune the search vocabulary from real searches, change the programme settings safely, roll search and recommendation notices out in stages, and stop them in an emergency.
audience: Operations, analysts
scope: Admin › Discovery (Overview, Search vocabulary and Programme settings), the discovery.view and discovery.configure permissions, the SEARCH_V2_KILL_SWITCH, RECOMMENDATIONS_KILL_SWITCH and RECOMMENDATION_EMAIL_KILL_SWITCH deploy flags
status: Approved
version: 1.2
lastReviewed: 2026-09-19
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

Pick the last 7, 14, 30 or 90 days at the top. Unlike the rest of the console this is a **rolling window ending now**, not whole calendar days, and there is no comparison with the period before — the caption under the tabs says so. Every tile carries its definition behind the ⓘ (`docs/admin/metrics.md`, "Discovery"); rates are shown as "Not enough data" under 20 searches rather than as a percentage of nothing.

**Status** repeats the switches in one line, including whether either deploy-level kill switch is set.

**Search**

| Panel | Read it as |
|---|---|
| Searches | First pages of searches in the range. Scrolling further is not counted. |
| Zero results | Share of searches that found nothing. The table below lists the queries: missing listings, spellings, or wording organizers should use. |
| Click-through | Share of searches where someone opened a result. |
| Latency p50 / p95 | Server-measured time for the search, in milliseconds. Type-ahead suggestions are counted separately below. |
| Type-ahead requests, Suggestion opened, Type-ahead time (p95) | Suggestion lists served while people typed, on web and in the app (builds from 2026-09-15 on), the share where someone opened a suggestion, and how long a list took. One search usually makes several lists, so read requests as load, not searches. Above 300 ms the time turns amber. No top-queries list: type-ahead text is a half-typed prefix. |
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
| Picks marked not interested | Picks dismissed out of all picks people could see. Above 25% it turns amber: the matching is too broad. |
| Per-person digests | p50, p95 and maximum digests per person in the range. |
| Why candidates were held back | Already attending, saved, reminded, visited, own listing, listing no longer visible, event ended, account inactive, turned off. |
| Digests skipped | Daily cap, weekly cap, paused, ignored (auto-paused after unopened digests), cooldown, opted out. |
| Push delivery | Recommendation pushes waiting, sent, skipped, failed. Read from the shared delivery queue (recommendation rows only); if the read hits its row cap the page says the figures are incomplete. |

Breakdown keys (why candidates were held back, digests skipped, subscription kinds and sources, search kinds, platforms) are shown as words from `@abonten/core/admin/statusLabels`, never as database values.

## Tuning the search vocabulary

Admin › Discovery › Search vocabulary. Search widens each word of a query with the related words in `search_concept` ("gob3" also finds beans and plantain), in both directions, and still requires every word of the query to be found by itself or one of its words. The vocabulary is data: a change applies to the next search, with no deploy.

1. **Searches that need words** lists the submitted searches of the chosen period (7, 30 or 90 days) that found nothing, or found results nobody opened, most-unanswered first. "No related words" means the vocabulary knows none of its words yet. Search analytics carry no user or device identifiers.
2. Press **Add term** (or **Edit term** when the query already is a term). Enter the words listings use for it, separated by commas or new lines (up to 30), and which result types it applies to.
3. Press **Preview matches** before saving: it counts the upcoming events, places and Spotlights the term and its words match today and shows a few titles. A query can find nothing simply because nothing matching is listed yet; a term then adds nothing.
4. Write a reason and save. Adding, editing and removing need `discovery.configure` and a fresh identity check, and are audited (`discovery.vocabulary.create` / `.update` / `.delete`, with the row before and after). If someone else saved the same term in the meantime, the save is refused; reload.

Prefer switching a term off ("In use" unticked) over removing it: an off term is kept for later and changes nothing. Keep words specific: every word added to a term makes that term's searches broader. Never add a term to make one listing rank higher.

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
- **Recommendation email must stop at once.** Untick "Recommendation email (legal item G1)"; queued emails are skipped as `channel_off` on the next minute. If the console is unavailable, set `RECOMMENDATION_EMAIL_KILL_SWITCH=true` on the web deployment and redeploy.

**Recommendation email (legal item G1).** Built and off. Do not switch it on until legal item G1 is marked Decided in `docs/LEGAL_REVIEW_REQUIRED.md`: the console asks you to confirm that, and the server refuses the change without the confirmation. It needs the engine on and shadow mode off, and still sends nothing to anyone who has not switched "Email me picks and alerts" on themselves in Settings › Notifications. Every opt-in and opt-out is kept in `notification_consent_event`.
- **Someone reports a notice they never asked for.** Look up their subscriptions (Supabase `notification_subscription` by user id) and their prompt history (`notification_prompt_state`): every subscription records where it came from and when. Escalate to engineering if a subscription exists with no matching accepted prompt or profile action.

## Escalation

Engineering for failed jobs, empty panels or search errors; the founder for rollout decisions.

## Security and privacy notes

- The search log is anonymous; do not export it together with anything that identifies people.
- Subscriptions and prompt history are personal data. Look at them only to answer the person or investigate a complaint.
- Never switch shadow off without checking the exit criteria; a push cannot be taken back.
