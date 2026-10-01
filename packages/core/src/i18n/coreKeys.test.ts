import coreMessages from "@abonten/i18n/messages/en/core.json";
import type { ContentCampaignObjective } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import { accountSetupPromptMessage } from "../accountSetupPrompt";
import { blockedAccountName } from "../blockedAccounts";
import {
  EVENT_CATEGORY_KEYS,
  EVENT_TYPE_KEYS,
  PLACE_CATEGORY_SLUGS,
  eventCategoryLabel,
  eventTypeLabel,
  placeCategoryLabel,
} from "../categoryLabels";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  CONTENT_RIGHTS_ACKNOWLEDGEMENT_KEY,
  FEED_SURFACES,
  PROMOTION_BILLING_NOTE_KEY,
  PROMOTION_CASH_NOTE_KEY,
  PROMOTION_ESTIMATE_NOTE_KEY,
  PROMOTION_INTRO_KEY,
  PROMOTION_REVIEW_NOTE_KEY,
  SPONSORED_LABEL_KEY,
  SPOTLIGHT_TAGLINE_KEY,
  STORIES_TAGLINE_KEY,
  STORY_EXPIRED_MESSAGE_KEY,
  YOUR_STORY_LABEL_KEY,
  campaignObjectiveLabel,
  campaignStatusLabel,
  feedSurfaceLabel,
  promotionEndReasonLabel,
  promotionEstimateBasisLabel,
} from "../content/copy";
import {
  distanceFilterOptions,
  ratingFilterOptions,
} from "../distanceAndRating";
import { type EmailOtpMessage, emailOtpMessage } from "../emailOtp";
import { eventCategoriesAndTypes } from "../eventCategoriesAndTypes";
import { type EventCtaKind, eventCtaLabel } from "../eventCta";
import {
  campaignActionLabel,
  fieldOpsCampaignStatusLabel,
} from "../fieldOps/campaignLifecycle";
import {
  BROWSE_ELSEWHERE_TITLE_KEY,
  BROWSE_STRATEGIES,
  JOIN_WAITLIST_LABEL_KEY,
  LEAVE_WAITLIST_LABEL_KEY,
  NOT_LAUNCHED_BODY_KEY,
  browseReasonLabel,
  browseStrategyCopy,
} from "../market/coverageCopy";
import { PAYMENT_METHOD_CODES, paymentMethodLabel } from "../market/types";
import {
  DASHBOARD_PERIODS,
  dashboardPeriodComparisonLabel,
  dashboardPeriodLabel,
} from "../organizerDashboardDateRange";
import { type OtpMessage, otpMessage } from "../otpMessages";
import { getFulfillmentMessage } from "../paymentStatusCopy";
import { type PhoneError, phoneErrorMessage } from "../phone/phone";
import { computePlaceSetup, placeSetupItemLabel } from "../placeSetup";
import {
  PROFILE_COMPLETION_GROUPS,
  computeProfileCompletion,
  profileCompletionGroupTitle,
  profileCompletionItemCopy,
} from "../profileCompletion";
import { promotionKindLabel, promotionStateLabel } from "../promotionSummary";
import { getRefundStatusLabel } from "../refundStatus";
import { reviewSortOptions } from "../reviews/reviewList";
import {
  searchPriceOptions,
  searchRadiusOptions,
  searchRatingOptions,
  searchWhenOptions,
} from "../search/searchFilters";
import {
  FREE_EVENT_PROMO_CODES_KEY,
  ticketTierProblemMessage,
} from "../ticketTiers";
import {
  TRANSACTION_PERIODS,
  transactionPeriodLabel,
} from "../transactionsDateRange";
import {
  ORGANIZER_TYPES,
  VERIFICATION_STATUSES,
  badgeExplanation,
  badgeLabel,
  howReviewWorks,
  organizerTypeDescription,
  organizerTypeLabel,
  ownerStatusCopy,
  verificationChipLabel,
  verificationStatusLabel,
  whyVerify,
} from "../verification/copy";
import {
  WEEKLY_DEFAULT_TITLE_KEY,
  WEEKLY_TAGLINE_KEY,
  weeklyEditionStatusLabel,
  weeklyIssueLabel,
  weeklyValidityLabel,
} from "../weekly/copy";
import type { CoreTranslator } from "./translator";

// Every key a core copy helper can ask for must exist in the English
// catalog. A helper builds some keys from an enum value
// (`content.campaignStatus.${status}`), so a renamed or new enum member
// would otherwise show its key path to a person. This test walks every
// helper over every value it accepts with a translator that fails on a
// missing key.

function lookup(key: string): unknown {
  let node: unknown = coreMessages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const asked: string[] = [];
const strict: CoreTranslator = (key) => {
  asked.push(key);
  const message = lookup(key);
  if (typeof message !== "string") {
    throw new Error(`core catalog has no message for "${key}"`);
  }
  return message;
};
const i18n = { locale: "en", t: strict };

describe("core copy keys", () => {
  it("Spotlight and Stories", () => {
    for (const key of [
      SPOTLIGHT_TAGLINE_KEY,
      STORIES_TAGLINE_KEY,
      SPONSORED_LABEL_KEY,
      YOUR_STORY_LABEL_KEY,
      STORY_EXPIRED_MESSAGE_KEY,
      CONTENT_RIGHTS_ACKNOWLEDGEMENT_KEY,
      PROMOTION_INTRO_KEY,
      PROMOTION_ESTIMATE_NOTE_KEY,
      PROMOTION_BILLING_NOTE_KEY,
      PROMOTION_REVIEW_NOTE_KEY,
      PROMOTION_CASH_NOTE_KEY,
    ]) {
      strict(key);
    }
    for (const s of FEED_SURFACES) feedSurfaceLabel(strict, s);
    for (const s of CAMPAIGN_STATUSES) campaignStatusLabel(strict, s);
    for (const o of CAMPAIGN_OBJECTIVES)
      campaignObjectiveLabel(strict, o as ContentCampaignObjective);
    for (const b of ["observed", "assumed", "no_data"] as const)
      promotionEstimateBasisLabel(strict, b);
    for (const r of ["budget_delivered", "run_ended"] as const)
      promotionEndReasonLabel(strict, r);
  });

  it("verification, in every status", () => {
    for (const status of VERIFICATION_STATUSES) {
      verificationStatusLabel(strict, status);
      verificationChipLabel(strict, status);
      for (const subject of ["place", "organizer"] as const) {
        ownerStatusCopy(strict, status, subject);
      }
    }
    for (const subject of ["place", "organizer"] as const) {
      badgeExplanation(strict, subject);
      badgeLabel(strict, subject);
      expect(whyVerify(strict, subject)).toHaveLength(3);
    }
    expect(howReviewWorks(strict)).toHaveLength(4);
    for (const type of ORGANIZER_TYPES) {
      organizerTypeLabel(strict, type);
      organizerTypeDescription(strict, type);
    }
  });

  it("Weekly", () => {
    strict(WEEKLY_TAGLINE_KEY);
    strict(WEEKLY_DEFAULT_TITLE_KEY);
    for (const status of Object.keys(coreMessages.weekly.editionStatus))
      weeklyEditionStatusLabel(strict, status as never);
    for (const reason of Object.keys(coreMessages.weekly.validity))
      weeklyValidityLabel(strict, reason as never);
    for (const code of Object.keys(coreMessages.weekly.issue))
      weeklyIssueLabel(strict, code as never);
  });

  it("search filters and Explore filters", () => {
    searchWhenOptions(strict);
    searchRadiusOptions(i18n);
    searchPriceOptions(strict, "GHS");
    searchRatingOptions(i18n);
    distanceFilterOptions(strict);
    ratingFilterOptions(strict);
    reviewSortOptions(strict);
  });

  it("account and place setup", () => {
    const completion = computeProfileCompletion({
      fullName: null,
      usernameIsGenerated: true,
      avatarPublicId: null,
      email: null,
      emailConfirmedAt: null,
    });
    for (const item of completion.items)
      profileCompletionItemCopy(strict, item);
    for (const group of PROFILE_COMPLETION_GROUPS)
      profileCompletionGroupTitle(strict, group);
    accountSetupPromptMessage(strict, completion);
    const setup = computePlaceSetup({
      photoCount: 0,
      hasOpeningHours: false,
      hasContact: false,
      serviceCount: 0,
      verificationStatus: null,
      verificationAvailable: true,
    });
    for (const item of setup.items) placeSetupItemLabel(strict, item);
  });

  it("coverage, events, money and sign-in", () => {
    for (const key of [
      NOT_LAUNCHED_BODY_KEY,
      JOIN_WAITLIST_LABEL_KEY,
      LEAVE_WAITLIST_LABEL_KEY,
      BROWSE_ELSEWHERE_TITLE_KEY,
      FREE_EVENT_PROMO_CODES_KEY,
    ]) {
      strict(key);
    }
    for (const reason of ["nearest", "most_active", "recommended"] as const)
      browseReasonLabel(strict, reason);
    for (const strategy of BROWSE_STRATEGIES)
      browseStrategyCopy(strict, strategy);
    for (const kind of [
      "buy",
      "rsvp",
      "going",
      "canceled",
      "ended",
      "in_progress",
      "sold_out",
      "no_tickets",
    ] satisfies EventCtaKind[]) {
      eventCtaLabel(strict, kind);
    }
    for (const kind of ["event", "place", "spotlight"] as const)
      promotionKindLabel(strict, kind);
    for (const state of ["active", "scheduled", "in_review", "paused"] as const)
      promotionStateLabel(strict, state);
    for (const status of ["refund_pending", "refunded", "successful"]) {
      getRefundStatusLabel(strict, status, null);
      getRefundStatusLabel(strict, status, "2026-01-01T00:00:00Z");
    }
    for (const kind of [
      "ticket",
      "promotion",
      "event-promotion",
      "spotlight-promotion",
    ] as const) {
      getFulfillmentMessage(strict, kind);
    }
    for (const period of DASHBOARD_PERIODS) {
      dashboardPeriodLabel(strict, period);
      dashboardPeriodComparisonLabel(strict, period);
    }
    for (const period of TRANSACTION_PERIODS)
      transactionPeriodLabel(strict, period);
    ticketTierProblemMessage(strict, "paid_needs_price");
    ticketTierProblemMessage(strict, "free_reserved");
    for (const code of PAYMENT_METHOD_CODES) paymentMethodLabel(strict, code);
    for (const error of [
      "empty",
      "invalid_country",
      "too_short",
      "too_long",
      "invalid",
    ] satisfies PhoneError[]) {
      phoneErrorMessage(strict, error);
    }
    for (const message of [
      "invalidFormat",
      "expired",
      "tooManyAttempts",
    ] satisfies OtpMessage[]) {
      otpMessage(strict, message);
    }
    for (const message of [
      "invalidEmail",
      "codeSent",
      "invalidFormat",
      "invalidOrExpired",
      "rateLimited",
      "generic",
    ] satisfies EmailOtpMessage[]) {
      emailOtpMessage(strict, message);
    }
    for (const action of [
      "activate",
      "pause",
      "resume",
      "wind_down",
      "complete",
      "archive",
    ] as const) {
      campaignActionLabel(strict, action);
    }
    for (const status of [
      "draft",
      "active",
      "paused",
      "winding_down",
      "completed",
      "archived",
    ] as const) {
      fieldOpsCampaignStatusLabel(strict, status);
    }
    blockedAccountName(strict, {
      deleted: true,
    } as Parameters<typeof blockedAccountName>[1]);
  });

  it("every event category, event type and place category", () => {
    for (const group of eventCategoriesAndTypes) {
      eventCategoryLabel(strict, group.category);
      for (const type of group.types) eventTypeLabel(strict, type);
    }
    for (const slug of PLACE_CATEGORY_SLUGS)
      expect(placeCategoryLabel(strict, { slug })).not.toBe("");
    // A category the catalog does not know is shown as stored.
    expect(eventCategoryLabel(strict, "Underwater Chess")).toBe(
      "Underwater Chess",
    );
    expect(placeCategoryLabel(strict, { slug: "zoo", name: "Zoo" })).toBe(
      "Zoo",
    );
    // The catalog holds no category the code can no longer produce.
    expect(Object.keys(coreMessages.eventCategories).sort()).toEqual(
      [...EVENT_CATEGORY_KEYS].sort(),
    );
    expect(Object.keys(coreMessages.eventTypes).sort()).toEqual(
      [...EVENT_TYPE_KEYS].sort(),
    );
  });

  it("asked for real keys", () => {
    expect(asked.length).toBeGreaterThan(300);
  });
});
