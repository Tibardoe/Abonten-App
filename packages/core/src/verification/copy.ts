// One source of truth for every user-facing word the Trust & Verification
// feature says, so web, mobile and the admin console cannot drift apart.
// The words live under `verification.*` of the core namespace in
// packages/i18n; this module knows which key says what and composes them.
//
// WORDING RULE (docs/LEGAL_REVIEW_REQUIRED.md §H3), binding on every
// language: the badge may only claim that Abonten reviewed documents
// supporting the business's registration and its link to this account. It
// must never imply Abonten guarantees the business, its service, safety,
// legality or quality. It must never promise a review time — no "within N
// days" anywhere. A translation of these keys is checked against the same
// rule before it ships (docs/i18n/translation-glossary.md).

import type {
  OrganizerType,
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import type { CoreTranslator } from "../i18n/translator";

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "draft",
  "pending_review",
  "needs_info",
  "approved",
  "rejected",
  "withdrawn",
  "revoked",
] as const;

/** Full status wording for the requester's own screens. */
export function verificationStatusLabel(
  t: CoreTranslator,
  status: VerificationStatus,
): string {
  return t(`verification.status.${status}`);
}

/** Short chip text for lists (place list, my places, organizer nav row). */
export function verificationChipLabel(
  t: CoreTranslator,
  status: VerificationStatus,
): string {
  return t(`verification.chip.${status}`);
}

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
export function badgeExplanation(
  t: CoreTranslator,
  subjectType: VerificationSubjectType,
): string {
  return t(`verification.badgeExplanation.${subjectType}`);
}

export function badgeLabel(
  t: CoreTranslator,
  subjectType: VerificationSubjectType,
): string {
  return t(`verification.badgeLabel.${subjectType}`);
}

/** The "why bother" panel shown before a request is started. */
export function whyVerify(
  t: CoreTranslator,
  subjectType: VerificationSubjectType,
): string[] {
  return [1, 2, 3].map((n) => t(`verification.whyVerify.${subjectType}.${n}`));
}

/** Set expectations honestly. No timelines — see the wording rule above. */
export function howReviewWorks(t: CoreTranslator): string[] {
  return [1, 2, 3, 4].map((n) => t(`verification.howReviewWorks.${n}`));
}

export const ORGANIZER_TYPES: readonly OrganizerType[] = [
  "individual",
  "business",
  "organisation",
] as const;

export function organizerTypeLabel(
  t: CoreTranslator,
  type: OrganizerType,
): string {
  return t(`verification.organizerType.${type}`);
}

export function organizerTypeDescription(
  t: CoreTranslator,
  type: OrganizerType,
): string {
  return t(`verification.organizerTypeDescription.${type}`);
}

/** Status-card headline + body for the requester's own screens. */
export function ownerStatusCopy(
  t: CoreTranslator,
  status: VerificationStatus,
  subjectType: VerificationSubjectType,
  opts: { subjectName?: string | null; reason?: string | null } = {},
): { title: string; body: string } {
  const name =
    opts.subjectName?.trim() ||
    (subjectType === "place"
      ? t("verification.owner.thisPlace")
      : t("verification.owner.yourOrganizerProfile"));
  switch (status) {
    case "draft":
      return {
        title: t("verification.owner.draftTitle"),
        body: t("verification.owner.draftBody"),
      };
    case "pending_review":
      return {
        title: t("verification.owner.pendingTitle"),
        body: t("verification.owner.pendingBody", { name }),
      };
    case "needs_info":
      return {
        title: t("verification.owner.needsInfoTitle"),
        body: opts.reason?.trim() || t("verification.owner.needsInfoBody"),
      };
    case "approved":
      return {
        title:
          subjectType === "place"
            ? t("verification.owner.approvedPlaceTitle")
            : t("verification.owner.approvedOrganizerTitle"),
        body:
          subjectType === "place"
            ? t("verification.owner.approvedPlaceBody")
            : t("verification.owner.approvedOrganizerBody"),
      };
    case "rejected":
      return {
        title: t("verification.owner.rejectedTitle"),
        body: opts.reason?.trim() || t("verification.owner.rejectedBody"),
      };
    case "withdrawn":
      return {
        title: t("verification.owner.withdrawnTitle"),
        body: t("verification.owner.withdrawnBody"),
      };
    case "revoked":
      return {
        title: t("verification.owner.revokedTitle"),
        body: opts.reason?.trim() || t("verification.owner.revokedBody"),
      };
  }
}

export type VerificationNoticeKind =
  | "submitted"
  | "approved"
  | "infoRequested"
  | "rejected"
  | "revoked";

/**
 * Notification titles and bodies, so in-app and push agree. The server
 * renders them in the recipient's language (their stored locale) and also
 * stores `kind` + the values in the row's `data`, so a client can re-render
 * them if the person changes language later.
 */
export function verificationNotificationCopy(
  t: CoreTranslator,
  kind: VerificationNoticeKind,
  values: { subject: string; reason?: string | null },
): { title: string; body: string } {
  const reason = values.reason?.trim() ?? "";
  switch (kind) {
    case "submitted":
      return {
        title: t("verification.notification.submittedTitle"),
        body: t("verification.notification.submittedBody", {
          subject: values.subject,
        }),
      };
    case "approved":
      return {
        title: t("verification.notification.approvedTitle"),
        body: t("verification.notification.approvedBody", {
          subject: values.subject,
        }),
      };
    case "infoRequested":
      return {
        title: t("verification.notification.infoRequestedTitle"),
        body: t("verification.notification.infoRequestedBody", {
          subject: values.subject,
          reason,
        }),
      };
    case "rejected":
      return {
        title: t("verification.notification.rejectedTitle"),
        body: t("verification.notification.rejectedBody", {
          subject: values.subject,
          reason,
        }),
      };
    case "revoked":
      return {
        title: t("verification.notification.revokedTitle"),
        body: t("verification.notification.revokedBody", {
          subject: values.subject,
          reason,
        }),
      };
  }
}
