---
title: Team accounts — organizers and places run by several people
purpose: How an organizer or a place becomes a team account run by members with roles, how members are invited, join, change role, leave and are removed, what the database guarantees, and how the programme is switched on. Stage 1 of Part 2 of the Tickets, entry and teams plan.
audience: Engineering, operations, support and legal reviewers
scope: user_info.account_kind, the team, team_member, team_invite, team_activity and team_program_setting tables, team_role_can() and acts_for(), the team_* functions, @abonten/core/teams/roles, @abonten/services teams and admin/teams, the web actions in src/actions/teams, /api/mobile/teams/**, Settings › Teams on the website and in the app, Admin › Teams and the team-invites-expire job.
status: Review required
version: 1.0
lastReviewed: 2026-11-15
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Team accounts

**State (2026-11-15): stage 1 built, switched off.** Part 2 of the Tickets, entry and teams plan ([specifications/tickets-entry-and-teams.md](../specifications/tickets-entry-and-teams.md)); decisions X5–X8 and X42 were approved by the founder on 2026-11-15 ([OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)). Legal items N4 (team terms) and N5 (ID checks for Owners and Finance) are open ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)). `team_program_setting.enabled = false`, audience `staff`, and `TEAMS_KILL_SWITCH` is available on the web deployment.

## 1. The model: a team is its own account

An organizer or a place can be run by a team: one public profile (handle, followers, events, places, reviews, payout account, credit) run by members who each sign in with their own account and hold a role. The founder chose this model on 2026-11-15 over letting members sign in *as* the team.

- **The team is a `user_info` row with `account_kind = 'team'`**, backed by an auth user that can never sign in: no password, no identity, a `.invalid` email and a 100-year ban (`createTeamCore`). Everything already keyed on a user id (events, places, follows, conversations, payouts, credit, verification, notices) can therefore belong to a team without a second ownership model.
- **Members sign in as themselves and act for the team.** Every action will check the member's role first, and anything not opened up for a role stays closed, so a mistake fails safe. Each action records the member who took it (`team_activity`).
- `account_kind` is one of the columns only the server may change (`protect_user_info_privileged_columns`).

Stages: **1 (this document)** — teams, members, invitations, roles, activity, Admin › Teams. **2** — running events and places as a team (Manager, Door staff, Front desk), attendee lists, check-in, notices by role, "make this a team". **3** — money: the team's payout account (Owner only, fresh sign-in, the first payout to a new account held 48 hours, every Owner told), Finance, the ID check for Owners and Finance (X5), rebates to the team's balance. **4** — messages and content: the team inbox, review replies, Spotlight and Stories, customers seeing only the team's name (X7). **5** — trust and edge cases: the business check and the two team badges, a renamed team with the business badge going back to review (X42), disputes, bans, expired IDs.

In stage 1 a team cannot run anything yet: the screens say so ("coming soon").

## 2. Roles (X5)

| Role | Can (capabilities) | ID check |
|---|---|---|
| Owner | everything: `team.members`, `team.profile`, `payout.manage`, `payout.view`, `money.view`, `refunds.issue` and every capability below | yes |
| Finance | `payout.view`, `money.view`, `refunds.issue` | yes |
| Manager | `events.manage`, `places.manage`, `promo.manage`, `bookings.manage`, `attendees.view`, `checkin.scan` | no |
| Content and messages | `messages.reply`, `content.post`, `reviews.reply` | no |
| Door staff | `checkin.scan` (scan results only, never the attendee list) | no |
| Front desk (places) | `bookings.manage`, `visit.show` | no |

The matrix lives twice and must change in both places together: `@abonten/core/teams/roles` (unit-tested) and `public.team_role_can(role, capability)` (pinned by the migration's checks). `public.acts_for(account, capability)` answers "may the signed-in person act for this account in this capacity": it is their own account, or they are an active member of the active team with a role that covers it. Stages 2–4 use it in access rules in place of `= auth.uid()`; the signed-in role may execute it, and it answers only for the caller.

## 3. Rules the database keeps

All in `supabase/migrations/20261115190000_team_accounts_foundation.sql`, under row locks (the team, then the member or invitation); the services check them first only to choose the words.

| Rule | Where |
|---|---|
| Only an active member whose role covers the capability acts; nobody acts for a paused team | `_team_require` |
| Only Owners invite, change roles, remove and withdraw invitations; only Owners rename | `team.members`, `team.profile` |
| A team always has an Owner: the last Owner cannot leave, be demoted or be removed | `team_member_set_role`, `team_member_remove`, `team_member_leave` |
| One open invitation per person (or number) per team; nobody invited into a team they are in, nobody into their own team, never a team into a team, never someone who blocked the inviter | `team_invite_send`, unique indexes |
| The receiver is the account named, or the account whose verified phone is the number named | `team_invite_accept` / `_decline` |
| At most `max_members` (members plus open invitations) per team; at most `max_teams_created` teams made by one person | `team_invite_send`, `team_invite_accept`, `team_finalize_create` |
| A member whose account is suspended, banned or deleted leaves every team; a team left with no Owner is paused (`status = 'frozen'`, reason `no_owner`) | trigger `user_info_team_forget` → `team_forget_member` |
| Activity is a record: added to, never changed | trigger `team_activity_no_update` |

Everything is service-role only: the five tables have RLS on with no client grants, and every `team_*` function is executable by `service_role` alone (`acts_for` and `team_role_can` excepted, as above).

## 4. The flow

1. **Make a team** (`createTeamCore`): the programme must be open to the person, their account unrestricted and personal. The service creates the team's sign-in-less auth user (its trigger makes the profile row), then `team_finalize_create` turns that row into a team (name, chosen username, the maker's country) with the maker as first Owner; if that fails, the auth user is deleted.
2. **Invite** (`inviteTeamMemberCore`, Owners): by username (the person's public name and photo show first) or phone number (masked, never said to belong to anyone). A number with an account goes to that account. A number with none needs a market Abonten can text and a text left for the team today (`texts_per_team_per_day`, X44); the person joins by signing up with that number. The Owner sees "We couldn't text this number" when the text did not go.
3. **Accept or decline** (`answerTeamInviteCore`): accepting adds the member in the role given (a former member's row is reactivated); the inviter is told.
4. **Change a role, remove, leave** (Owners; leaving for anyone): the member is told of a new role or a removal; access ends at once.
5. **Expiry**: the `team-invites-expire` job (pg_cron, every 15 minutes, `team_invite_expire_due()`) ends invitations past their deadline (`invite_hours`, a week by default) and records it in the activity.

Notices (`@abonten/core/notifications/notices`, words in the recipient's language): `team_invite_received`, `team_invite_accepted`, `team_member_removed`, `team_role_changed`. `data.kind = 'team'`; the app opens Settings › Teams, the website `/settings/teams`.

## 5. Who sees what

- **Members** see the team, every member's public name, photo, role and whether they passed the ID check.
- **Owners** also see open invitations (an invited number only masked) and the activity (an invited number keeps only its last four digits).
- **Staff** (Admin › Teams, `teams.view`): every team with its Owners and member count, and one team's members and full activity. Read-only in stage 1.

## 6. Programme switches (X43)

| Switch | Off means |
|---|---|
| `team_program_setting.enabled` / `audience` (`staff` → `beta` → `all`) | No new team and no new invitation from people outside the audience. Teams that exist stay visible to their members, who can still answer invitations and leave; Owners can still remove members. Nobody is trapped in a team. |
| `TEAMS_KILL_SWITCH=true` (web) | The same, and nobody can accept an invitation. |

Limits in the settings row: `max_teams_created` (5), `max_members` (50), `invite_hours` (168), `texts_per_team_per_day` (20). Admin › Teams changes them (`teams.configure`, step-up, reason, audited as `teams.settings.update`). Rollout (X43): staff first, then beta, then everyone once counsel has approved N4 and N5.

## 7. Code map

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261115190000_team_accounts_foundation.sql` |
| Roles | `packages/core/src/teams/roles.ts` (+ test) |
| Services | `packages/services/src/teams/` (`teamCore`, `teamProgram`, `teamNotices`); admin `packages/services/src/admin/teams/` |
| Inputs | `packages/validation/src/teamSchemas.ts`; types `packages/types/src/teamType.ts` |
| Website | `apps/web/src/actions/teams/*`, `apps/web/src/teams/*`, `/settings/teams`, `/settings/teams/[teamId]` (Teams appears in Settings while the programme is open to the person or they are in a team or invited) |
| App routes | `apps/web/src/app/api/mobile/teams/**` (shared plumbing `_lib/teamRoute.ts`); client `api.teams.*` |
| App | `apps/mobile/app/(app)/settings/teams.tsx`, `apps/mobile/app/(app)/settings/team/[id].tsx`, `apps/mobile/src/features/teams/*` |
| Admin | `apps/admin/src/app/(console)/teams/*`; handbook [admin/teams.md](../admin/teams.md) |
| Tests | `packages/services/src/__integration__/teams.integration.test.ts` |

## 8. Not yet (later stages)

Acting for a team anywhere (events, places, check-in, money, messages, content), "make this a team", the team account switcher, the ID check requirement, the team's payout account and its 48-hour hold, the business check and badges, staff tools for disputes and paused teams, a member under 18 (needs a date of birth: K7), and limiting Front desk and Door staff to one place of a chain.
