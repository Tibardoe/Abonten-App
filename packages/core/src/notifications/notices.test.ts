import coreMessages from "@abonten/i18n/messages/en/core.json";
import { describe, expect, it } from "vitest";
import { i18nEn } from "../i18n/testTranslator";
import {
  NOTICES,
  type Notice,
  isNotice,
  localizeNotificationRow,
  renderNotice,
} from "./notices";
import { noticeFromStoredText } from "./storedNotices";

const catalog = coreMessages.notices as Record<
  string,
  { title?: string; body?: string }
>;

const row = (type: string, title: string, body: string | null = null) => ({
  type,
  title,
  body,
  data: {} as unknown,
});

describe("the notice registry", () => {
  it("every template names words that exist", () => {
    for (const [id, template] of Object.entries(NOTICES)) {
      const [, titleId, titleField] = template.title.split(".");
      expect(catalog[titleId]?.[titleField as "title"], id).toBeTruthy();
      if (template.body) {
        const [, bodyId, bodyField] = template.body.split(".");
        expect(catalog[bodyId]?.[bodyField as "body"], id).toBeTruthy();
      }
    }
  });

  it("every catalog notice is in the registry", () => {
    for (const id of Object.keys(catalog)) {
      expect(NOTICES[id], id).toBeTruthy();
    }
  });

  it("an unknown notice is not a notice", () => {
    expect(isNotice({ id: "nope" })).toBe(false);
    expect(renderNotice(i18nEn, { id: "nope" })).toBeNull();
    expect(isNotice({ id: "ticket_confirmed" })).toBe(true);
  });
});

describe("renderNotice", () => {
  it("words a missing name itself", () => {
    expect(
      renderNotice(i18nEn, {
        id: "ticket_confirmed",
        params: { title: "Afro Night" },
      }),
    ).toEqual({
      title: "Ticket confirmed",
      body: "Your ticket for Afro Night is confirmed.",
    });
    expect(
      renderNotice(i18nEn, { id: "ticket_confirmed", params: { title: null } }),
    ).toEqual({ title: "Ticket confirmed", body: "Your ticket is confirmed." });
  });

  it("counts the crowd on a like", () => {
    const like = (others: number, actor = "Ama") =>
      renderNotice(i18nEn, {
        id: "content_like",
        params: { actor, others, kind: "spotlight", emoji: null },
      })?.title;
    expect(like(0)).toBe("Ama liked your Spotlight");
    expect(like(1)).toBe("Ama and 1 other liked your Spotlight");
    expect(like(4)).toBe("Ama and 4 others liked your Spotlight");
    expect(like(0, "")).toBe("Someone liked your Spotlight");
  });

  it("keeps the emoji of a reaction", () => {
    expect(
      renderNotice(i18nEn, {
        id: "content_reaction",
        params: { actor: "Kofi", others: 0, kind: "story", emoji: "🔥" },
      })?.title,
    ).toBe("Kofi reacted 🔥 to your Story");
  });

  it("shows what a person wrote as the body", () => {
    expect(
      renderNotice(i18nEn, {
        id: "content_comment",
        params: { actor: "Ama", kind: "spotlight", snippet: "Love this" },
      }),
    ).toEqual({ title: "Ama commented on your Spotlight", body: "Love this" });
    expect(
      renderNotice(i18nEn, {
        id: "content_campaign",
        params: { status: "active", reason: null },
      }),
    ).toEqual({ title: "Your Spotlight promotion is live", body: null });
  });

  it("names a verification subject, or says which kind it is", () => {
    expect(
      renderNotice(i18nEn, {
        id: "verification_approved",
        params: { subject: "Buka", subjectKind: "place" },
      })?.body,
    ).toBe("Buka is now verified on Abonten.");
    expect(
      renderNotice(i18nEn, {
        id: "verification_approved",
        params: { subject: null, subjectKind: "organizer" },
      })?.body,
    ).toBe("Your organizer profile is now verified on Abonten.");
    expect(
      renderNotice(i18nEn, {
        id: "verification_info_requested",
        params: { subject: null, subjectKind: "place", reason: "a permit" },
      })?.body,
    ).toBe("To verify this place, we need: a permit");
  });

  it("re-words a tier length and formats dates", () => {
    expect(
      renderNotice(i18nEn, {
        id: "promotion_started_event",
        params: { title: "Afro Night", durationLabel: "3 days" },
      })?.body,
    ).toBe("Afro Night is now featured (3 days).");
    expect(
      renderNotice(i18nEn, {
        id: "fieldops_assignment_created",
        params: {
          territory: "Osu",
          sameDay: "no",
          fromDate: "2026-10-03",
          toDate: "2026-10-05",
        },
      }),
    ).toEqual({
      title: "New assignment: Osu",
      body: "You're on Osu from 3 Oct 2026 to 5 Oct 2026.",
    });
  });
});

// Rows written before notices carried their template (and every row the
// database writes) are read back from their English text. Each sample is
// the exact text an old writer produced; reading it and rendering it in
// English must give the same words back.
const STORED: [type: string, title: string, body: string | null][] = [
  [
    "ticket_confirmed",
    "Ticket confirmed",
    "Your ticket for Afro Night is confirmed.",
  ],
  ["ticket_confirmed", "Ticket confirmed", "Your ticket is confirmed."],
  [
    "refund_requested",
    "Refund requested",
    "We've requested a refund for your cancelled ticket. You'll be notified once it's completed.",
  ],
  [
    "refund_requested",
    "Refund requested",
    "GH₵20.00 is back in your Abonten Credit. We've requested the rest back to your payment method — you'll be notified once it's completed.",
  ],
  [
    "refund_completed",
    "Refund completed",
    "Your refund has been sent back to your payment method.",
  ],
  [
    "refund_completed",
    "Refund completed",
    "GH₵20.00 is back in your Abonten Credit.",
  ],
  ["refund_completed", "Refund completed", "Your refund is complete."],
  [
    "refund_failed",
    "Refund couldn't be completed",
    "We couldn't process your refund automatically. Our team will follow up.",
  ],
  [
    "refund_failed",
    "Refund couldn't be completed",
    "Your GH₵20.00 of Abonten Credit is back, but we couldn't return the rest to your payment method automatically. Our team will follow up.",
  ],
  [
    "place_booking_requested",
    "New booking request",
    "You have a new booking request for Buka.",
  ],
  [
    "place_booking_cancelled",
    "A booking was cancelled",
    "A customer cancelled their booking for Buka.",
  ],
  [
    "place_booking_cancelled",
    "A booking was cancelled",
    "A customer cancelled their booking for your place.",
  ],
  [
    "place_booking_accepted",
    "Your booking was accepted",
    "Your booking request for Buka was accepted.",
  ],
  [
    "place_booking_declined",
    "Your booking was declined",
    "Your booking request for Buka was declined.",
  ],
  ["place_claim_approved", "Your claim was approved", "You now manage Buka."],
  [
    "place_claim_approved",
    "Your claim was approved",
    "You now manage the place.",
  ],
  [
    "place_claim_rejected",
    "Your claim request was not approved",
    "Your request to claim Buka was rejected.",
  ],
  [
    "review_reply",
    "The owner replied to your review",
    "See the reply on your review of Buka.",
  ],
  [
    "review_reply",
    "The owner replied to your review",
    "See the reply on your place review.",
  ],
  [
    "review_reply",
    "The organizer replied to your review",
    "See the reply on your review of Afro Night.",
  ],
  [
    "review_reply",
    "The organizer replied to your review",
    "See the reply on your event review.",
  ],
  [
    "verification_submitted",
    "Verification request received",
    "We have your verification request for Buka. We will notify you when it has been reviewed.",
  ],
  [
    "verification_submitted",
    "Verification request received",
    "We have your verification request for your organizer profile. We will notify you when it has been reviewed.",
  ],
  ["verification_approved", "Verified", "Buka is now verified on Abonten."],
  [
    "verification_info_requested",
    "More information needed",
    "To verify Buka, we need: a permit",
  ],
  [
    "verification_rejected",
    "Verification not approved",
    "Your verification request for Buka was not approved. The document is unreadable.",
  ],
  [
    "verification_revoked",
    "Verification removed",
    "The verified badge for Buka was removed. Ownership changed.",
  ],
  [
    "promotion_started",
    "Your event is now featured",
    "Afro Night is now featured (3 days).",
  ],
  [
    "promotion_started",
    "Your place is now featured",
    "Buka is now featured (1 month).",
  ],
  ["content_like", "Ama liked your Spotlight", null],
  ["content_like", "Ama and 1 other liked your Story", null],
  ["content_like", "Ama and 12 others liked your Spotlight", null],
  ["content_reaction", "Kofi reacted 🔥 to your Story", null],
  ["content_reaction", "Kofi and 2 others reacted 🔥 to your Spotlight", null],
  ["content_comment", "Ama commented on your Spotlight", "Love this"],
  ["content_reply", "Ama replied to your comment", "Thanks!"],
  ["content_follow", "Ama started following Buka", null],
  ["content_follow", "Ama and 3 others started following Buka", null],
  ["content_moderation", "Your Story is visible again", null],
  [
    "content_moderation",
    "Your Spotlight has been hidden",
    "It no longer appears in feeds. Contact support if you think this is a mistake.",
  ],
  ["content_campaign", "Your Spotlight promotion is live", null],
  [
    "content_campaign",
    "Your Spotlight promotion was not approved",
    "The video shows a price that is not on the listing.",
  ],
  [
    "fieldops_content_brief",
    "New brief: Osu night market",
    "Three clips, vertical.",
  ],
  ["fieldops_assignment_changed", "Assignment cancelled: Osu", "Rain"],
  [
    "fieldops_membership_added",
    "You've joined Accra launch",
    "Open Field work to see your assignments.",
  ],
  [
    "fieldops_submission_received",
    "Claim help: Buka",
    "A member helped an owner claim a listing that was already on Abonten.",
  ],
  [
    "fieldops_submission_received",
    "Event: Afro Night",
    "A member onboarded an event. It pays once the event has run.",
  ],
  [
    "fieldops_submission_received",
    "Review: Buka",
    "Esi Mensah submitted a new business.",
  ],
  [
    "fieldops_submission_received",
    "Review: Buka",
    "A member submitted a new business.",
  ],
  [
    "fieldops_content_received",
    "New content to review",
    "The content creator sent in a deliverable.",
  ],
  [
    "fieldops_submission_reviewed",
    "Verified: Buka",
    "Your team lead verified it. The commission is confirmed after the holding period.",
  ],
  [
    "fieldops_submission_reviewed",
    "Changes needed: Buka",
    "Add a photo of the front.",
  ],
  [
    "fieldops_submission_reviewed",
    "Not accepted: your onboarding",
    "Duplicate.",
  ],
  [
    "fieldops_commission_reversed",
    "A commission was taken back",
    "The claim was withdrawn.",
  ],
  // Written by the database (the exact format() strings of the SQL).
  [
    "welcome_credit",
    "You have welcome credit",
    "GH₵10.00 off your first ticket order of GH₵50.00 or more. Use it within 30 days.",
  ],
  [
    "referral_qualified",
    "Your friend bought a ticket",
    "Ama qualified. GH₵5.00 is pending for you and unlocks after the event.",
  ],
  [
    "referral_qualified",
    "Your friend's event is selling",
    "Ama qualified. GH₵5.00 is pending for you and unlocks after the event.",
  ],
  [
    "referral_qualified",
    "Your friend claimed their place",
    "Ama qualified. GH₵5.00 is pending for you and unlocks in about two weeks.",
  ],
  [
    "loyalty_reward",
    "Your service fee is coming back",
    "You've bought tickets to 5 different events. The GH₵2.50 service fee on this order comes back as credit after Afro Night.",
  ],
  [
    "loyalty_reward",
    "Your service fee is coming back",
    "You've bought tickets to 5 different events. The GH₵2.50 service fee on this order comes back as credit after the event.",
  ],
  [
    "referral_joined",
    "A friend joined with your invite",
    "Ama joined Abonten with your invite. You'll get GH₵5.00 once they buy a ticket of GH₵50.00 or more.",
  ],
  [
    "commission_pending",
    "You sold tickets as a promoter",
    "GH₵12.00 in commission is pending from 1 ticket order sold through your link. The organizer pays it as credit after the event.",
  ],
  [
    "commission_pending",
    "You sold tickets as a promoter",
    "GH₵36.00 in commission is pending from 3 ticket orders sold through your link. The organizer pays it as credit after the events.",
  ],
  [
    "reward_pending",
    "You have a reward on the way",
    "GH₵4.00 is pending from 1 referred ticket. It unlocks after the event.",
  ],
  [
    "reward_pending",
    "You have a reward on the way",
    "GH₵8.00 is pending from 2 referred tickets. It unlocks after the events.",
  ],
  [
    "reward_available",
    "Your credit is ready",
    "GH₵8.00 in Abonten Credit is ready to use.",
  ],
  [
    "promotion_credit_earned",
    "You earned promotion credit",
    "GH₵40.00 of promotion credit from events that ended in September. Use it to feature an event or place.",
  ],
  [
    "promotion_credit_earned",
    "Visitors earned you promotion credit",
    "1 verified visitor checked in at your place in September. Here's GH₵1.00 of promotion credit to feature it.",
  ],
  [
    "promotion_credit_earned",
    "Visitors earned you promotion credit",
    "14 verified visitors checked in at your place in September. Here's GH₵14.00 of promotion credit to feature it.",
  ],
  [
    "milestone_reached",
    "100 people bought tickets to your event",
    "Here's GH₵50.00 of promotion credit to feature your next event.",
  ],
  [
    "fieldops_submission_reviewed",
    "Not eligible: Buka",
    "An automatic check after the holding period did not pass. Open it to see why.",
  ],
  [
    "fieldops_submission_reviewed",
    "Not eligible: your onboarding",
    "An automatic check after the holding period did not pass. Open it to see why.",
  ],
  [
    "fieldops_flag_raised",
    "Needs a look: an onboarding",
    "An automatic check flagged this submission for an admin.",
  ],
  [
    "fieldops_commission_approved",
    "Confirmed: Buka",
    "Your commission is confirmed and waiting for the next payout.",
  ],
  [
    "review_received",
    "New review",
    "Someone left a 4-star review on Afro Night.",
  ],
  ["review_received", "New review", "Someone left a new review on your event."],
  ["review_received", "New review", "Someone left a new review on your place."],
  [
    "event_cancelled",
    "Event cancelled",
    "The organizer has cancelled Afro Night. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.",
  ],
  [
    "event_cancelled",
    "Event cancelled",
    "The organizer has cancelled Afro Night. Your registration has been cancelled.",
  ],
  [
    "area_launched",
    "Abonten is now in Kumasi",
    "Events and places in Kumasi are on Abonten. Take a look.",
  ],
  ["recommendation_digest", "A place you might like", "Buka · Restaurant"],
  ["recommendation_digest", "A place you might like", "Buka"],
];

describe("stored English rows", () => {
  it.each(STORED)("%s — %s", (type, title, body) => {
    const stored = row(type, title, body);
    const notice = noticeFromStoredText(stored);
    expect(notice, "is read back as a notice").not.toBeNull();
    expect(renderNotice(i18nEn, notice as Notice)).toEqual({ title, body });
    expect(localizeNotificationRow(i18nEn, stored)).toMatchObject({
      title,
      body,
    });
  });

  it("a Field Ops assignment's dates are formatted for the reader", () => {
    const notice = noticeFromStoredText(
      row(
        "fieldops_assignment_created",
        "New assignment: Osu",
        "You're on Osu on 2026-10-03.",
      ),
    );
    expect(renderNotice(i18nEn, notice as Notice)).toEqual({
      title: "New assignment: Osu",
      body: "You're on Osu on 3 Oct 2026.",
    });
  });

  it("a start time the database wrote keeps its day and hour", () => {
    const digest = noticeFromStoredText(
      row(
        "recommendation_digest",
        "New event from @afro",
        "Afro Night · Sat 20 Sep, 7:30pm",
      ),
    ) as Notice;
    expect(digest.id).toBe("digest_organizer");
    expect(digest.params?.title).toBe("Afro Night");
    // 20 September is a Saturday in the year the reader picked.
    const at = new Date(String(digest.params?.startsAt));
    expect([at.getUTCDay(), at.getUTCDate(), at.getUTCMonth()]).toEqual([
      6, 20, 8,
    ]);
    expect([at.getUTCHours(), at.getUTCMinutes()]).toEqual([19, 30]);
    const words = renderNotice(i18nEn, digest);
    expect(words?.title).toBe("New event from @afro");
    expect(words?.body).toMatch(/^Afro Night · Sat,? 20 Sept?,? 7:30\s?pm$/i);

    const many = noticeFromStoredText(
      row(
        "recommendation_digest",
        "3 picks for you",
        "Afro Night · Sat 20 Sep, 7:30pm and 2 more",
      ),
    ) as Notice;
    expect(renderNotice(i18nEn, many)?.title).toBe("3 picks for you");
    expect(renderNotice(i18nEn, many)?.body).toMatch(
      /^Afro Night · Sat.* and 2 more$/,
    );

    const reminder = noticeFromStoredText(
      row(
        "event_reminder",
        "Tomorrow: Afro Night",
        "Starts Friday 14:30 at Osu Oxford Street. Your ticket is in My Events.",
      ),
    ) as Notice;
    const said = renderNotice(i18nEn, reminder);
    expect(said?.title).toBe("Tomorrow: Afro Night");
    expect(said?.body).toMatch(
      /^Starts Friday,? (at )?2:30\s?pm at Osu Oxford Street\. Your ticket is in My Events\.$/i,
    );
    const noAddress = noticeFromStoredText(
      row(
        "event_reminder",
        "Tomorrow: Afro Night",
        "Starts Friday 14:30. Your ticket is in My Events.",
      ),
    ) as Notice;
    expect(renderNotice(i18nEn, noAddress)?.body).toMatch(
      /^Starts Friday.*pm\. Your ticket is in My Events\.$/i,
    );
  });

  it("a clock reading it cannot parse is shown as stored", () => {
    const digest = noticeFromStoredText(
      row(
        "recommendation_digest",
        "An event you might like",
        "Afro Night · soon",
      ),
    ) as Notice;
    expect(renderNotice(i18nEn, digest)?.body).toBe("Afro Night · soon");
  });

  it("leaves a row it does not recognise as it is", () => {
    const typed = row("message", "Ama", "See you at 8?");
    expect(noticeFromStoredText(typed)).toBeNull();
    expect(localizeNotificationRow(i18nEn, typed)).toBe(typed);
    const announcement = row("fieldops_announcement", "Meet at 9", "Osu");
    expect(localizeNotificationRow(i18nEn, announcement)).toBe(announcement);
  });

  it("prefers the notice a row carries over its text", () => {
    const carried = {
      ...row("ticket_confirmed", "Billet confirmé", "Votre billet…"),
      data: {
        notice: { id: "ticket_confirmed", params: { title: "Afro Night" } },
      },
    };
    expect(localizeNotificationRow(i18nEn, carried)).toMatchObject({
      title: "Ticket confirmed",
      body: "Your ticket for Afro Night is confirmed.",
    });
  });
});
