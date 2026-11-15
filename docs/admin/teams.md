---
title: Admin — Teams
purpose: How to look up who runs a team, answer the common support questions about team accounts, and switch the programme on in stages.
audience: Support, operations
scope: Admin › Teams, the teams.view / teams.configure permissions, the TEAMS_KILL_SWITCH deploy flag and the team-invites-expire job
status: Approved
version: 1.0
lastReviewed: 2026-11-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Teams

An organizer or a place can be run by a team: its own account, run by members who each sign in as themselves and hold a role (Owner, Finance, Manager, Content and messages, Door staff, Front desk). How it works: [architecture/team-accounts.md](../architecture/team-accounts.md). In stage 1 teams can be made and staffed, but nobody can yet run events, places or money as a team.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `teams.view` | The settings, every team with its Owners and member count, and one team's members and activity | operations, support_admin, moderator (super_admin always) |
| `teams.configure` | Change the settings. Fresh step-up and a reason; audited as `teams.settings.update` | operations (super_admin always) |

## Looking a team up

Search by the team's name or username. A team's page shows its status (**Active**, **Paused**, **Closed**), who made it, its members with their roles, and every action with the member who took it ("System" for an invitation running out or an account closing). The "team account" link opens the team's own profile row in Users.

## Common questions

- **"I can't leave my team."** The last Owner cannot leave or be demoted: they first make another member an Owner.
- **"Someone left and now nobody can do anything."** A team whose last Owner's account was closed, suspended or banned is **Paused** (no Owner left): nobody can act for it. In stage 1 there is no staff button to name a new Owner; escalate to operations with the business papers (stage 5 adds the tool).
- **"I was removed from a team."** An Owner removed them; their own account, tickets and credit are untouched.
- **"The invitation never came."** Invitations by username appear in the person's notifications and under Settings › Teams. One by phone to a number with no account is texted (Ghana today, at most the daily number per team); the Owner sees "We couldn't text this number" if it did not go. Invitations last a week by default.
- **"Can a team member see the money?"** Only Owners and Finance, once stage 3 is built.

## Switching it on

1. Staff only (the default audience).
2. Beta: add user ids, one per line.
3. Everyone, once counsel has approved legal items N4 (team terms) and N5 (ID checks for Owners and Finance) and the help page is listed.

`TEAMS_KILL_SWITCH=true` on the web deployment stops new teams, invitations and accepting at once. Members can still leave and Owners can still remove members.

## The job

`team-invites-expire` (pg_cron, every 15 minutes) ends invitations past their deadline and records it in the team's activity. If it stops, invitations stay "waiting" past their deadline but can no longer be accepted (the accept checks the deadline itself).
