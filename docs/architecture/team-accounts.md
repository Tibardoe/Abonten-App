---
title: Team accounts — organizers and places run by several people
purpose: How an organizer or a place becomes a team account run by members with roles, how members are invited, join, change role, leave and are removed, what the database guarantees, and how the programme is switched on. Stages 1 to 5 of Part 2 of the Tickets, entry and teams plan.
audience: Engineering, operations, support and legal reviewers
scope: user_info.account_kind, the team, team_member, team_invite, team_activity and team_program_setting tables, team_role_can(), acts_for(), acting_accounts() and acting_account_for(), the team_* functions, the access rules on events, places and money, the organizer money functions, the team notice fan-out, @abonten/core/teams/roles, @abonten/services teams and admin/teams, the web actions in src/actions/teams, /api/mobile/teams/**, Settings › Teams on the website and in the app, Admin › Teams and the team-invites-expire job.
status: Review required
version: 1.8
lastReviewed: 2026-11-16
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Team accounts

**State (2026-11-16): stages 1 to 4c (messages, reviews, featuring, the team's credit, Spotlight and Stories) "make this a team", the staff tools for paused teams and the business check with its badges built, switched off.** Part 2 of the Tickets, entry and teams plan ([specifications/tickets-entry-and-teams.md](../specifications/tickets-entry-and-teams.md)); decisions X5–X8 and X42 were approved by the founder on 2026-11-15 ([OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)). Legal items N4 (team terms) and N5 (ID checks for Owners and Finance) are open ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)). `team_program_setting.enabled = false`, audience `staff`, and `TEAMS_KILL_SWITCH` is available on the web deployment.

## 1. The model: a team is its own account

An organizer or a place can be run by a team: one public profile (handle, followers, events, places, reviews, payout account, credit) run by members who each sign in with their own account and hold a role. The founder chose this model on 2026-11-15 over letting members sign in *as* the team.

- **The team is a `user_info` row with `account_kind = 'team'`**, backed by an auth user that can never sign in: no password, no identity, a `.invalid` email and a 100-year ban (`createTeamCore`). Everything already keyed on a user id (events, places, follows, conversations, payouts, credit, verification, notices) can therefore belong to a team without a second ownership model.
- **Members sign in as themselves and act for the team.** Every action will check the member's role first, and anything not opened up for a role stays closed, so a mistake fails safe. Each action records the member who took it (`team_activity`).
- `account_kind` is one of the columns only the server may change (`protect_user_info_privileged_columns`).

Stages: **1** — teams, members, invitations, roles, activity, Admin › Teams. **2** — running events and places as a team (Manager, Door staff, Front desk), attendee lists, check-in (§4a). **3** — the team's money (§4b): Owners and Finance, the payout account and its 48-hour wait, ID checks, notices by role; "make this a team" (turning a person's existing listings into a team's) follows stage 4, because a converted account needs its money and messages to work as a team. **3** — money: the team's payout account (Owner only, fresh sign-in, the first payout to a new account held 48 hours, every Owner told), Finance, the ID check for Owners and Finance (X5), rebates to the team's balance. **4** — messages and content: the team inbox, review replies, Spotlight and Stories, customers seeing only the team's name (X7). **5** — trust and edge cases: the business check and the two team badges, a renamed team with the business badge going back to review (X42), disputes, bans, expired IDs.

Since stage 2 a team's members run its events and places within their role (§4a), since stage 3 Owners and Finance its money (§4b), since stage 4 the team's messages and review replies are answered by Owners and Content and messages (§4c), since stage 4b Owners and Finance feature its events and places with its credit (§4d), and since stage 4c Owners and Content and messages post Spotlights and Stories as the team (§4e); paying to promote a Spotlight as a team is still "coming soon".

## 2. Roles (X5)

| Role | Can (capabilities) | ID check |
|---|---|---|
| Owner | everything: `team.members`, `team.profile`, `payout.manage`, `payout.view`, `payout.request`, `money.view`, `refunds.issue`, `promotions.buy`, `verification.request` (since stage 5) and every capability below | yes |
| Finance | `payout.view`, `payout.request` (since stage 3), `money.view`, `refunds.issue`, `promotions.buy` (since stage 4b) | yes |
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

## 4a. Acting for a team (stage 2)

**Who a request is for.** A signed-in person acts for themselves, or for one team chosen under **Managing as**: the website's Manage menu (cookie `abn_team`, which only selects) or the app's Organizer screen (header `x-abonten-team`, sent on signed-in requests, remembered per account on the phone in SecureStore and forgotten on sign-out). Every organizer and place request that can act for an account calls `resolveActingAccount` (`@abonten/services/teams/actingAccount`; web `actingFor()` in `apps/web/src/utils/teamActor.ts`, app routes `mobileActingFor()` in `api/mobile/_lib/actor.ts`) with the capability it needs. It re-checks, every time: the kill switch, that the person is an active member of the active team, that their role covers the capability, and that the person's own account is not restricted. The account it returns is the one the request reads and writes as (`event.organizer_id`, `place.owner_id`, the upload folder of a flyer or place photo); the person stays the one signed in. A request that does not name a capability (anything not converted yet) acts for the person, so an unconverted screen can never act for a team.

**What the database lets each role do.** `public.acting_accounts(caps text[])` is the signed-in person's own id plus every active team they are an active member of in a role covering one of `caps`. Each access rule on the event and place tables that compared an owner column with `auth.uid()` now asks whether the owner is one of those accounts, wrapped in a `SELECT` so it runs once per statement and never once per row (migration `20261116100000_team_accounts_events_places`, 42 rules on `event`, `event_occurrence`, `event_media`, `ticket_type`, `promo_code`, `promo_code_usage`, `ticket`, `attendance`, `event_analytics_event`, `place`, `place_photo`, `place_service`, `place_opening_hours`, `place_booking`, `place_analytics_event`). Signed-out visitors read public listings through the same rules, so `anon` may call it too and gets an empty list. The promo-code guard, the booking guard and `get_event_attendee_contacts` follow the same capabilities.

| Role | Can, for the team | Cannot |
|---|---|---|
| Owner | Everything below, and the team's money (§4b) | |
| Manager | Publish and edit events, ticket types and dates, promo codes, the attendee list, check-in; edit places, photos, services and hours, and see a place's insights; bookings | Money, messages, reviews, verification, featuring; the visit QR (Front desk and Owners) |
| Door staff | Check a ticket in by scanning or typing its code (only that event's tickets) | See who is coming |
| Front desk | Answer a place's booking requests; show the visit QR | Change the place |
| Finance | The team's money (§4b); featuring its events and places with its credit (§4d) | Changing events and places |
| Content and messages | The team's inbox and review replies (§4c); Spotlights and Stories as the team (§4e) | Money; paying to promote a Spotlight |

**Screens.** Website: the Manage menu lists the person's teams with their role; a team's event page shows the tabs the role covers (details, attendees, or check-in by code), a team's place page the same (details, photos, hours, services, bookings, visit QR). App: Organizer starts with a **Managing as** card; with a team chosen it shows the team's events and places as far as the role covers, an event or a place opens a panel of what the role can do, Door staff get a scan-or-type check-in screen instead of the attendee list, and the publish screens say "Publishing as …" with a way back to the person's own account. Sales figures, payouts, cancelling an event (it refunds buyers), promotion, reviews and verification stay on the person's own account until stages 3 and 4.

## 4b. A team's money (stage 3)

**Who sees and moves it.** Owners and Finance see the team's sales, earnings, balance, ledger and payouts and ask for payouts (`money.view`, `payout.view`, `payout.request`); only Owners change the payout account (`payout.manage`); cancelling an event refunds its buyers, so it needs a role that covers both `events.manage` and `refunds.issue` (Owners). Managers, Content, Door staff and Front desk see no money.

**How the database checks it.** Every organizer money function (the dashboard and its parts, the finance overview, the ledger, pending earnings, refund breakdowns, the event analytics, `request_organizer_payout`, `get_event_cancellation_impact`, `cancel_event_and_release_tickets`; migration `20261116120000_team_accounts_money`) takes `p_account` (null = the signed-in person) and resolves it with `public.acting_account_for(p_account, caps)`: the person's own account, or the named team when their role covers every capability asked for; anything else is refused (`42501`, "Not allowed for this account"). The functions are `SECURITY DEFINER` now (the rows they read are the team's, not the caller's) and are not executable by `anon`. The read rules on `organizer_ledger_entry` (`money.view`), `payout` and `payout_account` (`payout.view`) use `acting_accounts`, and Finance may read the team's events, dates and ticket types (`money.view` added to those read rules). `payout.requested_by` records who asked.

**The payout account (X6).** Changing a team's payout account (add, remove, make main) needs a sign-in in the last 15 minutes (`FRESH_SIGN_IN_MINUTES`; the newest `amr` timestamp of the verified access token) and, when ID checks are required, a live one for the Owner; every Owner is told (notices `team_payout_account_added` / `_removed` / `_default`) and the team's activity records it. A team's payout to a payout account added less than 48 hours ago is refused by `request_organizer_payout` ("Payout account too new"), so an Owner can stop a change they did not make before money moves. Every payout a member asks for is recorded and every Owner told (`team_payout_requested`).

**ID checks (X5).** An Owner or Finance member asking for a payout or changing the payout account passes the payouts ID requirement themselves. A requirement on the team account itself (paid events, payout accounts) is met when one of its active Owners has a live check (`requireVerifiedIdentity` on a team; message `identity.teamOwnerRequired`). The requirement applies to a team when it applies to any of its Owners.

**Notices by role.** A notice written to a team (a booking request, a review, a payout notice) is copied by the trigger `trg_notification_fan_out_to_team` to every active member whose role covers it (`public.team_notice_capability`: bookings → `bookings.manage`, reviews → `reviews.reply`, messages → `messages.reply`, Spotlight → `content.post`, refunds → `refunds.issue`, payouts → `payout.view`, credit and plans → `money.view`, anything else → Owners). Each copy carries `team_id` / `team_name` / `source_notification_id`, is queued for a push to the member (`notification_delivery`, source `app`, migration `20261116130000`; the member's own push preferences apply when it is sent), and opening it on the website or in the app switches "Managing as" to the team first; a manage page opened while managing as another account offers to switch. A team account's email address is a placeholder on the reserved `.invalid` domain: the delivery queue and `sendEmail` never send to it (it would only bounce).

**Screens.** Website: Dashboard and Finances in the Manage menu for Owners and Finance; the Insights tab on a team's event; add, remove and make-main on payout accounts for Owners only (with the 48-hour and sign-in rules shown); Withdraw for Owners and Finance; Cancel event for Owners. App: Owners and Finance get the dashboard and an event's insights for the team; Withdraw for Owners and Finance; payout account changes for Owners; Cancel event for Owners. Featuring and the team's credit came in stage 4b (§4d); the promoter commission stays with the person's own account for now.

## 4c. Messages and review replies (stage 4)

**The team's inbox.** Members whose role covers `messages.reply` (Owners, Content and messages) read and answer the team's conversations while managing as the team: the inbox, the unread count and its badge, read state, mute and archive, blocks, reactions and edits are the team's. `public.messaging_actor(conversation)` says who the signed-in person speaks as there (themselves when they take part, else the team they answer for), and every messaging function uses it; `list_conversations` and `get_unread_conversation_count` take `p_account` (checked with `acting_account_for`). `is_conversation_participant` counts the teams a person answers for, so the message, attachment and reaction read rules, the conversation's realtime channel and its attachment files open to those members; the team's `inbox:<team>` channel is readable by them too. A member whose role does not answer messages keeps their own inbox even while managing as the team.

**Customers see the team (X7).** A message a member sends is the team's (`sender_id` = the team; notifications name the team). Which member wrote it is kept in `message_team_sender`, which only the server can read.

**Reviews.** Members whose role covers `reviews.reply` reply to reviews of the team's events and places (the review update rules and the column guards use `acting_accounts`); the website shows the reply controls to them on the team's event and in the place page's Reviews tab, the app on the team's event and place panels.

**Your own team.** Nobody reviews an event or a place of a team they belong to, or opens a conversation with it as a customer (`is_team_member`).

## 4d. Featuring and the team's credit (stage 4b)

**Who features.** Owners and Finance (`promotions.buy`, added to Finance by migration `20261116150000_team_accounts_promotions`) feature the team's events and places: the website shows them the Promotion tab of a team's event and place, the app the Promote button (events) and the Feature row (places; still off on iPhone, decision D6). Managers, Content, Door staff and Front desk do not.

**Who pays.** The member pays the cash part with their own card or wallet, as before; a promotion checkout keeps them as `owner_id` (the payer) and, new, `account_id` = the team it was bought for (null when someone features their own listing). Checkouts stay server-write-only: the service checks the member's role (`resolveActingAccount`, `promotions.buy`) before it writes one.

**The team's credit.** The credit part comes from the TEAM's credit: organizer and venue rebates and place-visit credit already go to the account that runs the event or place, which for a team is the team. `loadPromotionOrder` spends `checkout.account_id`'s credit, and only while the payer still buys features for the team (otherwise the checkout is "not found" and they start again as themselves); the "Use credit" switch names the team ("Promo Crew has GH₵ 30 you can use here"). The reservation is the team's (`credit_reservation.user_id` = the team); `finalizePayment` accepts it for the member's payment only when the server-written checkout says so (`owner_id` = the payer, `account_id` = the reservation's account). The member's own credit is never used on a team's feature, and the team's never on anything else.

**Seeing it.** Owners and Finance see the team's promotion credit on the team's Finances (website and app); a credit notice copied to them (`promotion_credit_earned` and the other credit notices) opens the team's Finances, not the reader's own Rewards page (the copy's link `/rewards` becomes `/finances`; the app opens Finances for a credit notice that carries `team_id`). "Your event is now featured" goes to the team, so its Owners and the members who buy features get a copy; the team's activity names who paid for it (`promotion_bought`).

**The Rewards audience.** The audience (`staff`, `beta`) lists people, and a team can be neither; `rewards_enabled_for_user` now counts a team in when an active Owner of the active team is in the audience, so staff testing a team can see and spend its credit. At `all` nothing changes.

## 4e. Spotlight and Stories as a team (stage 4c)

**Who posts.** Members whose role covers `content.post` (Owners, Content and messages) post Spotlights and Stories as the team while managing as it: the post's author is the team (`content_post.author_id`), followers and viewers see the team only, and the team's activity names who published it (`content_published`). The composer and the creator screens say "Publishing as …" with the way back to the person's own account; a member whose role does not post sees "your role in this team doesn't cover this" there instead (the programme answers `blocked`, so nothing can be posted until they switch back).

**What is checked.** The audience is the person's (staff, beta, everyone); whether they may publish, and as which places, is the team's (`resolveContentAccess(person, { publisherId })`: the team's live events, verified status and published places). `content_post_publish()` and `content_publisher_eligible()` needed no change: they already check the account a post is published as, including its daily caps. Uploads stay the person's (`content_media.owner_id`, folder `content_media/<environment>/<person>`): a member attaches only their own uploads to the team's post. The writes (create, publish, edit, delete), the team's post list, its insights and the attachable events go through `actingFor(…, "content.post")` / `mobileActingFor`; reading a draft, and removing comments on the team's posts, accept the team for those members (`contentPublisherFor` / `mobileContentPublisher`). The person's own profile keeps listing their own posts (`mine?personal=true`).

**Replies.** A reply to a team's Story opens a conversation with the team, answered in its inbox (§4c). A member does not reply to their own team's Story (`send_story_reply` refuses it, as it refuses one's own; migration `20261116160000_team_accounts_content`).

**Not yet.** Paying to promote a Spotlight stays with the person's own posts: the programme answers `spotlightPromotions = false` while posting as a team, so the Promotions tab and the Promote buttons are not offered.

## 4f. Make this a team (X8)

**What it does.** A person who runs events or places turns that work into a team without losing what people know it by (Settings › Teams › "Make your organizer account a team", website and app). The new team takes their **@username**, name (they may change it), photo, bio and website; their **events and places** (with their reviews, promo codes, ticket types, plans and promotions, which follow by id; a place keeps its Verified badge); their **followers** and alert subscribers (X8); the **conversations about those events and places** (the team answers them now); the **organizer money** (ledger, payouts, payout accounts: no 48-hour hold, the accounts keep their age) and the **organizer badge** (`organizer_verified*` and the organizer verification cases). The person becomes the team's first **Owner** and gets a new @username marked as generated, so the account-setup reminder asks them to choose one. Their tickets, credit, Spotlights and Stories, direct messages and ID check stay with them.

**When it refuses.** Nothing to move (no events or places of their own: they make a new team instead); a payout being processed (`payout.status = processing`); a verification request still open, for them as an organizer or for one of their places. Each refusal leaves nothing behind.

**How.** `convertAccountToTeamCore` creates the team's auth user (as `createTeamCore` does) and calls `public.team_convert_account(account, person, name, max_created)` (service role only, migration `20261116170000_team_accounts_convert`), which does everything in one transaction: frees the handle, runs `team_finalize_create`, copies the public face (registering the photo in `user_image_history` for the team), moves the rows above, logs `team.converted`. If it fails, the service deletes the auth user. `verification_on_place_owner_change` skips the revoke for the conversion's own team (a transaction-local `abonten.team_conversion` setting), so a converted place keeps its badge; any other owner change still revokes it. The overview says whether the person can convert (`canConvert`).

## 4g. Paused teams, disputes and the Verified name (stage 5, first part)

**A team with no Owner.** When the last Owner's account closes or is banned, they leave every team and the team pauses (`team_forget_member`, status `frozen`, reason `no_owner`): nobody can act for it. Staff bring it back in Admin › Teams › the team: **Make Owner** makes a current member, or a former one whose own account is in good standing, an Owner (`admin_team_appoint_owner`); a team paused only for having no Owner resumes at once, and the person is told ("Your role in … changed").

**A dispute.** Staff **pause** a team (`admin_team_set_status` → `frozen`, reason `dispute` or `staff`) so nobody acts for it while it is sorted out, and **resume** it once settled; resuming is refused while the team has no Owner. Both functions are service-role only; the console needs `teams.manage` (Operations; super admins), a fresh sign-in and a reason, and writes `teams.pause` / `teams.resume` / `teams.owner.appoint` to the audit log. The team's activity shows `team.frozen`, `team.resumed` and the role change with no member as the actor (staff did it). Migration `20261116180000_team_accounts_staff_tools`.

**A renamed Verified team.** The interim name lock that stood here (`team_rename_guard_verified`) was replaced the same day by X42's review after a rename: §4h.

## 4h. The business check, badges and a renamed team (stage 5, second part)

**Who asks.** A team's Owners (capability `verification.request`, Owner only) ask Abonten to verify the team itself, the business check, and its places, while managing as the team: Manage › Organizer verification (titled "Business verification" for a team) and a place's Verification tab on the website; the Organizer screen and a place's panel in the app. The request is the team's (`verification_case.requester_id` = the team, `requested_by` = the member who asked), so every Owner sees it, continues it and is told about it (verification notices go to a team's Owners, `team_notice_capability`). Other roles do not see it (`TeamRoleBlocked` / `TeamRoleBlockedNotice`). `verification_transition()` checks that a member acting on a team's case is an active Owner of the active team (`_verification_actor_ok`), and refuses to submit or approve while the team is paused (`_verification_team_active`).

**What the business check needs.** A team is checked as a registered business or organisation, never as an individual (the choice is not offered, and the server refuses it), with its registration certificate and a paper showing the Owner may act for it: a directors or partners listing (new document type `director_listing`) or a signed letter on its letterhead. `verification_transition()` refuses to submit a team's request without them (`verification_team_requirements`). A group with no registered business does not get the business badge; it can still show "ID checked" through its Owners.

**Badges.** A team with the organizer badge shows it as **"Verified business"** (its popover says Abonten reviewed the business's registration and that the Owner who manages the team may act for it). **"ID checked"** shows on a team when at least one active Owner of the active team has a live ID check, never which one: one rule for people and teams, `public.account_id_checked()`, readable as the computed column `user_info.id_checked` (the website's event page and profile, the app's event screen, the Safety view) and folded into `get_public_profile` (which also says `account_kind`). The wording is legal item N9.

**A renamed Verified team (X42).** The badge names the business, so when a Verified team changes its name the approved case goes back to review (new system action `return_to_review`, approved → pending_review): the badge comes off at once, the case is back in the reviewers' queue with the old and new names on its history (`subject_changed`), and the Owners are told (`verification_back_in_review`). Owners are asked to confirm before renaming. A reviewer approves the team as it is now, asks for papers in the new name, or rejects. A badge with no approved request behind it simply comes off. This replaced the interim name lock of §4g (`team_rename_guard_verified`, dropped). Migration `20261116190000_team_accounts_verification` (trigger `team_name_back_to_review`, function `verification_team_back_to_review`).

**"Make this a team" and verification.** An organizer case now moves whole to the new team (subject and requester; the person stays on it as `requested_by`). Before, any person who had ever asked for organizer verification could not convert (the case moved while its requester did not, which a check refuses). A badge that came from an individual's request, or that moves to a team under another name, goes back to review on the way (X42).

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
| Acting (stage 2) | Migration `supabase/migrations/20261116100000_team_accounts_events_places.sql`; `packages/services/src/teams/actingAccount.ts`; web `apps/web/src/utils/teamActor.ts`, `actions/teams/{setActingTeam,getActingContext}.ts`, `teams/useActingContext.ts`, the Manage menu; app routes `api/mobile/_lib/actor.ts`, `GET /api/mobile/teams/acting`; app `src/features/teams/{actingTeam.ts,ManagingAs.tsx}`, `src/components/organizer/DoorCheckIn.tsx` |
| Money (stage 3) | Migration `supabase/migrations/20261116120000_team_accounts_money.sql`; `packages/services/src/teams/{teamMoney,accountArg}.ts`; the organizer money cores (`organizer/*Query.ts`, `payoutAccountCore`, `requestOrganizerPayoutCore`, `events/cancelEventCore`); identity `identityCore.requireVerifiedIdentity` (teams); website `teams/molecules/SwitchToTeamPrompt.tsx`, the Finances and event menus; app `src/features/teams/noticeTeam.ts`, the Organizer, event and Finances screens |
| Messages and reviews (stage 4) | Migration `supabase/migrations/20261116140000_team_accounts_messages_reviews.sql`; `messaging/conversationsQuery.ts`, `sendMessageCore.ts`, `reviews/reviewResponseCore.ts`; website `utils/teamActor.teamInboxAccount`, `teams/atoms/TeamInboxBanner.tsx`, the reviews organisms; app routes `_lib/actor.mobileTeamInboxAccount`; app `features/teams/ManagingAs.TeamInboxBanner`, the inbox realtime hooks |
| Featuring and credit (stage 4b) | Migration `supabase/migrations/20261116150000_team_accounts_promotions.sql`; `promotions/insertEventPromotionCheckoutCore.ts`, `fetchEventPromotionContext.ts`, `places/placePromotionCore.ts`, `rewards/creditRedemptionCore.loadPromotionOrder`, `payments/finalizePayment.reservationMatches`, `teams/teamMoney.recordTeamMoneyEventFor`; website `utils/activate{Event,Place}Promotion.ts`, the event and place Promotion tabs, `UseCreditToggle`; app routes `organizer/{events,places}/[id]/{promote,promotion}`, `rewards/promotion-credit`; app the event and place panels, Finances, `CreditSwitch`, `notificationLink` |
| Spotlight and Stories (stage 4c) | Migration `supabase/migrations/20261116160000_team_accounts_content.sql`; `content/contentProgram.resolveContentAccess` (`publisherId`, `blocked`), `contentPostCore.ts`, `contentMediaCore.ts`, `contentEngagementCore.ts`; website `utils/teamActor.contentPublisherFor`, `teams/atoms/{PublishingAsBanner,TeamRoleBlockedNotice}.tsx`, the creator hub and composer, `getShellBootstrap`; app routes `_lib/actor.mobileContentPublisher`, `content/**`, `uploads/signature`; app `spotlight/{new,manage}.tsx`, `useContentProgram`, `useContent` |
| Make this a team | Migration `supabase/migrations/20261116170000_team_accounts_convert.sql`; `teams/teamCore.convertAccountToTeamCore`; website `actions/teams/convertAccountToTeam.ts`, `teams/molecules/ConvertAccountDialog.tsx`, the Teams overview; app route `POST /api/mobile/teams/convert`; app `features/teams/TeamSheets.ConvertAccountSheet`, Settings › Teams |
| Business check and badges (stage 5) | Migration `supabase/migrations/20261116190000_team_accounts_verification.sql`; `verification/verificationCaseCore.ts` (`personId`, `programFor`), `verificationRows.ts`; website `utils/verificationAction.ts`, `/manage/verification`, `ManagePlaceView`, `OrganizerVerificationCard`, the badges; app routes `verification/_lib/handler.ts`; app `organizer/verification.tsx`, the place panel, `VerificationScreen`, `VerifiedPill`, `IdentityCheckedPill`; admin the verification case page |
| Staff tools (stage 5) | Migration `supabase/migrations/20261116180000_team_accounts_staff_tools.sql`; `admin/teams/teamsAdminCore.{setTeamStatusAdminCore,appointTeamOwnerAdminCore}`; admin `server/actions/teams.ts`, `app/(console)/teams/[teamId]/TeamStaffActions.tsx` |
| Tests | `packages/services/src/__integration__/teams.integration.test.ts`, `teams-acting.integration.test.ts`, `teams-money.integration.test.ts`, `teams-messages.integration.test.ts`, `teams-promotions.integration.test.ts`, `teams-content.integration.test.ts`, `teams-convert.integration.test.ts`, `teams-staff.integration.test.ts`, `teams-verification.integration.test.ts` |

## 8. Not yet (later stages)

Acting for a team on paid Spotlight promotion and the promoter commission; emails about a team to its members (the in-app notice and the push reach them; the email is not sent); a member under 18 (needs a date of birth: K7), and limiting Front desk and Door staff to one place of a chain.
