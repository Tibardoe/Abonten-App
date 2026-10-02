// Notices the DATABASE writes (the reward engine, Field Ops sweeps, review
// and cancellation triggers, reminders, area launches, digests) arrive as
// finished English sentences: a SQL function cannot read the catalogs, and
// the money functions that compose them are not rewritten for wording.
// Each one comes from a fixed template, so the sentence itself says which
// notice it is and what its values are. This module reads a stored row back
// into a Notice (`{ id, params }`), which renderNotice() then words in the
// reader's language.
//
// It also covers every row written before notices carried `data.notice`,
// so an inbox that already holds English notices reads in French too.
//
// A row that matches nothing is left exactly as stored.

import type { Notice } from "./notices";

type Row = { type: string; title: string; body: string | null };
type Reader = (row: Row) => Notice | null;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "September" / "September 2026" → "2026-09-01" (year defaults to now). */
function periodOf(monthText: string): string | null {
  const [name, year] = monthText.trim().split(/\s+/);
  const index = MONTHS.indexOf((name ?? "").toLowerCase());
  if (index === -1) return null;
  const y =
    year && /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear();
  return `${y}-${String(index + 1).padStart(2, "0")}-01`;
}

const body = (row: Row) => row.body ?? "";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));

// The database words a start time on the event's (or the reader's) own
// clock and stores no instant beside it. The clock reading is kept exactly
// as written by treating it as a UTC time — `{ startsAt, timezone: "UTC" }`
// — so renderNotice() can say the same day and hour in another language.

/** "Sat 20 Sep, 7:30pm" (to_char 'Dy DD Mon, FMHH12:MIam'). */
function startFromWhen(text: string): string | null {
  const m = text.match(
    /^([A-Za-z]{3}) (\d{1,2}) ([A-Za-z]{3}), (\d{1,2}):(\d{2})(am|pm)$/,
  );
  if (!m) return null;
  const day = DAYS.indexOf(m[1].toLowerCase());
  const month = MONTHS_SHORT.indexOf(m[3].toLowerCase());
  if (day === -1 || month === -1) return null;
  const hour = (Number(m[4]) % 12) + (m[6] === "pm" ? 12 : 0);
  // No year is stored: the one on which that date falls on that weekday.
  const thisYear = new Date().getUTCFullYear();
  for (const year of [thisYear, thisYear + 1, thisYear - 1]) {
    const at = new Date(
      Date.UTC(year, month, Number(m[2]), hour, Number(m[5])),
    );
    if (at.getUTCDay() === day) return at.toISOString();
  }
  return null;
}

/** "Friday 14:30" (to_char 'FMDay HH24:MI'). */
function startFromDayTime(text: string): string | null {
  const m = text.match(/^([A-Za-z]+) (\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const day = DAYS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (day === -1) return null;
  // 2024-01-07 was a Sunday; only the weekday and the hour are shown.
  return new Date(
    Date.UTC(2024, 0, 7 + day, Number(m[2]), Number(m[3])),
  ).toISOString();
}

/** A clock reading as notice params: re-worded when read, else as stored. */
function clock(key: "when" | "dayTime", text: string): Record<string, string> {
  const startsAt =
    key === "when" ? startFromWhen(text) : startFromDayTime(text);
  return startsAt ? { startsAt, timezone: "UTC" } : { [key]: text };
}

/** "Afro Night · Sat 20 Sep, 7:30pm" → the title and its clock reading. */
function titleAndWhen(text: string): Record<string, string> {
  const at = text.lastIndexOf(" · ");
  if (at === -1) return { title: text, when: "" };
  return { title: text.slice(0, at), ...clock("when", text.slice(at + 3)) };
}

/** A stand-in the English writers stored where a name was missing. */
const named = (text: string, ...standIns: string[]) =>
  standIns.includes(text) ? "" : text;

/** "this place" / "your organizer profile" were stand-ins for a subject. */
function subjectOf(text: string): { subject: string; subjectKind: string } {
  const lower = text.toLowerCase();
  if (lower === "this place") return { subject: "", subjectKind: "place" };
  if (lower === "your organizer profile") {
    return { subject: "", subjectKind: "organizer" };
  }
  return { subject: text, subjectKind: "place" };
}

const postKind = (word: string) => (word === "Story" ? "story" : "spotlight");

const CAMPAIGN_TITLES: Record<string, string> = {
  "Your Spotlight promotion is in review": "pending_review",
  "Your Spotlight promotion is approved and scheduled": "scheduled",
  "Your Spotlight promotion is live": "active",
  "Your Spotlight promotion was not approved": "rejected",
  "Your Spotlight promotion is paused": "paused",
  "Your Spotlight promotion has finished": "completed",
  "Your Spotlight promotion refund is on its way": "refunded",
};

// Each reader answers for the notification types it is listed under.
const READERS: Record<string, Reader[]> = {
  // ── Abonten Rewards ────────────────────────────────────────────────
  welcome_credit: [
    (row) => {
      const m = body(row).match(
        /^(.+?) off your first ticket order of (.+?) or more\. Use it within (\d+) days\.$/,
      );
      return m
        ? {
            id: "welcome_credit",
            params: { amount: m[1], min: m[2], days: Number(m[3]) },
          }
        : null;
    },
  ],
  referral_qualified: [
    (row) => {
      const m = body(row).match(
        /^(.+?) qualified\. (.+?) is pending for you and unlocks (in about two weeks|after the event)\.$/,
      );
      if (!m) return null;
      const path =
        row.title === "Your friend bought a ticket"
          ? "first_order"
          : row.title === "Your friend's event is selling"
            ? "organizer_sales"
            : "place_claim";
      return {
        id: "referral_qualified",
        params: {
          path,
          name: m[1],
          amount: m[2],
          unlocks: m[3] === "after the event" ? "event" : "weeks",
        },
      };
    },
  ],
  loyalty_reward: [
    (row) => {
      const m = body(row).match(
        /^You've bought tickets to (\d+) different events\. The (.+?) service fee on this order comes back as credit after (.+)\.$/,
      );
      return m
        ? {
            id: "loyalty_reward",
            params: {
              required: Number(m[1]),
              amount: m[2],
              event: m[3] === "the event" ? "" : m[3],
              hasEvent: m[3] === "the event" ? "no" : "yes",
            },
          }
        : null;
    },
  ],
  referral_joined: [
    (row) => {
      const m = body(row).match(
        /^(.+?) joined Abonten with your invite\. You'll get (.+?) once they buy a ticket of (.+?) or more\.$/,
      );
      return m
        ? {
            id: "referral_joined",
            params: { name: m[1], amount: m[2], min: m[3] },
          }
        : null;
    },
  ],
  commission_pending: [
    (row) => {
      const m = body(row).match(
        /^(.+?) in commission is pending from (\d+) ticket orders? sold through your link\./,
      );
      return m
        ? {
            id: "commission_pending",
            params: { amount: m[1], orders: Number(m[2]) },
          }
        : null;
    },
  ],
  reward_pending: [
    (row) => {
      const m = body(row).match(
        /^(.+?) is pending from (\d+) referred tickets?\. It unlocks after the events?\.$/,
      );
      return m
        ? {
            id: "reward_pending",
            params: { amount: m[1], tickets: Number(m[2]) },
          }
        : null;
    },
  ],
  reward_available: [
    (row) => {
      const m = body(row).match(/^(.+?) in Abonten Credit is ready to use\.$/);
      return m ? { id: "reward_available", params: { amount: m[1] } } : null;
    },
  ],
  promotion_credit_earned: [
    (row) => {
      const m = body(row).match(
        /^(.+?) of promotion credit from events that ended in (\w+)\. Use it to feature an event or place\.$/,
      );
      return m
        ? {
            id: "promotion_credit_earned",
            params: { amount: m[1], period: periodOf(m[2]), month: m[2] },
          }
        : null;
    },
    (row) => {
      const m = body(row).match(
        /^(\d+) verified visitors? checked in at your place in (\w+)\. Here's (.+?) of promotion credit to feature it\.$/,
      );
      return m
        ? {
            id: "promotion_credit_visits",
            params: {
              visitors: Number(m[1]),
              period: periodOf(m[2]),
              month: m[2],
              amount: m[3],
            },
          }
        : null;
    },
  ],
  milestone_reached: [
    (row) => {
      const title = row.title.match(
        /^(\d+) people bought tickets to your event$/,
      );
      const m = body(row).match(
        /^Here's (.+?) of promotion credit to feature your next event\.$/,
      );
      return title && m
        ? {
            id: "milestone_reached",
            params: { buyers: Number(title[1]), amount: m[1] },
          }
        : null;
    },
  ],

  // ── Field Ops ──────────────────────────────────────────────────────
  fieldops_submission_reviewed: [
    (row) => {
      const m = row.title.match(/^Not eligible: (.+)$/);
      return m && body(row).startsWith("An automatic check after the holding")
        ? {
            id: "fieldops_not_eligible",
            params: { name: named(m[1], "your onboarding") },
          }
        : null;
    },
  ],
  fieldops_flag_raised: [
    (row) => {
      const m = row.title.match(/^Needs a look: (.+)$/);
      return m
        ? {
            id: "fieldops_flag_raised",
            params: { name: named(m[1], "an onboarding") },
          }
        : null;
    },
  ],
  fieldops_commission_approved: [
    (row) => {
      const m = row.title.match(/^Confirmed: (.+)$/);
      return m
        ? {
            id: "fieldops_confirmed",
            params: { name: named(m[1], "your onboarding") },
          }
        : null;
    },
    (row) =>
      row.title === "Content commission confirmed"
        ? { id: "fieldops_content_commission_confirmed" }
        : null,
    (row) => {
      if (row.title !== "Monthly stipend added") return null;
      const m = body(row).match(
        /^Your stipend for (\w+ \d{4}) is ready for the next payout\.$/,
      );
      return m
        ? {
            id: "fieldops_stipend",
            params: { period: periodOf(m[1]), monthYear: m[1] },
          }
        : null;
    },
  ],
  fieldops_commission_paid: [
    (row) =>
      row.title === "You have been paid" ? { id: "fieldops_paid" } : null,
  ],
  fieldops_content_reviewed: [
    (row) =>
      row.title === "Content approved"
        ? { id: "fieldops_content_approved" }
        : null,
    (row) =>
      row.title === "Content not accepted"
        ? { id: "fieldops_content_rejected", params: { note: row.body } }
        : null,
  ],

  // ── Reviews, cancellations, reminders, launches ────────────────────
  review_received: [
    (row) => {
      if (row.title !== "New review") return null;
      const unnamed = body(row).match(
        /^Someone left a new review on your (event|place)\.$/,
      );
      if (unnamed) {
        return unnamed[1] === "place"
          ? { id: "review_received_place", params: { rating: 0, name: "" } }
          : { id: "review_received_event", params: { rating: 0, title: "" } };
      }
      const m = body(row).match(/^Someone left a (\d)-star review on (.+)\.$/);
      return m
        ? {
            id: "review_received_event",
            params: { rating: Number(m[1]), title: m[2], name: m[2] },
          }
        : null;
    },
  ],
  event_cancelled: [
    (row) => {
      const paid = body(row).match(
        /^The organizer has cancelled (.+)\. Your ticket is no longer valid\. A refund will be issued to the payment method used for your ticket\.$/,
      );
      if (paid)
        return { id: "event_cancelled_paid", params: { title: paid[1] } };
      const free = body(row).match(
        /^The organizer has cancelled (.+)\. Your registration has been cancelled\.$/,
      );
      return free
        ? { id: "event_cancelled_free", params: { title: free[1] } }
        : null;
    },
  ],
  event_reminder: [
    (row) => {
      const title = row.title.match(/^Tomorrow: (.+)$/);
      if (!title) return null;
      const withAddress = body(row).match(
        /^Starts (\w+ \d{1,2}:\d{2}) at (.+)\. Your ticket is in My Events\.$/,
      );
      if (withAddress) {
        return {
          id: "event_reminder",
          params: {
            title: title[1],
            ...clock("dayTime", withAddress[1]),
            address: withAddress[2],
          },
        };
      }
      const plain = body(row).match(
        /^Starts (\w+ \d{1,2}:\d{2})\. Your ticket is in My Events\.$/,
      );
      return plain
        ? {
            id: "event_reminder",
            params: {
              title: title[1],
              ...clock("dayTime", plain[1]),
              address: "",
            },
          }
        : null;
    },
  ],
  area_launched: [
    (row) => {
      const m = row.title.match(/^Abonten is now in (.+)$/);
      return m ? { id: "area_launched", params: { area: m[1] } } : null;
    },
  ],

  // ── Recommendation digests ─────────────────────────────────────────
  recommendation_digest: [
    (row) => {
      const many = row.title.match(/^(\d+) picks for you$/);
      if (!many) return null;
      const m = body(row).match(/^(.+) and (\d+) more$/);
      return m
        ? {
            id: "digest_many",
            params: {
              count: Number(many[1]),
              ...titleAndWhen(m[1]),
              more: Number(m[2]),
            },
          }
        : null;
    },
    (row) => {
      const event = titleAndWhen(body(row));
      const organizer = row.title.match(/^New event from @(.+)$/);
      if (organizer) {
        return {
          id: "digest_organizer",
          params: { ...event, username: organizer[1] },
        };
      }
      if (row.title === "New event from an organizer you follow") {
        return { id: "digest_organizer_unknown", params: event };
      }
      if (row.title === "New event at a place you follow") {
        return { id: "digest_place_unknown", params: event };
      }
      const place = row.title.match(/^New event at (.+)$/);
      if (place) {
        return { id: "digest_place", params: { ...event, place: place[1] } };
      }
      if (row.title === "An event you might like") {
        return { id: "digest_event", params: event };
      }
      if (row.title === "A place you might like") {
        const parts = body(row).split(" · ");
        return {
          id: "digest_place_pick",
          params: {
            name: parts[0] ?? "",
            category: parts.slice(1).join(" · "),
            hasCategory: parts.length > 1 ? "yes" : "no",
          },
        };
      }
      return null;
    },
  ],
};

// ── Written by the services before notices carried their template ──
const exact =
  (
    title: string,
    id: string,
    params?: (m: RegExpMatchArray) => Notice["params"],
    pattern?: RegExp,
  ): Reader =>
  (row) => {
    if (row.title !== title) return null;
    if (!pattern) return { id };
    const m = body(row).match(pattern);
    return m ? { id, params: params ? params(m) : undefined } : null;
  };

const LEGACY: Record<string, Reader[]> = {
  ticket_confirmed: [
    exact(
      "Ticket confirmed",
      "ticket_confirmed",
      (m) => ({ title: m[1] }),
      /^Your ticket for (.+) is confirmed\.$/,
    ),
    exact(
      "Ticket confirmed",
      "ticket_confirmed",
      () => ({ title: "" }),
      /^Your ticket is confirmed\.$/,
    ),
  ],
  refund_requested: [
    exact(
      "Refund requested",
      "refund_requested",
      undefined,
      /^We've requested a refund for your cancelled ticket\./,
    ),
    exact(
      "Refund requested",
      "refund_requested_credit",
      (m) => ({ credit: m[1] }),
      /^(.+?) is back in your Abonten Credit\. We've requested the rest/,
    ),
    exact(
      "We're refunding a payment",
      "orphan_refund",
      (m) => ({ amount: m[1] }),
      /^Your payment of (.+?) arrived after the order had closed/,
    ),
  ],
  refund_completed: [
    exact(
      "Refund completed",
      "refund_completed",
      undefined,
      /^Your refund has been sent back to your payment method\.$/,
    ),
    exact(
      "Refund completed",
      "refund_completed_credit",
      (m) => ({ credit: m[1] }),
      /^(.+?) is back in your Abonten Credit\.$/,
    ),
    exact(
      "Refund completed",
      "refund_completed_plain",
      undefined,
      /^Your refund is complete\.$/,
    ),
  ],
  refund_failed: [
    exact(
      "Refund couldn't be completed",
      "refund_failed_credit",
      (m) => ({ credit: m[1] }),
      /^Your (.+?) of Abonten Credit is back, but/,
    ),
    exact(
      "Refund couldn't be completed",
      "refund_failed",
      undefined,
      /^We couldn't process your refund automatically\./,
    ),
  ],
  place_booking_requested: [
    exact(
      "New booking request",
      "place_booking_requested",
      (m) => ({ place: m[1] }),
      /^You have a new booking request for (.+)\.$/,
    ),
  ],
  place_booking_cancelled: [
    exact(
      "A booking was cancelled",
      "place_booking_cancelled",
      (m) => ({ place: named(m[1], "your place") }),
      /^A customer cancelled their booking for (.+)\.$/,
    ),
  ],
  place_booking_accepted: [
    exact(
      "Your booking was accepted",
      "place_booking_accepted",
      (m) => ({ place: named(m[1], "the place") }),
      /^Your booking request for (.+) was accepted\.$/,
    ),
  ],
  place_booking_declined: [
    exact(
      "Your booking was declined",
      "place_booking_declined",
      (m) => ({ place: named(m[1], "the place") }),
      /^Your booking request for (.+) was declined\.$/,
    ),
  ],
  place_claim_approved: [
    exact(
      "Your claim was approved",
      "place_claim_approved",
      (m) => ({ place: named(m[1], "the place") }),
      /^You now manage (.+)\.$/,
    ),
  ],
  place_claim_rejected: [
    exact(
      "Your claim request was not approved",
      "place_claim_rejected",
      (m) => ({ place: named(m[1], "the place") }),
      /^Your request to claim (.+) was rejected\.$/,
    ),
  ],
  review_reply: [
    exact(
      "The owner replied to your review",
      "review_reply_place",
      (m) => ({ name: m[1] }),
      /^See the reply on your review of (.+)\.$/,
    ),
    exact(
      "The owner replied to your review",
      "review_reply_place",
      () => ({ name: "" }),
      /^See the reply on your place review\.$/,
    ),
    exact(
      "The organizer replied to your review",
      "review_reply_event",
      () => ({ name: "" }),
      /^See the reply on your event review\.$/,
    ),
    exact(
      "The organizer replied to your review",
      "review_reply_event",
      (m) => ({ name: m[1] }),
      /^See the reply on your review of (.+)\.$/,
    ),
  ],
  verification_submitted: [
    exact(
      "Verification request received",
      "verification_submitted",
      (m) => subjectOf(m[1]),
      /^We have your verification request for (.+)\. We will notify you/,
    ),
  ],
  verification_approved: [
    exact(
      "Verified",
      "verification_approved",
      (m) => subjectOf(m[1]),
      /^(.+) is now verified on Abonten\.$/,
    ),
  ],
  verification_info_requested: [
    exact(
      "More information needed",
      "verification_info_requested",
      (m) => ({ ...subjectOf(m[1]), reason: m[2] }),
      /^To verify (.+?), we need: ([\s\S]*)$/,
    ),
  ],
  verification_rejected: [
    exact(
      "Verification not approved",
      "verification_rejected",
      (m) => ({ ...subjectOf(m[1]), reason: m[2] }),
      /^Your verification request for (.+?) was not approved\. ?([\s\S]*)$/,
    ),
  ],
  verification_revoked: [
    exact(
      "Verification removed",
      "verification_revoked",
      (m) => ({ ...subjectOf(m[1]), reason: m[2] }),
      /^The verified badge for (.+?) was removed\. ?([\s\S]*)$/,
    ),
  ],
  promotion_started: [
    exact(
      "Your event is now featured",
      "promotion_started_event",
      (m) => ({ title: m[1], durationLabel: m[2] }),
      /^(.+) is now featured \((.+)\)\.$/,
    ),
    exact(
      "Your place is now featured",
      "promotion_started_place",
      (m) => ({ title: m[1], durationLabel: m[2] }),
      /^(.+) is now featured \((.+)\)\.$/,
    ),
    (row) => {
      const m = body(row).match(/^Your promotion is now active \((.+)\)\.$/);
      return m
        ? { id: "promotion_started_generic", params: { durationLabel: m[1] } }
        : null;
    },
  ],
};

// ── Spotlight, Stories and Field Ops, as the services used to word them ──
const crowd = (m: RegExpMatchArray, at: number) => (m[at] ? Number(m[at]) : 0);

const LEGACY_SOCIAL: Record<string, Reader[]> = {
  content_like: [
    (row) => {
      const m = row.title.match(
        /^(.+?)(?: and (\d+) others?)? liked your (Story|Spotlight)$/,
      );
      return m
        ? {
            id: "content_like",
            params: {
              actor: named(m[1], "Someone"),
              others: crowd(m, 2),
              kind: postKind(m[3]),
            },
          }
        : null;
    },
  ],
  content_reaction: [
    (row) => {
      const m = row.title.match(
        /^(.+?)(?: and (\d+) others?)? reacted (\S+) to your (Story|Spotlight)$/,
      );
      return m
        ? {
            id: "content_reaction",
            params: {
              actor: named(m[1], "Someone"),
              others: crowd(m, 2),
              emoji: m[3],
              kind: postKind(m[4]),
            },
          }
        : null;
    },
  ],
  content_comment: [
    (row) => {
      const m = row.title.match(/^(.+?) commented on your (Story|Spotlight)$/);
      return m
        ? {
            id: "content_comment",
            params: {
              actor: named(m[1], "Someone"),
              kind: postKind(m[2]),
              snippet: row.body,
            },
          }
        : null;
    },
  ],
  content_reply: [
    (row) => {
      const m = row.title.match(/^(.+?) replied to your comment$/);
      return m
        ? {
            id: "content_reply",
            params: { actor: named(m[1], "Someone"), snippet: row.body },
          }
        : null;
    },
  ],
  content_follow: [
    (row) => {
      const m = row.title.match(
        /^(.+?)(?: and (\d+) others?)? started following (.+)$/,
      );
      return m
        ? {
            id: "content_follow",
            params: {
              actor: named(m[1], "Someone"),
              others: crowd(m, 2),
              target: m[3],
            },
          }
        : null;
    },
  ],
  content_moderation: [
    (row) => {
      const m = row.title.match(
        /^Your (Story|Spotlight) (?:is (visible) again|has been (restricted|hidden|removed))$/,
      );
      if (!m) return null;
      return m[2]
        ? { id: "content_moderation_visible", params: { kind: postKind(m[1]) } }
        : {
            id: "content_moderation",
            params: { kind: postKind(m[1]), state: m[3] },
          };
    },
  ],
  content_campaign: [
    (row) => {
      const status = CAMPAIGN_TITLES[row.title];
      return status
        ? { id: "content_campaign", params: { status, reason: row.body } }
        : null;
    },
  ],
  fieldops_content_brief: [
    (row) => {
      const m = row.title.match(/^New brief: (.+)$/);
      return m
        ? {
            id: "fieldops_content_brief",
            params: { title: m[1], description: row.body },
          }
        : null;
    },
  ],
  fieldops_assignment_created: [
    (row) => {
      const t = row.title.match(/^New assignment: (.+)$/);
      if (!t) return null;
      const one = body(row).match(/ on (\d{4}-\d{2}-\d{2})\.$/);
      const range = body(row).match(
        / from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\.$/,
      );
      if (!one && !range) return null;
      return {
        id: "fieldops_assignment_created",
        params: {
          territory: t[1],
          sameDay: range ? "no" : "yes",
          fromDate: range ? range[1] : (one?.[1] ?? ""),
          toDate: range ? range[2] : (one?.[1] ?? ""),
        },
      };
    },
  ],
  fieldops_assignment_changed: [
    (row) => {
      const m = row.title.match(/^Assignment cancelled: (.+)$/);
      return m
        ? {
            id: "fieldops_assignment_changed",
            params: { territory: named(m[1], "a territory"), reason: row.body },
          }
        : null;
    },
  ],
  fieldops_membership_added: [
    (row) => {
      const m = row.title.match(/^You've joined (.+)$/);
      return m
        ? { id: "fieldops_membership_added", params: { campaign: m[1] } }
        : null;
    },
  ],
  fieldops_submission_received: [
    (row) => {
      const m = row.title.match(/^Claim help: (.+)$/);
      return m
        ? { id: "fieldops_claim_received", params: { place: m[1] } }
        : null;
    },
    (row) => {
      const m = row.title.match(/^Event: (.+)$/);
      return m && body(row).startsWith("A member onboarded an event")
        ? { id: "fieldops_event_received", params: { title: m[1] } }
        : null;
    },
    (row) => {
      const m = row.title.match(/^Review: (.+)$/);
      const who = body(row).match(/^(.+) submitted a new business\.$/);
      return m && who
        ? {
            id: "fieldops_onboarding_received",
            params: { place: m[1], member: named(who[1], "A member") },
          }
        : null;
    },
  ],
  fieldops_content_received: [
    (row) =>
      row.title === "New content to review"
        ? { id: "fieldops_content_received" }
        : null,
  ],
  fieldops_submission_reviewed: [
    (row) => {
      const m = row.title.match(
        /^(Verified|Changes needed|Not accepted): (.+)$/,
      );
      if (!m) return null;
      const name = named(m[2], "your onboarding");
      if (m[1] === "Verified") {
        return body(row).startsWith("Your team lead verified it")
          ? { id: "fieldops_review_verified", params: { name } }
          : {
              id: "fieldops_review_verified_noted",
              params: { name, note: row.body },
            };
      }
      return {
        id:
          m[1] === "Changes needed"
            ? "fieldops_review_needs_changes"
            : "fieldops_review_rejected",
        params: { name, note: row.body },
      };
    },
  ],
  fieldops_commission_reversed: [
    (row) =>
      row.title === "A commission was taken back"
        ? { id: "fieldops_commission_reversed", params: { reason: row.body } }
        : null,
  ],
};

/**
 * The notice a database-written row is, read back from its English text;
 * null when the row is not one of the templates above (its stored text is
 * then shown as it is).
 */
export function noticeFromStoredText(row: Row): Notice | null {
  const readers = [
    ...(READERS[row.type] ?? []),
    ...(LEGACY[row.type] ?? []),
    ...(LEGACY_SOCIAL[row.type] ?? []),
  ];
  for (const read of readers) {
    const notice = read(row);
    if (notice) return notice;
  }
  return null;
}
