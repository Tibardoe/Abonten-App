---
title: Admin — Teams
purpose: How to look up who runs a team, answer the common support questions about team accounts, and switch the programme on in stages.
audience: Support, operations
scope: Admin › Teams, the teams.view / teams.configure permissions, the TEAMS_KILL_SWITCH deploy flag and the team-invites-expire job
status: Approved
version: 1.2
lastReviewed: 2026-11-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Teams

An organizer or a place can be run by a team: its own account, run by members who each sign in as themselves and hold a role (Owner, Finance, Manager, Content and messages, Door staff, Front desk). How it works: [architecture/team-accounts.md](../architecture/team-accounts.md). Since stage 2 members run the team's events and places within their role (chosen under **Managing as** in Manage on the website, at the top of Organizer in the app); since stage 3 Owners and Finance also see and move its money; messages and reviews as a team come later.

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
- **"Can a team member see the money?"** Only Owners and Finance: the team's dashboard, insights, balance, ledger and payouts. Owners and Finance ask for payouts; only Owners change the payout account.
- **"The payout was refused: the account is too new."** A team's payouts go to a payout account only 48 hours after it was added, and every Owner is told when one is added. Wait out the 48 hours, or ask the Owners whether they added it.
- **"It asks me to sign in again before I change the payout account."** For a team, changing the payout account needs a sign-in in the last 15 minutes. Sign out of that device, sign in again and change it straight away.
- **"Our Finance person can't ask for a payout."** When ID checks are required, Owners and Finance pass one before moving money (Settings › Identity verification); the team also needs one Owner with a check.
- **"I can't see my team's events."** They need to choose the team under **Managing as** (Manage on the website, the top of Organizer in the app). Their role decides what they then see: Door staff only check people in, Front desk only bookings and the visit QR.
- **"Our door staff can't see the guest list."** That is the Door staff role: they scan or type a ticket's code and see whether it worked, never who is coming. Make them a Manager if they need the list.
- **"An event I published went out under my own name, not the team's."** It was published while **Managing as** was on their own account. Moving a published event to a team is not possible yet; they can cancel and publish it again as the team.

## Switching it on

1. Staff only (the default audience).
2. Beta: add user ids, one per line.
3. Everyone, once counsel has approved legal items N4 (team terms) and N5 (ID checks for Owners and Finance) and the help page is listed.

`TEAMS_KILL_SWITCH=true` on the web deployment stops new teams, invitations and accepting at once. Members can still leave and Owners can still remove members.

## The job

`team-invites-expire` (pg_cron, every 15 minutes) ends invitations past their deadline and records it in the team's activity. If it stops, invitations stay "waiting" past their deadline but can no longer be accepted (the accept checks the deadline itself).
