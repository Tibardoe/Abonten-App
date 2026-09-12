// One source of truth for every user-facing word the Trust & Verification
// feature says, so web, mobile and the admin console cannot drift apart.
//
// WORDING RULE (docs/LEGAL_REVIEW_REQUIRED.md §H3): the badge may only claim
// that Abonten reviewed documents supporting the business's registration and
// its link to this account. It must never imply Abonten guarantees the
// business, its service, safety, legality or quality. It must never promise
// a review time — no "within N days" anywhere.

import type {
  OrganizerType,
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  draft: "Not submitted",
  pending_review: "In review",
  needs_info: "More information needed",
  approved: "Verified",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
  revoked: "Verification removed",
};

/** Short chip text for lists (place list, my places, organizer nav row). */
export const VERIFICATION_CHIP_LABEL: Record<VerificationStatus, string> = {
  draft: "Draft",
  pending_review: "In review",
  needs_info: "Action needed",
  approved: "Verified",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
  revoked: "Removed",
};

export type VerificationTone = "neutral" | "info" | "success" | "warning";

export const VERIFICATION_STATUS_TONE: Record<
  VerificationStatus,
  VerificationTone
> = {
  draft: "neutral",
  pending_review: "info",
  needs_info: "warning",
  approved: "success",
  rejected: "warning",
  withdrawn: "neutral",
  revoked: "warning",
};

/** What the public badge popover says. Legal-reviewed wording lives here. */
export const BADGE_EXPLANATION: Record<VerificationSubjectType, string> = {
  place:
    "Abonten reviewed documents supporting this business's registration and its link to the account that manages this listing. Verification is not a guarantee of the business, its service, safety or quality.",
  organizer:
    "Abonten reviewed documents supporting this organizer's identity or registration and their link to this account. Verification is not a guarantee of any event, its delivery, safety or quality.",
};

export const BADGE_LABEL: Record<VerificationSubjectType, string> = {
  place: "Verified place",
  organizer: "Verified organizer",
};

/** The "why bother" panel shown before a request is started. */
export const WHY_VERIFY: Record<VerificationSubjectType, string[]> = {
  place: [
    "A Verified badge shows on your listing, in search results and on the map.",
    "People are more willing to book and visit a business Abonten has checked.",
    "Some Abonten programmes, such as promotion credit for visits, are open only to verified places.",
  ],
  organizer: [
    "A Verified badge shows next to your name on your events and your profile.",
    "Ticket buyers can see that Abonten has checked who is behind the event.",
    "Verification is optional. You can create and publish events without it.",
  ],
};

/** Set expectations honestly. No timelines — see the wording rule above. */
export const HOW_REVIEW_WORKS: string[] = [
  "Submitting documents does not verify you on its own. An Abonten reviewer looks at what you send.",
  "We may come back and ask for something else before deciding.",
  "You will get a notification when a decision is made, and the reason if it is not approved.",
  "Your documents are private. Only Abonten reviewers can open them, and they are deleted once they are no longer needed.",
];

export const ORGANIZER_TYPE_LABEL: Record<OrganizerType, string> = {
  individual: "Individual or informal organizer",
  business: "Registered business",
  organisation: "Organisation, church, school or association",
};

export const ORGANIZER_TYPE_DESCRIPTION: Record<OrganizerType, string> = {
  individual:
    "You organise events in your own name and have no registered company. Send anything that shows the events are really yours, such as a venue booking, an event permit, or flyers and tickets from events you ran.",
  business:
    "You run events through a registered company or business name. Send your business registration certificate, and an operating permit or licence if you have one.",
  organisation:
    "You organise on behalf of a church, school, NGO, association or similar. Send the body's registration document, plus a letter on its letterhead if you are not the person named on it.",
};

/** Status-card headline + body for the requester's own screens. */
export function ownerStatusCopy(
  status: VerificationStatus,
  subjectType: VerificationSubjectType,
  opts: { subjectName?: string | null; reason?: string | null } = {},
): { title: string; body: string } {
  const name = opts.subjectName?.trim() || (subjectType === "place" ? "this place" : "your organizer profile");
  switch (status) {
    case "draft":
      return {
        title: "Finish your request",
        body: "Add at least one document, then send it for review.",
      };
    case "pending_review":
      return {
        title: "In review",
        body: `We have your request for ${name}. We will notify you when it has been reviewed.`,
      };
    case "needs_info":
      return {
        title: "We need more information",
        body:
          opts.reason?.trim() ||
          "A reviewer has asked for something else before they can decide.",
      };
    case "approved":
      return {
        title: subjectType === "place" ? "Verified place" : "Verified organizer",
        body:
          subjectType === "place"
            ? "Your Verified badge is showing on your listing."
            : "Your Verified badge is showing on your events and profile.",
      };
    case "rejected":
      return {
        title: "Not approved",
        body:
          opts.reason?.trim() ||
          "Your request was not approved. You can send a new one with different documents.",
      };
    case "withdrawn":
      return {
        title: "Request withdrawn",
        body: "This request was cancelled. You can start a new one any time.",
      };
    case "revoked":
      return {
        title: "Verification removed",
        body:
          opts.reason?.trim() ||
          "This verification was removed. You can send a new request.",
      };
  }
}

/** Notification titles and bodies, so in-app and push agree. */
export const NOTIFICATION_COPY = {
  submitted: (subject: string) => ({
    title: "Verification request received",
    body: `We have your verification request for ${subject}. We will notify you when it has been reviewed.`,
  }),
  approved: (subject: string) => ({
    title: "Verified",
    body: `${subject} is now verified on Abonten.`,
  }),
  infoRequested: (subject: string, reason: string) => ({
    title: "More information needed",
    body: `To verify ${subject}, we need: ${reason}`,
  }),
  rejected: (subject: string, reason: string) => ({
    title: "Verification not approved",
    body: `Your verification request for ${subject} was not approved. ${reason}`,
  }),
  revoked: (subject: string, reason: string) => ({
    title: "Verification removed",
    body: `The verified badge for ${subject} was removed. ${reason}`,
  }),
} as const;
