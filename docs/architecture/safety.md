---
title: Abonten Safety — trusted contacts, SOS, check-ins and live location
purpose: How a person asks their own people for help from Abonten (SOS), asks Abonten to raise the alarm if they do not check in, or shares their live location for a night out; how contacts are told and what they see; and how the programme is switched on in stages.
audience: Engineering, operations, security and privacy reviewers
scope: The safety_* tables and functions, market.safety_config, @abonten/services safety and admin/safety modules, the /safety, /sos and /trusted web routes, /api/mobile/safety, /api/safety/dispatch, the app's Safety screens, Admin › Safety and the safety-dispatch and safety-housekeeping jobs. Not covered - background location, a contact picker and a home-screen shortcut, which need a native build (§12).
status: Review required
version: 1.0
lastReviewed: 2026-10-21
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Abonten Safety

**State (2026-10-21): built, switched off.** `safety_program_setting.enabled = false`, audience `staff`, `SAFETY_KILL_SWITCH` available on the web deployment. With the programme off nothing shows on the website or in the app, contacts can still open a link they were already sent, and Admin › Safety works normally. Rollout: §11 and [admin/safety.md](../admin/safety.md). Legal items I1–I5 must be Decided before the audience is Everyone.

## 1. What it is, and what it is not

People go out to events at night, often alone or in a group that splits up. Abonten Safety gives them three things, all aimed at **their own people** (family, partner, friends):

| Mode | What the person does | What their contacts get |
|---|---|---|
| **SOS** | Holds the SOS button for 1.5 seconds | A text (and a push/email where possible) at once: "SOS: Ama pressed the help button…", with a link to a live page showing where Ama is, her note, the event she is at, a button to call her and the local emergency number |
| **Check in on me** | Sets a time ("in 2 hours", "when the event ends") and an optional note ("walking home from Labadi") | **Nothing**, unless the person does not tap "I'm safe" by that time plus a 5-minute grace. Then the same alert as SOS, with the last known location. A reminder comes 5 minutes before the time (on the phone itself, so it works offline) |
| **Share my location** | Picks how long (1–12 hours or until the event ends) | A text: "Ama is sharing her live location with you until 02:00", with the live page. No alarm |

Pressing SOS while a check-in or a share is running turns that session into an alert: contacts keep the link they already have, and those not yet told are told.

On the live page a contact can say **"I'm on my way"**, **"I'm calling"** or **"I can't help right now"**; the person sees each answer at once ("Kofi is on the way"), and sees who has opened the alert. "I can't help" is there so the person knows to try someone else.

**What it is not.** Abonten never contacts the police, an ambulance or any emergency service, and never promises that anyone will answer. Every screen that offers SOS also offers a one-tap call to the local emergency number (Ghana: 112), and says plainly that SOS tells the person's contacts, not emergency services. The support policy (`docs/operations/support-operating-policy.md`) forbids claiming 24/7 or emergency support; Safety copy follows it. Legal item I1.

## 2. Design principles (why it looks like this)

1. **An alert is never refused.** Limits (texts per day, per-number opt-outs, no SMS rail for a country) can stop a *text*; the session is still recorded, push and email still go, and the app always offers to send the text from the person's own phone. The only hard requirement is the one-time setup (§3).
2. **No internet must not mean no help.** If the app cannot reach Abonten it opens the phone's own Messages app, addressed to the cached contacts, with a Google Maps pin of the current position, and retries the server alert with the same request id when the connection comes back (§7). Cellular SMS works where data does not.
3. **Hard to trigger by accident, easy to call off.** A 1.5-second hold with a filling ring and haptic ticks; then it sends immediately (no countdown — a countdown costs seconds when it matters). "I'm safe" and "That was a mistake" tell every contact who was told, so a false alarm costs one follow-up text.
4. **Location is shared only while it helps.** Positions go to contacts only while a session is open. The moment the person says they are safe the page stops showing where they are. An alert nobody closed stays visible for 24 hours after it expires, then disappears. Points are deleted 7 days after a session ends (setting `location_retention_days`).
5. **Staff never see where anyone was.** Admin › Safety shows delivery and timing for support, never coordinates.
6. **Contacts are people, not data.** Each contact gets one text when they are added, with a link to accept, decline, or stop all Abonten Safety texts to their number. Declined and opted-out numbers are never texted again.
7. **The event's team is asked only on purpose.** "Tell the event team" is a separate button after an alert, only for an event the person holds a ticket for, and off until legal item I4 is Decided.

## 3. Setup (one time)

Safety needs:

- **A verified phone number** on the account. It is how contacts know the alert is genuine and how they call back, and it makes throwaway accounts expensive for anyone who would use Safety to text strangers. Without one the Safety screen opens on "Add your phone number" (the existing phone verification flow).
- **At least one trusted contact** (up to `max_contacts`, default 5): name, phone, relationship, their language (the texts they get are written in it), optional email. Each new contact gets the invite text (`safety_contact.invited_at`). A contact whose number has no SMS rail (§6) is invited by email if they have one, otherwise not at all (status stays pending; the app says so).

A contact is `pending` until they open the link and accept (`accepted`) or decline (`declined`). **Alerts go to pending and accepted contacts**: an alert must not depend on whether a grandmother tapped a link. A contact who accepts while signed in to Abonten is linked to their account (`contact_user_id`) and also gets alerts as an urgent push and an in-app notice.

## 4. Data model

Migration `supabase/migrations/20261021180000_safety_core.sql`. Every table has RLS on and **no** anon or authenticated privileges; every function is `service_role` only. All writes go through `@abonten/services/safety` with the service-role client after the transport has proved who is asking.

| Table | Holds | Notes |
|---|---|---|
| `safety_program_setting` | One row: `enabled`, `audience` (`staff`/`beta`/`all`), `beta_user_ids`, `check_in_enabled`, `share_enabled`, `event_team_alerts_enabled`, `max_contacts`, `alerts_with_sms_per_day`, `invites_per_day`, `check_in_grace_minutes`, `alert_hours`, `share_max_hours`, `location_retention_days`, `session_retention_days` | Ships off, audience staff, event-team alerts off |
| `safety_contact` | A person's trusted contacts: name, `phone_e164`, email, `relationship` (code), `locale`, `position`, `status` pending/accepted/declined, `contact_user_id`, `invite_token_hash`, `invited_at`, `invite_count`, `responded_at` | `unique (user_id, phone_e164)`; at most `max_contacts` per person (service + trigger) |
| `safety_contact_optout` | Numbers that asked not to be texted: by one person (`user_id`) or by anyone (`user_id` null) | Checked before every invite and every alert text |
| `safety_session` | One SOS / check-in / share: `kind`, `status` (active → alerting → resolved / expired), `client_request_id`, `due_at`, `reminded_at`, `ends_at`, `alerted_at`, `alert_reason` (sos / check_in_missed), `resolved_at`, `resolution` (safe / false_alarm / ended / expired), `note`, `event_id`, `place_id`, `event_team_notified_at`, `country_code`, last position columns, `location_count`, `created_via` | `unique (user_id, client_request_id)` makes a retried start a no-op; a partial unique index allows **one open session per person** |
| `safety_location` | Position points of a session (time, lat, lng, accuracy, source) | Deleted `location_retention_days` after the session closes; at most 5,000 per session |
| `safety_recipient` | Who was told about a session: a contact (`contact_id`) or the event team (`recipient_user_id` = the organizer), with snapshots of name / phone / email / language, `view_token_hash`, views, `acknowledgement` (on_my_way / calling / cant_help) | `unique (session_id, contact_id)` |
| `safety_message` | Outbox: one row per text / email / push to send (`purpose` invite / share / alert / check_in_missed / safe / false_alarm / event_team, `channel` sms / email / push), with status, attempts, provider id, last error, `next_attempt_at` | `unique (recipient_id, purpose, channel)` and `unique (contact_id, purpose, channel, invite_count)` make sending idempotent |
| `safety_session_event` | The session's timeline (started, alerted, note, extended, event team, viewed, acknowledged, resolved, expired) | Shown on the contact page and in Admin |

`market.safety_config` (jsonb) holds each market's emergency numbers, `{"emergencyNumbers":[{"service":"all","number":"112"}, …]}`. Ghana is seeded with 112 (all emergencies), police 191, ambulance 193 and fire 192 (Government of Canada travel advice for Ghana, March 2026); operational decision J3 is to confirm them with Ghana's services. Staff edit them in Admin › Markets.

**Tokens.** A contact page link is `https://abontenhub.com/sos/<token>`; an invite is `/trusted/<token>`. The token is an HMAC of the row id with a key derived from the service-role key (`safety-view:v1`, `safety-invite:v1`), cut to 128 bits (22 characters) so the text stays short; only its SHA-256 is stored. The dispatcher can therefore rebuild a token for a retry without the plain token ever being stored.

## 5. Flows

### 5.1 SOS (`startSafetySessionCore`, kind `sos`)

1. The app gets a position: the last known fix (≤ 1.5 s), then a fresh high-accuracy fix in the background. **The start never waits for a fresh fix.**
2. `POST /api/mobile/safety/sessions` with a `clientRequestId` (uuid, made once per press). The service: checks the programme and the setup; reuses a session already started with that id; escalates an open check-in / share instead of opening a second session; otherwise inserts a session with `status = 'alerting'`, `ends_at = now + alert_hours`.
3. It writes a recipient row per eligible contact (not declined, not opted out) and an outbox row per channel: SMS when the number has a rail (§6) and the person is within `alerts_with_sms_per_day`, email when the contact has one, push when the contact is linked.
4. It sends the outbox **in the request** (in parallel, each text with the provider's 10-second deadline) and answers with each contact's state, so the screen can say "Sent to Ama and Kofi · Esi: no text (number outside Ghana) — text her from your phone". Anything not sent is retried by the dispatcher (§5.5).

### 5.2 Check in on me (kind `check_in`)

Starts `active` with `due_at`. The app schedules two local notifications (5 minutes before, and at the time). "I'm safe" resolves it; "+15 min" / "+30 min" extends it (`due_at` moves, the local notifications are replaced, the timeline records it). If `due_at + check_in_grace_minutes` passes, the dispatcher escalates it (`safety_escalate_due_check_ins()` flips it to `alerting` with `alert_reason = 'check_in_missed'`, row-locked so two runs cannot both escalate) and the alert goes out with the last known position. At `due_at` the dispatcher also pushes the person once ("Time to check in").

### 5.3 Share my location (kind `share`)

Starts `active` with `ends_at` (≤ `share_max_hours`), optionally to a subset of contacts. Contacts are told once (`purpose = share`). The session ends by itself at `ends_at` (status `expired`, resolution `ended`) — contacts are not texted for that; their page says "Ama stopped sharing".

### 5.4 Location while a session is open

While any session is open, the app sends its position every 20 seconds during an alert and every 60 seconds otherwise, plus at once whenever the app comes to the foreground (`useSafetyLocationReporter`, mounted for the whole signed-in app, not just the Safety screen). The Safety screen keeps the phone awake during an alert (expo-keep-awake, already in the binary). The website does the same with `watchPosition` and a screen wake lock while its Safety page is open. **Foreground only** in this version: once the phone is locked or the app is closed, contacts see the last position and how old it is (§12).

### 5.5 Dispatcher

pg_cron `safety-dispatch` (every minute) runs `run_safety_dispatch()`: it expires sessions past `ends_at`, and only when something is due (a check-in to escalate or remind, an outbox row whose `next_attempt_at` has passed) posts to `POST /api/safety/dispatch` with the notification-delivery token. The URL is derived from `notification_delivery_config.dispatch_url` (same host), so no environment needs new configuration. The route runs `runSafetyDispatchCore`: escalate, remind, then send due outbox rows (SMS up to 4 attempts at 1, 2 and 5 minutes; a timed-out text is retried too — in an emergency a duplicate is better than none). `safety-housekeeping` (daily 03:50 UTC) runs `safety_housekeeping()`: deletes points and position columns after `location_retention_days`, sessions after `session_retention_days`.

### 5.6 The contact's page (`/sos/<token>`, public, no sign-in)

`getSafetyViewCore(token)` answers the status, the person's name, photo and phone, the note, the event (title, venue, address, start time in the event's zone), the emergency numbers of the session's market, the timeline, this contact's own answer, and — only while the location is visible (§2.4) — the latest position with its age and accuracy plus the last 20 points. The page polls every 15 seconds while the session is open, shows a map (the site's Google Maps key) and "Open in Google Maps" / "Directions". Opening it the first time records `first_viewed_at` and tells the person "Kofi opened your alert". The page is `noindex`, sends `Referrer-Policy: no-referrer`, is never cached, and is rate-limited per address. Abonten users who are linked contacts open the same view natively (`/(app)/safety/watch/<token>`).

### 5.7 Tell the event team

From an open alert whose session has an `event_id` (an event the person holds an active or used ticket for): one tap writes a recipient of kind `event_team` for the event's organizer, an urgent push + in-app notice ("A guest at Afrochella asked for help"), and a timeline entry. The organizer sees the same contact page. Only when `event_team_alerts_enabled` (legal I4).

## 6. Channels

| Channel | When | How |
|---|---|---|
| SMS | The contact's number is in a market whose text rail is Hubtel (Ghana today: `market.otp_provider = 'hubtel'`) | `packages/services/src/sms/hubtelSms.ts` (`sendHubtelSms`, shared with the phone-code provider). Not logged in `phone_otp_send_log`: texts to contacts must not count against sign-in codes |
| Push + in-app | The contact accepted while signed in (`contact_user_id`), the event team, and every notice to the person themselves | `createNotificationCore` with a `safety_*` notice; urgent alerts set Expo `priority: high` and web push `urgency: high` |
| Email | The contact gave an email | `apps/web/src/utils/sendSafetyEmail.ts`, injected into the service as a dependency (the services package has no email sender) |
| The person's own phone | Always offered after an alert; opened automatically when the server cannot be reached | `sms:` link built by `@abonten/core/safety/deviceSms` (iOS `sms:/open?addresses=…&body=…`, Android `sms:a;b?body=…`) |

Every message is written in the **recipient's** language (`safety_contact.locale`, or the linked account's `user_info.locale`), in plain words with the person's name repeated instead of a pronoun (no gender is assumed). Times are shown in the person's time zone (`_user_timezone`).

## 7. Offline and failure behaviour (app)

| Situation | What happens |
|---|---|
| No connection when SOS is held | The pending start is kept in SecureStore; the phone's Messages app opens to the cached contacts with "SOS — I need help. My location: <maps pin>"; the screen shows "No internet: send the text from your phone", Call 112, and retries the server alert on reconnect (same `clientRequestId`, so it is never sent twice by Abonten) |
| Server reached, some texts failed | Per-contact state on screen; "Text them from your phone" pre-filled for those contacts; the dispatcher keeps retrying |
| Location permission off | The alert goes without a position ("location not shared"); the screen offers to turn it on |
| App killed during an alert | The alert stays open until "I'm safe" or `alert_hours`; the contact page shows the last position and its age |

The cached contacts (name and number only) live in SecureStore per account and are deleted on sign-out, so the offline path works without an exception to the React Query persistence allowlist.

## 8. Code map

| Layer | Path |
|---|---|
| Pure rules (timing, visibility, SMS link, context choice, emergency numbers) | `packages/core/src/safety/` |
| Types | `packages/types/src/safetyType.ts` |
| Validation | `packages/validation/src/safetySchemas.ts` |
| Services | `packages/services/src/safety/` (`safetyProgram`, `safetyTokens`, `safetyContactsCore`, `safetyInviteCore`, `safetySessionCore`, `safetyNotifyCore`, `safetyViewCore`, `safetyDispatchCore`), `packages/services/src/sms/hubtelSms.ts`, admin `packages/services/src/admin/safety/safetyAdminCore.ts` |
| Web | pages `apps/web/src/app/[locale]/(pages)/safety`, `sos/[token]`, `trusted/[token]`; actions `apps/web/src/actions/safety/`; components `apps/web/src/safety/`; dispatcher `apps/web/src/app/api/safety/dispatch/route.ts` |
| Mobile API | `apps/web/src/app/api/mobile/safety/**`, client `api.safety.*` in `packages/api-client` |
| App | `apps/mobile/app/(app)/safety/`, `apps/mobile/src/features/safety/` |
| Admin | `apps/admin/src/app/(console)/safety/`, permissions `safety.view`, `safety.configure` (step-up) |

## 9. Abuse limits

| Limit | Default | Where |
|---|---|---|
| Trusted contacts per person | 5 | `max_contacts`, service + trigger |
| Contacts added per day | 10 | rate limit `safety-contact-add:<user>` |
| Invite texts | one per contact, re-send after 24 hours, at most 3 | `invite_count`, `invited_at` |
| Alerts that send texts | 6 per 24 hours | `alerts_with_sms_per_day`; beyond it push/email/own-phone still work |
| Position points | 20 per request, one per 5 seconds, 5,000 per session | service |
| Contact page | 120 reads a minute per address | rate limit `safety-view:<ip>` |
| Restricted accounts | cannot add contacts or start sessions | `isAccountRestricted` |

## 10. Privacy

- Data: the person's contacts (third-party personal data: name, phone, optional email), positions during sessions, session timing and notes. Lawful basis, notices and the privacy policy wording are legal items I2 and I3; the store privacy answers ("Contacts" collected; precise location already declared) change with the policy before the audience is Everyone (I3).
- Retention: points and last-position columns 7 days after the session closes; sessions, recipients, outbox and timeline 180 days; contacts until the person removes them or deletes the account (cascade). Operational decision J2.
- Deleting the account deletes everything (foreign keys cascade from `user_info`).

## 11. Rollout

1. Staff only (now): the founder adds a contact, sends SOS, a check-in that lapses and a share; checks the texts arrive and the page works on a contact's phone.
2. Beta: the pilot testers (`beta_user_ids`), with event-team alerts still off.
3. Everyone: after legal I1–I3 are Decided, the privacy policy and the store answers are updated, and a help page "Safety: trusted contacts and SOS" is published in all five help languages.
4. Event-team alerts: after I4, with organizers told what they may receive.

## 12. Later (needs a native build)

- **Background location** during an open session (expo-task-manager + "Always" permission + `UIBackgroundModes: location` on iOS and a foreground service on Android). App Store guideline 2.5.4 allows it for a feature that visibly needs it; the review notes must show it.
- An updated location permission sentence that names Safety (today's says events, venue picking and check-ins).
- Pick a contact from the phone's address book (expo-contacts).
- Long-press the app icon → SOS (home-screen quick action), and a lock-screen widget.
- Battery level on the contact page (expo-battery).
- An Android notification channel with high importance for incoming alerts (the server cannot target a channel an older app never created), and iOS Time Sensitive notifications (entitlement).
- A duress code ("I'm safe" that secretly keeps the alert open).
