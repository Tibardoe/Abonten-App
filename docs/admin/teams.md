---
title: Admin — Teams
purpose: How to look up who runs a team, answer the common support questions about team accounts, and switch the programme on in stages.
audience: Support, operations
scope: Admin › Teams, the teams.view / teams.configure / teams.manage permissions, pausing and resuming a team, appointing an Owner, deleting a team, deleted teams, the TEAMS_KILL_SWITCH deploy flag and the team-invites-expire and team-delete-requests-sweep jobs
status: Approved
version: 1.13
lastReviewed: 2026-11-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin — Teams

An organizer or a place can be run by a team: its own account, run by members who each sign in as themselves and hold a role (Owner, Finance, Manager, Content and messages, Door staff, Front desk). How it works: [architecture/team-accounts.md](../architecture/team-accounts.md). Since stage 2 members run the team's events and places within their role (chosen under **Managing as** in Manage on the website, at the top of Organizer in the app); since stage 3 Owners and Finance also see and move its money, since stage 4 Owners and Content and messages answer its messages and reviews (customers see the team's name, never the member's), since stage 4b Owners and Finance feature its events and places, paying the credit part with the team's credit, and since stage 4c Owners and Content and messages post Spotlights and Stories as the team.

## Permissions

| Key | Lets you | Seeded to |
|---|---|---|
| `teams.view` | The settings, every team with its Owners and member count, and one team's members and activity | operations, support_admin, moderator (super_admin always) |
| `teams.configure` | Change the settings. Fresh step-up and a reason; audited as `teams.settings.update` | operations (super_admin always) |
| `teams.manage` | Pause, resume, make someone an Owner and delete a team. Fresh step-up and a reason; audited as `teams.pause` / `teams.resume` / `teams.owner.appoint` / `teams.delete` | operations (super_admin always) |

## Looking a team up

Search by the team's name or username. A team's page shows its status (**Active**, **Paused**, **Deleted**), who made it, its members with their roles, and every action with the member who took it ("System" for an invitation running out or an account closing). The "team account" link opens the team's own profile row in Users.

## Common questions

- **"I can't leave my team."** The last Owner cannot leave or be demoted: they first make another member an Owner.
- **"Someone left and now nobody can do anything."** A team whose last Owner's account was closed, suspended or banned is **Paused** (no Owner left): nobody can act for it. In stage 1 there is no staff button to name a new Owner; escalate to operations with the business papers (stage 5 adds the tool).
- **"I was removed from a team."** An Owner removed them; their own account, tickets and credit are untouched.
- **"The invitation never came."** Invitations by username appear in the person's notifications and under Settings › Teams. One by phone to a number with no account is texted (Ghana today, at most the daily number per team); the Owner sees "We couldn't text this number" if it did not go. Invitations last a week by default.
- **"Who answered me?"** (from a customer) Replies from a team show the team's name only. Staff can see which member wrote a message (`message_team_sender`) when a complaint needs it.
- **"I can't see the team's messages."** The member must manage as the team (Manage › Managing as on the website, the top of Organizer in the app) and hold Owner or Content and messages.
- **A team is paused with "no Owner left".** Its last Owner's account was closed or banned. Open the team, give a reason (the ticket and what was agreed), and use **Make Owner** on a current or former member the team agrees should run it; the team resumes at once and the person is told. Only someone whose own account is in good standing can be made an Owner. Needs `teams.manage` and a fresh sign-in.
- **Members of a team disagree (who owns it, who gets paid).** **Pause team** with "A dispute between members" while it is sorted out: nobody can change its events or places, move its money or answer as the team. When it is settled, appoint or keep the right Owners (members remove each other in the app; staff can make someone an Owner) and **Resume team**. Every step is in the audit log with your reason.
- **"Our Verified badge disappeared after we changed our name."** That is decision X42: the badge names the business, so a new name goes back to review. Their Owners were told and asked to confirm first. The case is in Admin › Verification (Pending); a reviewer approves it or asks for papers in the new name.
- **"I can't accept the invitation" / "I was taken out of my team."** Teams are for people 18 or older (legal item K7). Accepting asks the person to say so; an ID check that found them under 18 keeps them out, and takes them out of every team if it arrives later (the team's activity says "left the team: teams are for people 18 or older"). Nothing to do in the console; do not override it.
- **"Our front desk at one branch sees the other branch's bookings."** An Owner limits a Front desk or Door staff member to some places: Settings › Teams › the team › the member › Places. With places chosen, they see only those places' bookings and visit QR, and Door staff only scan tickets of events held there.
- **"We can't ask for a payout: an Owner needs to accept the team terms."** Abonten published (new) team terms and none of the team's Owners has accepted them yet. Any Owner accepts on the team page (Settings › Teams › the team). Staff cannot accept for them.
- **"Our member shared our event and earned nothing."** A team's own people earn on its events only when an **Owner** adds them as a promoter of that event (decision X36): Promotion tab (website) or the event panel (app) › Promoters › their username. Finance can add other people but not members. Even then they earn the team's commission only, never Abonten's referral reward. A sale before they were added shows no reward (their link was not counted).
- **"Who paid for this Spotlight promotion?"** The campaign is the team's; the payer is the member named in the team's activity ("paid to promote a Spotlight"). A refund goes back to that member's card.
- **"How do we get our team verified?" An Owner asks while managing as the team: Manage › Business verification (website) or the Organizer screen (app). They need the registration certificate and a directors listing or a signed letter showing they may act for the business. A group with no registered business cannot get the business badge; "ID checked" still shows once one of its Owners passes the ID check.
- **"I made my account a team and my @username changed."** That is how "make this a team" works: the team keeps the @username people know (with the events, places, followers and money); the person gets a new one, which they can change in their profile. The team's activity shows `team.converted` with who did it.
- **"It won't let me make my account a team."** It refuses while a payout is being processed (wait until it is paid), while a verification request is open (finish or withdraw it), or when the person runs no events or places (they make a new team instead).
- **"Who posted this?"** A team's Spotlight or Story shows the team only. The team's activity (Admin › Teams › the team) names the member who published it (`content_published`), and the upload is that member's (`content_media.owner_id`).
- **"I can't post as the team."** Only Owners and Content and messages post for a team, while managing as it. Others see "your role doesn't cover this" and switch back to their own account to post as themselves. Paying to promote a Spotlight is for one's own posts only for now.
- **"Whose credit paid for this feature?"** A feature bought for a team spends the team's credit (rebates and visit credit earned by its events and places); the member who bought it paid any cash part with their own card. The checkout records both (`owner_id` = the payer, `account_id` = the team), and the team's activity says who bought it.
- **"I can't use the team's credit."** Only Owners and Finance spend it, while managing as the team. If their role changed after they started the checkout, they start again.
- **"Can a team member see the money?"** Only Owners and Finance: the team's dashboard, insights, balance, ledger and payouts. Owners and Finance ask for payouts; only Owners change the payout account.
- **"The payout was refused: the account is too new."** A team's payouts go to a payout account only 48 hours after it was added, and every Owner is told when one is added. Wait out the 48 hours, or ask the Owners whether they added it.
- **"It asks me to sign in again before I change the payout account."** For a team, changing the payout account needs a sign-in in the last 15 minutes. Sign out of that device, sign in again and change it straight away.
- **"Our Finance person can't ask for a payout."** When ID checks are required, Owners and Finance pass one before moving money (Settings › Identity verification); the team also needs one Owner with a check.
- **"I can't see my team's events."** They need to choose the team under **Managing as** (Manage on the website, the top of Organizer in the app). Their role decides what they then see: Door staff only check people in, Front desk only bookings and the visit QR.
- **"Our door staff can't see the guest list."** That is the Door staff role: they scan or type a ticket's code and see whether it worked, never who is coming. Make them a Manager if they need the list.
- **"How do we change our team's @username, photo or bio?"** Owners do it on the team's page (Settings › Teams › the team: **Edit team profile**, **Change photo**). The field says at once whether a @username is free and suggests free ones. Links to the old @username keep working for 30 days and nobody else can take it in that time (people changing their own @username get the same). Staff cannot change it for them.
- **"How do we delete our team?"** An Owner asks on the team's page, typing its name; every other Owner must approve there within 7 days (each after signing in again), and any Owner can stop it. A team with one Owner is deleted when that Owner confirms. The page says what stops it: upcoming events with ticket holders or people paying in parts (cancel them first), a payout on its way or earnings not yet paid out, a payment or Spotlight promotion running, or an Owner removed or demoted by someone else in the last 7 days. Sales and payout records stay; the team's credit is lost; members' own accounts are untouched.
- **"Another Owner removed me / changed my role" (and maybe wants to delete the team).** The person was told who did it. A request to delete the team is refused for 7 days after that, so they have time to raise it. If it was not agreed, it is a dispute: **Pause team** while it is sorted out, and **Make Owner** if the business papers show they should run it. A pause also stops any deletion (nobody can act for a paused team).
- **Deleting a team as staff (abuse, a legal order).** Open the team, give a reason (ticket number and the grounds), then **Delete team**. Needs `teams.manage` and a fresh sign-in; audited as `teams.delete` with the name, username, Owners and member count it had. The same checks as for Owners apply (except their seven-day rule): refused while it owes attendees, a payout is moving, money is owed, or a payment or promotion is running; settle those first (Finance, Content). Every member is told "Abonten closed …". It cannot be undone.
- **A team shows as Deleted.** Its Owners agreed to delete it (or staff did: the page says which, and when). It is read-only: its members and activity stay for the record, its profile was scrubbed, its sales and payouts are kept. The name it had is shown in the title.
- **"An event I published went out under my own name, not the team's."** It was published while **Managing as** was on their own account. Moving a published event to a team is not possible yet; they can cancel and publish it again as the team.

## Switching it on

1. Staff only (the default audience).
2. Beta: add user ids, one per line.
3. Everyone. The console refuses it until both are done:
   - **Team terms published.** Once counsel approves the team terms (N4) and they are on the website (a section of the Terms of Service), type their version (e.g. `2026-12-01`) and where they are read (e.g. `/legal/terms#team-accounts`) under **Team terms**. From then on, whoever makes a team accepts them for it, Owners of existing teams are asked on the team page, and a team's payouts wait until one Owner has accepted. A new version asks everyone again. Leave the version empty until then: nobody is asked anything.
   - **Counsel's approval recorded.** Tick the box under **Before opening to everyone** once N4, N5, N9 and K7 are Decided in `docs/LEGAL_REVIEW_REQUIRED.md`. It is saved with your name, the time and your reason, and shown there afterwards.

   The same card warns when ID checks are not yet required for payouts for everyone (Admin › Identity): opening is allowed, but Owners' and Finance members' payouts then move without an ID check. List the help page (`help/organizers/team-accounts`, all five languages: `listed: yes`) in the same release.

`TEAMS_KILL_SWITCH=true` on the web deployment stops new teams, invitations and accepting at once. Members can still leave and Owners can still remove members.

## The jobs

`team-invites-expire` (pg_cron, every 15 minutes) ends invitations past their deadline and records it in the team's activity. If it stops, invitations stay "waiting" past their deadline but can no longer be accepted (the accept checks the deadline itself).

`team-delete-requests-sweep` (pg_cron, every 15 minutes) ends requests to delete a team that ran past their 7 days, and requests that something now stops (an event sold a ticket, a payout started). If it stops, nothing is deleted by mistake: approving and deleting check the deadline and the blockers themselves, and the team page shows no request past its deadline.
