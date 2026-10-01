// Every notice Abonten writes to a person (an in-app notification row, its
// push, its line in an email) is a template plus values, never a sentence:
// the row's `data.notice` holds `{ id, params }`, and the words are made
// when they are shown, in the language of whoever is looking — the
// recipient's saved language when the row is written and pushed, the
// viewer's current language when the inbox is read. A row written before
// this existed has no `notice` and shows its stored English text.
//
// The templates live under `notices.*` of the core namespace, so the web
// app, the native app and the server render the same words. SQL writers
// (the reward engine, reminders, reviews, cancellations, area launches,
// digests) attach the same `notice` shape; see the migration that added it.

import { intlLocale, isEnglishLike } from "../i18n/coreStrings";
import type {
  CoreI18n,
  CoreTranslator,
  TranslationValues,
} from "../i18n/translator";
import { promotionDurationLabel } from "../promotionSummary";
import { noticeFromStoredText } from "./storedNotices";

export type NoticeParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type Notice = {
  /** A key of NOTICES. */
  id: string;
  params?: NoticeParams;
};

type NoticeTemplate = {
  /** Catalog key (core namespace) of the title. */
  title: string;
  /** Catalog key of the body; none means the notice is a title only. */
  body?: string;
  /** A param whose text is already words (user content): shown as the body. */
  literalBody?: string;
};

const n = (id: string, body = true): NoticeTemplate => ({
  title: `notices.${id}.title`,
  body: body ? `notices.${id}.body` : undefined,
});

export const NOTICES: Record<string, NoticeTemplate> = {
  // Verification (services)
  verification_submitted: n("verification_submitted"),
  verification_approved: n("verification_approved"),
  verification_info_requested: n("verification_info_requested"),
  verification_rejected: n("verification_rejected"),
  verification_revoked: n("verification_revoked"),
  // Spotlight & Stories (services)
  content_like: n("content_like", false),
  content_reaction: n("content_reaction", false),
  content_comment: {
    title: "notices.content_comment.title",
    literalBody: "snippet",
  },
  content_reply: {
    title: "notices.content_reply.title",
    literalBody: "snippet",
  },
  content_follow: n("content_follow", false),
  content_moderation: n("content_moderation"),
  content_moderation_visible: n("content_moderation_visible", false),
  content_campaign: {
    title: "notices.content_campaign.title",
    literalBody: "reason",
  },
  // Places (services)
  place_booking_requested: n("place_booking_requested"),
  place_booking_cancelled: n("place_booking_cancelled"),
  place_booking_accepted: n("place_booking_accepted"),
  place_booking_declined: n("place_booking_declined"),
  place_claim_approved: n("place_claim_approved"),
  place_claim_rejected: n("place_claim_rejected"),
  review_reply_place: n("review_reply_place"),
  review_reply_event: n("review_reply_event"),
  // Money (services)
  refund_requested: n("refund_requested"),
  refund_requested_credit: n("refund_requested_credit"),
  refund_completed: n("refund_completed"),
  refund_completed_credit: n("refund_completed_credit"),
  refund_completed_plain: n("refund_completed_plain"),
  refund_failed: n("refund_failed"),
  refund_failed_credit: n("refund_failed_credit"),
  orphan_refund: n("orphan_refund"),
  // Tickets and promotions (web server utilities)
  ticket_confirmed: n("ticket_confirmed"),
  promotion_started_event: n("promotion_started_event"),
  promotion_started_place: n("promotion_started_place"),
  promotion_started_generic: n("promotion_started_generic"),
  // Field Ops (services + SQL)
  fieldops_content_brief: {
    title: "notices.fieldops_content_brief.title",
    literalBody: "description",
  },
  fieldops_assignment_created: n("fieldops_assignment_created"),
  fieldops_assignment_changed: {
    title: "notices.fieldops_assignment_changed.title",
    literalBody: "reason",
  },
  fieldops_review_verified: n("fieldops_review_verified"),
  // An admin's decision carries the admin's own note as its body.
  fieldops_review_verified_noted: {
    title: "notices.fieldops_review_verified.title",
    literalBody: "note",
  },
  fieldops_commission_reversed: {
    title: "notices.fieldops_commission_reversed.title",
    literalBody: "reason",
  },
  fieldops_review_needs_changes: {
    title: "notices.fieldops_review_needs_changes.title",
    literalBody: "note",
  },
  fieldops_review_rejected: {
    title: "notices.fieldops_review_rejected.title",
    literalBody: "note",
  },
  fieldops_membership_added: n("fieldops_membership_added"),
  fieldops_claim_received: n("fieldops_claim_received"),
  fieldops_event_received: n("fieldops_event_received"),
  fieldops_onboarding_received: n("fieldops_onboarding_received"),
  fieldops_content_received: n("fieldops_content_received"),
  fieldops_not_eligible: n("fieldops_not_eligible"),
  fieldops_flag_raised: n("fieldops_flag_raised"),
  fieldops_confirmed: n("fieldops_confirmed"),
  fieldops_paid: n("fieldops_paid"),
  fieldops_content_approved: n("fieldops_content_approved"),
  fieldops_content_rejected: {
    title: "notices.fieldops_content_rejected.title",
    literalBody: "note",
  },
  fieldops_content_commission_confirmed: n(
    "fieldops_content_commission_confirmed",
  ),
  fieldops_stipend: n("fieldops_stipend"),
  // SQL: reviews, cancellations, reminders, area launch, digests
  review_received_event: n("review_received_event"),
  review_received_place: n("review_received_place"),
  event_cancelled_paid: n("event_cancelled_paid"),
  event_cancelled_free: n("event_cancelled_free"),
  event_reminder: n("event_reminder"),
  area_launched: n("area_launched"),
  digest_organizer: n("digest_organizer"),
  digest_organizer_unknown: n("digest_organizer_unknown"),
  digest_place: n("digest_place"),
  digest_place_unknown: n("digest_place_unknown"),
  digest_event: n("digest_event"),
  digest_place_pick: n("digest_place_pick"),
  digest_many: n("digest_many"),
  // SQL: rewards
  welcome_credit: n("welcome_credit"),
  referral_qualified: n("referral_qualified"),
  loyalty_reward: n("loyalty_reward"),
  referral_joined: n("referral_joined"),
  commission_pending: n("commission_pending"),
  reward_pending: n("reward_pending"),
  reward_available: n("reward_available"),
  promotion_credit_earned: n("promotion_credit_earned"),
  milestone_reached: n("milestone_reached"),
  promotion_credit_visits: n("promotion_credit_visits"),
};

export function isNotice(value: unknown): value is Notice {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Notice).id === "string" &&
    (value as Notice).id in NOTICES
  );
}

/** "Sat 20 Sep, 7:30pm" on the event's clock, in the reader's language. */
function whenText(
  startsAt: string,
  timeZone: string | null | undefined,
  locale: string,
): string {
  let zone = "UTC";
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone });
      zone = timeZone;
    } catch {
      zone = "UTC";
    }
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(isEnglishLike(locale) ? { hour12: true } : {}),
  }).format(new Date(startsAt));
}

/** "Friday 14:30" on the event's clock, for the day-before reminder. */
function dayTimeText(
  startsAt: string,
  timeZone: string | null | undefined,
  locale: string,
): string {
  let zone = "UTC";
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone });
      zone = timeZone;
    } catch {
      zone = "UTC";
    }
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: zone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    ...(isEnglishLike(locale) ? { hour12: true } : {}),
  }).format(new Date(startsAt));
}

/** "September" for a 'YYYY-MM-DD' period start, in the reader's language. */
function monthText(period: string, locale: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function monthYearText(period: string, locale: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "";

/**
 * The values an ICU message may take, from a notice's params: everything
 * is passed through as text or number, and a few conventions are turned
 * into words for the reader:
 *
 *  - `hasPlace` ("yes" | "no") for every param `place`, so a message words
 *    the missing-name case itself instead of the writer storing an English
 *    stand-in like "the place";
 *  - an empty `actor` reads "Someone";
 *  - `startsAt` (+ `timezone`) becomes `when` and `dayTime`, `period`
 *    becomes `month` and `monthYear`, `fromDate` becomes `from`;
 *  - `durationLabel` (a tier's English "3 days") becomes `duration`.
 */
function valuesFor(
  t: CoreTranslator,
  params: NoticeParams,
  locale: string,
): TranslationValues {
  const values: TranslationValues = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      values[key] = "";
    } else if (typeof value === "boolean") {
      values[key] = value ? "true" : "false";
    } else {
      values[key] = value;
    }
  }
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("has")) continue;
    const flag = `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (!(flag in params)) values[flag] = isEmpty(value) ? "no" : "yes";
  }
  if ("actor" in params && isEmpty(params.actor)) {
    values.actor = t("noticeWords.someone");
  }
  if (typeof params.durationLabel === "string") {
    values.duration = promotionDurationLabel(t, params.durationLabel);
  }
  if (typeof params.startsAt === "string") {
    const tz = typeof params.timezone === "string" ? params.timezone : null;
    values.when = whenText(params.startsAt, tz, locale);
    values.dayTime = dayTimeText(params.startsAt, tz, locale);
  }
  if (typeof params.period === "string") {
    values.month = monthText(params.period, locale);
    values.monthYear = monthYearText(params.period, locale);
  }
  // `fromDate: "2026-10-03"` → `from: "3 Oct 2026"` in the reader's language.
  for (const [key, value] of Object.entries(params)) {
    if (
      key.endsWith("Date") &&
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
      const [y, m, day] = value.slice(0, 10).split("-").map(Number);
      values[key.slice(0, -4)] = new Intl.DateTimeFormat(intlLocale(locale), {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(y, m - 1, day)));
    }
  }
  // Last, so a derived value (`when`) gets its flag (`hasWhen`) too. The
  // flag says whether the writer gave a value, so "Someone" stays "no".
  for (const key of Object.keys(values)) {
    if (key.startsWith("has")) continue;
    const flag = `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (flag in values) continue;
    const given = key in params ? params[key] : values[key];
    values[flag] = isEmpty(given) ? "no" : "yes";
  }
  return values;
}

/**
 * The words of a notice in the reader's language, or null when the notice
 * is not one this build knows (an older app meeting a newer notice shows
 * the row's stored text instead).
 */
export function renderNotice(
  { t, locale }: CoreI18n,
  notice: Notice,
): { title: string; body: string | null } | null {
  const template = NOTICES[notice.id];
  if (!template) return null;
  const params = notice.params ?? {};
  const values = valuesFor(t, params, locale);
  const title = t(template.title, values);
  let body: string | null = null;
  if (template.literalBody) {
    const raw = params[template.literalBody];
    body = typeof raw === "string" && raw.trim() ? raw : null;
  } else if (template.body) {
    body = t(template.body, values);
  }
  return { title, body };
}

/**
 * The stored title/body of a notification row, re-rendered in the reader's
 * language when the row carries a notice. Rows without one keep their text.
 */
export function localizeNotificationRow<
  T extends { type: string; title: string; body: string | null; data: unknown },
>(i18n: CoreI18n, row: T): T {
  const data = row.data as { notice?: unknown } | null;
  // A row written with its notice says what it is; one the database (or an
  // older release) wrote is read back from its English text.
  const notice =
    data && isNotice(data.notice) ? data.notice : noticeFromStoredText(row);
  if (!notice) return row;
  const words = renderNotice(i18n, notice);
  if (!words) return row;
  return { ...row, title: words.title, body: words.body };
}
