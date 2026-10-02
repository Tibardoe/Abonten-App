import RecommendationDigestEmailTemplate from "@/components/organisms/RecommendationDigestEmailTemplate";
import { type EmailWords, emailWordsFor } from "@/lib/email/emailWords";
import { emailIsConfigured, sendEmail } from "@/lib/email/sendEmail";
import { SUPPORT_EMAIL } from "@abonten/core/brand/contacts";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { intlLocale, isEnglishLike } from "@abonten/core/i18n/coreStrings";
import { logger } from "@abonten/core/logger";
import { isValidTimeZone } from "@abonten/core/time/timeZone";
import type {
  EmailSendResult,
  RecommendationEmail,
  RecommendationEmailItem,
} from "@abonten/services/notifications/deliveryCore";
import { recommendationEmailUnsubscribeLinks } from "@abonten/services/notifications/recommendationEmailPreferenceCore";

// The event's own wall-clock time, the same wording as the push
// ("Sat 20 Sep, 7:30pm"), in the reader's language. An event without a
// zone (none today — every event has one) falls back to UTC rather than
// the server's zone.
function when(
  startsAt: string,
  timeZone: string | null,
  locale: string,
): string {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
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

function reason(words: EmailWords, item: RecommendationEmailItem): string {
  const { t } = words;
  switch (item.reason) {
    case "organizer":
      return item.organizerUsername
        ? t("digest.reason.organizerNamed", {
            username: item.organizerUsername,
          })
        : t("digest.reason.organizer");
    case "place":
      return t("digest.reason.place");
    case "similar_places":
      return t("digest.reason.similarPlaces");
    default:
      return t("digest.reason.similarEvents");
  }
}

/**
 * Sends one recommendation digest email for the delivery queue
 * (@abonten/services/notifications/deliveryCore). Injected by POST
 * /api/notifications/deliver, like sendRewardUpdateEmail. Links go through
 * /notifications/open so opening the email counts as opening the digest (the
 * caps pause people who never open). No tracking pixel. Never throws.
 */
export async function sendRecommendationDigestEmail(
  email: RecommendationEmail,
): Promise<EmailSendResult> {
  if (!emailIsConfigured()) {
    logger.warn("RESEND_API_KEY is not set; skipping recommendation emails");
    return { ok: false, error: "email_not_configured", outcome: "skip" };
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com";
  const open = (path: string) =>
    `${base}/notifications/open?id=${encodeURIComponent(email.notificationId)}&to=${encodeURIComponent(path)}`;

  try {
    const words = await emailWordsFor(email.userId, email.name);
    const unsubscribe = recommendationEmailUnsubscribeLinks(email.userId, base);
    const { error } = await sendEmail({
      from: "Abonten Hub <picks@abontenhub.com>",
      to: [email.to],
      // Nobody reads the sending address; a reply reaches support.
      replyTo: SUPPORT_EMAIL,
      subject: email.headline,
      headers: {
        "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      react: RecommendationDigestEmailTemplate({
        words,
        headline: email.headline,
        items: email.items.map((item) => ({
          title: item.title,
          detail:
            item.subjectType === "event" && item.startsAt
              ? [
                  when(item.startsAt, item.timeZone, words.locale),
                  item.subtitle,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : item.subtitle,
          reason: reason(words, item),
          // Plain JPEG: some mail clients can't show the WebP/AVIF that
          // f_auto would pick.
          imageUrl: item.imagePublicId
            ? buildCloudinaryUrl(item.imagePublicId, item.imageVersion, {
                width: 64,
                height: 64,
                lossless: true,
              })
            : null,
          href: open(item.path),
        })),
        forYouUrl: open("/for-you"),
        settingsUrl: `${base}/settings/notifications`,
        unsubscribeUrl: unsubscribe.page,
      }),
    });
    if (error) {
      logger.error(`Recommendation email failed: ${error.message}`);
      const permanent = /invalid|validation/i.test(
        `${error.name} ${error.message}`,
      );
      return {
        ok: false,
        error: error.message.slice(0, 200),
        outcome: permanent ? "skip" : "retry",
      };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`Recommendation email failed unexpectedly: ${e}`);
    return { ok: false, error: "send_failed", outcome: "retry" };
  }
}
